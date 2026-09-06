import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings } from '@/db/schema';

/**
 * Las categorias de gasto, por usuario.
 *
 * Estaban fijas en el codigo, en español rioplatense y con los rubros de una
 * persona concreta. Eso alcanza para un usuario y bloquea al segundo: alguien
 * con mascotas, con hijos o con un monotributo necesita las suyas.
 *
 * Viven en `settings` y no en una tabla propia porque una categoria no tiene
 * mas atributos que su nombre, y porque los gastos ya guardan la categoria como
 * texto: renombrarla no rompe nada, solo deja de agrupar lo viejo con lo nuevo.
 * Una tabla con FK obligaria a migrar filas para renombrar.
 */

export const CLAVE = 'categorias';

/** Con las que arranca una cuenta nueva. Un punto de partida, no una ley. */
export const CATEGORIAS_INICIALES = [
  'Suscripciones', 'Servicios', 'Salud y deporte', 'Supermercado y comida',
  'Compras y hogar', 'Cuotas', 'Comisiones bancarias', 'Impuestos y percepciones',
  'Alquiler', 'Transporte', 'Educacion', 'Otros',
] as const;

/**
 * "Otros" no se puede borrar: es donde cae lo que el modelo no supo clasificar.
 * Sin ella, un gasto mal interpretado no tendria donde ir.
 */
export const COMODIN = 'Otros';

const MAX = 40;
const LARGO_MAX = 40;

/** Limpia una lista venida de afuera: del usuario o de una fila vieja. */
export function normalizar(crudas: unknown): string[] {
  const lista = Array.isArray(crudas) ? crudas : [];
  const vistas = new Set<string>();
  const salida: string[] = [];

  for (const c of lista) {
    if (typeof c !== 'string') continue;
    const n = c.trim().replace(/\s+/g, ' ').slice(0, LARGO_MAX);
    if (!n) continue;
    // Sin distinguir mayusculas: "Comida" y "comida" serian dos columnas del
    // mismo gasto en todos los graficos.
    const clave = n.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(n);
    if (salida.length >= MAX) break;
  }

  if (!salida.some(c => c.toLowerCase() === COMODIN.toLowerCase())) salida.push(COMODIN);
  return salida;
}

export async function leerCategorias(usuarioId: string): Promise<string[]> {
  const [fila] = await db.select({ valor: settings.valor }).from(settings)
    .where(and(eq(settings.usuarioId, usuarioId), eq(settings.clave, CLAVE)));

  const guardadas = normalizar(fila?.valor);
  // Una cuenta nueva no tiene fila: arranca con las iniciales en vez de con
  // solo "Otros", que dejaria todo sin clasificar.
  return guardadas.length > 1 ? guardadas : [...CATEGORIAS_INICIALES];
}

export async function guardarCategorias(usuarioId: string, crudas: unknown): Promise<string[]> {
  const limpias = normalizar(crudas);
  if (limpias.length < 2) {
    throw new Error('Dejá al menos una categoría además de «Otros».');
  }

  await db.insert(settings)
    .values({ usuarioId, clave: CLAVE, valor: limpias })
    .onConflictDoUpdate({
      target: [settings.usuarioId, settings.clave],
      set: { valor: limpias, updatedAt: new Date() },
    });

  return limpias;
}

/**
 * Encaja lo que devolvio el modelo contra las categorias del usuario.
 *
 * El modelo puede inventar una categoria o escribirla distinto. Se compara sin
 * mayusculas y sin acentos, porque "Educacion" y "Educación" son la misma y
 * mandarlas separadas partiria el gasto en dos columnas del grafico.
 */
export function encajar(cruda: unknown, categorias: string[]): string {
  const plano = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const buscada = typeof cruda === 'string' ? plano(cruda) : '';
  if (!buscada) return COMODIN;

  return categorias.find(c => plano(c) === buscada) ?? COMODIN;
}
