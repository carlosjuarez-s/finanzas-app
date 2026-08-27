import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditar, type DatosAuditoria } from './auditoria';

// La auditoria es lo que despues el modelo va a explicar. Si estos hallazgos
// salen mal, el analisis narra con confianza algo que no pasa.

const base = (o: Partial<DatosAuditoria> = {}): DatosAuditoria => ({
  cierres: [], gastos: [], metas: [], tenencias: [], activosConLibro: [],
  conexiones: [], ahorroAcumuladoUsd: 0, tipoCambioArs: 1000, hoy: '2026-09', ...o,
});

const cierre = (periodo: string, ingresoArs = 1000000, gastoArs = 600000) => ({
  periodo, ingresoArs, gastoArs, ahorroArs: ingresoArs - gastoArs,
  tasaAhorro: ingresoArs ? ((ingresoArs - gastoArs) / ingresoArs) * 100 : null,
  porCategoria: {},
});

const ids = (d: DatosAuditoria) => auditar(d).map(h => h.id);

test('sin datos no inventa hallazgos', () => {
  assert.deepEqual(auditar(base()), []);
});

test('detecta meses faltantes en el medio de la serie', () => {
  const h = auditar(base({ cierres: [cierre('2026-06'), cierre('2026-09')] }));
  const m = h.find(x => x.id === 'meses-faltantes');
  assert.ok(m);
  assert.match(m.detalle, /2026-07/);
  assert.match(m.detalle, /2026-08/);
});

test('no marca faltantes cuando la serie es continua', () => {
  const d = base({ cierres: [cierre('2026-07'), cierre('2026-08'), cierre('2026-09')] });
  assert.ok(!ids(d).includes('meses-faltantes'));
});

test('un mes con gastos y sin sueldo es hallazgo de severidad alta', () => {
  const h = auditar(base({ cierres: [cierre('2026-08', 0, 500000)] }));
  const m = h.find(x => x.id === 'meses-sin-recibo');
  assert.ok(m);
  assert.equal(m.severidad, 'alta');
});

test('detecta un gasto recurrente que falta este mes', () => {
  // Luz todos los meses menos el ultimo: casi seguro falta cargarla.
  const gastos = [
    { periodo: '2026-06', concepto: 'Luz EDET', categoria: 'Servicios', montoArs: 40000 },
    { periodo: '2026-07', concepto: 'Luz EDET', categoria: 'Servicios', montoArs: 42000 },
    { periodo: '2026-08', concepto: 'Luz EDET', categoria: 'Servicios', montoArs: 45000 },
    { periodo: '2026-09', concepto: 'Internet', categoria: 'Servicios', montoArs: 30000 },
  ];
  const d = base({ cierres: ['2026-06', '2026-07', '2026-08', '2026-09'].map(p => cierre(p)), gastos });
  const m = auditar(d).find(x => x.id === 'recurrente-faltante');
  assert.ok(m);
  assert.match(m.detalle, /luz edet/i);
});

test('no marca como faltante algo que si esta cargado', () => {
  const gastos = ['2026-06', '2026-07', '2026-08', '2026-09'].map(p => ({
    periodo: p, concepto: 'Luz EDET', categoria: 'Servicios', montoArs: 40000,
  }));
  const d = base({ cierres: ['2026-06', '2026-07', '2026-08', '2026-09'].map(p => cierre(p)), gastos });
  assert.ok(!ids(d).includes('recurrente-faltante'));
});

test('avisa de tenencias sin precio de entrada', () => {
  const d = base({ tenencias: [{ activo: 'BTC', cantidad: 0.5 }], activosConLibro: ['ETH'] });
  const m = auditar(d).find(x => x.id === 'tenencias-sin-costo');
  assert.ok(m);
  assert.match(m.detalle, /BTC/);
});

test('no avisa cuando el activo si tiene libro', () => {
  const d = base({ tenencias: [{ activo: 'BTC', cantidad: 0.5 }], activosConLibro: ['BTC'] });
  assert.ok(!ids(d).includes('tenencias-sin-costo'));
});

test('detecta conexiones rotas y menciona el vencimiento de Binance', () => {
  const d = base({ conexiones: [{ etiqueta: 'Binance principal', estado: 'ERROR', ultimoSync: null }] });
  const m = auditar(d).find(x => x.id === 'conexiones-rotas');
  assert.ok(m);
  assert.equal(m.severidad, 'alta');
  assert.match(m.detalle, /30 dias/);
});

