import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesesEntre, sumarMeses, ultimoPeriodo, cuotaEnPeriodo, montoEnPeriodo,
  estado, totalDelMes, periodosConCuota, type Prestamo,
} from './prestamos';

const base: Prestamo = {
  id: 'p1', nombre: 'Prestamo personal', entidad: 'Galicia',
  montoOtorgado: 1_000_000, cuotas: 12, cuotaArs: 120_000,
  primerPeriodo: '2026-03', moneda: 'ARS', cftAnual: 145.5, canceladoEn: null,
};

test('sumar meses cruza el fin de año', () => {
  assert.equal(sumarMeses('2026-11', 1), '2026-12');
  assert.equal(sumarMeses('2026-11', 2), '2027-01');
  assert.equal(sumarMeses('2026-01', -1), '2025-12');
  assert.equal(sumarMeses('2026-03', 0), '2026-03');
});

test('meses entre periodos cuenta en los dos sentidos', () => {
  assert.equal(mesesEntre('2026-03', '2027-03'), 12);
  assert.equal(mesesEntre('2026-12', '2027-01'), 1);
  assert.equal(mesesEntre('2027-01', '2026-12'), -1);
  assert.equal(mesesEntre('2026-03', '2026-03'), 0);
});

test('la cuota 1 cae en el primer periodo y la ultima cierra el plan', () => {
  assert.equal(cuotaEnPeriodo(base, '2026-03'), 1);
  assert.equal(cuotaEnPeriodo(base, '2026-04'), 2);
  assert.equal(cuotaEnPeriodo(base, '2027-02'), 12);
  assert.equal(ultimoPeriodo(base), '2027-02');
});

test('fuera del plan no hay cuota, ni antes ni despues', () => {
  assert.equal(cuotaEnPeriodo(base, '2026-02'), null);
  assert.equal(cuotaEnPeriodo(base, '2027-03'), null);
  assert.equal(montoEnPeriodo(base, '2027-03'), 0);
  assert.equal(montoEnPeriodo(base, '2026-04'), 120_000);
});

test('un periodo mal formado no cuenta como cuota', () => {
  assert.equal(cuotaEnPeriodo(base, '2026-13'), null);
  assert.equal(cuotaEnPeriodo(base, 'marzo'), null);
  assert.equal(cuotaEnPeriodo({ ...base, primerPeriodo: '2026-3' }, '2026-03'), null);
});

test('cancelar deja de pagar DESDE ese mes, no despues', () => {
  // Si cancelaste en junio, la cuota de junio ya no se paga.
  const cancelado = { ...base, canceladoEn: '2026-06' };
  assert.equal(cuotaEnPeriodo(cancelado, '2026-05'), 3);
  assert.equal(cuotaEnPeriodo(cancelado, '2026-06'), null);
  assert.equal(cuotaEnPeriodo(cancelado, '2026-07'), null);
});

test('el estado a mitad del plan cuenta la cuota del mes como pagada', () => {
  const e = estado(base, '2026-06');   // cuota 4 de 12
  assert.equal(e.cuotaDelMes, 4);
  assert.equal(e.pagadas, 4);
  assert.equal(e.restantes, 8);
  assert.equal(e.saldoArs, 8 * 120_000);
  assert.equal(e.terminado, false);
});

test('antes de empezar no hay nada pagado', () => {
  const e = estado(base, '2026-01');
  assert.equal(e.pagadas, 0);
  assert.equal(e.restantes, 12);
  assert.equal(e.cuotaDelMes, null);
  assert.equal(e.saldoArs, 12 * 120_000);
});

test('despues del final queda saldado y no suma mas', () => {
  const e = estado(base, '2027-06');
  assert.equal(e.pagadas, 12);
  assert.equal(e.restantes, 0);
  assert.equal(e.saldoArs, 0);
  assert.equal(e.terminado, true);
  assert.equal(montoEnPeriodo(base, '2027-06'), 0);
});

test('cancelar congela las pagadas en la ultima que se abono', () => {
  const cancelado = { ...base, canceladoEn: '2026-06' };
  const e = estado(cancelado, '2026-09');
  // Se pagaron marzo, abril y mayo: tres cuotas.
  assert.equal(e.pagadas, 3);
  assert.equal(e.restantes, 9);
  assert.equal(e.cancelado, true);
  assert.equal(e.cuotaDelMes, null);
});

test('el costo del credito es la suma de cuotas menos lo que te dieron', () => {
  const e = estado(base, '2026-06');
  assert.equal(e.totalArs, 1_440_000);
  assert.equal(e.costoArs, 440_000);
});

test('sin monto otorgado el costo es null, no cero', () => {
  // No saber cuanto te prestaron y que el credito haya salido gratis son cosas
  // distintas.
  const e = estado({ ...base, montoOtorgado: null }, '2026-06');
  assert.equal(e.costoArs, null);
});

test('el total del mes suma solo los prestamos vigentes', () => {
  const otro: Prestamo = { ...base, id: 'p2', cuotas: 3, cuotaArs: 50_000, primerPeriodo: '2026-01' };
  assert.equal(totalDelMes([base, otro], '2026-03'), 170_000);
  assert.equal(totalDelMes([base, otro], '2026-04'), 120_000);
  assert.equal(totalDelMes([], '2026-04'), 0);
});

test('los periodos con cuota cubren el plan entero sin huecos', () => {
  const corto: Prestamo = { ...base, cuotas: 3, primerPeriodo: '2026-11' };
  assert.deepEqual(periodosConCuota([corto]), ['2026-11', '2026-12', '2027-01']);
});

test('los periodos de un prestamo cancelado no incluyen los meses no pagados', () => {
  const corto: Prestamo = { ...base, cuotas: 6, primerPeriodo: '2026-01', canceladoEn: '2026-04' };
  assert.deepEqual(periodosConCuota([corto]), ['2026-01', '2026-02', '2026-03']);
});

test('un prestamo sin cuotas no genera periodos', () => {
  assert.deepEqual(periodosConCuota([{ ...base, cuotas: 0 }]), []);
  assert.deepEqual(periodosConCuota([{ ...base, primerPeriodo: 'x' }]), []);
});
