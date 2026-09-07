import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => { let v = c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if ('text' in v) v = v.text; else if (v instanceof Date) return v; else v = null; } return v; };
const f = [];
ws.eachRow({ includeEmpty: false }, (row, n) => { if (n === 1) return;
  f.push({ n, nombre: String(val(row.getCell(1)) ?? '').trim(), tipo: String(val(row.getCell(2)) ?? '').trim(),
    subtipo: String(val(row.getCell(3)) ?? '').trim(), mes: String(val(row.getCell(4)) ?? '').trim(),
    status: String(val(row.getCell(5)) ?? '').trim(), costo: val(row.getCell(6)),
    desc: String(val(row.getCell(9)) ?? '').trim() });
});
const cuenta = (rs, campo='nombre') => { const m = new Map(); for (const r of rs) m.set(r[campo], (m.get(r[campo]) ?? 0) + 1); return [...m.entries()].sort((a,b)=>b[1]-a[1]); };
console.log('=== INGRESO: nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Ingreso')).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== REINGRESO: nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Reingreso')).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== EGRESO subtipo=Tarjeta: nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Tarjeta')).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== EGRESO subtipo=Prestamo: nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Prestamo')).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== EGRESO subtipo=Inversion: nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Egreso' && r.subtipo === 'Inversion')).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== EGRESO Gasto Mensual + vacio: top 40 nombres ===');
console.log(cuenta(f.filter(r => r.tipo === 'Egreso' && r.subtipo !== 'Tarjeta' && r.subtipo !== 'Prestamo' && r.subtipo !== 'Inversion')).slice(0,40).map(([k,v]) => `${v}x ${k}`).join('\n'));
console.log('\n=== costos positivos en Egreso (sospechosos) ===');
for (const r of f.filter(r => r.tipo === 'Egreso' && typeof r.costo === 'number' && r.costo > 0)) console.log(`  r${r.n} ${r.mes} ${r.nombre} = ${r.costo}`);
console.log('\n=== costos negativos en Ingreso/Reingreso (sospechosos) ===');
for (const r of f.filter(r => (r.tipo === 'Ingreso' || r.tipo === 'Reingreso') && typeof r.costo === 'number' && r.costo < 0)) console.log(`  r${r.n} ${r.mes} ${r.tipo} ${r.nombre} = ${r.costo}`);
console.log('\n=== costo no numerico o vacio ===');
for (const r of f.filter(r => typeof r.costo !== 'number')) console.log(`  r${r.n} ${r.mes} ${r.tipo} "${r.nombre}" costo=${JSON.stringify(r.costo)}`);
