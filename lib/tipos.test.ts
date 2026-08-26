import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esArchivoTexto, esArchivoBinario } from './tipos';

// Un export valido rechazado sin motivo es de lo mas frustrante que puede pasar,
// y el mimetype de un .csv es un desastre entre navegadores y sistemas.

test('acepta un CSV venga con el mimetype que venga', () => {
  const casos: [string, string][] = [
    ['operaciones.csv', 'text/csv'],
    ['operaciones.csv', 'application/vnd.ms-excel'],   // lo que manda Windows con Excel instalado
    ['operaciones.csv', 'application/octet-stream'],   // lo que manda cuando no sabe
    ['operaciones.csv', ''],                           // y a veces no manda nada
    ['export.CSV', ''],                                // extension en mayuscula
    ['historial.tsv', 'text/tab-separated-values'],
    ['nota.txt', 'text/plain'],
  ];
  for (const [nombre, mime] of casos) {
    assert.equal(esArchivoTexto(nombre, mime), true, `${nombre} (${mime || 'sin mimetype'})`);
  }
});

test('no confunde un binario con texto', () => {
  assert.equal(esArchivoTexto('resumen.pdf', 'application/pdf'), false);
  assert.equal(esArchivoTexto('boleta.jpg', 'image/jpeg'), false);
  assert.equal(esArchivoTexto('captura.png', 'image/png'), false);
});

test('los binarios soportados se reconocen', () => {
  assert.equal(esArchivoBinario('application/pdf'), true);
  assert.equal(esArchivoBinario('image/webp'), true);
  // Un formato que el modelo no puede leer no se acepta en silencio.
  assert.equal(esArchivoBinario('application/zip'), false);
  assert.equal(esArchivoBinario('video/mp4'), false);
});

test('un nombre sin extension no pasa como texto por accidente', () => {
  assert.equal(esArchivoTexto('archivo', 'application/zip'), false);
  assert.equal(esArchivoTexto('', 'application/zip'), false);
});
