import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => { let v = c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if ('text' in v) v = v.text; else if (v instanceof Date) return v; else v = null; } return v; };
const filas = [];
ws.eachRow({ includeEmpty: false }, (row, n) => {
  if (n === 1) return;
  filas.push({ n, mes: String(val(row.getCell(4)) ?? '').trim(), venc: val(row.getCell(10)), nombre: String(val(row.getCell(1)) ?? '').trim() });
});
// Secuencia de meses por orden de fila: run-length
const runs = [];
for (const f of filas) {
  if (!runs.length || runs[runs.length-1].mes !== f.mes) runs.push({ mes: f.mes, desde: f.n, hasta: f.n, n: 1, fechas: [] });
  else { const r = runs[runs.length-1]; r.hasta = f.n; r.n++; }
  const r = runs[runs.length-1];
  if (f.venc instanceof Date) r.fechas.push(f.venc.toISOString().slice(0,10));
  else if (typeof f.venc === 'string' && f.venc.trim()) r.fechas.push(f.venc.trim());
}
console.log('bloques de mes en orden de fila:', runs.length);
for (const r of runs) {
  const muestra = [...new Set(r.fechas)].slice(0,2).join(' , ');
  console.log(`  filas ${String(r.desde).padStart(3)}-${String(r.hasta).padStart(3)} (${String(r.n).padStart(3)})  ${r.mes.padEnd(12)} ${muestra}`);
}
