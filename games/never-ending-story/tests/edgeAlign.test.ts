// Plain test for guide line ↔ mock-up edge alignment (synthetic images). `npm test` in game/.
import type { V2 } from '../src/lib/editor/camMath.ts';
import { alignLine, edgeMapFromRGBA, refineLine, sobel, downscaleGray } from '../src/lib/editor/edgeAlign.ts';

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
/** Anti-aliased half-plane image: dark on one side of the line through p0 with angle th, light on the other. */
function halfPlane(w: number, h: number, p0: V2, thDeg: number, noise = 0): Uint8ClampedArray {
  const th = (thDeg * Math.PI) / 180;
  const n: V2 = [-Math.sin(th), Math.cos(th)];
  const d = new Uint8ClampedArray(w * h * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // coverage of the pixel square (4×4 supersampling)
      let c = 0;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) c += (x + (i + 0.5) / 4 - p0[0]) * n[0] + (y + (j + 0.5) / 4 - p0[1]) * n[1] > 0 ? 1 : 0;
      const v = 40 + (180 * c) / 16 + noise * rnd();
      const k = (y * w + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = v;
      d[k + 3] = 255;
    }
  return d;
}
const W = 200, H = 160;
const P0: V2 = [100, 80];
const TH = 12; // edge angle (deg)
const dir: V2 = [Math.cos((TH * Math.PI) / 180), Math.sin((TH * Math.PI) / 180)];
const nrm: V2 = [-dir[1], dir[0]];
const onEdge = (t: number, off = 0): V2 => [P0[0] + dir[0] * t + nrm[0] * off, P0[1] + dir[1] * t + nrm[1] * off];
/** Distance of a point to the true edge. */
const dist = (p: V2): number => Math.abs((p[0] - P0[0]) * nrm[0] + (p[1] - P0[1]) * nrm[1]);

const img = halfPlane(W, H, P0, TH);
const map = edgeMapFromRGBA(img, W, H);

test('sobel: gradient peaks on the edge and points along its normal', () => {
  const i = Math.round(P0[1]) * W + Math.round(P0[0]);
  ok(map.mag[i]! > 0.5 * map.strong, `strong at the edge (${map.mag[i]} vs ${map.strong})`);
  const c = Math.abs(map.gx[i]! * nrm[0] + map.gy[i]! * nrm[1]) / map.mag[i]!;
  ok(c > 0.97, `orientation ≈ normal (${c})`);
  ok(map.mag[10 * W + 10]! < 1e-6, 'flat area has no gradient');
});

test('a line on the edge measures ≈ 0 px', () => {
  const r = alignLine(map, onEdge(-60), onEdge(60));
  ok(r.meanOff !== null && r.meanOff < 0.3, `meanOff ${r.meanOff}`);
  ok(r.coverage > 0.9 && r.band === 'good', `coverage ${r.coverage} band ${r.band}`);
});

test('an offset line measures its offset (signed, perpendicular) and ticks hit the edge', () => {
  const r = alignLine(map, onEdge(-60, 3), onEdge(60, 3));
  ok(r.meanOff !== null && Math.abs(r.meanOff - 3) < 0.35, `meanOff ${r.meanOff}`);
  ok(r.band === 'bad', `band ${r.band}`);
  const s = r.samples.filter((x) => x.q);
  ok(s.every((x) => Math.abs(x.off! + 3) < 0.5), 'signed offset −3 (edge is on the other side of the normal)');
  ok(s.every((x) => dist(x.q!) < 0.4), 'matched edge points lie on the true edge');
  const r2 = alignLine(map, onEdge(-60, 1.5), onEdge(60, 1.5));
  ok(r2.band === 'warn', `1.5 px → warn (${r2.band})`);
});

test('orientation gate: a line across the edge finds nothing', () => {
  const r = alignLine(map, [P0[0] - nrm[0] * 40, P0[1] - nrm[1] * 40], [P0[0] + nrm[0] * 40, P0[1] + nrm[1] * 40]);
  ok(r.coverage < 0.2 && r.band === 'none', `coverage ${r.coverage}`);
});

test('refine converges onto the edge (offset + rotated line)', () => {
  const a = onEdge(-60, 4), b = onEdge(60, -2.5);
  const r = refineLine(map, a, b);
  ok(r.moved, 'moved');
  ok(dist(r.a) < 0.25 && dist(r.b) < 0.25, `ends on edge (${dist(r.a)}, ${dist(r.b)})`);
  ok(r.after.meanOff! < 0.3 && r.before.meanOff! > 1, `${r.before.meanOff} → ${r.after.meanOff}`);
  // extent kept: ends move only perpendicular-ish
  ok(Math.hypot(r.a[0] - a[0], r.a[1] - a[1]) < 5, 'end moves only a little');
});

test('refine keeps a linked (fixed) corner and pivots the line about it', () => {
  const a = onEdge(-60); // fixed, already on the edge
  const b = onEdge(60, 5);
  const r = refineLine(map, a, b, { a: true });
  ok(r.a[0] === a[0] && r.a[1] === a[1], 'fixed end unchanged');
  ok(dist(r.b) < 0.4, `free end lands on edge (${dist(r.b)})`);
  const both = refineLine(map, a, b, { a: true, b: true });
  ok(!both.moved, 'both ends linked → no change');
});

test('noisy image + downscaled map still converges', () => {
  const big = halfPlane(400, 320, [200, 160], TH, 18);
  const m = edgeMapFromRGBA(big, 400, 320, 200); // forces a 2× downscale
  ok(m.scale === 0.5 && m.w === 200, `scale ${m.scale}`);
  const n2: V2 = nrm;
  const e = (t: number, off: number): V2 => [200 + dir[0] * t + n2[0] * off, 160 + dir[1] * t + n2[1] * off];
  const r = refineLine(m, e(-120, 3), e(120, -3));
  const d = (p: V2) => Math.abs((p[0] - 200) * n2[0] + (p[1] - 160) * n2[1]);
  ok(d(r.a) < 0.8 && d(r.b) < 0.8, `ends within 0.8 px (${d(r.a).toFixed(2)}, ${d(r.b).toFixed(2)})`);
});

test('refine with no edge nearby leaves the line alone', () => {
  const r = refineLine(map, [10, 10], [60, 12]);
  ok(!r.moved, 'not moved');
});

void sobel;
void downscaleGray;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
