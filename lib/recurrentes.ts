/**
 * Gastos fijos: lo que se paga todos los meses (o cada dos, o cada seis).
 *
 * Antes la estimacion los **adivinaba**: miraba el historico y llamaba
 * "recurrente" a la categoria que aparecia en la mitad de los meses. Eso
 * funciona hasta que hace falta acertar, y falla justo donde mas importa:
 *
 * - No sabe **cuando aumenta**. Un alquiler argentino sube por contrato cada
 *   seis meses, y la mediana de los ultimos seis meses es el precio VIEJO.
 * - No sabe **cada cuanto cae**. Un seguro semestral aparece en dos meses de
 *   doce y queda clasificado como gasto variable.
 * - No sabe **cuando termina**. Un gimnasio dado de baja sigue apareciendo en
 *   la estimacion hasta que sale del promedio, meses despues.
 *
 * Declarado, esas tres cosas son datos y no inferencias. Lo que sigue sin
 * declararse se sigue estimando como antes: esto no reemplaza al historico, le
 * saca de encima lo que si se sabe.
 */

import { PERIODO } from './formato';
import type { Bimoneda } from './bimoneda';

export type Recurrente = {
  id: string;
  concepto: string;
  categoria: string;
  montoArs: number;
  montoUsd: number;
  /** 1 mensual, 2 bimestral, 3 trimestral, 6 semestral, 12 anual. */
  cadaMeses: number;
  primerPeriodo: string;          // YYYY-MM
  hastaPeriodo: string | null;    // YYYY-MM inclusive, o null si sigue
  /** Aumento por ajuste, en porciento. Null si no aumenta. */
  aumentoPct: number | null;
  /** Cada cuantos meses se aplica ese aumento. */
  aumentoCadaMeses: number | null;
  /** Nombre del indice al que esta atado, si en vez de un % fijo sigue uno. */
  indice: string | null;
};

/** Un indice: la variacion mensual, en porciento, por periodo. */
export type Indice = Record<string, number>;

export const meses = (desde: string, hasta: string): number => {
  const [ya, ma] = desde.split('-').map(Number);
  const [yb, mb] = hasta.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
};

/**
 * Si este gasto cae en ese mes.
 *
 * Cae en `primerPeriodo` y despues cada `cadaMeses`. Un bimestral que arranca
 * en enero cae en enero, marzo, mayo — no en "los meses pares", que seria otra
 * cosa y es el error facil.
 */
export function caeEn(r: Recurrente, periodo: string): boolean {
  if (!PERIODO.test(periodo) || !PERIODO.test(r.primerPeriodo)) return false;
  const d = meses(r.primerPeriodo, periodo);
  if (d < 0) return false;
  if (r.hastaPeriodo && meses(r.hastaPeriodo, periodo) > 0) return false;
  const cada = Math.max(1, Math.trunc(r.cadaMeses));
  return d % cada === 0;
}

/**
 * Cuantos ajustes se aplicaron hasta ese mes.
 *
 * El primer ajuste cae `aumentoCadaMeses` DESPUES del primer periodo, no en el
 * primero: el mes en que empezas a pagar algo pagas el precio de entrada.
 */
export function ajustes(r: Recurrente, periodo: string): number {
  const cada = r.aumentoCadaMeses;
  if (!cada || cada < 1) return 0;
  const d = meses(r.primerPeriodo, periodo);
  return d < 0 ? 0 : Math.floor(d / cada);
}

/** El factor acumulado de un % fijo aplicado n veces. */
const compuesto = (pct: number, n: number) => Math.pow(1 + pct / 100, n);

export type MontoEnMes = {
  monto: Bimoneda;
  /** Cuantos aumentos se le aplicaron para llegar a ese numero. */
  ajustes: number;
  /** True si esta atado a un indice y falto algun dato para calcularlo. */
  faltaIndice: boolean;
};

