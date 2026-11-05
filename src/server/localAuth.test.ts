import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalPasswordAuth } from './localAuth.ts';

test('senha local: primeiro acesso, persistência e verificação', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-auth-'));
  const file = path.join(dir, 'auth.json');
  const codeFile = path.join(dir, 'data', 'codigo-autorizacao.txt');
  try {
    const auth = new LocalPasswordAuth(file, codeFile);
    assert.equal(auth.configured, false);
    await assert.rejects(auth.setup('curta'), /8 e 128 caracteres/);
    await auth.initializeAuthorizationCode();
    const authorizationCode = fs.readFileSync(codeFile, 'utf8').trim();
    assert.match(authorizationCode, /^JER-[A-F0-9]{48}$/);

    const password = 'senha123';
    await auth.setup(password);
    assert.equal(auth.configured, true);
    assert.equal(await auth.verify(password), true);
    assert.equal(await auth.verify('senha incorreta'), false);
    await assert.rejects(auth.setup(password), /já foi configurada/);
    await assert.rejects(auth.updatePassword(password, 'código errado', 'outrasenha8'), /código de autorização está incorreto/);
    await assert.rejects(auth.updatePassword('senha errada', authorizationCode, 'outrasenha8'), /senha atual está incorreta/);
    await assert.rejects(auth.updatePassword(password, authorizationCode, 'curta'), /8 e 128 caracteres/);
    await auth.updatePassword(password, authorizationCode, 'outrasenha8');
    assert.equal(await auth.verify(password), false);
    assert.equal(await auth.verify('outrasenha8'), true);
    const nextAuthorizationCode = fs.readFileSync(codeFile, 'utf8').trim();
    assert.match(nextAuthorizationCode, /^JER-[A-F0-9]{48}$/);
    assert.notEqual(nextAuthorizationCode, authorizationCode);
    await assert.rejects(auth.updatePassword('outrasenha8', authorizationCode, 'terceirasenha9'), /código de autorização está incorreto/);
    await auth.updatePassword('outrasenha8', nextAuthorizationCode, 'terceirasenha9');

    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(saved.version, 1);
    assert.notEqual(saved.hash, 'terceirasenha9');
    assert.equal(await new LocalPasswordAuth(file, codeFile).verify('terceirasenha9'), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('senha local: arquivo inválido gera erro explícito', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jer-auth-invalid-'));
  const file = path.join(dir, 'auth.json');
  try {
    fs.writeFileSync(file, 'not json');
    assert.throws(() => new LocalPasswordAuth(file, path.join(dir, 'code.txt')), /corrompido/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
