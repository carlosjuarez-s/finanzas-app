import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  proyectar, tasaMensual, mesQueAlcanza, promedioMensual, SUPUESTOS_DEFAULT,
} from './proyeccion';

// Sobre estos numeros se toman decisiones de plata: si el motor se rompe,
// devuelve un resultado plausible en vez de un error, y nadie se entera.
const sinRetorno = { ...SUPUESTOS_DEFAULT, retornoRealPesos: 0, retornoRealDolares: 0, retornoRealIndice: 0 };

test('sin rendimiento, el saldo es exactamente lo aportado', () => {
  const p = proyectar({ aporteMensualUsd: 100, meses: 12, supuestos: sinRetorno });
  assert.equal(p[12].saldos.DOLARES, 1200);
  assert.equal(p[12].aportado, 1200);
});

test('coincide con la formula cerrada de anualidad vencida', () => {
  const anual = 12, meses = 60, aporte = 250;
  const i = tasaMensual(anual);
  const esperado = aporte * ((Math.pow(1 + i, meses) - 1) / i);
  const got = proyectar({
    aporteMensualUsd: aporte, meses,
    supuestos: { ...SUPUESTOS_DEFAULT, retornoRealIndice: anual },
  })[meses].saldos.INDICE;
  assert.ok(Math.abs(got - esperado) < 1e-6, `formula ${esperado} vs motor ${got}`);
});

test('la tasa mensual compone en vez de dividir por doce', () => {
  // 12% anual son 0.9489% mensual, no 1%. A diez años la diferencia no es menor.
  assert.ok(Math.abs(tasaMensual(12) - 0.01) > 0.0004);
  assert.ok(Math.abs(Math.pow(1 + tasaMensual(12), 12) - 1.12) < 1e-12);
});

test('un retorno real negativo erosiona el capital aportado', () => {
  const p = proyectar({ aporteMensualUsd: 100, meses: 24, supuestos: SUPUESTOS_DEFAULT });
  assert.ok(p[24].saldos.PESOS < p[24].aportado);
  assert.ok(p[24].saldos.INDICE > p[24].saldos.DOLARES);
  assert.ok(p[24].saldos.DOLARES > p[24].saldos.PESOS);
});

test('el saldo inicial rinde aunque no haya aportes', () => {
  const p = proyectar({
    aporteMensualUsd: 0, meses: 12, saldoInicialUsd: 1000,
    supuestos: { ...SUPUESTOS_DEFAULT, retornoRealIndice: 10 },
  });
  assert.ok(Math.abs(p[12].saldos.INDICE - 1100) < 1e-6);
});

test('mesQueAlcanza distingue alcanzar de no llegar nunca', () => {
  const p = proyectar({ aporteMensualUsd: 100, meses: 12, supuestos: sinRetorno });
  assert.equal(mesQueAlcanza(p, 500, 'DOLARES')?.mes, 5);
  // No llegar en el horizonte es informacion, no un error.
  assert.equal(mesQueAlcanza(p, 99999, 'DOLARES'), null);
});

test('los periodos cruzan bien el cambio de año', () => {
  const p = proyectar({ aporteMensualUsd: 1, meses: 5, desde: '2026-11', supuestos: SUPUESTOS_DEFAULT });
  assert.deepEqual(p.map(x => x.periodo), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04']);
});

test('promedioMensual promedia y tolera no tener datos', () => {
  const prom = promedioMensual([{ ingresoArs: 100, gastoArs: 60 }, { ingresoArs: 200, gastoArs: 40 }]);
  assert.equal(prom.ingresoArs, 150);
  assert.equal(prom.gastoArs, 50);
  assert.equal(prom.meses, 2);
  assert.equal(promedioMensual([]).meses, 0);   // sin cierres todavia: no debe dividir por cero
});
