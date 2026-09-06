/**
 * Plata en dos monedas.
 *
 * Con un sueldo partido —parte en dolares, parte en pesos— ningun total dice
 * nada solo. Hace falta consolidar, y consolidar es elegir un tipo de cambio.
 *
 * La regla que manda: **el tipo de cambio de un mes es el de ese mes**. Mirar
 * agosto del año pasado con el dolar de hoy no da un numero aproximado, da uno
 * absurdo: en Argentina el mismo sueldo en pesos vale la mitad un año despues.
 * Por eso el cierre guarda el tipo de cambio con el que se consolido, y esa
 * cifra queda congelada.
 *
 * Del mes en curso todavia no hay un cierre, asi que ahi se usa la cotizacion
 * de hoy y se dice que es de hoy.
 */

export type Bimoneda = { ars: number; usd: number };

/** Un monto consolidado, con la trazabilidad de como se llego a el. */
export type Consolidado = {
  totalArs: number | null;   // null cuando no hay tipo de cambio con que convertir
  ars: number;
  usd: number;
  tipoCambio: number | null;
};

const finito = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Suma las dos partes en pesos.
 *
 * Sin tipo de cambio valido devuelve `totalArs: null`, no la parte en pesos
 * sola: mostrar 300.000 cuando ademas hay USD 1.000 sin convertir es peor que
 * mostrar "—", porque el numero parece completo y no lo esta.
 */
export function consolidar(m: Bimoneda, tipoCambio: number | null | undefined): Consolidado {
  const ars = finito(m.ars);
  const usd = finito(m.usd);
  const tc = Number(tipoCambio);
  const valido = Number.isFinite(tc) && tc > 0;

  return {
    ars, usd,
    tipoCambio: valido ? tc : null,
    // Sin parte en dolares no hace falta convertir nada: el total en pesos es
    // el que ya esta, y pedir un tipo de cambio para eso seria inventar un
    // requisito que el dato no tiene.
    totalArs: usd === 0 ? ars : valido ? ars + usd * tc : null,
  };
}

/** Que proporcion del total viene en cada moneda. Null si no se puede saber. */
export function reparto(c: Consolidado): { pctArs: number; pctUsd: number } | null {
  if (c.totalArs === null || c.totalArs <= 0) return null;
  const enPesosLaParteUsd = c.usd * (c.tipoCambio ?? 0);
  return {
    pctArs: (c.ars / c.totalArs) * 100,
    pctUsd: (enPesosLaParteUsd / c.totalArs) * 100,
  };
}

/**
 * Tasa de ahorro consolidada.
 *
 * `null` y `0` no son lo mismo: sin ingreso cargado no se sabe cuanto ahorraste,
 * que es distinto de haber ahorrado cero.
 */
export function tasaAhorro(ingresoArs: number | null, ahorroArs: number | null): number | null {
  if (ingresoArs === null || ahorroArs === null) return null;
  if (!Number.isFinite(ingresoArs) || ingresoArs <= 0) return null;
  return (ahorroArs / ingresoArs) * 100;
}

/**
 * Los totales consolidados de un cierre ya guardado.
 *
 * `monthly_closes` guarda las partes crudas —`ingreso_ars`, `ingreso_usd`— y el
 * tipo de cambio con el que se cerro el mes. El total no esta guardado, se
 * deriva: si el tipo de cambio de un mes estaba mal, se corrige uno y todo se
 * recalcula.
 *
 * Esta funcion existe porque esa derivacion **hay que hacerla en todos lados**.
 * Leer `ingreso_ars` como si fuera el ingreso del mes era el bug: para alguien
 * que cobra 70% en dolares, el historico mostraba menos de un tercio de lo que
 * gana, y el ahorro —que si esta consolidado— quedaba por encima del ingreso en
 * el mismo grafico.
 */
export function totalesDelCierre(f: {
  ingresoArs: unknown; ingresoUsd?: unknown;
  gastoArs: unknown; gastoUsd?: unknown;
  tipoCambio?: unknown;
}): { ingreso: Consolidado; gasto: Consolidado } {
  const tc = f.tipoCambio === null || f.tipoCambio === undefined ? null : Number(f.tipoCambio);
  return {
    ingreso: consolidar({ ars: finito(f.ingresoArs), usd: finito(f.ingresoUsd) }, tc),
    gasto: consolidar({ ars: finito(f.gastoArs), usd: finito(f.gastoUsd) }, tc),
  };
}

/** Un cierre ya consolidado en pesos, listo para graficar o promediar. */
export type CierreEnPesos = {
  periodo: string;
  ingresoArs: number;
  gastoArs: number;
  ahorroArs: number;
  tasaAhorro: number | null;
  porCategoria: Record<string, number>;
};

/**
 * Convierte filas de `monthly_closes` en cierres consolidados.
 *
 * Los meses que **no se pueden** consolidar —tienen dolares y no tienen tipo de
 * cambio— quedan afuera y se devuelven aparte. No se los cuenta como cero: un
 * mes del que no se sabe cuanto vale no vale cero, y meterlo en un promedio con
 * un cero inventado hunde el promedio de todos los demas.
 */
export function cierresEnPesos(filas: {
  periodo: string;
  ingresoArs: unknown; ingresoUsd?: unknown;
  gastoArs: unknown; gastoUsd?: unknown;
  ahorroArs: unknown; tasaAhorro?: unknown; tipoCambio?: unknown;
  porCategoria?: unknown;
}[]): { cierres: CierreEnPesos[]; sinTipoCambio: string[] } {
  const cierres: CierreEnPesos[] = [];
  const sinTipoCambio: string[] = [];

  for (const f of filas) {
    const { ingreso, gasto } = totalesDelCierre(f);
    if (ingreso.totalArs === null || gasto.totalArs === null) {
      sinTipoCambio.push(f.periodo);
      continue;
    }
    cierres.push({
      periodo: f.periodo,
      ingresoArs: ingreso.totalArs,
      gastoArs: gasto.totalArs,
      ahorroArs: finito(f.ahorroArs),
      tasaAhorro: f.tasaAhorro === null || f.tasaAhorro === undefined ? null : Number(f.tasaAhorro),
      porCategoria: (f.porCategoria ?? {}) as Record<string, number>,
    });
  }
  return { cierres, sinTipoCambio };
}
