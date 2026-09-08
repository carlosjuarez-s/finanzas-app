import test from 'node:test';
import assert from 'node:assert/strict';
import { aporteNecesario, cuantoTarda, techo, reparto } from './plan';
import { proyectar, SUPUESTOS_DEFAULT } from './proyeccion';

// La prueba que mas vale: lo que este modulo despeja tiene que dar exactamente
// lo mismo que la proyeccion, que es el otro lado de la misma formula. Si
// divergieran, dos pantallas darian numeros distintos del mismo plan.
test('el aporte que calcula llega justo al objetivo en la proyeccion', () => {
  const objetivo = 50_000;
  const meses = 60;
  const a = aporteNecesario({ objetivo, meses, tasaAnualPct: 7, saldoInicial: 5_000 })!;

  const puntos = proyectar({
    aporteMensualUsd: a,
    meses,
    supuestos: { ...SUPUESTOS_DEFAULT, retornoRealIndice: 7 },
    saldoInicialUsd: 5_000,
  });
  const final = puntos[puntos.length - 1].saldos.INDICE;
  assert.ok(Math.abs(final - objetivo) < 0.01, `dio ${final}, se esperaba ${objetivo}`);
});

test('los meses que calcula son los que tarda la proyeccion', () => {
  const objetivo = 30_000;
  const r = cuantoTarda({ objetivo, aporteMensual: 400, tasaAnualPct: 7, saldoInicial: 1_000 });
  assert.equal(r.ok, true);
  const meses = r.ok ? r.meses : 0;

  const puntos = proyectar({
    aporteMensualUsd: 400, meses, supuestos: { ...SUPUESTOS_DEFAULT, retornoRealIndice: 7 },
    saldoInicialUsd: 1_000,
  });
  assert.ok(puntos[meses].saldos.INDICE >= objetivo, 'en ese mes ya tiene que haber llegado');
  assert.ok(puntos[meses - 1].saldos.INDICE < objetivo, 'un mes antes todavia no');
});

test('el interes compuesto hace falta menos aporte que dividir el objetivo', () => {
  // Es lo que el compuesto significa, expresado como test: a 10 años, poner
  // objetivo/meses es poner de mas.
  const objetivo = 100_000, meses = 120;
  const conInteres = aporteNecesario({ objetivo, meses, tasaAnualPct: 7 })!;
  const sinInteres = objetivo / meses;
  assert.ok(conInteres < sinInteres * 0.75, `${conInteres} deberia ser bastante menor que ${sinInteres}`);
});

test('con tasa cero el aporte es el reparto simple', () => {
  assert.equal(aporteNecesario({ objetivo: 12_000, meses: 12, tasaAnualPct: 0 }), 1_000);
});

test('si el saldo inicial ya alcanza, el aporte es cero y no negativo', () => {
  // "Sacá plata" no es la respuesta a "cuanto tengo que poner".
  assert.equal(aporteNecesario({ objetivo: 10_000, meses: 24, tasaAnualPct: 7, saldoInicial: 20_000 }), 0);
  assert.deepEqual(cuantoTarda({ objetivo: 10_000, aporteMensual: 100, tasaAnualPct: 7, saldoInicial: 20_000 }), { ok: true, meses: 0 });
});

test('con retorno real negativo hay un techo que no se pasa nunca', () => {
  // El caso de los pesos quietos: -10% real. Aportando 100 por mes, el saldo
  // converge y ahi se queda, porque lo que pierde iguala a lo que entra.
  const t = techo(100, -10);
  assert.ok(t > 0 && Number.isFinite(t), `el techo tiene que ser un numero: ${t}`);

  const r = cuantoTarda({ objetivo: t * 2, aporteMensual: 100, tasaAnualPct: -10 });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false ? r.motivo : '', 'nunca');

  // Y la proyeccion lo confirma: a 100 años sigue sin llegar.
  const puntos = proyectar({
    aporteMensualUsd: 100, meses: 1200,
    supuestos: { ...SUPUESTOS_DEFAULT, retornoRealPesos: -10 },
  });
  assert.ok(puntos[1200].saldos.PESOS < t * 2);
  // Y efectivamente se pego al techo.
  assert.ok(Math.abs(puntos[1200].saldos.PESOS - t) < 1);
});

test('debajo del techo, con tasa negativa, si se llega', () => {
  const t = techo(100, -10);
  const r = cuantoTarda({ objetivo: t * 0.5, aporteMensual: 100, tasaAnualPct: -10 });
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.meses > 0);
});

test('sin aportar nada y sin saldo, no se llega: y el motivo es otro', () => {
  // "No aportas nada" y "aportas pero no alcanza jamas" son dos consejos
  // distintos, asi que son dos motivos distintos.
  const r = cuantoTarda({ objetivo: 10_000, aporteMensual: 0, tasaAnualPct: 7 });
  assert.deepEqual(r, { ok: false, motivo: 'sin-aporte' });
});

test('sin aportar pero con saldo y tasa positiva, el interes solo llega', () => {
  const r = cuantoTarda({ objetivo: 20_000, aporteMensual: 0, tasaAnualPct: 7, saldoInicial: 10_000 });
  assert.equal(r.ok, true);
  // Duplicar al 7% real son unos 10 años.
  assert.ok(r.ok && r.meses > 100 && r.meses < 130, `dio ${r.ok && r.meses}`);
});

test('un objetivo o un horizonte sin sentido no devuelven un numero', () => {
  assert.equal(aporteNecesario({ objetivo: 0, meses: 12, tasaAnualPct: 7 }), null);
  assert.equal(aporteNecesario({ objetivo: -100, meses: 12, tasaAnualPct: 7 }), null);
  assert.equal(aporteNecesario({ objetivo: 1000, meses: 0, tasaAnualPct: 7 }), null);
  assert.equal(aporteNecesario({ objetivo: 1000, meses: 1.5, tasaAnualPct: 7 }), null);
});

test('el reparto separa lo que pusiste de lo que puso el interes', () => {
  const r = reparto(150, 100);
  assert.equal(r.rendimiento, 50);
  // Con tolerancia: 50/150*100 y 100/3 no son el mismo flotante.
  assert.ok(Math.abs(r.pctRendimiento - 100 / 3) < 1e-9);
  // Con retorno negativo el "rendimiento" es negativo, y hay que poder decirlo.
  assert.equal(reparto(80, 100).rendimiento, -20);
});
