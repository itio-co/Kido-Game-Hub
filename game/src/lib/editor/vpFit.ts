/**
 * Vanishing-point consolidation for camera-match guide lines (pure functions, no DOM / Svelte).
 *
 * All lines of one axis should meet in ONE vanishing point (VP). `fitVP` finds the best one:
 *   - each line becomes a homogeneous line l = a × b in normalised image coords (centred, divided by the image size),
 *     scaled so (l₀, l₁) is a unit normal → l·v is the perpendicular distance of a finite v from the line;
 *   - the VP is the smallest eigenvector of Σ wᵢ lᵢ lᵢᵀ (total least squares) — parallel lines give v₂ ≈ 0,
 *     i.e. a VP at infinity, without any special case;
 *   - IRLS with a Huber weight on each line's angular residual keeps one bad line from dragging the VP, and lines
 *     that stay far off (> 2° and > 3× the median) are flagged as outliers and dropped from the fit (with ≥ 3 left).
 * `consolidate` then turns every line of an axis so it passes exactly through its VP (about its midpoint, or about
 * a linked corner so shared corners never move), and `lockedPoint` keeps a dragged endpoint on the ray from the
 * line's fixed end to the VP of the OTHER lines of its axis.
 * Image (ref) px throughout; homogeneous VPs are in px too (third component 0 = at infinity).
 */
import type { Axis, GuideLine, M3, V2, V3 } from './camMath';

export type Seg = { a: V2; b: V2 };
export type Frame = { cx: number; cy: number; s: number };
export type VpFit = {
  /** Homogeneous VP in px (w ≈ 0 → at infinity). */
  vp: V3;
  /** Finite px position, or null when (nearly) at infinity. */
  point: V2 | null;
  /** Angular error (degrees) of each input line to the VP, same order as the input. */
  resDeg: number[];
  /** Outlier flags (excluded from the final fit), same order as the input. */
  outlier: boolean[];
  /** RMS angular error over the inlier lines (degrees). */
  rmsDeg: number;
  /** RMS perpendicular distance (px) of the inlier endpoints from their line re-aimed at the VP. */
  rms: number;
};

/** Residual colour bands (degrees). */
export const RES_GOOD_DEG = 0.5;
export const RES_BAD_DEG = 2;
export function residualBand(deg: number): 'good' | 'warn' | 'bad' {
  return deg < RES_GOOD_DEG ? 'good' : deg <= RES_BAD_DEG ? 'warn' : 'bad';
}

const D = 180 / Math.PI;
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Eigenvector of the smallest eigenvalue of a symmetric 3×3 matrix (Jacobi). */
export function smallestEigenvector(S: M3): V3 {
  const a = S.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p]![q]!) < 1e-30) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  let best = 0;
  for (let i = 1; i < 3; i++) if (a[i]![i]! < a[best]![best]!) best = i;
  return [v[0]![best]!, v[1]![best]!, v[2]![best]!];
}

/** Default normalisation frame for a set of segments (their bounding box). */
export function frameOf(lines: readonly Seg[]): Frame {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const p of [l.a, l.b]) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  }
  if (!Number.isFinite(x0)) return { cx: 0, cy: 0, s: 1 };
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Math.max(x1 - x0, y1 - y0, 1) };
}

/** Finite px point of a homogeneous VP, or null when at (or practically at) infinity. */
export function vpPoint(vp: V3, limit = 1e7): V2 | null {
  if (vp[2] === 0) return null;
  const p: V2 = [vp[0] / vp[2], vp[1] / vp[2]];
  return Math.abs(p[0]) > limit || Math.abs(p[1]) > limit ? null : p;
}

/** Direction (unit, px) from `from` towards the VP; null when `from` is (practically) on the VP. */
export function dirToVp(from: V2, vp: V3): V2 | null {
  const p = vpPoint(vp);
  const d: V2 = p ? [p[0] - from[0], p[1] - from[1]] : [vp[0] * Math.sign(vp[2] || 1), vp[1] * Math.sign(vp[2] || 1)];
  const n = Math.hypot(d[0], d[1]);
  return n < 1e-9 ? null : [d[0] / n, d[1] / n];
}

/** Angle (degrees, 0…90) between a segment and the direction from its midpoint to the VP. */
export function angleToVp(l: Seg, vp: V3): number {
  const d: V2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
  const n = Math.hypot(d[0], d[1]);
  if (n < 1e-12) return 0;
  const t = dirToVp([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], vp);
  if (!t) return 0;
  // atan2 instead of acos: exact near 0°
  return Math.atan2(Math.abs(d[0] * t[1] - d[1] * t[0]), Math.abs(d[0] * t[0] + d[1] * t[1])) * D;
}

