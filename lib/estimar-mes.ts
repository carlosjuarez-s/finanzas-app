/**
 * La estimacion de un mes, cargada de la base.
 *
 * Existe por la misma razon que `calcularCierre`: el cierre y la pantalla de
 * estimacion muestran el mismo mes, y si cada una armara su propia consulta,
 * tarde o temprano mostrarian numeros distintos del mismo mes. Es un solo
 * camino, y las dos lo usan.
 *
 * **Esto no se guarda nunca.** Un cierre son datos reales de un mes que ya
 * paso; esto es lo que va a pasar. Mezclarlos contamina los promedios que
 * despues alimentan la proxima estimacion, y el error se realimenta.
 */

import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { monthlyCloses, salaries } from '@/db/schema';
import { cargarPrestamos } from './cierre';
import { consolidar, totalesDelCierre } from './bimoneda';
import { listar as listarFijos, leerIndices, totalDelMes as totalDeFijos } from './recurrentes';
import { estimar, type Estimacion } from './estimacion';

export type EstimacionDeMes = {
  estimacion: Estimacion;
  /** El tipo de cambio con el que se consolido, y de que mes salio. */
  tipoCambio: number | null;
  tipoCambioDe: string | null;
};

export async function estimacionDeMes(usuarioId: string, periodo: string): Promise<EstimacionDeMes> {
  const [cierres, prestamos, ultimoSueldo, fijos, indices] = await Promise.all([
    db.select().from(monthlyCloses).where(eq(monthlyCloses.usuarioId, usuarioId))
      .orderBy(asc(monthlyCloses.periodo)),
    cargarPrestamos(usuarioId),
    db.query.salaries.findFirst({
      where: eq(salaries.usuarioId, usuarioId), orderBy: desc(salaries.periodo),
    }),
    listarFijos(usuarioId),
    leerIndices(usuarioId),
  ]);

  // Solo el historico ANTERIOR al mes que se estima. Incluir el propio mes
  // seria estimarlo con si mismo: el numero daria bien siempre y no diria nada.
  const previos = cierres.filter(c => c.periodo < periodo);

  // El tipo de cambio del mes que se estima no existe todavia: se usa el del
  // cierre mas reciente que tenga uno. Es un supuesto, y por eso se dice cual.
  const conTc = [...previos].reverse().find(c => c.tipoCambio !== null && Number(c.tipoCambio) > 0);
  const tipoCambio = conTc ? Number(conTc.tipoCambio) : null;

  const historico = previos.map(c => ({
    periodo: c.periodo,
    porCategoria: c.porCategoria as Record<string, number>,
    gastoTotalArs: totalesDelCierre(c).gasto.totalArs,
  }));

  // El ultimo sueldo conocido, sin proyectar aumentos: inventar una paritaria
  // seria agregarle un error propio a una estimacion que ya tiene el suyo.
  const sueldo = {
    ars: Number(ultimoSueldo?.netoArs ?? 0),
    usd: Number(ultimoSueldo?.netoUsd ?? 0),
  };
  const ingresoRef = ultimoSueldo ? consolidar(sueldo, tipoCambio).totalArs : null;

  const delMes = totalDeFijos(fijos, periodo, indices);
  const fijosArs = consolidar(delMes.monto, tipoCambio).totalArs;

  const estimacion = estimar(periodo, historico, prestamos, ingresoRef, {
    tipoCambio,
    periodoDelIngreso: ultimoSueldo?.periodo ?? null,
    ingreso: sueldo,
    fijos: {
      porCategoria: delMes.porCategoria,
      totalArs: fijosArs ?? delMes.monto.ars,
      ars: delMes.monto.ars,
      usd: delMes.monto.usd,
      faltaIndice: delMes.faltaIndice,
    },
  });

  return { estimacion, tipoCambio, tipoCambioDe: conTc?.periodo ?? null };
}
