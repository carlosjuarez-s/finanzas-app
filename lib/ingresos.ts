/**
 * Plata que entra y no es sueldo.
 *
 * Tres tipos, y la distincion no es cosmetica:
 *
 * - **GANANCIA**: rindio una inversion. Es ingreso nuevo, plata que antes no
 *   existia.
 * - **REINTEGRO**: te devolvieron algo que vos pusiste. No es plata nueva: es
 *   la misma plata volviendo. Contarla como ganancia hace parecer que ganaste
 *   dos veces.
 * - **EXTRA**: cualquier otra entrada. El comodin.
 *
 * Los tres suman al ingreso del mes —de los tres podes vivir— pero se guardan
 * separados porque la pregunta "¿cuanto me rindieron las inversiones?" no se
 * puede responder si un reintegro de la tarjeta esta mezclado ahi adentro.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ingresos } from '@/db/schema';
import { periodoValido } from './formato';
import { consolidar, type Bimoneda } from './bimoneda';

export const TIPOS = ['GANANCIA', 'REINTEGRO', 'EXTRA'] as const;
export type Tipo = typeof TIPOS[number];

export const ETIQUETA: Record<Tipo, string> = {
  GANANCIA: 'Ganancia de una inversión',
  REINTEGRO: 'Me devolvieron plata',
  EXTRA: 'Otro ingreso',
};

export type Ingreso = {
  periodo: string;
  concepto: string;
  tipo: Tipo;
  montoArs: number;
  montoUsd: number;
  notas: string | null;
};

export type Validacion = { ok: true; ingreso: Ingreso } | { ok: false; error: string };

const positivo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Valida lo que llega del formulario.
 *
 * El monto va SIEMPRE en positivo. Un ingreso negativo no es un ingreso, es un
 * gasto, y aceptarlo dejaria la misma ambiguedad que hubo que descartar al
 * importar la planilla: una fila que dice "entro" con un numero que dice
 * "salio".
 */
export function validar(body: unknown): Validacion {
  const b = (body ?? {}) as Record<string, unknown>;

  if (!periodoValido(b.periodo)) {
    return { ok: false, error: 'El período tiene que ser un mes real, con la forma 2026-09.' };
  }
  const concepto = String(b.concepto ?? '').trim();
  if (!concepto) return { ok: false, error: 'Poné de qué es: «venta de USDT», «Naranja me devolvió».' };

  const tipo = TIPOS.includes(b.tipo as Tipo) ? (b.tipo as Tipo) : 'EXTRA';

  const ars = positivo(b.montoArs);
  if (ars === null) return { ok: false, error: 'El monto en pesos tiene que ser un número mayor o igual a cero.' };
  const usd = positivo(b.montoUsd);
  if (usd === null) return { ok: false, error: 'El monto en dólares tiene que ser un número mayor o igual a cero.' };
  if (ars === 0 && usd === 0) return { ok: false, error: 'Poné el monto en pesos, en dólares, o en las dos.' };

  const notas = String(b.notas ?? '').trim() || null;
  return { ok: true, ingreso: { periodo: b.periodo, concepto, tipo, montoArs: ars, montoUsd: usd, notas } };
}

/** Lo que suman al mes, separado por moneda. */
export function totalDelMes(items: { montoArs: number; montoUsd: number }[]): Bimoneda {
  return items.reduce(
    (s, i) => ({ ars: s.ars + i.montoArs, usd: s.usd + i.montoUsd }),
    { ars: 0, usd: 0 },
  );
}

/** Cuanto rindieron las inversiones, sin mezclar con lo que solo volvio. */
export function ganancias(items: { tipo: string; montoArs: number; montoUsd: number }[]): Bimoneda {
  return totalDelMes(items.filter(i => i.tipo === 'GANANCIA'));
}

/** El total en pesos, para mostrar. Null cuando hay dolares y no hay cambio. */
export function enPesos(items: { montoArs: number; montoUsd: number }[], tipoCambio: number | null) {
  return consolidar(totalDelMes(items), tipoCambio).totalArs;
}

// --- Base -------------------------------------------------------------------

export async function listar(usuarioId: string, periodo: string) {
  const filas = await db.select().from(ingresos)
    .where(and(eq(ingresos.usuarioId, usuarioId), eq(ingresos.periodo, periodo)));
  return filas.map(f => ({
    id: f.id, periodo: f.periodo, concepto: f.concepto, tipo: f.tipo as Tipo,
    montoArs: Number(f.montoArs), montoUsd: Number(f.montoUsd), notas: f.notas,
  }));
}

export async function crear(usuarioId: string, i: Ingreso) {
  await db.insert(ingresos).values({
    usuarioId, periodo: i.periodo, concepto: i.concepto, tipo: i.tipo,
    montoArs: String(i.montoArs), montoUsd: String(i.montoUsd), notas: i.notas,
    origen: 'MANUAL',
  });
}

/** Borra, pero solo si es tuyo: un id no alcanza para autorizar nada. */
export async function borrar(usuarioId: string, id: string): Promise<string | null> {
  const [fila] = await db.delete(ingresos)
    .where(and(eq(ingresos.usuarioId, usuarioId), eq(ingresos.id, id)))
    .returning({ periodo: ingresos.periodo });
  return fila?.periodo ?? null;
}
