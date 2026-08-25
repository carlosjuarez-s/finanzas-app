// Las migraciones se aplican a mano en el SQL Editor de Neon, asi que "falta
// correr la migracion" es un estado real y previsible de esta app. Sin esto,
// Next lo convierte en "Application error" con un digest que no dice nada y
// obliga a ir a buscar los logs del servidor.

const CODIGO_TABLA_INEXISTENTE = '42P01';

type ErrorPg = { code?: string; message?: string; cause?: unknown };

export function tablaFaltante(e: unknown): string | null {
  const err = e as ErrorPg;
  const causa = err?.cause as ErrorPg | undefined;
  const codigo = err?.code ?? causa?.code;
  if (codigo !== CODIGO_TABLA_INEXISTENTE) return null;

  // Los dos mensajes, no el primero que no este vacio: Neon pone "Failed query:
  // select ..." afuera y el "relation ... does not exist" en la causa, asi que
  // quedarse con el de afuera pierde el nombre de la tabla.
  const mensaje = `${err?.message ?? ''} ${causa?.message ?? ''}`;
  return /relation "([^"]+)" does not exist/.exec(mensaje)?.[1] ?? 'una tabla nueva';
}

// Mensaje para mostrarle a la persona, no el stack crudo.
export function mensajeDeError(e: unknown): string {
  const tabla = tablaFaltante(e);
  if (tabla) {
    return `Falta la tabla "${tabla}" en la base: corré la migración pendiente en el SQL Editor de Neon.`;
  }
  return e instanceof Error ? e.message : String(e);
}
