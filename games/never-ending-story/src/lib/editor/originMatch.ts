/**
 * Axis origin of the mock-up view (T.axisOrigin): the image point where the world / object origin sits.
 *
 * Candidates are triple junctions: points where a guide line of each of the three axes (X, Y, Z) passes within a
 * small tolerance — typically a visible box corner. The camera solve then pins the origin to that pixel (`anchorCam`):
 * rotation and focal come from the vanishing points, the origin pixel fixes the translation direction and the
 * existing distance handling fixes the depth.
 *
 * Pure geometry (no DOM, no Svelte) so it can be unit-tested.
 */
import { mulMV, project, sub, transpose, type Axis, type Cam, type M3, type V2, type V3 } from './camMath.ts';

/** A segment that can take part in a junction (guide line or detected candidate). */
export type OriginSeg = { id: number; axis: Axis; a: V2; b: V2; detected?: boolean };
export type OriginCandidate = {
  /** Least-squares point of the three lines (same px space as the input). */
  p: V2;
  /** Segment id per axis (X, Y, Z). */
  ids: [number, number, number];
  /** RMS distance of the three lines from `p`. */
  rms: number;
  /** Mean distance from `p` to the nearest endpoint of each of the three segments. */
  endDist: number;
  /** Higher is better (0..1]. */
  score: number;
  /** Uses at least one detected (not yet accepted) segment. */
  detected: boolean;
};

type H = { n: V2; c: number };
/** Normalised line through a, b: n·x + c = 0, |n| = 1. */
function lineOf(s: OriginSeg): H | null {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const n: V2 = [-dy / len, dx / len];
  return { n, c: -(n[0] * s.a[0] + n[1] * s.a[1]) };
}
const distH = (h: H, p: V2): number => Math.abs(h.n[0] * p[0] + h.n[1] * p[1] + h.c);
function meet(h: H, g: H): V2 | null {
  const d = h.n[0] * g.n[1] - h.n[1] * g.n[0];
  if (Math.abs(d) < 1e-9) return null;
  return [(h.n[1] * g.c - g.n[1] * h.c) / d, (g.n[0] * h.c - h.n[0] * g.c) / d];
}
const segLen = (s: OriginSeg): number => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
/** Distance from p (on or near the line) to the segment's span: 0 inside, else past the nearer end. */
function gapOf(s: OriginSeg, p: V2): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const L2 = dx * dx + dy * dy || 1;
  const t = ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2;
  const L = Math.sqrt(L2);
  return t < 0 ? -t * L : t > 1 ? (t - 1) * L : 0;
}
const endDistOf = (s: OriginSeg, p: V2): number => Math.min(Math.hypot(p[0] - s.a[0], p[1] - s.a[1]), Math.hypot(p[0] - s.b[0], p[1] - s.b[1]));
/** How far beyond its ends a segment may be extended to reach a junction. */
const reachOf = (s: OriginSeg, tol: number): number => Math.max(0.5 * segLen(s), 10 * tol);

/** Least-squares point of several normalised lines (null when they are (nearly) parallel). */
function lsPoint(hs: H[]): V2 | null {
  let a = 0, b = 0, d = 0, e = 0, f = 0;
  for (const h of hs) {
    a += h.n[0] * h.n[0];
    b += h.n[0] * h.n[1];
    d += h.n[1] * h.n[1];
    e -= h.n[0] * h.c;
    f -= h.n[1] * h.c;
  }
  const det = a * d - b * b;
  if (Math.abs(det) < 1e-9) return null;
  return [(e * d - b * f) / det, (a * f - b * e) / det];
}

/**
 * Triple junctions of X, Y and Z segments, best first. `tol` is the crossing tolerance in the segments' px space
 * (≈ 6 screen px divided by the zoom). Points near segment endpoints (real corners) and tight crossings score higher.
 */
