import test from 'node:test';
import assert from 'node:assert/strict';
import { mapearTrades } from './historial-binance';
import { paresDeInteres, esEstableUsd, type ParSimbolo, type TradeBinance } from './binance';

const PARES = new Map<string, ParSimbolo>([
  ['BTCUSDT', { simbolo: 'BTCUSDT', base: 'BTC', cotiza: 'USDT' }],
  ['ETHUSDC', { simbolo: 'ETHUSDC', base: 'ETH', cotiza: 'USDC' }],
  ['ETHBTC', { simbolo: 'ETHBTC', base: 'ETH', cotiza: 'BTC' }],
  ['SOLBTC', { simbolo: 'SOLBTC', base: 'SOL', cotiza: 'BTC' }],
]);

// La forma exacta que documenta Binance para /api/v3/myTrades.
const trade = (p: Partial<TradeBinance>): TradeBinance => ({
  symbol: 'BTCUSDT', id: 1, price: '62500.00', qty: '0.01', quoteQty: '625.00',
  commission: '0.625', commissionAsset: 'USDT', time: 1739577600000, isBuyer: true, ...p,
});

test('una compra contra USDT entra como operacion en dolares', () => {
  const { movimientos, omitidas } = mapearTrades([trade({})], PARES);
  assert.equal(omitidas.length, 0);
  assert.deepEqual(movimientos, [{
    activo: 'BTC', clase: 'CRIPTO', tipo: 'COMPRA', fecha: '2025-02-15',
    cantidad: 0.01, precioUnitario: 62500, moneda: 'USD', comision: 0.625,
    ref: 'BINANCE:BTCUSDT:1',
  }]);
});

test('isBuyer false es una venta', () => {
  const { movimientos } = mapearTrades([trade({ isBuyer: false })], PARES);
  assert.equal(movimientos[0].tipo, 'VENTA');
});

test('el activo sale de exchangeInfo y no de partir el string', () => {
  // "ETHBTC" partido a mano podria leerse ETHB/TC. La base la dice el exchange.
  const { movimientos } = mapearTrades(
    [trade({ symbol: 'ETHUSDC', id: 7, price: '3120', qty: '2' })], PARES,
  );
  assert.equal(movimientos[0].activo, 'ETH');
});

test('un par que no cotiza contra dolares se omite, no se guarda mal', () => {
  // Es el caso peligroso: 0.052 es el precio en BTC. Guardarlo como USD daria
  // un costo de 5 centavos por ETH y arruinaria el promedio del activo entero.
  const { movimientos, omitidas } = mapearTrades(
    [trade({ symbol: 'ETHBTC', id: 9, price: '0.052', qty: '2' })], PARES,
  );
  assert.equal(movimientos.length, 0);
  assert.equal(omitidas.length, 1);
  assert.match(omitidas[0].motivo, /el precio esta en BTC, no en dolares/);
});

test('las omitidas se agrupan por simbolo y motivo con su cuenta', () => {
  const { omitidas } = mapearTrades([
    trade({ symbol: 'ETHBTC', id: 1 }),
    trade({ symbol: 'ETHBTC', id: 2 }),
    trade({ symbol: 'SOLBTC', id: 3 }),
  ], PARES);
  assert.equal(omitidas.length, 2);
  assert.deepEqual(omitidas[0], { simbolo: 'ETHBTC', cantidad: 2, motivo: 'el precio esta en BTC, no en dolares' });
});

test('un simbolo desconocido se omite en vez de adivinarse', () => {
  const { movimientos, omitidas } = mapearTrades([trade({ symbol: 'RAROUSDT', id: 4 })], PARES);
  assert.equal(movimientos.length, 0);
  assert.match(omitidas[0].motivo, /no informa como se descompone/);
});

test('la comision en BNB no se suma como si fueran dolares', () => {
  const { movimientos, comisionesNoUsd } = mapearTrades(
    [trade({ commission: '0.0012', commissionAsset: 'BNB' })], PARES,
  );
  assert.equal(movimientos[0].comision, 0);
  assert.equal(comisionesNoUsd, 1);
});

test('una comision en cero no cuenta como comision en otra moneda', () => {
  const { comisionesNoUsd } = mapearTrades(
    [trade({ commission: '0', commissionAsset: 'BNB' })], PARES,
  );
  assert.equal(comisionesNoUsd, 0);
});

test('filas rotas se descartan con su motivo y no frenan a las buenas', () => {
  const { movimientos, omitidas } = mapearTrades([
    trade({ id: 1, qty: '0' }),
    trade({ id: 2, qty: 'ninguna' }),
    trade({ id: 3, time: 0 }),
    trade({ id: 4 }),
  ], PARES);
  assert.equal(movimientos.length, 1);
  assert.equal(movimientos[0].ref, 'BINANCE:BTCUSDT:4');
  // Se descartaron 3 filas, agrupadas en 2 motivos: las dos cantidades
  // invalidas comparten motivo y se cuentan juntas.
  assert.equal(omitidas.reduce((s, o) => s + o.cantidad, 0), 3);
  assert.deepEqual(omitidas.map(o => o.cantidad).sort(), [1, 2]);
});

test('el ref distingue dos compras identicas del mismo dia', () => {
  // Con un hash del contenido estas dos colapsarian en una sola. Con el id de
  // Binance son lo que son: dos operaciones distintas.
  const { movimientos } = mapearTrades([trade({ id: 10 }), trade({ id: 11 })], PARES);
  assert.equal(movimientos.length, 2);
  assert.notEqual(movimientos[0].ref, movimientos[1].ref);
});

test('las operaciones salen ordenadas por fecha', () => {
  const { movimientos } = mapearTrades([
    trade({ id: 1, time: Date.parse('2025-06-01T00:00:00Z') }),
    trade({ id: 2, time: Date.parse('2025-01-01T00:00:00Z') }),
  ], PARES);
  assert.deepEqual(movimientos.map(m => m.fecha), ['2025-01-01', '2025-06-01']);
});

test('solo se consultan los pares en dolares de los activos que tenes', () => {
  const elegidos = paresDeInteres(['BTC', 'ETH'], PARES).map(p => p.simbolo);
  // ETHBTC y SOLBTC quedan afuera: el primero no cotiza en dolares, el segundo
  // es de un activo que no tenes.
  assert.deepEqual(elegidos, ['BTCUSDT', 'ETHUSDC']);
});

test('una stablecoin no se busca contra si misma', () => {
  assert.deepEqual(paresDeInteres(['USDT'], PARES), []);
  assert.equal(esEstableUsd('USDT'), true);
  assert.equal(esEstableUsd('BTC'), false);
});
