import test from 'node:test';
import assert from 'node:assert/strict';
import { resumir, diasEntre, fechaValida, totales, ordenar, type PrestamoPersonal } from './fiado';

const HOY = '2026-08-27';

const base: PrestamoPersonal = {
  id: 'f1', persona: 'Hermano', concepto: 'Para el alquiler',
  monto: 200_000, moneda: 'ARS', fecha: '2026-02-10',
  perdonado: false, devoluciones: [],
};

test('sin devoluciones queda pendiente entero', () => {
  const r = resumir(base, HOY);
  assert.equal(r.devuelto, 0);
  assert.equal(r.pendiente, 200_000);
  assert.equal(r.estado, 'PENDIENTE');
  assert.equal(r.avance, 0);
  assert.equal(r.ultimaDevolucion, null);
});

test('las devoluciones parciales suman y dejan el resto', () => {
  const r = resumir({ ...base, devoluciones: [
    { id: 'd1', fecha: '2026-04-01', monto: 50_000 },
    { id: 'd2', fecha: '2026-06-15', monto: 30_000 },
  ] }, HOY);
  assert.equal(r.devuelto, 80_000);
  assert.equal(r.pendiente, 120_000);
  assert.equal(r.estado, 'PARCIAL');
  assert.equal(r.avance, 0.4);
  assert.equal(r.ultimaDevolucion, '2026-06-15');
});

test('devolver todo lo deja saldado', () => {
  const r = resumir({ ...base, devoluciones: [{ id: 'd', fecha: '2026-05-01', monto: 200_000 }] }, HOY);
  assert.equal(r.pendiente, 0);
  assert.equal(r.estado, 'SALDADO');
  assert.equal(r.avance, 1);
});

test('devolver de mas no genera una deuda tuya', () => {
  // Si te devolvieron mas, es un regalo o un error de carga. En ninguno de los
  // dos casos le debes vos algo a la otra persona.
  const r = resumir({ ...base, devoluciones: [{ id: 'd', fecha: '2026-05-01', monto: 250_000 }] }, HOY);
  assert.equal(r.pendiente, 0);
  assert.equal(r.avance, 1);
  assert.equal(r.estado, 'SALDADO');
});

test('los centavos de punto flotante no dejan un saldo fantasma', () => {
  // 0.1 + 0.2 !== 0.3 en flotante: sin tolerancia esto quedaria "PARCIAL"
  // con un pendiente de fracciones de centavo.
  const r = resumir({ ...base, monto: 0.3, devoluciones: [
    { id: 'a', fecha: '2026-03-01', monto: 0.1 },
    { id: 'b', fecha: '2026-03-02', monto: 0.2 },
  ] }, HOY);
  assert.equal(r.estado, 'SALDADO');
});

test('perdonar deja el pendiente en cero sin borrar el registro', () => {
  const r = resumir({ ...base, perdonado: true }, HOY);
  assert.equal(r.pendiente, 0);
  assert.equal(r.estado, 'PERDONADO');
  // El monto original sigue estando: la fila queda para no volver a prestar
  // sin acordarse de como termino la vez anterior.
  assert.equal(base.monto, 200_000);
});

test('una devolucion con monto invalido no rompe la suma', () => {
  const r = resumir({ ...base, devoluciones: [
    { id: 'a', fecha: '2026-03-01', monto: 50_000 },
    { id: 'b', fecha: '2026-03-02', monto: NaN },
    { id: 'c', fecha: '2026-03-03', monto: -1000 },
  ] }, HOY);
  assert.equal(r.devuelto, 50_000);
});

test('los dias transcurridos son los que hacen visible un prestamo olvidado', () => {
  assert.equal(diasEntre('2026-02-10', '2026-08-27'), 198);
  assert.equal(diasEntre('2026-08-27', '2026-08-27'), 0);
  assert.equal(resumir(base, HOY).diasDesde, 198);
});

test('una fecha invalida da null y no un numero enorme', () => {
  assert.equal(diasEntre('2026-13-01', HOY), null);
  assert.equal(diasEntre('ayer', HOY), null);
  assert.equal(diasEntre('', HOY), null);
});

test('un dia que no existe se rechaza en vez de correrse al mes siguiente', () => {
  // "2026-02-30" tiene la forma correcta y Date la convierte calladita en el 2
  // de marzo: un error de tipeo quedaria guardado como otra fecha valida.
  assert.equal(fechaValida('2026-02-30'), null);
  assert.equal(fechaValida('2026-04-31'), null);
  assert.equal(diasEntre('2026-02-30', HOY), null);
  // 2028 es bisiesto, 2026 no.
  assert.equal(fechaValida('2026-02-29'), null);
  assert.notEqual(fechaValida('2028-02-29'), null);
});

test('los totales no mezclan monedas', () => {
  // Sumar pesos y dolares con la cotizacion de hoy diria que te deben un
  // numero que nadie te prometio.
  const t = totales([
    base,
    { ...base, id: 'f2', moneda: 'USD', monto: 500 },
    { ...base, id: 'f3', monto: 100_000, devoluciones: [{ id: 'x', fecha: '2026-05-01', monto: 40_000 }] },
  ], HOY);
  assert.deepEqual(t, [
    { moneda: 'ARS', pendiente: 260_000, prestado: 300_000, cuantos: 2 },
    { moneda: 'USD', pendiente: 500, prestado: 500, cuantos: 1 },
  ]);
});

test('lo saldado y lo perdonado no cuentan en los totales', () => {
  const t = totales([
    { ...base, devoluciones: [{ id: 'd', fecha: '2026-05-01', monto: 200_000 }] },
    { ...base, id: 'f2', perdonado: true },
  ], HOY);
  assert.deepEqual(t, []);
});

test('la lista pone primero lo que te deben, y lo mas viejo arriba', () => {
  const viejo = { ...base, id: 'viejo', fecha: '2025-11-01' };
  const nuevo = { ...base, id: 'nuevo', fecha: '2026-07-01' };
  const saldado = { ...base, id: 'saldado', fecha: '2025-01-01',
    devoluciones: [{ id: 'd', fecha: '2025-02-01', monto: 200_000 }] };

  assert.deepEqual(
    ordenar([saldado, nuevo, viejo], HOY).map(p => p.id),
    ['viejo', 'nuevo', 'saldado'],
  );
});
