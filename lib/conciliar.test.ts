import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clavePlataforma, nombrePlataforma, agrupar, ultimasFotos, seriePorPeriodo, totalesPorActivo,
  conciliar, estadoFinal, aplicarInstrucciones, ajustesDeLibro, datosDeActivos, completarValor,
  type Foto, type Instruccion, type Tenencia,
} from './conciliar';

const t = (activo: string, cantidad: number, valorUsd: number | null = null, clase = 'CEDEAR'): Tenencia =>
  ({ activo, clase, cantidad, valorUsd });

const foto = (plataforma: string, periodo: string, tenencias: Tenencia[], creado = 0): Foto => ({
  plataforma, periodo, creado, tenencias,
  totalUsd: tenencias.some(x => x.valorUsd === null) ? null : tenencias.reduce((s, x) => s + (x.valorUsd ?? 0), 0),
});

const ins = (p: Partial<Instruccion> & Pick<Instruccion, 'accion' | 'activo'>): Instruccion => ({
  cantidad: null, plataforma: null, clase: null, precioUsd: null, fecha: null, ...p,
});

test('IOL, InvertirOnline e «Invertir Online» son la misma cuenta', () => {
  assert.equal(clavePlataforma('IOL'), clavePlataforma('InvertirOnline'));
  assert.equal(clavePlataforma('Invertir Online'), clavePlataforma('iol'));
  assert.equal(clavePlataforma('BINANCE'), clavePlataforma('Binance'));
  assert.notEqual(clavePlataforma('IOL'), clavePlataforma('Binance'));
  assert.equal(nombrePlataforma('iol'), 'InvertirOnline');
  assert.equal(nombrePlataforma('  Balanz '), 'Balanz');
});

test('el mismo activo listado dos veces en una foto se suma', () => {
  const [btc] = agrupar([t('BTC', 0.1, 6000, 'CRIPTO'), t('btc ', 0.05, 3000, 'CRIPTO')]);
  assert.equal(btc.activo, 'BTC');
  assert.ok(Math.abs(btc.cantidad - 0.15) < 1e-12);
  assert.equal(btc.valorUsd, 9000);
});

test('lo que tenes hoy es la ultima foto de cada cuenta, no la suma de varias', () => {
  // El bug original: agosto y septiembre de IOL se sumaban, y GGAL contaba doble.
  const fotos = [
    foto('IOL', '2026-08', [t('GGAL', 40, 400)]),
    foto('IOL', '2026-09', [t('GGAL', 50, 550)]),
    foto('Binance', '2026-07', [t('BTC', 0.1, 6000, 'CRIPTO')]),
  ];
  const ultimas = ultimasFotos(fotos);
  assert.equal(ultimas.length, 2);
  assert.deepEqual(totalesPorActivo(ultimas), new Map([['GGAL', 50], ['BTC', 0.1]]));
});

test('dos fotos del mismo mes con el nombre escrito distinto: gana la mas nueva', () => {
  const ultimas = ultimasFotos([
    foto('IOL', '2026-09', [t('GGAL', 40, 400)], 1),
    foto('InvertirOnline', '2026-09', [t('GGAL', 50, 500)], 2),
  ]);
  assert.equal(ultimas.length, 1);
  assert.equal(ultimas[0].tenencias[0].cantidad, 50);
});

test('la serie arrastra la ultima foto de cada cuenta: actualizar una no hace caer el total', () => {
  const serie = seriePorPeriodo([
    foto('IOL', '2026-08', [t('GGAL', 40, 400)]),
    foto('Binance', '2026-08', [t('BTC', 0.1, 6000, 'CRIPTO')]),
    foto('IOL', '2026-09', [t('GGAL', 50, 550)]),
  ]);
  assert.deepEqual(serie, [
    { periodo: '2026-08', valorUsd: 6400 },
    // Sin arrastre daria 550: Binance "desaparecido" como si hubiera caido a cero.
    { periodo: '2026-09', valorUsd: 6550 },
  ]);
});

test('una cuenta vaciada deja de sumar: su foto vacia es la que se arrastra', () => {
  const serie = seriePorPeriodo([
    foto('IOL', '2026-08', [t('GGAL', 40, 400)]),
    foto('IOL', '2026-09', []),
  ]);
  assert.equal(serie[1].valorUsd, 0);
});

