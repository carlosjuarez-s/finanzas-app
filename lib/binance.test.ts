import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmar, preciosUsdt, tenencias } from './binance';

// La firma es lo unico de este cliente que se puede verificar sin llamar a la
// API. Si esta mal, todos los pedidos vuelven 401 y no hay forma de saber por
// que mirando el codigo.

test('la firma coincide con el vector de ejemplo de la documentacion', () => {
  const secret = 'NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j';
  const qs = 'symbol=LTCBTC&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559';
  assert.equal(firmar(qs, secret), 'c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71');
});

test('la firma cambia con cualquier variacion', () => {
  const secret = 'unSecretoDePrueba';
  const base = firmar('symbol=BTCUSDT&timestamp=1', secret);
  assert.notEqual(base, firmar('symbol=BTCUSDT&timestamp=2', secret));   // otro timestamp
  assert.notEqual(base, firmar('symbol=ETHUSDT&timestamp=1', secret));   // otro simbolo
  assert.notEqual(base, firmar('symbol=BTCUSDT&timestamp=1', 'otro'));   // otro secreto
  assert.equal(base, firmar('symbol=BTCUSDT&timestamp=1', secret));      // determinista
});

test('un 451 se explica como geo-bloqueo y no como problema de la clave', async () => {
  // La reaccion natural ante un error de Binance es ir a revisar la API key.
  // Con 451 eso es perder el tiempo: la clave esta bien, el bloqueado es el
  // servidor. El mensaje tiene que decirlo y decir donde se arregla.
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('', { status: 451 })) as typeof fetch;
  try {
    await assert.rejects(
      () => preciosUsdt(['BTC']),
      (e: Error) => {
        assert.match(e.message, /451/);
        assert.match(e.message, /No es un problema de tu clave/);
        assert.match(e.message, /gru1/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

// Un fetch falso que responde segun la ruta pedida.
function conRespuestas(rutas: Record<string, unknown>, fn: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const ruta = new URL(url).pathname;
    if (!(ruta in rutas)) return new Response('{"code":-1,"msg":"ruta inesperada"}', { status: 400 });
    const r = rutas[ruta];
    return r instanceof Response ? r : new Response(JSON.stringify(r), { status: 200 });
  }) as typeof fetch;
  return fn().finally(() => { globalThis.fetch = original; });
}
const cred = { apiKey: 'k', apiSecret: 's' };

test('las tenencias suman spot y Earn: lo que esta en Earn no desaparece', () => conRespuestas({
  '/api/v3/account': { balances: [
    { asset: 'BTC', free: '0.001', locked: '0' },
    { asset: 'USDT', free: '0', locked: '0' },
    // La misma plata de Earn vista desde spot: no se cuenta dos veces.
    { asset: 'LDBTC', free: '0.02469956', locked: '0' },
    // LDO es un token de verdad, no un espejo de Earn.
    { asset: 'LDO', free: '3', locked: '0' },
  ] },
  '/sapi/v1/simple-earn/flexible/position': { rows: [{ asset: 'BTC', totalAmount: '0.02469956' }], total: 1 },
  '/sapi/v1/simple-earn/locked/position': { rows: [{ asset: 'ETH', amount: '1.5' }], total: 1 },
}, async () => {
  const t = await tenencias(cred);
  assert.deepEqual(t.map(x => x.activo), ['BTC', 'ETH', 'LDO']);
  assert.ok(Math.abs(t[0].cantidad - 0.02569956) < 1e-12);
}));

test('si Earn no se puede leer, falla el sync: no se guarda una foto a medias', () => conRespuestas({
  '/api/v3/account': { balances: [{ asset: 'BTC', free: '0.001', locked: '0' }] },
  '/sapi/v1/simple-earn/flexible/position': new Response('{"code":-1002,"msg":"no autorizado"}', { status: 401 }),
  '/sapi/v1/simple-earn/locked/position': { rows: [], total: 0 },
}, async () => {
  await assert.rejects(() => tenencias(cred), /no autorizado/);
}));
