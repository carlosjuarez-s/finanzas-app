import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settings, monthlyCloses } from '@/db/schema';
import { SUPUESTOS_DEFAULT, type Supuestos } from './proyeccion';

const CLAVE = 'supuestos';

// Merge sobre los defaults: si mañana se agrega un supuesto nuevo, las filas ya
// guardadas no quedan sin ese campo.
export async function leerSupuestos(): Promise<Supuestos> {
  const [fila] = await db.select().from(settings).where(eq(settings.clave, CLAVE));
  return { ...SUPUESTOS_DEFAULT, ...((fila?.valor as Partial<Supuestos>) ?? {}) };
}

export async function guardarSupuestos(parcial: Partial<Supuestos>): Promise<Supuestos> {
  const nuevos = { ...(await leerSupuestos()), ...parcial };
  await db.insert(settings)
    .values({ clave: CLAVE, valor: nuevos })
    .onConflictDoUpdate({ target: settings.clave, set: { valor: nuevos, updatedAt: new Date() } });
  return nuevos;
}

// Ahorro acumulado de todos los meses cerrados, pasado a dolares.
//
// Es una aproximacion: convierte pesos ahorrados en distintos momentos al tipo
// de cambio de hoy, cuando en realidad cada mes se habria comprado a la
// cotizacion de ese mes. Para saber el valor exacto haria falta guardar el tipo
// de cambio de cada cierre. Sirve como orden de magnitud del progreso, no como
// estado de cuenta.
export async function ahorroAcumuladoUsd(tipoCambioArs: number): Promise<number> {
  const cierres = await db.select({ ahorroArs: monthlyCloses.ahorroArs }).from(monthlyCloses);
  const totalArs = cierres.reduce((s, c) => s + Number(c.ahorroArs), 0);
  return tipoCambioArs > 0 ? totalArs / tipoCambioArs : 0;
}
