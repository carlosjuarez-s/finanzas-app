import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, totalDelMes, ganancias, enPesos } from './ingresos';

const base = { periodo: '2026-09', concepto: 'Venta de USDT', tipo: 'GANANCIA', montoArs: 150000 };

test('una ganancia de inversion se acepta', () => {
  const r = validar(base);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.ingreso.tipo, 'GANANCIA');
  assert.equal(r.ok && r.ingreso.montoArs, 150000);
});

test('el monto va en positivo: un ingreso negativo es un gasto', () => {
  // Aceptarlo dejaria la misma ambiguedad que hubo que descartar al importar
  // la planilla: una fila que dice "entro" con un numero que dice "salio".
  assert.equal(validar({ ...base, montoArs: -150000 }).ok, false);
});

test('sin concepto no se guarda', () => {
  // "Ingreso de 150.000" dentro de seis meses no dice nada.
  assert.equal(validar({ ...base, concepto: '  ' }).ok, false);
  assert.equal(validar({ ...base, concepto: undefined }).ok, false);
});

test('cero en las dos monedas no es un ingreso', () => {
  assert.equal(validar({ ...base, montoArs: 0, montoUsd: 0 }).ok, false);
});

test('un tipo desconocido cae en EXTRA, no rompe', () => {
  const r = validar({ ...base, tipo: 'CUALQUIERA' });
  assert.equal(r.ok && r.ingreso.tipo, 'EXTRA');
});

test('se puede cargar solo en dolares', () => {
  const r = validar({ ...base, montoArs: 0, montoUsd: 120 });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.ingreso.montoUsd, 120);
});

test('el periodo tiene que ser un mes real', () => {
  assert.equal(validar({ ...base, periodo: '2026-13' }).ok, false);
});

test('las ganancias no se mezclan con los reintegros', () => {
  // Un reintegro no es plata nueva: es la misma plata volviendo. Contarlo como
  // rendimiento hace parecer que la inversion rindio el doble.
  const items = [
    { tipo: 'GANANCIA', montoArs: 150000, montoUsd: 0 },
    { tipo: 'REINTEGRO', montoArs: 90000, montoUsd: 0 },
    { tipo: 'EXTRA', montoArs: 10000, montoUsd: 0 },
  ];
  assert.deepEqual(totalDelMes(items), { ars: 250000, usd: 0 });
  assert.deepEqual(ganancias(items), { ars: 150000, usd: 0 });
});

test('el total en pesos necesita tipo de cambio si hay dolares', () => {
  const items = [{ montoArs: 100000, montoUsd: 200 }];
  assert.equal(enPesos(items, 1500), 400000);
  assert.equal(enPesos(items, null), null);
  // Sin dolares no hace falta cotizacion.
  assert.equal(enPesos([{ montoArs: 100000, montoUsd: 0 }], null), 100000);
});
