import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  monthlyCloses, statements, consumos, gastos, goals, transacciones,
  portfolioSnapshots, prestamos, prestamosPersonales,
} from '@/db/schema';
import { totalDelMes, estado as estadoPrestamo } from './prestamos';
import { resumir, type PrestamoPersonal } from './fiado';
import { cargarPrestamos } from './cierre';
import { redactarProfundo } from './pii';

/**
 * Consultas de solo lectura sobre las finanzas.
 *
 * Es la capa que expone el servidor MCP, y por eso tiene reglas propias:
 *
 * - **Solo lectura.** Ni un insert ni un update en todo el archivo. Un cliente
 *   MCP conversacional no tiene por que poder escribir en tus finanzas, y que
 *   no pueda es mejor garantia que acordarse de no pedirselo.
 * - **Scopeada, siempre.** `usuarioId` es el primer parametro de todo.
 * - **Agregada, no cruda.** Devuelve totales, categorias y conteos. No hay una
 *   herramienta que vuelque la tabla entera: lo que sale de acá va a un modelo,
 *   y menos dato en el prompt es menos dato afuera.
 * - **Sin PII.** Todo lo que sale pasa por `redactarProfundo`.
 */

const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

function validarPeriodo(p: string): string {
  if (!PERIODO.test(p)) throw new Error(`El periodo tiene que ser YYYY-MM (vino "${p}").`);
  return p;
}

/** Cierre de un mes: ingreso, gasto, ahorro y desglose por categoria. */
export async function resumenDelMes(usuarioId: string, periodo: string) {
  validarPeriodo(periodo);
  const [c] = await db.select().from(monthlyCloses)
    .where(and(eq(monthlyCloses.usuarioId, usuarioId), eq(monthlyCloses.periodo, periodo)));

  if (!c) return { periodo, hayDatos: false as const };

  return redactarProfundo({
    periodo, hayDatos: true as const,
    ingresoArs: Number(c.ingresoArs),
    gastoArs: Number(c.gastoArs),
    ahorroArs: Number(c.ahorroArs),
    tasaAhorroPct: c.tasaAhorro === null ? null : Number(c.tasaAhorro),
    percepcionesArs: Number(c.percepArs),
    porCategoria: c.porCategoria as Record<string, number>,
  });
}

/** Los ultimos N meses cerrados, para ver evolucion. */
export async function mesesCerrados(usuarioId: string, cuantos = 12) {
  const limite = Math.min(Math.max(1, Math.trunc(cuantos)), 60);
  const filas = await db.select({
    periodo: monthlyCloses.periodo,
    ingresoArs: monthlyCloses.ingresoArs,
    gastoArs: monthlyCloses.gastoArs,
    ahorroArs: monthlyCloses.ahorroArs,
    tasaAhorro: monthlyCloses.tasaAhorro,
  }).from(monthlyCloses)
    .where(eq(monthlyCloses.usuarioId, usuarioId))
    .orderBy(desc(monthlyCloses.periodo)).limit(limite);

  return redactarProfundo(filas.map(f => ({
    periodo: f.periodo,
    ingresoArs: Number(f.ingresoArs),
    gastoArs: Number(f.gastoArs),
    ahorroArs: Number(f.ahorroArs),
    tasaAhorroPct: f.tasaAhorro === null ? null : Number(f.tasaAhorro),
  })).reverse());
}

/**
 * Buscar consumos por texto. Es la que responde "¿cuanto gasté en X?".
 *
 * Busca en tarjeta y en gastos sueltos, que para quien pregunta son lo mismo:
 * plata que salio.
 */
export async function buscarConsumos(
  usuarioId: string,
  texto: string,
  opciones: { desde?: string; hasta?: string; limite?: number } = {},
) {
  const q = texto.trim();
  if (q.length < 2) throw new Error('Poné al menos dos caracteres para buscar.');
  const limite = Math.min(Math.max(1, Math.trunc(opciones.limite ?? 50)), 200);

  const rango = (col: AnyPgColumn) => {
    const c = [];
    if (opciones.desde) c.push(gte(col, validarPeriodo(opciones.desde)));
    if (opciones.hasta) c.push(lte(col, validarPeriodo(opciones.hasta)));
    return c;
  };

  const deTarjeta = await db.select({
    fecha: consumos.fecha,
    descripcion: consumos.comercio,
    categoria: consumos.categoria,
    montoArs: consumos.montoArs,
    periodo: statements.periodo,
    origen: statements.card,
  }).from(consumos)
    // consumos no tiene dueño propio: se scopea por su statement.
    .innerJoin(statements, eq(consumos.statementId, statements.id))
    .where(and(
      eq(statements.usuarioId, usuarioId),
      ilike(consumos.comercio, `%${q}%`),
      ...rango(statements.periodo),
    ))
    .orderBy(desc(statements.periodo)).limit(limite);

  const sueltos = await db.select({
    fecha: gastos.fecha,
    descripcion: gastos.concepto,
    categoria: gastos.categoria,
    montoArs: gastos.montoArs,
    periodo: gastos.periodo,
    origen: gastos.origen,
  }).from(gastos)
    .where(and(
      eq(gastos.usuarioId, usuarioId),
      or(ilike(gastos.concepto, `%${q}%`), ilike(gastos.categoria, `%${q}%`)),
      ...rango(gastos.periodo),
    ))
    .orderBy(desc(gastos.periodo)).limit(limite);

  const todos = [...deTarjeta, ...sueltos]
    .map(r => ({ ...r, montoArs: Number(r.montoArs) }))
    .sort((a, b) => b.periodo.localeCompare(a.periodo))
    .slice(0, limite);

  return redactarProfundo({
    encontrados: todos.length,
    totalArs: todos.reduce((s, r) => s + r.montoArs, 0),
    consumos: todos,
  });
}

