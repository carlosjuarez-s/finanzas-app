/**
 * La anualidad, resuelta al reves.
 *
 * `proyectar()` responde "si aporto tanto por mes, cuanto tengo en N meses".
 * Esto responde las dos preguntas que uno se hace de verdad frente a una meta:
 *
 *   ¿Cuanto tengo que aportar por mes para llegar?
 *   Con lo que puedo aportar hoy, ¿cuanto tardo?
 *
 * Es la misma formula despejada en dos direcciones, sobre el mismo modelo que
 * usa la proyeccion: **anualidad vencida**, el interes corre sobre el saldo
 * previo y el aporte del mes entra despues. Tiene que ser el mismo modelo o las
 * dos pantallas darian numeros distintos del mismo plan.
 *
 *   VF = P·(1+i)^n + A·[((1+i)^n − 1) / i]
 *
 * Lo que hace falta decir, y por eso hay tantos `null` acá: **con retorno real
 * negativo hay un techo**. Aportando A por mes a una tasa i < 0, el saldo no
 * crece para siempre: converge a A/|i| y ahi se queda, porque lo que pierde el
 * saldo iguala a lo que entra. Un objetivo arriba de ese techo **no se alcanza
 * nunca**, y eso no es un error de calculo: es el resultado. En pesos, con
 * −10% real anual, el techo llega antes de lo que uno cree.
 */

import { tasaMensual } from './proyeccion';

/** El techo de una anualidad con tasa negativa. Infinity si la tasa no lo tiene. */
export function techo(aporteMensual: number, tasaAnualPct: number): number {
  const i = tasaMensual(tasaAnualPct);
  if (i >= 0) return Infinity;
  return aporteMensual / -i;
}

/**
 * Cuanto hay que aportar por mes para llegar al objetivo en N meses.
 *
 * Null cuando no se puede: sin meses no hay plan, y si el saldo inicial ya
 * supera al objetivo la respuesta es cero, no un negativo.
 */
export function aporteNecesario(params: {
  objetivo: number;
  meses: number;
  tasaAnualPct: number;
  saldoInicial?: number;
}): number | null {
  const { objetivo, meses, tasaAnualPct, saldoInicial = 0 } = params;
  if (!Number.isFinite(objetivo) || objetivo <= 0) return null;
  if (!Number.isInteger(meses) || meses < 1) return null;

  const i = tasaMensual(tasaAnualPct);
  const crecido = saldoInicial * Math.pow(1 + i, meses);
  // Ya llegaste sin poner un peso mas: pedir un aporte negativo seria decir
  // "sacá plata", que no es lo que se pregunto.
  if (crecido >= objetivo) return 0;

  const falta = objetivo - crecido;
  if (i === 0) return falta / meses;

  const factor = (Math.pow(1 + i, meses) - 1) / i;
  return falta / factor;
}

export type Cuanto =
  | { ok: true; meses: number }
  | { ok: false; motivo: 'nunca'; techo: number }
  | { ok: false; motivo: 'sin-aporte' };

/**
 * Cuantos meses tarda en llegar, aportando eso.
 *
 * Devuelve el motivo cuando no llega, en vez de un null que no distingue "no
 * aportas nada" de "aportas pero no alcanza jamas". Son dos consejos
 * distintos.
 */
export function cuantoTarda(params: {
  objetivo: number;
  aporteMensual: number;
  tasaAnualPct: number;
  saldoInicial?: number;
}): Cuanto {
  const { objetivo, aporteMensual, tasaAnualPct, saldoInicial = 0 } = params;
  if (saldoInicial >= objetivo) return { ok: true, meses: 0 };

  const i = tasaMensual(tasaAnualPct);

  if (aporteMensual <= 0) {
    // Sin aporte, solo crece el saldo que ya hay, y solo si la tasa es positiva.
    if (i <= 0 || saldoInicial <= 0) return { ok: false, motivo: 'sin-aporte' };
    return { ok: true, meses: Math.ceil(Math.log(objetivo / saldoInicial) / Math.log(1 + i)) };
  }

  if (i === 0) return { ok: true, meses: Math.ceil((objetivo - saldoInicial) / aporteMensual) };

  // Con tasa negativa el saldo converge a un techo y no lo pasa nunca.
  if (i < 0) {
    const limite = techo(aporteMensual, tasaAnualPct);
    // El saldo inicial arriba del techo BAJA hacia el; abajo, sube hacia el.
    // En los dos casos, un objetivo mas alla del techo es inalcanzable.
    if (objetivo >= limite && saldoInicial < objetivo) {
      return { ok: false, motivo: 'nunca', techo: limite };
    }
  }

  // n = ln((VF·i + A) / (P·i + A)) / ln(1+i)
  const arriba = objetivo * i + aporteMensual;
  const abajo = saldoInicial * i + aporteMensual;
  if (arriba <= 0 || abajo <= 0) return { ok: false, motivo: 'nunca', techo: techo(aporteMensual, tasaAnualPct) };

  const n = Math.log(arriba / abajo) / Math.log(1 + i);
  if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: 'nunca', techo: techo(aporteMensual, tasaAnualPct) };
  return { ok: true, meses: Math.ceil(n) };
}

/** Cuanto del saldo lo pusiste vos y cuanto lo puso el interes. */
export function reparto(saldo: number, aportado: number): { rendimiento: number; pctRendimiento: number } {
  const rendimiento = saldo - aportado;
  return {
    rendimiento,
    pctRendimiento: saldo > 0 ? (rendimiento / saldo) * 100 : 0,
  };
}
