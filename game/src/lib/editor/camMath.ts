/**
 * Camera matching maths (fSpy-style): vanishing points from guide lines, focal length + rotation from
 * two or three vanishing points, position from point pairs, and a Levenberg–Marquardt refinement.
 *
 * Conventions (same as game/assets-src/<item>/blender/cam.json):
 * - World = Blender: X right (width), Y back (front = −Y), Z up, centimetres.
 * - Camera = OpenCV: x right, y down, z forward. x_cam = R · (X − C).
 * - Image = "ref px": pixels of the asset's reference crop (top-left origin). Other images (the full mock-up)
 *   are mapped into ref px with their crop offset, so lines and intrinsics never depend on what is shown.
 * - u = f · x/z + cx, v = f · y/z + cy.
 */
export type V2 = [number, number];
export type V3 = [number, number, number];
export type M3 = [V3, V3, V3];

export type Cam = { f: number; cx: number; cy: number; R: M3; C: V3 };
export type Axis = 0 | 1 | 2;
export type GuideLine = { id: number; axis: Axis; a: V2; b: V2 };
export type PointPair = { id: number; world: V3 | null; image: V2 | null; label?: string };

// ---------- small linear algebra ----------
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const unit = (a: V3): V3 => scale(a, 1 / (norm(a) || 1));
export const mulMV = (m: M3, v: V3): V3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
export const transpose = (m: M3): M3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
export const mulMM = (a: M3, b: M3): M3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};
const col = (m: M3, j: number): V3 => [m[0][j]!, m[1][j]!, m[2][j]!];
const fromCols = (a: V3, b: V3, c: V3): M3 => [
  [a[0], b[0], c[0]],
  [a[1], b[1], c[1]],
  [a[2], b[2], c[2]],
];

/** Closest rotation (polar decomposition by Newton iteration). */
export function orthonormalize(m: M3): M3 {
  let r = m.map((row) => [...row]) as M3;
  for (let k = 0; k < 30; k++) {
    const inv = invert3(r);
    if (!inv) break;
    const it = transpose(inv);
    r = r.map((row, i) => row.map((v, j) => 0.5 * (v + it[i]![j]!))) as M3;
  }
  return r;
}

export function invert3(m: M3): M3 | null {
  const [a, b, c] = m;
  const r0 = cross(b, c);
  const r1 = cross(c, a);
  const r2 = cross(a, b);
  const det = dot(a, r0);
  if (Math.abs(det) < 1e-12) return null;
  return transpose([scale(r0, 1 / det), scale(r1, 1 / det), scale(r2, 1 / det)]);
}

/** Solve a small dense system A x = b (Gaussian elimination with partial pivoting). */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-14) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = M[r]![c]! / M[c]![c]!;
      for (let j = c; j <= n; j++) M[r]![j]! -= k * M[c]![j]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

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

