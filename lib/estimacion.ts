import { sumarMeses, totalDelMes, type Prestamo } from './prestamos';
import { consolidar } from './bimoneda';

/**
 * Cuanto vas a gastar el mes que viene.
 *
 * Es una **estimacion, no un cierre**. No se guarda en `monthly_closes` ni
 * entra al historico: el historico son meses que ya pasaron, con datos reales, y
 * mezclar ahi un numero inventado contamina los promedios que despues alimentan
 * la proxima estimacion — el error se realimenta y crece solo.
 *
 * **El total son solo las cosas que sabes**, no las que se adivinan:
 *
 *   COMPROMETIDO  las cuotas que ya caen. Esta firmado.
 *   FIJO          los gastos que declaraste, con su monto y su aumento,
 *                 resueltos mes a mes. Lo dijiste vos.
 *
 * Y nada mas. El historico **no entra al total**. Se calcula igual y se muestra
 * al lado como REFERENCIA, porque saber que ademas solés gastar medio millon
 * en supermercado es informacion que uno quiere; pero es lo unico del calculo
 * que nadie afirmo, y sumarlo convertia un compromiso verificable en un
 * pronostico que no se puede auditar.
 *
 * La consecuencia, y hay que decirla: **el total es un piso, no un pronostico
 * del gasto del mes**. Es lo que va a salir sí o sí. Lo que se gasta arriba de
 * eso esta en la referencia.
 *
 * De la referencia se resta lo declarado o se cuenta dos veces: el alquiler que
 * declaraste tambien esta en la categoria "Alquiler" de los meses pasados.
 */

export type MesHistorico = {
  periodo: string;
  porCategoria: Record<string, number>;
  gastoTotalArs: number | null;
};

export type LineaEstimada = {
  categoria: string;
  montoArs: number;
  /** De donde sale: cambia cuanto se le puede creer. */
  base: 'comprometido' | 'fijo' | 'recurrente' | 'variable';
  /** True si esta linea entra al total. Las de referencia no. */
  enElTotal: boolean;
  /** En cuantos de los meses mirados aparecio. */
  mesesConDato: number;
};

export type Estimacion = {
  periodo: string;
  mesesUsados: number;
  comprometidoArs: number;
  fijoArs: number;
  /** El total: comprometido + fijo. Nada mas. Es un piso, no un pronostico. */
  totalArs: number;
  /** Las partes en dolares, YA incluidas en las cifras en pesos de arriba.
   *  No se suman aparte: es el desglose de un total consolidado. */
  comprometidoUsd: number;
  fijoUsd: number;
  totalUsd: number;
  /** Y la parte que ya venia en pesos, para poder decir "tanto y tanto". */
  comprometidoSoloArs: number;
  fijoSoloArs: number;
  /** Lo que el historico dice que ademas gastas, FUERA del total. */
  recurrenteArs: number;
  variableArs: number;
  referenciaArs: number;
  /** Total + referencia. Lo que probablemente termine saliendo el mes. */
  probableArs: number;
  lineas: LineaEstimada[];
  /** Ingreso de referencia: el ultimo conocido, sin proyectar aumentos. */
  ingresoReferenciaArs: number | null;
  /** Partido, igual que el gasto. Los dolares ya estan en la cifra de arriba. */
  ingresoSoloArs: number;
  ingresoUsd: number;
  /** De que mes salio ese sueldo. Sin decirlo, el numero no se puede auditar
   *  ni corregir: hay que saber cual ir a tocar. */
  periodoDelIngreso: string | null;
  ahorroEstimadoArs: number | null;
  /** Lo que hace falta saber para leer el numero sin creerle de mas. */
  advertencias: string[];
};

/** La mediana aguanta un mes raro sin correrse; el promedio no. */
export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Aparece en al menos la mitad de los meses mirados: es parte de la vida, no un evento. */
const RECURRENTE = 0.5;

