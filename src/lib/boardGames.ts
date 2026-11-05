import { Chess, type Square } from 'chess.js';

export type CheckersColor = 'white' | 'black';
export interface CheckersPosition {
  row: number;
  col: number;
}
export interface CheckersPiece {
  color: CheckersColor;
  king: boolean;
}
export type CheckersBoard = (CheckersPiece | null)[][];
export interface CheckersMove {
  path: CheckersPosition[];
}

const CHESS_VALUES: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

function evaluateChess(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -100_000 : 100_000;
  if (chess.isDraw()) return 0;

  let score = 0;
  for (const row of chess.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const file = 'abcdefgh'.indexOf(piece.square[0]);
      const rank = Number(piece.square[1]) - 1;
      const center = 7 - (Math.abs(3.5 - file) + Math.abs(3.5 - rank));
      const value = CHESS_VALUES[piece.type] + (piece.type === 'p' ? rank * 3 : center * 2);
      score += piece.color === 'w' ? value : -value;
    }
  }
  return score;
}

function searchChess(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
): number {
  if (depth === 0 || chess.isGameOver()) return evaluateChess(chess);

  const maximizing = chess.turn() === 'w';
  let best = maximizing ? -Infinity : Infinity;
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    const score = searchChess(chess, depth - 1, alpha, beta);
    chess.undo();
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseChessMove(fen: string = new Chess().fen(), depth = 2): string | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  const maximizing = chess.turn() === 'w';
  let bestMove: string | null = null;
  let bestScore = maximizing ? -Infinity : Infinity;
  for (const move of moves) {
    chess.move(move);
    const score = searchChess(chess, Math.max(0, depth - 1), -Infinity, Infinity);
    chess.undo();
    if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
      bestScore = score;
      bestMove = move.from + move.to + (move.promotion || '');
    }
  }
  return bestMove;
}

const CHECKERS_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

export function initialCheckersBoard(): CheckersBoard {
  return Array.from({ length: 8 }, (_, row) =>
    Array.from({ length: 8 }, (_, col) => {
      if ((row + col) % 2 !== 1) return null;
      if (row < 3) return { color: 'black' as const, king: false };
      if (row > 4) return { color: 'white' as const, king: false };
      return null;
    }),
  );
}

function copyBoard(board: CheckersBoard): CheckersBoard {
  return board.map((row) => row.map((piece) => piece && { ...piece }));
}

function insideBoard(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function captureMovesForPiece(
  board: CheckersBoard,
  from: CheckersPosition,
): { to: CheckersPosition; captured: CheckersPosition }[] {
  const piece = board[from.row][from.col];
  if (!piece) return [];

  const options: { to: CheckersPosition; captured: CheckersPosition }[] = [];
  for (const [rowStep, colStep] of CHECKERS_DIRECTIONS) {
    let row = from.row + rowStep;
    let col = from.col + colStep;
    if (!piece.king) {
      if (!insideBoard(row, col) || !board[row][col] || board[row][col]?.color === piece.color) continue;
      const landingRow = row + rowStep;
      const landingCol = col + colStep;
      if (insideBoard(landingRow, landingCol) && !board[landingRow][landingCol]) {
        options.push({
          to: { row: landingRow, col: landingCol },
          captured: { row, col },
        });
      }
      continue;
    }

    while (insideBoard(row, col) && !board[row][col]) {
      row += rowStep;
      col += colStep;
    }
    if (!insideBoard(row, col) || board[row][col]?.color === piece.color) continue;
    const captured = { row, col };
    row += rowStep;
    col += colStep;
    while (insideBoard(row, col) && !board[row][col]) {
      options.push({ to: { row, col }, captured });
      row += rowStep;
      col += colStep;
    }
  }
  return options;
}

function continueCaptures(
  board: CheckersBoard,
  from: CheckersPosition,
  path: CheckersPosition[],
): CheckersMove[] {
  const piece = board[from.row][from.col];
  if (!piece) return [];
  const captures = captureMovesForPiece(board, from);
  if (captures.length === 0) return path.length > 1 ? [{ path }] : [];

  const moves: CheckersMove[] = [];
  for (const capture of captures) {
    const next = copyBoard(board);
    next[from.row][from.col] = null;
    next[capture.captured.row][capture.captured.col] = null;
    const promoted = !piece.king && (
      (piece.color === 'white' && capture.to.row === 0)
      || (piece.color === 'black' && capture.to.row === 7)
    );
    next[capture.to.row][capture.to.col] = { color: piece.color, king: piece.king || promoted };
    moves.push(...continueCaptures(next, capture.to, [...path, capture.to]));
  }
  return moves;
}

function longestCaptures(moves: CheckersMove[]): CheckersMove[] {
  const longest = Math.max(...moves.map((move) => move.path.length - 1));
  return moves.filter((move) => move.path.length - 1 === longest);
}

export function getCheckersMoves(
  board: CheckersBoard,
  color: CheckersColor,
): CheckersMove[] {
  const captures = board.flatMap((row, rowIndex) =>
    row.flatMap((piece, colIndex) => (
      piece?.color === color
        ? continueCaptures(board, { row: rowIndex, col: colIndex }, [{ row: rowIndex, col: colIndex }])
        : []
    )),
  );
  if (captures.length > 0) return longestCaptures(captures);

  const moves: CheckersMove[] = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece?.color !== color) continue;
      for (const [rowStep, colStep] of CHECKERS_DIRECTIONS) {
        if (!piece.king) {
          if (rowStep !== (color === 'white' ? -1 : 1)) continue;
          const to = { row: row + rowStep, col: col + colStep };
          if (insideBoard(to.row, to.col) && !board[to.row][to.col]) {
            moves.push({ path: [{ row, col }, to] });
          }
          continue;
        }
        let nextRow = row + rowStep;
        let nextCol = col + colStep;
        while (insideBoard(nextRow, nextCol) && !board[nextRow][nextCol]) {
          moves.push({ path: [{ row, col }, { row: nextRow, col: nextCol }] });
          nextRow += rowStep;
          nextCol += colStep;
        }
      }
    }
  }
  return moves;
}

