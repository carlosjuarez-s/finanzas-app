import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => { let v = c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if ('text' in v) v = v.text; else if (v instanceof Date) return v; else v = null; } return v; };
const f = [];
ws.eachRow({ includeEmpty: false }, (row, n) => { if (n === 1) return;
  f.push({ n, nombre: String(val(row.getCell(1)) ?? '').trim(), tipo: String(val(row.getCell(2)) ?? '').trim(),
    subtipo: String(val(row.getCell(3)) ?? '').trim(), mes: String(val(row.getCell(4)) ?? '').trim(),
    costo: Number(val(row.getCell(6))) });
});
const num = (r) => Number.isFinite(r.costo) ? r.costo : 0;
const SALARIALES = /^(Salario|Salario USD|Sueldo Cambio en D|Extra Salario USD|Aguinaldo)/i;
const grupos = {
  'sueldo (Ingreso salarial)': f.filter(r => r.tipo === 'Ingreso' && SALARIALES.test(r.nombre)),
  'otros Ingreso': f.filter(r => r.tipo === 'Ingreso' && !SALARIALES.test(r.nombre)),
  'Reingreso': f.filter(r => r.tipo === 'Reingreso'),
  'Egreso Tarjeta': f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Tarjeta'),
  'Egreso Prestamo': f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Prestamo'),
  'Egreso Inversion': f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Inversion'),
  'Egreso resto': f.filter(r => r.tipo === 'Egreso' && !['Tarjeta','Prestamo','Inversion'].includes(r.subtipo)),
};
const fmt = (n) => Math.round(n).toLocaleString('es-AR');
for (const [k, rs] of Object.entries(grupos)) {
  console.log(`${k.padEnd(28)} ${String(rs.length).padStart(4)} filas   $ ${fmt(rs.reduce((s,r)=>s+Math.abs(num(r)),0)).padStart(14)}`);
}
const totIng = grupos['sueldo (Ingreso salarial)'].reduce((s,r)=>s+Math.abs(num(r)),0);
const totRe = grupos['Reingreso'].reduce((s,r)=>s+Math.abs(num(r)),0) + grupos['otros Ingreso'].reduce((s,r)=>s+Math.abs(num(r)),0);
console.log(`\nlo no-salarial es el ${(totRe/totIng*100).toFixed(1)}% del ingreso salarial total`);
console.log('\n=== todos los Reingreso ===');
for (const r of grupos['Reingreso']) console.log(`r${String(r.n).padStart(3)} ${r.mes.padEnd(11)} ${r.nombre.padEnd(32)} ${fmt(num(r)).padStart(12)}`);