export function estimar(
  periodo: string,
  historico: MesHistorico[],
  prestamos: Prestamo[],
  ingresoReferenciaArs: number | null,
  // `tipoCambio` es el mismo que usa el ingreso de referencia. Sin el, una
  // cuota en dolares no se puede pasar a pesos y queda afuera, avisando.
  opciones: {
    mesesAMirar?: number;
    tipoCambio?: number | null;
    /** El mes del sueldo que se uso como referencia. */
    periodoDelIngreso?: string | null;
    /** Los gastos fijos declarados, ya resueltos para el mes que se estima. */
    fijos?: {
      porCategoria: Record<string, number>;
      totalArs: number;
      /** Las partes crudas, para poder mostrar el reparto entre monedas. */
      ars?: number;
      usd?: number;
      faltaIndice: string[];
    };
    /** El sueldo de referencia, partido. */
    ingreso?: { ars: number; usd: number };
  } = {},
): Estimacion {
  const cuantos = Math.min(Math.max(1, opciones.mesesAMirar ?? 6), 24);

  // Los mas recientes, y solo los que tienen un total consolidado: un mes sin
  // tipo de cambio tiene el gasto a medias y correria la mediana hacia abajo.
  const meses = [...historico]
    .filter(m => m.gastoTotalArs !== null)
    .sort((a, b) => a.periodo.localeCompare(b.periodo))
    .slice(-cuantos);

  const advertencias: string[] = [];

  // --- Comprometido: las cuotas que ya caen en ese mes --------------------
  // Separadas por moneda: sumar una cuota de USD 200 como 200 pesos daba un
  // comprometido que no existe.
  const cuotas = totalDelMes(prestamos, periodo);
  const comprometido = consolidar(cuotas, opciones.tipoCambio ?? null);
  const comprometidoArs = comprometido.totalArs ?? cuotas.ars;
  if (comprometido.totalArs === null) {
    advertencias.push('Hay cuotas en dólares y no hay tipo de cambio: quedaron afuera del comprometido.');
  }

  // --- Historico por categoria -------------------------------------------
  const porCategoria = new Map<string, number[]>();
  for (const m of meses) {
    for (const [cat, monto] of Object.entries(m.porCategoria ?? {})) {
      const n = Number(monto);
      if (!Number.isFinite(n)) continue;
      porCategoria.set(cat, [...(porCategoria.get(cat) ?? []), n]);
    }
  }

  const lineas: LineaEstimada[] = [];
  let recurrenteArs = 0;
  let variableArs = 0;

  const fijos = opciones.fijos ?? { porCategoria: {}, totalArs: 0, faltaIndice: [] };
  const fijoArs = fijos.totalArs;
  const ingresoPartido = opciones.ingreso ?? { ars: ingresoReferenciaArs ?? 0, usd: 0 };

  for (const [categoria, valores] of porCategoria) {
    // "Cuotas" ya viene por el lado de los prestamos: contarla tambien desde el
    // historico la duplicaria, y es justo la categoria mas facil de duplicar
    // porque aparece en los dos lados.
    if (categoria === 'Cuotas') continue;

    // Lo declarado ya esta contado en `fijoArs`, y tambien esta adentro de la
    // mediana de esta categoria: se resta, no se descarta la categoria entera.
    // Descartarla perderia lo variable que comparte rubro con un fijo —un
    // alquiler declarado no significa que "Alquiler" no tenga nada mas.
    const declarado = fijos.porCategoria[categoria] ?? 0;
    const montoArs = Math.max(0, mediana(valores) - declarado);
    if (montoArs <= 0) continue;

    const frecuencia = valores.length / meses.length;
    const base = frecuencia >= RECURRENTE ? 'recurrente' : 'variable';

    // No entra al total: es referencia. El historico es lo unico del calculo
    // que nadie afirmo.
    lineas.push({ categoria, montoArs, base, mesesConDato: valores.length, enElTotal: false });
    if (base === 'recurrente') recurrenteArs += montoArs;
    else variableArs += montoArs;
  }

  for (const [categoria, montoArs] of Object.entries(fijos.porCategoria)) {
    if (montoArs > 0) {
      lineas.push({ categoria, montoArs, base: 'fijo', mesesConDato: meses.length, enElTotal: true });
    }
  }

  if (comprometidoArs > 0) {
    lineas.push({
      categoria: 'Cuotas comprometidas', montoArs: comprometidoArs,
      base: 'comprometido', mesesConDato: meses.length, enElTotal: true,
    });
  }

  lineas.sort((a, b) => b.montoArs - a.montoArs);

  // Solo lo que se sabe. El historico queda afuera, a proposito.
  const totalArs = comprometidoArs + fijoArs;
  const referenciaArs = recurrenteArs + variableArs;
  const probableArs = totalArs + referenciaArs;

  // --- Lo que hay que decir para que el numero no se lea de mas ----------

  // La primera, y la que mas importa en este modelo: sin fijos declarados el
  // total son las cuotas y nada mas, y eso NO es lo que va a gastar la persona.
  if (fijoArs === 0) {
    advertencias.push(
      comprometidoArs > 0
        ? 'No declaraste ningún gasto fijo, así que el total son solo tus cuotas. Cargá el alquiler, los servicios y lo que pagues todos los meses en Gastos → Debo.'
        : 'No hay nada declarado todavía: ni cuotas ni gastos fijos. Cargá tus fijos en Gastos → Debo y este número empieza a servir.',
    );
  }

  // El total es un piso. Si lo de afuera pesa mas que lo de adentro, el piso
  // dice poco sobre el mes, y hay que decirlo antes de que alguien planifique
  // con el.
  if (referenciaArs > totalArs && referenciaArs > 0) {
    advertencias.push(
      'Lo que gastás fuera de los fijos pesa más que los fijos mismos. El total de arriba es un piso: mirá el "probable" para tener el número completo.',
    );
  }

  if (fijos.faltaIndice.length) {
    advertencias.push(
      `A ${fijos.faltaIndice.join(', ')} le falta la variación de algún mes del índice: ` +
      'se ajustó con lo que hay, así que el monto queda por debajo del real.',
    );
  }

  // Las que siguen son sobre la referencia, no sobre el total.
  if (meses.length && meses.length < 3) {
    advertencias.push(`La referencia sale de ${meses.length} ${meses.length === 1 ? 'mes' : 'meses'} de historial, que es poco. Se afina sola con cada mes que cierres.`);
  }

  if (historico.some(m => m.gastoTotalArs === null)) {
    advertencias.push('Hay meses sin tipo de cambio cargado y quedaron afuera de la referencia.');
  }

  if (ingresoReferenciaArs === null) {
    advertencias.push('Sin un sueldo cargado no se puede estimar cuánto te quedaría.');
  }

  return {
    periodo,
    mesesUsados: meses.length,
    comprometidoArs, fijoArs, totalArs,
    comprometidoUsd: cuotas.usd,
    fijoUsd: fijos.usd ?? 0,
    totalUsd: comprometido.usd + (fijos.usd ?? 0),
    comprometidoSoloArs: cuotas.ars,
    fijoSoloArs: fijos.ars ?? fijoArs,
    recurrenteArs, variableArs, referenciaArs, probableArs,
    lineas,
    ingresoReferenciaArs,
    ingresoSoloArs: ingresoPartido.ars,
    ingresoUsd: ingresoPartido.usd,
    periodoDelIngreso: opciones.periodoDelIngreso ?? null,
    ahorroEstimadoArs: ingresoReferenciaArs === null ? null : ingresoReferenciaArs - totalArs,
    advertencias,
  };
}

/** El mes siguiente al ultimo cerrado, que es el que se quiere estimar. */
export function proximoPeriodo(ultimoCerrado: string | undefined, hoy: string): string {
  const base = ultimoCerrado && ultimoCerrado >= hoy ? ultimoCerrado : hoy;
  return sumarMeses(base, 1);
}
