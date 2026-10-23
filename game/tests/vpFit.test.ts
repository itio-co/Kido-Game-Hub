// Plain test for vanishing-point consolidation (no test framework in game/): `npm test` in game/.
import type { GuideLine, V2, V3 } from '../src/lib/editor/camMath.ts';
import { aimAt, angleToVp, consolidate, distToRay, fitVP, lockedPoint, lockVp, residualBand, vpPoint } from '../src/lib/editor/vpFit.ts';

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
const dist = (p: V2 | null, q: V2): number => (p ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity);

/** Segment of length len centred at m, aimed at vp, then turned by `deg`. */
function through(vp: V2, m: V2, len = 300, deg = 0): { a: V2; b: V2 } {
  const ang = Math.atan2(vp[1] - m[1], vp[0] - m[0]) + (deg * Math.PI) / 180;
  const u: V2 = [Math.cos(ang), Math.sin(ang)];
  return { a: [m[0] - (u[0] * len) / 2, m[1] - (u[1] * len) / 2], b: [m[0] + (u[0] * len) / 2, m[1] + (u[1] * len) / 2] };
}
// deterministic noise
let seed = 7;
const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

const VP: V2 = [1500, 260];
const mids: V2[] = [[200, 120], [260, 300], [180, 480], [400, 220], [350, 420], [300, 600]];

test('exact lines converge to their common VP', () => {
  const fit = fitVP(mids.map((m) => through(VP, m)))!;
  ok(dist(fit.point, VP) < 1e-6, `vp ${fit.point}`);
  ok(fit.rmsDeg < 1e-7 && fit.rms < 1e-6, `rms ${fit.rmsDeg}° / ${fit.rms}px`);
  ok(fit.outlier.every((o) => !o), 'no outliers');
});

test('two lines: VP = their intersection', () => {
  const fit = fitVP([through(VP, mids[0]!), through(VP, mids[2]!)])!;
  ok(dist(fit.point, VP) < 1e-6, `vp ${fit.point}`);
});

test('noisy lines (±1.5 px endpoints): VP close, small residuals', () => {
  const ls = mids.map((m) => {
    const s = through(VP, m);
    return { a: [s.a[0] + 1.5 * rnd(), s.a[1] + 1.5 * rnd()] as V2, b: [s.b[0] + 1.5 * rnd(), s.b[1] + 1.5 * rnd()] as V2 };
  });
  const fit = fitVP(ls)!;
  ok(dist(fit.point, VP) < 40, `vp ${fit.point} (true ${VP})`);
  ok(fit.rmsDeg < 0.5, `rms ${fit.rmsDeg}°`);
  ok(fit.outlier.every((o) => !o), 'noise is not an outlier');
});

test('parallel lines give a VP at infinity in their direction', () => {
  const ls = [0, 80, 200].map((y) => ({ a: [0, y] as V2, b: [300, y + 30] as V2 }));
  const fit = fitVP(ls)!;
  ok(fit.point === null, `expected infinity, got ${fit.point}`);
  const d = Math.hypot(fit.vp[0], fit.vp[1]);
  ok(Math.abs(Math.abs(fit.vp[0] / d) - 300 / Math.hypot(300, 30)) < 1e-9, `dir ${fit.vp}`);
  ok(fit.resDeg.every((r) => r < 1e-7), `res ${fit.resDeg}`);
});

test('nearly parallel lines stay stable (far finite VP, tiny residuals)', () => {
  const far: V2 = [3e5, 100];
  const fit = fitVP([0, 100, 250].map((y) => through(far, [150, y])))!;
  ok(fit.resDeg.every((r) => r < 1e-6), `res ${fit.resDeg}`);
  ok(fit.point === null || dist(fit.point, far) / 3e5 < 1e-3, `vp ${fit.point}`);
});

test('one bad line is flagged as an outlier and does not move the VP', () => {
  const ls = mids.map((m, i) => through(VP, m, 300, i === 3 ? 8 : 0));
  const plain = fitVP(ls, undefined, { robust: false })!;
  const fit = fitVP(ls)!;
  ok(fit.outlier[3] === true && fit.outlier.filter(Boolean).length === 1, `outliers ${fit.outlier}`);
  ok(dist(fit.point, VP) < 1e-3, `robust vp ${fit.point}`);
  ok(dist(plain.point, VP) > 50, `plain LS should be pulled away: ${plain.point}`);
  ok(fit.resDeg[3]! > 7 && residualBand(fit.resDeg[3]!) === 'bad' && residualBand(fit.resDeg[0]!) === 'good', 'bands');
});

