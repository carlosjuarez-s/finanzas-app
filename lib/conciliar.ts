// Conciliar lo que tenes contra lo que la app cree que tenes.
//
// La carga de a una operacion no escala cuando no hay integracion: la persona
// sabe que TIENE (lo ve en la app del broker), no la lista de compras que la
// llevo ahi. Asi que la entrada es un estado —una foto, o «tengo 50 GGAL»— y el
// codigo deduce la diferencia contra lo que ya estaba.
//
// La regla que evita el solapamiento: **se fija un estado, nunca se suma una
// novedad**. La foto de IOL reemplaza a la foto anterior de IOL; el libro se
// ajusta por la diferencia entre lo que deberia tener y lo que tiene HOY. Por
// eso cargar dos veces la misma foto no cambia nada la segunda vez: la
// diferencia ya es cero.
//
// Todo esto es puro y sin base: lo usan el servidor para aplicar y el cliente
// para mostrar la vista previa, y tiene que dar lo mismo en los dos lados.

import { PLATAFORMAS } from './plataformas';

export type Tenencia = {
  activo: string;
  clase: string;
  cantidad: number;
  valorUsd: number | null;
  /**
   * Precio promedio de compra que muestra el broker («Cost Price», «PPC»), si
   * lo muestra. Es el dato que falta para calcular ganancia, y cuando esta en
   * la captura no hay que pedirlo ni suponerlo.
   */
  costoUnitarioUsd?: number | null;
};

export type Foto = {
  plataforma: string;
  periodo: string;               // YYYY-MM
  /** Para desempatar dos fotos del mismo mes y plataforma escrita distinto. */
  creado?: number;
  totalUsd: number | null;
  tenencias: Tenencia[];
};

// --- Identidad --------------------------------------------------------------

const plano = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// «IOL», «InvertirOnline» e «Invertir Online» son la misma cuenta. Si se
// tratan como tres, la misma tenencia aparece tres veces en el total.
const ALIAS: Record<string, string> = {
  iol: PLATAFORMAS.IOL.nombre,
  invertironline: PLATAFORMAS.IOL.nombre,
  binance: PLATAFORMAS.BINANCE.nombre,
  galicia: 'Galicia',
  bancogalicia: 'Galicia',
};

/** Clave con la que se compara una plataforma. Nunca se muestra. */
export const clavePlataforma = (nombre: string) => {
  const p = plano(nombre ?? '');
  return ALIAS[p] ? plano(ALIAS[p]) : p || 'sinidentificar';
};

/** Como se guarda y se muestra: el nombre conocido, o lo que escribio la persona. */
export const nombrePlataforma = (nombre: string) => {
  const limpio = (nombre ?? '').trim();
  return ALIAS[plano(limpio)] ?? (limpio || 'Sin identificar');
};

/** Tickers en mayusculas y sin espacios: «ggal » y «GGAL» son el mismo activo. */
export const normalizarActivo = (a: string) => (a ?? '').toUpperCase().replace(/\s+/g, '');

// Dolares billete y sus equivalentes: valen 1 dolar por unidad, siempre. No
// necesitan cotizacion ni tiene sentido preguntar a cuanto se compraron.
const EFECTIVO = new Set(['USD', 'USDT', 'USDC', 'DAI', 'FDUSD', 'BUSD']);
export const esEfectivo = (activo: string) => EFECTIVO.has(normalizarActivo(activo));

// Misma tolerancia que `discrepancias()`: las cripto tienen 8 decimales y
// siempre queda polvo que no es una diferencia real.
export const tolerancia = (cantidad: number) => Math.max(1e-6, Math.abs(cantidad) * 1e-4);
const iguales = (a: number, b: number) => Math.abs(a - b) <= tolerancia(Math.max(Math.abs(a), Math.abs(b)));

/**
 * Suma las lineas repetidas de un mismo activo. Un broker puede listar BTC dos
 * veces —spot y ahorro— y las dos son tuyas.
 */
