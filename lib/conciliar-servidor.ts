// El lado con base de datos de la conciliacion. La logica vive en
// lib/conciliar.ts, que es pura y la usa tambien la vista previa del cliente;
// aca solo se lee, se valida lo que llega de afuera, y se escribe.

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { createId } from '@/db/id';
import { portfolioSnapshots, positions, transacciones, eventosActivo } from '@/db/schema';
import { calcularPosicion, type Transaccion, type EventoActivo } from './costo';
import { num } from './guardar';
import {
  agrupar, ajustesDeLibro, clavePlataforma, completarValor, conciliar, datosDeActivos,
  nombrePlataforma, normalizarActivo, tolerancia, totalesPorActivo, ultimasFotos,
  type Accion, type Cambio, type FilaConciliacion, type Foto, type Instruccion, type Tenencia,
} from './conciliar';

export type FotoGuardada = Foto & { id: string };

/** Todas las fotos de la persona, con sus posiciones. */
export async function cargarFotos(usuarioId: string): Promise<FotoGuardada[]> {
  const snaps = await db.query.portfolioSnapshots.findMany({
    where: eq(portfolioSnapshots.usuarioId, usuarioId), with: { positions: true },
  });
  return snaps.map(s => ({
    id: s.id,
    plataforma: s.plataforma,
    periodo: s.periodo,
    creado: s.createdAt.getTime(),
    totalUsd: s.totalUsd === null ? null : Number(s.totalUsd),
    tenencias: s.positions.map(p => ({
      activo: normalizarActivo(p.activo), clase: p.clase, cantidad: Number(p.cantidad),
      valorUsd: p.valorUsd === null ? null : Number(p.valorUsd),
    })),
  }));
}

/**
 * Cuanto dice el libro que tenes de cada activo. Un activo con el libro roto
 * (una venta sin su compra) no entra: se reporta, y no se ajusta a ciegas
 * encima de un numero que ya esta mal.
 */
export async function libroActual(usuarioId: string): Promise<{ libro: Map<string, number>; rotos: string[] }> {
  const [txs, evs] = await Promise.all([
    db.select().from(transacciones).where(eq(transacciones.usuarioId, usuarioId)),
    db.select().from(eventosActivo).where(eq(eventosActivo.usuarioId, usuarioId)),
  ]);
  const libro: Transaccion[] = txs.map(t => ({
    activo: normalizarActivo(t.activo), tipo: t.tipo as 'COMPRA' | 'VENTA', fecha: t.fecha,
    cantidad: Number(t.cantidad), precioUnitario: Number(t.precioUnitario),
    moneda: t.moneda as 'ARS' | 'USD', tipoCambioDia: t.tipoCambioDia === null ? null : Number(t.tipoCambioDia),
    comision: Number(t.comision),
  }));
  const eventos: EventoActivo[] = evs.map(e => ({
    activo: normalizarActivo(e.activo), fecha: e.fecha, tipo: e.tipo as EventoActivo['tipo'], factor: Number(e.factor),
  }));

  const salida = new Map<string, number>();
  const rotos: string[] = [];
  for (const activo of new Set(libro.map(t => t.activo))) {
    try {
      // La cantidad no depende del dolar del dia, pero calcularPosicion lo
      // exige para el costo. Para contar unidades alcanza con cualquier valor.
      const soloCantidad = libro.map(t => (t.moneda === 'ARS' && !t.tipoCambioDia ? { ...t, tipoCambioDia: 1 } : t));
      salida.set(activo, calcularPosicion(activo, soloCantidad, eventos).cantidad);
    } catch {
      rotos.push(activo);
    }
  }
  return { libro: salida, rotos };
}

// --- Validacion de lo que llega de afuera -----------------------------------