test('una meta fuera de ritmo se detecta con la cuenta hecha', () => {
  // Ahorra 400.000 ARS/mes = USD 400. Faltan USD 10.000 en 5 meses = USD 2.000/mes.
  const d = base({
    cierres: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map(p => cierre(p)),
    metas: [{ nombre: 'Vacaciones', montoObjetivo: 10000, moneda: 'USD', fechaObjetivo: '2027-02' }],
    ahorroAcumuladoUsd: 0,
  });
  const m = auditar(d).find(x => x.id?.startsWith('meta-fuera-de-ritmo'));
  assert.ok(m);
  assert.match(m.detalle, /2000|2\.000/);
});

test('una meta que va bien no genera ruido', () => {
  const d = base({
    cierres: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'].map(p => cierre(p)),
    metas: [{ nombre: 'Notebook', montoObjetivo: 1000, moneda: 'USD', fechaObjetivo: '2027-09' }],
  });
  assert.ok(!ids(d).some(i => i.startsWith('meta-fuera-de-ritmo')));
});

test('una meta ya alcanzada no aparece', () => {
  const d = base({
    metas: [{ nombre: 'Fondo', montoObjetivo: 500, moneda: 'USD', fechaObjetivo: '2026-01' }],
    ahorroAcumuladoUsd: 900,
  });
  assert.deepEqual(auditar(d).filter(h => h.id.includes('Fondo')), []);
});

test('detecta un mes muy por encima del promedio', () => {
  const d = base({
    cierres: [cierre('2026-06'), cierre('2026-07'), cierre('2026-08'), cierre('2026-09', 1000000, 1500000)],
  });
  const m = auditar(d).find(x => x.id === 'mes-caro');
  assert.ok(m);
});

test('los hallazgos vienen ordenados por severidad', () => {
  const d = base({
    cierres: [cierre('2026-08', 0, 500000), cierre('2026-09')],
    conexiones: [{ etiqueta: 'X', estado: 'ACTIVA', ultimoSync: new Date('2020-01-01') }],
  });
  const sev = auditar(d).map(h => h.severidad);
  const orden = { alta: 0, media: 1, baja: 2 };
  for (let i = 1; i < sev.length; i++) {
    assert.ok(orden[sev[i - 1]] <= orden[sev[i]], 'las altas van primero');
  }
});

test('avisa de la plata prestada que nadie devolvio', () => {
  // Es lo que mas se olvida: no vence, no manda recordatorio y no aparece en
  // ningun resumen.
  const [h] = auditar({ ...base(), fiados: [
    { persona: 'Javier', pendiente: 150_000, moneda: 'ARS', diasDesde: 240, huboDevolucion: false },
  ] }).filter(x => x.id.startsWith('fiado-'));

  assert.ok(h, 'deberia haber un hallazgo');
  assert.match(h.titulo, /Javier/);
  assert.match(h.titulo, /8 meses/);
});

test('no avisa si viene devolviendo, aunque falte plata', () => {
  // Alguien que devuelve de a poco no es el caso que hay que empujar.
  const hs = auditar({ ...base(), fiados: [
    { persona: 'Javier', pendiente: 60_000, moneda: 'ARS', diasDesde: 300, huboDevolucion: true },
  ] }).filter(x => x.id.startsWith('fiado-'));
  assert.equal(hs.length, 0);
});

test('no avisa por un prestamo reciente ni por uno ya saldado', () => {
  const hs = auditar({ ...base(), fiados: [
    { persona: 'Reciente', pendiente: 100_000, moneda: 'ARS', diasDesde: 40, huboDevolucion: false },
    { persona: 'Saldado', pendiente: 0, moneda: 'ARS', diasDesde: 900, huboDevolucion: false },
    { persona: 'SinFecha', pendiente: 100_000, moneda: 'ARS', diasDesde: null, huboDevolucion: false },
  ] }).filter(x => x.id.startsWith('fiado-'));
  assert.equal(hs.length, 0);
});

test('sin fiados la auditoria sigue funcionando', () => {
  assert.doesNotThrow(() => auditar(base()));
});