export function agrupar(tenencias: Tenencia[]): Tenencia[] {
  const m = new Map<string, Tenencia>();
  for (const t of tenencias) {
    const activo = normalizarActivo(t.activo);
    if (!activo) continue;
    const previo = m.get(activo);
    if (!previo) { m.set(activo, { ...t, activo }); continue; }
    // El costo de dos lineas es el promedio ponderado; si falta en una, no se sabe.
    previo.costoUnitarioUsd = previo.costoUnitarioUsd != null && t.costoUnitarioUsd != null
      ? (previo.costoUnitarioUsd * previo.cantidad + t.costoUnitarioUsd * t.cantidad) / (previo.cantidad + t.cantidad)
      : null;
    previo.cantidad += t.cantidad;
    previo.valorUsd = previo.valorUsd === null || t.valorUsd === null ? null : previo.valorUsd + t.valorUsd;
  }
  return [...m.values()];
}

/**
 * Completa el valor en dolares donde se puede SIN inventar: el efectivo vale
 * su cantidad, y si la captura muestra el precio por unidad (Binance muestra
 * BTC/USDT aunque value el saldo en pesos) el valor es cantidad por precio.
 * La multiplicacion la hace el codigo; al modelo solo se le pide leer.
 */
export function completarValor(t: Tenencia & { precioUsd?: number | null }): Tenencia {
  const { precioUsd, ...resto } = t;
  if (resto.valorUsd !== null && Number.isFinite(resto.valorUsd)) return resto;
  if (esEfectivo(resto.activo)) return { ...resto, valorUsd: resto.cantidad };
  if (precioUsd != null && Number.isFinite(precioUsd) && precioUsd > 0) {
    return { ...resto, valorUsd: resto.cantidad * precioUsd };
  }
  return { ...resto, valorUsd: null };
}

// --- Que tenes hoy ----------------------------------------------------------

/**
 * La ultima foto de cada plataforma.
 *
 * Lo que tenes hoy es la foto MAS RECIENTE de cada cuenta, no la suma de las
 * ultimas N fotos: sumar agosto y septiembre de IOL cuenta dos veces todo lo
 * que no se movio entre un mes y otro.
 */
export function ultimasFotos(fotos: Foto[]): Foto[] {
  const m = new Map<string, Foto>();
  for (const f of fotos) {
    const k = clavePlataforma(f.plataforma);
    const previa = m.get(k);
    if (!previa
      || f.periodo > previa.periodo
      || (f.periodo === previa.periodo && (f.creado ?? 0) > (previa.creado ?? 0))) {
      m.set(k, f);
    }
  }
  return [...m.values()];
}

/**
 * Lo mismo sobre filas de la base, conservando su forma. Para quien solo
 * necesita saber cuales fotos valen hoy, sin convertirlas.
 */
export function ultimasPorCuenta<T extends { plataforma: string; periodo: string; createdAt: Date }>(filas: T[]): T[] {
  const m = new Map<string, T>();
  for (const f of filas) {
    const k = clavePlataforma(f.plataforma);
    const previa = m.get(k);
    if (!previa || f.periodo > previa.periodo
      || (f.periodo === previa.periodo && f.createdAt.getTime() > previa.createdAt.getTime())) m.set(k, f);
  }
  return [...m.values()];
}

/**
 * Valor del portafolio mes a mes, arrastrando la ultima foto de cada cuenta.
 *
 * Si en septiembre actualizaste solo IOL, Binance sigue existiendo: tomar
 * solamente las fotos de septiembre haria caer el total justo lo que vale
 * Binance, una perdida que no paso. Por eso cada mes suma la ultima foto
 * conocida de cada plataforma hasta ese mes. Una cuenta que vendiste entera
 * deja una foto vacia, y esa foto vacia es la que se arrastra.
 *
 * Null si a alguna de las fotos que entran le falta la valuacion.
 */
export function seriePorPeriodo(fotos: Foto[]): { periodo: string; valorUsd: number | null }[] {
  const periodos = [...new Set(fotos.map(f => f.periodo))].sort();
  return periodos.map(periodo => {
    const vigentes = ultimasFotos(fotos.filter(f => f.periodo <= periodo));
    const valorUsd = vigentes.some(f => f.totalUsd === null)
      ? null
      : vigentes.reduce((s, f) => s + (f.totalUsd as number), 0);
    return { periodo, valorUsd };
  });
}

