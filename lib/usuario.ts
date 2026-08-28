import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { usuarios } from '@/db/schema';
import { auth, ssoConfigurado } from '@/auth';

/**
 * Quien esta mirando.
 *
 * Todo dato de la app tiene dueño, y toda consulta se scopea por el. La regla
 * que lo hace dificil de romper esta en el esquema, no acá: `usuarioId` es
 * `notNull` en las doce tablas con dueño, asi que un insert que se olvide del
 * usuario no compila. Para las lecturas queda la disciplina de pasar el id, que
 * el tipo de cada funcion exige.
 *
 * Las tablas hijas —consumos, positions, devoluciones— NO tienen la columna a
 * proposito: se scopean por su padre. Una copia del dueño en la hija puede
 * quedar desincronizada y apuntar a otra persona; el padre no.
 */

export type Usuario = { id: string; email: string; nombre: string | null };

/** Email de la sesion, o null con Basic Auth (que no sabe quien sos). */
async function emailDeLaSesion(): Promise<string | null> {
  if (!ssoConfigurado) return null;
  const sesion = await auth();
  return sesion?.user?.email ?? null;
}

/**
 * El usuario del request, creandolo la primera vez que entra.
 *
 * Crear al vuelo es seguro porque el middleware ya filtro: solo llega acá un
 * email que esta en AUTH_EMAILS. Sin esa lista no entraria nadie, asi que esto
 * no es una puerta de registro abierta.
 */
export async function usuarioActual(): Promise<Usuario | null> {
  const email = await emailDeLaSesion();

  if (!email) {
    // Modo de un solo usuario (Basic Auth): el mas viejo es el dueño de todo.
    // No hay a quien mas devolver, y devolver null dejaria la app sin datos.
    const [primero] = await db.select({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre })
      .from(usuarios).orderBy(usuarios.createdAt).limit(1);
    return primero ?? null;
  }

  const normalizado = email.trim().toLowerCase();
  const existente = await db.query.usuarios.findFirst({
    where: eq(usuarios.email, normalizado),
    columns: { id: true, email: true, nombre: true },
  });
  if (existente) return existente;

  const sesion = await auth();
  const [nuevo] = await db.insert(usuarios)
    .values({ email: normalizado, nombre: sesion?.user?.name ?? null })
    // Dos pestañas abriendo la app a la vez llegarian las dos acá.
    .onConflictDoNothing({ target: usuarios.email })
    .returning({ id: usuarios.id, email: usuarios.email, nombre: usuarios.nombre });

  if (nuevo) return nuevo;

  return (await db.query.usuarios.findFirst({
    where: eq(usuarios.email, normalizado),
    columns: { id: true, email: true, nombre: true },
  })) ?? null;
}

export class SinUsuario extends Error {
  constructor() {
    super('No hay ningun usuario para este request. Corré la migración de usuarios y revisá que el login esté configurado.');
    this.name = 'SinUsuario';
  }
}

/**
 * El id del usuario, o error. Es el que usan las pantallas y las rutas: si no
 * se sabe de quien son los datos, es mejor fallar que mostrar los de otro.
 */
export async function idUsuarioActual(): Promise<string> {
  const u = await usuarioActual();
  if (!u) throw new SinUsuario();
  return u.id;
}

/**
 * El dueño de la instalacion: el usuario mas viejo.
 *
 * Lo usa lo que corre **sin sesion**, hoy solo el cron de Drive. No es un
 * atajo para saltear el scoping: es que las carpetas de Drive se configuran con
 * variables de entorno globales (`DRIVE_FOLDER_TARJETAS`), asi que esa
 * integracion pertenece a una sola persona. Sincronizarla para todos los
 * usuarios les meteria a todos los mismos resumenes, que es peor que no correr.
 *
 * Cuando las carpetas pasen a ser por usuario, el cron tiene que iterar
 * usuarios y esta funcion desaparece.
 */
export async function idUsuarioDeLaInstalacion(): Promise<string> {
  const [primero] = await db.select({ id: usuarios.id }).from(usuarios)
    .orderBy(usuarios.createdAt).limit(1);
  if (!primero) throw new SinUsuario();
  return primero.id;
}
