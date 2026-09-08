import test from 'node:test';
import assert from 'node:assert/strict';
import {
  caeEn, ajustes, montoEn, proximoAjuste, totalDelMes, validar, parsearIndice,
  desdeUnGasto, yaEsFijo, type Recurrente,
} from './recurrentes';

const base: Recurrente = {
  id: 'r1', concepto: 'Alquiler', categoria: 'Alquiler',
  montoArs: 500_000, montoUsd: 0,
  cadaMeses: 1, primerPeriodo: '2026-01', hastaPeriodo: null,
  aumentoPct: null, aumentoCadaMeses: null, indice: null,
};

test('un mensual cae todos los meses desde que arranca', () => {
  assert.equal(caeEn(base, '2026-01'), true);
  assert.equal(caeEn(base, '2026-07'), true);
  // Antes de empezar, no.
  assert.equal(caeEn(base, '2025-12'), false);
});

test('un bimestral cae cada dos meses DESDE el primero, no en los meses pares', () => {
  // El error facil: pensarlo como "los meses pares". Un bimestral que arranca
  // en enero cae en enero, marzo, mayo.
  const b = { ...base, cadaMeses: 2 };
  assert.deepEqual(
    ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'].map(p => caeEn(b, p)),
    [true, false, true, false, true],
  );
});

test('un semestral cae dos veces al año', () => {
  const s = { ...base, cadaMeses: 6, primerPeriodo: '2026-03' };
  assert.deepEqual(
    ['2026-03', '2026-06', '2026-09', '2027-03'].map(p => caeEn(s, p)),
    [true, false, true, true],
  );
});

test('dado de baja deja de caer desde el mes indicado', () => {
  // Sin esto, un gimnasio dado de baja sigue en la estimacion meses despues.
  const g = { ...base, concepto: 'Gym', hastaPeriodo: '2026-06' };
  assert.equal(caeEn(g, '2026-06'), true);
  assert.equal(caeEn(g, '2026-07'), false);
});

test('el primer ajuste cae despues del primer periodo, no en el', () => {
  // El mes en que empezas a pagar algo pagas el precio de entrada.
  const a = { ...base, aumentoPct: 10, aumentoCadaMeses: 6 };
  assert.equal(ajustes(a, '2026-01'), 0);
  assert.equal(ajustes(a, '2026-06'), 0);
  assert.equal(ajustes(a, '2026-07'), 1);
  assert.equal(ajustes(a, '2027-01'), 2);
});

test('los aumentos se componen, no se suman', () => {
  // Dos aumentos del 10% son 21%, no 20%. Sumarlos subestima el alquiler.
  const a = { ...base, aumentoPct: 10, aumentoCadaMeses: 6 };
  assert.equal(Math.round(montoEn(a, '2026-07').monto.ars), 550_000);
  assert.equal(Math.round(montoEn(a, '2027-01').monto.ars), 605_000);
});

test('sin aumento declarado el monto no se mueve', () => {
  assert.equal(montoEn(base, '2027-06').monto.ars, 500_000);
  assert.equal(montoEn(base, '2027-06').ajustes, 0);
});

test('el aumento tambien corre sobre la parte en dolares', () => {
  const a = { ...base, montoArs: 0, montoUsd: 100, aumentoPct: 5, aumentoCadaMeses: 12 };
  assert.equal(Math.round(montoEn(a, '2027-01').monto.usd), 105);
});

test('atado a un indice, el ajuste vale lo que acumulo el indice', () => {
  const a = { ...base, indice: 'IPC', aumentoCadaMeses: 3 };
  // 2% + 2% + 2% compuestos en la ventana de tres meses.
  const ipc = { '2026-01': 2, '2026-02': 2, '2026-03': 2 };
  const m = montoEn(a, '2026-04', ipc);
  assert.equal(m.ajustes, 1);
  assert.equal(Math.round(m.monto.ars), Math.round(500_000 * 1.02 ** 3));
  assert.equal(m.faltaIndice, false);
});

test('si al indice le falta un mes no se inventa: se avisa', () => {
  // Un alquiler estimado con un IPC a medias es peor que uno sin ajustar,
  // porque el error no se ve.
  const a = { ...base, indice: 'IPC', aumentoCadaMeses: 3 };
  const m = montoEn(a, '2026-04', { '2026-01': 2 });
  assert.equal(m.faltaIndice, true);
  assert.equal(Math.round(m.monto.ars), 510_000);
});

test('el proximo ajuste se puede anticipar', () => {
  const a = { ...base, aumentoPct: 10, aumentoCadaMeses: 6 };
  assert.equal(proximoAjuste(a, '2026-03'), '2026-07');
  assert.equal(proximoAjuste(a, '2026-08'), '2027-01');
  // Sin aumento declarado no hay proximo ajuste.
  assert.equal(proximoAjuste(base, '2026-03'), null);
});

