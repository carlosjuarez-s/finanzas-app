import test from 'node:test';
import assert from 'node:assert/strict';
import { historial, variacion, montoEnUsd, type SnapshotPeriodo } from './historial-portafolio';
import type { Transaccion } from './costo';

const compra = (fecha: string, usd: number, extra: Partial<Transaccion> = {}): Transaccion => ({
  activo: 'BTC', tipo: 'COMPRA', fecha, cantidad: 1, precioUnitario: usd,
  moneda: 'USD', tipoCambioDia: null, comision: 0, ...extra,
});

const SNAPS: SnapshotPeriodo[] = [
  { periodo: '2026-01', valorUsd: 1_000 },
  { periodo: '2026-02', valorUsd: 2_200 },
  { periodo: '2026-03', valorUsd: 2_000 },
];

test('el aportado se acumula mes a mes', () => {
  const { puntos } = historial(SNAPS, [
    compra('2026-01-10', 1_000),
    compra('2026-02-05', 1_000),
  ]);
  assert.deepEqual(puntos.map(p => p.aportadoUsd), [1_000, 2_000, 2_000]);
});

test('separa lo que subio por aporte de lo que subio por mercado', () => {
  // Enero: pusiste 1.000 y vale 1.000 -> resultado 0.
  // Febrero: pusiste otros 1.000 y vale 2.200 -> el mercado te dio 200.
  const { puntos } = historial(SNAPS, [
    compra('2026-01-10', 1_000),
    compra('2026-02-05', 1_000),
  ]);
  assert.deepEqual(puntos.map(p => p.resultadoUsd), [0, 200, 0]);
  assert.equal(puntos[1].retornoPct, 10);
});

test('el caso que hace falta detectar: aportaste y el mercado cayo', () => {
  // El total sube de 1.000 a 1.800 y parece que fue bien. Pero pusiste 1.000
  // nuevos: en realidad perdiste 200.
  const { puntos } = historial(
    [{ periodo: '2026-01', valorUsd: 1_000 }, { periodo: '2026-02', valorUsd: 1_800 }],
    [compra('2026-01-10', 1_000), compra('2026-02-05', 1_000)],
  );
  assert.equal(puntos[1].valorUsd, 1_800);
  assert.equal(puntos[1].aportadoUsd, 2_000);
  assert.equal(puntos[1].resultadoUsd, -200);

  const v = variacion(puntos)!;
  assert.equal(v.cambioUsd, 800, 'el total subio 800');
  assert.equal(v.aportadoUsd, 1_000, 'pero pusiste 1.000');
  assert.equal(v.rendimientoUsd, -200, 'asi que el mercado te saco 200');
});

test('una venta baja el aportado', () => {
  const { puntos } = historial(SNAPS, [
    compra('2026-01-10', 1_000),
    compra('2026-03-01', 500, { tipo: 'VENTA' }),
  ]);
  assert.deepEqual(puntos.map(p => p.aportadoUsd), [1_000, 1_000, 500]);
});

test('la comision suma al comprar y resta al vender', () => {
  assert.equal(montoEnUsd(compra('2026-01-01', 1_000, { comision: 10 })), 1_010);
  assert.equal(montoEnUsd(compra('2026-01-01', 1_000, { tipo: 'VENTA', comision: 10 })), 990);
});

test('una compra en pesos usa el dolar de SU dia', () => {
  const t = compra('2026-01-01', 1_450_000, { moneda: 'ARS', tipoCambioDia: 1_450 });
  assert.equal(montoEnUsd(t), 1_000);
});

test('una operacion en pesos sin el dolar de su dia se descarta y se cuenta', () => {
  // Convertirla al dolar de hoy diria que compraste mucho mas barato.
  const t = compra('2026-01-01', 1_450_000, { moneda: 'ARS', tipoCambioDia: null });
  assert.equal(montoEnUsd(t), null);

  const { puntos, operacionesSinConvertir } = historial(SNAPS, [t, compra('2026-01-02', 500)]);
  assert.equal(operacionesSinConvertir, 1);
  assert.equal(puntos[0].aportadoUsd, 500, 'solo entra la que si se pudo medir');
});

test('una compra en un mes sin snapshot igual cuenta como plata puesta', () => {
  // Que no se haya sincronizado ese mes no significa que no compraste.
  const { puntos } = historial(
    [{ periodo: '2026-01', valorUsd: 1_000 }, { periodo: '2026-03', valorUsd: 3_000 }],
    [compra('2026-01-10', 1_000), compra('2026-02-20', 1_500)],
  );
  assert.equal(puntos[1].aportadoUsd, 2_500);
});

test('un snapshot sin valuacion no inventa un resultado', () => {
  const { puntos } = historial(
    [{ periodo: '2026-01', valorUsd: null }, { periodo: '2026-02', valorUsd: 2_000 }],
    [compra('2026-01-10', 1_000)],
  );
  assert.equal(puntos[0].resultadoUsd, null);
  assert.equal(puntos[0].retornoPct, null);
  assert.equal(puntos[0].aportadoUsd, 1_000, 'el aporte se sabe igual');
});

test('sin aporte no se calcula un porcentaje', () => {
  // Dividir por cero daria Infinity y la pantalla mostraria un absurdo.
  const { puntos } = historial([{ periodo: '2026-01', valorUsd: 500 }], []);
  assert.equal(puntos[0].retornoPct, null);
  assert.equal(puntos[0].resultadoUsd, 500);
});

test('los periodos salen ordenados aunque entren mezclados', () => {
  const { puntos } = historial(
    [{ periodo: '2026-03', valorUsd: 3 }, { periodo: '2026-01', valorUsd: 1 }],
    [],
  );
  assert.deepEqual(puntos.map(p => p.periodo), ['2026-01', '2026-03']);
});

test('un periodo mal formado se descarta', () => {
  const { puntos } = historial([{ periodo: '2026-13', valorUsd: 1 }], []);
  assert.equal(puntos.length, 0);
});

test('con un solo punto no hay variacion que calcular', () => {
  assert.equal(variacion(historial([SNAPS[0]], []).puntos), null);
  assert.equal(variacion([]), null);
});
