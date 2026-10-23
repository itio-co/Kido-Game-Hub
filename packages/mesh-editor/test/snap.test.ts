import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { composeSnaps, makeDelta, splitDelta } from '../src/index.js';
import type { Selection, SnapCandidate, SnapProvider } from '../src/index.js';

const DEG = Math.PI / 180;
const Y = new Vector3(0, 1, 0);
const pivot = new Vector3(0.3, 0.2, -0.1);
const selection: Selection = { mode: 'object', objects: ['a'], active: 'a', elements: {} };
const rotY = (deg: number): Matrix4 => new Matrix4().makeRotationY(deg * DEG);
const yawDeg = (m: Matrix4): number => {
  const q = new Quaternion().setFromRotationMatrix(splitDelta(m, pivot).linear);
  return (2 * Math.atan2(q.y, q.w)) / DEG;
};

// Test providers (rotation about Y only, enough to check composition order).
const grid = (step: number): SnapProvider => ({
  kind: 'grid',
  enabled: true,
  snap: (c) => {
    const { t, linear } = splitDelta(c.matrix, c.pivot);
    t.set(Math.round(t.x / step) * step, Math.round(t.y / step) * step, Math.round(t.z / step) * step);
    return makeDelta(c.pivot, t, linear);
  },
});
const angle = (stepDeg: number): SnapProvider => ({
  kind: 'angle',
  enabled: true,
  snap: (c) => {
    const { t } = splitDelta(c.matrix, c.pivot);
    return makeDelta(c.pivot, t, rotY(Math.round(yawDeg(c.matrix) / stepDeg) * stepDeg));
  },
});
/** Vertex snap: moves the pivot onto `target`, or null when there is none. Keeps the matrix it gets except t. */
const vertex = (target: Vector3 | null, seen: Matrix4[] = []): SnapProvider => ({
  kind: 'vertex',
  enabled: true,
  snap: (c) => {
    seen.push(c.matrix.clone());
    if (!target) return null;
    return makeDelta(c.pivot, target.clone().sub(c.pivot), rotY(33)); // linear here must be ignored
  },
});

const candidate = (t: Vector3, deg: number): SnapCandidate => ({
  matrix: makeDelta(pivot, t, rotY(deg)),
  pivot,
  selection,
});

describe('splitDelta / makeDelta', () => {
  it('round-trips and conjugates the pivot: p\' = L(p − pivot) + pivot + t', () => {
    const t = new Vector3(0.1, -0.05, 0.02);
    const m = makeDelta(pivot, t, rotY(90));
    const parts = splitDelta(m, pivot);
    expect(parts.t.distanceTo(t)).toBeLessThan(1e-12);
    expect(new Vector3().copy(pivot).applyMatrix4(m).distanceTo(pivot.clone().add(t))).toBeLessThan(1e-12);
    const p = new Vector3(1, 0, 0);
    const expected = p.clone().sub(pivot).applyAxisAngle(Y, 90 * DEG).add(pivot).add(t);
    expect(p.applyMatrix4(m).distanceTo(expected)).toBeLessThan(1e-12);
  });
});

describe('composeSnaps order', () => {
  it('no geometric hit: grid-rounded t and angle-snapped rotation', () => {
    const fn = composeSnaps([grid(0.05), angle(15), vertex(null)]);
    const out = splitDelta(fn(candidate(new Vector3(0.123, 0.01, 0), 20)), pivot);
    expect(out.t.x).toBeCloseTo(0.1, 12);
    expect(out.t.y).toBeCloseTo(0, 12);
    expect(yawDeg(fn(candidate(new Vector3(0.123, 0, 0), 20)))).toBeCloseTo(15, 9);
  });

  it('geometric hit: its t replaces the grid t (not re-rounded); angle snap still applies', () => {
    const target = new Vector3(0.4234, 0.2, -0.1);
    const seen: Matrix4[] = [];
    const fn = composeSnaps([vertex(target, seen), grid(0.05), angle(15)]); // list order of grid vs vertex must not matter
    const out = fn(candidate(new Vector3(0.123, 0, 0), 20));
    expect(new Vector3().copy(pivot).applyMatrix4(out).distanceTo(target)).toBeLessThan(1e-12);
    expect(yawDeg(out)).toBeCloseTo(15, 9);
    // the geometric provider ran after grid/angle
    expect(splitDelta(seen[0]!, pivot).t.x).toBeCloseTo(0.1, 12);
  });

  it('first geometric provider with a target wins', () => {
    const a = new Vector3(1, 1, 1);
    const b = new Vector3(2, 2, 2);
    const later: Matrix4[] = [];
    const fn = composeSnaps([vertex(null), { ...vertex(a), kind: 'edge' }, { ...vertex(b, later), kind: 'face' }]);
    const out = fn(candidate(new Vector3(0, 0, 0), 0));
    expect(new Vector3().copy(pivot).applyMatrix4(out).distanceTo(a)).toBeLessThan(1e-12);
    expect(later).toHaveLength(0);
  });

  it('alignNormal keeps its own rotation', () => {
    const n: SnapProvider = { kind: 'alignNormal', enabled: true, snap: (c) => makeDelta(c.pivot, new Vector3(), rotY(33)) };
    const out = composeSnaps([angle(15), n])(candidate(new Vector3(), 20));
    expect(yawDeg(out)).toBeCloseTo(33, 9);
  });

  it('invert flips enabled providers', () => {
    const fn = composeSnaps([grid(0.05)]);
    const c = { ...candidate(new Vector3(0.123, 0, 0), 0), invert: true };
    expect(splitDelta(fn(c), pivot).t.x).toBeCloseTo(0.123, 12);
  });
});
