/**
 * Guide line ↔ mock-up edge alignment ("ดูดเข้าขอบภาพ").
 *
 * Pure, DOM-free: an edge map (Sobel gradient on a downscaled grayscale copy of the view image), a per-line
 * alignment measure (perpendicular offset from the line to the strongest edge of matching orientation, sampled
 * along the segment) and a robust line refine (weighted total least squares + outlier rejection) that keeps
 * linked corners fixed. All coordinates passed in / out are IMAGE px of the view's own image (the map handles
 * its downscale internally).
 */
import type { V2 } from './camMath.ts';

export type EdgeMap = {
  /** Map size (downscaled). */
  w: number;
  h: number;
  /** Map px per image px (≤ 1). */
  scale: number;
  gx: Float32Array;
  gy: Float32Array;
  mag: Float32Array;
  /** Robust "strong edge" level (98th percentile of the magnitude) — thresholds are relative to it. */
  strong: number;
};

export type EdgeBand = 'good' | 'warn' | 'bad' | 'none';
/** Mean |offset| bands in image px. */
export const EDGE_GOOD_PX = 1;
export const EDGE_BAD_PX = 2.5;
/** Default search half-width (image px) and samples per segment. */
export const EDGE_BAND_PX = 8;
export const EDGE_SAMPLES = 24;

/** Largest side of the edge map. */
export const EDGE_MAX_SIDE = 1400;

/** RGBA → luminance (0..255). */
export function grayFromRGBA(data: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) g[i] = 0.299 * data[j]! + 0.587 * data[j + 1]! + 0.114 * data[j + 2]!;
  return g;
}

/** Sobel gradient of a grayscale image. `scale` = map px per image px (1 when not downscaled). */
export function sobel(gray: Float32Array, w: number, h: number, scale = 1): EdgeMap {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  const at = (x: number, y: number) => gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]!;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x - 1, y - 1), b = at(x, y - 1), c = at(x + 1, y - 1);
      const d = at(x - 1, y), f = at(x + 1, y);
      const g = at(x - 1, y + 1), hh = at(x, y + 1), k = at(x + 1, y + 1);
      const sx = c + 2 * f + k - (a + 2 * d + g);
      const sy = g + 2 * hh + k - (a + 2 * b + c);
      const i = y * w + x;
      gx[i] = sx;
      gy[i] = sy;
      mag[i] = Math.hypot(sx, sy);
    }
  }
  // 98th percentile via a coarse histogram (robust to a few saturated edges)
  let max = 0;
  for (let i = 0; i < mag.length; i++) if (mag[i]! > max) max = mag[i]!;
  let strong = max;
  if (max > 0) {
    const bins = new Uint32Array(512);
    for (let i = 0; i < mag.length; i++) bins[Math.min(511, Math.floor((mag[i]! / max) * 511))]!++;
    let acc = 0;
    const want = mag.length * 0.98;
    for (let b = 0; b < 512; b++) {
      acc += bins[b]!;
      if (acc >= want) {
        strong = Math.max(((b + 1) / 511) * max, 1e-6);
        break;
      }
    }
  }
  return { w, h, scale, gx, gy, mag, strong: strong || 1 };
}

/** Area-average downscale of a gray image so its long side ≤ maxSide. */
export function downscaleGray(gray: Float32Array, w: number, h: number, maxSide = EDGE_MAX_SIDE): { gray: Float32Array; w: number; h: number; scale: number } {
  const k = Math.max(1, Math.ceil(Math.max(w, h) / maxSide));
  if (k === 1) return { gray, w, h, scale: 1 };
  const W = Math.floor(w / k);
  const H = Math.floor(h / k);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += gray[(y * k + j) * w + x * k + i]!;
      out[y * W + x] = s / (k * k);
    }
  return { gray: out, w: W, h: H, scale: 1 / k };
}

/** Full pipeline from RGBA pixels. */
export function edgeMapFromRGBA(data: ArrayLike<number>, w: number, h: number, maxSide = EDGE_MAX_SIDE): EdgeMap {
  const d = downscaleGray(grayFromRGBA(data, w, h), w, h, maxSide);
  return sobel(d.gray, d.w, d.h, d.scale);
}

function bilinear(a: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const r0 = a[y0 * w + x0]! * (1 - fx) + a[y0 * w + x1]! * fx;
  const r1 = a[y1 * w + x0]! * (1 - fx) + a[y1 * w + x1]! * fx;
  return r0 * (1 - fy) + r1 * fy;
}

