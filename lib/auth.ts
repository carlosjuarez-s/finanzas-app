/**
 * Quien puede entrar.
 *
 * Auth.js no trae restriccion por email: con solo agregar el proveedor de
 * Google, cualquier persona con cuenta de Google entra. En una app con los
 * gastos, el sueldo y el portafolio de alguien eso es peor que la contraseña
 * compartida que reemplaza. La lista blanca va en el callback de signIn y se
 * revisa de nuevo en cada request, no solo al momento de loguearse.
 */

/** `AUTH_EMAILS` acepta separados por coma, espacio o salto de linea. */
export function listaDeEmails(crudo: string | undefined): string[] {
  return (crudo ?? '')
    .split(/[,\s]+/)
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Un email esta habilitado si figura textual en la lista. */
export function enLaLista(email: string | null | undefined, lista: string[]): boolean {
  // Lista vacia niega a todos. Falla cerrado a proposito: una variable de
  // entorno que no se seteo no puede terminar en "que entre cualquiera".
  if (!lista.length || !email) return false;
  return lista.includes(email.trim().toLowerCase());
}

/**
 * Ademas de estar en la lista, Google tiene que confirmar que la casilla
 * es de quien dice. Sin eso el email es un dato que el proveedor no valido.
 */
export function permitido(
  email: string | null | undefined,
  verificado: unknown,
  lista: string[],
): boolean {
  if (verificado !== true) return false;
  return enLaLista(email, lista);
}
