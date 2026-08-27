import test from 'node:test';
import assert from 'node:assert/strict';
import { ALICUOTA_PERCEPCION, pesoSobreGasto } from './impuestos';

test('la alicuota esta en un solo lugar y es la vigente', () => {
  assert.equal(ALICUOTA_PERCEPCION, 0.30);
});

test('el peso sobre el gasto dimensiona la percepcion', () => {
  assert.equal(pesoSobreGasto(50_000, 1_000_000), 5);
  assert.equal(pesoSobreGasto(0, 1_000_000), 0);
});

test('sin gasto no se puede calcular un porcentaje, y eso no es cero', () => {
  // Dividir por cero daria Infinity y la pantalla mostraria un numero absurdo.
  assert.equal(pesoSobreGasto(50_000, 0), null);
  assert.equal(pesoSobreGasto(50_000, NaN), null);
});
