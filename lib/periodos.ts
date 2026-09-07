/**
 * Los meses que tienen algo cargado.
 *
 * El cierre siempre acepto `?periodo=`, pero no habia con que cambiarlo: se
 * llegaba escribiendo la URL a mano. Con un mes de datos no se nota; con
 * treinta y dos, la pantalla muestra el ultimo y el resto es invisible.
 *
 * Un mes "tiene datos" si tiene cualquier cosa: un resumen, un gasto suelto, un
 * sueldo o un cierre calculado. Mirar solo `statements` dejaba afuera los meses
 * que se pagaron sin tarjeta, que existen.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, gastos, salaries, monthlyCloses } from '@/db/schema';

export async function periodosConDatos(usuarioId: string): Promise<string[]> {
  const de = async (tabla: typeof statements | typeof gastos | typeof salaries | typeof monthlyCloses) => {
    const filas = await db.selectDistinct({ periodo: tabla.periodo }).from(tabla)
      .where(eq(tabla.usuarioId, usuarioId));
    return filas.map(f => f.periodo);
  };
  const todos = await Promise.all([de(statements), de(gastos), de(salaries), de(monthlyCloses)]);
  // Del mas nuevo al mas viejo: el mes que uno busca casi siempre es reciente.
  return [...new Set(todos.flat())].sort().reverse();
}

/** El vecino de un periodo dentro de una lista ya ordenada de nuevo a viejo. */
export function vecino(periodos: string[], actual: string, hacia: 'anterior' | 'siguiente'): string | null {
  const i = periodos.indexOf(actual);
  if (i === -1) return null;
  // La lista va de nuevo a viejo: el mes anterior esta MAS ADELANTE en el array.
  const j = hacia === 'anterior' ? i + 1 : i - 1;
  return periodos[j] ?? null;
}

/**
 * La lista con la que se navega, que no es la misma que la de meses con datos.
 *
 * El mes en curso **siempre** entra, aunque no tenga nada cargado: es el mes
 * que uno mas quiere abrir, y es justo el que todavia no tiene datos. Sin
 * esto, "ir al mes actual" fallaba en el unico momento en que hace falta.
 */
export function conMesActual(periodos: string[], hoy: string): string[] {
  return periodos.includes(hoy)
    ? periodos
    : [...periodos, hoy].sort().reverse();
}