test('la serie es null si a alguna foto vigente le falta valuacion', () => {
  const serie = seriePorPeriodo([
    foto('IOL', '2026-08', [t('GGAL', 40, null)]),
    foto('Binance', '2026-09', [t('BTC', 0.1, 6000, 'CRIPTO')]),
  ]);
  assert.equal(serie[1].valorUsd, null);
});

test('conciliar distingue nuevo, sube, baja, igual y falta', () => {
  const filas = conciliar(
    [t('GGAL', 40, 400), t('AL30', 100, 60), t('SPY', 12, 600), t('MELI', 2, 40)],
    [t('GGAL', 50, 550), t('AL30', 80, 48), t('SPY', 12, 610), t('AAPL', 5, 100)],
  );
  const por = Object.fromEntries(filas.map(f => [f.activo, f]));
  assert.equal(por.AAPL.tipo, 'NUEVO');
  assert.equal(por.GGAL.tipo, 'SUBE');
  assert.equal(por.AL30.tipo, 'BAJA');
  assert.equal(por.SPY.tipo, 'IGUAL');
  assert.equal(por.MELI.tipo, 'FALTA');
  assert.equal(por.GGAL.precioUsd, 11);
  // Primero lo que cambia; lo igual al final.
  assert.deepEqual(filas.map(f => f.tipo), ['NUEVO', 'SUBE', 'BAJA', 'FALTA', 'IGUAL']);
});

test('el polvo de las cripto no cuenta como cambio', () => {
  const [f] = conciliar([t('BTC', 0.12345678, null, 'CRIPTO')], [t('BTC', 0.12345679, null, 'CRIPTO')]);
  assert.equal(f.tipo, 'IGUAL');
});

test('la misma foto dos veces no cambia nada', () => {
  const tenencias = [t('GGAL', 50, 550), t('AL30', 80, 48)];
  const filas = conciliar(tenencias, tenencias);
  assert.ok(filas.every(f => f.tipo === 'IGUAL'));
});

test('lo que falta en la foto se conserva salvo que digas que lo vendiste', () => {
  const filas = conciliar([t('GGAL', 40, 400), t('MELI', 2, 40)], [t('GGAL', 40, 410)]);
  assert.deepEqual(estadoFinal(filas, new Set()).map(x => [x.activo, x.cantidad]).sort(),
    [['GGAL', 40], ['MELI', 2]]);
  assert.deepEqual(estadoFinal(filas, new Set(['MELI'])).map(x => x.activo), ['GGAL']);
});

// --- Correcciones escritas ---------------------------------------------------

const cartera = () => [
  foto('IOL', '2026-08', [t('GGAL', 40, 400), t('AL30', 100, 60, 'RENTA_FIJA')]),
  foto('Binance', '2026-09', [t('BTC', 0.1, 6000, 'CRIPTO'), t('USDT', 200, 200, 'CRIPTO')]),
];

test('«tengo 50 GGAL, no 40» fija la cantidad en la cuenta donde esta', () => {
  const r = aplicarInstrucciones(cartera(), [ins({ accion: 'FIJAR', activo: 'ggal', cantidad: 50 })]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.cambios.length, 1);
  assert.equal(r.cambios[0].plataforma, 'InvertirOnline');
  assert.equal(r.cambios[0].desde, '2026-08');
  const ggal = r.cambios[0].nueva.find(x => x.activo === 'GGAL')!;
  assert.equal(ggal.cantidad, 50);
  // Se revalua con el precio de la ultima foto, no con uno inventado.
  assert.equal(ggal.valorUsd, 500);
});

test('sumar, restar y quitar parten de lo que hay', () => {
  const r = aplicarInstrucciones(cartera(), [
    ins({ accion: 'SUMAR', activo: 'BTC', cantidad: 0.05 }),
    ins({ accion: 'RESTAR', activo: 'AL30', cantidad: 30 }),
    ins({ accion: 'QUITAR', activo: 'USDT' }),
  ]);
  assert.deepEqual(r.errores, []);
  const todo = totalesPorActivo(r.cambios.map(c => ({ plataforma: c.plataforma, periodo: '', totalUsd: null, tenencias: c.nueva })));
  assert.ok(Math.abs(todo.get('BTC')! - 0.15) < 1e-12);
  assert.equal(todo.get('AL30'), 70);
  assert.equal(todo.has('USDT'), false);
});

