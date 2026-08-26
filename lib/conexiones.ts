import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conexiones } from '@/db/schema';
import { createId } from '@/db/id';
import { cifrar, descifrar, recifrar, pista, versionActual, type Cifrado } from './boveda';
import { errorCensurado } from './secretos';
import { PLATAFORMAS, type PlataformaId } from './plataformas';

// Acceso a las conexiones guardadas. Todo lo que sale de acá hacia una pagina o
// una respuesta HTTP pasa por `ConexionVisible`, que NO tiene el secreto: la
// unica forma de obtenerlo es pedirlo explicitamente con leerCredencial().

export type ConexionVisible = {
  id: string;
  plataforma: PlataformaId;
  nombrePlataforma: string;
  etiqueta: string;
  pista: string;
  estado: string;
  lecturaGarantizadaPorLaPlataforma: boolean;
  ultimoSync: Date | null;
  ultimoError: string | null;
  createdAt: Date;
};

const CONTEXTO = (id: string) => `conexion:${id}`;

export async function listarConexiones(): Promise<ConexionVisible[]> {
  // Se seleccionan las columnas de a una a proposito: un select() completo
  // arrastraria el secreto cifrado a cualquier lugar que muestre esta lista.
  const filas = await db.select({
    id: conexiones.id,
    plataforma: conexiones.plataforma,
    etiqueta: conexiones.etiqueta,
    pista: conexiones.pista,
    estado: conexiones.estado,
    ultimoSync: conexiones.ultimoSync,
    ultimoError: conexiones.ultimoError,
    createdAt: conexiones.createdAt,
  }).from(conexiones);

  return filas.map(f => {
    const p = PLATAFORMAS[f.plataforma as PlataformaId];
    return {
      ...f,
      plataforma: f.plataforma as PlataformaId,
      nombrePlataforma: p?.nombre ?? f.plataforma,
      lecturaGarantizadaPorLaPlataforma: p?.lecturaGarantizadaPorLaPlataforma ?? false,
    };
  });
}

export async function crearConexion(
  plataforma: PlataformaId, etiqueta: string, credencial: Record<string, string>,
): Promise<ConexionVisible> {
  const def = PLATAFORMAS[plataforma];
  if (!def) throw new Error(`Plataforma desconocida: ${plataforma}`);

  for (const campo of def.campos) {
    if (!credencial[campo.nombre]?.trim()) {
      throw new Error(`Falta ${campo.etiqueta}.`);
    }
  }

  // El id se genera antes de insertar porque es el contexto del cifrado: el
  // secreto queda atado a esta fila y no abre en ninguna otra.
  const id = createId();
  const [fila] = await db.insert(conexiones).values({
    id,
    plataforma,
    etiqueta: etiqueta.trim() || def.nombre,
    secreto: cifrar(credencial, CONTEXTO(id)),
    pista: pista(credencial[def.campoPista] ?? ''),
    estado: 'ACTIVA',
  }).returning();

  return {
    id: fila.id,
    plataforma,
    nombrePlataforma: def.nombre,
    etiqueta: fila.etiqueta,
    pista: fila.pista,
    estado: fila.estado,
    lecturaGarantizadaPorLaPlataforma: def.lecturaGarantizadaPorLaPlataforma,
    ultimoSync: fila.ultimoSync,
    ultimoError: fila.ultimoError,
    createdAt: fila.createdAt,
  };
}

/**
 * Descifra la credencial. Solo debe llamarse desde el codigo que hace el pedido
 * a la plataforma, y el resultado nunca debe salir en una respuesta HTTP.
 */
export async function leerCredencial<T = Record<string, string>>(id: string): Promise<T> {
  const [fila] = await db.select({ secreto: conexiones.secreto })
    .from(conexiones).where(eq(conexiones.id, id));
  if (!fila) throw new Error('No se encontro esa conexion.');
  return descifrar<T>(fila.secreto as Cifrado, CONTEXTO(id));
}

export async function borrarConexion(id: string): Promise<void> {
  await db.delete(conexiones).where(eq(conexiones.id, id));
}

/** Registra un fallo, censurando la credencial si vino en el texto del error. */
export async function marcarError(id: string, e: unknown, secretos: string[] = []): Promise<void> {
  await db.update(conexiones)
    .set({ estado: 'ERROR', ultimoError: errorCensurado(e, secretos).slice(0, 500) })
    .where(eq(conexiones.id, id));
}

export async function marcarSync(id: string): Promise<void> {
  await db.update(conexiones)
    .set({ estado: 'ACTIVA', ultimoSync: new Date(), ultimoError: null })
    .where(eq(conexiones.id, id));
}

/**
 * Vuelve a cifrar con la clave vigente las conexiones que quedaron con una
 * version anterior. Se corre despues de rotar BOVEDA_CLAVE_ACTUAL; hasta que
 * termine, las viejas se siguen leyendo con su clave original.
 */
export async function rotarCifrado(): Promise<{ migradas: number; total: number }> {
  const filas = await db.select({ id: conexiones.id, secreto: conexiones.secreto }).from(conexiones);
  const actual = versionActual();
  let migradas = 0;

  for (const f of filas) {
    const c = f.secreto as Cifrado;
    if (c.v === actual) continue;
    await db.update(conexiones)
      .set({ secreto: recifrar(c, CONTEXTO(f.id)) })
      .where(eq(conexiones.id, f.id));
    migradas++;
  }
  return { migradas, total: filas.length };
}
