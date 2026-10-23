// Plain test for per-axis parallel VP mode (no test framework in game/): `npm test` in game/.
import { fromBlenderEulerDeg, mulMV, project, solveFromLines, type Axis, type Cam, type GuideLine, type V2, type V3 } from '../src/lib/editor/camMath.ts';
import { agreement, solveJoint } from '../src/lib/editor/roomMatch.ts';
import { T } from '../src/lib/editor/strings.ts';
import { consolidate, fitParallel, fitVP, fitVPMode, lockedPoint, lockVp, parallelSuggestion, type VpModes } from '../src/lib/editor/vpFit.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
const D = 180 / Math.PI;
const angOf = (l: { a: V2; b: V2 }): number => {
  let t = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]) * D;
  t = ((t % 180) + 180) % 180;
  return t;
};
let seed = 11;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
let nextId = 1;
const seg = (a: V2, b: V2, axis: Axis = 2): GuideLine => ({ id: nextId++, axis, a, b });

const W = 1000;
const H = 800;
const frame = { cx: W / 2, cy: H / 2, s: Math.max(W, H) };
const P: VpModes = ['auto', 'auto', 'parallel'];

/** Box edges seen by `cam` (centre / size in cm). */
function boxLines(cam: Cam, centre: V3, size: V3, axes: Axis[] = [0, 1, 2]): GuideLine[] {
  const [w, d, h] = size;
  const pt = (sx: number, sy: number, sz: number): V3 => [centre[0] + (sx * w) / 2, centre[1] + (sy * d) / 2, centre[2] + (sz * h) / 2];
  const out: GuideLine[] = [];
  const add = (axis: Axis, p: V3, q: V3) => {
    if (!axes.includes(axis)) return;
    const a = project(cam, p);
    const b = project(cam, q);
    if (a && b) out.push({ id: nextId++, axis, a, b });
  };
  for (const [sy, sz] of [[-1, -1], [-1, 1], [1, 1]]) add(0, pt(-1, sy!, sz!), pt(1, sy!, sz!));
  for (const [sx, sz] of [[1, -1], [1, 1], [-1, 1]]) add(1, pt(sx!, -1, sz!), pt(sx!, 1, sz!));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1]]) add(2, pt(sx!, sy!, -1), pt(sx!, sy!, 1));
  return out;
}
/** Camera at distance `dist` looking at the origin with Blender euler `e`. */
function camAt(e: V3, f: number, dist: number): Cam {
  const R = fromBlenderEulerDeg(e);
  const view = mulMV([[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]], [0, 0, 1]);
  return { f, cx: W / 2, cy: H / 2, R, C: [-view[0] * dist, -view[1] * dist, -view[2] * dist] };
}
const colAngle = (A: Cam, B: Cam): number => {
  let m = 0;
  for (let j = 0; j < 3; j++) {
    const c = A.R[0][j]! * B.R[0][j]! + A.R[1][j]! * B.R[1][j]! + A.R[2][j]! * B.R[2][j]!;
    m = Math.max(m, Math.acos(Math.min(1, Math.abs(c))) * D);
  }
  return m;
};
/** Pitch of a camera (deg): angle of the world Z axis out of the image plane (0 = level). */
const pitch = (c: Cam): number => Math.asin(Math.min(1, Math.abs(c.R[2][2]))) * D;

test('exactly parallel input: direction exact, zero residual, consolidate moves nothing', () => {
  const ls = [100, 300, 520].map((x) => seg([x, 50], [x + 40, 650]));
  const fit = fitParallel(ls)!;
  const want = Math.atan2(600, 40) * D;
  ok(Math.abs(Math.atan2(fit.vp[1], fit.vp[0]) * D - want) < 1e-9, `dir ${fit.vp}`);
  ok(fit.vp[2] === 0 && fit.point === null, 'VP at infinity');
  ok(fit.rmsDeg < 1e-9 && fit.rms < 1e-9, `rms ${fit.rmsDeg}`);
  const r = consolidate(ls, [2], frame, 1e-6, P);
  ok(r.moved.length === 0, `moved ${r.moved}`);
});

