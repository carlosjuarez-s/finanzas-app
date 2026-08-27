/**
 * Cronograma de un prestamo.
 *
 * Funciones puras sobre el plan: cual cuota cae en cada mes, cuantas faltan y
 * cuanto se debe. Nada de esto se guarda calculado, y por eso no hace falta un
 * proceso mensual que "avance" las cuotas: el mes actual sale de la fecha, y una
 * fila por cuota se desincronizaria en cuanto se corrija el monto o la fecha.
 */

export type Prestamo = {
  id: string;
  nombre: string;
  entidad: string | null;
  montoOtorgado: number | null;
  cuotas: number;
  cuotaArs: number;
  primerPeriodo: string;        // YYYY-MM
  moneda: string;
  cftAnual: number | null;
  canceladoEn: string | null;   // YYYY-MM desde el cual deja de pagarse
};

export const PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Meses entre dos periodos YYYY-MM. Negativo si el segundo es anterior. */
export function mesesEntre(desde: string, hasta: string): number {
  const [ya, ma] = desde.split('-').map(Number);
  const [yb, mb] = hasta.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Ultimo periodo en que se paga, si nada se adelanta. */
export function ultimoPeriodo(p: Prestamo): string {
  return sumarMeses(p.primerPeriodo, p.cuotas - 1);
}

/**
 * Numero de cuota que cae en ese mes, o null si el mes queda fuera del plan.
 *
 * Cancelar deja de sumar DESDE el mes indicado, no ese mes inclusive: si
 * cancelaste en marzo, la cuota de marzo ya no se paga.
 */
export function cuotaEnPeriodo(p: Prestamo, periodo: string): number | null {
  if (!PERIODO.test(periodo) || !PERIODO.test(p.primerPeriodo)) return null;
  if (p.canceladoEn && mesesEntre(p.canceladoEn, periodo) >= 0) return null;

  const n = mesesEntre(p.primerPeriodo, periodo) + 1;
  return n >= 1 && n <= p.cuotas ? n : null;
}

/** Cuanto suma este prestamo al gasto de ese mes. */
export function montoEnPeriodo(p: Prestamo, periodo: string): number {
  return cuotaEnPeriodo(p, periodo) === null ? 0 : p.cuotaArs;
}

export type EstadoPrestamo = {
  pagadas: number;
  restantes: number;
  /** Lo que falta pagar: cuotas que quedan por el valor de la cuota. */
  saldoArs: number;
  /** Suma de todas las cuotas del plan. */
  totalArs: number;
  /** Cuanto costo el credito: total de cuotas menos lo que te dieron. */
  costoArs: number | null;
  /** Numero de cuota de este mes, null si no cae ninguna. */
  cuotaDelMes: number | null;
  ultimoPeriodo: string;
  terminado: boolean;
  cancelado: boolean;
};

/**
 * Estado del prestamo visto desde un mes. `pagadas` cuenta las cuotas ya
 * vencidas incluyendo la del mes en curso: es lo que uno responde cuando le
 * preguntan "¿cuantas pagaste?" estando a mitad de mes.
 */
export function estado(p: Prestamo, periodo: string): EstadoPrestamo {
  const total = p.cuotas * p.cuotaArs;
  const fin = ultimoPeriodo(p);

  // Donde corta: por cancelacion anticipada o por el mes consultado.
  const corte = p.canceladoEn && mesesEntre(p.canceladoEn, periodo) > 0
    ? sumarMeses(p.canceladoEn, -1)
    : periodo;

  const transcurridas = mesesEntre(p.primerPeriodo, corte) + 1;
  const pagadas = Math.max(0, Math.min(p.cuotas, transcurridas));
  const restantes = p.cuotas - pagadas;

  return {
    pagadas,
    restantes,
    saldoArs: restantes * p.cuotaArs,
    totalArs: total,
    costoArs: p.montoOtorgado === null ? null : total - p.montoOtorgado,
    cuotaDelMes: cuotaEnPeriodo(p, periodo),
    ultimoPeriodo: fin,
    terminado: restantes === 0,
    cancelado: Boolean(p.canceladoEn && mesesEntre(p.canceladoEn, periodo) >= 0),
  };
}

/** Lo que todos los prestamos suman al gasto de un mes. */
export function totalDelMes(ps: Prestamo[], periodo: string): number {
  return ps.reduce((s, p) => s + montoEnPeriodo(p, periodo), 0);
}

/**
 * Todos los meses con al menos una cuota, desde el primero hasta el ultimo.
 * El cierre mensual lo usa para no saltearse un mes cuyo unico gasto es una
 * cuota: sin esto ese mes no existiria en el historico.
 */
export function periodosConCuota(ps: Prestamo[]): string[] {
  const meses = new Set<string>();
  for (const p of ps) {
    if (!PERIODO.test(p.primerPeriodo) || p.cuotas < 1) continue;
    for (let i = 0; i < p.cuotas; i++) {
      const mes = sumarMeses(p.primerPeriodo, i);
      if (cuotaEnPeriodo(p, mes) !== null) meses.add(mes);
    }
  }
  return [...meses].sort();
}
