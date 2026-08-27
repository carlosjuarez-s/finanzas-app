import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { cifrar, descifrar, recifrar, pista, igualSeguro, bovedaConfigurada, estadoBoveda, ErrorBoveda } from './boveda';
import { censurarSecretos, errorCensurado } from './secretos';

const CLAVE_1 = randomBytes(32).toString('base64');
const CLAVE_2 = randomBytes(32).toString('base64');

beforeEach(() => {
  process.env.BOVEDA_CLAVE_1 = CLAVE_1;
  process.env.BOVEDA_CLAVE_2 = CLAVE_2;
  process.env.BOVEDA_CLAVE_ACTUAL = '1';
});

const CREDENCIAL = { apiKey: 'kO3nD9xQw2LmZa7Tf', apiSecret: 'b8Vx1PqRt6YuEi0OsAdFgHjKl' };

test('cifra y descifra sin perder nada', () => {
  const c = cifrar(CREDENCIAL, 'conexion:abc123');
  assert.deepEqual(descifrar(c, 'conexion:abc123'), CREDENCIAL);
});

test('el secreto no aparece en claro en lo que se guarda', () => {
  const c = cifrar(CREDENCIAL, 'conexion:abc123');
  const guardado = JSON.stringify(c);
  assert.doesNotMatch(guardado, /kO3nD9xQw2LmZa7Tf/);
  assert.doesNotMatch(guardado, /b8Vx1PqRt6YuEi0OsAdFgHjKl/);
});

test('dos cifrados del mismo valor son distintos', () => {
  // IV aleatorio por cifrado: si fueran iguales, se podria deducir que dos
  // conexiones comparten la misma credencial con solo mirar la base.
  const a = cifrar(CREDENCIAL, 'conexion:abc123');
  const b = cifrar(CREDENCIAL, 'conexion:abc123');
  assert.notEqual(a.datos, b.datos);
  assert.notEqual(a.iv, b.iv);
});

test('un secreto no se puede mover de una fila a otra', () => {
  // El AAD ata el ciphertext a su conexion. Sin esto, alguien con escritura en
  // la base podria copiar las credenciales de IOL a una fila rotulada
  // "Binance, solo lectura" y hacer que la app las use creyendo otra cosa.
  const c = cifrar(CREDENCIAL, 'conexion:abc123');
  assert.throws(() => descifrar(c, 'conexion:otra999'), ErrorBoveda);
});

test('un dato alterado falla en vez de devolver basura', () => {
  const c = cifrar(CREDENCIAL, 'conexion:abc123');

  const datosRotos = Buffer.from(c.datos, 'base64');
  datosRotos[0] ^= 0xff;
  assert.throws(
    () => descifrar({ ...c, datos: datosRotos.toString('base64') }, 'conexion:abc123'),
    ErrorBoveda,
  );

  const tagRoto = Buffer.from(c.tag, 'base64');
  tagRoto[0] ^= 0xff;
  assert.throws(
    () => descifrar({ ...c, tag: tagRoto.toString('base64') }, 'conexion:abc123'),
    ErrorBoveda,
  );
});

test('con otra clave maestra no abre', () => {
  const c = cifrar(CREDENCIAL, 'conexion:abc123');
  process.env.BOVEDA_CLAVE_1 = randomBytes(32).toString('base64');
  assert.throws(() => descifrar(c, 'conexion:abc123'), ErrorBoveda);
});

test('rotar la clave no pierde las conexiones ya guardadas', () => {
  const viejo = cifrar(CREDENCIAL, 'conexion:abc123');
  assert.equal(viejo.v, 1);

  process.env.BOVEDA_CLAVE_ACTUAL = '2';
  // Lo viejo se sigue leyendo porque la version quedo guardada con el dato.
  assert.deepEqual(descifrar(viejo, 'conexion:abc123'), CREDENCIAL);

  const nuevo = recifrar(viejo, 'conexion:abc123');
  assert.equal(nuevo.v, 2);
  assert.deepEqual(descifrar(nuevo, 'conexion:abc123'), CREDENCIAL);
});

test('sin clave configurada avisa que falta y como generarla', () => {
  delete process.env.BOVEDA_CLAVE_1;
  assert.equal(bovedaConfigurada(), false);
  assert.throws(() => cifrar(CREDENCIAL, 'x'), /BOVEDA_CLAVE_1/);
  assert.throws(() => cifrar(CREDENCIAL, 'x'), /randomBytes/);
});

