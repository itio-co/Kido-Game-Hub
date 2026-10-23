/**
 * Straight-line detection on the Sobel edge map (the camera-match "Detect lines" tool, T.detect).
 *
 * Pure, DOM-free and dependency-free. An LSD-like region grower: pixels above a gradient threshold are visited
 * strongest first; each seed grows over 8-connected neighbours whose level-line orientation stays within a
 * tolerance of the region's (doubled-angle) mean. A region becomes a segment from its magnitude-weighted
 * principal axis (sub-pixel), its extent along that axis and a thinness check. Collinear neighbours are merged,
 * the strongest `max` kept. The work runs as a generator so the UI can process it in small chunks
 * (`detectLinesChunked`) and never freeze; `detectLines` runs it in one go (tests).
 *
 * Coordinates: IMAGE px of the view's own image (map px / map.scale), pixel centres at integers (as edgeAlign).
 */
import type { V2 } from './camMath.ts';
import type { EdgeMap } from './edgeAlign.ts';

export type DetectedSeg = {
  a: V2;
  b: V2;
  /** Length (image px). */
  len: number;
  /** Mean gradient magnitude relative to the map's strong level. */
  strength: number;
  /** Ranking score (length × strength). */
  score: number;
  /** Direction angle in degrees, 0..180. */
  angle: number;
};

export type DetectOpts = {
  /** Minimum segment length in image px (default 40). */
  minLen?: number;
  /** Keep the strongest N segments (default 40). */
  max?: number;
  /** Gradient threshold relative to the map's strong level (default 0.25). */
  magFrac?: number;
  /** Orientation tolerance for region growing, degrees (default 22.5). */
  angTolDeg?: number;
  /** Region of interest in IMAGE px (default: the whole map). */
  roi?: { x: number; y: number; w: number; h: number };
  /** Seeds processed per chunk by the generator (default 4000). */
  chunk?: number;
};

const D = 180 / Math.PI;

/** Level-line orientation (along the edge) of map pixel i, radians in [0, π). */
function levelAngle(m: EdgeMap, i: number): number {
  let t = Math.atan2(m.gx[i]!, -m.gy[i]!);
  if (t < 0) t += Math.PI;
  if (t >= Math.PI) t -= Math.PI;
  return t;
}

/** Undirected angle difference (radians, 0..π/2). */
function angDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % Math.PI;
  if (d > Math.PI / 2) d = Math.PI - d;
  return d;
}

type RawSeg = { a: V2; b: V2; len: number; w: number; mag: number };

/** Fit a segment to a region (map px). Null when too short or too thick for a line. */
function fitRegion(m: EdgeMap, px: number[]): RawSeg | null {
  let sw = 0, sx = 0, sy = 0;
  for (const i of px) {
    const w = m.mag[i]!;
    sw += w;
    sx += w * (i % m.w);
    sy += w * Math.floor(i / m.w);
  }
  if (sw <= 0) return null;
  const cx = sx / sw;
  const cy = sy / sw;
  let xx = 0, yy = 0, xy = 0;
  for (const i of px) {
    const w = m.mag[i]!;
    const dx = (i % m.w) - cx;
    const dy = Math.floor(i / m.w) - cy;
    xx += w * dx * dx;
    yy += w * dy * dy;
    xy += w * dx * dy;
  }
  const th = 0.5 * Math.atan2(2 * xy, xx - yy);
  const u: V2 = [Math.cos(th), Math.sin(th)];
  let lo = Infinity, hi = -Infinity, perp = 0;
  for (const i of px) {
    const dx = (i % m.w) - cx;
    const dy = Math.floor(i / m.w) - cy;
    const t = dx * u[0] + dy * u[1];
    if (t < lo) lo = t;
    if (t > hi) hi = t;
    const q = -dx * u[1] + dy * u[0];
    perp += m.mag[i]! * q * q;
  }
  const len = hi - lo;
  const wStd = Math.sqrt(perp / sw);
  return { a: [cx + u[0] * lo, cy + u[1] * lo], b: [cx + u[0] * hi, cy + u[1] * hi], len, w: wStd, mag: sw / px.length };
}

