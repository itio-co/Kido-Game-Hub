/** Free-drag jigsaw board: scatter, move, rotate, snap, and lock. */
import { generateEdges, type PieceEdges } from './edges.ts';
import { mulberry32, pickSeed, type Rng } from './rng.ts';
import { JIG_VERSION, jigDiffFromLabel, jigProfileForLabel, type JigDiff, type JigProfile, type JigRotation } from './ruleset.ts';

export type JigPiece = {
  id: number;
  col: number;
  row: number;
  /** Centre of the rectangular cell, in cell units (board is cols × rows). */
  x: number;
  y: number;
  /** Degrees. 0 is upright (image aligned to the board). */
  angle: number;
  locked: boolean;
};

export type JigBoard = {
  placed: number[];
  sel: number | null;
  cols: number;
  rows: number;
  rotation: JigRotation;
  profileId: JigDiff;
  version: string;
  seed: number;
  pieces: JigPiece[];
  edges: PieceEdges[];
};

/** Legacy event/practice snapshot used before 1.1.0. */
export type LegacyJigState = { placed: number[]; sel: number | null };

export type JigState = JigBoard | LegacyJigState;

export function isJigBoard(state: JigState | null | undefined): state is JigBoard {
  return !!state && Array.isArray((state as JigBoard).pieces) && typeof (state as JigBoard).cols === 'number';
}

export function normalizeAngle(angle: number): number {
  let a = angle % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function angleError(angle: number): number {
  return Math.abs(normalizeAngle(angle));
}

export function snapQuarter(angle: number): number {
  const a = ((angle % 360) + 360) % 360;
  return Math.round(a / 90) * 90 % 360;
}

export function rotateBy(angle: number, delta: number, rotation: JigRotation): number {
  if (rotation === 'none') return 0;
  if (rotation === 'quarter') return snapQuarter(angle + delta);
  return normalizeAngle(angle + delta);
}

function startAngle(rng: Rng, rotation: JigRotation): number {
  if (rotation === 'none') return 0;
  if (rotation === 'quarter') return (Math.floor(rng() * 4) * 90);
  return normalizeAngle(rng() * 360);
}

function scatterPoint(rng: Rng, cols: number, rows: number, padding: number, targetX: number, targetY: number): { x: number; y: number } {
  const marginX = Math.max(0.6, cols * padding);
  const marginY = Math.max(0.6, rows * padding);
  const minX = -marginX;
  const maxX = cols + marginX;
  const minY = -marginY;
  const maxY = rows + marginY;
  const minDist = 0.85;
  for (let i = 0; i < 24; i += 1) {
    const x = minX + rng() * (maxX - minX);
    const y = minY + rng() * (maxY - minY);
    const dx = x - targetX;
    const dy = y - targetY;
    if (dx * dx + dy * dy >= minDist * minDist) return { x, y };
  }
  // Last resort: push it beside the board.
  return { x: rng() < 0.5 ? minX + rng() * marginX * 0.8 : cols + rng() * marginX * 0.8, y: minY + rng() * (maxY - minY) };
}

export function startJigsaw(label: string | null | undefined, opts?: { seed?: number; version?: string }): JigBoard {
  const version = opts?.version ?? JIG_VERSION;
  const profile = jigProfileForLabel(label, version);
  const profileId = jigDiffFromLabel(label);
  const seed = pickSeed(opts?.seed ?? profile.scatterSeed);
  const rng = mulberry32(seed);
  const { cols, rows, rotation, scatterPadding } = profile;
  const edges = generateEdges(cols, rows, rng);
  const pieces: JigPiece[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = row * cols + col;
      const targetX = col + 0.5;
      const targetY = row + 0.5;
      const scattered = scatterPoint(rng, cols, rows, scatterPadding, targetX, targetY);
      const at = clampPieceCenter(scattered.x, scattered.y, cols, rows);
      pieces.push({
        id,
        col,
        row,
        x: at.x,
        y: at.y,
        angle: startAngle(rng, rotation),
        locked: false,
      });
    }
  }
  return {
    placed: [],
    sel: null,
    cols,
    rows,
    rotation,
    profileId,
    version,
    seed,
    pieces,
    edges,
  };
}