function homLine(l: Seg, f: Frame): V3 | null {
  const p: V3 = [(l.a[0] - f.cx) / f.s, (l.a[1] - f.cy) / f.s, 1];
  const q: V3 = [(l.b[0] - f.cx) / f.s, (l.b[1] - f.cy) / f.s, 1];
  const L = cross3(p, q);
  const n = Math.hypot(L[0], L[1]);
  return n < 1e-12 ? null : [L[0] / n, L[1] / n, L[2] / n];
}

function solveWeighted(hl: (V3 | null)[], w: number[], f: Frame): V3 {
  const S: M3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  hl.forEach((l, i) => {
    if (!l || !(w[i]! > 0)) return;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r]![c]! += w[i]! * l[r]! * l[c]!;
  });
  const v = smallestEigenvector(S);
  // back to px: x = s·x' + c·w
  return [f.s * v[0] + f.cx * v[2], f.s * v[1] + f.cy * v[2], v[2]];
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Best-fit vanishing point of ≥ 2 segments. `robust` (default) = Huber IRLS + outlier rejection.
 * Returns null with fewer than 2 usable (non-degenerate) segments.
 */
export function fitVP(lines: readonly Seg[], frame: Frame = frameOf(lines), opts: { robust?: boolean; huberDeg?: number } = {}): VpFit | null {
  const robust = opts.robust ?? true;
  const huber = opts.huberDeg ?? 1;
  const hl = lines.map((l) => homLine(l, frame));
  const usable = hl.filter(Boolean).length;
  if (usable < 2) return null;
  const outlier = lines.map(() => false);
  const w: number[] = hl.map((l) => (l ? 1 : 0));
  let vp = solveWeighted(hl, w, frame);
  const res = (): number[] => lines.map((l) => angleToVp(l, vp));
  if (robust && usable >= 3) {
    for (let round = 0; round < usable; round++) {
      // Huber IRLS on the current inliers
      for (let it = 0; it < 30; it++) {
        const r = res();
        let change = 0;
        hl.forEach((l, i) => {
          if (!l || outlier[i]) return;
          const nw = r[i]! <= huber ? 1 : huber / r[i]!;
          change = Math.max(change, Math.abs(nw - w[i]!));
          w[i] = nw;
        });
        vp = solveWeighted(hl, w, frame);
        if (change < 1e-6) break;
      }
      // reject the worst line when it is clearly off (keep at least 3 inliers in the fit)
      const inl = lines.map((_, i) => i).filter((i) => hl[i] && !outlier[i]);
      if (inl.length <= 3) break;
      const r = res();
      const med = Math.max(median(inl.map((i) => r[i]!)), 0.25);
      let worst = -1;
      for (const i of inl) if (worst < 0 || r[i]! > r[worst]!) worst = i;
      if (worst < 0 || r[worst]! <= Math.max(RES_BAD_DEG, 3 * med)) break;
      outlier[worst] = true;
      w[worst] = 0;
      hl.forEach((l, i) => { if (l && !outlier[i]) w[i] = 1; });
      vp = solveWeighted(hl, w, frame);
    }
  }
  // fix the overall sign so the VP is stable (w ≥ 0, else x ≥ 0)
  if (vp[2] < 0 || (vp[2] === 0 && vp[0] < 0)) vp = [-vp[0], -vp[1], -vp[2]];
  const resDeg = res();
  const inl = lines.map((_, i) => i).filter((i) => hl[i] && !outlier[i]);
  const rmsDeg = Math.sqrt(inl.reduce((s, i) => s + resDeg[i]! ** 2, 0) / Math.max(1, inl.length));
  let px = 0;
  for (const i of inl) {
    const l = lines[i]!;
    const m: V2 = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
    const L = cross3([m[0], m[1], 1], vp);
    const n = Math.hypot(L[0], L[1]);
    if (n > 1e-12) px += (dot3(L, [l.a[0], l.a[1], 1]) / n) ** 2;
  }
  return { vp, point: vpPoint(vp), resDeg, outlier, rmsDeg, rms: Math.sqrt(px / Math.max(1, inl.length)) };
}

/** Per-axis fits for a set of guide lines (null where an axis has < 2 lines). */
export function fitAxes(lines: readonly GuideLine[], frame?: Frame): ({ fit: VpFit; ids: number[] } | null)[] {
  const f = frame ?? frameOf(lines);
  return ([0, 1, 2] as Axis[]).map((axis) => {
    const ls = lines.filter((l) => l.axis === axis);
    const fit = fitVP(ls, f);
    return fit ? { fit, ids: ls.map((l) => l.id) } : null;
  });
}

