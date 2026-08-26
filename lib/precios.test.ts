import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valorCedear } from './precios';

// De este modulo casi todo depende de la red, que no esta disponible en
// desarrollo. Lo que SI se puede probar es la aritmetica del CEDEAR, que es la
// parte propia y la que se puede equivocar en silencio: invertir la division
// daria un valor 400 veces mayor y nadie lo notaria mirando el codigo.

test('un CEDEAR vale el subyacente dividido por su ratio', () => {
  // Apple cotiza a USD 250 y el ratio es 20:1, asi que un CEDEAR vale 12,50.
  assert.equal(valorCedear(250, 20), 12.5);
  // Amazon a USD 216 con ratio 144:1.
  assert.equal(valorCedear(216, 144), 1.5);
  // Ratio 1:1: el CEDEAR vale lo mismo que la accion.
  assert.equal(valorCedear(180, 1), 180);
});

test('la division va en ese sentido y no al reves', () => {
  // Con ratio 20, invertir la division daria 5000 en vez de 12,50.
  const v = valorCedear(250, 20)!;
  assert.ok(v < 250, 'un CEDEAR nunca vale mas que la accion que representa');
});

test('un ratio o un precio invalido devuelven null, no un numero raro', () => {
  assert.equal(valorCedear(250, 0), null);
  assert.equal(valorCedear(250, -1), null);
  assert.equal(valorCedear(0, 20), null);
  assert.equal(valorCedear(NaN, 20), null);
  assert.equal(valorCedear(250, NaN), null);
});

test('el valor del CEDEAR es consistente con el cambio de ratio', () => {
  // Si el ratio pasa de 5 a 20 (la CNV cambia el ratio), el valor por unidad
  // baja a la cuarta parte. Es el mismo factor que ajusta el costo de entrada:
  // por eso el resultado da cero y no una perdida inventada.
  const antes = valorCedear(250, 5)!;
  const despues = valorCedear(250, 20)!;
  assert.equal(antes / despues, 4);
});
