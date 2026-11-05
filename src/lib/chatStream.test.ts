import test from 'node:test';
import assert from 'node:assert/strict';
import { readNdjson } from './chatStream.ts';

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

test('readNdjson: junta linhas partidas entre pedaços e lê a última sem quebra', async () => {
  const out: any[] = [];
  for await (const o of readNdjson(streamOf(['{"type":"meta","a":1}\n{"type":"del', 'ta","text":"olá"}\n{"type":"done"}']))) out.push(o);
  assert.deepEqual(out, [{ type: 'meta', a: 1 }, { type: 'delta', text: 'olá' }, { type: 'done' }]);
});

test('readNdjson: não quebra caractere acentuado dividido entre pedaços', async () => {
  const bytes = new TextEncoder().encode('{"text":"ação"}\n');
  const cut = bytes.indexOf(0xc3) + 1; // no meio de "ç"
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.slice(0, cut));
      c.enqueue(bytes.slice(cut));
      c.close();
    },
  });
  const out: any[] = [];
  for await (const o of readNdjson(body)) out.push(o);
  assert.equal(out[0].text, 'ação');
});
