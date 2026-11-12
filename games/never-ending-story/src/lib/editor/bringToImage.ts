import * as THREE from 'three';
import { add, mulMV, norm, scale, sub, transpose, type Cam, type V3 } from './camMath.ts';
import type { Box2 } from './viewFrame.ts';

export type ImagePlacement = { from: V3; to: V3; scale: number; radius: number; depth: number };
export type ClipRange = { near: number; far: number };
export type BringHistory = { before: number; beforeClip: ClipRange; afterClip: ClipRange };
export type BringProblem = 'camera' | 'image' | 'geometry' | 'transform';

/** Diagnose the rejected input without guessing that every failure is a zero-size model. */
export function placementProblem(cam: Cam, points: readonly V3[], image: Box2): BringProblem | null {
  if (!(cam.f > 0) || ![cam.f, cam.cx, cam.cy, ...cam.C, ...cam.R.flat()].every(Number.isFinite)) return 'camera';
  if (![image.x0, image.y0, image.x1, image.y1].every(Number.isFinite) || !(image.x1 > image.x0) || !(image.y1 > image.y0)) return 'image';
  if (!points.length || points.some(p => !p.every(Number.isFinite))) return 'geometry';
  if (points.every(p => p.every((value, axis) => value === points[0]![axis]))) return 'geometry';
  return null;
}

/** Records use unique history-entry IDs: equal model JSON can recur with different clipping.
 * A Bring edit also changes transient renderer clipping. Undo/redo must restore that side of the edit. */
export function clipForHistoryStep(from: number, to: number, records: ReadonlyMap<number, BringHistory>): ClipRange | null {
  const undo = records.get(from);
  if (undo?.before === to) return undo.beforeClip;
  const redo = records.get(to);
  return redo?.before === from ? redo.afterClip : null;
}

/** A world-space similarity that places the WHOLE object inside the reference image, not the viewport.
 * No original point needs to be in front of the camera. A bounding sphere fits all four image-frustum planes.
 * Units are Blender centimetres. The input camera and geometry are never modified.
 */
export function placementInImage(cam: Cam, points: readonly V3[], image: Box2, depth: number, padding = 0.12): ImagePlacement | null {
  if (!points.length || !(cam.f > 0) || !(depth > 0) || padding < 0 || padding >= 0.5 ||
      ![cam.f, cam.cx, cam.cy, ...cam.C, ...cam.R.flat(), ...Object.values(image), depth].every(Number.isFinite) ||
      !(image.x1 > image.x0) || !(image.y1 > image.y0)) return null;
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const point of points) for (const axis of [0, 1, 2] as const) {
    if (!Number.isFinite(point[axis])) return null;
    min[axis] = Math.min(min[axis], point[axis]); max[axis] = Math.max(max[axis], point[axis]);
  }
  const from: V3 = min.map((v, i) => v / 2 + max[i]! / 2) as V3;
  let radius = 0;
  for (const point of points) radius = Math.max(radius, norm(sub(point, from)));
  if (!(radius > 0) || !Number.isFinite(radius)) return null;
  const u = image.x0 / 2 + image.x1 / 2, v = image.y0 / 2 + image.y1 / 2;
  const px = (image.x1 - image.x0) * padding, py = (image.y1 - image.y0) * padding;
  const left = image.x0 + px, right = image.x1 - px, top = image.y0 + py, bottom = image.y1 - py;
  const targetRadius = Math.min(
    depth * (u - left) / Math.hypot(cam.f, left - cam.cx),
    depth * (right - u) / Math.hypot(cam.f, right - cam.cx),
    depth * (v - top) / Math.hypot(cam.f, top - cam.cy),
    depth * (bottom - v) / Math.hypot(cam.f, bottom - cam.cy),
    depth * 0.8,
  ) * 0.98;
  const to = add(cam.C, mulMV(transpose(cam.R), [depth * (u - cam.cx) / cam.f, depth * (v - cam.cy) / cam.f, depth]));
  const factor = targetRadius / radius;
  if (!(factor > 0) || ![factor, ...to].every(Number.isFinite)) return null;
  return { from, to, scale: factor, radius: targetRadius, depth };
}

export function placedPoint(point: V3, placement: ImagePlacement): V3 {
  return add(placement.to, scale(sub(point, placement.from), placement.scale));
}

const toThree = (p: V3): THREE.Vector3 => new THREE.Vector3(p[0] / 100, p[2] / 100, -p[1] / 100);

/** Uniform world scaling commutes with any invertible parent linear transform. No rotation decomposition,
 * no rounding, and no pivot edits: tiny, mirrored and nonuniform scales remain representable and undoable.
 */
export function placedPart(position: V3, partScale: V3, parentWorld: THREE.Matrix4, placement: ImagePlacement): { position: V3; scale: V3 } | null {
  if (![...position, ...partScale, ...parentWorld.elements].every(Number.isFinite) || !parentWorld.determinant()) return null;
  const p = new THREE.Vector3(...position).applyMatrix4(parentWorld);
  p.sub(toThree(placement.from)).multiplyScalar(placement.scale).add(toThree(placement.to));
  p.applyMatrix4(parentWorld.clone().invert());
  const next = { position: p.toArray() as V3, scale: partScale.map(v => v * placement.scale) as V3 };
  return [...next.position, ...next.scale].every(Number.isFinite) ? next : null;
}
