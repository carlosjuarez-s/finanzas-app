/**
 * El sueldo cargado a mano.
 *
 * Hasta acá el neto solo entraba por el recibo: el clasificador leía el PDF y
 * escribía `netoArs`. Eso deja afuera a cualquiera cuyo sueldo no viva entero
 * en un recibo argentino —la parte en dólares se cobra por fuera, o el recibo
 * no la discrimina— y sin el neto no hay cierre, no hay tasa de ahorro y no
 * hay estimación del mes que viene. La carga manual existe para eso.
 *
 * Un sueldo cargado a mano **no compite** con el del recibo: es el mismo dato
 * en la misma fila (un período, un neto) y el manual gana, porque lo escribió
 * una persona mirando su banco y el otro lo dedujo un modelo mirando un PDF.
 */

import { consolidar, reparto, type Consolidado } from './bimoneda';
import { periodoValido } from './formato';

export type Sueldo = { periodo: string; netoArs: number; netoUsd: number };

/** Lo que vuelve de validar: o el sueldo listo para guardar, o por qué no. */
export type Validacion = { ok: true; sueldo: Sueldo } | { ok: false; error: string };

const neto = (v: unknown): number | null => {
  // Un campo vacío es cero, no un error: cobrar todo en pesos es tener cero
  // dólares, y obligar a escribir "0" sería pedir ceremonia por nada.
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Valida lo que llega del formulario. Devuelve el motivo en castellano porque
 * ese texto se le muestra a la persona tal cual, no se traduce después.
 */
export function validar(body: unknown): Validacion {
  const b = (body ?? {}) as Record<string, unknown>;

  if (!periodoValido(b.periodo)) {
    return { ok: false, error: 'El período tiene que ser un mes real, con la forma 2026-09.' };
  }
  const ars = neto(b.netoArs);
  if (ars === null) return { ok: false, error: 'El neto en pesos tiene que ser un número mayor o igual a cero.' };

  const usd = neto(b.netoUsd);
  if (usd === null) return { ok: false, error: 'El neto en dólares tiene que ser un número mayor o igual a cero.' };

  // Un sueldo de cero en las dos monedas no es un sueldo: es borrar el ingreso
  // del mes sin decirlo. Si lo que se quiere es sacarlo, hay que pedirlo.
  if (ars === 0 && usd === 0) {
    return { ok: false, error: 'Cargá al menos una de las dos partes: un sueldo de cero en las dos monedas no es un sueldo.' };
  }

  return { ok: true, sueldo: { periodo: b.periodo, netoArs: ars, netoUsd: usd } };
}

export type Mezcla = {
  total: Consolidado;
  // Cuánto del sueldo viene en cada moneda, medido en pesos. Null cuando falta
  // el tipo de cambio: sin él, "70% en dólares" sería un número inventado.
  pctArs: number | null;
  pctUsd: number | null;
};

/** Cómo queda partido el sueldo entre las dos monedas, para mostrarlo. */
export function mezcla(s: Sueldo, tipoCambio: number | null): Mezcla {
  const total = consolidar({ ars: s.netoArs, usd: s.netoUsd }, tipoCambio);
  const r = reparto(total);
  return { total, pctArs: r?.pctArs ?? null, pctUsd: r?.pctUsd ?? null };
}