export function originCandidates(segs: readonly OriginSeg[], tol: number, max = 6): OriginCandidate[] {
  const items = segs.map((s) => ({ s, h: lineOf(s) })).filter((x): x is { s: OriginSeg; h: H } => !!x.h && segLen(x.s) >= 2 * tol);
  const byAxis: { s: OriginSeg; h: H }[][] = [[], [], []];
  for (const it of items) byAxis[it.s.axis]!.push(it);
  const near = (it: { s: OriginSeg; h: H }, p: V2, slack: number) => distH(it.h, p) <= slack && gapOf(it.s, p) <= reachOf(it.s, tol);
  const found: OriginCandidate[] = [];
  const pairs: [Axis, Axis, Axis][] = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
  for (const [i, j, k] of pairs) {
    for (const u of byAxis[i]!)
      for (const v of byAxis[j]!) {
        const P = meet(u.h, v.h);
        if (!P || !near(u, P, 1e-6 + tol) || !near(v, P, 1e-6 + tol)) continue;
        for (const w of byAxis[k]!) {
          if (!near(w, P, tol)) continue;
          const trio = [u, v, w];
          const q = lsPoint(trio.map((t) => t.h));
          if (!q) continue;
          const d = trio.map((t) => distH(t.h, q));
          const rms = Math.sqrt((d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2) / 3);
          if (rms > tol || trio.some((t) => gapOf(t.s, q) > reachOf(t.s, tol))) continue;
          const endDist = trio.reduce((acc, t) => acc + endDistOf(t.s, q), 0) / 3;
          const detected = trio.some((t) => !!t.s.detected);
          const score = (1 / (1 + (rms / tol) ** 2)) * (1 / (1 + endDist / (3 * tol))) * (detected ? 0.85 : 1);
          const ids: [number, number, number] = [0, 0, 0];
          for (const t of trio) ids[t.s.axis] = t.s.id;
          found.push({ p: q, ids, rms, endDist, score, detected });
        }
      }
  }
  found.sort((a, b) => b.score - a.score);
  const out: OriginCandidate[] = [];
  for (const c of found) {
    if (out.some((o) => Math.hypot(o.p[0] - c.p[0], o.p[1] - c.p[1]) < 2 * tol)) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Snap a dragged origin handle: nearest candidate within `radius`, else the nearest crossing of two segments of
 * different axes (near both spans), else the point itself.
 */
export function snapOrigin(p: V2, cands: readonly OriginCandidate[], segs: readonly OriginSeg[], radius: number, tol = radius / 2): { p: V2; kind: 'candidate' | 'cross' | null } {
  let best: V2 | null = null;
  let bd = radius;
  for (const c of cands) {
    const d = Math.hypot(c.p[0] - p[0], c.p[1] - p[1]);
    if (d <= bd) {
      bd = d;
      best = c.p;
    }
  }
  if (best) return { p: [best[0], best[1]], kind: 'candidate' };
  const items = segs.map((s) => ({ s, h: lineOf(s) })).filter((x): x is { s: OriginSeg; h: H } => !!x.h);
  bd = radius;
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++) {
      const u = items[i]!;
      const v = items[j]!;
      if (u.s.axis === v.s.axis) continue;
      const P = meet(u.h, v.h);
      if (!P || gapOf(u.s, P) > reachOf(u.s, tol) || gapOf(v.s, P) > reachOf(v.s, tol)) continue;
      const d = Math.hypot(P[0] - p[0], P[1] - p[1]);
      if (d <= bd) {
        bd = d;
        best = P;
      }
    }
  return best ? { p: best, kind: 'cross' } : { p: [p[0], p[1]], kind: null };
}

/** Camera-space depth of X (≤ 0 = behind the camera). */
export function depthOf(cam: Cam, X: V3): number {
  return mulMV(cam.R, sub(X, cam.C))[2];
}

/**
 * Move the camera (rotation, focal and principal point unchanged) so X projects exactly to `uv` at camera depth
 * `depth`: t = [((uv − c) / f)·d, d], C = X − Rᵀ·t.
 */
export function anchorCam(cam: Cam, X: V3, uv: V2, depth: number): Cam {
  const t: V3 = [((uv[0] - cam.cx) / cam.f) * depth, ((uv[1] - cam.cy) / cam.f) * depth, depth];
  const Rt = transpose(cam.R);
  const r = mulMV(Rt, t);
  return { ...cam, C: [X[0] - r[0], X[1] - r[1], X[2] - r[2]] };
}

/**
 * Keep X at a pixel after a rotation / focal re-solve: the pixel is `uv` (the axis origin) or, when none is set,
 * where X was in `prior`; the depth scales with the focal change so the model keeps its on-screen size.
 */
export function keepAnchorAt(prior: Cam, cam: Cam, X: V3, uv?: V2 | null): Cam {
  const at = uv ?? project(prior, X);
  const depth = depthOf(prior, X);
  if (!at || !(depth > 0)) return cam;
  return anchorCam(cam, X, at, depth * (cam.f / prior.f));
}

/**
 * Flip one axis direction (±). A single reflection would turn the frame left-handed, so a second axis flips with it
 * (X ↔ Y for the horizontal axes, X with Z): the result is a 180° turn about the remaining axis. Returns R·F and the
 * axes that flipped.
 */
export function flipAxisR(R: M3, axis: Axis): { R: M3; flipped: [Axis, Axis] } {
  const other: Axis = axis === 0 ? 1 : 0;
  const s = [1, 1, 1];
  s[axis] = -1;
  s[other] = -1;
  const R2 = R.map((row) => [row[0] * s[0]!, row[1] * s[1]!, row[2] * s[2]!]) as M3;
  return { R: R2, flipped: [axis, other] };
}

/** Screen direction (unit, px) of a frame axis at X; null when it can't be projected. */
export function axisScreenDir(cam: Cam, X: V3, dir: V3, len: number): V2 | null {
  const p = project(cam, X);
  const q = project(cam, [X[0] + dir[0] * len, X[1] + dir[1] * len, X[2] + dir[2] * len]);
  if (!p || !q) return null;
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const n = Math.hypot(dx, dy);
  return n > 1e-9 ? [dx / n, dy / n] : null;
}
