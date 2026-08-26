import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularPosicion, calcularPosiciones, conPrecio, discrepancias, ErrorCosto,
  type Transaccion, type EventoActivo,
} from './costo';

// Un error acá no explota: muestra plata que no existe. Estos tests son la
// unica forma de saber que los numeros estan bien sin comparar a mano contra el
// broker todos los meses.

const compra = (o: Partial<Transaccion> = {}): Transaccion => ({
  activo: 'BTC', tipo: 'COMPRA', fecha: '2026-01-10', cantidad: 1,
  precioUnitario: 100, moneda: 'USD', tipoCambioDia: null, comision: 0, ...o,
});

test('una sola compra: el costo unitario es el precio pagado', () => {
  const p = calcularPosicion('BTC', [compra({ cantidad: 2, precioUnitario: 50 })]);
  assert.equal(p.cantidad, 2);
  assert.equal(p.costoTotalUsd, 100);
  assert.equal(p.costoUnitarioUsd, 50);
  assert.equal(p.realizadoUsd, 0);
});

test('dos compras a distinto precio dan el promedio ponderado', () => {
  const p = calcularPosicion('BTC', [
    compra({ fecha: '2026-01-10', cantidad: 1, precioUnitario: 100 }),
    compra({ fecha: '2026-02-10', cantidad: 3, precioUnitario: 200 }),
  ]);
  // (1x100 + 3x200) / 4 = 175, no 150: es ponderado, no promedio simple.
  assert.equal(p.cantidad, 4);
  assert.equal(p.costoTotalUsd, 700);
  assert.equal(p.costoUnitarioUsd, 175);
});

test('la comision de compra entra en el costo', () => {
  const p = calcularPosicion('BTC', [compra({ cantidad: 1, precioUnitario: 100, comision: 5 })]);
  assert.equal(p.costoTotalUsd, 105);
  assert.equal(p.comisionesUsd, 5);
});

test('una venta parcial realiza ganancia y deja el resto al mismo costo', () => {
  const p = calcularPosicion('BTC', [
    compra({ fecha: '2026-01-10', cantidad: 4, precioUnitario: 100 }),
    { ...compra(), tipo: 'VENTA', fecha: '2026-03-10', cantidad: 1, precioUnitario: 150 },
  ]);
  assert.equal(p.cantidad, 3);
  assert.equal(p.realizadoUsd, 50);        // vendio a 150 lo que le costo 100
  assert.equal(p.costoTotalUsd, 300);      // le quedan 3 a 100
  assert.equal(p.costoUnitarioUsd, 100);
});

test('vender todo deja la posicion en cero sin restos de redondeo', () => {
  const p = calcularPosicion('BTC', [
    compra({ cantidad: 0.3, precioUnitario: 100 }),
    { ...compra(), tipo: 'VENTA', fecha: '2026-03-10', cantidad: 0.3, precioUnitario: 120 },
  ]);
  assert.equal(p.cantidad, 0);
  assert.equal(p.costoTotalUsd, 0);
  assert.ok(Math.abs(p.realizadoUsd - 6) < 1e-9);
});

test('vender mas de lo que hay avisa en vez de calcular cualquier cosa', () => {
  assert.throws(() => calcularPosicion('BTC', [
    compra({ cantidad: 1, precioUnitario: 100 }),
    { ...compra(), tipo: 'VENTA', fecha: '2026-03-10', cantidad: 5, precioUnitario: 120 },
  ]), ErrorCosto);
});

// --- El caso argentino ------------------------------------------------------

test('una operacion en pesos se mide con el dolar de SU dia', () => {
  const p = calcularPosicion('AAPL', [
    { activo: 'AAPL', tipo: 'COMPRA', fecha: '2026-01-10', cantidad: 10,
      precioUnitario: 10000, moneda: 'ARS', tipoCambioDia: 1000, comision: 0 },
  ]);
  // 10 x 10.000 ARS = 100.000 ARS, a 1000 = USD 100.
  assert.equal(p.costoTotalUsd, 100);
  assert.equal(p.costoUnitarioUsd, 10);
});

test('la ganancia en pesos puede ser perdida en dolares', () => {
  // El caso del plan: compraste a $10.000 con el dolar a $1.000 y hoy vale
  // $15.000 con el dolar a $1.600. En pesos "ganaste 50%".
  const p = calcularPosicion('AAPL', [
    { activo: 'AAPL', tipo: 'COMPRA', fecha: '2026-01-10', cantidad: 1,
      precioUnitario: 10000, moneda: 'ARS', tipoCambioDia: 1000, comision: 0 },
  ]);
  assert.equal(p.costoTotalUsd, 10);

  const hoyUsd = 15000 / 1600;                    // 9,375
  const r = conPrecio(p, hoyUsd);
  assert.ok(r.noRealizadoUsd! < 0, 'en dolares tiene que dar perdida');
  assert.ok(Math.abs(r.retornoPct! - (-6.25)) < 0.01);
});

