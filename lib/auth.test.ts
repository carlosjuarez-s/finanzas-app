import test from 'node:test';
import assert from 'node:assert/strict';
import { listaDeEmails, enLaLista, permitido } from './auth';

const LISTA = listaDeEmails('carlos@ejemplo.com, otra@ejemplo.com');

test('la lista acepta comas, espacios y saltos de linea', () => {
  assert.deepEqual(listaDeEmails('a@x.com,b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(listaDeEmails('a@x.com b@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(listaDeEmails('a@x.com\nb@x.com'), ['a@x.com', 'b@x.com']);
  assert.deepEqual(listaDeEmails(' a@x.com ,, b@x.com '), ['a@x.com', 'b@x.com']);
});

test('la lista normaliza mayusculas', () => {
  assert.deepEqual(listaDeEmails('Carlos@Ejemplo.COM'), ['carlos@ejemplo.com']);
});

test('sin variable seteada la lista queda vacia', () => {
  assert.deepEqual(listaDeEmails(undefined), []);
  assert.deepEqual(listaDeEmails(''), []);
  assert.deepEqual(listaDeEmails('   '), []);
});

test('una lista vacia no deja entrar a nadie', () => {
  // Falla cerrado: si la variable no esta, la app no queda abierta.
  assert.equal(enLaLista('carlos@ejemplo.com', []), false);
  assert.equal(permitido('carlos@ejemplo.com', true, []), false);
});

test('entra el que esta en la lista, sin importar mayusculas', () => {
  assert.equal(enLaLista('carlos@ejemplo.com', LISTA), true);
  assert.equal(enLaLista('CARLOS@Ejemplo.com', LISTA), true);
  assert.equal(enLaLista(' carlos@ejemplo.com ', LISTA), true);
});

test('no entra el que no esta', () => {
  assert.equal(enLaLista('ajeno@ejemplo.com', LISTA), false);
  assert.equal(enLaLista(null, LISTA), false);
  assert.equal(enLaLista(undefined, LISTA), false);
  assert.equal(enLaLista('', LISTA), false);
});

test('un email parecido no alcanza', () => {
  // Nada de prefijos ni sufijos: el match es textual y completo.
  assert.equal(enLaLista('carlos@ejemplo.com.ar', LISTA), false);
  assert.equal(enLaLista('xcarlos@ejemplo.com', LISTA), false);
  assert.equal(enLaLista('carlos@ejemplo.co', LISTA), false);
});

test('el dominio suelto no habilita a todo el dominio', () => {
  const soloDominio = listaDeEmails('@ejemplo.com');
  assert.equal(enLaLista('carlos@ejemplo.com', soloDominio), false);
});

test('sin email verificado por Google no entra aunque este en la lista', () => {
  assert.equal(permitido('carlos@ejemplo.com', true, LISTA), true);
  assert.equal(permitido('carlos@ejemplo.com', false, LISTA), false);
  assert.equal(permitido('carlos@ejemplo.com', undefined, LISTA), false);
  // Un "true" de string no es una verificacion: solo el booleano cuenta.
  assert.equal(permitido('carlos@ejemplo.com', 'true', LISTA), false);
});
