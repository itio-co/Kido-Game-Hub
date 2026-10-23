// Synthetic perspective box for the line-detection / origin tests (no DOM).
import type { V2 } from '../src/lib/editor/camMath.ts';

export const cross = (p: V2, q: V2, r: V2, s: V2): V2 => {
  // intersection of lines pq and rs
  const a1 = q[1] - p[1], b1 = p[0] - q[0], c1 = a1 * p[0] + b1 * p[1];
  const a2 = s[1] - r[1], b2 = r[0] - s[0], c2 = a2 * r[0] + b2 * r[1];
  const d = a1 * b2 - a2 * b1;
  return [(c1 * b2 - c2 * b1) / d, (a1 * c2 - a2 * c1) / d];
};
const lerp = (p: V2, q: V2, t: number): V2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/** A box with X / Y VPs left and right and vertical (parallel) Z edges. Faces: left, right, top. */
export function makeBox(F: V2 = [500, 600], height = 260, vx: V2 = [-500, 120], vy: V2 = [1500, 90]) {
  const T: V2 = [F[0], F[1] - height];
  const L = lerp(F, vx, 0.22);
  const R = lerp(F, vy, 0.25);
  const TL = cross(T, vx, L, [L[0], L[1] - 10]);
  const TR = cross(T, vy, R, [R[0], R[1] - 10]);
  const B = cross(TL, vy, TR, vx);
  const edges: { a: V2; b: V2; axis: 0 | 1 | 2 }[] = [
    { a: F, b: L, axis: 0 }, { a: T, b: TL, axis: 0 }, { a: TR, b: B, axis: 0 },
    { a: F, b: R, axis: 1 }, { a: T, b: TR, axis: 1 }, { a: TL, b: B, axis: 1 },
    { a: L, b: TL, axis: 2 }, { a: F, b: T, axis: 2 }, { a: R, b: TR, axis: 2 },
  ];
  const faces: { poly: V2[]; gray: number }[] = [
    { poly: [F, L, TL, T], gray: 110 },
    { poly: [F, T, TR, R], gray: 175 },
    { poly: [T, TL, B, TR], gray: 235 },
  ];
  return { F, T, L, R, TL, TR, B, vx, vy, edges, faces };
}

function inside(poly: V2[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    const c = (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
    if (Math.abs(c) < 1e-12) continue;
    const s = Math.sign(c);
    if (!sign) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** RGBA render (4×4 supersampled; pixel centres at integers). */
export function renderBox(w: number, h: number, faces: { poly: V2[]; gray: number }[], bg = 30): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const px = x - 0.5 + (sx + 0.5) / 4, py = y - 0.5 + (sy + 0.5) / 4;
          const f = faces.find((f) => inside(f.poly, px, py));
          acc += f ? f.gray : bg;
        }
      const g = acc / 16;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = g;
      d[i + 3] = 255;
    }
  return d;
}
