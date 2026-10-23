/**
 * Whole-object placement: Blender's Object mode on the asset's root. It says where the whole model sits in the
 * scene, separately from the per-part edits.
 *
 * Units and axes are Blender's: centimetres, X right, Y back (front = −Y), Z up. Rotation is in degrees with Blender's
 * default XYZ Euler mode (R = Rz · Ry · Rx). Scale is uniform. `origin` is the object's origin (pivot) in the model's
 * own frame (cm, Blender axes); it defaults to the GLB origin (0, 0, 0).
 *
 *   world = position + scale · R(rotation) · (local − origin)
 *
 * so `position` is where the origin ends up. The camera-match camera stays in world space: moving the object never
 * moves the camera. The solver works in the object's frame (`camToObject` / `camToWorld`).
 */
import * as THREE from 'three';
import { mulMM, mulMV, transpose, type M3, type V3 } from './camMath.ts';

export type Placement = { position: V3; rotation: V3; scale: number; origin?: V3 };

export const IDENTITY_PLACEMENT: Readonly<Placement> = Object.freeze<Placement>({ position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 });

const round = (v: number, d: number): number => {
  const k = 10 ** d;
  const r = Math.round(v * k) / k;
  return Object.is(r, -0) ? 0 : r;
};
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const vec = (v: unknown): V3 | null => (Array.isArray(v) && v.length === 3 && v.every(isNum) ? ([v[0], v[1], v[2]] as V3) : null);
const zero = (v: V3, eps: number): boolean => v.every((x) => Math.abs(x) < eps);

/** Wrap an angle to (−180, 180]. */
export function wrapDeg(a: number): number {
  let r = ((a + 180) % 360 + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

/** Identity placement (or nothing)? */
export function isIdentityPlacement(p: Placement | null | undefined): boolean {
  if (!p) return true;
  return zero(p.position, 1e-4) && zero(p.rotation.map(wrapDeg) as V3, 1e-4) && Math.abs(p.scale - 1) < 1e-6 && (!p.origin || zero(p.origin, 1e-4));
}

/**
 * Validate / migrate a stored placement (edits.json, localStorage draft). Older files have none. Returns undefined
 * for a missing, invalid or identity placement, so files without one stay byte-identical.
 */
export function cleanPlacement(raw: unknown): Placement | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const position = vec(r.position) ?? vec(r.positionCm);
  const rotation = vec(r.rotation) ?? vec(r.rotationDeg) ?? [0, 0, 0];
  const scale = isNum(r.scale) && r.scale > 0 ? r.scale : 1;
  const origin = vec(r.origin) ?? vec(r.originCm);
  if (!position) return undefined;
  const p: Placement = {
    position: position.map((v) => round(v, 3)) as V3,
    rotation: rotation.map((v) => round(wrapDeg(v), 3)) as V3,
    scale: round(scale, 5),
  };
  if (origin && !zero(origin, 1e-4)) p.origin = origin.map((v) => round(v, 3)) as V3;
  return isIdentityPlacement(p) ? undefined : p;
}

/** Normalise a placement in memory (rounded; identity → undefined), like `cleanPlacement`. */
export function normalizePlacement(p: Placement | null | undefined): Placement | undefined {
  return p ? cleanPlacement(p) : undefined;
}

/** Object rotation matrix of a Blender XYZ Euler (degrees): R = Rz · Ry · Rx (world-from-object, Blender axes). */
export function rotationXYZ(deg: V3): M3 {
  const [x, y, z] = deg.map((v) => (v * Math.PI) / 180) as V3;
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
  return mulMM(Rz, mulMM(Ry, Rx));
}

/** World-space rigid map of a placement: world = s · Q · x + t (Blender cm). */
export type Rigid = { Q: M3; t: V3; s: number };
export function rigidOf(p: Placement | null | undefined): Rigid {
  const pl = p ?? IDENTITY_PLACEMENT;
  const Q = rotationXYZ(pl.rotation);
  const o = pl.origin ?? [0, 0, 0];
  const Qo = mulMV(Q, o);
  const t: V3 = [pl.position[0] - pl.scale * Qo[0], pl.position[1] - pl.scale * Qo[1], pl.position[2] - pl.scale * Qo[2]];
  return { Q, t, s: pl.scale };
}

/** Model-frame point (Blender cm) → world. */
export function placeToWorld(p: Placement | null | undefined, x: V3): V3 {
  const { Q, t, s } = rigidOf(p);
  const q = mulMV(Q, x);
  return [s * q[0] + t[0], s * q[1] + t[1], s * q[2] + t[2]];
}

/** World point (Blender cm) → model frame. */
export function placeToLocal(p: Placement | null | undefined, w: V3): V3 {
  const { Q, t, s } = rigidOf(p);
  const q = mulMV(transpose(Q), [w[0] - t[0], w[1] - t[1], w[2] - t[2]]);
  return [q[0] / s, q[1] / s, q[2] / s];
}

/** Move the origin to `origin` (model frame) without moving the geometry (Blender: Set Origin). */
export function withOrigin(p: Placement | null | undefined, origin: V3): Placement {
  const pl = p ?? IDENTITY_PLACEMENT;
  return { position: placeToWorld(pl, origin), rotation: [...pl.rotation] as V3, scale: pl.scale, origin: [...origin] as V3 };
}

type CamLike = { R: M3; C: V3 };
/** World camera → the same camera expressed in the object's frame (what the solver sees: object at the origin). */
export function camToObject<C extends CamLike>(cam: C, p: Placement | null | undefined): C {
  if (isIdentityPlacement(p)) return cam;
  const { Q, t, s } = rigidOf(p);
  const d = mulMV(transpose(Q), [cam.C[0] - t[0], cam.C[1] - t[1], cam.C[2] - t[2]]);
  return { ...cam, R: mulMM(cam.R, Q), C: [d[0] / s, d[1] / s, d[2] / s] };
}

/** Inverse of `camToObject`: a camera solved in the object's frame → world. */
export function camToWorld<C extends CamLike>(cam: C, p: Placement | null | undefined): C {
  if (isIdentityPlacement(p)) return cam;
  const { Q, t, s } = rigidOf(p);
  const q = mulMV(Q, cam.C);
  return { ...cam, R: mulMM(cam.R, transpose(Q)), C: [t[0] + s * q[0], t[1] + s * q[1], t[2] + s * q[2]] };
}

// ---------- three.js (glTF: Y up, Z front, metres) ----------

/** Blender → three basis: (x, y, z)_blender → (x, z, −y)_three. */
const B = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
const BT = B.clone().transpose();

/** Blender rotation (degrees, XYZ Euler) as a three.js quaternion in glTF axes. */
export function threeQuaternion(rotationDeg: V3): THREE.Quaternion {
  const e = new THREE.Euler(...(rotationDeg.map((v) => THREE.MathUtils.degToRad(v)) as V3), 'ZYX');
  const Mb = new THREE.Matrix4().makeRotationFromEuler(e);
  return new THREE.Quaternion().setFromRotationMatrix(B.clone().multiply(Mb).multiply(BT));
}

/** glTF-axes quaternion → Blender XYZ Euler degrees. */
export function blenderRotationDeg(q: THREE.Quaternion): V3 {
  const Mt = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const Mb = BT.clone().multiply(Mt).multiply(B);
  const e = new THREE.Euler().setFromRotationMatrix(Mb, 'ZYX');
  return [e.x, e.y, e.z].map((v) => wrapDeg(THREE.MathUtils.radToDeg(v))) as V3;
}

/** Blender cm → three metres (point). */
export const toThree = (v: V3): THREE.Vector3 => new THREE.Vector3(v[0] / 100, v[2] / 100, -v[1] / 100);
/** three metres → Blender cm (point). */
export const fromThree = (v: THREE.Vector3): V3 => [v.x * 100, -v.z * 100, v.y * 100];

/** Node TRS of the placement in glTF axes (metres): the root node transform of an exported GLB. */
export function threeTRS(p: Placement | null | undefined): { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: number } {
  const { t, s } = rigidOf(p);
  return { position: toThree(t), quaternion: threeQuaternion((p ?? IDENTITY_PLACEMENT).rotation), scale: s };
}

export function threeMatrix(p: Placement | null | undefined): THREE.Matrix4 {
  const { position, quaternion, scale } = threeTRS(p);
  return new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(scale, scale, scale));
}

