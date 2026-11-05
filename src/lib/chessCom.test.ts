import test from 'node:test';
import assert from 'node:assert/strict';
import { chessComPositionFen, chessComPositionKey, isChessComSite, type ChessComPiece } from './chessCom.ts';

test('only Chess.com domains enable the game adapter', () => {
  assert.equal(isChessComSite('https://www.chess.com/pt-BR'), true);
  assert.equal(isChessComSite('https://chess.com/play/computer'), true);
  assert.equal(isChessComSite('https://not-chess.com'), false);
  assert.equal(isChessComSite('invalid'), false);
});

test('Chess.com pieces become a validated FEN position', () => {
  const fen = chessComPositionFen([
    { square: 'e1', color: 'w', type: 'k' },
    { square: 'e8', color: 'b', type: 'k' },
    { square: 'a2', color: 'w', type: 'p' },
  ], 'b');
  assert.equal(fen, '4k3/8/8/8/8/8/P7/4K3 b - - 0 1');
  assert.throws(() => chessComPositionFen([
    { square: 'e1', color: 'w', type: 'k' },
    { square: 'e8', color: 'b', type: 'k' },
    { square: 'e1', color: 'w', type: 'q' },
  ], 'w'));
});

test('Chess.com position key ignores piece ordering', () => {
  const pieces: ChessComPiece[] = [
    { square: 'e1', color: 'w' as const, type: 'k' as const },
    { square: 'e8', color: 'b' as const, type: 'k' as const },
  ];
  assert.equal(chessComPositionKey(pieces), chessComPositionKey([...pieces].reverse()));
});
