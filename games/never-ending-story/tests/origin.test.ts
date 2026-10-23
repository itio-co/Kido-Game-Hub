// Plain test for the axis origin (triple junctions + origin-pinned solve). `npm test` in games/never-ending-story/.
import { fromBlenderEulerDeg, project, solveFromLines, type Cam, type GuideLine, type M3, type V2, type V3 } from '../src/lib/editor/camMath.ts';
import { anchorCam, depthOf, flipAxisR, keepAnchorAt, originCandidates, snapOrigin, type OriginSeg } from '../src/lib/editor/originMatch.ts';
import { makeBox } from './synthBox.ts';

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
const dist = (p: V2, q: V2) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const det3 = (m: M3) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

const box = makeBox();
const segs: OriginSeg[] = box.edges.map((e, i) => ({ id: i + 1, axis: e.axis, a: e.a, b: e.b }));

test('synthetic box: the triple junctions are the four visible 3-axis corners', () => {
  const c = originCandidates(segs, 6);
  ok(c.length === 4, `expected 4 candidates, got ${c.length}: ${c.map((x) => x.p.map((v) => v.toFixed(1)).join(',')).join(' | ')}`);
  for (const [name, P] of [['F', box.F], ['T', box.T], ['TL', box.TL], ['TR', box.TR]] as [string, V2][]) {
    const m = c.find((x) => dist(x.p, P) < 0.5);
    ok(!!m, `no candidate at ${name}`);
    ok(m!.rms < 1e-6 && m!.endDist < 1e-6, `${name}: rms ${m!.rms} endDist ${m!.endDist}`);
    ok(new Set(m!.ids).size === 3, `${name}: ids ${m!.ids}`);
  }
  for (const [name, P] of [['L', box.L], ['R', box.R], ['B', box.B]] as [string, V2][]) ok(!c.some((x) => dist(x.p, P) < 3), `2-axis corner ${name} must not be a candidate`);
});

test('noisy lines: corner still found within tolerance, tighter crossings rank first', () => {
  const jit = segs.map((s, i) => ({ ...s, a: [s.a[0] + (i % 3) * 0.7, s.a[1] - (i % 2) * 0.6] as V2, b: [s.b[0] - (i % 2) * 0.5, s.b[1] + (i % 3) * 0.4] as V2 }));
  const c = originCandidates(jit, 6);
  ok(c.length >= 4, `got ${c.length}`);
  for (const P of [box.F, box.T, box.TL, box.TR]) ok(c.some((x) => dist(x.p, P) < 3), `corner ${P} missing`);
  ok(c.every((x, i) => i === 0 || c[i - 1]!.score >= x.score), 'sorted by score');
});

test('a corner with only two axes appears once its third line is added; detected lines are flagged', () => {
  const noZ = segs.filter((s) => !(s.axis === 2 && s.a === box.L));
  ok(!originCandidates(noZ, 6).some((x) => dist(x.p, box.TL) < 0.5), 'TL needs its Z line');
  const det: OriginSeg = { id: 99, axis: 2, a: box.L, b: box.TL, detected: true };
  const c = originCandidates([...noZ, det], 6);
  const m = c.find((x) => dist(x.p, box.TL) < 0.5);
  ok(!!m && m.detected && m.ids[2] === 99, 'TL from the detected Z line');
});

test('far-off crossings beyond the segments are not candidates; tolerance scales', () => {
  const short: OriginSeg[] = [
    { id: 1, axis: 0, a: [0, 0], b: [100, 0] },
    { id: 2, axis: 1, a: [400, -50], b: [400, 50] },
    { id: 3, axis: 2, a: [380, 20], b: [420, -20] },
  ];
  ok(originCandidates(short, 6).length === 0, 'junction 300 px past the X segment');
  ok(originCandidates(segs, 0.5).length === 4, 'exact corners survive a tight tolerance');
});

test('snapOrigin: candidate first, then a 2-line crossing, else free', () => {
  const c = originCandidates(segs, 6);
  const s1 = snapOrigin([box.F[0] + 4, box.F[1] - 3], c, segs, 12);
  ok(s1.kind === 'candidate' && dist(s1.p, box.F) < 0.5, `F snap ${s1.kind}`);
  const s2 = snapOrigin([box.L[0] + 3, box.L[1] + 2], c, segs, 12);
  ok(s2.kind === 'cross' && dist(s2.p, box.L) < 0.5, `L cross snap ${s2.kind} ${s2.p}`);
  const s3 = snapOrigin([50, 50], c, segs, 12);
  ok(s3.kind === null && s3.p[0] === 50, 'free');
});

