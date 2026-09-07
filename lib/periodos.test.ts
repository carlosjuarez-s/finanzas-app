import test from 'node:test';
import assert from 'node:assert/strict';
import { vecino, conMesActual } from './periodos';

// La lista viene del mas nuevo al mas viejo, que es como se muestra.
const MESES = ['2026-09', '2026-08', '2026-07', '2026-06'];

test('el mes anterior esta mas adelante en la lista, no atras', () => {
  assert.equal(vecino(MESES, '2026-08', 'anterior'), '2026-07');
  assert.equal(vecino(MESES, '2026-08', 'siguiente'), '2026-09');
});

test('en las puntas no hay vecino', () => {
  assert.equal(vecino(MESES, '2026-09', 'siguiente'), null);
  assert.equal(vecino(MESES, '2026-06', 'anterior'), null);
});

test('un mes que no esta en la lista no tiene vecinos', () => {
  assert.equal(vecino(MESES, '2020-01', 'anterior'), null);
});

test('el mes en curso siempre se puede abrir, tenga datos o no', () => {
  // Es el mes que uno mas quiere ver, y es justo el que todavia no tiene nada.
  assert.deepEqual(conMesActual(['2026-08', '2026-07'], '2026-09'), ['2026-09', '2026-08', '2026-07']);
});

test('si el mes en curso ya tiene datos no se duplica', () => {
  assert.deepEqual(conMesActual(['2026-09', '2026-08'], '2026-09'), ['2026-09', '2026-08']);
});

test('sin ningun dato, la lista es el mes en curso solo', () => {
  assert.deepEqual(conMesActual([], '2026-09'), ['2026-09']);
});