export type EdgeSample = {
  /** Point on the line (image px). */
  p: V2;
  /** Matched edge point (image px), or null when no edge of the right orientation is in the band. */
  q: V2 | null;
  /** Signed perpendicular offset line → edge (image px, along the line's left normal). */
  off: number | null;
  /** Edge strength (relative to the map's strong level). */
  w: number;
};
export type EdgeAlign = {
  samples: EdgeSample[];
  /** Mean |offset| of the matched samples (image px), null when none matched. */
  meanOff: number | null;
  /** Fraction of samples that found an edge. */
  coverage: number;
  /** Mean orientation agreement |cos| between the line normal and the edge gradient (matched samples). */
  orient: number;
  /** 0..1: coverage × closeness × orientation. */
  score: number;
  band: EdgeBand;
};
export type EdgeOpts = {
  /** Search half-width, image px. */
  band?: number;
  samples?: number;
  /** Minimum |cos| between the gradient and the line normal. */
  minCos?: number;
  /** Minimum strength (fraction of the map's strong level). */
  minRel?: number;
};

export function edgeBand(meanOff: number | null, coverage: number): EdgeBand {
  if (meanOff === null || coverage < 0.25) return 'none';
  if (meanOff < EDGE_GOOD_PX && coverage >= 0.5) return 'good';
  return meanOff <= EDGE_BAD_PX ? 'warn' : 'bad';
}

/** Sample along a–b; for each sample find the strongest matching-orientation edge across the line within ±band. */
export function alignLine(map: EdgeMap, a: V2, b: V2, opts: EdgeOpts = {}): EdgeAlign {
  const band = opts.band ?? EDGE_BAND_PX;
  const N = Math.max(2, opts.samples ?? EDGE_SAMPLES);
  const minCos = opts.minCos ?? 0.8;
  const minRel = opts.minRel ?? 0.12;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const samples: EdgeSample[] = [];
  if (len < 1e-6) return { samples, meanOff: null, coverage: 0, orient: 0, score: 0, band: 'none' };
  const u: V2 = [dx / len, dy / len];
  const n: V2 = [-u[1], u[0]];
  const s = map.scale;
  const step = Math.max(0.25, 0.5 / Math.max(s, 1e-6)); // ≈ ½ map px, in image px
  const thr = minRel * map.strong;
  let sumOff = 0, sumCos = 0, found = 0;
  for (let i = 0; i < N; i++) {
    const t = 0.04 + (0.92 * i) / (N - 1);
    const p: V2 = [a[0] + dx * t, a[1] + dy * t];
    let best = -1, bestD = 0, bestCos = 0;
    const vals: number[] = []; // un-penalised strength (for the sub-sample peak)
    const ds: number[] = [];
    for (let d = -band; d <= band + 1e-9; d += step) {
      // map pixel j is centred on image px (j + ½) / s
      const x = (p[0] + n[0] * d) * s - 0.5, y = (p[1] + n[1] * d) * s - 0.5;
      const gx = bilinear(map.gx, map.w, map.h, x, y);
      const gy = bilinear(map.gy, map.w, map.h, x, y);
      const m = Math.hypot(gx, gy);
      const along = Math.abs(gx * n[0] + gy * n[1]);
      const c = m > 1e-9 ? along / m : 0;
      // orientation-matched strength, with a slight preference for nearer edges
      const v = c >= minCos ? along * (1 - (0.25 * Math.abs(d)) / band) : 0;
      vals.push(c >= minCos ? along : 0);
      ds.push(d);
      if (v > best) {
        best = v;
        bestD = d;
        bestCos = c;
      }
    }
    if (best < thr) {
      samples.push({ p, q: null, off: null, w: 0 });
      continue;
    }
    // sub-sample peak (parabola through the neighbours)
    const k = ds.indexOf(bestD);
    if (k > 0 && k < vals.length - 1) {
      const y0 = vals[k - 1]!, y1 = vals[k]!, y2 = vals[k + 1]!;
      const den = y0 - 2 * y1 + y2;
      if (Math.abs(den) > 1e-12) bestD += Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) * step;
    }
    const q: V2 = [p[0] + n[0] * bestD, p[1] + n[1] * bestD];
    samples.push({ p, q, off: bestD, w: best / map.strong });
    sumOff += Math.abs(bestD);
    sumCos += bestCos;
    found++;
  }
  const coverage = found / N;
  const meanOff = found ? sumOff / found : null;
  const orient = found ? sumCos / found : 0;
  const score = meanOff === null ? 0 : coverage * orient * Math.exp(-meanOff / 2);
  return { samples, meanOff, coverage, orient, score, band: edgeBand(meanOff, coverage) };
}

export type RefineResult = { a: V2; b: V2; before: EdgeAlign; after: EdgeAlign; moved: boolean; message: string };

/** Principal direction of weighted points about a centre (for TLS). */
function principalDir(pts: V2[], w: number[], c: V2): V2 {
  let sxx = 0, sxy = 0, syy = 0;
  pts.forEach((p, i) => {
    const x = p[0] - c[0], y = p[1] - c[1];
    sxx += w[i]! * x * x;
    sxy += w[i]! * x * y;
    syy += w[i]! * y * y;
  });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [Math.cos(th), Math.sin(th)];
}