// A real camera looking at a 60×40×50 box whose corner is the world origin.
const cam0: Cam = { f: 900, cx: 480, cy: 360, R: fromBlenderEulerDeg([70, 0, 35]), C: [0, 0, 0] };
{
  const R = cam0.R;
  // place the camera ~300 cm in front (along the view direction) of the point (30, 20, 25)
  const fwd: V3 = [R[2][0], R[2][1], R[2][2]];
  cam0.C = [30 - 300 * fwd[0], 20 - 300 * fwd[1], 25 - 300 * fwd[2]];
}
const B3: V3[] = [];
for (const x of [0, 60]) for (const y of [0, 40]) for (const z of [0, 50]) B3.push([x, y, z]);
function edgesOf(cam: Cam): GuideLine[] {
  const out: GuideLine[] = [];
  let id = 1;
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++) {
      const a = B3[i]!, b = B3[j]!;
      const diff = [0, 1, 2].filter((k) => a[k] !== b[k]);
      if (diff.length !== 1) continue;
      out.push({ id: id++, axis: diff[0] as 0 | 1 | 2, a: project(cam, a)!, b: project(cam, b)! });
    }
  return out;
}

test('solve: the world origin lands exactly on the clicked candidate (< 0.5 px)', () => {
  const lines = edgesOf(cam0);
  const origin = project(cam0, [0, 0, 0])!;
  const c = originCandidates(lines, 6, 12);
  const hit = c.find((x) => dist(x.p, origin) < 0.5);
  ok(!!hit, `origin corner ${origin} among ${c.length} candidates`);
  // a wrong prior: shifted and rotated a little; rotation / focal from the VPs, position from the origin pixel
  const prior: Cam = { ...cam0, f: 800, R: fromBlenderEulerDeg([66, 2, 31]), C: [cam0.C[0] + 40, cam0.C[1] - 25, cam0.C[2] + 10] };
  const res = solveFromLines(lines, prior, { frame: { cx: 480, cy: 360, s: 960 }, principal: 'fixed' });
  ok(!!res.cam, `rotation solve: ${res.message}`);
  const solved = res.cam!;
  const cam = keepAnchorAt(prior, solved, [0, 0, 0], hit!.p);
  const uv = project(cam, [0, 0, 0])!;
  ok(dist(uv, hit!.p) < 0.5, `origin projects ${dist(uv, hit!.p).toFixed(4)} px from the click`);
  // with the right depth every corner matches the truth
  const exact = anchorCam(solved, [0, 0, 0], hit!.p, depthOf(cam0, [0, 0, 0]));
  for (const X of B3) ok(dist(project(exact, X)!, project(cam0, X)!) < 0.5, `corner ${X} off`);
});

test('keepAnchorAt without an origin keeps the prior pixel; with one moves to it', () => {
  const X: V3 = [0, 0, 0];
  const before = project(cam0, X)!;
  const same = keepAnchorAt(cam0, { ...cam0, f: 1000 }, X, null);
  ok(dist(project(same, X)!, before) < 1e-6, 'stays');
  ok(Math.abs(depthOf(same, X) - depthOf(cam0, X) * (1000 / 900)) < 1e-6, 'depth scales with f');
  const to: V2 = [before[0] + 40, before[1] - 25];
  ok(dist(project(keepAnchorAt(cam0, cam0, X, to), X)!, to) < 1e-6, 'moves to the origin pixel');
});

test('flipAxisR: flips the asked axis plus one more, stays a rotation, origin pixel kept by re-anchoring', () => {
  for (const a of [0, 1, 2] as const) {
    const { R, flipped } = flipAxisR(cam0.R, a);
    ok(flipped[0] === a && flipped[1] !== a, 'flipped pair');
    ok(Math.abs(det3(R) - 1) < 1e-9, `det ${det3(R)}`);
    for (const k of [0, 1, 2]) {
      const s = flipped.includes(k as 0 | 1 | 2) ? -1 : 1;
      for (let r = 0; r < 3; r++) ok(Math.abs(R[r]![k]! - s * cam0.R[r]![k]!) < 1e-12, 'column sign');
    }
    const uv = project(cam0, [0, 0, 0])!;
    const c2 = anchorCam({ ...cam0, R }, [0, 0, 0], uv, depthOf(cam0, [0, 0, 0]));
    ok(dist(project(c2, [0, 0, 0])!, uv) < 1e-6, 'origin kept');
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
