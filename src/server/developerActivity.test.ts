import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeveloperActivityLog } from './developerActivity.ts';

test('activity monitor retains bounded metadata and copies snapshots', () => {
  const log = createDeveloperActivityLog();
  log.record('file-search', 'Busca local concluída', ['C:\\Documents', 'C:\\Documents', '', ...Array.from({ length: 25 }, (_, i) => `C:\\root-${i}`)]);

  const first = log.snapshot();
  assert.equal(first.length, 1);
  assert.equal(first[0].action, 'file-search');
  assert.equal(first[0].status, 'completed');
  assert.equal(first[0].locations.length, 20);
  assert.equal(new Set(first[0].locations).size, first[0].locations.length);
  first[0].locations.length = 0;
  assert.equal(log.snapshot()[0].locations.length, 20);

  for (let i = 0; i < 305; i++) log.record('step', `Passo ${i}`);
  assert.equal(log.snapshot().length, 300);
  assert.equal(log.snapshot()[0].summary, 'Passo 304');
});

test('activity monitor updates in-progress events when an operation completes', () => {
  const log = createDeveloperActivityLog();
  const id = log.record('local-tools', 'Verificando ferramentas locais.', [], 'in_progress');
  log.complete(id, 'file-search', 'Busca concluída.', ['C:\\Documents\\notes.txt']);

  const [event] = log.snapshot();
  assert.equal(event.status, 'completed');
  assert.equal(event.action, 'file-search');
  assert.equal(event.summary, 'Busca concluída.');
  assert.deepEqual(event.locations, ['C:\\Documents\\notes.txt']);
});
