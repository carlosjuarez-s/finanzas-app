/**
 * Lee la planilla de Finanzas y emite el SQL para pegar en Neon.
 *
 * Uso: npx tsx scripts/planilla.ts <archivo.xlsx> <usuario_id> [anio_inicial]
 *
 * No escribe en la base: emite SQL. Es la misma regla que las migraciones —
 * lo que toca datos reales lo corre una persona mirando lo que corre.
 */
import ExcelJS from 'exceljs';
import { asignarAnios, verificar, interpretar, aSql, type Cruda } from '../lib/planilla';

const [archivo, usuarioId, anioTxt] = process.argv.slice(2);
if (!archivo || !usuarioId) {
  console.error('uso: tsx scripts/planilla.ts <archivo.xlsx> <usuario_id> [anio_inicial]');
  process.exit(1);
}
const anioInicial = Number(anioTxt ?? 2024);

const celda = (c: ExcelJS.Cell): unknown => {
  let v: unknown = c.value;
  if (v && typeof v === 'object') {
    if ('result' in (v as object)) v = (v as { result: unknown }).result;
    else if (v instanceof Date) return v;
    else if ('text' in (v as object)) v = (v as { text: unknown }).text;
    else v = null;
  }
  return v;
};
const txt = (c: ExcelJS.Cell) => String(celda(c) ?? '').trim();

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(archivo);
const ws = wb.getWorksheet('Finanzas');
if (!ws) throw new Error('La planilla no tiene una hoja "Finanzas".');

const filas: Cruda[] = [];
ws.eachRow({ includeEmpty: false }, (row, n) => {
  if (n === 1) return;
  const venc = celda(row.getCell(10));
  let anioVenc: number | null = null;
  if (venc instanceof Date) anioVenc = venc.getUTCFullYear();
  else if (typeof venc === 'string') {
    const m = /\b(20\d{2})\b/.exec(venc);
    if (m) anioVenc = Number(m[1]);
  }
  filas.push({
    fila: n,
    nombre: txt(row.getCell(1)), tipo: txt(row.getCell(2)), subtipo: txt(row.getCell(3)),
    mes: txt(row.getCell(4)), status: txt(row.getCell(5)), costo: celda(row.getCell(6)),
    desc: txt(row.getCell(9)), anioVencimiento: anioVenc,
  });
});

const anios = asignarAnios(filas, anioInicial);
const hoy = new Date();
const v = verificar(filas, anios, { anio: hoy.getUTCFullYear(), mes: hoy.getUTCMonth() + 1 });
if (!v.ok) {
  console.error('La inferencia de años no cierra, no se emite nada:\n  ' + v.motivo);
  process.exit(2);
}

const r = interpretar(filas, anios);
console.error(`filas leidas:      ${filas.length}`);
console.error(`sueldos:           ${r.sueldos.length}`);
console.error(`resumenes tarjeta: ${r.resumenes.length}`);
console.error(`gastos:            ${r.gastos.length}`);
console.error(`rectificaciones:   ${r.rectificaciones.length}`);
console.error(`descartes:         ${r.descartes.length}`);
console.error(`periodos:          ${r.periodos[0]} → ${r.periodos[r.periodos.length - 1]} (${r.periodos.length})`);

if (process.env.DETALLE) {
  console.error('\n--- RECTIFICACIONES ---');
  for (const n of r.rectificaciones) console.error(`  r${n.fila} ${n.que}: ${n.detalle}`);
  console.error('\n--- DESCARTES ---');
  for (const n of r.descartes) console.error(`  r${n.fila} ${n.que}: ${n.detalle}`);
}

if (process.env.JSON) console.log(JSON.stringify(r, null, 2));
else console.log(aSql(r, usuarioId));