const ACTIVO = /^[A-Z0-9.\-/]{1,20}$/;
const CLASES = new Set(['CRIPTO', 'CEDEAR', 'RENTA_FIJA', 'FCI', 'DOLAR', 'ACCION', 'OTRO']);
const clase = (v: unknown, activo: string) => {
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return CLASES.has(c) ? c : activo === 'USD' ? 'DOLAR' : 'OTRO';
};
const numONull = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null;
  const n = num(v, NaN);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tenencias de una foto (salida del modelo) o del cliente. Descarta lo que no
 * se puede usar en vez de guardarlo mal: un activo sin nombre o una cantidad
 * negativa no son un dato aproximado, son un dato falso.
 */
export function validarTenencias(crudas: unknown): { tenencias: Tenencia[]; descartadas: number } {
  const lista = Array.isArray(crudas) ? crudas : [];
  let descartadas = 0;
  const tenencias: Tenencia[] = [];
  for (const p of lista) {
    const activo = normalizarActivo(texto(p?.activo));
    const cantidad = num(p?.cantidad, NaN);
    if (!ACTIVO.test(activo) || !Number.isFinite(cantidad) || cantidad < 0) { descartadas++; continue; }
    if (cantidad <= tolerancia(cantidad)) continue;
    const valorUsd = numONull(p?.valorUsd);
    const precioUsd = numONull(p?.precioUsd);
    const costo = numONull(p?.costoUnitarioUsd);
    tenencias.push(completarValor({
      activo, clase: clase(p?.clase, activo), cantidad,
      valorUsd: valorUsd !== null && valorUsd >= 0 ? valorUsd : null,
      precioUsd: precioUsd !== null && precioUsd > 0 ? precioUsd : null,
      costoUnitarioUsd: costo !== null && costo > 0 ? costo : null,
    }));
  }
  return { tenencias: agrupar(tenencias), descartadas };
}

const ACCIONES = new Set<Accion>(['FIJAR', 'SUMAR', 'RESTAR', 'QUITAR', 'MOVER', 'VACIAR']);

export function validarInstrucciones(crudas: unknown): { instrucciones: Instruccion[]; descartadas: number } {
  const lista = Array.isArray(crudas) ? crudas : [];
  let descartadas = 0;
  const instrucciones: Instruccion[] = [];
  for (const i of lista) {
    const accion = texto(i?.accion).toUpperCase() as Accion;
    const activo = normalizarActivo(texto(i?.activo));
    if (!ACCIONES.has(accion) || (accion !== 'VACIAR' && !ACTIVO.test(activo))) { descartadas++; continue; }
    const cantidad = numONull(i?.cantidad);
    const precioUsd = numONull(i?.precioUsd);
    const fecha = texto(i?.fecha);
    instrucciones.push({
      accion, activo,
      cantidad: cantidad !== null && cantidad >= 0 ? cantidad : null,
      plataforma: texto(i?.plataforma) || null,
      clase: i?.clase ? clase(i.clase, activo) : null,
      precioUsd: precioUsd !== null && precioUsd > 0 ? precioUsd : null,
      fecha: FECHA.test(fecha) ? fecha : null,
    });
  }
  return { instrucciones, descartadas };
}

// --- Vista previa -----------------------------------------------------------

export type PlataformaPropuesta = {
  plataforma: string;
  desde: string | null;
  filas: FilaConciliacion[];
  /**
   * Lo que no aparece y arranca marcado como «ya no lo tengo». En una captura
   * no hay ninguno: la foto puede estar cortada. En una correccion escrita son
   * todos, porque se sacaron a proposito («vendi todo lo de IOL»).
   */
  quitados: string[];
};

export type Propuesta = {
  plataformas: PlataformaPropuesta[];
  /** Lo que dice el libro hoy, por activo tocado. */
  libro: Record<string, number>;
  /** Lo que hay en las cuentas que esta carga no toca, por activo tocado. */
  otras: Record<string, number>;
  dichos: Record<string, { precioUsd: number | null; fecha: string | null }>;
  errores: string[];
  hoy: string;
};