/** Cantidad total de cada activo, sumando las cuentas. */
export function totalesPorActivo(fotos: Foto[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const f of fotos) {
    for (const t of f.tenencias) {
      const a = normalizarActivo(t.activo);
      m.set(a, (m.get(a) ?? 0) + t.cantidad);
    }
  }
  return m;
}

// --- Que cambio -------------------------------------------------------------

export type TipoCambio = 'NUEVO' | 'SUBE' | 'BAJA' | 'IGUAL' | 'FALTA';

export type FilaConciliacion = {
  activo: string;
  clase: string;
  tipo: TipoCambio;
  antes: number;
  /** Lo que dice la foto nueva. En FALTA es 0: no aparece. */
  despues: number;
  /** Precio por unidad que surge de la foto (o de la anterior), si hay. */
  precioUsd: number | null;
  valorUsd: number | null;
  /** Precio promedio de compra que muestra el broker, si lo muestra. */
  costoUsd: number | null;
};

const precioDe = (t: Tenencia | undefined) =>
  t && t.valorUsd !== null && t.cantidad > 0 ? t.valorUsd / t.cantidad : null;

/**
 * Compara la foto nueva de UNA plataforma contra la anterior de la misma.
 *
 * FALTA es lo que estaba y no aparece. No se interpreta como venta: una
 * captura puede estar cortada, y borrar media cartera por una foto que no
 * scrolleo hasta abajo es mucho peor que preguntar.
 */
export function conciliar(anterior: Tenencia[], nueva: Tenencia[]): FilaConciliacion[] {
  const antes = new Map(agrupar(anterior).map(t => [t.activo, t]));
  const ahora = new Map(agrupar(nueva).map(t => [t.activo, t]));
  const filas: FilaConciliacion[] = [];

  for (const [activo, t] of ahora) {
    const previo = antes.get(activo);
    const cantAntes = previo?.cantidad ?? 0;
    const tipo: TipoCambio = !previo || cantAntes <= tolerancia(cantAntes) ? 'NUEVO'
      : iguales(cantAntes, t.cantidad) ? 'IGUAL'
      : t.cantidad > cantAntes ? 'SUBE' : 'BAJA';
    filas.push({
      activo, clase: t.clase || previo?.clase || 'OTRO', tipo,
      antes: cantAntes, despues: t.cantidad,
      precioUsd: precioDe(t) ?? precioDe(previo), valorUsd: t.valorUsd,
      costoUsd: t.costoUnitarioUsd ?? previo?.costoUnitarioUsd ?? null,
    });
  }

  for (const [activo, t] of antes) {
    if (ahora.has(activo) || t.cantidad <= tolerancia(t.cantidad)) continue;
    filas.push({
      activo, clase: t.clase, tipo: 'FALTA', antes: t.cantidad, despues: 0,
      precioUsd: precioDe(t), valorUsd: t.valorUsd, costoUsd: t.costoUnitarioUsd ?? null,
    });
  }

  const orden: Record<TipoCambio, number> = { NUEVO: 0, SUBE: 1, BAJA: 2, FALTA: 3, IGUAL: 4 };
  return filas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.activo.localeCompare(b.activo));
}

/**
 * El estado final de la plataforma, una vez decidido que pasa con lo que falta.
 *
 * `vendidos` son los FALTA que la persona confirmo que ya no tiene. El resto se
 * conserva con su cantidad y su ultimo valor conocido.
 */
export function estadoFinal(filas: FilaConciliacion[], vendidos: Set<string>): Tenencia[] {
  return filas
    .map(f => f.tipo === 'FALTA' && !vendidos.has(f.activo)
      ? { activo: f.activo, clase: f.clase, cantidad: f.antes, valorUsd: f.valorUsd, costoUnitarioUsd: f.costoUsd }
      : { activo: f.activo, clase: f.clase, cantidad: f.despues, valorUsd: f.tipo === 'FALTA' ? null : f.valorUsd, costoUnitarioUsd: f.costoUsd })
    .filter(t => t.cantidad > tolerancia(t.cantidad));
}

