import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessMonitor } from './accessMonitor.ts';

test('monitor de acessos registra sem query string e detecta falhas repetidas de login', () => {
  const monitor = createAccessMonitor();
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    monitor.record({ method: 'POST', path: '/api/auth/login?token=nao-registrar', status: 401 }, now + i);
  }

  const snapshot = monitor.snapshot();
  assert.equal(snapshot.events.length, 5);
  assert.equal(snapshot.events[0].path, '/api/auth/login');
  assert.equal(snapshot.alerts.length, 1);
  assert.equal(snapshot.alerts[0].rule, 'repeated-login-failures');
  assert.equal(snapshot.alerts[0].severity, 'high');
});

test('monitor de acessos detecta rotas inexistentes e erros repetidos do servidor', () => {
  const monitor = createAccessMonitor();
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    monitor.record({ method: 'GET', path: '/api/not-found', status: 404 }, now + i);
  }
  for (let i = 0; i < 3; i++) {
    monitor.record({ method: 'GET', path: '/api/failing-service', status: 503 }, now + 20 + i);
  }

  assert.deepEqual(
    monitor.snapshot().alerts.map((item) => item.rule).sort(),
    ['repeated-not-found', 'repeated-server-errors'],
  );
});

test('monitor de acessos limita histórico e não alerta sobre uma ocorrência isolada', () => {
  const monitor = createAccessMonitor();
  const now = Date.now();
  for (let i = 0; i < 510; i++) {
    monitor.record({ method: 'GET', path: '/api/system/status', status: 200 }, now + i);
  }

  const snapshot = monitor.snapshot();
  assert.equal(snapshot.events.length, 500);
  assert.equal(snapshot.alerts.length, 0);
  assert.equal(snapshot.events[0].id, 510);
});