/**
 * Cuanto vale este gasto en ese mes, con los aumentos ya aplicados.
 *
 * Con un indice, cada ajuste vale lo que acumulo el indice en su ventana. Si
 * falta la variacion de algun mes **no se inventa**: se devuelve lo que se pudo
 * calcular y se avisa. Un alquiler estimado con un IPC a medias es peor que uno
 * sin ajustar, porque el error no se ve.
 */
export function montoEn(r: Recurrente, periodo: string, indice?: Indice): MontoEnMes {
  const n = ajustes(r, periodo);
  if (n === 0) return { monto: { ars: r.montoArs, usd: r.montoUsd }, ajustes: 0, faltaIndice: false };

  if (r.indice) {
    const tabla = indice ?? {};
    const cada = Math.max(1, Math.trunc(r.aumentoCadaMeses ?? 1));
    let factor = 1;
    let falta = false;
    // Se compone mes a mes desde el primer periodo hasta el ultimo ajuste: el
    // aumento de un indice es la variacion acumulada de su ventana.
    for (let i = 0; i < n * cada; i++) {
      const [y, m] = r.primerPeriodo.split('-').map(Number);
      const total = y * 12 + (m - 1) + i;
      const mes = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
      const v = tabla[mes];
      if (typeof v !== 'number' || !Number.isFinite(v)) { falta = true; continue; }
      factor *= 1 + v / 100;
    }
    return {
      monto: { ars: r.montoArs * factor, usd: r.montoUsd * factor },
      ajustes: n,
      faltaIndice: falta,
    };
  }

  const f = compuesto(r.aumentoPct ?? 0, n);
  return { monto: { ars: r.montoArs * f, usd: r.montoUsd * f }, ajustes: n, faltaIndice: false };
}