/** La foto anterior de cada cuenta que se va a tocar. */
export function conAnterior(fotos: Foto[], plataforma: string, nueva: Tenencia[]): Cambio {
  const previa = ultimasFotos(fotos).find(f => clavePlataforma(f.plataforma) === clavePlataforma(plataforma));
  return {
    plataforma: nombrePlataforma(plataforma),
    desde: previa?.periodo ?? null,
    anterior: previa ? agrupar(previa.tenencias) : [],
    nueva,
  };
}

export async function armarPropuesta(
  usuarioId: string, fotos: Foto[], cambios: Cambio[],
  dichos: Propuesta['dichos'] = {}, errores: string[] = [], explicito = false,
): Promise<Propuesta> {
  const plataformas = cambios.map(c => {
    const filas = conciliar(c.anterior, c.nueva);
    return {
      plataforma: c.plataforma, desde: c.desde, filas,
      quitados: explicito ? filas.filter(f => f.tipo === 'FALTA').map(f => f.activo) : [],
    };
  });
  const activos = new Set(plataformas.flatMap(p => p.filas.map(f => f.activo)));
  const tocadas = new Set(cambios.map(c => clavePlataforma(c.plataforma)));
  const otras = totalesPorActivo(ultimasFotos(fotos).filter(f => !tocadas.has(clavePlataforma(f.plataforma))));
  const { libro, rotos } = await libroActual(usuarioId);

  const soloTocados = (m: Map<string, number>) =>
    Object.fromEntries([...activos].filter(a => m.has(a)).map(a => [a, m.get(a)!]));

  return {
    plataformas,
    libro: soloTocados(libro),
    otras: soloTocados(otras),
    dichos,
    errores: [
      ...errores,
      ...rotos.filter(a => activos.has(a)).map(a =>
        `El libro de ${a} no cierra (hay una venta sin su compra): no se ajusta hasta que lo revises en Operaciones.`),
    ],
    hoy: new Date().toISOString().slice(0, 10),
  };
}

// --- Aplicar ----------------------------------------------------------------

export type Aplicacion = {
  plataformas: { plataforma: string; tenencias: Tenencia[] }[];
  /**
   * Precio elegido para el ajuste de cada activo. Un numero se usa; null quiere
   * decir «no lo anotes en el libro». Lo que no aparece usa el precio sugerido.
   */
  precios: Record<string, number | null>;
  dichos: Propuesta['dichos'];
};

export type ResultadoAplicacion = {
  periodo: string;
  cuentas: string[];
  anotadas: { activo: string; tipo: 'COMPRA' | 'VENTA'; cantidad: number; precioUsd: number }[];
  sinAnotar: string[];
};

/**
 * Fija el estado de cada cuenta y ajusta el libro por la diferencia.
 *
 * Todo se recalcula aca contra la base de AHORA, no se confia en lo que calculo
 * la vista previa: si se confirma dos veces, o si entre la vista previa y el
 * confirmar se cargo algo, el ajuste es contra lo que hay. Y todo va en una
 * sola transaccion: una cuenta actualizada con el libro sin ajustar es
 * justamente el estado inconsistente que esto viene a evitar.
 */
