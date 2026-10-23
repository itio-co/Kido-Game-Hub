// Plain test for straight-line detection on the edge map (synthetic box). `npm test` in games/never-ending-story/.
import type { V2 } from '../src/lib/editor/camMath.ts';
import { edgeMapFromRGBA } from '../src/lib/editor/edgeAlign.ts';
import { classifySegments, detectLines, detectLinesIter, mergeCollinear } from '../src/lib/editor/lineDetect.ts';
import { makeBox, renderBox } from './synthBox.ts';

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
function ok(c: boolean, m: string): void {
  if (!c) throw new Error(m);
}
const D = 180 / Math.PI;
const offLine = (p: V2, a: V2, b: V2) => Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
const angOf = (a: V2, b: V2) => ((Math.atan2(b[1] - a[1], b[0] - a[0]) * D) % 180 + 180) % 180;
const dAng = (x: number, y: number) => {
  const d = Math.abs(x - y) % 180;
  return Math.min(d, 180 - d);
};

const W = 1000, H = 800;
const box = makeBox();
const map = edgeMapFromRGBA(renderBox(W, H, box.faces), W, H);
const segs = detectLines(map, { minLen: 40 });
/** Best detected match of a true edge. */
const matchOf = (e: { a: V2; b: V2 }) =>
  segs
    .map((s, i) => ({ s, i, off: Math.max(offLine(s.a, e.a, e.b), offLine(s.b, e.a, e.b)), dang: dAng(s.angle, angOf(e.a, e.b)) }))
    .filter((m) => m.dang < 3 && m.off < 4)
    .sort((p, q) => q.s.len - p.s.len)[0];

test('synthetic box: all 9 edges detected within 1 px / 0.5°', () => {
  ok(segs.length >= 9 && segs.length <= 40, `${segs.length} segments`);
  for (const e of box.edges) {
    const m = matchOf(e);
    const L = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
    ok(!!m, `edge ${JSON.stringify(e.a)}→${JSON.stringify(e.b)} not found`);
    ok(m!.off <= 1, `offset ${m!.off.toFixed(3)} px`);
    ok(m!.dang <= 0.5, `angle ${m!.dang.toFixed(3)}°`);
    ok(m!.s.len >= 0.6 * L, `length ${m!.s.len.toFixed(1)} of ${L.toFixed(1)}`);
  }
});

test('axis classification from VPs (X, Y finite; Z parallel)', () => {
  const cls = classifySegments(segs, [{ kind: 'vp', p: box.vx }, { kind: 'vp', p: box.vy }, { kind: 'dir', d: [0, 1] }]);
  for (const e of box.edges) {
    const m = matchOf(e)!;
    ok(cls[m.i] === e.axis, `edge axis ${e.axis} classified ${cls[m.i]}`);
  }
});

test('axis classification without VPs: vertical → Z, two other clusters separated', () => {
  const cls = classifySegments(segs, [null, null, null]);
  const got = box.edges.map((e) => cls[matchOf(e)!.i]);
  for (let k = 0; k < 9; k++) if (box.edges[k]!.axis === 2) ok(got[k] === 2, `vertical edge → ${got[k]}`);
  const xg = new Set(got.filter((_, k) => box.edges[k]!.axis === 0));
  const yg = new Set(got.filter((_, k) => box.edges[k]!.axis === 1));
  ok(xg.size === 1 && yg.size === 1 && [...xg][0] !== [...yg][0] && !xg.has(null) && !yg.has(null), `clusters ${[...xg]} / ${[...yg]}`);
});

test('partial predictors: VP for X only; Y / Z from orientation', () => {
  const cls = classifySegments(segs, [{ kind: 'vp', p: box.vx }, null, null]);
  for (const e of box.edges) ok(cls[matchOf(e)!.i] === e.axis, `edge axis ${e.axis} → ${cls[matchOf(e)!.i]}`);
});

test('min length, max count and ROI', () => {
  const long = detectLines(map, { minLen: 200 });
  ok(long.every((s) => s.len >= 200) && long.length >= 1 && long.length < segs.length, `${long.length} long segments`);
  ok(detectLines(map, { max: 3 }).length === 3, 'max');
  const roi = detectLines(map, { roi: { x: 0, y: 0, w: 520, h: 800 } });
  ok(roi.every((s) => Math.max(s.a[0], s.b[0]) <= 522), 'segments inside the ROI');
});

test('chunked generator yields progress and gives the same result', () => {
  const it = detectLinesIter(map, { chunk: 500 });
  let yields = 0;
  let r = it.next();
  while (!r.done) {
    yields++;
    r = it.next();
  }
  ok(yields >= 2, `yields ${yields}`);
  ok(JSON.stringify(r.value) === JSON.stringify(segs), 'same segments');
});

test('collinear neighbours merge', () => {
  const m = mergeCollinear([
    { a: [0, 0] as V2, b: [100, 0] as V2, len: 100, mag: 1 },
    { a: [105, 0.5] as V2, b: [200, 0.5] as V2, len: 95, mag: 1 },
    { a: [0, 50] as V2, b: [100, 50] as V2, len: 100, mag: 1 },
  ]);
  ok(m.length === 2 && Math.abs(m[0]!.len - 200) < 1, `merged ${JSON.stringify(m)}`);
});

console.log(`\nlineDetect: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