/**
 * Turn segment l so it passes exactly through vp, keeping its length. `pivot` stays fixed: the midpoint
 * (default) or one endpoint. The direction keeps the sense of a→b. Null when the pivot sits on the VP.
 */
export function aimAt(l: Seg, vp: V3, pivot: 'mid' | 'a' | 'b' = 'mid'): Seg | null {
  const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
  const P: V2 = pivot === 'a' ? l.a : pivot === 'b' ? l.b : [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
  let u = dirToVp(P, vp);
  if (!u || len < 1e-12) return null;
  if (u[0] * (l.b[0] - l.a[0]) + u[1] * (l.b[1] - l.a[1]) < 0) u = [-u[0], -u[1]];
  if (pivot === 'a') return { a: [...l.a], b: [l.a[0] + u[0] * len, l.a[1] + u[1] * len] };
  if (pivot === 'b') return { a: [l.b[0] - u[0] * len, l.b[1] - u[1] * len], b: [...l.b] };
  return { a: [P[0] - (u[0] * len) / 2, P[1] - (u[1] * len) / 2], b: [P[0] + (u[0] * len) / 2, P[1] + (u[1] * len) / 2] };
}

export type ConsolidateResult = {
  lines: GuideLine[];
  /** Lines that were turned. */
  moved: number[];
  /** Lines left alone, with the reason (Thai, for the UI). */
  skipped: { id: number; reason: string }[];
};

/**
 * Make every line of the given axes pass exactly through its axis' best-fit VP.
 * Unlinked lines turn about their midpoint (length + centre kept). A line with ONE linked corner turns about that
 * corner instead, so the shared corner (and every other line on it) stays put. A line with both ends linked is
 * skipped and reported (turning it would tear a corner apart). Returns new line objects; the input is not changed.
 */
export function consolidate(lines: readonly GuideLine[], axes: readonly Axis[], frame?: Frame, tolDeg = 1e-6): ConsolidateResult {
  const f = frame ?? frameOf(lines);
  const out: GuideLine[] = lines.map((l) => ({ ...l, a: [...l.a] as V2, b: [...l.b] as V2, ...(l.links ? { links: { ...l.links } } : {}) }));
  const moved: number[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (const axis of axes) {
    const ls = lines.filter((l) => l.axis === axis);
    const fit = fitVP(ls, f);
    if (!fit) continue;
    ls.forEach((l, i) => {
      if (fit.resDeg[i]! <= tolDeg) return;
      const la = l.links?.a !== undefined;
      const lb = l.links?.b !== undefined;
      if (la && lb) {
        skipped.push({ id: l.id, reason: 'ปลายทั้งสองเชื่อมมุมอยู่' });
        return;
      }
      const next = aimAt(l, fit.vp, la ? 'a' : lb ? 'b' : 'mid');
      if (!next) {
        skipped.push({ id: l.id, reason: 'จุดหมุนอยู่ที่จุดลับตา' });
        return;
      }
      const o = out.find((x) => x.id === l.id)!;
      o.a = next.a;
      o.b = next.b;
      moved.push(l.id);
    });
  }
  return { lines: out, moved, skipped };
}

/**
 * "Lock to VP": the VP fitted from the OTHER lines of `line`'s axis (needs ≥ 2 of them), or null.
 * `exclude` = further lines that move with the drag (they are left out of the fit too).
 */
export function lockVp(lines: readonly GuideLine[], line: number, frame?: Frame, exclude: readonly number[] = []): V3 | null {
  const me = lines.find((l) => l.id === line);
  if (!me) return null;
  const others = lines.filter((l) => l.axis === me.axis && l.id !== line && !exclude.includes(l.id));
  if (others.length < 2) return null;
  return fitVP(others, frame ?? frameOf(lines))?.vp ?? null;
}

/** Project p onto the line through `fixed` and the VP (the dragged endpoint slides along that ray). */
export function lockedPoint(fixed: V2, vp: V3, p: V2): V2 | null {
  const u = dirToVp(fixed, vp);
  if (!u) return null;
  const t = (p[0] - fixed[0]) * u[0] + (p[1] - fixed[1]) * u[1];
  return [fixed[0] + u[0] * t, fixed[1] + u[1] * t];
}

/** Perpendicular distance of q from the line through `fixed` towards the VP. */
export function distToRay(fixed: V2, vp: V3, q: V2): number {
  const u = dirToVp(fixed, vp);
  if (!u) return Math.hypot(q[0] - fixed[0], q[1] - fixed[1]);
  return Math.abs((q[0] - fixed[0]) * u[1] - (q[1] - fixed[1]) * u[0]);
}
