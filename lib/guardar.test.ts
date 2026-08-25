import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodoValido } from './guardar';
import { tablaFaltante, mensajeDeError } from './errores';

// Lo que devuelve el modelo es entrada no confiable: estos casos son los que
// tumbaban el guardado entero cuando un campo no venia como se esperaba.

test('periodoValido acepta solo YYYY-MM real', () => {
  for (const bueno of ['2026-01', '2026-09', '2026-12']) {
    assert.equal(periodoValido(bueno), true, bueno);
  }
  for (const malo of ['2026-13', '2026-00', '2026-9', 'septiembre 2026', '2026', '', null, undefined, 42]) {
    assert.equal(periodoValido(malo), false, String(malo));
  }
});

test('tablaFaltante reconoce el 42P01 y no confunde otros errores', () => {
  const falta = Object.assign(new Error('relation "monthly_closes" does not exist'), { code: '42P01' });
  assert.equal(tablaFaltante(falta), 'monthly_closes');

  // El driver de Neon a veces lo envuelve en cause.
  const envuelto = Object.assign(new Error('Failed query'), {
    cause: Object.assign(new Error('relation "goals" does not exist'), { code: '42P01' }),
  });
  assert.equal(tablaFaltante(envuelto), 'goals');

  assert.equal(tablaFaltante(new Error('cualquier otra cosa')), null);
  assert.equal(tablaFaltante(Object.assign(new Error('x'), { code: '23505' })), null);
});

test('mensajeDeError explica que hacer cuando falta la tabla', () => {
  const falta = Object.assign(new Error('relation "settings" does not exist'), { code: '42P01' });
  assert.match(mensajeDeError(falta), /settings/);
  assert.match(mensajeDeError(falta), /migraci/i);
  // Un error normal se muestra tal cual, sin disfrazarlo.
  assert.equal(mensajeDeError(new Error('timeout')), 'timeout');
});
