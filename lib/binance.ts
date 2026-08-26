import { createHmac } from 'node:crypto';
import { errorCensurado } from './secretos';

// Cliente de Binance, solo lectura.
//
// Este archivo NO tiene ninguna funcion que pueda operar: no hay POST a /order
// ni a /withdraw. Aunque la API key tuviera permisos de trading por error, esta
// app no los usa. La garantia real sigue siendo crear la clave con "Enable
// Reading" y nada mas, pero el codigo tampoco deja la puerta abierta.

const BASE = 'https://api.binance.com';

export type CredencialBinance = { apiKey: string; apiSecret: string };

export type Tenencia = { activo: string; cantidad: number };

export class ErrorBinance extends Error {
  constructor(mensaje: string, readonly codigo?: number, readonly vencida = false) {
    super(mensaje);
    this.name = 'ErrorBinance';
  }
}

/**
 * Firma HMAC-SHA256 del query string, en hexadecimal. Es el corazon de la
 * autenticacion: Binance recomputa esto con tu secret y compara.
 *
 * Se exporta para poder testearla contra el vector conocido de la documentacion,
 * que es la unica forma de verificarla sin llamar a la API.
 */
export function firmar(queryString: string, apiSecret: string): string {
  return createHmac('sha256', apiSecret).update(queryString).digest('hex');
}

// Binance rechaza pedidos con timestamp muy viejo. recvWindow define cuanta
// diferencia de reloj tolera; 5s es el default y alcanza salvo desfasaje serio.
function queryFirmado(params: Record<string, string | number>, apiSecret: string): string {
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
    recvWindow: '5000',
  }).toString();
  return `${qs}&signature=${firmar(qs, apiSecret)}`;
}

// Codigos de Binance que significan "esta credencial ya no sirve", para poder
// avisar que hay que renovarla en vez de mostrar un error generico. El -2015 es
// el que aparece cuando la clave vencio por no tener restriccion de IP.
const CODIGOS_CREDENCIAL = new Set([-2014, -2015, -1022, -2008]);

async function pedir<T>(
  ruta: string, cred: CredencialBinance, params: Record<string, string | number> = {},
): Promise<T> {
  const url = `${BASE}${ruta}?${queryFirmado(params, cred.apiSecret)}`;
  const secretos = [cred.apiKey, cred.apiSecret];

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'X-MBX-APIKEY': cred.apiKey },
      // Sin esto una funcion serverless puede quedarse colgada hasta el limite.
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // El mensaje de red puede incluir la URL completa, con la firma adentro.
    throw new ErrorBinance(`No se pudo conectar con Binance: ${errorCensurado(e, secretos)}`);
  }

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '');
    let codigo: number | undefined;
    let mensaje = `Binance respondio ${res.status}`;
    try {
      const json = JSON.parse(cuerpo) as { code?: number; msg?: string };
      codigo = json.code;
      if (json.msg) mensaje = json.msg;
    } catch { /* el cuerpo no era JSON: queda el mensaje generico */ }

    const vencida = codigo !== undefined && CODIGOS_CREDENCIAL.has(codigo);
    throw new ErrorBinance(
      vencida
        ? `La clave de Binance no es valida o vencio (${codigo}: ${mensaje}). ` +
          'Binance vence las claves sin restriccion de IP a los 30 dias: genera una nueva y actualiza la conexion.'
        : errorCensurado(new Error(mensaje), secretos),
      codigo, vencida,
    );
  }

  return res.json() as Promise<T>;
}

type RespuestaCuenta = {
  balances: { asset: string; free: string; locked: string }[];
  canTrade?: boolean;
  canWithdraw?: boolean;
};

/**
 * Tenencias de la cuenta spot. Filtra los saldos en cero, que son la enorme
 * mayoria: Binance devuelve una fila por cada moneda que existe.
 */
export async function tenencias(cred: CredencialBinance): Promise<Tenencia[]> {
  const cuenta = await pedir<RespuestaCuenta>('/api/v3/account', cred);

  return (cuenta.balances ?? [])
    .map(b => ({
      activo: b.asset,
      cantidad: Number(b.free ?? 0) + Number(b.locked ?? 0),
    }))
    .filter(t => Number.isFinite(t.cantidad) && t.cantidad > 0)
    .sort((a, b) => a.activo.localeCompare(b.activo));
}

/**
 * Chequeo de permisos. Sirve para avisarle a la persona si cargo una clave con
 * mas permisos de los necesarios: la app no va a operar igual, pero es un riesgo
 * que conviene que conozca.
 */
export async function permisos(cred: CredencialBinance): Promise<{ puedeOperar: boolean; puedeRetirar: boolean }> {
  const cuenta = await pedir<RespuestaCuenta>('/api/v3/account', cred);
  return { puedeOperar: Boolean(cuenta.canTrade), puedeRetirar: Boolean(cuenta.canWithdraw) };
}

/**
 * Precios de mercado. Es un endpoint publico: no lleva firma ni credencial.
 * Devuelve el precio en USDT de cada activo pedido.
 */
export async function preciosUsdt(activos: string[]): Promise<Record<string, number>> {
  if (!activos.length) return {};

  const res = await fetch(`${BASE}/api/v3/ticker/price`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new ErrorBinance(`No se pudieron leer los precios (${res.status}).`);

  const todos = await res.json() as { symbol: string; price: string }[];
  const porSimbolo = new Map(todos.map(t => [t.symbol, Number(t.price)]));

  const salida: Record<string, number> = {};
  for (const a of activos) {
    // Las stablecoins valen 1 y no cotizan contra si mismas.
    if (a === 'USDT' || a === 'USDC' || a === 'BUSD' || a === 'FDUSD') { salida[a] = 1; continue; }
    const p = porSimbolo.get(`${a}USDT`);
    if (p && Number.isFinite(p)) salida[a] = p;
    // Si no hay par contra USDT, se omite: es mejor no mostrar valuacion que
    // inventar una con una conversion indirecta sin avisar.
  }
  return salida;
}
