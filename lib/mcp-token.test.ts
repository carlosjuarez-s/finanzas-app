import test from 'node:test';
import assert from 'node:assert/strict';
import { tokenConfigurado } from './mcp-token';

test('sin MCP_TOKEN el servidor no esta habilitado', () => {
  // Falla cerrado: una variable que nadie seteo no puede terminar
  // significando "que entre cualquiera".
  const previo = process.env.MCP_TOKEN;
  delete process.env.MCP_TOKEN;
  assert.equal(tokenConfigurado(), false);

  process.env.MCP_TOKEN = '   ';
  assert.equal(tokenConfigurado(), false, 'espacios en blanco no son un token');

  process.env.MCP_TOKEN = 'un-secreto-largo';
  assert.equal(tokenConfigurado(), true);

  if (previo === undefined) delete process.env.MCP_TOKEN;
  else process.env.MCP_TOKEN = previo;
});
