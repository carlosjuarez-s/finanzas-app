import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, encajar, COMODIN, CATEGORIAS_INICIALES } from './categorias';

test('limpia espacios y recorta las demasiado largas', () => {
  const r = normalizar(['  Comida  ', 'Transporte\t\ty  taxi', 'x'.repeat(80)]);
  assert.equal(r[0], 'Comida');
  assert.equal(r[1], 'Transporte y taxi');
  assert.equal(r[2].length, 40);
});

test('no deja duplicados aunque cambien las mayusculas', () => {
  // "Comida" y "comida" serian dos columnas del mismo gasto en cada grafico.
  assert.deepEqual(normalizar(['Comida', 'comida', 'COMIDA']), ['Comida', COMODIN]);
});

test('siempre queda "Otros", aunque no la manden', () => {
  // Es donde cae lo que el modelo no supo clasificar: sin ella se pierde.
  assert.ok(normalizar(['Comida']).includes(COMODIN));
  assert.ok(normalizar([]).includes(COMODIN));
});

test('no la duplica si ya venia', () => {
  assert.deepEqual(normalizar(['Comida', 'Otros']), ['Comida', 'Otros']);
  assert.equal(normalizar(['otros']).filter(c => c.toLowerCase() === 'otros').length, 1);
});

test('descarta lo que no es texto sin romperse', () => {
  assert.deepEqual(normalizar([null, 42, {}, 'Comida', undefined]), ['Comida', COMODIN]);
  assert.deepEqual(normalizar('no es lista'), [COMODIN]);
  assert.deepEqual(normalizar(null), [COMODIN]);
});

test('pone un tope: una lista de mil categorias no es una lista', () => {
  assert.equal(normalizar(Array.from({ length: 200 }, (_, i) => `c${i}`)).length, 41);
});

test('encaja lo que devuelve el modelo contra las del usuario', () => {
  const cats = ['Supermercado y comida', 'Educacion', 'Otros'];
  assert.equal(encajar('Supermercado y comida', cats), 'Supermercado y comida');
  assert.equal(encajar('supermercado y comida', cats), 'Supermercado y comida');
});

test('los acentos no parten el gasto en dos columnas', () => {
  // El modelo escribe "Educación" y la lista dice "Educacion": es la misma.
  const cats = ['Educacion', 'Otros'];
  assert.equal(encajar('Educación', cats), 'Educacion');
  assert.equal(encajar('EDUCACIÓN', cats), 'Educacion');
});

test('una categoria inventada cae en el comodin, no se agrega sola', () => {
  const cats = ['Comida', 'Otros'];
  assert.equal(encajar('Criptomonedas exoticas', cats), COMODIN);
  assert.equal(encajar('', cats), COMODIN);
  assert.equal(encajar(null, cats), COMODIN);
  assert.equal(encajar(123, cats), COMODIN);
});

test('las iniciales son un punto de partida usable', () => {
  assert.ok(CATEGORIAS_INICIALES.length >= 10);
  assert.ok((CATEGORIAS_INICIALES as readonly string[]).includes(COMODIN));
});
