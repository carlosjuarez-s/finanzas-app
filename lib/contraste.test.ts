import test from 'node:test';
import assert from 'node:assert/strict';
import { contraste, PARES, MINIMO } from '../scripts/contraste.mjs';

/**
 * El contraste es medible, asi que se mide en vez de confiar en el ojo.
 *
 * Los dos que estaban rotos parecian bien: --tinta-suave en 4.46 y --alerta en
 * 3.78. Como fallar por poco no se ve, un test es la unica forma de que no
 * vuelva a pasar cuando alguien retoque la paleta.
 */
test('todos los colores de texto pasan WCAG AA sobre su fondo', () => {
  const fallas = (PARES as [string, string, string][])
    .map(([n, fg, bg]) => [n, contraste(fg, bg) as number] as const)
    .filter(([, r]) => r < MINIMO)
    .map(([n, r]) => `${n}: ${r.toFixed(2)}:1`);

  assert.deepEqual(fallas, [], `\n${fallas.join('\n')}\n`);
});

test('el calculo de contraste da los valores conocidos', () => {
  // Sin esto el test de arriba podria pasar por estar midiendo mal.
  assert.equal(Math.round(contraste('#000000', '#FFFFFF')), 21);
  assert.equal(contraste('#FFFFFF', '#FFFFFF'), 1);
  // Es simetrico: el orden de los colores no cambia el resultado.
  assert.equal(contraste('#22262B', '#F5F2EA'), contraste('#F5F2EA', '#22262B'));
});

test('el umbral es el de AA para texto normal', () => {
  assert.equal(MINIMO, 4.5);
});
