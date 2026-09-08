import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtArs, fmtUsd, fmtNumEntero, fmtNum1, fmtNumConSigno, agruparMiles, desagruparMiles } from './formato';

test('nada se muestra como "-0"', () => {
  // Un rendimiento de -1e-12 redondeado a entero es cero. Con el signo puesto
  // se lee como una perdida que no existio.
  assert.equal(fmtNumEntero(-1e-12), '0');
  assert.equal(fmtNumEntero(-0.4), '0');
  assert.equal(fmtNumEntero(-0), '0');
  assert.equal(fmtNum1(-0.01), '0,0');
  assert.equal(fmtArs(-0.001), '$ 0,00');
  assert.equal(fmtUsd(-0), 'U$S 0,00');
  // Pero medio peso para abajo sigue siendo medio peso: no se borra un negativo
  // de verdad.
  assert.equal(fmtNumEntero(-0.6), '-1');
});

test('el signo se decide sobre el numero redondeado', () => {
  assert.equal(fmtNumConSigno(1250), '+1.250');
  assert.equal(fmtNumConSigno(-1250), '-1.250');
  // +0,4 y -0,4 son el mismo cero: tienen que escribirse igual.
  assert.equal(fmtNumConSigno(0.4), fmtNumConSigno(-0.4));
  assert.equal(fmtNumConSigno(0), '0');
});

test('los campos de monto agrupan y desagrupan a la argentina', () => {
  assert.equal(agruparMiles(450080), '450.080');
  assert.equal(agruparMiles(undefined), '');
  assert.equal(agruparMiles(''), '');
  // Lo que se escribe en el campo vuelve como numero, con la coma decimal.
  assert.equal(desagruparMiles('450.080'), 450080);
  assert.equal(desagruparMiles('1.234,56'), 1234.56);
  assert.equal(desagruparMiles('$ 450.080'), 450080);
  assert.equal(desagruparMiles(undefined), 0);
  // Ida y vuelta: lo que muestra el campo tiene que poder leerse de nuevo.
  assert.equal(desagruparMiles(agruparMiles(1552000)), 1552000);
});