// ---------- rotations ----------
export function rodrigues(rv: V3): M3 {
  const th = norm(rv);
  if (th < 1e-12) return [
    [1, -rv[2], rv[1]],
    [rv[2], 1, -rv[0]],
    [-rv[1], rv[0], 1],
  ];
  const [x, y, z] = scale(rv, 1 / th);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

export function rotvec(R: M3): V3 {
  const tr = R[0][0] + R[1][1] + R[2][2];
  const c = Math.min(1, Math.max(-1, (tr - 1) / 2));
  const th = Math.acos(c);
  if (th < 1e-9) return [0, 0, 0];
  if (Math.PI - th < 1e-6) {
    // 180°: axis from the largest diagonal entry
    const xx = Math.sqrt(Math.max(0, (R[0][0] + 1) / 2));
    const yy = Math.sqrt(Math.max(0, (R[1][1] + 1) / 2));
    const zz = Math.sqrt(Math.max(0, (R[2][2] + 1) / 2));
    const ax: V3 = [xx, Math.sign(R[0][1] || 1) * yy, Math.sign(R[0][2] || 1) * zz];
    return scale(unit(ax), th);
  }
  const k = th / (2 * Math.sin(th));
  return [k * (R[2][1] - R[1][2]), k * (R[0][2] - R[2][0]), k * (R[1][0] - R[0][1])];
}

/** Blender camera object rotation (camera looks along its −Z, +Y up) ↔ OpenCV world→camera R. */
const FLIP: M3 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];
export function blenderMatrix(R: M3): M3 {
  return mulMM(transpose(R), FLIP);
}
export function fromBlenderMatrix(M: M3): M3 {
  return transpose(mulMM(M, FLIP));
}
/** Blender 'XYZ' Euler (degrees): M = Rz · Ry · Rx. */
export function blenderEulerDeg(R: M3): V3 {
  const M = blenderMatrix(R);
  const D = 180 / Math.PI;
  const y = Math.asin(Math.max(-1, Math.min(1, -M[2][0])));
  let x: number;
  let z: number;
  if (Math.abs(M[2][0]) < 0.9999999) {
    x = Math.atan2(M[2][1], M[2][2]);
    z = Math.atan2(M[1][0], M[0][0]);
  } else {
    x = Math.atan2(-M[1][2], M[1][1]);
    z = 0;
  }
  return [x * D, y * D, z * D];
}
export function fromBlenderEulerDeg(e: V3): M3 {
  const [x, y, z] = e.map((v) => (v * Math.PI) / 180) as V3;
  const Rx: M3 = [
    [1, 0, 0],
    [0, Math.cos(x), -Math.sin(x)],
    [0, Math.sin(x), Math.cos(x)],
  ];
  const Ry: M3 = [
    [Math.cos(y), 0, Math.sin(y)],
    [0, 1, 0],
    [-Math.sin(y), 0, Math.cos(y)],
  ];
  const Rz: M3 = [
    [Math.cos(z), -Math.sin(z), 0],
    [Math.sin(z), Math.cos(z), 0],
    [0, 0, 1],
  ];
  return fromBlenderMatrix(mulMM(Rz, mulMM(Ry, Rx)));
}

// ---------- projection ----------
export function project(cam: Cam, X: V3): V2 | null {
  const p = mulMV(cam.R, sub(X, cam.C));
  if (p[2] <= 1e-6) return null;
  return [(cam.f * p[0]) / p[2] + cam.cx, (cam.f * p[1]) / p[2] + cam.cy];
}

/** Homogeneous vanishing point of world axis `axis` (third component 0 = at infinity). */
export function vanishingPoint(cam: Cam, axis: Axis): V3 {
  const d = col(cam.R, axis);
  return [cam.f * d[0] + cam.cx * d[2], cam.f * d[1] + cam.cy * d[2], d[2]];
}

/** Finite pixel position of a homogeneous point, or null when (nearly) at infinity. */
export function dehom(p: V3, limit = 1e7): V2 | null {
  if (Math.abs(p[2]) < 1e-12) return null;
  const u = p[0] / p[2];
  const v = p[1] / p[2];
  return Math.abs(u) > limit || Math.abs(v) > limit ? null : [u, v];
}

/** Perpendicular distance (px) of point q from the line through m and the homogeneous point vp. */
function lineResidual(m: V2, vp: V3, q: V2): number {
  const L = cross([m[0], m[1], 1], vp);
  const n = Math.hypot(L[0], L[1]);
  if (n < 1e-12) return 0;
  return (L[0] * q[0] + L[1] * q[1] + L[2]) / n;
}

// ---------- vanishing points from lines ----------
export type Frame = { cx: number; cy: number; s: number };

/** Least-squares vanishing point of ≥2 lines (homogeneous, ref px). */
export function fitVanishingPoint(lines: GuideLine[], frame: Frame): { vp: V3; rms: number } | null {
  if (lines.length < 2) return null;
  const S: M3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const nrm = (p: V2): V3 => [(p[0] - frame.cx) / frame.s, (p[1] - frame.cy) / frame.s, 1];
  for (const line of lines) {
    let l = cross(nrm(line.a), nrm(line.b));
    const n = Math.hypot(l[0], l[1]);
    if (n < 1e-12) continue;
    l = scale(l, 1 / n);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i]![j]! += l[i]! * l[j]!;
  }
  const v = smallestEigenvector(S);
  // back to pixels: x = s·x' + c·w
  const vp: V3 = [frame.s * v[0] + frame.cx * v[2], frame.s * v[1] + frame.cy * v[2], v[2]];
  let sum = 0;
  for (const line of lines) {
    const m: V2 = [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2];
    sum += lineResidual(m, vp, line.a) ** 2;
  }
  return { vp, rms: Math.sqrt(sum / lines.length) };
}

