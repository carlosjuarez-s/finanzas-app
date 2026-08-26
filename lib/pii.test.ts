import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactar, redactarProfundo } from './pii';

// El riesgo grande no es dejar pasar un dato: es comerse un monto. Estos tests
// existen sobre todo para que la redaccion no corrompa importes en silencio.

test('NO toca los montos, que es el riesgo real de sobre-redactar', () => {
  const montos = [
    'TOTAL A PAGAR $ 1.234.567,89',
    'Neto percibido 2850000',
    'Consumo 12345678 pesos',       // 8 digitos sueltos: podria confundirse con un DNI
    'Saldo 1234567,89 / USD 1.234,56',
    'Cuota 03/12 por $ 45.000',
  ];
  for (const m of montos) {
    assert.equal(redactar(m).texto, m, m);
  }
});

test('censura CUIT y CUIL en sus formas usuales', () => {
  assert.match(redactar('CUIL 20-12345678-3').texto, /\[CUIT\]/);
  assert.match(redactar('C.U.I.T.: 30712345674').texto, /\[CUIT\]/);
  assert.match(redactar('El empleador 30-71234567-4 declara').texto, /\[CUIT\]/);
  assert.doesNotMatch(redactar('CUIL 20-12345678-3').texto, /12345678/);
});

test('el DNI se censura solo con su etiqueta, nunca suelto', () => {
  assert.match(redactar('DNI 12.345.678').texto, /\[DNI\]/);
  assert.match(redactar('Documento: 12345678').texto, /\[DNI\]/);
  // Sin etiqueta es indistinguible de un importe: no se toca.
  assert.equal(redactar('Importe 12345678').texto, 'Importe 12345678');
});

test('la tarjeta conserva los ultimos cuatro digitos', () => {
  const r = redactar('Tarjeta 4509 9535 6623 3704');
  assert.match(r.texto, /\*\*\*\* \*\*\*\* \*\*\*\* 3704/);
  assert.doesNotMatch(r.texto, /4509/);
  assert.doesNotMatch(r.texto, /9535/);
});

test('censura CBU, email y telefono con prefijo o etiqueta', () => {
  assert.match(redactar('CBU 2850590940090418135201').texto, /\[CBU\]/);
  assert.match(redactar('carlos@ejemplo.com').texto, /\[EMAIL\]/);
  assert.match(redactar('Tel: 381 555 1234').texto, /\[TELEFONO\]/);
  assert.match(redactar('+54 9 381 5551234').texto, /\[TELEFONO\]/);
});

test('informa que tipos encontro, para poder mostrarlo', () => {
  const r = redactar('CUIL 20-12345678-3 y mail carlos@ejemplo.com');
  assert.ok(r.hallazgos.includes('CUIT'));
  assert.ok(r.hallazgos.includes('EMAIL'));
  assert.deepEqual(redactar('Alquiler 85000').hallazgos, []);
});

test('redactarProfundo recorre objetos y arrays sin romper los numeros', () => {
  const raw = {
    card: 'MASTER',
    totalArs: 1234567.89,
    titular: { nombre: 'Carlos', cuil: '20-12345678-3' },
    consumos: [{ comercio: 'Contacto carlos@ejemplo.com', montoArs: 45000 }],
  };
  const limpio = redactarProfundo(raw);
  assert.equal(limpio.totalArs, 1234567.89);              // los numeros quedan intactos
  assert.equal(limpio.consumos[0].montoArs, 45000);
  assert.match(limpio.titular.cuil, /\[CUIT\]/);
  assert.match(limpio.consumos[0].comercio, /\[EMAIL\]/);
  assert.equal(limpio.card, 'MASTER');
});