export function cloneJig(state: JigState): JigState {
  if (!isJigBoard(state)) return { placed: [...state.placed], sel: state.sel };
  return {
    placed: [...state.placed],
    sel: state.sel,
    cols: state.cols,
    rows: state.rows,
    rotation: state.rotation,
    profileId: state.profileId,
    version: state.version,
    seed: state.seed,
    pieces: state.pieces.map((piece) => ({ ...piece })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

export function pieceCount(state: JigState): number {
  if (isJigBoard(state)) return state.cols * state.rows;
  return 12;
}

export function jigComplete(state: JigState): boolean {
  const total = pieceCount(state);
  if (isJigBoard(state)) return state.pieces.length === total && state.pieces.every((piece) => piece.locked);
  return state.placed.length >= total;
}

function withPieces(state: JigBoard, pieces: JigPiece[], sel: number | null = state.sel): JigBoard {
  const placed = pieces.filter((piece) => piece.locked).map((piece) => piece.id);
  return { ...state, pieces, placed, sel };
}

export function selectPiece(state: JigBoard, id: number | null): JigBoard {
  return { ...state, sel: id };
}

export function clampPieceCenter(x: number, y: number, cols: number, rows: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 0), cols),
    y: Math.min(Math.max(y, 0), rows),
  };
}

export function movePiece(state: JigBoard, id: number, x: number, y: number): JigBoard {
  const at = clampPieceCenter(x, y, state.cols, state.rows);
  const pieces = state.pieces.map((piece) => {
    if (piece.id !== id || piece.locked) return piece;
    return { ...piece, x: at.x, y: at.y };
  });
  return withPieces(state, pieces, id);
}

export function setPieceAngle(state: JigBoard, id: number, angle: number): JigBoard {
  if (state.rotation === 'none') return state;
  const next = state.rotation === 'quarter' ? snapQuarter(angle) : normalizeAngle(angle);
  const pieces = state.pieces.map((piece) => {
    if (piece.id !== id || piece.locked) return piece;
    return { ...piece, angle: next };
  });
  return withPieces(state, pieces, id);
}

export function tapRotate(state: JigBoard, id: number, delta: number = 90): JigBoard {
  const piece = state.pieces.find((item) => item.id === id);
  if (!piece || piece.locked || state.rotation === 'none') return state;
  return setPieceAngle(state, id, piece.angle + delta);
}

export function lockPiece(state: JigBoard, id: number): JigBoard {
  const pieces = state.pieces.map((piece) => {
    if (piece.id !== id) return piece;
    return { ...piece, x: piece.col + 0.5, y: piece.row + 0.5, angle: 0, locked: true };
  });
  return withPieces(state, pieces, null);
}

export function canSnap(piece: JigPiece, profile: JigProfile, cellW: number, cellH: number = cellW): boolean {
  if (piece.locked) return false;
  if (angleError(piece.angle) > profile.angleTolerance) return false;
  const dx = (piece.x - (piece.col + 0.5)) * cellW;
  const dy = (piece.y - (piece.row + 0.5)) * cellH;
  return Math.hypot(dx, dy) <= profile.snapDistance;
}

export function trySnapPiece(state: JigBoard, id: number, profile: JigProfile, cellW: number, cellH: number = cellW): JigBoard {
  const piece = state.pieces.find((item) => item.id === id);
  if (!piece || !canSnap(piece, profile, cellW, cellH)) return state;
  return lockPiece(state, id);
}

export function firstFreePiece(state: JigBoard): JigPiece | undefined {
  return state.pieces.find((piece) => !piece.locked);
}

export function placeHint(state: JigBoard): JigBoard {
  const piece = firstFreePiece(state);
  if (!piece) return state;
  return lockPiece(state, piece.id);
}

/** Practice: lock the first `lockedCount` pieces in order, scatter the rest. */
export function startPracticeJig(label: string | null | undefined, lockedCount: number, opts?: { seed?: number; version?: string }): JigBoard {
  const board = startJigsaw(label, opts);
  const n = Math.max(0, Math.min(board.pieces.length, lockedCount));
  let next = board;
  for (let i = 0; i < n; i += 1) next = lockPiece(next, i);
  return next;
}

export function targetOf(piece: Pick<JigPiece, 'col' | 'row'>): { x: number; y: number } {
  return { x: piece.col + 0.5, y: piece.row + 0.5 };
}