/** Principal point from three finite vanishing points (orthocentre of their triangle). */
export function orthocentre(a: V2, b: V2, c: V2): V2 | null {
  // altitude from a ⟂ (c − b), from b ⟂ (c − a)
  const A = [
    [c[0] - b[0], c[1] - b[1]],
    [c[0] - a[0], c[1] - a[1]],
  ];
  const r = [(c[0] - b[0]) * a[0] + (c[1] - b[1]) * a[1], (c[0] - a[0]) * b[0] + (c[1] - a[1]) * b[1]];
  const s = solveLinear(A, r);
  return s ? [s[0]!, s[1]!] : null;
}

/** Focal length from two orthogonal vanishing points (homogeneous). NaN when not solvable. */
export function focalFromVps(v1: V3, v2: V3, cx: number, cy: number): number {
  const a1 = [v1[0] - cx * v1[2], v1[1] - cy * v1[2]];
  const a2 = [v2[0] - cx * v2[2], v2[1] - cy * v2[2]];
  const ww = v1[2] * v2[2];
  if (Math.abs(ww) < 1e-15) return NaN;
  const f2 = -(a1[0]! * a2[0]! + a1[1]! * a2[1]!) / ww;
  return f2 > 0 ? Math.sqrt(f2) : NaN;
}

export type VpSolve = {
  ok: boolean;
  message?: string;
  cam?: Cam;
  vps: (V3 | null)[];
  vpRms: (number | null)[];
};

/**
 * Focal length (unless fixed) and rotation from the guide lines; position is kept (or set later from points).
 * `prior` resolves the sign ambiguity of each axis (and the 180° turn) and supplies f / C when needed.
 */
