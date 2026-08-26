// Cotizaciones. El precio de mercado es lo unico que falta para que la ganancia
// signifique algo: sin el hay cuanto tenes y cuanto pagaste, pero no cuanto vale.
//
// Se resuelve por tipo de activo, porque no hay una sola fuente que los cubra:
//
//   CRIPTO  -> ticker publico de Binance. Sin API key, ya andaba.
//   DOLAR   -> API argentina de cotizaciones (MEP, CCL, blue).
//   CEDEAR  -> precio del subyacente en EE.UU. dividido por el ratio.
//
// El tercero merece explicacion. Google Finance no trae la mayoria de los
// CEDEARs, y un feed de BYMA es mas complicado de lo que justifica. Pero un
// CEDEAR ES una fraccion de una accion estadounidense, y el ratio ya lo
// guardamos para que el cambio de ratio no rompa el costo. Entonces:
//
//     valor en USD de 1 CEDEAR = precio de la accion / ratio
//
// Eso da el valor del subyacente, que es exactamente lo que queres saber para
// medir tu patrimonio en dolares. Ignora la prima o el descuento con que el
// CEDEAR cotiza localmente, y esta bien que lo ignore: esa prima es el costo de
// entrar y salir, no parte de lo que tenes.
//
// NADA de esto se puede probar desde el entorno de desarrollo, que tiene la
// salida a internet bloqueada. En Vercel funciona. Por eso toda falla devuelve
// null en vez de tirar: la UI ya distingue "no se sabe" de "vale cero".

export type Cotizacion = { activo: string; usd: number; fuente: string; hora: string };

const TIMEOUT = 10000;

async function traer<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;   // sin cotizacion se muestra "—", no un numero inventado
  }
}

/** Cripto contra USDT. Endpoint publico: no lleva firma ni credencial. */
export async function preciosCripto(activos: string[]): Promise<Record<string, number>> {
  if (!activos.length) return {};
  const todos = await traer<{ symbol: string; price: string }[]>('https://api.binance.com/api/v3/ticker/price');
  if (!todos) return {};

  const porSimbolo = new Map(todos.map(t => [t.symbol, Number(t.price)]));
  const salida: Record<string, number> = {};
  for (const a of activos) {
    if (['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'].includes(a)) { salida[a] = 1; continue; }
    const p = porSimbolo.get(`${a}USDT`);
    if (p && Number.isFinite(p)) salida[a] = p;
  }
  return salida;
}

export type Dolares = { mep: number | null; ccl: number | null; blue: number | null; oficial: number | null };

/**
 * Cotizaciones del dolar en Argentina. Se usa el MEP como referencia para
 * convertir pesos: es el que corresponde a operar activos, no el oficial.
 */
export async function dolares(): Promise<Dolares> {
  const lista = await traer<{ casa: string; venta: number; compra: number }[]>('https://dolarapi.com/v1/dolares');
  if (!lista) return { mep: null, ccl: null, blue: null, oficial: null };

  const buscar = (casa: string) => {
    const d = lista.find(x => x.casa === casa);
    // El promedio entre compra y venta: usar solo venta sobreestima la tenencia.
    if (!d) return null;
    const v = d.compra && d.venta ? (d.compra + d.venta) / 2 : (d.venta ?? d.compra);
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  return {
    mep: buscar('bolsa'), ccl: buscar('contadoconliqui'),
    blue: buscar('blue'), oficial: buscar('oficial'),
  };
}

/**
 * Precio de una accion estadounidense, en dolares. Stooq devuelve CSV y no pide
 * API key, que para una app personal vale mas que la prolijidad de un JSON.
 */
export async function preciosAcciones(tickers: string[]): Promise<Record<string, number>> {
  const salida: Record<string, number> = {};
  await Promise.all(tickers.map(async t => {
    try {
      const res = await fetch(
        `https://stooq.com/q/l/?s=${encodeURIComponent(t.toLowerCase())}.us&f=sd2t2ohlcv&h&e=csv`,
        { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' },
      );
      if (!res.ok) return;
      // Cabecera y una fila: Symbol,Date,Time,Open,High,Low,Close,Volume
      const [, fila] = (await res.text()).trim().split('\n');
      const cierre = Number(fila?.split(',')[6]);
      if (Number.isFinite(cierre) && cierre > 0) salida[t.toUpperCase()] = cierre;
    } catch { /* sin precio: queda fuera del resultado */ }
  }));
  return salida;
}

/**
 * Valor en dolares de UN CEDEAR, a partir del precio del subyacente y el ratio.
 * Un ratio de 20 significa que hacen falta 20 CEDEARs para una accion.
 */
export function valorCedear(precioAccionUsd: number, ratio: number): number | null {
  if (!Number.isFinite(precioAccionUsd) || precioAccionUsd <= 0) return null;
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  return precioAccionUsd / ratio;
}

/**
 * Precios de todo el portafolio, por clase de activo. Lo que no se consigue no
 * aparece en el resultado: la UI muestra "—" y no un cero que se veria como una
 * perdida total.
 */
export async function preciosDePortafolio(
  activos: { activo: string; clase: string }[],
  ratiosCedear: Record<string, number> = {},
): Promise<{ precios: Record<string, number>; dolar: Dolares; sinPrecio: string[] }> {
  const cripto = activos.filter(a => a.clase === 'CRIPTO').map(a => a.activo);
  const cedears = activos.filter(a => a.clase === 'CEDEAR').map(a => a.activo);

  const [pCripto, pAcciones, dolar] = await Promise.all([
    preciosCripto(cripto),
    preciosAcciones(cedears),
    dolares(),
  ]);

  const precios: Record<string, number> = { ...pCripto };

  for (const c of cedears) {
    const accion = pAcciones[c.toUpperCase()];
    // Sin ratio conocido se asume 1:1 y se avisa: mejor mostrar el precio del
    // subyacente que nada, pero el numero puede estar muy lejos.
    const v = accion ? valorCedear(accion, ratiosCedear[c] ?? 1) : null;
    if (v !== null) precios[c] = v;
  }

  // El dolar entra como activo: quien tiene dolares tiene dolares.
  for (const a of activos) {
    if (a.clase === 'DOLAR') precios[a.activo] = 1;
  }

  const sinPrecio = activos.map(a => a.activo).filter(a => precios[a] == null);
  return { precios, dolar, sinPrecio };
}
