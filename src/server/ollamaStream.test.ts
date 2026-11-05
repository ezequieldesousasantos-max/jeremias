import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOllamaStream, trimHistory } from './ollamaStream.ts';

const enc = (s: string) => new TextEncoder().encode(s);
async function* chunks(parts: string[]) {
  for (const p of parts) yield enc(p);
}
async function collect(it: AsyncIterable<string>) {
  const out: string[] = [];
  for await (const p of it) out.push(p);
  return out;
}

test('parseOllamaStream: extrai os pedaços de texto e para no done', async () => {
  const lines = [
    '{"message":{"role":"assistant","content":"Ol"},"done":false}\n',
    '{"message":{"role":"assistant","content":"á"},"done":false}\n',
    '{"message":{"role":"assistant","content":""},"done":true,"eval_count":2}\n',
    '{"message":{"content":"IGNORADO"},"done":false}\n',
  ];
  assert.deepEqual(await collect(parseOllamaStream(chunks(lines))), ['Ol', 'á']);
});

test('parseOllamaStream: linhas partidas entre pedaços e erro do Ollama', async () => {
  const split = ['{"message":{"content":"a"},"do', 'ne":false}\n{"message":{"content":"b"},"done":true}\n'];
  assert.deepEqual(await collect(parseOllamaStream(chunks(split))), ['a', 'b']);
  await assert.rejects(collect(parseOllamaStream(chunks(['{"error":"model not found"}\n']))), /model not found/);
});

test('trimHistory: mantém só o mais recente que cabe e começa por fala do usuário', () => {
  const h = [
    { role: 'user' as const, text: 'a'.repeat(100) },
    { role: 'model' as const, text: 'b'.repeat(100) },
    { role: 'user' as const, text: 'c'.repeat(100) },
    { role: 'model' as const, text: 'd'.repeat(100) },
  ];
  assert.equal(trimHistory(h, 1000).length, 4);
  // cabem 2 mensagens (200 chars): user c + model d
  const t = trimHistory(h, 250);
  assert.deepEqual(t.map((x) => x.text[0]), ['c', 'd']);
  // cabe só a última (model d): sem user na frente, descarta
  assert.deepEqual(trimHistory(h, 150), []);
  assert.deepEqual(trimHistory(h, 0), []);
});
