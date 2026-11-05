import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  applyCheckersMove,
  chooseChessMove,
  getCheckersMoves,
  initialCheckersBoard,
  parseChessMove,
  type CheckersBoard,
} from './boardGames.ts';

test('chess opponent returns legal moves and parses promotion notation', () => {
  const move = chooseChessMove();
  assert.ok(move);
  const chess = new Chess();
  chess.move(parseChessMove(move));
  assert.equal(chess.history().length, 1);
  assert.deepEqual(parseChessMove('a7a8q'), { from: 'a7', to: 'a8', promotion: 'q' });
  assert.throws(() => parseChessMove('invalid'));
});

test('initial checkers setup has twelve pieces per side and legal opening moves', () => {
  const board = initialCheckersBoard();
  const count = (color: 'white' | 'black') => board.flat().filter((piece) => piece?.color === color).length;
  assert.equal(count('white'), 12);
  assert.equal(count('black'), 12);
  assert.equal(getCheckersMoves(board, 'white').length, 7);
});

test('checkers requires captures and prefers the longest available sequence', () => {
  const board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[5][0] = { color: 'white', king: false };
  board[4][1] = { color: 'black', king: false };
  board[2][3] = { color: 'black', king: false };
  board[4][5] = { color: 'black', king: false };

  const moves = getCheckersMoves(board, 'white');
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0].path, [
    { row: 5, col: 0 },
    { row: 3, col: 2 },
    { row: 1, col: 4 },
  ]);
  const next = applyCheckersMove(board, moves[0]);
  assert.equal(next[1][4]?.color, 'white');
  assert.equal(next.flat().filter((piece) => piece?.color === 'black').length, 1);
});

test('flying kings can capture from a distance and promote on the back rank', () => {
  const openBoard: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  openBoard[3][4] = { color: 'white', king: true };
  assert.equal(getCheckersMoves(openBoard, 'white').length, 13);

  const board: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  board[5][0] = { color: 'white', king: true };
  board[3][2] = { color: 'black', king: false };
  const moves = getCheckersMoves(board, 'white');
  assert.ok(moves.some((move) => move.path[1].row === 2 && move.path[1].col === 3));

  const promotionBoard: CheckersBoard = Array.from({ length: 8 }, () => Array(8).fill(null));
  promotionBoard[1][2] = { color: 'white', king: false };
  const promotion = getCheckersMoves(promotionBoard, 'white')
    .find((move) => move.path[1].row === 0 && move.path[1].col === 1);
  assert.ok(promotion);
  assert.equal(applyCheckersMove(promotionBoard, promotion)[0][1]?.king, true);
});