/** Merge collinear neighbours (map px): angle < 2°, both ends within `tol` of the other's line, gap < `gap`. */
export function mergeCollinear<T extends { a: V2; b: V2; len: number; mag: number }>(segs: T[], tol = 1.5, gap = 12, angTolDeg = 2): T[] {
  const out = segs.slice();
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const s = out[i]!;
        const t = out[j]!;
        const us = unit(s);
        const ut = unit(t);
        if (Math.acos(Math.min(1, Math.abs(us[0] * ut[0] + us[1] * ut[1]))) * D > angTolDeg) continue;
        const off = (p: V2, q: V2, u: V2) => Math.abs(-(p[0] - q[0]) * u[1] + (p[1] - q[1]) * u[0]);
        if (off(t.a, s.a, us) > tol || off(t.b, s.a, us) > tol || off(s.a, t.a, ut) > tol || off(s.b, t.a, ut) > tol) continue;
        // projections on s's direction
        const pr = (p: V2) => (p[0] - s.a[0]) * us[0] + (p[1] - s.a[1]) * us[1];
        const s0 = 0, s1 = pr(s.b);
        const t0 = Math.min(pr(t.a), pr(t.b)), t1 = Math.max(pr(t.a), pr(t.b));
        const g = Math.max(t0 - s1, s0 - t1);
        if (g > gap) continue;
        // the merged line: length-weighted mean direction through the length-weighted centroid
        const w1 = s.len, w2 = t.len;
        const ut2: V2 = us[0] * ut[0] + us[1] * ut[1] < 0 ? [-ut[0], -ut[1]] : ut;
        const u = norm([us[0] * w1 + ut2[0] * w2, us[1] * w1 + ut2[1] * w2]);
        const c: V2 = [((s.a[0] + s.b[0]) * w1 + (t.a[0] + t.b[0]) * w2) / (2 * (w1 + w2)), ((s.a[1] + s.b[1]) * w1 + (t.a[1] + t.b[1]) * w2) / (2 * (w1 + w2))];
        const ts = [s.a, s.b, t.a, t.b].map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]);
        const lo = Math.min(...ts), hi = Math.max(...ts);
        out[i] = { ...s, a: [c[0] + u[0] * lo, c[1] + u[1] * lo], b: [c[0] + u[0] * hi, c[1] + u[1] * hi], len: hi - lo, mag: (s.mag * w1 + t.mag * w2) / (w1 + w2) };
        out.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return out;
}
const unit = (s: { a: V2; b: V2 }): V2 => norm([s.b[0] - s.a[0], s.b[1] - s.a[1]]);
const norm = (v: V2): V2 => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};

/**
 * The detector as a generator: yields (progress 0..1) between chunks of seeds, returns the segments
 * (IMAGE px, strongest first).
 */
