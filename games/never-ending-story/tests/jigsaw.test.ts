// Event jigsaw 1.1.0: profiles, tab/blank edges, snap, and rotation modes.
import {
  angleError,
  canSnap,
  jigComplete,
  lockPiece,
  clampPieceCenter,
  movePiece,
  setPieceAngle,
  snapQuarter,
  startJigsaw,
  startPracticeJig,
  tapRotate,
  trySnapPiece,
  type JigPiece,
} from '../src/modules/jigsaw/board.ts';
import { generateEdges, pathHasTabs, piecePath, tabDepth } from '../src/modules/jigsaw/edges.ts';
import { jigDiffFromLabel, jigProfile, jigProfileForLabel, jigRules } from '../src/modules/jigsaw/ruleset.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string): void {
  if (a !== b) throw new Error(`${msg}: ${String(a)} !== ${String(b)}`);
}

test('Thai and English labels map to the three difficulties', () => {
  eq(jigDiffFromLabel('ง่าย'), 'easy', 'easy th');
  eq(jigDiffFromLabel('ปานกลาง'), 'medium', 'medium th');
  eq(jigDiffFromLabel('ยาก'), 'hard', 'hard th');
  eq(jigDiffFromLabel('easy'), 'easy', 'easy en');
  eq(jigDiffFromLabel('normal'), 'medium', 'normal alias');
  eq(jigDiffFromLabel(undefined), 'medium', 'default');
});

test('1.1.0 profiles differ in piece count and rotation mode', () => {
  const easy = jigProfile('easy', '1.1.0');
  const medium = jigProfile('medium', '1.1.0');
  const hard = jigProfile('hard', '1.1.0');
  eq(easy.cols * easy.rows, 9, 'easy count');
  eq(medium.cols * medium.rows, 12, 'medium count');
  eq(hard.cols * hard.rows, 16, 'hard count');
  eq(easy.rotation, 'none', 'easy rotation');
  eq(medium.rotation, 'quarter', 'medium rotation');
  eq(hard.rotation, 'free', 'hard rotation');
  const rules = jigRules('1.1.0');
  ok(!!rules?.grid, 'grid kept for challenge');
  eq(rules!.grid.easy.join('x'), '3x3', 'challenge easy grid');
});

test('labels load the same profiles the event will use', () => {
  eq(jigProfileForLabel('ง่าย').rotation, 'none', 'ง่าย');
  eq(jigProfileForLabel('ปานกลาง').cols * jigProfileForLabel('ปานกลาง').rows, 12, 'ปานกลาง');
  eq(jigProfileForLabel('ยาก').rotation, 'free', 'ยาก');
});

test('neighbor edges match and the outer rim stays flat', () => {
  const cols = 3;
  const rows = 4;
  const edges = generateEdges(cols, rows, () => 0.25);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const edge = edges[row * cols + col];
      if (col === 0) eq(edge.left, 'flat', `left rim ${col},${row}`);
      if (row === 0) eq(edge.top, 'flat', `top rim ${col},${row}`);
      if (col === cols - 1) eq(edge.right, 'flat', `right rim ${col},${row}`);
      if (row === rows - 1) eq(edge.bottom, 'flat', `bottom rim ${col},${row}`);
      if (col > 0) {
        const left = edges[row * cols + col - 1];
        const pair = (left.right === 'tab' && edge.left === 'blank') || (left.right === 'blank' && edge.left === 'tab');
        ok(pair, `horizontal pair ${col},${row}`);
      }
      if (row > 0) {
        const above = edges[(row - 1) * cols + col];
        const pair = (above.bottom === 'tab' && edge.top === 'blank') || (above.bottom === 'blank' && edge.top === 'tab');
        ok(pair, `vertical pair ${col},${row}`);
      }
    }
  }
});

test('the same seed rebuilds the same edges and a piece path has tab curves', () => {
  const a = startJigsaw('ง่าย', { seed: 42, version: '1.1.0' });
  const b = startJigsaw('ง่าย', { seed: 42, version: '1.1.0' });
  eq(JSON.stringify(a.edges), JSON.stringify(b.edges), 'edges');
  eq(a.pieces.length, b.pieces.length, 'count');
  eq(a.pieces[0].x, b.pieces[0].x, 'scatter x');
  const path = piecePath(a.edges[4], 80, 80, tabDepth(80, 80));
  ok(pathHasTabs(path) || a.edges[4].top === 'flat' && a.edges[4].right === 'flat' && a.edges[4].bottom === 'flat' && a.edges[4].left === 'flat', 'interior piece should curve unless all flat');
  const interior = a.edges.find((edge) => edge.top !== 'flat' || edge.right !== 'flat' || edge.bottom !== 'flat' || edge.left !== 'flat');
  ok(!!interior, 'some tabs exist');
  ok(pathHasTabs(piecePath(interior!, 80, 80)), 'tab path uses curves');
});

test('easy starts upright, medium at 90° steps, hard at a free angle', () => {
  const easy = startJigsaw('ง่าย', { seed: 7, version: '1.1.0' });
  ok(easy.pieces.every((piece) => piece.angle === 0), 'easy upright');
  eq(easy.pieces.length, 9, 'easy n');
  const medium = startJigsaw('ปานกลาง', { seed: 7, version: '1.1.0' });
  ok(medium.pieces.every((piece) => piece.angle % 90 === 0), 'medium quarters');
  eq(medium.pieces.length, 12, 'medium n');
  ok(medium.pieces.some((piece) => piece.angle !== 0), 'medium is shuffled');
  const hard = startJigsaw('ยาก', { seed: 11, version: '1.1.0' });
  eq(hard.pieces.length, 16, 'hard n');
  eq(hard.rotation, 'free', 'hard mode');
  ok(hard.pieces.some((piece) => piece.angle % 90 !== 0), 'hard uses free angles');
});