// --- Correcciones escritas --------------------------------------------------

export type Accion = 'FIJAR' | 'SUMAR' | 'RESTAR' | 'QUITAR' | 'MOVER' | 'VACIAR';

/**
 * Lo que el modelo entiende de «tengo 50 GGAL, no 40». Es solo la intencion:
 * la cuenta la hace `aplicarInstrucciones`, no el modelo.
 */
export type Instruccion = {
  accion: Accion;
  /** Vacio en VACIAR, que es sobre la cuenta entera. */
  activo: string;
  cantidad: number | null;
  /** Para MOVER es el destino; para VACIAR, la cuenta. Null si no se dijo. */
  plataforma: string | null;
  clase: string | null;
  /** Solo si se dijo en dolares. */
  precioUsd: number | null;
  fecha: string | null;          // YYYY-MM-DD
};

export type Cambio = {
  plataforma: string;
  /** Periodo de la foto contra la que se compara. Null si es una cuenta nueva. */
  desde: string | null;
  anterior: Tenencia[];
  nueva: Tenencia[];
};

export type ResultadoInstrucciones = {
  cambios: Cambio[];
  /** Precio y fecha que dijo la persona, por activo: le ganan al de la foto. */
  precios: Record<string, { precioUsd: number | null; fecha: string | null }>;
  errores: string[];
};

/**
 * Aplica las correcciones escritas sobre las ultimas fotos y devuelve, por
 * cuenta tocada, el antes y el despues. De ahi en mas es el mismo camino que
 * una foto: `conciliar`, vista previa, confirmar.
 *
 * Cuando no se dice la cuenta se deduce: si el activo esta en una sola, es
 * esa. Si esta en varias, o en ninguna y hay varias cuentas, no se adivina:
 * se pregunta.
 */