test('restar mas de lo que hay es un error, no una cantidad negativa', () => {
  const r = aplicarInstrucciones(cartera(), [ins({ accion: 'RESTAR', activo: 'GGAL', cantidad: 45 })]);
  assert.equal(r.cambios.length, 0);
  assert.match(r.errores[0], /hay 40/);
});

test('un activo nuevo sin cuenta, habiendo varias: se pregunta, no se adivina', () => {
  const r = aplicarInstrucciones(cartera(), [ins({ accion: 'SUMAR', activo: 'AAPL', cantidad: 5 })]);
  assert.equal(r.cambios.length, 0);
  assert.match(r.errores[0], /En qué cuenta/);
});

test('un activo nuevo con cuenta dicha se agrega ahi, con el precio que dijiste', () => {
  const r = aplicarInstrucciones(cartera(), [
    ins({ accion: 'SUMAR', activo: 'AAPL', cantidad: 5, plataforma: 'iol', precioUsd: 180, fecha: '2026-09-20' }),
  ]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.cambios[0].plataforma, 'InvertirOnline');
  assert.equal(r.cambios[0].nueva.find(x => x.activo === 'AAPL')!.valorUsd, 900);
  assert.deepEqual(r.precios.AAPL, { precioUsd: 180, fecha: '2026-09-20' });
});

test('mover de cuenta toca las dos y no cambia el total', () => {
  const antes = totalesPorActivo(cartera());
  const r = aplicarInstrucciones(cartera(), [ins({ accion: 'MOVER', activo: 'AL30', plataforma: 'Binance' })]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.cambios.length, 2);
  const tocadas = new Set(r.cambios.map(c => c.plataforma));
  const despues = totalesPorActivo([
    ...cartera().filter(f => !tocadas.has(nombrePlataforma(f.plataforma))),
    ...r.cambios.map(c => ({ plataforma: c.plataforma, periodo: '', totalUsd: null, tenencias: c.nueva })),
  ]);
  assert.equal(despues.get('AL30'), antes.get('AL30'));
  assert.equal(r.cambios.find(c => c.plataforma === 'InvertirOnline')!.nueva.some(x => x.activo === 'AL30'), false);
});

test('un activo en dos cuentas sin decir cual: se pregunta', () => {
  const fotos = [...cartera(), foto('Balanz', '2026-09', [t('GGAL', 10, 100)])];
  const r = aplicarInstrucciones(fotos, [ins({ accion: 'FIJAR', activo: 'GGAL', cantidad: 60 })]);
  assert.equal(r.cambios.length, 0);
  assert.match(r.errores[0], /InvertirOnline y Balanz|Balanz y InvertirOnline/);
});

test('sin ninguna cuenta cargada, lo escrito va a «Manual»', () => {
  const r = aplicarInstrucciones([], [ins({ accion: 'FIJAR', activo: 'GGAL', cantidad: 10 })]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.cambios[0].plataforma, 'Manual');
  assert.equal(r.cambios[0].desde, null);
});

test('una correccion con error no frena las demas', () => {
  const r = aplicarInstrucciones(cartera(), [
    ins({ accion: 'QUITAR', activo: 'DOGE' }),
    ins({ accion: 'FIJAR', activo: 'GGAL', cantidad: 50 }),
  ]);
  assert.equal(r.errores.length, 1);
  assert.equal(r.cambios.length, 1);
});

// --- El libro ----------------------------------------------------------------

const datos = (m: Record<string, number | null>) =>
  new Map(Object.entries(m).map(([a, p]) => [a, { clase: 'CEDEAR', precioUsd: null, costoUsd: null, mercadoUsd: p, fecha: null }]));