function near(piece: JigPiece, angle = 0): JigPiece {
  return { ...piece, x: piece.col + 0.5 + 0.05, y: piece.row + 0.5 + 0.04, angle };
}

test('a close upright piece snaps and locks; a far or tilted one does not', () => {
  const profile = jigProfile('easy', '1.1.0');
  const board = startJigsaw('ง่าย', { seed: 3, version: '1.1.0' });
  const piece = board.pieces[0];
  const cell = 40;
  ok(!canSnap(piece, profile, cell, cell), 'scattered piece is not already snapped');
  ok(canSnap(near(piece, 0), profile, cell, cell), 'near and upright snaps');
  ok(!canSnap(near(piece, 40), profile, cell, cell), 'tilted piece does not snap even if close');
  const far: JigPiece = { ...piece, x: piece.col + 2.5, y: piece.row + 2.5, angle: 0 };
  ok(!canSnap(far, profile, cell, cell), 'far piece does not snap');
  const snapped = trySnapPiece(movePiece(board, piece.id, piece.col + 0.5, piece.row + 0.5), piece.id, profile, cell, cell);
  ok(snapped.pieces[0].locked, 'locked');
  eq(snapped.pieces[0].x, 0.5, 'x parked');
  eq(snapped.placed[0], piece.id, 'placed');
  const moved = movePiece(snapped, piece.id, 3, 3);
  eq(moved.pieces[0].x, 0.5, 'locked pieces do not move');
});

test('medium tap rotates by 90° and hard accepts a free angle', () => {
  eq(snapQuarter(50), 90, '50→90');
  eq(snapQuarter(350), 0, '350→0');
  eq(Math.round(angleError(-8)), 8, 'error');
  const medium = startJigsaw('ปานกลาง', { seed: 5, version: '1.1.0' });
  const id = medium.pieces[1].id;
  const before = medium.pieces[1].angle;
  const turned = tapRotate(medium, id, 90);
  eq(turned.pieces[1].angle, snapQuarter(before + 90), 'tap');
  const hard = startJigsaw('ยาก', { seed: 5, version: '1.1.0' });
  const hid = hard.pieces[2].id;
  const spun = setPieceAngle(hard, hid, 37);
  eq(Math.round(spun.pieces[2].angle), 37, 'free angle');
  const easy = startJigsaw('ง่าย', { seed: 5, version: '1.1.0' });
  const still = tapRotate(easy, 0, 90);
  eq(still.pieces[0].angle, 0, 'easy ignores rotate');
});

test('locking every piece completes the puzzle and practice can pre-lock some', () => {
  let board = startJigsaw('ง่าย', { seed: 1, version: '1.1.0' });
  ok(!jigComplete(board), 'starts incomplete');
  for (const piece of board.pieces) board = lockPiece(board, piece.id);
  ok(jigComplete(board), 'all locked');
  eq(board.placed.length, 9, 'placed all');
  const practice = startPracticeJig('ปานกลาง', 3, { seed: 2, version: '1.1.0' });
  eq(practice.placed.length, 3, 'pre-locked');
  eq(practice.pieces.filter((piece) => !piece.locked).length, 9, 'free');
});

test('clampPieceCenter keeps the centre on the board, and movePiece uses it', () => {
  const at = clampPieceCenter(-2, 99, 3, 4);
  ok(at.x === 0 && at.y === 4, 'clamp extremes');
  const mid = clampPieceCenter(1.5, 2.5, 3, 4);
  ok(mid.x === 1.5 && mid.y === 2.5, 'inside stays');
  const board = startJigsaw('ยาก', { seed: 7, version: '1.1.0' });
  const free = board.pieces.find((piece) => !piece.locked)!;
  const moved = movePiece(board, free.id, -8, 40);
  const piece = moved.pieces.find((item) => item.id === free.id)!;
  ok(piece.x >= 0 && piece.x <= moved.cols, 'x clamped');
  ok(piece.y >= 0 && piece.y <= moved.rows, 'y clamped');
  for (const item of board.pieces) {
    if (item.locked) continue;
    ok(item.x >= 0 && item.x <= board.cols && item.y >= 0 && item.y <= board.rows, `scattered ${item.id} stays on the board`);
  }
});

test('a challenge seed rebuilds the same free-drag board per difficulty', () => {
  const cases = [
    ['easy', 3, 3, 'none'],
    ['medium', 3, 4, 'quarter'],
    ['hard', 4, 4, 'free'],
  ] as const;
  for (const [diff, cols, rows, rotation] of cases) {
    const a = startJigsaw(diff, { seed: 482913, version: '1.1.1' });
    const b = startJigsaw(diff, { seed: 482913, version: '1.1.1' });
    eq(a.cols, cols, `${diff} cols`);
    eq(a.rows, rows, `${diff} rows`);
    eq(a.rotation, rotation, `${diff} rotation`);
    eq(JSON.stringify(a.pieces), JSON.stringify(b.pieces), `${diff} pieces`);
    eq(JSON.stringify(a.edges), JSON.stringify(b.edges), `${diff} edges`);
  }
});

if (failed) process.exitCode = 1;
else console.log('jigsaw: all tests passed');
