import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usuarios } from '@/db/schema';

/**
 * Autenticacion del servidor MCP.
 *
 * No sirve la cookie de sesion: el cliente MCP es Claude Desktop o Claude Code,
 * que no pasan por el login del navegador. Va un token propio, por usuario.
 *
 * El formato es `<email>:<secreto>`. El email dice de quien son los datos y el
 * secreto se verifica contra `MCP_TOKEN`, que es unico de la instalacion. Con
 * un solo usuario alcanza; cuando haya varios, el secreto pasa a ser una
 * columna de `usuarios` y esto no cambia de forma.
 *
 * La comparacion es de tiempo constante: comparar secretos con === filtra
 * informacion sobre cuantos caracteres coinciden.
 */

export function tokenConfigurado(): boolean {
  return Boolean(process.env.MCP_TOKEN?.trim());
}

function igual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export type Autorizacion =
  | { ok: true; usuarioId: string; email: string }
  | { ok: false; motivo: string };

/** Resuelve el header Authorization a un usuario, o dice por que no. */
export async function autorizar(header: string | null): Promise<Autorizacion> {
  const esperado = process.env.MCP_TOKEN?.trim();
  if (!esperado) {
    return { ok: false, motivo: 'El servidor MCP no está habilitado: falta MCP_TOKEN en el entorno.' };
  }

  const crudo = (header ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!crudo) return { ok: false, motivo: 'Falta el token.' };

  const corte = crudo.lastIndexOf(':');
  if (corte < 1) return { ok: false, motivo: 'El token tiene que ser "email:secreto".' };

  const email = crudo.slice(0, corte).trim().toLowerCase();
  const secreto = crudo.slice(corte + 1);

  if (!igual(secreto, esperado)) return { ok: false, motivo: 'Token inválido.' };

  const u = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, email), columns: { id: true, email: true },
  });
  // Un secreto valido con un email que no existe no crea nada: el alta de
  // usuarios pasa por el login, no por acá.
  if (!u) return { ok: false, motivo: 'Ese email no tiene cuenta en la app.' };

  return { ok: true, usuarioId: u.id, email: u.email };
}
