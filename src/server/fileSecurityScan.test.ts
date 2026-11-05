import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanAuthorizedFiles } from './fileSecurityScan.ts';

test('varredura encontra padrões suspeitos sem expor o conteúdo da linha', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-scan-'));
  try {
    fs.writeFileSync(path.join(root, 'app.ts'), [
      "const api_key = 'valor-de-teste-nao-real-123';",
      'eval(input);',
      'fetch(url, { rejectUnauthorized: false });',
    ].join('\n'));

    const result = await scanAuthorizedFiles([root]);
    assert.equal(result.summary.filesScanned, 1);
    assert.deepEqual(result.findings.map((item) => item.rule), [
      'hardcoded-credential',
      'dynamic-code-execution',
      'disabled-tls-verification',
    ]);
    assert.ok(result.findings.every((item) => !('snippet' in item)));
    assert.ok(result.findings.every((item) => item.file === path.join(root, 'app.ts')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('varredura ignora arquivos de segredo e arquivos fora das extensões analisáveis', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-scan-skip-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), "password='nao-ler-este-arquivo-secreto'");
    fs.writeFileSync(path.join(root, 'auth.json'), '{"token":"nao-ler"}');
    fs.writeFileSync(path.join(root, 'document.pdf'), 'conteudo-nao-analisavel');
    fs.writeFileSync(path.join(root, 'safe.ts'), 'export const ok = true;');

    const result = await scanAuthorizedFiles([root]);
    assert.equal(result.summary.filesScanned, 1);
    assert.equal(result.findings.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('varredura respeita limites e sinaliza resultado incompleto', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-scan-limit-'));
  try {
    fs.writeFileSync(path.join(root, 'one.ts'), 'const one = 1;');
    fs.writeFileSync(path.join(root, 'two.ts'), 'const two = 2;');

    const result = await scanAuthorizedFiles([root], { maxFiles: 1 });
    assert.equal(result.summary.filesScanned, 1);
    assert.equal(result.summary.truncated, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
