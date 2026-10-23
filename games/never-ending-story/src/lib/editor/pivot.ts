/**
 * Part origin (pivot) editing — Blender's "Set Origin" for the model editor.
 *
 * A part's pivot is an offset in the part's own local frame (metres, the frame of the geometry as loaded
 * from the GLB). The scene applies it by moving the node's content by −pivot (the mesh geometry of the
 * node itself, and the positions of its direct children), so the node origin sits on the pivot. To keep
 * the mesh still in world space, the node position moves by R·S·(newPivot − oldPivot).
 *
 * `PartState.pivot` is optional (absent = the GLB origin), so older edits files load unchanged.
 */
import * as THREE from 'three';

export type Vec3 = [number, number, number];
export type PivotPreset = 'center' | 'bottom' | 'reset';
export type SnapKind = 'vertex' | 'edge' | 'face' | 'bbox' | 'grid';
export type LocalBox = { min: Vec3; max: Vec3 };

export const ZERO: Vec3 = [0, 0, 0];
const DEG = Math.PI / 180;
const r = (v: number, d = 6): number => Math.round(v * 10 ** d) / 10 ** d;

export function isZero(p: readonly number[] | null | undefined, eps = 1e-9): boolean {
  return !p || (Math.abs(p[0]!) < eps && Math.abs(p[1]!) < eps && Math.abs(p[2]!) < eps);
}

/** A valid pivot value from untrusted data (edits file / draft): three finite numbers, non-zero; else undefined. */
export function cleanPivot(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((v) => typeof v === 'number' && Number.isFinite(v))) return undefined;
  const p: Vec3 = [r(value[0]), r(value[1]), r(value[2])];
  return isZero(p) ? undefined : p;
}

/**
 * Edits-file / draft migration: parts without `pivot` (files written before pivots existed) stay as they are
 * (pivot = GLB origin); a malformed or zero pivot is dropped. Returns a new parts array.
 */
export function migrateParts<T extends { pivot?: unknown }>(parts: T[]): T[] {
  return parts.map((part) => {
    const out = { ...part };
    const p = cleanPivot(part.pivot);
    if (p) out.pivot = p;
    else delete out.pivot;
    return out;
  });
}

/** Node position that keeps the mesh fixed in its parent's space when the pivot moves `from` → `to` (local m). */
export function shiftedPosition(position: Vec3, rotationDeg: Vec3, scale: Vec3, from: Vec3, to: Vec3): Vec3 {
  const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  d.multiply(new THREE.Vector3(...scale)).applyEuler(new THREE.Euler(rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG));
  return [r(position[0] + d.x), r(position[1] + d.y), r(position[2] + d.z)];
}

/** Pivot (local m) for a preset; `reset` = the GLB origin. */
export function presetPivot(kind: PivotPreset, box: LocalBox): Vec3 {
  if (kind === 'reset') return [...ZERO];
  const c = (i: 0 | 1 | 2) => r((box.min[i] + box.max[i]) / 2);
  return kind === 'center' ? [c(0), c(1), c(2)] : [c(0), r(box.min[1]), c(2)];
}

// ---------- applying a pivot to scene nodes ----------

type Pristine = { geo: THREE.BufferGeometry | null; kids: Map<THREE.Object3D, THREE.Vector3>; pivot: Vec3 };
const pristine = new WeakMap<THREE.Object3D, Pristine>();

/** Remember a part node's content as loaded (call while the node is untouched: right after load / clone). */
export function registerPart(node: THREE.Object3D): void {
  if (pristine.has(node)) return;
  const mesh = node as THREE.Mesh;
  const kids = new Map<THREE.Object3D, THREE.Vector3>();
  for (const k of node.children) kids.set(k, k.position.clone());
  pristine.set(node, { geo: mesh.isMesh ? mesh.geometry : null, kids, pivot: [...ZERO] });
}

/** Original (un-offset) geometry of a part node that is itself a mesh. */
export function originalGeometry(node: THREE.Object3D): THREE.BufferGeometry | null {
  return pristine.get(node)?.geo ?? null;
}

/**
 * Offset the node's content by −pivot (node-local): its own geometry (a private translated copy; the loaded
 * geometry is shared with copies and kept) and its direct children. Does not touch the node transform.
 * Returns true when geometry was swapped (edge overlays must be rebuilt).
 */
