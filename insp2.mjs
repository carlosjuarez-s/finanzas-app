import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => {
  let v = c.value;
  if (v && typeof v === 'object') {
    if ('result' in v) v = v.result;
    else if ('text' in v) v = v.text;
    else if (v instanceof Date) return v;
    else v = null;
  }
  return v;
};
const filas = [];
ws.eachRow({ includeEmpty: false }, (row, n) => {
  if (n === 1) return;
  filas.push({
    n,
    nombre: val(row.getCell(1)),
    tipo: val(row.getCell(2)),
    subtipo: val(row.getCell(3)),
    mes: val(row.getCell(4)),
    status: val(row.getCell(5)),
    costo: val(row.getCell(6)),
    pagadas: val(row.getCell(7)),
    totales: val(row.getCell(8)),
    desc: val(row.getCell(9)),
    venc: val(row.getCell(10)),
  });
});
console.log('filas con contenido:', filas.length);
const cuenta = (campo) => {
  const m = new Map();
  for (const f of filas) { const k = String(f[campo] ?? '(vacio)').trim(); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a,b) => b[1]-a[1]);
};
console.log('\nTIPO:', JSON.stringify(cuenta('tipo')));
console.log('\nSTATUS:', JSON.stringify(cuenta('status')));
console.log('\nMES:', JSON.stringify(cuenta('mes')));
console.log('\nSUBTIPO:', JSON.stringify(cuenta('subtipo').slice(0,25)));
const vencs = filas.map(f => f.venc).filter(Boolean);
console.log('\nvencimientos: ', vencs.length, 'tipos:', [...new Set(vencs.map(v => v instanceof Date ? 'Date' : typeof v))]);
const fechas = vencs.filter(v => v instanceof Date).map(v => v.toISOString().slice(0,10)).sort();
console.log('rango fechas Date:', fechas[0], '→', fechas[fechas.length-1], `(${fechas.length})`);
const textos = vencs.filter(v => !(v instanceof Date));
console.log('vencimientos como texto (ejemplos):', JSON.stringify(textos.slice(0,10)));
console.log('sin vencimiento:', filas.filter(f => !f.venc).length);
