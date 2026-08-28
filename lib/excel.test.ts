import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { excelATexto, celdaATexto, esArchivoExcel, ErrorExcel, MAX_BYTES } from './excel';

/** Arma un .xlsx de verdad en memoria: nada de simular el parseo. */
async function planilla(hojas: Record<string, unknown[][]>): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  for (const [nombre, filas] of Object.entries(hojas)) {
    const h = libro.addWorksheet(nombre);
    for (const f of filas) h.addRow(f);
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

test('una planilla simple sale como tabla legible', async () => {
  const texto = await excelATexto(await planilla({
    Movimientos: [
      ['Fecha', 'Comercio', 'Monto'],
      ['2026-08-01', 'Supermercado', 45000],
      ['2026-08-03', 'Farmacia', 12500],
    ],
  }));
  assert.match(texto, /## Hoja: Movimientos/);
  assert.match(texto, /Fecha \| Comercio \| Monto/);
  assert.match(texto, /2026-08-01 \| Supermercado \| 45000/);
});

test('cada hoja va con su nombre, porque suele ser el mes o la cuenta', async () => {
  const texto = await excelATexto(await planilla({
    Enero: [['a', 1]],
    Febrero: [['b', 2]],
  }));
  assert.match(texto, /## Hoja: Enero/);
  assert.match(texto, /## Hoja: Febrero/);
  assert.ok(texto.indexOf('Enero') < texto.indexOf('Febrero'), 'mantiene el orden del libro');
});

test('las hojas vacias no ensucian el texto', async () => {
  const texto = await excelATexto(await planilla({
    Datos: [['x', 1]],
    Vacia: [],
    Notas: [[''], ['']],
  }));
  assert.match(texto, /## Hoja: Datos/);
  assert.doesNotMatch(texto, /Vacia/);
  assert.doesNotMatch(texto, /Notas/);
});

test('una planilla sin ningun dato avisa en vez de mandar vacio al modelo', async () => {
  const vacia = await planilla({ Hoja1: [] });
  await assert.rejects(
    () => excelATexto(vacia),
    (e: Error) => e instanceof ErrorExcel && /no tiene ninguna fila/.test(e.message),
  );
});

test('un archivo que no es una planilla da un error accionable', async () => {
  await assert.rejects(
    () => excelATexto(Buffer.from('esto no es un xlsx')),
    (e: Error) => {
      assert.ok(e instanceof ErrorExcel);
      // El caso comun: un .xls viejo. El mensaje tiene que decir que hacer.
      assert.match(e.message, /\.xls viejo|CSV/);
      return true;
    },
  );
});

test('un archivo enorme se rechaza antes de parsearlo', async () => {
  // Un zip chico puede descomprimir a cientos de megas: el tope va antes.
  await assert.rejects(
    () => excelATexto(Buffer.alloc(MAX_BYTES + 1)),
    (e: Error) => e instanceof ErrorExcel && /máximo es 8 MB/.test(e.message),
  );
});

test('las fechas salen como YYYY-MM-DD y no como timestamp', () => {
  assert.equal(celdaATexto(new Date('2026-08-27T00:00:00Z')), '2026-08-27');
});

test('de una formula interesa el resultado', () => {
  assert.equal(celdaATexto({ formula: 'SUM(A1:A5)', result: 57500 }), '57500');
});

test('el texto con formato se junta en una sola cadena', () => {
  // Excel parte una celda en pedazos cuando tiene negrita en el medio.
  assert.equal(celdaATexto({ richText: [{ text: 'Super' }, { text: 'mercado' }] }), 'Supermercado');
});

test('un error de celda no se lee como dato', () => {
  // "#N/A" no es un valor: mandarlo como texto le hace inventar cosas al modelo.
  assert.equal(celdaATexto({ error: '#N/A' }), '');
  assert.equal(celdaATexto(null), '');
  assert.equal(celdaATexto(undefined), '');
});

test('reconoce la planilla por extension y por mimetype', () => {
  assert.equal(esArchivoExcel('resumen.xlsx', ''), true);
  assert.equal(esArchivoExcel('macro.xlsm', ''), true);
  assert.equal(esArchivoExcel('sin-extension', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true);
  assert.equal(esArchivoExcel('resumen.csv', 'text/csv'), false);
  assert.equal(esArchivoExcel('resumen.pdf', 'application/pdf'), false);
});
