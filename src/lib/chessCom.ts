import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export interface ChessComPiece {
  square: Square;
  color: Color;
  type: PieceSymbol;
}

export function isChessComSite(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'chess.com' || hostname.endsWith('.chess.com');
  } catch {
    return false;
  }
}

export function chessComPositionFen(pieces: ChessComPiece[], turn: Color): string {
  const squares = new Set<Square>();
  const board = Array.from({ length: 8 }, () => Array<string>(8).fill(''));
  const kings = { w: 0, b: 0 };
  if (pieces.length < 2 || pieces.length > 32) throw new Error('O tabuleiro do Chess.com não parece conter uma posição válida.');

  for (const piece of pieces) {
    if (!/^[a-h][1-8]$/.test(piece.square) || squares.has(piece.square)) {
      throw new Error('A leitura do tabuleiro do Chess.com contém casas inválidas ou duplicadas.');
    }
    squares.add(piece.square);
    if (piece.type === 'k') kings[piece.color]++;
    const row = 8 - Number(piece.square[1]);
    const col = piece.square.charCodeAt(0) - 97;
    board[row][col] = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
  }
  if (kings.w !== 1 || kings.b !== 1) throw new Error('Não consegui identificar os dois reis no tabuleiro do Chess.com.');

  const ranks = board.map((row) => {
    let result = '';
    let empty = 0;
    for (const piece of row) {
      if (!piece) {
        empty++;
        continue;
      }
      if (empty > 0) result += String(empty);
      result += piece;
      empty = 0;
    }
    if (empty > 0) result += String(empty);
    return result;
  });
  const fen = `${ranks.join('/')} ${turn} - - 0 1`;
  new Chess(fen);
  return fen;
}

export function chessComPositionKey(pieces: ChessComPiece[]): string {
  return pieces
    .map(({ square, color, type }) => `${square}:${color}${type}`)
    .sort()
    .join('|');
}