test('el libro se ajusta por la diferencia contra lo que ya tiene', () => {
  const aj = ajustesDeLibro(
    new Map([['GGAL', 50], ['AL30', 70], ['AAPL', 5]]),
    new Map([['GGAL', 40], ['AL30', 100]]),
    ['GGAL', 'AL30', 'AAPL'],
    datos({ GGAL: 11, AL30: 0.6, AAPL: null }),
    '2026-09-27',
  );
  assert.deepEqual(aj.map(a => [a.activo, a.tipo, a.cantidad, a.precioUsd]), [
    ['AAPL', 'COMPRA', 5, null],
    ['AL30', 'VENTA', 30, 0.6],
    ['GGAL', 'COMPRA', 10, 11],
  ]);
  assert.ok(aj.every(a => a.fecha === '2026-09-27'));
});

test('confirmar dos veces no anota dos veces: la segunda la diferencia es cero', () => {
  const objetivo = new Map([['GGAL', 50]]);
  const primera = ajustesDeLibro(objetivo, new Map([['GGAL', 40]]), ['GGAL'], datos({ GGAL: 11 }), '2026-09-27');
  assert.equal(primera.length, 1);
  // Despues de aplicar la primera, el libro tiene 50.
  const segunda = ajustesDeLibro(objetivo, new Map([['GGAL', 50]]), ['GGAL'], datos({ GGAL: 11 }), '2026-09-27');
  assert.deepEqual(segunda, []);
});

test('mover de cuenta no anota nada en el libro', () => {
  const aj = ajustesDeLibro(new Map([['AL30', 100]]), new Map([['AL30', 100]]), ['AL30'], datos({ AL30: 0.6 }), '2026-09-27');
  assert.deepEqual(aj, []);
});

test('solo se ajustan los activos tocados, no todo lo que difiera', () => {
  // BTC difiere entre libro y cuentas, pero esta carga no lo toco: no es asunto suyo.
  const aj = ajustesDeLibro(
    new Map([['GGAL', 50], ['BTC', 1]]), new Map([['GGAL', 40], ['BTC', 0.5]]),
    ['GGAL'], datos({ GGAL: 11 }), '2026-09-27',
  );
  assert.deepEqual(aj.map(a => a.activo), ['GGAL']);
});

test('el precio del ajuste: lo dicho, despues el costo del broker, despues la foto', () => {
  const d = new Map([
    ['A', { clase: 'CEDEAR', precioUsd: 5, costoUsd: 3, mercadoUsd: 4, fecha: null }],
    ['B', { clase: 'CEDEAR', precioUsd: null, costoUsd: 3, mercadoUsd: 4, fecha: null }],
    ['C', { clase: 'CEDEAR', precioUsd: null, costoUsd: 3, mercadoUsd: 4, fecha: null }],
  ]);
  const aj = ajustesDeLibro(new Map([['A', 1], ['B', 1], ['C', 0]]), new Map([['C', 1]]), ['A', 'B', 'C'], d, '2026-09-27');
  assert.deepEqual(aj.map(a => [a.activo, a.tipo, a.precioUsd, a.fuente]), [
    ['A', 'COMPRA', 5, 'DICHO'],
    ['B', 'COMPRA', 3, 'COSTO_BROKER'],
    // Una venta no va al costo: va a lo que valia, que es lo que cobraste.
    ['C', 'VENTA', 4, 'MERCADO'],
  ]);
});

test('el efectivo vale 1 dolar por unidad sin preguntar', () => {
  assert.equal(completarValor({ activo: 'usd', clase: 'DOLAR', cantidad: 1618.27, valorUsd: null }).valorUsd, 1618.27);
  // Binance valua en pesos pero muestra BTC/USDT: el valor lo multiplica el codigo.
  const btc = completarValor({ activo: 'BTC', clase: 'CRIPTO', cantidad: 0.02569956, valorUsd: null, precioUsd: 84466 });
  assert.ok(Math.abs(btc.valorUsd! - 2170.74) < 0.01);
  assert.equal('precioUsd' in btc, false);
  // Sin precio no se inventa.
  assert.equal(completarValor({ activo: 'GGAL', clase: 'CEDEAR', cantidad: 10, valorUsd: null }).valorUsd, null);
});

