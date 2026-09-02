import test from 'node:test';
import assert from 'node:assert/strict';
import { estimar, mediana, proximoPeriodo, type MesHistorico } from './estimacion';
import type { Prestamo } from './prestamos';

const mes = (periodo: string, cats: Record<string, number>): MesHistorico => ({
  periodo, porCategoria: cats,
  gastoTotalArs: Object.values(cats).reduce((s, v) => s + v, 0),
});

const SEIS: MesHistorico[] = [
  mes('2026-03', { Alquiler: 500_000, 'Supermercado y comida': 300_000, Servicios: 90_000 }),
  mes('2026-04', { Alquiler: 500_000, 'Supermercado y comida': 320_000, Servicios: 95_000 }),
  mes('2026-05', { Alquiler: 550_000, 'Supermercado y comida': 310_000, Servicios: 88_000 }),
  mes('2026-06', { Alquiler: 550_000, 'Supermercado y comida': 340_000, Servicios: 92_000, Educacion: 200_000 }),
  mes('2026-07', { Alquiler: 550_000, 'Supermercado y comida': 330_000, Servicios: 91_000 }),
  mes('2026-08', { Alquiler: 600_000, 'Supermercado y comida': 350_000, Servicios: 94_000 }),
];

const credito: Prestamo = {
  id: 'p1', nombre: 'Heladera', entidad: 'Frávega', montoOtorgado: null,
  cuotas: 12, cuotaArs: 45_000, primerPeriodo: '2026-06',
  moneda: 'ARS', cftAnual: null, canceladoEn: null,
};

test('la mediana aguanta un mes raro donde el promedio se corre', () => {
  // Un gasto excepcional no puede inflar la estimacion de todos los meses.
  assert.equal(mediana([100, 100, 100, 100, 5000]), 100);
  assert.equal(mediana([10, 20, 30, 40]), 25);
  assert.equal(mediana([]), 0);
});

test('lo que aparece todos los meses cuenta como recurrente', () => {
  const e = estimar('2026-09', SEIS, [], 2_000_000);
  const alquiler = e.lineas.find(l => l.categoria === 'Alquiler')!;
  assert.equal(alquiler.base, 'recurrente');
  assert.equal(alquiler.mesesConDato, 6);
  assert.equal(alquiler.montoArs, 550_000);   // mediana, no el ultimo ni el promedio
});

test('lo que aparecio una sola vez cuenta como variable', () => {
  const e = estimar('2026-09', SEIS, [], 2_000_000);
  const educacion = e.lineas.find(l => l.categoria === 'Educacion')!;
  assert.equal(educacion.base, 'variable');
  assert.equal(educacion.mesesConDato, 1);
});

test('las cuotas comprometidas entran aparte, porque no son una prediccion', () => {
  const e = estimar('2026-09', SEIS, [credito], 2_000_000);
  assert.equal(e.comprometidoArs, 45_000);
  const linea = e.lineas.find(l => l.base === 'comprometido')!;
  assert.equal(linea.montoArs, 45_000);
});

test('la categoria Cuotas del historico no se duplica con los prestamos', () => {
  // Es la mas facil de contar dos veces: aparece en el cierre Y en el plan.
  const conCuotas = [...SEIS, mes('2026-08b', { Cuotas: 45_000, Alquiler: 600_000 })];
  const e = estimar('2026-09', conCuotas, [credito], 2_000_000);
  assert.equal(e.lineas.filter(l => l.categoria === 'Cuotas').length, 0);
  assert.equal(e.comprometidoArs, 45_000);
});

test('una cuota que ya termino no se estima', () => {
  const terminado = { ...credito, cuotas: 2 };   // junio y julio nomas
  const e = estimar('2026-09', SEIS, [terminado], 2_000_000);
  assert.equal(e.comprometidoArs, 0);
});

test('el total es la suma de las tres partes', () => {
  const e = estimar('2026-09', SEIS, [credito], 2_000_000);
  assert.equal(e.totalArs, e.comprometidoArs + e.recurrenteArs + e.variableArs);
  assert.equal(e.ahorroEstimadoArs, 2_000_000 - e.totalArs);
});

test('sin historial solo se afirma lo comprometido, y se avisa', () => {
  const e = estimar('2026-09', [], [credito], 2_000_000);
  assert.equal(e.totalArs, 45_000);
  assert.equal(e.mesesUsados, 0);
  assert.match(e.advertencias.join(' '), /No hay ningún mes cerrado/);
});

test('con poco historial se dice que la estimacion es floja', () => {
  const e = estimar('2026-09', SEIS.slice(0, 2), [], 2_000_000);
  assert.match(e.advertencias.join(' '), /2 meses de historial/);
});

test('un mes sin tipo de cambio queda afuera y se avisa', () => {
  // Su gasto esta a medias: incluirlo correria la mediana hacia abajo.
  const roto: MesHistorico = { periodo: '2026-09', porCategoria: { Alquiler: 1 }, gastoTotalArs: null };
  const e = estimar('2026-10', [...SEIS, roto], [], 2_000_000);
  assert.equal(e.mesesUsados, 6);
  assert.match(e.advertencias.join(' '), /sin tipo de cambio/);
});

test('sin sueldo no se inventa cuanto te quedaria', () => {
  const e = estimar('2026-09', SEIS, [], null);
  assert.equal(e.ahorroEstimadoArs, null);
  assert.match(e.advertencias.join(' '), /Sin un sueldo cargado/);
});

test('se estima el mes siguiente al ultimo cerrado', () => {
  assert.equal(proximoPeriodo('2026-08', '2026-08'), '2026-09');
  assert.equal(proximoPeriodo('2026-12', '2026-12'), '2027-01');
  // Si el ultimo cierre quedo viejo, igual se estima el mes que viene de hoy.
  assert.equal(proximoPeriodo('2025-01', '2026-08'), '2026-09');
  assert.equal(proximoPeriodo(undefined, '2026-08'), '2026-09');
});