export function* detectLinesIter(m: EdgeMap, opts: DetectOpts = {}): Generator<number, DetectedSeg[], void> {
  const k = m.scale;
  const minLen = (opts.minLen ?? 40) * k;
  const max = opts.max ?? 40;
  const thr = (opts.magFrac ?? 0.25) * m.strong;
  const tol = ((opts.angTolDeg ?? 22.5) * Math.PI) / 180;
  const chunk = opts.chunk ?? 4000;
  const r = opts.roi;
  const x0 = r ? Math.max(1, Math.floor(r.x * k)) : 1;
  const y0 = r ? Math.max(1, Math.floor(r.y * k)) : 1;
  const x1 = r ? Math.min(m.w - 1, Math.ceil((r.x + r.w) * k)) : m.w - 1;
  const y1 = r ? Math.min(m.h - 1, Math.ceil((r.y + r.h) * k)) : m.h - 1;
  // seeds: strong pixels, strongest first
  const seeds: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (m.mag[y * m.w + x]! >= thr) seeds.push(y * m.w + x);
  seeds.sort((a, b) => m.mag[b]! - m.mag[a]!);
  const used = new Uint8Array(m.w * m.h);
  const raw: RawSeg[] = [];
  const stack: number[] = [];
  let n = 0;
  /** Grow a region of consistent orientation (doubled-angle running mean) from `seed`; marks its pixels used. */
  const grow = (seed: number, tolR: number): number[] => {
    const region = [seed];
    used[seed] = 1;
    let t0 = levelAngle(m, seed);
    let c2 = Math.cos(2 * t0), s2 = Math.sin(2 * t0);
    stack.length = 0;
    stack.push(seed);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % m.w, y = (i - x) / m.w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const j = ny * m.w + nx;
          if (used[j] || m.mag[j]! < thr) continue;
          const a = levelAngle(m, j);
          if (angDiff(a, t0) > tolR) continue;
          used[j] = 1;
          region.push(j);
          stack.push(j);
          c2 += Math.cos(2 * a);
          s2 += Math.sin(2 * a);
          t0 = Math.atan2(s2, c2) / 2;
          if (t0 < 0) t0 += Math.PI;
        }
      }
    }
    return region;
  };
  /** Thin enough to be a line (an edge band is ~1–2 px each side). */
  const thin = (g: RawSeg) => g.w <= Math.max(1.6, g.len * 0.012);
  for (const s of seeds) {
    if (++n % chunk === 0) yield (0.9 * n) / seeds.length;
    if (used[s]) continue;
    // LSD-style refinement: a region that turns a corner is too thick → regrow with a tighter tolerance
    let tolR = tol;
    let seg: RawSeg | null = null;
    let region: number[] = [];
    for (let tries = 0; tries < 3; tries++) {
      region = grow(s, tolR);
      if (region.length < minLen) break;
      seg = fitRegion(m, region);
      if (seg && thin(seg)) break;
      seg = null;
      for (const i of region) used[i] = 0;
      tolR *= 0.5;
    }
    if (!seg) {
      used[s] = 1;
      continue;
    }
    if (seg.len < minLen) continue;
    raw.push(seg);
  }
  yield 0.95;
  const merged = mergeCollinear(raw, 1.5, 6 + minLen * 0.1);
  const out: DetectedSeg[] = merged
    .filter((s) => s.len >= minLen)
    .map((s) => {
      const a: V2 = [s.a[0] / k, s.a[1] / k];
      const b: V2 = [s.b[0] / k, s.b[1] / k];
      const len = s.len / k;
      const strength = Math.min(4, s.mag / m.strong);
      let angle = Math.atan2(b[1] - a[1], b[0] - a[0]) * D;
      if (angle < 0) angle += 180;
      if (angle >= 180) angle -= 180;
      return { a, b, len, strength, score: len * strength, angle };
    });
  out.sort((p, q) => q.score - p.score);
  return out.slice(0, max);
}

/** Run the detector in one go. */
export function detectLines(m: EdgeMap, opts: DetectOpts = {}): DetectedSeg[] {
  const it = detectLinesIter(m, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/** Run the detector in time-sliced chunks (≤ `budgetMs` per slice) so the UI keeps responding. */
export async function detectLinesChunked(m: EdgeMap, opts: DetectOpts = {}, onProgress?: (p: number) => void, budgetMs = 12, isCancelled?: () => boolean): Promise<DetectedSeg[] | null> {
  const it = detectLinesIter(m, { chunk: 1500, ...opts });
  let t = performance.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - t > budgetMs) {
      onProgress?.(r.value);
      await new Promise((res) => setTimeout(res, 0));
      if (isCancelled?.()) return null;
      t = performance.now();
    }
  }
}

// ---------- axis classification ----------
type V3h = [number, number, number];
const lineH = (s: { a: V2; b: V2 }): V3h => [s.a[1] - s.b[1], s.b[0] - s.a[0], s.a[0] * s.b[1] - s.a[1] * s.b[0]];
const crossH = (u: V3h, v: V3h): V3h => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
/** Angle (deg) between a segment and the direction from its midpoint toward a homogeneous VP. */
function angToVpH(s: { a: V2; b: V2 }, vp: V3h): number {
  const m: V2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
  const v: V2 = norm([vp[0] - m[0] * vp[2], vp[1] - m[1] * vp[2]]);
  const u = norm([s.b[0] - s.a[0], s.b[1] - s.a[1]]);
  return Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]))) * D;
}
export type AxisPredictor =
  /** A finite VP (same px space as the segments). */
  | { kind: 'vp'; p: V2 }
  /** A direction (parallel axis / VP at infinity). */
  | { kind: 'dir'; d: V2 }
  | null;