export function solveFromLines(
  lines: GuideLine[],
  prior: Cam,
  opts: { frame: Frame; fixedF?: boolean; principal?: 'fixed' | 'vp3' },
): VpSolve {
  const vps: (V3 | null)[] = [null, null, null];
  const vpRms: (number | null)[] = [null, null, null];
  for (const axis of [0, 1, 2] as Axis[]) {
    const fit = fitVanishingPoint(lines.filter((l) => l.axis === axis), opts.frame);
    if (fit) {
      vps[axis] = fit.vp;
      vpRms[axis] = fit.rms;
    }
  }
  const have = ([0, 1, 2] as Axis[]).filter((a) => vps[a]);
  if (have.length < 2) return { ok: false, message: 'ต้องมีเส้นอย่างน้อย 2 เส้น ใน 2 แกน', vps, vpRms };

  let { cx, cy } = prior;
  if (opts.principal === 'vp3') {
    if (have.length < 3) return { ok: false, message: 'หาจุดกึ่งกลางภาพต้องใช้ครบ 3 แกน', vps, vpRms };
    const p = vps.map((v) => (v ? dehom(v) : null));
    const o = p[0] && p[1] && p[2] ? orthocentre(p[0], p[1], p[2]) : null;
    if (!o) return { ok: false, message: 'จุดลับตาบางจุดอยู่ไกลเกินไป หาจุดกึ่งกลางภาพไม่ได้', vps, vpRms };
    [cx, cy] = o;
  }

  let f = prior.f;
  if (!opts.fixedF) {
    // best-conditioned pair: largest |w1 w2| relative to the image scale
    let best = NaN;
    let bestW = 0;
    for (let i = 0; i < have.length; i++) {
      for (let j = i + 1; j < have.length; j++) {
        const v1 = vps[have[i]!]!;
        const v2 = vps[have[j]!]!;
        const fij = focalFromVps(v1, v2, cx, cy);
        const w = Math.abs(v1[2] * v2[2]) / (norm(v1) * norm(v2));
        if (Number.isFinite(fij) && w > bestW) {
          best = fij;
          bestW = w;
        }
      }
    }
    if (!Number.isFinite(best)) {
      return { ok: false, message: 'คำนวณเลนส์ไม่ได้ (เส้นแทบขนานกัน) ลองล็อกเลนส์ หรือเพิ่มเส้นที่ยาวขึ้น', vps, vpRms };
    }
    f = best;
  }

  // Initial rotation: camera-space direction of each axis = K⁻¹ · vp, sign chosen to match the prior.
  const dirs: (V3 | null)[] = vps.map((v, axis) => {
    if (!v) return null;
    const d = unit([(v[0] - cx * v[2]) / f, (v[1] - cy * v[2]) / f, v[2]]);
    return dot(d, col(prior.R, axis)) < 0 ? scale(d, -1) : d;
  });
  const [i, j] = [have[0]!, have[1]!];
  const k = 3 - i - j;
  const cols: V3[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  cols[i] = dirs[i]!;
  cols[j] = unit(sub(dirs[j]!, scale(dirs[i]!, dot(dirs[i]!, dirs[j]!))));
  // right-handed: c0 × c1 = c2 (cyclic)
  cols[k] = k === 2 ? cross(cols[0]!, cols[1]!) : k === 0 ? cross(cols[1]!, cols[2]!) : cross(cols[2]!, cols[0]!);
  if (dirs[k] && dot(cols[k]!, dirs[k]!) < 0) {
    // the third measured axis disagrees with handedness: trust measurements, flip the weakest
    cols[k] = scale(cols[k]!, -1);
    cols[j] = scale(cols[j]!, -1);
  }
  let cam: Cam = { f, cx, cy, R: orthonormalize(fromCols(cols[0]!, cols[1]!, cols[2]!)), C: prior.C };
  cam = refine(cam, lines, [], { f: !opts.fixedF, rotation: true, position: false, principal: false }).cam;
  return { ok: true, cam, vps, vpRms };
}

// ---------- position from point pairs ----------
/** Camera centre from ≥2 pairs with rotation and intrinsics known (linear, then refined in px). */
export function solvePosition(cam: Cam, pairs: PointPair[]): Cam | null {
  const ok = pairs.filter((p) => p.world && p.image);
  if (ok.length < 2) return null;
  const A: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const b = [0, 0, 0];
  for (const p of ok) {
    const q = unit([(p.image![0] - cam.cx) / cam.f, (p.image![1] - cam.cy) / cam.f, 1]);
    // [q]× R (X − C) = 0  →  ([q]× R) C = [q]× R X
    const Qx: M3 = [
      [0, -q[2], q[1]],
      [q[2], 0, -q[0]],
      [-q[1], q[0], 0],
    ];
    const M = mulMM(Qx, cam.R);
    const rhs = mulMV(M, p.world!);
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) A[i]![j]! += M[r]![i]! * M[r]![j]!;
        b[i]! += M[r]![i]! * rhs[r]!;
      }
    }
  }
  const C = solveLinear(A, b);
  if (!C) return null;
  const out = { ...cam, C: C as V3 };
  return refine(out, [], ok, { f: false, rotation: false, position: true, principal: false }).cam;
}

// ---------- non-linear refinement ----------
export type RefineFlags = { f: boolean; rotation: boolean; position: boolean; principal: boolean };

function residuals(cam: Cam, lines: GuideLine[], pairs: PointPair[]): { line: number[]; point: number[] } {
  const vps = [0, 1, 2].map((a) => vanishingPoint(cam, a as Axis));
  const line = lines.map((l) => lineResidual([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], vps[l.axis]!, l.a));
  const point: number[] = [];
  for (const p of pairs) {
    if (!p.world || !p.image) continue;
    const uv = project(cam, p.world);
    if (!uv) point.push(1e4, 1e4);
    else point.push(uv[0] - p.image[0], uv[1] - p.image[1]);
  }
  return { line, point };
}

export function rmsErrors(cam: Cam, lines: GuideLine[], pairs: PointPair[]): { lines: number | null; points: number | null } {
  const r = residuals(cam, lines, pairs);
  const rms = (v: number[], per: number) => (v.length ? Math.sqrt(v.reduce((s, x) => s + x * x, 0) / (v.length / per)) : null);
  return { lines: rms(r.line, 1), points: rms(r.point, 2) };
}