export function applyCheckersMove(
  board: CheckersBoard,
  move: CheckersMove,
): CheckersBoard {
  const next = copyBoard(board);
  const piece = next[move.path[0].row][move.path[0].col];
  if (!piece || move.path.length < 2) throw new Error('Jogada de damas inválida.');
  next[move.path[0].row][move.path[0].col] = null;

  for (let index = 1; index < move.path.length; index++) {
    const previous = move.path[index - 1];
    const current = move.path[index];
    const rowStep = Math.sign(current.row - previous.row);
    const colStep = Math.sign(current.col - previous.col);
    let row = previous.row + rowStep;
    let col = previous.col + colStep;
    let captured = false;
    while (row !== current.row && col !== current.col) {
      if (next[row][col]) {
        if (next[row][col]?.color === piece.color || captured) {
          throw new Error('Jogada de damas inválida.');
        }
        next[row][col] = null;
        captured = true;
      }
      row += rowStep;
      col += colStep;
    }
    if (move.path.length > 2 && !captured) throw new Error('Jogada de captura inválida.');
    if (next[current.row][current.col]) throw new Error('Destino de damas ocupado.');
  }

  const destination = move.path[move.path.length - 1];
  const promoted = !piece.king && (
    (piece.color === 'white' && destination.row === 0)
    || (piece.color === 'black' && destination.row === 7)
  );
  next[destination.row][destination.col] = { ...piece, king: piece.king || promoted };
  return next;
}

function evaluateCheckers(board: CheckersBoard, color: CheckersColor): number {
  let score = 0;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const advance = piece.color === 'white' ? 7 - row : row;
      const value = (piece.king ? 180 : 100 + advance * 3) + (3.5 - Math.abs(3.5 - col)) * 2;
      score += piece.color === color ? value : -value;
    }
  }
  return score;
}

function searchCheckers(
  board: CheckersBoard,
  turn: CheckersColor,
  computer: CheckersColor,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const moves = getCheckersMoves(board, turn);
  if (depth === 0 || moves.length === 0) {
    return moves.length === 0
      ? (turn === computer ? -100_000 - depth : 100_000 + depth)
      : evaluateCheckers(board, computer);
  }
  const maximizing = turn === computer;
  let best = maximizing ? -Infinity : Infinity;
  const nextTurn = turn === 'white' ? 'black' : 'white';
  for (const move of moves) {
    const score = searchCheckers(
      applyCheckersMove(board, move),
      nextTurn,
      computer,
      depth - 1,
      alpha,
      beta,
    );
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

export function chooseCheckersMove(
  board: CheckersBoard,
  color: CheckersColor,
  depth = 4,
): CheckersMove | null {
  const moves = getCheckersMoves(board, color);
  if (moves.length === 0) return null;
  const maximizing = true;
  const nextTurn = color === 'white' ? 'black' : 'white';
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMove: CheckersMove | null = null;
  for (const move of moves) {
    const score = searchCheckers(
      applyCheckersMove(board, move),
      nextTurn,
      color,
      Math.max(0, depth - 1),
      -Infinity,
      Infinity,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

export function parseChessMove(value: string): { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' } {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(value);
  if (!match) throw new Error('A jogada de xadrez retornada é inválida.');
  return { from: match[1] as Square, to: match[2] as Square, promotion: match[3] as 'q' | 'r' | 'b' | 'n' | undefined };
}