export function aplicarInstrucciones(ultimas: Foto[], instrucciones: Instruccion[]): ResultadoInstrucciones {
  const estado = new Map<string, { plataforma: string; desde: string | null; anterior: Tenencia[]; nueva: Tenencia[] }>();
  for (const f of ultimas) {
    const t = agrupar(f.tenencias);
    estado.set(clavePlataforma(f.plataforma), {
      plataforma: nombrePlataforma(f.plataforma), desde: f.periodo,
      anterior: t, nueva: t.map(x => ({ ...x })),
    });
  }
  const tocadas = new Set<string>();
  const errores: string[] = [];
  const precios: ResultadoInstrucciones['precios'] = {};

  const cuenta = (nombre: string) => {
    const k = clavePlataforma(nombre);
    if (!estado.has(k)) estado.set(k, { plataforma: nombrePlataforma(nombre), desde: null, anterior: [], nueva: [] });
    return k;
  };
  const tenedoras = (activo: string) =>
    [...estado.entries()].filter(([, e]) => e.nueva.some(t => t.activo === activo && t.cantidad > tolerancia(t.cantidad)))
      .map(([k]) => k);
  const nombres = (ks: string[]) => ks.map(k => estado.get(k)!.plataforma).join(' y ');

  // «Lo de IOL lo pase todo a efectivo: 6400 USD» son dos cosas: vaciar la
  // cuenta y fijar el efectivo. Vaciar va primero, sea cual sea el orden en que
  // se dijo: al reves, borraria el efectivo recien cargado.
  const ordenadas = [...instrucciones].sort((a, b) => Number(b.accion === 'VACIAR') - Number(a.accion === 'VACIAR'));

  for (const ins of ordenadas) {
    if (ins.accion === 'VACIAR') {
      if (!ins.plataforma) { errores.push('Para vaciar una cuenta hay que decir cuál.'); continue; }
      const k = clavePlataforma(ins.plataforma);
      const e = estado.get(k);
      if (!e) { errores.push(`No hay nada cargado en ${nombrePlataforma(ins.plataforma)} para vaciar.`); continue; }
      e.nueva = [];
      tocadas.add(k);
      continue;
    }

    const activo = normalizarActivo(ins.activo);
    if (!activo) { errores.push('Una de las correcciones no dice de qué activo.'); continue; }

    const donde = tenedoras(activo);
    let k: string;

    if (ins.accion === 'MOVER') {
      if (!ins.plataforma) { errores.push(`No se entendió a qué cuenta mover ${activo}.`); continue; }
      const destino = cuenta(ins.plataforma);
      const origenes = donde.filter(x => x !== destino);
      if (origenes.length !== 1) {
        errores.push(origenes.length
          ? `${activo} está en ${nombres(origenes)}: decí desde cuál se mueve.`
          : `No hay ${activo} en otra cuenta para mover a ${estado.get(destino)!.plataforma}.`);
        continue;
      }
      const desde = estado.get(origenes[0])!;
      const t = desde.nueva.find(x => x.activo === activo)!;
      // Mover todo, salvo que se diga cuanto.
      const cant = ins.cantidad !== null && ins.cantidad > 0 ? Math.min(ins.cantidad, t.cantidad) : t.cantidad;
      const precio = precioDe(t);
      t.cantidad -= cant;
      t.valorUsd = precio === null ? null : precio * t.cantidad;
      sumar(estado.get(destino)!.nueva, { activo, clase: t.clase, cantidad: cant, valorUsd: precio === null ? null : precio * cant });
      tocadas.add(origenes[0]).add(destino);
      continue;
    }

    if (ins.plataforma) {
      k = cuenta(ins.plataforma);
    } else if (donde.length === 1) {
      k = donde[0];
    } else if (donde.length > 1) {
      errores.push(`${activo} está en ${nombres(donde)}: decí en cuál.`);
      continue;
    } else if (ins.accion === 'SUMAR' || ins.accion === 'FIJAR') {
      const todas = [...estado.keys()];
      if (todas.length > 1) { errores.push(`¿En qué cuenta está ${activo}? Tenés ${nombres(todas)}.`); continue; }
      k = todas[0] ?? cuenta('Manual');
    } else {
      errores.push(`No tenés ${activo} cargado en ninguna cuenta.`);
      continue;
    }

    const e = estado.get(k)!;
    const t = e.nueva.find(x => x.activo === activo);
    const actual = t?.cantidad ?? 0;
    const cant = ins.cantidad ?? NaN;

    let final: number;
    if (ins.accion === 'QUITAR') final = 0;
    else if (!Number.isFinite(cant) || cant < 0) { errores.push(`No se entendió qué cantidad de ${activo}.`); continue; }
    else if (ins.accion === 'FIJAR') final = cant;
    else if (ins.accion === 'SUMAR') final = actual + cant;
    else {
      if (cant > actual + tolerancia(actual)) {
        errores.push(`Querés restar ${cant} ${activo} pero en ${e.plataforma} hay ${actual}.`);
        continue;
      }
      final = actual - cant;
    }

    // El valor se reescala con el precio que ya se conocia: no se inventa una
    // cotizacion, se reusa la de la ultima foto.
    const precio = ins.precioUsd ?? precioDe(t);
    if (t) {
      t.cantidad = final;
      t.valorUsd = precio === null ? null : precio * final;
    } else if (final > 0) {
      e.nueva.push(completarValor({
        activo, clase: ins.clase ?? (esEfectivo(activo) ? 'DOLAR' : 'OTRO'), cantidad: final, valorUsd: null, precioUsd: precio,
      }));
    }
    if (ins.precioUsd !== null || ins.fecha !== null) precios[activo] = { precioUsd: ins.precioUsd, fecha: ins.fecha };
    tocadas.add(k);
  }

  const cambios = [...tocadas].map(k => {
    const e = estado.get(k)!;
    return {
      plataforma: e.plataforma, desde: e.desde, anterior: e.anterior,
      nueva: e.nueva.filter(t => t.cantidad > tolerancia(t.cantidad)),
    };
  });
  return { cambios, precios, errores };
}

function sumar(lista: Tenencia[], t: Tenencia) {
  const previo = lista.find(x => x.activo === t.activo);
  if (!previo) { lista.push(t); return; }
  previo.cantidad += t.cantidad;
  previo.valorUsd = previo.valorUsd === null || t.valorUsd === null ? null : previo.valorUsd + t.valorUsd;
}