/** El mes del proximo ajuste, para poder avisarlo antes de que llegue. */
export function proximoAjuste(r: Recurrente, desde: string): string | null {
  const cada = r.aumentoCadaMeses;
  if (!cada || cada < 1 || (!r.aumentoPct && !r.indice)) return null;
  const siguiente = (ajustes(r, desde) + 1) * cada;
  const [y, m] = r.primerPeriodo.split('-').map(Number);
  const total = y * 12 + (m - 1) + siguiente;
  const periodo = `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
  if (r.hastaPeriodo && meses(r.hastaPeriodo, periodo) > 0) return null;
  return periodo;
}

export type TotalDelMes = { monto: Bimoneda; porCategoria: Record<string, number>; faltaIndice: string[] };

/** Todo lo fijo que cae en ese mes, con sus aumentos. */
export function totalDelMes(rs: Recurrente[], periodo: string, indices: Record<string, Indice> = {}): TotalDelMes {
  const monto: Bimoneda = { ars: 0, usd: 0 };
  const porCategoria: Record<string, number> = {};
  const faltaIndice: string[] = [];

  for (const r of rs) {
    if (!caeEn(r, periodo)) continue;
    const m = montoEn(r, periodo, r.indice ? indices[r.indice] : undefined);
    monto.ars += m.monto.ars;
    monto.usd += m.monto.usd;
    porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + m.monto.ars;
    if (m.faltaIndice) faltaIndice.push(r.concepto);
  }
  return { monto, porCategoria, faltaIndice };
}

// --- Base y validacion -------------------------------------------------------

import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurrentes as tabla, settings } from '@/db/schema';

export const CLAVE_INDICES = 'indices';

export type Validacion = { ok: true; valor: Omit<Recurrente, 'id'> } | { ok: false; error: string };

const positivo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const entero = (v: unknown, min: number, max: number): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export function validar(body: unknown): Validacion {
  const b = (body ?? {}) as Record<string, unknown>;

  const concepto = String(b.concepto ?? '').trim();
  if (!concepto) return { ok: false, error: 'Poné qué es: «alquiler», «seguro del auto».' };
  if (!PERIODO.test(String(b.primerPeriodo ?? ''))) {
    return { ok: false, error: 'El primer mes tiene que tener la forma 2026-09.' };
  }
  const hasta = String(b.hastaPeriodo ?? '').trim() || null;
  if (hasta && !PERIODO.test(hasta)) {
    return { ok: false, error: 'El último mes tiene que tener la forma 2026-09, o quedar vacío.' };
  }
  if (hasta && meses(String(b.primerPeriodo), hasta) < 0) {
    return { ok: false, error: 'El último mes no puede ser anterior al primero.' };
  }

  const ars = positivo(b.montoArs);
  const usd = positivo(b.montoUsd);
  if (ars === null || usd === null) return { ok: false, error: 'El monto tiene que ser un número mayor o igual a cero.' };
  if (ars === 0 && usd === 0) return { ok: false, error: 'Poné el monto en pesos, en dólares, o en las dos.' };

  const cada = entero(b.cadaMeses ?? 1, 1, 60);
  if (cada === null) return { ok: false, error: 'La periodicidad tiene que ser entre 1 y 60 meses.' };

  // El aumento es opcional, pero a medias no sirve: un porcentaje sin cada
  // cuanto se aplica no se puede calcular, y al reves tampoco.
  const indice = String(b.indice ?? '').trim() || null;
  const pctCrudo = b.aumentoPct === '' || b.aumentoPct === null || b.aumentoPct === undefined ? null : Number(b.aumentoPct);
  const aumentoCada = b.aumentoCadaMeses === '' || b.aumentoCadaMeses === null || b.aumentoCadaMeses === undefined
    ? null : entero(b.aumentoCadaMeses, 1, 60);

  if (pctCrudo !== null && (!Number.isFinite(pctCrudo) || pctCrudo <= -100)) {
    return { ok: false, error: 'El aumento tiene que ser un porcentaje. Puede ser negativo, pero no menos de −100%.' };
  }
  if ((pctCrudo !== null || indice) && aumentoCada === null) {
    return { ok: false, error: 'Falta cada cuántos meses se aplica el aumento.' };
  }
  if (aumentoCada !== null && pctCrudo === null && !indice) {
    return { ok: false, error: 'Pusiste cada cuánto ajusta pero no cuánto: falta el porcentaje o el índice.' };
  }
  if (pctCrudo !== null && indice) {
    return { ok: false, error: 'O un porcentaje fijo o un índice, no los dos: si no, no se sabe cuál manda.' };
  }

  return {
    ok: true,
    valor: {
      concepto,
      categoria: String(b.categoria ?? 'Otros').trim() || 'Otros',
      montoArs: ars, montoUsd: usd,
      cadaMeses: cada,
      primerPeriodo: String(b.primerPeriodo),
      hastaPeriodo: hasta,
      aumentoPct: pctCrudo,
      aumentoCadaMeses: aumentoCada,
      indice,
    },
  };
}

export async function listar(usuarioId: string): Promise<Recurrente[]> {
  const filas = await db.select().from(tabla).where(eq(tabla.usuarioId, usuarioId));
  return filas.map(f => ({
    id: f.id, concepto: f.concepto, categoria: f.categoria,
    montoArs: Number(f.montoArs), montoUsd: Number(f.montoUsd),
    cadaMeses: Number(f.cadaMeses),
    primerPeriodo: f.primerPeriodo, hastaPeriodo: f.hastaPeriodo,
    aumentoPct: f.aumentoPct === null ? null : Number(f.aumentoPct),
    aumentoCadaMeses: f.aumentoCadaMeses === null ? null : Number(f.aumentoCadaMeses),
    indice: f.indice,
  }));
}

export async function crear(usuarioId: string, v: Omit<Recurrente, 'id'>) {
  await db.insert(tabla).values({
    usuarioId, concepto: v.concepto, categoria: v.categoria,
    montoArs: String(v.montoArs), montoUsd: String(v.montoUsd),
    cadaMeses: String(v.cadaMeses),
    primerPeriodo: v.primerPeriodo, hastaPeriodo: v.hastaPeriodo,
    aumentoPct: v.aumentoPct === null ? null : String(v.aumentoPct),
    aumentoCadaMeses: v.aumentoCadaMeses === null ? null : String(v.aumentoCadaMeses),
    indice: v.indice,
  });
}

/** Borra solo lo tuyo: un id no autoriza nada por si solo. */
export async function borrar(usuarioId: string, id: string): Promise<boolean> {
  const filas = await db.delete(tabla)
    .where(and(eq(tabla.usuarioId, usuarioId), eq(tabla.id, id)))
    .returning({ id: tabla.id });
  return filas.length > 0;
}

/** Los indices que cargo la persona. La app no los sale a buscar a ningun lado. */
export async function leerIndices(usuarioId: string): Promise<Record<string, Indice>> {
  const [fila] = await db.select({ valor: settings.valor }).from(settings)
    .where(and(eq(settings.usuarioId, usuarioId), eq(settings.clave, CLAVE_INDICES)));
  const v = fila?.valor;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Indice>) : {};
}

export async function guardarIndices(usuarioId: string, valor: Record<string, Indice>) {
  await db.insert(settings).values({ usuarioId, clave: CLAVE_INDICES, valor })
    .onConflictDoUpdate({ target: [settings.usuarioId, settings.clave], set: { valor } });
}

/**
 * Lee un indice escrito a mano: una linea por mes, "2026-01: 2,4".
 *
 * Se acepta coma decimal porque es como se escribe un porcentaje acá, y se
 * ignora una linea vacia. Lo que no se entiende se devuelve como error con el
 * numero de linea: descartarlo en silencio dejaria un indice incompleto que
 * despues ajusta de menos sin que nadie lo note.
 */
export function parsearIndice(texto: string): { ok: true; indice: Indice } | { ok: false; error: string } {
  const indice: Indice = {};
  const lineas = texto.split('\n');
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i].trim();
    if (!l) continue;
    const m = /^(\d{4}-\d{2})\s*[:=]?\s*(-?[\d.,]+)\s*%?$/.exec(l);
    if (!m || !PERIODO.test(m[1])) {
      return { ok: false, error: `La línea ${i + 1} no se entiende: «${l}». Va «2026-01: 2,4».` };
    }
    const n = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(n)) return { ok: false, error: `La línea ${i + 1} no tiene un número válido.` };
    indice[m[1]] = n;
  }
  return { ok: true, indice };
}

/**
 * Convierte un gasto ya cargado en un gasto fijo.
 *
 * El camino largo era volver a escribir todo —concepto, categoria, monto— en
 * un formulario aparte, teniendo la fila delante. Esto lo hace de un toque, con
 * los valores por defecto mas comunes: mensual, desde ese mes, sin aumento. El
 * aumento se agrega despues, porque es lo unico que la fila no sabe.
 */
export function desdeUnGasto(g: { concepto: string; categoria: string; montoArs: number; montoUsd: number }, periodo: string): Omit<Recurrente, 'id'> {
  return {
    concepto: g.concepto.trim() || 'Gasto fijo',
    categoria: g.categoria || 'Otros',
    montoArs: g.montoArs,
    montoUsd: g.montoUsd,
    cadaMeses: 1,
    primerPeriodo: periodo,
    hastaPeriodo: null,
    aumentoPct: null,
    aumentoCadaMeses: null,
    indice: null,
  };
}

/**
 * Si ya hay un fijo con ese concepto.
 *
 * Sin esto, tocar el boton dos veces —o tocarlo en enero y otra vez en
 * febrero sobre el mismo alquiler— dejaba dos fijos iguales sumando doble en
 * cada estimacion, y nadie lo iba a notar mirando la estimacion.
 */
export function yaEsFijo(fijos: { concepto: string }[], concepto: string): boolean {
  const n = sinAcentos(concepto);
  return fijos.some(f => sinAcentos(f.concepto) === n);
}

const sinAcentos = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
