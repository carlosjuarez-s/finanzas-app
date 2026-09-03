import type { Transaccion } from './costo';

/**
 * Como fue creciendo (o no) el portafolio.
 *
 * El total mes a mes no alcanza, y es el error clasico de todo tracker: si un
 * mes aportaste USD 1.000 y el mercado cayo, el total igual sube y el grafico
 * dice que te fue bien. **Creciste porque pusiste plata** y **creciste porque
 * lo que tenias subio** son dos cosas distintas, y la segunda es la unica que
 * mide si invertiste bien.
 *
 * Por eso cada punto lleva las dos lineas: cuanto vale, y cuanto pusiste. La
 * distancia entre ambas es el resultado.
 */

export type SnapshotPeriodo = {
  periodo: string;              // YYYY-MM
  /** Suma de las plataformas. Null si alguna no informo valuacion. */
  valorUsd: number | null;
};

export type PuntoHistorial = {
  periodo: string;
  valorUsd: number | null;
  /** Plata neta puesta hasta ese mes inclusive: compras menos ventas. */
  aportadoUsd: number;
  /** valor − aportado. Null si no hay valuacion con que compararlo. */
  resultadoUsd: number | null;
  /** El resultado como % de lo aportado. Null si no se aporto nada. */
  retornoPct: number | null;
};

/** Cuanto salio del bolsillo en una operacion, en dolares. */
export function montoEnUsd(t: Transaccion): number | null {
  const bruto = t.cantidad * t.precioUnitario;
  const total = t.tipo === 'COMPRA' ? bruto + t.comision : bruto - t.comision;

  if (t.moneda === 'USD') return total;
  // Una operacion en pesos sin el dolar de su dia no se puede medir en
  // dolares. Se descarta y se avisa, en vez de convertirla al dolar de hoy:
  // eso diria que compraste mucho mas barato de lo que compraste.
  if (!t.tipoCambioDia || t.tipoCambioDia <= 0) return null;
  return total / t.tipoCambioDia;
}

export type Historial = {
  puntos: PuntoHistorial[];
  /** Operaciones que no se pudieron medir en dolares. */
  operacionesSinConvertir: number;
};

export function historial(
  snapshots: SnapshotPeriodo[],
  transacciones: Transaccion[],
): Historial {
  const meses = [...snapshots]
    .filter(s => /^\d{4}-(0[1-9]|1[0-2])$/.test(s.periodo))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  let sinConvertir = 0;

  // Aporte neto de cada mes: lo que entro menos lo que saliste.
  const aportePorMes = new Map<string, number>();
  for (const t of transacciones) {
    const usd = montoEnUsd(t);
    if (usd === null) { sinConvertir++; continue; }
    const mes = String(t.fecha).slice(0, 7);
    const signo = t.tipo === 'COMPRA' ? 1 : -1;
    aportePorMes.set(mes, (aportePorMes.get(mes) ?? 0) + signo * usd);
  }

  // Acumulado hasta cada snapshot. Se recorre en orden y se suma todo lo que
  // ocurrio hasta ese mes inclusive, incluidos los meses sin snapshot: una
  // compra en un mes que no se sincronizo igual es plata que pusiste.
  const mesesConAporte = [...aportePorMes.keys()].sort();
  let acumulado = 0;
  let i = 0;

  const puntos: PuntoHistorial[] = meses.map(s => {
    while (i < mesesConAporte.length && mesesConAporte[i] <= s.periodo) {
      acumulado += aportePorMes.get(mesesConAporte[i]) ?? 0;
      i++;
    }

    const aportadoUsd = acumulado;
    const resultadoUsd = s.valorUsd === null ? null : s.valorUsd - aportadoUsd;

    return {
      periodo: s.periodo,
      valorUsd: s.valorUsd,
      aportadoUsd,
      resultadoUsd,
      // Sin aporte no hay contra que medir un porcentaje: dividir por cero
      // daria Infinity y la pantalla mostraria un numero absurdo.
      retornoPct: resultadoUsd === null || aportadoUsd <= 0
        ? null
        : (resultadoUsd / aportadoUsd) * 100,
    };
  });

  return { puntos, operacionesSinConvertir: sinConvertir };
}

export type Variacion = {
  desde: string;
  hasta: string;
  valorInicialUsd: number;
  valorFinalUsd: number;
  /** Cuanto cambio el valor total, aportes incluidos. */
  cambioUsd: number;
  /** Cuanto de ese cambio fue plata nueva. */
  aportadoUsd: number;
  /** Y cuanto fue el mercado. Es el numero que dice si invertiste bien. */
  rendimientoUsd: number;
};

/**
 * De punta a punta: cuanto cambio, cuanto pusiste, y cuanto rindio.
 *
 * `rendimiento = cambio − aportes` es una aproximacion: trata todos los aportes
 * como si hubieran entrado al principio del tramo. Para saber el retorno exacto
 * habria que ponderar cada aporte por el tiempo que estuvo invertido. Sirve
 * para responder "¿subio porque puse plata o porque rindio?", que es la
 * pregunta real, no para comparar contra un indice.
 */
export function variacion(puntos: PuntoHistorial[]): Variacion | null {
  const conValor = puntos.filter(p => p.valorUsd !== null);
  if (conValor.length < 2) return null;

  const a = conValor[0];
  const b = conValor[conValor.length - 1];
  const cambioUsd = (b.valorUsd as number) - (a.valorUsd as number);
  const aportadoUsd = b.aportadoUsd - a.aportadoUsd;

  return {
    desde: a.periodo, hasta: b.periodo,
    valorInicialUsd: a.valorUsd as number,
    valorFinalUsd: b.valorUsd as number,
    cambioUsd, aportadoUsd,
    rendimientoUsd: cambioUsd - aportadoUsd,
  };
}