// --- El libro ---------------------------------------------------------------

export type FuentePrecio = 'DICHO' | 'COSTO_BROKER' | 'MERCADO' | 'EFECTIVO';

export type AjusteLibro = {
  activo: string;
  clase: string;
  tipo: 'COMPRA' | 'VENTA';
  cantidad: number;
  /** Null si no hay de donde sacarlo: sin precio no se anota. */
  precioUsd: number | null;
  /** De donde salio el precio, para decirlo en pantalla. */
  fuente: FuentePrecio | null;
  fecha: string;
};

export type DatosActivo = {
  clase: string;
  /** El que dijo la persona. Le gana a todo. */
  precioUsd: number | null;
  /** Promedio de compra que muestra el broker. */
  costoUsd: number | null;
  /** Precio de hoy, de la foto. */
  mercadoUsd: number | null;
  fecha: string | null;
};

/**
 * Lo que hay que anotar en el libro para que cierre con lo que tenes.
 *
 * Se calcula contra el libro de AHORA, no contra el de la vista previa: si se
 * confirma dos veces, la segunda vez la diferencia ya es cero y no se anota
 * nada. Eso es lo que hace idempotente la carga.
 *
 * Un activo que solo cambio de cuenta no genera nada: el total no se movio.
 *
 * El precio, en orden: el que dijiste; para una compra, el costo promedio que
 * muestra el broker (es lo que pagaste de verdad); si no, el de la foto. Una
 * venta va al precio de la foto, que es lo mas cerca de lo que cobraste.
 */
export function ajustesDeLibro(
  objetivo: Map<string, number>,
  libro: Map<string, number>,
  activos: Iterable<string>,
  datos: Map<string, DatosActivo>,
  hoy: string,
): AjusteLibro[] {
  const salida: AjusteLibro[] = [];
  for (const activo of new Set(activos)) {
    const quiero = objetivo.get(activo) ?? 0;
    const tengo = libro.get(activo) ?? 0;
    const diferencia = quiero - tengo;
    if (Math.abs(diferencia) <= tolerancia(Math.max(quiero, tengo))) continue;
    const d = datos.get(activo);
    const tipo = diferencia > 0 ? 'COMPRA' as const : 'VENTA' as const;

    let precioUsd: number | null = null;
    let fuente: FuentePrecio | null = null;
    if (d?.precioUsd != null) { precioUsd = d.precioUsd; fuente = 'DICHO'; }
    else if (esEfectivo(activo)) { precioUsd = 1; fuente = 'EFECTIVO'; }
    else if (tipo === 'COMPRA' && d?.costoUsd != null) { precioUsd = d.costoUsd; fuente = 'COSTO_BROKER'; }
    else if (d?.mercadoUsd != null) { precioUsd = d.mercadoUsd; fuente = 'MERCADO'; }

    salida.push({
      activo,
      clase: d?.clase ?? (esEfectivo(activo) ? 'DOLAR' : 'OTRO'),
      tipo,
      cantidad: Math.abs(diferencia),
      precioUsd, fuente,
      fecha: d?.fecha ?? hoy,
    });
  }
  return salida.sort((a, b) => a.activo.localeCompare(b.activo));
}

/**
 * Los datos de precio de cada activo tocado, juntando las filas de todas las
 * cuentas. Lo que dijo la persona por escrito le gana a lo que surge de la foto.
 */
export function datosDeActivos(
  filas: FilaConciliacion[],
  dichos: Record<string, { precioUsd: number | null; fecha: string | null }> = {},
): Map<string, DatosActivo> {
  const m = new Map<string, DatosActivo>();
  for (const f of filas) {
    const previo = m.get(f.activo);
    m.set(f.activo, {
      clase: previo?.clase ?? f.clase,
      precioUsd: dichos[f.activo]?.precioUsd ?? null,
      costoUsd: previo?.costoUsd ?? f.costoUsd,
      mercadoUsd: previo?.mercadoUsd ?? f.precioUsd,
      fecha: dichos[f.activo]?.fecha ?? null,
    });
  }
  return m;
}
