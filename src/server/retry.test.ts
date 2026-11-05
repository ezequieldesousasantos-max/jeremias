import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransient, withRetry, describeModelError } from './retry.ts';

const noSleep = async () => {};

test('isTransient: 503 e queda de rede sim; cota e chave inválida não', () => {
  assert.equal(isTransient(new Error('503 UNAVAILABLE: high demand')), true);
  assert.equal(isTransient(new Error('fetch failed')), true);
  assert.equal(isTransient(new Error('429 RESOURCE_EXHAUSTED quota')), false);
  assert.equal(isTransient(new Error('API key not valid')), false);
});

test('withRetry repete 503 e depois dá certo', async () => {
  let n = 0;
  const waits: number[] = [];
  const r = await withRetry(async () => { if (++n < 3) throw new Error('503 UNAVAILABLE'); return 'ok'; },
    { sleep: async (ms) => { waits.push(ms); } });
  assert.equal(r, 'ok');
  assert.equal(n, 3);
  assert.deepEqual(waits, [1500, 4000]);
});

test('withRetry desiste após 3 repetições (4 chamadas)', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error('503'); }, { sleep: noSleep }), /503/);
  assert.equal(n, 4);
});

test('withRetry não repete 429 nem chave inválida', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new Error('429 quota'); }, { sleep: noSleep }));
  await assert.rejects(withRetry(async () => { n++; throw new Error('API key not valid'); }, { sleep: noSleep }));
  assert.equal(n, 2);
});

test('mensagens em português', () => {
  assert.match(describeModelError(new Error('503 UNAVAILABLE')), /alta demanda/);
  assert.match(describeModelError(new Error('429 RESOURCE_EXHAUSTED')), /cota gratuita/);
  assert.match(describeModelError(new Error('API key not valid')), /recusou a chave/);
  assert.equal(describeModelError(new Error('algo estranho')), 'algo estranho');
});
