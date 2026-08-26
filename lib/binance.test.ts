import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firmar } from './binance';

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
