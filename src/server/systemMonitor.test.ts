import test from 'node:test';
import assert from 'node:assert/strict';
import { createSystemMonitor } from './systemMonitor.ts';

test('monitor do sistema expõe métricas reais e limita sondagens externas', async () => {
  let probes = 0;
  const monitor = createSystemMonitor(async () => {
    probes++;
    return { status: 204 };
  });

  const first = await monitor();
  assert.ok(first.cpu.model.length > 0);
  assert.ok(first.cpu.logicalCores > 0);
  assert.ok(first.memory.totalBytes > 0);
  assert.ok(first.memory.usagePercent >= 0 && first.memory.usagePercent <= 100);
  assert.ok('totalBytes' in first.storage || 'error' in first.storage);
  assert.equal(first.internet.connected, true);
  assert.equal(probes, 1);
  assert.ok(Array.isArray(first.network.interfaces));

  const second = await monitor();
  assert.equal(second.internet.connected, true);
  assert.equal(probes, 1);
});

test('monitor do sistema informa falha de internet sem ocultar estado do hardware', async () => {
  const monitor = createSystemMonitor(async () => { throw new Error('offline'); });
  const snapshot = await monitor();
  assert.equal(snapshot.internet.connected, false);
  assert.match(snapshot.internet.detail, /Não foi possível alcançar/);
  assert.ok(snapshot.cpu.logicalCores > 0);
});