test('«lo de IOL lo pase a efectivo, 6400 USD»: vacia la cuenta y deja el efectivo', () => {
  const r = aplicarInstrucciones(cartera(), [
    // Dicho en el orden natural: primero el efectivo. Igual se vacia antes.
    ins({ accion: 'FIJAR', activo: 'USD', cantidad: 6400, plataforma: 'IOL', clase: 'DOLAR' }),
    ins({ accion: 'VACIAR', activo: '', plataforma: 'iol' }),
  ]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.cambios.length, 1);
  assert.deepEqual(r.cambios[0].nueva, [{ activo: 'USD', clase: 'DOLAR', cantidad: 6400, valorUsd: 6400 }]);
  const filas = conciliar(r.cambios[0].anterior, r.cambios[0].nueva);
  assert.deepEqual(filas.map(f => [f.activo, f.tipo]), [['USD', 'NUEVO'], ['AL30', 'FALTA'], ['GGAL', 'FALTA']]);
});

test('vaciar una cuenta que no existe es un error, no una cuenta nueva', () => {
  const r = aplicarInstrucciones(cartera(), [ins({ accion: 'VACIAR', activo: '', plataforma: 'Balanz' })]);
  assert.equal(r.cambios.length, 0);
  assert.equal(r.errores.length, 1);
});

test('el caso completo: Galicia, BTC en Earn con su costo, IOL a efectivo', () => {
  // Estado previo: IOL con CEDEARs, libro con esas compras. Ni Galicia ni BTC.
  const previas = [foto('IOL', '2026-08', [t('GGAL', 40, 400), t('SPY', 10, 5900)])];
  const libro = new Map([['GGAL', 40], ['SPY', 10]]);

  // Foto de Binance: el saldo en pesos, el par BTC/USDT y el costo promedio.
  const binance = [completarValor({
    activo: 'BTC', clase: 'CRIPTO', cantidad: 0.02569956, valorUsd: null, precioUsd: 84466, costoUnitarioUsd: 69433.95,
  })];
  const filasBinance = conciliar([], binance);
  // Foto de Galicia: caja de ahorro en dolares.
  const galicia = [completarValor({ activo: 'USD', clase: 'DOLAR', cantidad: 1618.27, valorUsd: null })];
  const filasGalicia = conciliar([], galicia);
  // Texto: IOL a efectivo, con los CEDEARs vendidos.
  const texto = aplicarInstrucciones(previas, [
    ins({ accion: 'VACIAR', activo: '', plataforma: 'IOL' }),
    ins({ accion: 'FIJAR', activo: 'USD', cantidad: 6400, plataforma: 'IOL', clase: 'DOLAR' }),
  ]);
  const filasIol = conciliar(texto.cambios[0].anterior, texto.cambios[0].nueva);
  const iolFinal = estadoFinal(filasIol, new Set(['GGAL', 'SPY']));

  const objetivo = totalesPorActivo([
    { plataforma: 'Binance', periodo: '2026-09', totalUsd: null, tenencias: binance },
    { plataforma: 'Galicia', periodo: '2026-09', totalUsd: null, tenencias: galicia },
    { plataforma: 'IOL', periodo: '2026-09', totalUsd: null, tenencias: iolFinal },
  ]);
  const todas = [...filasBinance, ...filasGalicia, ...filasIol];
  const aj = ajustesDeLibro(objetivo, libro, todas.map(f => f.activo), datosDeActivos(todas), '2026-09-27');

  assert.deepEqual(aj.map(a => [a.activo, a.tipo, +a.cantidad.toFixed(8), a.precioUsd, a.fuente]), [
    // El BTC entra al costo que dice Binance, no al precio de hoy: asi la
    // ganancia de +21,65% que muestra Binance es la misma que muestra la app.
    ['BTC', 'COMPRA', 0.02569956, 69433.95, 'COSTO_BROKER'],
    ['GGAL', 'VENTA', 40, 10, 'MERCADO'],
    ['SPY', 'VENTA', 10, 590, 'MERCADO'],
    // Un solo ajuste de efectivo por las dos cuentas: 6400 + 1618,27.
    ['USD', 'COMPRA', 8018.27, 1, 'EFECTIVO'],
  ]);
});
