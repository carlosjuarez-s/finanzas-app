import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries, monthlyCloses } from '@/db/schema';

export type Cierre = {
  periodo: string;
  ingresoArs: number;
  gastoArs: number;
  gastoUsd: number;
  percepArs: number;
  ahorroArs: number;
  tasaAhorro: number | null;   // null si no hay recibo: distinto de 0%
  porCategoria: Record<string, number>;
};

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

// Unica fuente de verdad del calculo: la usan el dashboard (en vivo) y el
// historico (persistido), asi no pueden divergir.
export async function calcularCierre(periodo: string): Promise<Cierre> {
  const sts = await db.query.statements.findMany({
    where: eq(statements.periodo, periodo),
    with: { consumos: true },
  });
  const salary = await db.query.salaries.findFirst({
    where: inArray(salaries.periodo, [periodoAnterior(periodo), periodo]),
    orderBy: desc(salaries.periodo),
  });

  const gastoArs = sts.reduce((s, st) => s + Number(st.totalArs), 0);
  const gastoUsd = sts.reduce((s, st) => s + Number(st.totalUsd), 0);
  const percepArs = sts.reduce((s, st) => s + Number(st.percepArs), 0);
  const ingresoArs = Number(salary?.netoArs ?? 0);
  const ahorroArs = ingresoArs - gastoArs;

  const porCategoria: Record<string, number> = {};
  for (const st of sts) for (const c of st.consumos) {
    porCategoria[c.categoria] = (porCategoria[c.categoria] ?? 0) + Number(c.montoArs);
  }

  return {
    periodo, ingresoArs, gastoArs, gastoUsd, percepArs, ahorroArs,
    tasaAhorro: ingresoArs ? (ahorroArs / ingresoArs) * 100 : null,
    porCategoria,
  };
}

// Recalcula y guarda los meses indicados. Sin argumento, todos los que tengan
// resumenes cargados: despues de un sync no se sabe de antemano que meses toco.
export async function guardarCierres(periodos?: string[]): Promise<string[]> {
  // Un cierre solo tiene sentido para meses con resumenes cargados: son los que
  // el dashboard puede mostrar. Filtrar contra esta lista evita crear filas de
  // meses futuros vacios cuando entra un recibo adelantado, que se verian como
  // un mes de 100% de ahorro.
  const conResumenes = (await db.selectDistinct({ periodo: statements.periodo }).from(statements))
    .map(r => r.periodo);
  const objetivo = periodos ? conResumenes.filter(p => periodos.includes(p)) : conResumenes;

  for (const periodo of objetivo) {
    const c = await calcularCierre(periodo);
    await db.insert(monthlyCloses)
      .values({
        periodo: c.periodo,
        ingresoArs: String(c.ingresoArs), gastoArs: String(c.gastoArs),
        gastoUsd: String(c.gastoUsd), percepArs: String(c.percepArs),
        ahorroArs: String(c.ahorroArs),
        tasaAhorro: c.tasaAhorro === null ? null : String(c.tasaAhorro.toFixed(2)),
        porCategoria: c.porCategoria,
      })
      .onConflictDoUpdate({
        target: monthlyCloses.periodo,
        set: {
          ingresoArs: String(c.ingresoArs), gastoArs: String(c.gastoArs),
          gastoUsd: String(c.gastoUsd), percepArs: String(c.percepArs),
          ahorroArs: String(c.ahorroArs),
          tasaAhorro: c.tasaAhorro === null ? null : String(c.tasaAhorro.toFixed(2)),
          porCategoria: c.porCategoria,
          calculadoAt: new Date(),
        },
      });
  }
  return objetivo;
}
