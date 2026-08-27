import { asc, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monthlyCloses, gastos, goals, transacciones, portfolioSnapshots, prestamosPersonales } from '@/db/schema';
import { auditar, type Hallazgo, type DatosAuditoria } from './auditoria';
import { listarConexiones } from './conexiones';
import { leerSupuestos, ahorroAcumuladoUsd } from './supuestos';
import { redactarProfundo } from './pii';
import { resumir, type PrestamoPersonal } from './fiado';
import { ANALISIS_SYSTEM } from './prompts';

// Analisis de la situacion financiera.
//
// Dos capas, y el orden importa:
//   1. auditar()  -> deterministico, testeado. Calcula los hallazgos.
//   2. el modelo  -> prioriza y explica lo que la capa 1 encontro.
//
// Nunca al reves. Un LLM al que le pedis "revisa mis finanzas" devuelve
// hallazgos plausibles e inventados con la misma prosa segura que los reales, y
// no hay forma de distinguirlos leyendo la respuesta.
//
// Lo que se manda: agregados mensuales, no filas. El modelo no necesita ver cada
// consumo para decir que agosto fue caro, y mandar menos es a la vez mas barato
// y menos expuesto. Ademas todo pasa por redactarProfundo antes de salir.
//
// Lo que NUNCA se manda: nada de la tabla `conexiones`. Las credenciales no
// entran en este camino ni cifradas.

export type Analisis = {
  resumen: string;
  prioridades: { que: string; porque: string }[];
  observaciones: string[];
};

export async function reunirDatos(): Promise<DatosAuditoria> {
  const hoyISO = new Date().toISOString().slice(0, 10);

  const [cierres, sueltos, metas, supuestos, conexiones, filasFiado] = await Promise.all([
    db.select().from(monthlyCloses).orderBy(asc(monthlyCloses.periodo)),
    db.select().from(gastos),
    db.select().from(goals),
    leerSupuestos(),
    listarConexiones(),
    db.query.prestamosPersonales.findMany({ with: { devoluciones: true } }),
  ]);

  const fiados: PrestamoPersonal[] = filasFiado.map(f => ({
    id: f.id, persona: f.persona, concepto: f.concepto,
    monto: Number(f.monto), moneda: f.moneda, fecha: f.fecha, perdonado: f.perdonado,
    devoluciones: f.devoluciones.map(d => ({ id: d.id, fecha: d.fecha, monto: Number(d.monto) })),
  }));

  const snaps = await db.query.portfolioSnapshots.findMany({
    orderBy: desc(portfolioSnapshots.periodo), with: { positions: true }, limit: 4,
  });
  const activosConLibro = (await db.selectDistinct({ activo: transacciones.activo }).from(transacciones))
    .map(r => r.activo);

  return {
    cierres: cierres.map(c => ({
      periodo: c.periodo,
      ingresoArs: Number(c.ingresoArs), gastoArs: Number(c.gastoArs),
      ahorroArs: Number(c.ahorroArs),
      tasaAhorro: c.tasaAhorro === null ? null : Number(c.tasaAhorro),
      porCategoria: c.porCategoria as Record<string, number>,
    })),
    gastos: sueltos.map(g => ({
      periodo: g.periodo, concepto: g.concepto, categoria: g.categoria, montoArs: Number(g.montoArs),
    })),
    metas: metas.map(m => ({
      nombre: m.nombre, montoObjetivo: Number(m.montoObjetivo),
      moneda: m.moneda, fechaObjetivo: m.fechaObjetivo,
    })),
    tenencias: snaps.flatMap(s => s.positions.map(p => ({ activo: p.activo, cantidad: Number(p.cantidad) }))),
    activosConLibro,
    // Solo etiqueta y estado: ni el secreto ni la pista salen de aca.
    conexiones: conexiones.map(c => ({ etiqueta: c.etiqueta, estado: c.estado, ultimoSync: c.ultimoSync })),
    fiados: fiados.map(f => {
      const r = resumir(f, hoyISO);
      return {
        persona: f.persona, pendiente: r.pendiente, moneda: f.moneda,
        diasDesde: r.diasDesde, huboDevolucion: r.devuelto > 0,
      };
    }),
    ahorroAcumuladoUsd: await ahorroAcumuladoUsd(supuestos.tipoCambioArs),
    tipoCambioArs: supuestos.tipoCambioArs,
    hoy: new Date().toISOString().slice(0, 7),
  };
}

/** Lo que efectivamente se le manda al modelo: agregados, no filas. */
function paraElModelo(d: DatosAuditoria, hallazgos: Hallazgo[]) {
  const ultimos = d.cierres.slice(-12);
  return redactarProfundo({
    hallazgos: hallazgos.map(h => ({ severidad: h.severidad, titulo: h.titulo, detalle: h.detalle })),
    meses: ultimos.map(c => ({
      periodo: c.periodo,
      ingresoArs: Math.round(c.ingresoArs),
      gastoArs: Math.round(c.gastoArs),
      ahorroArs: Math.round(c.ahorroArs),
      tasaAhorro: c.tasaAhorro === null ? null : Math.round(c.tasaAhorro * 10) / 10,
      // Solo las cinco categorias mas grandes: el resto es ruido para esto.
      principalesCategorias: Object.entries(c.porCategoria)
        .sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([cat, monto]) => ({ cat, monto: Math.round(monto) })),
    })),
    metas: d.metas,
    portafolio: {
      activos: [...new Set(d.tenencias.map(t => t.activo))],
      conCostoCargado: d.activosConLibro,
      ahorroAcumuladoUsd: Math.round(d.ahorroAcumuladoUsd),
    },
    tipoCambioArs: d.tipoCambioArs,
  });
}

export async function analizar(): Promise<{ hallazgos: Hallazgo[]; analisis: Analisis | null; motivo?: string }> {
  const datos = await reunirDatos();
  const hallazgos = auditar(datos);

  // Los hallazgos ya valen por si solos: si no hay proveedor de IA configurado,
  // o falla, la pantalla igual sirve. La narrativa es un extra, no el producto.
  if (!datos.cierres.length) {
    return { hallazgos, analisis: null, motivo: 'Todavia no hay meses cerrados para analizar.' };
  }

  try {
    const { generarAnalisis } = await import('./extract');
    const analisis = await generarAnalisis<Analisis>(
      ANALISIS_SYSTEM, JSON.stringify(paraElModelo(datos, hallazgos)),
    );
    return { hallazgos, analisis };
  } catch (e) {
    return {
      hallazgos, analisis: null,
      motivo: `Los hallazgos son del sistema y estan completos. El resumen narrado no se pudo generar: ${e instanceof Error ? e.message : e}`,
    };
  }
}
