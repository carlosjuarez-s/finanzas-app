import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidar, reparto, tasaAhorro } from './bimoneda';

test('las dos partes se suman al tipo de cambio dado', () => {
  const c = consolidar({ ars: 300_000, usd: 1_000 }, 1_450);
  assert.equal(c.totalArs, 300_000 + 1_450_000);
  assert.equal(c.tipoCambio, 1_450);
});

test('sin parte en dolares no hace falta tipo de cambio', () => {
  // Pedirlo seria inventar un requisito que el dato no tiene.
  const c = consolidar({ ars: 500_000, usd: 0 }, null);
  assert.equal(c.totalArs, 500_000);
  assert.equal(c.tipoCambio, null);
});

test('con dolares y sin tipo de cambio el total es null, no la parte en pesos', () => {
  // Mostrar 300.000 cuando ademas hay USD 1.000 sin convertir es peor que
  // mostrar "—": el numero parece completo y no lo esta.
  const c = consolidar({ ars: 300_000, usd: 1_000 }, null);
  assert.equal(c.totalArs, null);
  assert.equal(c.ars, 300_000);
  assert.equal(c.usd, 1_000);
});

test('un tipo de cambio invalido se trata como ausente', () => {
  for (const tc of [0, -100, NaN, undefined]) {
    assert.equal(consolidar({ ars: 1, usd: 1 }, tc as number).totalArs, null, `tc=${tc}`);
  }
});

test('valores rotos no propagan NaN al total', () => {
  const c = consolidar({ ars: NaN, usd: 1_000 }, 1_450);
  assert.equal(c.totalArs, 1_450_000);
});

test('el reparto dice cuanto pesa cada moneda', () => {
  // 70/30 es justo el caso de un sueldo partido.
  const c = consolidar({ ars: 300_000, usd: 500 }, 1_400);   // 300k + 700k = 1M
  const r = reparto(c)!;
  assert.equal(Math.round(r.pctArs), 30);
  assert.equal(Math.round(r.pctUsd), 70);
});

test('sin total no hay reparto que calcular', () => {
  assert.equal(reparto(consolidar({ ars: 1, usd: 1 }, null)), null);
  assert.equal(reparto(consolidar({ ars: 0, usd: 0 }, 1_400)), null);
});

test('sin ingreso la tasa de ahorro es null y no cero', () => {
  // No saber cuanto ahorraste y haber ahorrado cero son cosas distintas.
  assert.equal(tasaAhorro(null, 100), null);
  assert.equal(tasaAhorro(0, 100), null);
  assert.equal(tasaAhorro(1_000_000, 200_000), 20);
  assert.equal(tasaAhorro(1_000_000, -50_000), -5);
});
