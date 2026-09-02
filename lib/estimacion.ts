import { sumarMeses, montoEnPeriodo, type Prestamo } from './prestamos';

/**
 * Cuanto vas a gastar el mes que viene.
 *
 * Es una **estimacion, no un cierre**. No se guarda en `monthly_closes` ni
 * entra al historico: el historico son meses que ya pasaron, con datos reales, y
 * mezclar ahi un numero inventado contamina los promedios que despues alimentan
 * la proxima estimacion — el error se realimenta y crece solo.
 *
 * Se arma de tres pedazos, y cada uno se reporta por separado porque tienen
 * confianza muy distinta:
 *
 *   COMPROMETIDO  las cuotas que ya sabes que caen. No es una prediccion: esta
 *                 firmado. Es la parte que se puede afirmar.
 *   RECURRENTE    lo que aparece todos los meses (alquiler, luz, internet). Se
 *                 estima con la MEDIANA, no el promedio: un mes con un gasto
 *                 raro corre el promedio y no la mediana.
 *   VARIABLE      el resto. Es lo que peor se predice y hay que decirlo.
 */

export type MesHistorico = {
  periodo: string;
  porCategoria: Record<string, number>;
  gastoTotalArs: number | null;
};

export type LineaEstimada = {
  categoria: string;
  montoArs: number;
  /** De donde sale: cambia cuanto se le puede creer. */
  base: 'comprometido' | 'recurrente' | 'variable';
  /** En cuantos de los meses mirados aparecio. */
  mesesConDato: number;
};

export type Estimacion = {
  periodo: string;
  mesesUsados: number;
  comprometidoArs: number;
  recurrenteArs: number;
  variableArs: number;
  totalArs: number;
  lineas: LineaEstimada[];
  /** Ingreso de referencia: el ultimo conocido, sin proyectar aumentos. */
  ingresoReferenciaArs: number | null;
  ahorroEstimadoArs: number | null;
  /** Lo que hace falta saber para leer el numero sin creerle de mas. */
  advertencias: string[];
};

/** La mediana aguanta un mes raro sin correrse; el promedio no. */
export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Aparece en al menos la mitad de los meses mirados: es parte de la vida, no un evento. */
const RECURRENTE = 0.5;

export function estimar(
  periodo: string,
  historico: MesHistorico[],
  prestamos: Prestamo[],
  ingresoReferenciaArs: number | null,
  opciones: { mesesAMirar?: number } = {},
): Estimacion {
  const cuantos = Math.min(Math.max(1, opciones.mesesAMirar ?? 6), 24);

  // Los mas recientes, y solo los que tienen un total consolidado: un mes sin
  // tipo de cambio tiene el gasto a medias y correria la mediana hacia abajo.
  const meses = [...historico]
    .filter(m => m.gastoTotalArs !== null)
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-cuantos);

  const advertencias: string[] = [];

  // --- Comprometido: las cuotas que ya caen en ese mes --------------------
  const comprometidoArs = prestamos.reduce((s, p) => s + montoEnPeriodo(p, periodo), 0);

  // --- Historico por categoria -------------------------------------------
  const porCategoria = new Map<string, number[]>();
  for (const m of meses) {
    for (const [cat, monto] of Object.entries(m.porCategoria ?? {})) {
      const n = Number(monto);
      if (!Number.isFinite(n)) continue;
      porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), n]);
    }
  }

  const lineas: LineaEstimada[] = [];
  let recurrenteArs = 0;
  let variableArs = 0;

  for (const [categoria, valores] of porCategoria) {
    // "Cuotas" ya viene por el lado de los prestamos: contarla tambien desde el
    // historico la duplicaria, y es justo la categoria mas facil de duplicar
    // porque aparece en los dos lados.
    if (categoria === 'Cuotas') continue;

    const montoArs = mediana(valores);
    if (montoArs <= 0) continue;

    const frecuencia = valores.length / meses.length;
    const base = frecuencia >= RECURRENTE ? 'recurrente' : 'variable';

    lineas.push({ categoria, montoArs, base, mesesConDato: valores.length });
    if (base === 'recurrente') recurrenteArs += montoArs;
    else variableArs += montoArs;
  }

  if (comprometidoArs > 0) {
    lineas.push({
      categoria: 'Cuotas comprometidas', montoArs: comprometidoArs,
      base: 'comprometido', mesesConDato: meses.length,
    });
  }

  lineas.sort((a, b) => b.montoArs - a.montoArs);

  const totalArs = comprometidoArs + recurrenteArs + variableArs;

  // --- Lo que hay que decir para que el numero no se lea de mas ----------
  if (!meses.length) {
    advertencias.push('No hay ningún mes cerrado todavía: esto es solo lo que ya está comprometido en cuotas.');
  } else if (meses.length < 3) {
    advertencias.push(`Con ${meses.length} ${meses.length === 1 ? 'mes' : 'meses'} de historial la estimación es floja. Se afina sola con cada mes que cierres.`);
  }

  if (historico.some(m => m.gastoTotalArs === null)) {
    advertencias.push('Hay meses sin tipo de cambio cargado y quedaron afuera del cálculo.');
  }

  if (variableArs > totalArs * 0.4 && totalArs > 0) {
    advertencias.push('Más del 40% es gasto variable, que es la parte que peor se predice.');
  }

  if (ingresoReferenciaArs === null) {
    advertencias.push('Sin un sueldo cargado no se puede estimar cuánto te quedaría.');
  }

  return {
    periodo,
    mesesUsados: meses.length,
    comprometidoArs, recurrenteArs, variableArs, totalArs,
    lineas,
    ingresoReferenciaArs,
    ahorroEstimadoArs: ingresoReferenciaArs === null ? null : ingresoReferenciaArs - totalArs,
    advertencias,
  };
}

/** El mes siguiente al ultimo cerrado, que es el que se quiere estimar. */
export function proximoPeriodo(ultimoCerrado: string | undefined, hoy: string): string {
  const base = ultimoCerrado && ultimoCerrado >= hoy ? ultimoCerrado : hoy;
  return sumarMeses(base, 1);
}