/** Cuanto se fue por categoria en un rango de meses. */
export async function gastoPorCategoria(usuarioId: string, desde: string, hasta: string) {
  validarPeriodo(desde);
  validarPeriodo(hasta);

  const filas = await db.select({ porCategoria: monthlyCloses.porCategoria })
    .from(monthlyCloses)
    .where(and(
      eq(monthlyCloses.usuarioId, usuarioId),
      gte(monthlyCloses.periodo, desde),
      lte(monthlyCloses.periodo, hasta),
    ));

  const acum = new Map<string, number>();
  for (const f of filas) {
    for (const [cat, monto] of Object.entries(f.porCategoria as Record<string, number>)) {
      acum.set(cat, (acum.get(cat) ?? 0) + Number(monto));
    }
  }

  const orden = [...acum.entries()].sort((a, b) => b[1] - a[1]);
  return redactarProfundo({
    desde, hasta, meses: filas.length,
    totalArs: orden.reduce((s, [, v]) => s + v, 0),
    categorias: orden.map(([categoria, montoArs]) => ({ categoria, montoArs })),
  });
}

/** Tenencias del ultimo snapshot y el libro de operaciones, en numeros. */
export async function portafolio(usuarioId: string) {
  const snaps = await db.query.portfolioSnapshots.findMany({
    where: eq(portfolioSnapshots.usuarioId, usuarioId),
    orderBy: desc(portfolioSnapshots.periodo), with: { positions: true }, limit: 8,
  });

  const [{ cuantas } = { cuantas: 0 }] = await db
    .select({ cuantas: sql<number>`count(*)::int` }).from(transacciones)
    .where(eq(transacciones.usuarioId, usuarioId));

  return redactarProfundo({
    plataformas: snaps.map(s => ({
      plataforma: s.plataforma, periodo: s.periodo,
      totalUsd: s.totalUsd === null ? null : Number(s.totalUsd),
      posiciones: s.positions.map(p => ({
        activo: p.activo, clase: p.clase, cantidad: Number(p.cantidad),
        valorUsd: p.valorUsd === null ? null : Number(p.valorUsd),
      })),
    })),
    operacionesCargadas: cuantas,
  });
}

/** Deudas: cuotas de creditos y plata prestada a personas. */
export async function compromisos(usuarioId: string, hoy: string) {
  const mes = hoy.slice(0, 7);
  const creditos = await cargarPrestamos(usuarioId);

  const filasFiado = await db.query.prestamosPersonales.findMany({
    where: eq(prestamosPersonales.usuarioId, usuarioId), with: { devoluciones: true },
  });
  const fiados: PrestamoPersonal[] = filasFiado.map(f => ({
    id: f.id, persona: f.persona, concepto: f.concepto,
    monto: Number(f.monto), moneda: f.moneda, fecha: f.fecha, perdonado: f.perdonado,
    devoluciones: f.devoluciones.map(d => ({ id: d.id, fecha: d.fecha, monto: Number(d.monto) })),
  }));

  return redactarProfundo({
    // Lo que debés
    cuotaDelMesArs: totalDelMes(creditos, mes),
    creditos: creditos.map(p => {
      const e = estadoPrestamo(p, mes);
      return {
        nombre: p.nombre, entidad: p.entidad, cuotaArs: p.cuotaArs,
        pagadas: e.pagadas, restantes: e.restantes, saldoArs: e.saldoArs,
        ultimaCuota: e.ultimoPeriodo,
      };
    }),
    // Lo que te deben
    prestadoAPersonas: fiados.map(f => {
      const r = resumir(f, hoy);
      return {
        persona: f.persona, moneda: f.moneda, prestado: f.monto,
        devuelto: r.devuelto, pendiente: r.pendiente,
        estado: r.estado, diasDesde: r.diasDesde,
      };
    }).filter(x => x.pendiente > 0),
  });
}

/** Metas de ahorro cargadas. */
export async function metas(usuarioId: string) {
  const filas = await db.select().from(goals)
    .where(and(eq(goals.usuarioId, usuarioId), eq(goals.archivada, false)))
    .orderBy(asc(goals.createdAt));

  return redactarProfundo(filas.map(m => ({
    nombre: m.nombre, montoObjetivo: Number(m.montoObjetivo),
    moneda: m.moneda, fechaObjetivo: m.fechaObjetivo,
  })));
}