export async function aplicarConciliacion(usuarioId: string, a: Aplicacion): Promise<ResultadoAplicacion> {
  const hoy = new Date().toISOString().slice(0, 10);
  const periodo = hoy.slice(0, 7);
  const fotos = await cargarFotos(usuarioId);
  const { libro, rotos } = await libroActual(usuarioId);

  // Una cuenta nombrada dos veces se unifica: la segunda no puede pisar a la primera.
  const porCuenta = new Map<string, { plataforma: string; tenencias: Tenencia[] }>();
  for (const p of a.plataformas) {
    const k = clavePlataforma(p.plataforma);
    const previo = porCuenta.get(k);
    porCuenta.set(k, {
      plataforma: nombrePlataforma(p.plataforma),
      tenencias: agrupar([...(previo?.tenencias ?? []), ...p.tenencias]),
    });
  }

  const filas = [...porCuenta.values()].flatMap(p => conciliar(conAnterior(fotos, p.plataforma, []).anterior, p.tenencias));
  const vigentes = ultimasFotos(fotos).filter(f => !porCuenta.has(clavePlataforma(f.plataforma)));
  const objetivo = totalesPorActivo([
    ...vigentes,
    ...[...porCuenta.values()].map(p => ({ plataforma: p.plataforma, periodo, totalUsd: null, tenencias: p.tenencias })),
  ]);

  const datos = datosDeActivos(filas, a.dichos);
  for (const [activo, precio] of Object.entries(a.precios)) {
    const d = datos.get(activo);
    if (d && precio !== null) d.precioUsd = precio;
  }
  const ajustes = ajustesDeLibro(objetivo, libro, filas.map(f => f.activo).filter(x => !rotos.includes(x)), datos, hoy);
  const anotar = ajustes.filter(j => j.precioUsd !== null && a.precios[j.activo] !== null);
  const sinAnotar = ajustes.filter(j => !anotar.includes(j)).map(j => j.activo);

  // --- Escritura, todo junto --------------------------------------------------
  const sentencias = [];
  for (const [k, p] of porCuenta) {
    // Una foto de este mes con el nombre escrito distinto («IOL» y
    // «InvertirOnline») es la misma cuenta: se borra, o quedaria sumando.
    const mismas = fotos.filter(f => f.periodo === periodo && clavePlataforma(f.plataforma) === k);
    const propia = mismas.find(f => f.plataforma === p.plataforma);
    const viejas = mismas.filter(f => f !== propia).map(f => f.id);
    if (viejas.length) {
      sentencias.push(db.delete(portfolioSnapshots)
        .where(and(eq(portfolioSnapshots.usuarioId, usuarioId), inArray(portfolioSnapshots.id, viejas))));
    }

    const id = propia?.id ?? createId();
    const conValor = p.tenencias.every(t => t.valorUsd !== null);
    const totalUsd = conValor ? String(p.tenencias.reduce((s, t) => s + (t.valorUsd as number), 0)) : null;
    sentencias.push(db.insert(portfolioSnapshots)
      .values({ id, usuarioId, periodo, plataforma: p.plataforma, totalUsd, totalArs: null })
      .onConflictDoUpdate({
        target: [portfolioSnapshots.usuarioId, portfolioSnapshots.periodo, portfolioSnapshots.plataforma],
        set: { totalUsd, totalArs: null },
      }));
    // La foto se reemplaza entera. Una cuenta vaciada queda con la foto vacia,
    // que es lo que la saca del total (ver seriePorPeriodo).
    sentencias.push(db.delete(positions).where(eq(positions.snapshotId, id)));
    if (p.tenencias.length) {
      sentencias.push(db.insert(positions).values(p.tenencias.map(t => ({
        snapshotId: id, activo: t.activo, clase: t.clase, cantidad: String(t.cantidad),
        valorUsd: t.valorUsd === null ? null : String(t.valorUsd), valorArs: null,
      }))));
    }
  }
  if (anotar.length) {
    sentencias.push(db.insert(transacciones).values(anotar.map(j => ({
      usuarioId, activo: j.activo, clase: j.clase, tipo: j.tipo, fecha: j.fecha,
      cantidad: String(j.cantidad), precioUnitario: String(j.precioUsd), moneda: 'USD',
      tipoCambioDia: null, comision: '0', origen: 'AJUSTE', refExterna: null,
    }))));
  }

  if (sentencias.length) {
    await db.batch(sentencias as unknown as Parameters<typeof db.batch>[0]);
  }

  return {
    periodo,
    cuentas: [...porCuenta.values()].map(p => p.plataforma),
    anotadas: anotar.map(j => ({ activo: j.activo, tipo: j.tipo, cantidad: j.cantidad, precioUsd: j.precioUsd as number })),
    sinAnotar: [...sinAnotar, ...rotos.filter(r => filas.some(f => f.activo === r))],
  };
}

