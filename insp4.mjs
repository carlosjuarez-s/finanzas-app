import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
const ws = wb.getWorksheet('Finanzas');
const val = (c) => { let v = c.value; if (v && typeof v === 'object') { if ('result' in v) v = v.result; else if ('text' in v) v = v.text; else if (v instanceof Date) return v; else v = null; } return v; };
const f = [];
ws.eachRow({ includeEmpty: false }, (row, n) => { if (n === 1) return;
  f.push({ n, nombre: val(row.getCell(1)), tipo: val(row.getCell(2)), subtipo: val(row.getCell(3)),
    mes: val(row.getCell(4)), status: val(row.getCell(5)), costo: val(row.getCell(6)),
    pagadas: val(row.getCell(7)), totales: val(row.getCell(8)), desc: val(row.getCell(9)), venc: val(row.getCell(10)) });
});
const p = (r) => `r${r.n} | ${String(r.nombre).slice(0,32).padEnd(32)} | ${String(r.tipo).padEnd(9)} | ${String(r.subtipo ?? '').padEnd(13)} | ${String(r.mes).padEnd(10)} | ${String(r.status).padEnd(11)} | ${String(r.costo).padStart(10)} | ${r.venc instanceof Date ? r.venc.toISOString().slice(0,10) : String(r.venc ?? '')}`;
console.log('--- limite entre 2024 y 2025 (rows 288-302) ---');
for (const r of f.filter(x => x.n >= 288 && x.n <= 302)) console.log(p(r));
console.log('\n--- bloque "Noviembre" con fechas de agosto (rows 246-256) ---');
for (const r of f.filter(x => x.n >= 246 && x.n <= 256)) console.log(p(r));
console.log('\n--- limite 2025/2026 (rows 483-500) ---');
for (const r of f.filter(x => x.n >= 483 && x.n <= 500)) console.log(p(r));
console.log('\n--- ultimas filas (562-580) ---');
for (const r of f.filter(x => x.n >= 562)) console.log(p(r));
