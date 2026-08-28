import test from 'node:test';
import assert from 'node:assert/strict';
import { despachar, nombresDeHerramientas } from './mcp';

const U = 'usuario-de-prueba';
const pedir = (method: string, params?: Record<string, unknown>) =>
  despachar(U, { jsonrpc: '2.0', method, params });

test('initialize devuelve la version del protocolo y las capacidades', async () => {
  const r = await pedir('initialize');
  assert.equal(r.tipo, 'resultado');
  const res = (r as { result: Record<string, unknown> }).result;
  assert.match(String(res.protocolVersion), /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(res.capabilities, { tools: {} });
});

test('la notificacion de inicializado no lleva respuesta', async () => {
  // El protocolo lo pide: contestarle a una notificacion es un error.
  assert.deepEqual(await pedir('notifications/initialized'), { tipo: 'sin-contenido' });
});

test('tools/list expone las herramientas con su schema', async () => {
  const r = await pedir('tools/list');
  const { tools } = (r as { result: { tools: { name: string; description: string; inputSchema: { type: string } }[] } }).result;

  assert.ok(tools.length >= 7);
  for (const t of tools) {
    assert.ok(t.description.length > 30, `${t.name} necesita una descripcion util para el modelo`);
    assert.equal(t.inputSchema.type, 'object');
  }
  assert.deepEqual(tools.map(t => t.name).sort(), nombresDeHerramientas().sort());
});

test('ninguna herramienta escribe', async () => {
  // La garantia no es que nadie las llame mal: es que no existen.
  const r = await pedir('tools/list');
  const { tools } = (r as { result: { tools: { name: string }[] } }).result;
  for (const t of tools) {
    assert.doesNotMatch(t.name, /crear|guardar|borrar|editar|actualizar|eliminar/i);
  }
});

test('una herramienta que no existe da error de parametro', async () => {
  const r = await despachar(U, { jsonrpc: '2.0', method: 'tools/call', params: { name: 'borrar_todo' } });
  assert.equal(r.tipo, 'error');
  assert.equal((r as { code: number }).code, -32602);
});

test('un argumento invalido vuelve como isError, no como error de protocolo', async () => {
  // El modelo tiene que poder leer "el periodo estaba mal" y corregir solo.
  // Un error de protocolo le corta la conversacion.
  const r = await despachar(U, {
    jsonrpc: '2.0', method: 'tools/call',
    params: { name: 'resumen_del_mes', arguments: { periodo: 'agosto' } },
  });
  assert.equal(r.tipo, 'resultado');
  const res = (r as { result: { isError: boolean; content: { text: string }[] } }).result;
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /YYYY-MM/);
});

test('un metodo desconocido no se inventa una respuesta', async () => {
  const r = await pedir('tools/destroy');
  assert.equal(r.tipo, 'error');
  assert.equal((r as { code: number }).code, -32601);
});

test('un pedido que no es JSON-RPC 2.0 se rechaza', async () => {
  assert.equal((await despachar(U, null)).tipo, 'error');
  assert.equal((await despachar(U, { method: 'ping' })).tipo, 'error');
  assert.equal((await despachar(U, { jsonrpc: '1.0', method: 'ping' })).tipo, 'error');
  const r = await despachar(U, { jsonrpc: '2.0' });
  assert.equal((r as { status: number }).status, 400);
});

test('ping contesta vacio', async () => {
  assert.deepEqual(await pedir('ping'), { tipo: 'resultado', result: {} });
});