export function applyPivot(node: THREE.Object3D, pivot: Vec3 | null | undefined): boolean {
  const o = pristine.get(node);
  if (!o) return false;
  const p: Vec3 = pivot && !isZero(pivot) ? pivot : ZERO;
  if (p[0] === o.pivot[0] && p[1] === o.pivot[1] && p[2] === o.pivot[2]) return false;
  const mesh = node as THREE.Mesh;
  let swapped = false;
  if (mesh.isMesh && o.geo) {
    if (mesh.geometry !== o.geo) mesh.geometry.dispose();
    if (p === ZERO) mesh.geometry = o.geo;
    else {
      const g = o.geo.clone();
      g.translate(-p[0], -p[1], -p[2]);
      mesh.geometry = g;
    }
    swapped = true;
  }
  for (const [kid, pos] of o.kids) kid.position.set(pos.x - p[0], pos.y - p[1], pos.z - p[2]);
  o.pivot = [...p];
  return swapped;
}

// ---------- snap targets ----------

export const SNAP_KINDS: SnapKind[] = ['vertex', 'edge', 'face', 'bbox', 'grid'];
export type SnapTargets = { points: Float32Array; kinds: Uint8Array; box: LocalBox };

/** Box of a part template (node at identity), node-local metres. */
export function localBox(template: THREE.Object3D): LocalBox {
  template.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(template, true);
  if (b.isEmpty()) return { min: [...ZERO], max: [...ZERO] };
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
}

/**
 * Snap targets of a part, node-local metres: its vertices, edge midpoints, triangle centres (a quad's centre is
 * the midpoint of its diagonal edge, so it is covered by the edge midpoints) and the 8 box corners + centre.
 * `template` is a copy of the part node at the identity transform. Thinned to about `max` points per kind.
 */
export function snapTargets(template: THREE.Object3D, max = 6000): SnapTargets {
  template.updateMatrixWorld(true);
  const lists: number[][] = [[], [], [], []];
  const seen = [new Set<string>(), new Set<string>(), new Set<string>()];
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
  const push = (kind: 0 | 1 | 2, x: number, y: number, z: number) => {
    const k = key(x, y, z);
    if (seen[kind]!.has(k)) return;
    seen[kind]!.add(k);
    lists[kind]!.push(x, y, z);
  };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  template.traverse((n) => {
    const mesh = n as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const m = mesh.matrixWorld;
    for (let i = 0; i < pos.count; i++) {
      a.fromBufferAttribute(pos, i).applyMatrix4(m);
      push(0, a.x, a.y, a.z);
    }
    const index = mesh.geometry.getIndex();
    const tris = index ? index.count / 3 : pos.count / 3;
    const at = (t: number, j: number) => (index ? index.getX(t * 3 + j) : t * 3 + j);
    for (let t = 0; t < tris; t++) {
      a.fromBufferAttribute(pos, at(t, 0)).applyMatrix4(m);
      b.fromBufferAttribute(pos, at(t, 1)).applyMatrix4(m);
      c.fromBufferAttribute(pos, at(t, 2)).applyMatrix4(m);
      push(2, (a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
      push(1, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      push(1, (b.x + c.x) / 2, (b.y + c.y) / 2, (b.z + c.z) / 2);
      push(1, (c.x + a.x) / 2, (c.y + a.y) / 2, (c.z + a.z) / 2);
    }
  });
  const box = localBox(template);
  const [x0, y0, z0] = box.min;
  const [x1, y1, z1] = box.max;
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) lists[3]!.push(x, y, z);
  lists[3]!.push((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  let total = 0;
  const thinned = lists.map((l, kind) => {
    const n = l.length / 3;
    const stride = kind === 3 ? 1 : Math.max(1, Math.ceil(n / max));
    const out: number[] = [];
    for (let i = 0; i < n; i += stride) out.push(l[i * 3]!, l[i * 3 + 1]!, l[i * 3 + 2]!);
    total += out.length / 3;
    return out;
  });
  const points = new Float32Array(total * 3);
  const kinds = new Uint8Array(total);
  let o = 0;
  // box first: on ties (a box corner on a vertex) the more specific mesh target wins below
  for (const kind of [3, 0, 1, 2]) {
    const l = thinned[kind]!;
    points.set(l, o * 3);
    kinds.fill(kind, o, o + l.length / 3);
    o += l.length / 3;
  }
  return { points, kinds, box };
}

/** Index of the screen point (x,y pairs) nearest to `at` within `maxPx`, or −1. Later points win ties. */
export function nearestOnScreen(screen: Float32Array, at: [number, number], maxPx: number): number {
  let best = -1;
  let bd = maxPx * maxPx;
  for (let i = 0; i < screen.length / 2; i++) {
    const dx = screen[i * 2]! - at[0];
    const dy = screen[i * 2 + 1]! - at[1];
    const d = dx * dx + dy * dy;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
