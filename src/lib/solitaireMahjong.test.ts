import test from 'node:test';
import assert from 'node:assert/strict';
import { isSolitaireMahjongPage } from './solitaireMahjong.ts';

test('only the Solitaire.net Mahjong page enables the auto-solver control', () => {
  assert.equal(isSolitaireMahjongPage('https://solitaire.net/pt/mahjong'), true);
  assert.equal(isSolitaireMahjongPage('https://solitaire.net/mahjong/'), true);
  assert.equal(isSolitaireMahjongPage('https://www.solitaire.net/pt/mahjong'), false);
  assert.equal(isSolitaireMahjongPage('https://solitaire.net/pt/mahjong/other'), false);
  assert.equal(isSolitaireMahjongPage('https://example.com/pt/mahjong'), false);
  assert.equal(isSolitaireMahjongPage('invalid'), false);
});