test('near-parallel noisy input: mean direction, outlier rejected, parallel mode makes them exactly parallel', () => {
  const base = 88; // deg
  const ls = [80, 200, 330, 460, 600, 720].map((x, i) => {
    const t = (base + (i === 4 ? 9 : 0.6 * rnd())) / D;
    const m: V2 = [x, 400];
    return seg([m[0] - Math.cos(t) * 250, m[1] - Math.sin(t) * 250], [m[0] + Math.cos(t) * 250, m[1] + Math.sin(t) * 250]);
  });
  const fit = fitParallel(ls)!;
  let dir = Math.atan2(fit.vp[1], fit.vp[0]) * D;
  dir = ((dir % 180) + 180) % 180;
  ok(Math.abs(dir - base) < 0.5, `dir ${dir}`);
  ok(fit.outlier[4] && fit.outlier.filter(Boolean).length === 1, `outliers ${fit.outlier}`);
  // a linked corner on line 0's end a stays put
  ls[0]!.links = { a: 99 };
  const r = consolidate(ls, [2], frame, 1e-6, P);
  const angs = r.lines.map(angOf);
  ok(angs.every((a) => Math.abs(a - angs[0]!) < 1e-9), `angles ${angs.map((a) => a.toFixed(4))}`);
  ok(r.lines[0]!.a[0] === ls[0]!.a[0] && r.lines[0]!.a[1] === ls[0]!.a[1], 'linked corner fixed');
  const mid = (l: { a: V2; b: V2 }): V2 => [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
  ok(Math.hypot(mid(r.lines[2]!)[0] - mid(ls[2]!)[0], mid(r.lines[2]!)[1] - mid(ls[2]!)[1]) < 1e-9, 'unlinked line turns about its midpoint');
  // after switching to parallel the parallel fit is exact
  ok(fitVPMode(r.lines, frame, 'parallel')!.rmsDeg < 1e-9, 'exact after consolidate');
});

test('suggestion: near-parallel Z → suggest; strongly converging Z → not', () => {
  const near = [150, 500, 850].map((x, i) => seg([x, 100], [x + (i - 1) * 0.6, 700]));
  const s = parallelSuggestion(near, frame, Math.hypot(W, H))!;
  ok(s.suggest, `near: ${JSON.stringify(s)}`);
  const conv = [150, 500, 850].map((x) => seg([x, 100], [500 + (x - 500) * 0.6, 700]));
  const c = parallelSuggestion(conv, frame, Math.hypot(W, H))!;
  ok(!c.suggest && c.distDiag < 20, `conv: ${JSON.stringify(c)}`);
});

test('lock in parallel mode: one other line fixes the direction; the endpoint slides along it', () => {
  const ls = [seg([100, 100], [110, 600]), seg([400, 120], [420, 500])];
  const vp = lockVp(ls, ls[1]!.id, frame, [], P)!;
  ok(vp && vp[2] === 0, `vp ${vp}`);
  const q = lockedPoint([400, 120], vp, [500, 640])!;
  const d = Math.atan2(q[1] - 120, q[0] - 400) * D;
  ok(Math.abs(d - Math.atan2(500, 10) * D) < 1e-9, `slides along ${d}`);
});

test('two-point perspective: Z parallel recovers a known level camera (and keeps it level with noisy Z lines)', () => {
  const TRUE = camAt([90, 0, 35], 1200, 380);
  const ls = boxLines(TRUE, [0, 0, 0], [120, 80, 150]);
  // verticals of a level camera are exactly parallel in the image
  const z = fitVP(ls.filter((l) => l.axis === 2), frame)!;
  ok(z.point === null || Math.hypot(z.point[0], z.point[1]) > 1e6, 'Z VP at infinity');
  const prior: Cam = { ...TRUE, f: 900, R: fromBlenderEulerDeg([84, 4, 28]) };
  const r = solveFromLines(ls, prior, { frame, modes: P });
  ok(r.ok && !!r.cam, r.message ?? 'no cam');
  ok(Math.abs(r.cam!.f - 1200) / 1200 < 1e-3, `f ${r.cam!.f}`);
  ok(colAngle(r.cam!, TRUE) < 0.05, `R off by ${colAngle(r.cam!, TRUE)}°`);
  ok(pitch(r.cam!) < 1e-3, `pitch ${pitch(r.cam!)}`);
  // noisy, slightly converging Z lines: auto mode tilts the camera, parallel mode keeps it level
  const noisy = ls.map((l) => (l.axis === 2 ? { ...l, a: [l.a[0] + 1.5 * rnd(), l.a[1]] as V2, b: [l.b[0] + 1.5 * rnd(), l.b[1]] as V2 } : l));
  const ra = solveFromLines(noisy, prior, { frame });
  const rp = solveFromLines(noisy, prior, { frame, modes: P });
  ok(rp.ok && pitch(rp.cam!) < 0.01, `parallel pitch ${rp.cam && pitch(rp.cam)}`);
  ok(ra.ok && pitch(ra.cam!) > pitch(rp.cam!), `auto pitch ${ra.cam && pitch(ra.cam)} vs ${rp.cam && pitch(rp.cam)}`);
  ok(Math.abs(rp.cam!.f - 1200) / 1200 < 0.05, `noisy f ${rp.cam!.f}`);
});

test('one-point perspective (X and Z parallel): focal needs a locked lens; with it the camera is recovered', () => {
  const TRUE = camAt([90, 0, 0], 1100, 400); // looking straight along +Y: X and Z lie in the image plane
  const ls = boxLines(TRUE, [10, 0, 5], [120, 80, 150]);
  const modes: VpModes = ['parallel', 'auto', 'parallel'];
  const prior: Cam = { ...TRUE, f: 1100, R: fromBlenderEulerDeg([86, 3, 4]) };
  const free = solveFromLines(ls, { ...prior, f: 800 }, { frame, modes });
  ok(!free.ok && free.message === T.vp.onePointNoLens, `free: ${free.ok} ${free.message}`);
  const fixed = solveFromLines(ls, prior, { frame, modes, fixedF: true });
  ok(fixed.ok && !!fixed.cam, fixed.message ?? 'no cam');
  ok(colAngle(fixed.cam!, TRUE) < 0.05, `R off by ${colAngle(fixed.cam!, TRUE)}°`);
});

test('joint (aligned) with Z parallel: level camera; agreement flags a group whose Z lines are not parallel', () => {
  const TRUE = camAt([90, 0, -25], 1200, 380);
  const obj = boxLines(TRUE, [0, 0, 0], [80, 60, 100]);
  const room = boxLines(TRUE, [0, 120, 40], [400, 300, 260], [0, 1, 2]);
  const prior: Cam = { ...TRUE, f: 950, R: fromBlenderEulerDeg([85, 3, -20]) };
  const j = solveJoint(obj, room, prior, { frame, fixedF: false, principal: 'fixed', aligned: true, modes: P });
  ok(j.ok && !!j.cam && pitch(j.cam) < 1e-3, `joint ${j.message} pitch ${j.cam && pitch(j.cam)}`);
  ok(Math.abs(j.cam!.f - 1200) / 1200 < 1e-3, `f ${j.cam!.f}`);
  const ag = agreement(obj, room, j.cam!, 0, frame, 3, P);
  ok(ag.axes[2]!.mode === 'parallel' && ag.axes[2]!.notParallel.length === 0, `clean ${JSON.stringify(ag.axes[2])}`);
  // tilt the room verticals so they converge (≈ 3°)
  const bent = room.map((l) => (l.axis === 2 ? { ...l, b: [l.b[0] + (l.b[0] - 500) * 0.12, l.b[1]] as V2 } : l));
  const ag2 = agreement(obj, bent, j.cam!, 0, frame, 3, P);
  ok(ag2.axes[2]!.notParallel.includes('room') && ag2.axes[2]!.band !== 'good', `bent ${JSON.stringify({ n: ag2.axes[2]!.notParallel, b: ag2.axes[2]!.band })}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
