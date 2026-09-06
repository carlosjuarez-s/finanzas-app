import test from 'node:test';
import assert from 'node:assert/strict';
import { validar, mezcla } from './sueldo';

const ok = (r: ReturnType<typeof validar>) => {
  assert.equal(r.ok, true, r.ok ? '' : r.error);
  return r.ok ? r.sueldo : (undefined as never);
};

test('un sueldo partido en dos monedas se acepta entero', () => {
  const s = ok(validar({ periodo: '2026-09', netoArs: 900_000, netoUsd: 2_100 }));
  assert.equal(s.netoArs, 900_000);
  assert.equal(s.netoUsd, 2_100);
});

test('la parte que falta es cero, no un error', () => {
  // Cobrar todo en pesos es tener cero dolares: pedir que se escriba "0"
  // seria ceremonia por nada.
  for (const vacio of [undefined, null, '']) {
    const s = ok(validar({ periodo: '2026-09', netoArs: 900_000, netoUsd: vacio }));
    assert.equal(s.netoUsd, 0);
  }
});

test('cero en las dos monedas no es un sueldo', () => {
  // Guardarlo borraria el ingreso del mes sin decirlo.
  const r = validar({ periodo: '2026-09', netoArs: 0, netoUsd: 0 });
  assert.equal(r.ok, false);
});

test('un neto negativo o no numerico se rechaza', () => {
  for (const malo of [-1, 'mucho', NaN, Infinity, {}]) {
    assert.equal(validar({ periodo: '2026-09', netoArs: malo }).ok, false, String(malo));
  }
});

test('el periodo tiene que ser un mes real', () => {
  for (const malo of ['2026-13', '2026-00', '2026', 'septiembre', '', undefined]) {
    assert.equal(validar({ periodo: malo, netoArs: 100 }).ok, false, String(malo));
  }
  assert.equal(validar({ periodo: '2026-01', netoArs: 100 }).ok, true);
});

test('la mezcla dice que porcentaje viene en cada moneda', () => {
  // 70/30 en pesos: 2.100 dolares a 1.500 son 3.150.000, contra 1.350.000.
  const m = mezcla({ periodo: '2026-09', netoArs: 1_350_000, netoUsd: 2_100 }, 1_500);
  assert.equal(m.total.totalArs, 4_500_000);
  assert.equal(Math.round(m.pctUsd!), 70);
  assert.equal(Math.round(m.pctArs!), 30);
});

test('sin tipo de cambio no se inventa el reparto', () => {
  // "70% en dolares" sin cotizacion seria un numero inventado.
  const m = mezcla({ periodo: '2026-09', netoArs: 1_350_000, netoUsd: 2_100 }, null);
  assert.equal(m.total.totalArs, null);
  assert.equal(m.pctUsd, null);
  assert.equal(m.pctArs, null);
});

test('un sueldo todo en pesos no necesita tipo de cambio para repartirse', () => {
  const m = mezcla({ periodo: '2026-09', netoArs: 900_000, netoUsd: 0 }, null);
  assert.equal(m.total.totalArs, 900_000);
  assert.equal(m.pctArs, 100);
  assert.equal(m.pctUsd, 0);
});