test('aimAt keeps length, centre and direction sense', () => {
  const s = through(VP, [300, 300], 200, 3);
  const t = aimAt(s, [VP[0], VP[1], 1])!;
  const len = (x: { a: V2; b: V2 }): number => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1]);
  ok(Math.abs(len(t) - 200) < 1e-9, 'length');
  ok(dist([(t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2], [300, 300]) < 1e-9, 'centre');
  ok(angleToVp(t, [VP[0], VP[1], 1]) < 1e-7, 'aimed');
  ok((t.b[0] - t.a[0]) * (s.b[0] - s.a[0]) > 0, 'sense kept');
});

const G = (id: number, axis: 0 | 1 | 2, s: { a: V2; b: V2 }, links?: GuideLine['links']): GuideLine => ({ id, axis, a: s.a, b: s.b, ...(links ? { links } : {}) });

test('consolidate: every line of the axis passes exactly through one VP', () => {
  const lines = mids.slice(0, 4).map((m, i) => G(i + 1, 0, through(VP, m, 300, [0.8, -0.6, 0.4, -1][i]!)));
  lines.push(G(9, 1, { a: [50, 50], b: [60, 400] }));
  const frame = { cx: 400, cy: 300, s: 800 };
  const before = fitVP(lines.filter((l) => l.axis === 0), frame)!;
  ok(before.rmsDeg > 0.3, 'starts off');
  const r = consolidate(lines, [0], frame);
  eq(r.moved.length, 4, 'moved');
  const after = fitVP(r.lines.filter((l) => l.axis === 0), frame)!;
  ok(after.resDeg.every((x) => x < 1e-6), `residuals after ${after.resDeg}`);
  ok(dist(after.point, before.point!) < 1e-6, 'VP unchanged by consolidating');
  r.lines.slice(0, 4).forEach((l, i) => {
    const o = lines[i]!;
    ok(Math.abs(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) - 300) < 1e-9, 'length kept');
    ok(dist([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2]) < 1e-9, 'centre kept');
  });
  eq(r.lines[4], lines[4], 'other axis untouched');
  ok(lines[0]!.a !== r.lines[0]!.a, 'input not mutated');
});

test('consolidate respects linked corners (turn about the corner, skip doubly-linked)', () => {
  const lines = mids.slice(0, 4).map((m, i) => G(i + 1, 2, through(VP, m, 300, [0.8, -0.6, 0.4, -1][i]!)));
  lines[0] = { ...lines[0]!, links: { a: 1 } };
  lines[1] = { ...lines[1]!, links: { a: 2, b: 3 } };
  lines.push(G(7, 0, { a: lines[0]!.a, b: [0, 0] }, { a: 1 }));
  const r = consolidate(lines, [2]);
  eq(r.lines[0]!.a, lines[0]!.a, 'linked corner fixed');
  eq(r.lines[4]!.a, lines[4]!.a, 'partner line untouched');
  eq(r.skipped.map((x) => x.id), [2], 'doubly linked skipped');
  eq(r.lines[1], lines[1], 'skipped line unchanged');
  ok(r.moved.includes(1) && r.moved.includes(3) && r.moved.includes(4), `moved ${r.moved}`);
});

test('lock: VP from the other lines, dragged end slides along the ray', () => {
  const lines = mids.slice(0, 3).map((m, i) => G(i + 1, 2, through(VP, m)));
  const vp = lockVp(lines, 1)!;
  ok(dist(vpPoint(vp), VP) < 1e-6, 'vp from others');
  ok(lockVp(lines.slice(0, 2), 1) === null, 'needs ≥2 other lines');
  const fixed = lines[0]!.a;
  const q = lockedPoint(fixed, vp, [lines[0]!.b[0] + 5, lines[0]!.b[1] + 40])!;
  ok(distToRay(fixed, vp, q) < 1e-9, 'on the ray');
  ok(angleToVp({ a: fixed, b: q }, vp) < 1e-6, 'still aimed at the VP');
});

function eq(actual: unknown, expected: unknown, msg = ''): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}
const _unused: V3 | undefined = undefined;
void _unused;

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