/**
 * Fit the segment to the edge pixels in its band (weighted TLS, iteratively re-searching and dropping outliers,
 * RANSAC-style). `fixed` ends (linked corners) stay put: one fixed end → the line pivots about it; both fixed →
 * no change. The free ends are projected onto the fitted line (segment extent kept).
 */
export function refineLine(map: EdgeMap, a: V2, b: V2, fixed: { a?: boolean; b?: boolean } = {}, opts: EdgeOpts & { iters?: number } = {}): RefineResult {
  const before = alignLine(map, a, b, opts);
  if (fixed.a && fixed.b) return { a, b, before, after: before, moved: false, message: 'ปลายทั้งสองเชื่อมมุมอยู่ — ไม่ขยับ' };
  let A: V2 = [a[0], a[1]];
  let B: V2 = [b[0], b[1]];
  const iters = opts.iters ?? 5;
  let band = opts.band ?? EDGE_BAND_PX;
  for (let it = 0; it < iters; it++) {
    const al = alignLine(map, A, B, { ...opts, band, samples: Math.max(opts.samples ?? 0, 40) });
    let pts: V2[] = [];
    let ws: number[] = [];
    al.samples.forEach((s) => {
      if (s.q) {
        pts.push(s.q);
        ws.push(s.w);
      }
    });
    if (pts.length < 3) break;
    let P: V2, u: V2;
    for (let pass = 0; pass < 2; pass++) {
      const W = ws.reduce((x, y) => x + y, 0) || 1;
      if (fixed.a || fixed.b) {
        P = fixed.a ? A : B;
      } else {
        P = [pts.reduce((x, p, i) => x + p[0] * ws[i]!, 0) / W, pts.reduce((x, p, i) => x + p[1] * ws[i]!, 0) / W];
      }
      u = principalDir(pts, ws, P!);
      if (pass === 1) break;
      // drop outliers (> max(1 px, 2.5 × median residual)) and refit
      const res = pts.map((p) => Math.abs((p[0] - P![0]) * -u![1] + (p[1] - P![1]) * u![0]));
      const med = [...res].sort((x, y) => x - y)[Math.floor(res.length / 2)]!;
      const cut = Math.max(1, 2.5 * med);
      const keep = res.map((r) => r <= cut);
      if (keep.filter(Boolean).length < 3) break;
      pts = pts.filter((_, i) => keep[i]);
      ws = ws.filter((_, i) => keep[i]);
    }
    const proj = (q: V2): V2 => {
      const t = (q[0] - P![0]) * u![0] + (q[1] - P![1]) * u![1];
      return [P![0] + u![0] * t, P![1] + u![1] * t];
    };
    const nA = fixed.a ? A : proj(A);
    const nB = fixed.b ? B : proj(B);
    const shift = Math.max(Math.hypot(nA[0] - A[0], nA[1] - A[1]), Math.hypot(nB[0] - B[0], nB[1] - B[1]));
    A = nA;
    B = nB;
    band = Math.max(2, band * 0.6); // tighten the band as it converges
    if (shift < 0.02) break;
  }
  const after = alignLine(map, A, B, opts);
  const better = after.meanOff !== null && (before.meanOff === null || after.meanOff <= before.meanOff + 1e-6 || after.coverage > before.coverage);
  if (!better) return { a, b, before, after: before, moved: false, message: 'ไม่พบขอบภาพที่ชัดพอในแถบรอบเส้น' };
  const moved = Math.hypot(A[0] - a[0], A[1] - a[1]) + Math.hypot(B[0] - b[0], B[1] - b[1]) > 1e-3;
  return { a: A, b: B, before, after, moved, message: moved ? `ดูดเข้าขอบภาพแล้ว · ห่าง ${fmtPx(before.meanOff)} → ${fmtPx(after.meanOff)}` : 'อยู่บนขอบภาพแล้ว' };
}

export const fmtPx = (v: number | null): string => (v === null ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)} px`);

/** Paint an edge map as an RGBA overlay (bright edges, transparent elsewhere). */
export function edgeOverlayRGBA(map: EdgeMap, color: [number, number, number] = [120, 255, 240]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(map.w * map.h * 4);
  const k = 1 / (map.strong * 0.7);
  for (let i = 0, j = 0; i < map.mag.length; i++, j += 4) {
    const v = Math.min(1, map.mag[i]! * k);
    const a = v < 0.08 ? 0 : Math.pow(v, 0.7);
    out[j] = color[0] + (255 - color[0]) * v * 0.5;
    out[j + 1] = color[1] + (255 - color[1]) * v * 0.5;
    out[j + 2] = color[2] + (255 - color[2]) * v * 0.5;
    out[j + 3] = Math.round(a * 255);
  }
  return out;
}