/** Levenberg–Marquardt over the selected parameters (rotation as a delta rotation vector). */
export function refine(start: Cam, lines: GuideLine[], pairs: PointPair[], flags: RefineFlags, iterations = 60): { cam: Cam; cost: number } {
  const usePairs = pairs.filter((p) => p.world && p.image);
  const build = (x: number[]): Cam => {
    let i = 0;
    const cam: Cam = { ...start, R: start.R, C: [...start.C] as V3 };
    if (flags.rotation) {
      cam.R = mulMM(rodrigues([x[i]!, x[i + 1]!, x[i + 2]!]), start.R);
      i += 3;
    }
    if (flags.f) cam.f = start.f * Math.exp(x[i++]!);
    if (flags.position) {
      cam.C = [start.C[0] + x[i]!, start.C[1] + x[i + 1]!, start.C[2] + x[i + 2]!];
      i += 3;
    }
    if (flags.principal) {
      cam.cx = start.cx + x[i++]!;
      cam.cy = start.cy + x[i++]!;
    }
    return cam;
  };
  const n = (flags.rotation ? 3 : 0) + (flags.f ? 1 : 0) + (flags.position ? 3 : 0) + (flags.principal ? 2 : 0);
  if (n === 0) return { cam: start, cost: 0 };
  const resid = (x: number[]) => {
    const r = residuals(build(x), lines, usePairs);
    return [...r.line, ...r.point];
  };
  let x = new Array(n).fill(0) as number[];
  let r = resid(x);
  let cost = r.reduce((s, v) => s + v * v, 0);
  if (r.length === 0) return { cam: start, cost: 0 };
  let lambda = 1e-3;
  const steps = (k: number) => (flags.position && k >= (flags.rotation ? 3 : 0) + (flags.f ? 1 : 0) && k < n - (flags.principal ? 2 : 0) ? 1e-3 * (1 + norm(start.C)) : 1e-6);
  for (let it = 0; it < iterations; it++) {
    const J: number[][] = [];
    for (let k = 0; k < n; k++) {
      const h = steps(k);
      const xp = [...x];
      xp[k]! += h;
      const rp = resid(xp);
      J.push(rp.map((v, m) => (v - r[m]!) / h));
    }
    // normal equations
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a]!.reduce((s, v, m) => s + v * J[b]![m]!, 0)));
    const g = Array.from({ length: n }, (_, a) => J[a]!.reduce((s, v, m) => s + v * r[m]!, 0));
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const Ad = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const dx = solveLinear(Ad, g.map((v) => -v));
      if (!dx) {
        lambda *= 10;
        continue;
      }
      const xn = x.map((v, k) => v + dx[k]!);
      const rn = resid(xn);
      const cn = rn.reduce((s, v) => s + v * v, 0);
      if (cn < cost) {
        x = xn;
        r = rn;
        const gain = cost - cn;
        cost = cn;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (gain < 1e-12 * (1 + cost)) it = iterations;
        break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  const cam = build(x);
  cam.R = orthonormalize(cam.R);
  return { cam, cost };
}

/** Full point-pair solve (PnP-style): rotation, position and focal (and optionally principal point). */
export function solveFull(start: Cam, lines: GuideLine[], pairs: PointPair[], opts: { fixedF: boolean; principal: boolean }): Cam {
  let cam = refine(start, lines, pairs, { f: false, rotation: true, position: true, principal: false }, 80).cam;
  cam = refine(cam, lines, pairs, { f: !opts.fixedF, rotation: true, position: true, principal: false }, 120).cam;
  if (opts.principal) cam = refine(cam, lines, pairs, { f: !opts.fixedF, rotation: true, position: true, principal: true }, 120).cam;
  return cam;
}

/** Same camera seen from the other side: turn 180° about world Z through the model origin. */
export function turnAround(cam: Cam): Cam {
  const Rz: M3 = [
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, 1],
  ];
  return { ...cam, R: mulMM(cam.R, Rz), C: mulMV(Rz, cam.C) };
}
