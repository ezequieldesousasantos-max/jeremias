import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPublicSiteAddress, normalizePublicSiteUrl, siteToOpen } from './publicSiteUrl.ts';

test('public website address can be extracted from a chat message', () => {
  assert.equal(extractPublicSiteAddress('Acesse https://codenames.game/room/abc.'), 'https://codenames.game/room/abc');
  assert.equal(extractPublicSiteAddress('Pode abrir stopots.com?'), 'stopots.com');
  assert.equal(extractPublicSiteAddress('Sem link nesta mensagem'), null);
});

test('public website address normalizes HTTPS and accepts HTTP(S)', () => {
  assert.equal(normalizePublicSiteUrl('codenames.game'), 'https://codenames.game/');
  assert.equal(
    normalizePublicSiteUrl(extractPublicSiteAddress('https://codenames.game/r/dujuk-vodos') || ''),
    'https://codenames.game/r/dujuk-vodos',
  );
  assert.equal(normalizePublicSiteUrl('http://stopots.com/game'), 'http://stopots.com/game');
});

test('public website address rejects non-web schemes and local or private hosts', () => {
  for (const address of [
    'file:///C:/Users/example.txt',
    'javascript:alert(1)',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://192.168.1.1',
    'http://10.0.0.2',
    'http://172.20.1.1',
    'http://device.local',
    'http://service.localhost',
    'http://[::1]',
    'https://user:pass@example.com',
  ]) {
    assert.throws(() => normalizePublicSiteUrl(address), /Use um endereço público/, address);
  }
});

test('siteToOpen: abre só com pedido claro e não confunde nomes de arquivo com sites', () => {
  assert.equal(siteToOpen('Pode abrir stopots.com?'), 'stopots.com');
  assert.equal(siteToOpen('Acesse https://codenames.game/room/abc.'), 'https://codenames.game/room/abc');
  assert.equal(siteToOpen('vamos jogar codenames.game'), 'codenames.game');
  assert.equal(siteToOpen('stopots.com'), 'stopots.com');
  assert.equal(siteToOpen('https://codenames.game/r/x'), 'https://codenames.game/r/x');
  for (const chat of [
    'como abro o index.html?',
    'abre o arquivo relatorio.pdf',
    'o que é node.js?',
    'explique o package.json',
    'corrija o server.ts por favor',
    'me fale sobre o github.com',
  ]) {
    assert.equal(siteToOpen(chat), null, chat);
  }
});

test('public website address rejeita também faixas reservadas e nomes de rede interna', () => {
  for (const address of [
    'http://100.64.0.1',
    'http://100.127.255.254',
    'http://198.18.0.1',
    'http://192.0.2.10',
    'http://224.0.0.1',
    'http://255.255.255.255',
    'http://2130706433', // 127.0.0.1 em decimal
    'http://roteador',
    'http://nas.lan',
    'http://impressora.home.arpa',
  ]) {
    assert.throws(() => normalizePublicSiteUrl(address), /Use um endereço público/, address);
  }
  assert.equal(normalizePublicSiteUrl('http://100.63.0.1'), 'http://100.63.0.1/'); // fora do CGNAT
  assert.equal(normalizePublicSiteUrl('https://stopots.com'), 'https://stopots.com/');
});
