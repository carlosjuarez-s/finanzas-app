import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmar, preciosUsdt } from './binance';

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
