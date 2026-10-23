import { Matrix4, Vector3 } from 'three';
import type * as THREE from 'three';
import type { Selection } from './selection.js';

export type TransformMode = 'translate' | 'rotate' | 'scale';

/**
 * Input to a snap function.
 *
 * `matrix` is the proposed world-space delta since the session started, with the pivot
 * already conjugated in:
 *
 *     matrix = T(t) · T(pivot) · R · S · T(−pivot) = T(pivot + t) · L · T(−pivot),  L = R·S
 *     p' = matrix · p_start  (world space)
 *
 * `t` is the pivot displacement and `L` the linear part. Use `splitDelta` / `makeDelta`.
 * The session maps to object-local with `inverse(object.matrixWorld)`.
 */
export interface SnapCandidate {
  matrix: THREE.Matrix4;
  /** Session pivot, world space (selection centroid at session start). */
  pivot: THREE.Vector3;
  selection: Selection;
  // ---- optional context (always provided by EditorViewport; snap fns may ignore) ----
  mode?: TransformMode;
  /** `drag` = gizmo change, `typed` = numeric input. */
  source?: 'drag' | 'typed';
  /** Gizmo axis constraint, e.g. 'X', 'XY', 'XYZ'. */
  axis?: string | null;
  /** Gizmo space. */
  space?: 'local' | 'world';
  /** Pointer ray at this moment (drag only), for vertex / edge / face snapping. */
  ray?: THREE.Ray;
  /** Modifier: snapping is inverted while held (Ctrl on desktop, a toggle button on touch). */
  invert?: boolean;
}

/** Returns the (possibly adjusted) delta matrix. Must be pure and fast (called per pointer move). */
export type SnapFn = (candidate: SnapCandidate) => THREE.Matrix4;

export type SnapKind = 'grid' | 'angle' | 'vertex' | 'edge' | 'face' | 'alignNormal';

/** Providers that look for a geometric target. Their translation replaces the grid-rounded one. */
export const GEOMETRIC_SNAP_KINDS: ReadonlySet<SnapKind> = new Set<SnapKind>(['vertex', 'edge', 'face', 'alignNormal']);

export interface SnapProvider {
  kind: SnapKind;
  enabled: boolean;
  /**
   * Returns the adjusted delta (same form as `candidate.matrix`), or `null` for "no change /
   * no target". For geometric kinds, `null` means no target was found.
   */
  snap(candidate: SnapCandidate): THREE.Matrix4 | null;
}

/** Settings for the built-in providers. Distances in metres, angles in degrees. */
export interface SnapSettings {
  /** Translation grid step. Kido default 0.005 (5 mm). */
  grid: { enabled: boolean; step: number };
  /** Rotation step. Kido default 15°. Scale step (unitless) shares this block. */
  angle: { enabled: boolean; stepDeg: number; scaleStep: number };
  /** Snap pivot to the nearest vertex of other (or unselected) geometry within `radiusPx`. */
  vertex: { enabled: boolean; radiusPx: number };
  /** Snap pivot onto the nearest edge (closest point) within `radiusPx`. */
  edge: { enabled: boolean; radiusPx: number };
  /** Snap pivot onto the face under the pointer ray. */
  face: { enabled: boolean };
  /** With face snap: also rotate so the selection's +Y aligns to the hit face normal. */
  alignNormal: { enabled: boolean };
}

/** Linear part `L` (translation zeroed) and pivot displacement `t` of a pivot-conjugated delta. */
export interface DeltaParts {
  t: THREE.Vector3;
  linear: THREE.Matrix4;
}

const _lp = new Vector3();

/** Split `matrix = T(pivot + t) · L · T(−pivot)` into `{ t, linear: L }`. */
export function splitDelta(matrix: THREE.Matrix4, pivot: THREE.Vector3): DeltaParts {
  const linear = new Matrix4().copy(matrix).setPosition(0, 0, 0);
  // translation column = pivot + t − L·pivot  ⇒  t = col − pivot + L·pivot
  const t = new Vector3().setFromMatrixPosition(matrix).sub(pivot).add(_lp.copy(pivot).applyMatrix4(linear));
  return { t, linear };
}

/** Build `T(pivot + t) · L · T(−pivot)`. The translation of `linear` is ignored. */
export function makeDelta(pivot: THREE.Vector3, t: THREE.Vector3, linear: THREE.Matrix4): THREE.Matrix4 {
  const m = new Matrix4().copy(linear).setPosition(0, 0, 0);
  const lp = _lp.copy(pivot).applyMatrix4(m);
  return m.setPosition(pivot.x + t.x - lp.x, pivot.y + t.y - lp.y, pivot.z + t.z - lp.z);
}

/**
 * Compose providers into one SnapFn (API.md §8):
 * 1. grid / angle providers, in list order, each refining the matrix;
 * 2. geometric providers (vertex / edge / face / alignNormal), in list order; the first non-null
 *    result wins and the rest are skipped;
 * 3. on a hit, its `t` replaces the grid-rounded `t` (not re-rounded); the angle-snapped linear
 *    part from step 1 is kept, except for `alignNormal`, whose linear part is used as-is;
 * 4. no hit: the step-1 result.
 * `candidate.invert` flips every provider's `enabled` for this call.
 */
export function composeSnaps(providers: readonly SnapProvider[]): SnapFn {
  return (candidate) => {
    const on = (p: SnapProvider): boolean => p.enabled !== Boolean(candidate.invert);
    let m = candidate.matrix.clone();
    for (const p of providers) {
      if (GEOMETRIC_SNAP_KINDS.has(p.kind) || !on(p)) continue;
      const r = p.snap({ ...candidate, matrix: m });
      if (r) m = r.clone();
    }
    for (const p of providers) {
      if (!GEOMETRIC_SNAP_KINDS.has(p.kind) || !on(p)) continue;
      const r = p.snap({ ...candidate, matrix: m });
      if (!r) continue;
      const hit = splitDelta(r, candidate.pivot);
      const base = p.kind === 'alignNormal' ? hit.linear : splitDelta(m, candidate.pivot).linear;
      return makeDelta(candidate.pivot, hit.t, base);
    }
    return m;
  };
}

export type ComposeSnaps = typeof composeSnaps;