test('una clave de largo equivocado se rechaza con el motivo', () => {
  process.env.BOVEDA_CLAVE_1 = Buffer.from('corta').toString('base64');
  assert.throws(() => cifrar(CREDENCIAL, 'x'), /AES-256 necesita 32/);
});

test('el contexto es obligatorio', () => {
  assert.throws(() => cifrar(CREDENCIAL, ''), ErrorBoveda);
});

test('la pista identifica sin exponer', () => {
  assert.equal(pista('kO3nD9xQw2LmZa7Tf'), '••••a7Tf');
  // Con un secreto corto no se da ninguna pista: ayudaria a adivinarlo.
  assert.equal(pista('abc'), '••••');
});

test('igualSeguro compara bien', () => {
  assert.equal(igualSeguro('abc123', 'abc123'), true);
  assert.equal(igualSeguro('abc123', 'abc124'), false);
  assert.equal(igualSeguro('abc', 'abcdef'), false);   // largos distintos, sin explotar
});

// --- Censura de secretos en errores ---------------------------------------

test('censura la API key que viene en el mensaje de error de Binance', () => {
  const error = new Error(
    'Request failed: GET https://api.binance.com/api/v3/account?timestamp=1758&signature=9a8b7c6d5e4f3a2b1c0d ' +
    '(X-MBX-APIKEY: kO3nD9xQw2LmZa7Tf) -> 401 Invalid API-key',
  );
  const salida = errorCensurado(error, [CREDENCIAL.apiKey, CREDENCIAL.apiSecret]);

  assert.doesNotMatch(salida, /kO3nD9xQw2LmZa7Tf/);
  assert.doesNotMatch(salida, /9a8b7c6d5e4f3a2b1c0d/);
  // Y sigue sirviendo para diagnosticar: el motivo real no se toca.
  assert.match(salida, /401 Invalid API-key/);
  assert.match(salida, /api\.binance\.com/);
});

test('censura credenciales sueltas en JSON y en form data', () => {
  assert.doesNotMatch(
    censurarSecretos('{"username":"carlos","password":"MiClaveSuperSecreta"}'),
    /MiClaveSuperSecreta/,
  );
  assert.doesNotMatch(
    censurarSecretos('grant_type=password&username=carlos&password=MiClaveSuperSecreta'),
    /MiClaveSuperSecreta/,
  );
  assert.doesNotMatch(
    censurarSecretos('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
    /eyJhbGciOi/,
  );
});

test('NO sobre-censura: un error censurado tiene que seguir sirviendo', () => {
  const texto = 'Timeout tras 30000 ms consultando la orden 8892310457 del activo AAPL';
  // Ids de operacion, montos y tickers no son secretos: censurarlos dejaria un
  // error inutil para diagnosticar.
  assert.equal(censurarSecretos(texto), texto);
  // Un "secreto" demasiado corto no se usa como patron de reemplazo.
  assert.equal(censurarSecretos('El activo BTC subio', ['BTC']), 'El activo BTC subio');
});

test('censura primero los secretos mas largos', () => {
  // Si un secreto es prefijo de otro, censurar el corto primero dejaria el
  // resto del largo visible en el texto.
  const corto = 'abcdefgh';
  const largo = 'abcdefghIJKLMNOP';
  const salida = censurarSecretos(`clave=${largo}`, [corto, largo]);
  assert.doesNotMatch(salida, /IJKLMNOP/);
});

test('el estado distingue la clave que falta de la que esta mal pegada', () => {
  // La UI muestra este motivo al lado del boton deshabilitado: si las dos
  // situaciones dijeran lo mismo, mandaria a buscar el problema al lugar
  // equivocado.
  delete process.env.BOVEDA_CLAVE_1;
  const falta = estadoBoveda();
  assert.equal(falta.ok, false);
  assert.match(falta.ok === false ? falta.motivo : '', /Falta la variable BOVEDA_CLAVE_1/);

  process.env.BOVEDA_CLAVE_1 = Buffer.from('corta').toString('base64');
  const corta = estadoBoveda();
  assert.equal(corta.ok, false);
  assert.match(corta.ok === false ? corta.motivo : '', /AES-256 necesita 32/);

  process.env.BOVEDA_CLAVE_1 = randomBytes(32).toString('base64');
  assert.deepEqual(estadoBoveda(), { ok: true });
  assert.equal(bovedaConfigurada(), true);
});
