// Plain test for the guide-line snapping math (no test framework in game/): `npm test` in game/.
import type { GuideLine, V2 } from '../src/lib/editor/camMath.ts';
import {
  closestOnSegment,
  intersectLines,
  joints,
  jointMembers,
  linkEnds,
  removeLineLinks,
  snapEndpoint,
  snapLine,
  unlinkEnd,
} from '../src/lib/editor/guideSnap.ts';

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
function eq(actual: unknown, expected: unknown, msg = ''): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b}, got ${a}`);
}
function near(p: V2 | undefined, q: V2, msg = '', eps = 1e-6): void {
  if (!p || Math.abs(p[0] - q[0]) > eps || Math.abs(p[1] - q[1]) > eps) throw new Error(`${msg} expected ${q}, got ${p}`);
}

const L = (id: number, axis: 0 | 1 | 2, a: V2, b: V2): GuideLine => ({ id, axis, a, b });
const scene = (): GuideLine[] => [
  L(1, 0, [0, 0], [100, 0]), // dragged X line
  L(2, 1, [100, 50], [100, 150]), // Y line, vertical at x=100
  L(3, 0, [0, 40], [100, 40]), // another X line (same axis → never a target)
];

test('closestOnSegment clamps to the ends', () => {
  near(closestOnSegment([50, 10], [0, 0], [100, 0]).point, [50, 0]);
  near(closestOnSegment([-20, 5], [0, 0], [100, 0]).point, [0, 0]);
  near(closestOnSegment([130, 5], [0, 0], [100, 0]).point, [100, 0]);
});

test('intersectLines and parallel lines', () => {
  near(intersectLines([0, 0], [10, 0], [5, -5], [5, 5])?.point, [5, 0]);
  eq(intersectLines([0, 0], [10, 0], [0, 1], [10, 1]), null);
});

test('1. endpoint of another axis wins when in range', () => {
  const t = snapEndpoint(scene(), { line: 1, end: 'b' }, [104, 46], 12);
  eq(t?.kind, 'endpoint');
  eq([t?.line, t?.end], [2, 'a']);
  near(t?.point, [100, 50]);
});

test('2. intersection of the dragged line extension with the other line', () => {
  // dragged X line from (0,0) towards (95,98): extension crosses x=100 at (100, 103.157…)
  const t = snapEndpoint(scene(), { line: 1, end: 'b' }, [95, 98], 12);
  eq(t?.kind, 'intersection');
  eq(t?.line, 2);
  near(t?.point, [100, (98 / 95) * 100]);
});

test('3. nearest point on the segment when the extension misses', () => {
  // anchor at (0,0), pointer at (92, 100) → extension hits x=100 at y≈108.7 (too far: 11.3 > 8)
  const t = snapEndpoint(scene(), { line: 1, end: 'b' }, [92, 100], 8);
  eq(t?.kind, 'segment');
  near(t?.point, [100, 100]);
});

test('same-axis lines are never targets; out of range → null', () => {
  eq(snapEndpoint(scene(), { line: 1, end: 'b' }, [100, 41], 3), null); // near X line 3 only
  eq(snapEndpoint(scene(), { line: 1, end: 'b' }, [60, 100], 12), null);
});

test('threshold scales with zoom (screen px ÷ k)', () => {
  const p: V2 = [100, 62]; // 12 ref px from (100,50) along the Y line… but 0 px from the segment
  const k = 4; // zoomed in: 12 screen px = 3 ref px
  eq(snapEndpoint(scene(), { line: 1, end: 'b' }, [107, 50], 12 / k), null);
  eq(snapEndpoint(scene(), { line: 1, end: 'b' }, [107, 50], 12 / 1)?.kind, 'endpoint');
  eq(snapEndpoint(scene(), { line: 1, end: 'b' }, p, 22 / 1)?.kind, 'endpoint');
});

test('whole-line drag snaps the closer end and returns the correction', () => {
  const t = snapLine(scene(), 1, [3, 47], [103, 47], 12);
  eq(t?.kind, 'endpoint');
  eq(t?.moved, 'b');
  near(t?.delta, [-3, 3]);
});

test('link, members, joints, unlink', () => {
  const lines = scene();
  lines[0]!.b = [100, 50];
  const j = linkEnds(lines, { line: 1, end: 'b' }, { line: 2, end: 'a' });
  eq(j, 1);
  eq(jointMembers(lines, { line: 2, end: 'a' }), [{ line: 1, end: 'b' }, { line: 2, end: 'a' }]);
  eq(joints(lines).length, 1);
  // linked partners are not snap targets for each other
  eq(snapEndpoint(lines, { line: 1, end: 'b' }, [101, 52], 12, jointMembers(lines, { line: 1, end: 'b' })), null);
  // a third end joins the same joint
  const z = L(4, 2, [100, 50], [140, 20]);
  lines.push(z);
  eq(linkEnds(lines, { line: 4, end: 'a' }, { line: 2, end: 'a' }), 1);
  eq(jointMembers(lines, { line: 1, end: 'b' }).length, 3);
  unlinkEnd(lines, { line: 4, end: 'a' });
  eq(z.links, undefined);
  eq(jointMembers(lines, { line: 1, end: 'b' }).length, 2);
  unlinkEnd(lines, { line: 1, end: 'b' }); // the last partner is freed too
  eq([lines[0]!.links, lines[1]!.links], [undefined, undefined]);
});

test('merging two joints and removing a line', () => {
  const lines = [L(1, 0, [0, 0], [1, 0]), L(2, 1, [0, 0], [0, 1]), L(3, 2, [5, 5], [6, 6]), L(4, 0, [5, 5], [7, 5])];
  linkEnds(lines, { line: 1, end: 'a' }, { line: 2, end: 'a' });
  linkEnds(lines, { line: 3, end: 'a' }, { line: 4, end: 'a' });
  linkEnds(lines, { line: 2, end: 'a' }, { line: 3, end: 'a' });
  eq(jointMembers(lines, { line: 4, end: 'a' }).length, 4);
  removeLineLinks(lines, 4);
  eq(jointMembers(lines, { line: 1, end: 'a' }).length, 3);
});

test('lines without links stay JSON-compatible', () => {
  eq(JSON.parse(JSON.stringify(scene()))[0], { id: 1, axis: 0, a: [0, 0], b: [100, 0] });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
