/**
 * Plata prestada a familiares y amigos.
 *
 * La decision que manda: **prestar no es gastar**. La plata salio del bolsillo
 * pero sigue siendo tuya, y lo que cambia es en que forma la tenes: pasa de ser
 * efectivo a ser un credito a favor. Por eso nada de esto entra al cierre
 * mensual — si entrara, el mes en que prestas mostraria una tasa de ahorro
 * pesima y el mes en que te devuelven una buenisima, dos veces mal por el mismo
 * movimiento.
 *
 * La devolucion casi nunca es de una sola vez. El saldo se deriva de las
 * devoluciones cargadas, no de un campo que haya que acordarse de actualizar.
 */

export type Devolucion = { id: string; fecha: string; monto: number };

export type PrestamoPersonal = {
  id: string;
  persona: string;
  concepto: string | null;
  monto: number;
  moneda: string;
  fecha: string;          // YYYY-MM-DD
  perdonado: boolean;
  devoluciones: Devolucion[];
};

export const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type EstadoFiado = 'PENDIENTE' | 'PARCIAL' | 'SALDADO' | 'PERDONADO';

export type ResumenFiado = {
  devuelto: number;
  /** Lo que todavia te deben. Cero si esta saldado o lo diste por perdido. */
  pendiente: number;
  /** Proporcion devuelta, 0 a 1. Sirve para la barra de avance. */
  avance: number;
  estado: EstadoFiado;
  /** Dias desde que prestaste. null si la fecha no es valida. */
  diasDesde: number | null;
  /** Fecha de la ultima devolucion, para saber si se movio algo ultimamente. */
  ultimaDevolucion: string | null;
};

/** Tolerancia de un centavo: comparar flotantes con === deja saldos de $0,004. */
const CENTAVO = 0.005;

export function resumir(p: PrestamoPersonal, hoy: string): ResumenFiado {
  const devuelto = (p.devoluciones ?? []).reduce(
    (s, d) => s + (Number.isFinite(d.monto) && d.monto > 0 ? d.monto : 0), 0,
  );

  // Devolver de mas no genera un pendiente negativo: si te devolvieron mas de
  // lo que prestaste, la diferencia es un regalo o un error de carga, y en
  // ninguno de los dos casos es una deuda tuya.
  const pendiente = p.perdonado ? 0 : Math.max(0, p.monto - devuelto);

  const estado: EstadoFiado = p.perdonado ? 'PERDONADO'
    : pendiente <= CENTAVO ? 'SALDADO'
    : devuelto > CENTAVO ? 'PARCIAL'
    : 'PENDIENTE';

  const fechas = (p.devoluciones ?? []).map(d => d.fecha).filter(f => fechaValida(f)).sort();

  return {
    devuelto,
    pendiente,
    avance: p.monto > 0 ? Math.min(1, devuelto / p.monto) : 0,
    estado,
    diasDesde: diasEntre(p.fecha, hoy),
    ultimaDevolucion: fechas.length ? fechas[fechas.length - 1] : null,
  };
}

/**
 * Fecha real, no solo con la forma correcta.
 *
 * El regex acepta "2026-02-30" —dia 30 esta en el rango— y Date.parse la
 * convierte calladita en el 2 de marzo. Un error de tipeo terminaria guardado
 * como otra fecha valida, sin que nada avise. Por eso se compara la vuelta:
 * si el mes que sale no es el que entro, la fecha no existia.
 */
export function fechaValida(f: string): Date | null {
  if (!FECHA.test(f)) return null;
  const d = new Date(`${f}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === f ? d : null;
}

/** Dias entre dos fechas YYYY-MM-DD. Negativo si la segunda es anterior. */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = fechaValida(desde);
  const b = fechaValida(hasta);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export type TotalPorMoneda = { moneda: string; pendiente: number; prestado: number; cuantos: number };

/**
 * Totales separados por moneda. No se convierten: sumar pesos y dolares con una
 * cotizacion de hoy diria que te deben un numero que nadie te prometio.
 */
export function totales(ps: PrestamoPersonal[], hoy: string): TotalPorMoneda[] {
  const porMoneda = new Map<string, TotalPorMoneda>();
  for (const p of ps) {
    const r = resumir(p, hoy);
    if (r.pendiente <= CENTAVO) continue;
    const acc = porMoneda.get(p.moneda) ?? { moneda: p.moneda, pendiente: 0, prestado: 0, cuantos: 0 };
    acc.pendiente += r.pendiente;
    acc.prestado += p.monto;
    acc.cuantos++;
    porMoneda.set(p.moneda, acc);
  }
  return [...porMoneda.values()].sort((a, b) => b.pendiente - a.pendiente);
}

/**
 * Orden de la lista: primero lo que todavia te deben, y dentro de eso lo mas
 * viejo arriba. Es lo que uno quiere ver — un prestamo de hace ocho meses sin
 * una sola devolucion es justamente el que se olvida.
 */
export function ordenar(ps: PrestamoPersonal[], hoy: string): PrestamoPersonal[] {
  const peso = (p: PrestamoPersonal) => {
    const e = resumir(p, hoy).estado;
    return e === 'PENDIENTE' || e === 'PARCIAL' ? 0 : 1;
  };
  return [...ps].sort((a, b) => peso(a) - peso(b) || a.fecha.localeCompare(b.fecha));
}
