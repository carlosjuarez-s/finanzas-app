import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => { let v = c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if ('text' in v) v = v.text; else if (v instanceof Date) return v; else v = null; } return v; };
const f = [];
ws.eachRow({ includeEmpty: false }, (row, n) => { if (n === 1) return;
  f.push({ n, nombre: String(val(row.getCell(1)) ?? '').trim(), tipo: String(val(row.getCell(2)) ?? '').trim(),
    subtipo: String(val(row.getCell(3)) ?? '').trim(), mes: String(val(row.getCell(4)) ?? '').trim(),
    status: String(val(row.getCell(5)) ?? '').trim(), costo: val(row.getCell(6)), desc: String(val(row.getCell(9)) ?? '').trim() });
});
console.log('=== todas las filas "Dolares" (tarjetas en USD) ===');
for (const r of f.filter(r => /dolar/i.test(r.nombre))) console.log(`r${String(r.n).padStart(3)} ${r.mes.padEnd(11)} ${r.nombre.padEnd(38)} ${String(r.costo).padStart(12)}  ${r.desc.slice(0,30)}`);
console.log('\n=== todos los ingresos, en orden de fila ===');
for (const r of f.filter(r => r.tipo === 'Ingreso')) console.log(`r${String(r.n).padStart(3)} ${r.mes.padEnd(11)} ${r.nombre.padEnd(28)} ${String(r.costo).padStart(12)}  ${r.status.padEnd(11)} ${r.desc.slice(0,30)}`);