/** Angle (deg) between a segment and the direction toward a predictor; Infinity without one. */
export function axisAngle(a: V2, b: V2, pred: AxisPredictor): number {
  if (!pred) return Infinity;
  const u = norm([b[0] - a[0], b[1] - a[1]]);
  let v: V2;
  if (pred.kind === 'vp') {
    const m: V2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    v = norm([pred.p[0] - m[0], pred.p[1] - m[1]]);
  } else v = norm(pred.d);
  return Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]))) * D;
}

/**
 * Assign each segment to an axis (0 X, 1 Y, 2 Z) or null.
 * With predictors (VPs / directions of axes that have lines): the axis whose VP the segment points at most
 * closely, within `tolDeg`. Axes without a predictor are filled by orientation clustering of the rest:
 * near-vertical first (Z), then the VP explaining the most segment length (RANSAC over pairwise
 * intersections), then the next; with both X and Y missing the cluster whose VP lies left is X.
 */
export function classifySegments(segs: { a: V2; b: V2; len: number }[], preds: AxisPredictor[], tolDeg = 4): (0 | 1 | 2 | null)[] {
  const out: (0 | 1 | 2 | null)[] = segs.map(() => null);
  const have = [0, 1, 2].filter((a) => preds[a]);
  segs.forEach((s, i) => {
    let best: 0 | 1 | 2 | null = null;
    let bd = tolDeg;
    for (const a of have) {
      const d = axisAngle(s.a, s.b, preds[a]!);
      if (d < bd) {
        bd = d;
        best = a as 0 | 1 | 2;
      }
    }
    out[i] = best;
  });
  const missing = [0, 1, 2].filter((a) => !preds[a]);
  if (!missing.length) return out;
  const angleOf = (s: { a: V2; b: V2 }) => {
    let t = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * D;
    if (t < 0) t += 180;
    return t >= 180 ? t - 180 : t;
  };
  const free = segs.map((s, i) => ({ s, i, t: angleOf(s) })).filter((x) => out[x.i] === null);
  // vertical (Z in Blender: up)
  if (missing.includes(2)) {
    for (const x of free) if (Math.abs(x.t - 90) < 12) out[x.i] = 2;
  }
  // the other (perspective) axes: greedy RANSAC over pairwise intersections → the VP explaining the most
  // length, then the next; each cluster gets a missing axis (left VP → X when both are missing)
  let rest = free.filter((x) => out[x.i] === null && Math.abs(x.t - 90) >= 12);
  const others = missing.filter((a) => a !== 2);
  const tolV = Math.max(tolDeg, 3);
  const clusters: { vp: V3h; members: number[] }[] = [];
  for (let k = 0; k < others.length && rest.length >= 2; k++) {
    let best: { vp: V3h; w: number; members: number[] } | null = null;
    for (let p = 0; p < rest.length; p++)
      for (let q = p + 1; q < rest.length; q++) {
        const vp = crossH(lineH(rest[p]!.s), lineH(rest[q]!.s));
        if (Math.hypot(vp[0], vp[1], vp[2]) < 1e-12) continue;
        let w = 0;
        const members: number[] = [];
        for (const x of rest)
          if (angToVpH(x.s, vp) < tolV) {
            w += x.s.len;
            members.push(x.i);
          }
        if (members.length >= 2 && (!best || w > best.w)) best = { vp, w, members };
      }
    if (!best) break;
    clusters.push({ vp: best.vp, members: best.members });
    rest = rest.filter((x) => !best!.members.includes(x.i));
  }
  // order: a cluster whose VP lies left (smaller x; at infinity: by direction) is X
  const vpX = (v: V3h) => (Math.abs(v[2]) > 1e-9 ? v[0] / v[2] : (v[0] * Math.sign(v[1] || 1) > 0 ? 1e12 : -1e12));
  if (others.length === 2 && clusters.length === 2 && vpX(clusters[0]!.vp) > vpX(clusters[1]!.vp)) clusters.reverse();
  clusters.forEach((c, k) => {
    for (const i of c.members) out[i] = others[k] as 0 | 1 | 2;
  });
  return out;
}
