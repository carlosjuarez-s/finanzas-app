import ExcelJS from 'exceljs';
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('/root/.claude/uploads/417aa9cb-aeeb-5903-8532-3bace6979da6/453b3572-Finanzas_.xlsx');
console.log('hojas:', wb.worksheets.length);
for (const ws of wb.worksheets) {
  console.log(`\n=== "${ws.name}"  filas=${ws.rowCount} cols=${ws.columnCount} ===`);
  let vistas = 0;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (vistas >= 12) return;
    const celdas = [];
    row.eachCell({ includeEmpty: true }, (c, i) => {
      let v = c.value;
      if (v && typeof v === 'object') {
        if ('result' in v) v = `=${v.formula}→${v.result}`;
        else if ('text' in v) v = v.text;
        else if (v instanceof Date) v = v.toISOString().slice(0, 10);
        else v = JSON.stringify(v);
      }
      celdas.push(`${i}:${v === null || v === undefined ? '' : String(v).slice(0, 30)}`);
    });
    console.log(`  r${n} | ${celdas.join(' | ')}`);
    vistas++;
  });
}
