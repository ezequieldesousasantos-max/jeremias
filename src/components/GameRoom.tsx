import React, { useEffect, useMemo, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  applyCheckersMove,
  chooseCheckersMove,
  chooseChessMove,
  getCheckersMoves,
  initialCheckersBoard,
  parseChessMove,
  type CheckersBoard,
  type CheckersColor,
  type CheckersMove,
  type CheckersPosition,
} from '../lib/boardGames.ts';

type GameType = 'chess' | 'checkers';

const chessGlyphs: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

function otherColor(color: CheckersColor): CheckersColor {
  return color === 'white' ? 'black' : 'white';
}

function positionKey(position: CheckersPosition): string {
  return `${position.row},${position.col}`;
}

function chessResult(chess: Chess, humanColor: CheckersColor): string {
  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'black' : 'white';
    return `Xeque-mate. ${winner === humanColor ? 'Você venceu!' : 'Jeremias venceu.'}`;
  }
  if (chess.isDraw()) return 'Partida empatada.';
  if (chess.isCheck()) return `Xeque. Vez das ${chess.turn() === 'w' ? 'brancas' : 'pretas'}.`;
  return `Vez das ${chess.turn() === 'w' ? 'brancas' : 'pretas'}.`;
}

export const GameRoom: React.FC = () => {
  const [game, setGame] = useState<GameType>('chess');
  const [humanColor, setHumanColor] = useState<CheckersColor>('white');
  const [chessFen, setChessFen] = useState(() => new Chess().fen());
  const [checkersBoard, setCheckersBoard] = useState<CheckersBoard>(() => initialCheckersBoard());
  const [checkersTurn, setCheckersTurn] = useState<CheckersColor>('white');
  const [selectedChessSquare, setSelectedChessSquare] = useState<Square | null>(null);
  const [selectedCheckersPath, setSelectedCheckersPath] = useState<CheckersPosition[]>([]);
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState('Sua vez. Escolha uma peça para começar.');

  const chess = useMemo(() => new Chess(chessFen), [chessFen]);
  const chessTurn = chess.turn() === 'w' ? 'white' : 'black';
  const chessMoves = chess.moves({ verbose: true });
  const checkersMoves = useMemo(() => getCheckersMoves(checkersBoard, checkersTurn), [checkersBoard, checkersTurn]);
  const chessTargets = new Set(
    selectedChessSquare
      ? chess.moves({ square: selectedChessSquare, verbose: true }).map((move) => move.to)
      : [],
  );
  const checkersCandidates = selectedCheckersPath.length > 0
    ? checkersMoves.filter((move) => (
      move.path.length >= selectedCheckersPath.length
      && selectedCheckersPath.every((step, index) => positionKey(step) === positionKey(move.path[index]))
    ))
    : [];
  const checkersTargets = new Map<string, CheckersPosition>();
  for (const move of checkersCandidates) {
    const target = move.path[selectedCheckersPath.length];
    if (target) checkersTargets.set(positionKey(target), target);
  }

  const resetGame = (nextGame: GameType = game, nextColor: CheckersColor = humanColor) => {
    setGame(nextGame);
    setHumanColor(nextColor);
    setChessFen(new Chess().fen());
    setCheckersBoard(initialCheckersBoard());
    setCheckersTurn('white');
    setSelectedChessSquare(null);
    setSelectedCheckersPath([]);
    setThinking(false);
    setStatus(nextColor === 'white' ? 'Sua vez. Escolha uma peça para começar.' : 'Jeremias começa com as brancas.');
  };

  useEffect(() => {
    if (game !== 'chess' || chessTurn === humanColor || chess.isGameOver()) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      try {
        const move = chooseChessMove(chessFen, 2);
        if (!move) {
          setStatus(chessResult(new Chess(chessFen), humanColor));
          return;
        }
        const position = new Chess(chessFen);
        position.move(parseChessMove(move));
        setChessFen(position.fen());
        setSelectedChessSquare(null);
        setStatus(chessResult(position, humanColor));
      } catch (reason) {
        setStatus(reason instanceof Error ? reason.message : 'Não foi possível calcular a jogada de xadrez.');
      } finally {
        setThinking(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [game, chessFen, chessTurn, humanColor, chess]);

  useEffect(() => {
    if (game !== 'checkers' || checkersTurn === humanColor || checkersMoves.length === 0) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      try {
        const move = chooseCheckersMove(checkersBoard, checkersTurn);
        if (!move) {
          setStatus('Jeremias não tem jogadas legais. Você venceu!');
          return;
        }
        setCheckersBoard((board) => applyCheckersMove(board, move));
        setCheckersTurn(otherColor(checkersTurn));
        setSelectedCheckersPath([]);
        setStatus('Jeremias jogou. Sua vez.');
      } catch (reason) {
        setStatus(reason instanceof Error ? reason.message : 'Não foi possível calcular a jogada de damas.');
      } finally {
        setThinking(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [game, checkersBoard, checkersTurn, humanColor, checkersMoves.length]);

  const selectChessSquare = (square: Square) => {
    if (thinking || game !== 'chess' || chessTurn !== humanColor || chess.isGameOver()) return;
    const piece = chess.get(square);
    if (!selectedChessSquare) {
      if (piece?.color === (humanColor === 'white' ? 'w' : 'b')) setSelectedChessSquare(square);
      return;
    }

    try {
      const move = chess.move({ from: selectedChessSquare, to: square, promotion: 'q' });
      setChessFen(chess.fen());
      setStatus(chessResult(chess, humanColor));
      setSelectedChessSquare(null);
      if (!move) setSelectedChessSquare(piece?.color === (humanColor === 'white' ? 'w' : 'b') ? square : null);
    } catch {
      setSelectedChessSquare(piece?.color === (humanColor === 'white' ? 'w' : 'b') ? square : null);
    }
  };

  const selectCheckersSquare = (position: CheckersPosition) => {
    if (thinking || game !== 'checkers' || checkersTurn !== humanColor) return;
    const key = positionKey(position);
    if (selectedCheckersPath.length === 0) {
      if (checkersBoard[position.row][position.col]?.color === humanColor) {
        setSelectedCheckersPath([position]);
      }
      return;
    }

    const destination = checkersTargets.get(key);
    if (destination) {
      const path = [...selectedCheckersPath, destination];
      const matching = checkersCandidates.filter((move) => (
        path.every((step, index) => positionKey(step) === positionKey(move.path[index]))
      ));
      const completed = matching.find((move) => move.path.length === path.length);
      if (completed) {
        setCheckersBoard((board) => applyCheckersMove(board, completed));
        setCheckersTurn(otherColor(humanColor));
        setSelectedCheckersPath([]);
        setStatus('Sua jogada foi registrada.');
      } else {
        setSelectedCheckersPath(path);
      }
      return;
    }

    if (checkersBoard[position.row][position.col]?.color === humanColor) {
      setSelectedCheckersPath([position]);
    } else {
      setSelectedCheckersPath([]);
    }
  };

  const renderChessBoard = () => {
    const board = chess.board();
    const rows = humanColor === 'white' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    const columns = humanColor === 'white' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    return rows.flatMap((row) => columns.map((col) => {
      const piece = board[row][col];
      const square = `${'abcdefgh'[col]}${8 - row}` as Square;
      const isLight = (row + col) % 2 === 0;
      const isSelected = selectedChessSquare === square;
      const isTarget = chessTargets.has(square);
      return (
        <button
          key={square}
          type="button"
          onClick={() => selectChessSquare(square)}
          aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'branca' : 'preta'} ${piece.type}` : ''}`}
          className={`relative flex aspect-square items-center justify-center text-[clamp(1.7rem,5vw,3rem)] ${isLight ? 'bg-[#e2d5b5]' : 'bg-[#769656]'} ${isSelected ? '!bg-amber-400' : ''} ${isTarget ? 'after:absolute after:h-3 after:w-3 after:rounded-full after:bg-amber-300/80' : ''}`}
        >
          {piece && <span className={piece.color === 'w' ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]' : 'text-slate-950 drop-shadow-[0_1px_1px_rgba(255,255,255,0.7)]'}>{chessGlyphs[`${piece.color}${piece.type}`]}</span>}
        </button>
      );
    }));
  };

  const renderCheckersBoard = () => {
    const rows = humanColor === 'white' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    const columns = humanColor === 'white' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
    return rows.flatMap((row) => columns.map((col) => {
      const position = { row, col };
      const piece = checkersBoard[row][col];
      const isSelected = selectedCheckersPath.some((step) => positionKey(step) === positionKey(position));
      const isTarget = checkersTargets.has(positionKey(position));
      const isDark = (row + col) % 2 === 1;
      return (
        <button
          key={positionKey(position)}
          type="button"
          onClick={() => selectCheckersSquare(position)}
          aria-label={`linha ${row + 1}, coluna ${col + 1}${piece ? ` ${piece.color === 'white' ? 'branca' : 'preta'}${piece.king ? ' dama' : ' peça'}` : ''}`}
          className={`relative flex aspect-square items-center justify-center ${isDark ? 'bg-[#769656]' : 'bg-[#e2d5b5]'} ${isSelected ? '!bg-amber-400' : ''} ${isTarget ? 'after:absolute after:h-3 after:w-3 after:rounded-full after:bg-amber-300/80' : ''}`}
        >
          {piece && (
            <span className={`flex h-[72%] w-[72%] items-center justify-center rounded-full border-[3px] shadow-md ${piece.color === 'white' ? 'border-slate-200 bg-white text-slate-800' : 'border-slate-600 bg-slate-900 text-amber-300'}`}>
              {piece.king ? '♛' : ''}
            </span>
          )}
        </button>
      );
    }));
  };

  const isHumanTurn = game === 'chess' ? chessTurn === humanColor : checkersTurn === humanColor;
  const ended = game === 'chess'
    ? chess.isGameOver()
    : checkersMoves.length === 0;
  const checkersWinner = otherColor(checkersTurn) === humanColor ? 'Você venceu!' : 'Jeremias venceu.';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Jogos contra o Jeremias</h1>
        <p className="mt-1 text-sm text-slate-400">Partidas locais: o tabuleiro fica neste dispositivo; nenhuma jogada é enviada a um site.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,640px)_minmax(260px,1fr)]">
        <section className="rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => resetGame('chess')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${game === 'chess' ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>Xadrez</button>
            <button type="button" onClick={() => resetGame('checkers')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${game === 'checkers' ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700 text-slate-300'}`}>Damas</button>
          </div>
          <div className="mx-auto grid aspect-square w-full max-w-[600px] grid-cols-8 overflow-hidden rounded-lg border-4 border-slate-700">
            {game === 'chess' ? renderChessBoard() : renderCheckersBoard()}
          </div>
          <div role="status" className={`mt-4 rounded-lg border p-3 text-sm ${ended ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-slate-800 bg-slate-900 text-slate-200'}`}>
            {thinking ? 'Jeremias está pensando...' : game === 'checkers' && ended ? checkersWinner : status}
          </div>
        </section>

        <aside className="space-y-4 rounded-xl border border-slate-800 bg-slate-950 p-5">
          <h2 className="text-lg font-semibold text-white">Configuração da partida</h2>
          <label className="block text-sm text-slate-300" htmlFor="human-color">Você joga com</label>
          <select
            id="human-color"
            value={humanColor}
            onChange={(event) => resetGame(game, event.target.value as CheckersColor)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            <option value="white">Brancas</option>
            <option value="black">Pretas</option>
          </select>
          <button type="button" onClick={() => resetGame()} className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-600">
            Nova partida
          </button>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs leading-relaxed text-slate-400">
            {game === 'chess'
              ? `Xadrez com regras legais e promoção automática para dama. Jeremias joga as ${humanColor === 'white' ? 'pretas' : 'brancas'} e calcula localmente.`
              : 'Damas brasileiras em tabuleiro 8×8: capturas obrigatórias, escolha da sequência com maior número de capturas, dama de longo alcance e coroação.'}
          </div>
          {game === 'chess' && ended && chessMoves.length > 0 && (
            <p className="text-xs text-slate-500">A partida terminou.</p>
          )}
        </aside>
      </div>
    </div>
  );
};