test('una operacion en pesos sin tipo de cambio no se calcula a la bartola', () => {
  assert.throws(() => calcularPosicion('AAPL', [
    { activo: 'AAPL', tipo: 'COMPRA', fecha: '2026-01-10', cantidad: 1,
      precioUnitario: 10000, moneda: 'ARS', tipoCambioDia: null, comision: 0 },
  ]), ErrorCosto);
});

// --- Ratios de CEDEAR -------------------------------------------------------

test('un cambio de ratio NO inventa una perdida', () => {
  // Este es el bug que el plan identifico: 100 unidades a USD 50 y despues un
  // cambio de ratio 4:1. Quedan 400 unidades a USD 12,50. El valor total no se
  // movio, y comparar contra el precio de entrada viejo mostraria -75%.
  const tx = [compra({ activo: 'AAPL', cantidad: 100, precioUnitario: 50, fecha: '2026-01-10' })];
  const ev: EventoActivo[] = [{ activo: 'AAPL', fecha: '2026-02-01', tipo: 'RATIO', factor: 4 }];

  const p = calcularPosicion('AAPL', tx, ev);
  assert.equal(p.cantidad, 400);
  assert.equal(p.costoTotalUsd, 5000);      // lo invertido no cambia
  assert.equal(p.costoUnitarioUsd, 12.5);   // el unitario se divide por 4

  // Con el precio ya ajustado por el ratio, el resultado es cero, no -75%.
  const r = conPrecio(p, 12.5);
  assert.equal(r.noRealizadoUsd, 0);
  assert.equal(r.retornoPct, 0);
});

test('el orden importa: una compra despues del ratio no se multiplica', () => {
  const tx = [
    compra({ activo: 'AAPL', cantidad: 100, precioUnitario: 50, fecha: '2026-01-10' }),
    compra({ activo: 'AAPL', cantidad: 100, precioUnitario: 12.5, fecha: '2026-03-10' }),
  ];
  const ev: EventoActivo[] = [{ activo: 'AAPL', fecha: '2026-02-01', tipo: 'RATIO', factor: 4 }];

  const p = calcularPosicion('AAPL', tx, ev);
  // 100 se vuelven 400, mas 100 compradas despues = 500.
  assert.equal(p.cantidad, 500);
  assert.equal(p.costoTotalUsd, 5000 + 1250);
  assert.equal(p.costoUnitarioUsd, 12.5);
});

test('vender despues de un ratio usa el costo ya ajustado', () => {
  const tx: Transaccion[] = [
    compra({ activo: 'AAPL', cantidad: 100, precioUnitario: 50, fecha: '2026-01-10' }),
    { ...compra({ activo: 'AAPL' }), tipo: 'VENTA', fecha: '2026-03-10', cantidad: 200, precioUnitario: 15 },
  ];
  const ev: EventoActivo[] = [{ activo: 'AAPL', fecha: '2026-02-01', tipo: 'RATIO', factor: 4 }];

  const p = calcularPosicion('AAPL', tx, ev);
  assert.equal(p.cantidad, 200);
  // Vendio 200 a 15 = 3000, con costo 200 x 12,50 = 2500. Ganancia 500.
  assert.equal(p.realizadoUsd, 500);
  assert.equal(p.costoTotalUsd, 2500);
});

test('un factor invalido se rechaza', () => {
  assert.throws(() => calcularPosicion('AAPL',
    [compra({ activo: 'AAPL' })],
    [{ activo: 'AAPL', fecha: '2026-02-01', tipo: 'RATIO', factor: 0 }],
  ), ErrorCosto);
});

// --- Precio ausente y discrepancias ----------------------------------------

test('sin cotizacion devuelve null, no cero', () => {
  const r = conPrecio(calcularPosicion('BTC', [compra()]), null);
  assert.equal(r.valorActualUsd, null);
  assert.equal(r.noRealizadoUsd, null);
  assert.equal(r.retornoPct, null);
});

test('detecta un ratio sin cargar comparando con el broker', () => {
  const p = calcularPosicion('AAPL', [compra({ activo: 'AAPL', cantidad: 100, precioUnitario: 50 })]);
  const [d] = discrepancias([p], [{ activo: 'AAPL', cantidad: 400 }]);
  assert.match(d.mensaje, /ratio|split/i);
  assert.match(d.mensaje, /factor 4/);
});

test('detecta tenencias sin ninguna compra cargada', () => {
  const [d] = discrepancias([], [{ activo: 'ETH', cantidad: 2 }]);
  assert.match(d.mensaje, /ninguna compra cargada/);
});

test('el polvo de las cripto no cuenta como discrepancia', () => {
  const p = calcularPosicion('BTC', [compra({ cantidad: 0.5, precioUnitario: 100 })]);
  assert.equal(discrepancias([p], [{ activo: 'BTC', cantidad: 0.50000001 }]).length, 0);
});

test('calcularPosiciones separa por activo', () => {
  const ps = calcularPosiciones([
    compra({ activo: 'BTC', cantidad: 1, precioUnitario: 100 }),
    compra({ activo: 'ETH', cantidad: 5, precioUnitario: 20 }),
  ]);
  assert.deepEqual(ps.map(p => p.activo), ['BTC', 'ETH']);
  assert.equal(ps[1].costoTotalUsd, 100);
});