/** Placement from a node TRS (glTF axes, metres), keeping `origin`. */
export function placementFromThree(position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number, origin?: V3): Placement {
  const rotation = blenderRotationDeg(quaternion);
  const t = fromThree(position);
  const o = origin ?? [0, 0, 0];
  const Qo = mulMV(rotationXYZ(rotation), o);
  const p: Placement = { position: [t[0] + scale * Qo[0], t[1] + scale * Qo[1], t[2] + scale * Qo[2]], rotation, scale };
  if (origin && !zero(origin, 1e-6)) p.origin = [...origin] as V3;
  return p;
}

/**
 * Put the placement on the export root (a clone of the loaded glTF scene group, which GLTFExporter writes as the
 * GLB's root node). Default: as that root node's transform, so the meshes keep their own coordinates. `bake`: apply
 * it to the root's children (the parts / top-level nodes) instead, leaving the root node as it was.
 * A THREE.Scene has no node of its own (GLTFExporter drops its transform), so its children get wrapped in a `name`
 * node that carries the placement.
 */
export function applyPlacementForExport(root: THREE.Object3D, p: Placement | null | undefined, bake = false, name = 'Object'): THREE.Object3D {
  if (isIdentityPlacement(p)) return root;
  const M = threeMatrix(p);
  const isScene = (root as THREE.Scene).isScene === true;
  root.updateMatrix();
  if (bake) {
    const L = isScene ? new THREE.Matrix4() : root.matrix.clone();
    const Mh = L.clone().invert().multiply(M).multiply(L);
    for (const child of [...root.children]) child.applyMatrix4(Mh);
  } else if (!isScene) {
    root.applyMatrix4(M);
  } else {
    const wrap = new THREE.Group();
    wrap.name = name;
    for (const child of [...root.children]) wrap.add(child);
    M.decompose(wrap.position, wrap.quaternion, wrap.scale);
    root.add(wrap);
  }
  root.updateMatrixWorld(true);
  return root;
}

/** edits.json shape of a placement (unit-named keys; `cleanPlacement` reads both shapes). */
export function placementFileData(p: Placement): Record<string, unknown> {
  return { positionCm: p.position, rotationDeg: p.rotation, scale: p.scale, ...(p.origin ? { originCm: p.origin } : {}) };
}
