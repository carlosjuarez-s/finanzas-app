import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries, monthlyCloses, gastos, prestamos } from '@/db/schema';
import { totalDelMes, periodosConCuota, type Prestamo } from './prestamos';
import { consolidar, tasaAhorro as calcularTasa } from './bimoneda';
import { leerSupuestos } from './supuestos';
import { dolares } from './precios';

export type Cierre = {
  periodo: string;
  // Crudos, cada uno en su moneda.
  ingresoArs: number;
  ingresoUsd: number;
  gastoArs: number;
  gastoUsd: number;
  /** El que se uso para consolidar este mes. Null si no habia con que. */
  tipoCambio: number | null;
  // Consolidados en pesos. Null cuando hay dolares y no hay tipo de cambio:
  // un total a medias se lee como completo y miente.
  ingresoTotalArs: number | null;
  gastoTotalArs: number | null;
  ahorroArs: number | null;
  percepArs: number;
  tasaAhorro: number | null;   // null si no hay recibo: distinto de 0%
  porCategoria: Record<string, number>;
};

/**
 * El tipo de cambio con el que se consolida un mes.
 *
 * Para un mes ya cerrado manda el que quedo guardado: es el de su momento y no
 * se toca. Para el mes en curso se usa el MEP de hoy, y si la red falla, el
 * supuesto configurado. Nunca se repisa el de un mes cerrado con el de hoy.
 */
export async function tipoCambioDelMes(
  usuarioId: string, periodo: string, guardado: number | null,
): Promise<number | null> {
  if (guardado && guardado > 0) return guardado;

  const enVivo = (await dolares()).mep;
  if (enVivo && enVivo > 0) return enVivo;

  const s = await leerSupuestos(usuarioId);
  return s.tipoCambioArs > 0 ? s.tipoCambioArs : null;
}

// El recibo del mes anterior es el que paga los consumos de este cierre; si ya
// entro el del mes en curso, ese manda.
function periodoAnterior(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
}