test('un ajuste posterior a la baja no existe', () => {
  const a = { ...base, aumentoPct: 10, aumentoCadaMeses: 6, hastaPeriodo: '2026-05' };
  assert.equal(proximoAjuste(a, '2026-03'), null);
});

test('el total del mes junta solo lo que cae, por categoria', () => {
  const rs: Recurrente[] = [
    base,
    { ...base, id: 'r2', concepto: 'Internet', categoria: 'Servicios', montoArs: 40_000 },
    { ...base, id: 'r3', concepto: 'Seguro', categoria: 'Servicios', montoArs: 90_000, cadaMeses: 6 },
  ];
  const t = totalDelMes(rs, '2026-02');
  // El seguro semestral no cae en febrero.
  assert.equal(t.monto.ars, 540_000);
  assert.deepEqual(t.porCategoria, { Alquiler: 500_000, Servicios: 40_000 });

  const enero = totalDelMes(rs, '2026-01');
  assert.equal(enero.monto.ars, 630_000);
});

test('un aumento a medias no se guarda', () => {
  // Un porcentaje sin cada cuanto se aplica no se puede calcular, y al reves
  // tampoco: guardarlo dejaria una fila que estima mal en silencio.
  const bueno = { concepto: 'Alquiler', primerPeriodo: '2026-01', montoArs: 500000 };
  assert.equal(validar(bueno).ok, true);
  assert.equal(validar({ ...bueno, aumentoPct: 10 }).ok, false);
  assert.equal(validar({ ...bueno, aumentoCadaMeses: 6 }).ok, false);
  assert.equal(validar({ ...bueno, aumentoPct: 10, aumentoCadaMeses: 6 }).ok, true);
});

test('un porcentaje y un indice a la vez no se puede: no se sabe cual manda', () => {
  const r = validar({
    concepto: 'Alquiler', primerPeriodo: '2026-01', montoArs: 500000,
    aumentoPct: 10, indice: 'IPC', aumentoCadaMeses: 6,
  });
  assert.equal(r.ok, false);
});

test('la baja no puede ser anterior al alta', () => {
  const r = validar({
    concepto: 'Gym', primerPeriodo: '2026-06', hastaPeriodo: '2026-01', montoArs: 30000,
  });
  assert.equal(r.ok, false);
});

test('sin monto en ninguna moneda no es un gasto fijo', () => {
  assert.equal(validar({ concepto: 'X', primerPeriodo: '2026-01' }).ok, false);
  assert.equal(validar({ concepto: 'X', primerPeriodo: '2026-01', montoUsd: 20 }).ok, true);
});

test('un indice escrito a mano se lee con coma decimal', () => {
  const r = parsearIndice('2026-01: 2,4\n2026-02 = 2.1\n\n2026-03 1,8%');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.indice, { '2026-01': 2.4, '2026-02': 2.1, '2026-03': 1.8 });
});

test('una linea que no se entiende se reporta con su numero, no se descarta', () => {
  // Descartarla en silencio dejaria un indice incompleto que ajusta de menos
  // sin que nadie lo note.
  const r = parsearIndice('2026-01: 2,4\nenero dos coma cuatro');
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : '', /línea 2/);
});

test('un mes que no existe en el indice se rechaza', () => {
  assert.equal(parsearIndice('2026-13: 2,4').ok, false);
});

test('un gasto cargado se vuelve fijo con los defaults mas comunes', () => {
  const r = desdeUnGasto(
    { concepto: 'Alquiler', categoria: 'Alquiler', montoArs: 500_000, montoUsd: 0 },
    '2026-09',
  );
  assert.equal(r.cadaMeses, 1);
  assert.equal(r.primerPeriodo, '2026-09');
  // El aumento queda sin definir: es lo unico que la fila del gasto no sabe.
  assert.equal(r.aumentoPct, null);
  assert.equal(r.aumentoCadaMeses, null);
  // Y lo que sale de ahi tiene que pasar la misma validacion que el formulario.
  assert.equal(validar(r).ok, true);
});

test('no se puede marcar dos veces el mismo gasto como fijo', () => {
  // Tocarlo en enero y otra vez en febrero sobre el mismo alquiler dejaba dos
  // fijos iguales sumando doble en cada estimacion.
  const fijos = [{ concepto: 'Alquiler' }];
  assert.equal(yaEsFijo(fijos, 'Alquiler'), true);
  assert.equal(yaEsFijo(fijos, '  alquiler '), true);
  assert.equal(yaEsFijo(fijos, 'Alquíler'), true);
  assert.equal(yaEsFijo(fijos, 'Internet'), false);
});
