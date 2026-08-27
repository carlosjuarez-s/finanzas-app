import type { MovimientoData } from './tipos';
import { esEstableUsd, type TradeBinance, type ParSimbolo } from './binance';

/**
 * Traduce las operaciones crudas de Binance al libro de transacciones.
 *
 * Es una funcion pura y separada del cliente HTTP a proposito: es la parte que
 * puede corromper el costo de un activo en silencio, asi que tiene que poder
 * probarse sin red.
 *
 * La regla que manda: solo entra lo que ya esta denominado en dolares. Una
 * compra de ETH contra BTC tiene el precio expresado en BTC, y guardarla como
 * si fueran dolares no da un numero aproximado — da uno absurdo, y ademas
 * arrastra el promedio ponderado de todo el activo. Se omite y se dice.
 */

export type OmitidaBinance = { simbolo: string; cantidad: number; motivo: string };

export type MovimientoImportado = MovimientoData & { ref: string };

export function mapearTrades(
  trades: TradeBinance[],
  pares: Map<string, ParSimbolo>,
): { movimientos: MovimientoImportado[]; omitidas: OmitidaBinance[]; comisionesNoUsd: number } {
  const movimientos: MovimientoImportado[] = [];
  const porMotivo = new Map<string, OmitidaBinance>();
  let comisionesNoUsd = 0;

  const omitir = (simbolo: string, motivo: string) => {
    const clave = `${simbolo}|${motivo}`;
    const previa = porMotivo.get(clave);
    if (previa) previa.cantidad++;
    else porMotivo.set(clave, { simbolo, cantidad: 1, motivo });
  };

  for (const t of trades) {
    const simbolo = String(t?.symbol ?? '');
    const par = pares.get(simbolo);

    if (!par) { omitir(simbolo || '(sin simbolo)', 'el exchange no informa como se descompone este par'); continue; }
    if (!esEstableUsd(par.cotiza)) {
      omitir(simbolo, `el precio esta en ${par.cotiza}, no en dolares`);
      continue;
    }

    const cantidad = Number(t.qty);
    const precio = Number(t.price);
    const fecha = fechaDe(t.time);

    if (!Number.isFinite(cantidad) || cantidad <= 0) { omitir(simbolo, 'la cantidad no es un numero mayor a cero'); continue; }
    if (!Number.isFinite(precio) || precio < 0) { omitir(simbolo, 'el precio no es un numero valido'); continue; }
    if (!fecha) { omitir(simbolo, 'la fecha no se pudo interpretar'); continue; }
    if (!Number.isFinite(Number(t.id))) { omitir(simbolo, 'la operacion no trae id'); continue; }

    // La comision puede venir en BNB, que es lo habitual si tenes el descuento
    // activado. En ese caso no es un monto en dolares: se guarda cero y se
    // cuenta aparte, en vez de sumar una cifra en otra unidad al costo.
    const comisionCruda = Number(t.commission);
    const comisionEsUsd = esEstableUsd(String(t.commissionAsset ?? ''));
    if (Number.isFinite(comisionCruda) && comisionCruda > 0 && !comisionEsUsd) comisionesNoUsd++;

    movimientos.push({
      activo: par.base,
      clase: 'CRIPTO',
      tipo: t.isBuyer ? 'COMPRA' : 'VENTA',
      fecha,
      cantidad,
      precioUnitario: precio,
      moneda: 'USD',
      comision: comisionEsUsd && Number.isFinite(comisionCruda) && comisionCruda > 0 ? comisionCruda : 0,
      // El id de trade de Binance es unico por par y estable entre pedidos: es
      // una clave de deduplicacion mucho mejor que un hash del contenido, que
      // colapsaria dos compras identicas del mismo dia en una sola.
      ref: `BINANCE:${simbolo}:${t.id}`,
    });
  }

  return {
    movimientos: movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    omitidas: [...porMotivo.values()].sort((a, b) => b.cantidad - a.cantidad),
    comisionesNoUsd,
  };
}

/** Milisegundos de Binance a YYYY-MM-DD en UTC. */
function fechaDe(ms: unknown): string | null {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