// Un recibo del mes M entra en el cierre de M y en el de M+1: quien carga un
// sueldo tiene que invalidar los dos.
export function periodoSiguiente(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}`;
}

/** Los prestamos, con los numericos ya convertidos: el resto del modulo hace cuentas. */
export async function cargarPrestamos(usuarioId: string): Promise<Prestamo[]> {
  const filas = await db.select().from(prestamos).where(eq(prestamos.usuarioId, usuarioId));
  return filas.map(f => ({
    id: f.id, nombre: f.nombre, entidad: f.entidad,
    montoOtorgado: f.montoOtorgado === null ? null : Number(f.montoOtorgado),
    cuotas: Number(f.cuotas), cuotaArs: Number(f.cuotaArs),
    primerPeriodo: f.primerPeriodo, moneda: f.moneda,
    cftAnual: f.cftAnual === null ? null : Number(f.cftAnual),
    canceladoEn: f.canceladoEn,
  }));
}

// Unica fuente de verdad del calculo: la usan el dashboard (en vivo) y el
// historico (persistido), asi no pueden divergir.
export async function calcularCierre(usuarioId: string, periodo: string): Promise<Cierre> {
  const sts = await db.query.statements.findMany({
    where: and(eq(statements.usuarioId, usuarioId), eq(statements.periodo, periodo)),
    with: { consumos: true },   // las hijas cuelgan del padre ya scopeado
  });
  const salary = await db.query.salaries.findFirst({
    where: and(
      eq(salaries.usuarioId, usuarioId),
      inArray(salaries.periodo, [periodoAnterior(periodo), periodo]),
    ),
    orderBy: desc(salaries.periodo),
  });
  // Servicios, alquiler y demas gastos sin resumen: no cuelgan de un statement
  // pero salen del mismo bolsillo, asi que suman al gasto del mes.
  const sueltos = await db.select().from(gastos)
    .where(and(eq(gastos.usuarioId, usuarioId), eq(gastos.periodo, periodo)));

  // La cuota del mes se deriva del plan del prestamo, no se carga como gasto.
  // Cargarla a mano ademas la contaria dos veces.
  const cuotasArs = totalDelMes(await cargarPrestamos(usuarioId), periodo);

  const gastoArs = sts.reduce((s, st) => s + Number(st.totalArs), 0)
    + sueltos.reduce((s, g) => s + Number(g.montoArs), 0)
    + cuotasArs;
  const gastoUsd = sts.reduce((s, st) => s + Number(st.totalUsd), 0)
    + sueltos.reduce((s, g) => s + Number(g.montoUsd), 0);
  const percepArs = sts.reduce((s, st) => s + Number(st.percepArs), 0);
  const ingresoArs = Number(salary?.netoArs ?? 0);
  const ingresoUsd = Number(salary?.netoUsd ?? 0);

  // El tipo de cambio guardado del mes, si ya se cerro alguna vez.
  const [previo] = await db.select({ tipoCambio: monthlyCloses.tipoCambio })
    .from(monthlyCloses)
    .where(and(eq(monthlyCloses.usuarioId, usuarioId), eq(monthlyCloses.periodo, periodo)));

  const tc = await tipoCambioDelMes(usuarioId, periodo, previo?.tipoCambio === undefined || previo.tipoCambio === null ? null : Number(previo.tipoCambio));

  const ingreso = consolidar({ ars: ingresoArs, usd: ingresoUsd }, tc);
  const gasto = consolidar({ ars: gastoArs, usd: gastoUsd }, tc);

  const ahorroArs = ingreso.totalArs === null || gasto.totalArs === null
    ? null
    : ingreso.totalArs - gasto.totalArs;

  const porCategoria: Record<string, number> = {};
  for (const st of sts) for (const c of st.consumos) {
    porCategoria[c.categoria] = (porCategoria[c.categoria] ?? 0) + Number(c.montoArs);
  }
  for (const g of sueltos) {
    porCategoria[g.categoria] = (porCategoria[g.categoria] ?? 0) + Number(g.montoArs);
  }
  if (cuotasArs) porCategoria['Cuotas'] = (porCategoria['Cuotas'] ?? 0) + cuotasArs;

  return {
    periodo, ingresoArs, ingresoUsd, gastoArs, gastoUsd,
    tipoCambio: tc,
    ingresoTotalArs: ingreso.totalArs,
    gastoTotalArs: gasto.totalArs,
    ahorroArs,
    percepArs,
    tasaAhorro: calcularTasa(ingreso.totalArs, ahorroArs),
    porCategoria,
  };
}

// Recalcula y guarda los meses indicados. Sin argumento, todos los que tengan
// resumenes cargados: despues de un sync no se sabe de antemano que meses toco.
export async function guardarCierres(usuarioId: string, periodos?: string[]): Promise<string[]> {
  // Un cierre solo tiene sentido para meses con gasto cargado: son los que el
  // dashboard puede mostrar. Filtrar contra esta lista evita crear filas de meses
  // futuros vacios cuando entra un recibo adelantado, que se verian como un mes
  // de 100% de ahorro. Un mes puede tener solo alquiler y servicios, sin tarjeta.
  const [conResumenes, conGastos, prests] = await Promise.all([
    db.selectDistinct({ periodo: statements.periodo }).from(statements)
      .where(eq(statements.usuarioId, usuarioId)),
    db.selectDistinct({ periodo: gastos.periodo }).from(gastos)
      .where(eq(gastos.usuarioId, usuarioId)),
    cargarPrestamos(usuarioId),
  ]);
  // Un mes cuyo unico gasto es una cuota tambien es un mes: sin esto no
  // existiria en el historico y el grafico mostraria un hueco.
  const conDatos = [...new Set([
    ...conResumenes.map(r => r.periodo),
    ...conGastos.map(r => r.periodo),
    ...periodosConCuota(prests),
  ])];
  const objetivo = periodos ? conDatos.filter(p => periodos.includes(p)) : conDatos;

  for (const periodo of objetivo) {
    const c = await calcularCierre(usuarioId, periodo);
    await db.insert(monthlyCloses)
      .values({
        usuarioId,
        periodo: c.periodo,
        ingresoArs: String(c.ingresoArs), ingresoUsd: String(c.ingresoUsd),
        gastoArs: String(c.gastoArs), gastoUsd: String(c.gastoUsd),
        tipoCambio: c.tipoCambio === null ? null : String(c.tipoCambio),
        percepArs: String(c.percepArs),
        ahorroArs: String(c.ahorroArs ?? 0),
        tasaAhorro: c.tasaAhorro === null ? null : String(c.tasaAhorro.toFixed(2)),
        porCategoria: c.porCategoria,
      })
      .onConflictDoUpdate({
        target: [monthlyCloses.usuarioId, monthlyCloses.periodo],
        set: {
          ingresoArs: String(c.ingresoArs), ingresoUsd: String(c.ingresoUsd),
          gastoArs: String(c.gastoArs), gastoUsd: String(c.gastoUsd),
          tipoCambio: c.tipoCambio === null ? null : String(c.tipoCambio),
          percepArs: String(c.percepArs),
          ahorroArs: String(c.ahorroArs ?? 0),
          tasaAhorro: c.tasaAhorro === null ? null : String(c.tasaAhorro.toFixed(2)),
          porCategoria: c.porCategoria,
          calculadoAt: new Date(),
        },
      });
  }
  return objetivo;
}
