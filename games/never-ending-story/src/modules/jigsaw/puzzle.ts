/** Jigsaw puzzle rules (event + practice board). */
export type { JigBoard, JigPiece, JigState, LegacyJigState } from './board.ts';
export {
  angleError,
  canSnap,
  cloneJig,
  firstFreePiece,
  isJigBoard,
  jigComplete,
  lockPiece,
  movePiece,
  normalizeAngle,
  pieceCount,
  placeHint,
  rotateBy,
  selectPiece,
  setPieceAngle,
  snapQuarter,
  startJigsaw,
  startPracticeJig,
  tapRotate,
  targetOf,
  trySnapPiece,
} from './board.ts';

import type { JigState } from './board.ts';

/** Legacy 3×4 background-position helper used by the old square-tile board. */
export function jigPosition(index: number, cols: number = 3, rows: number = 4): string {
  return `${(index % cols) * (100 / (cols - 1))}% ${Math.floor(index / cols) * (100 / (rows - 1))}%`;
}

/** Placeholder used before the event jigsaw starts (replay blanks stay this shape). */
export function freshJig(): JigState {
  return { placed: [0, 1, 2, 3, 5, 6, 9], sel: null };
}
