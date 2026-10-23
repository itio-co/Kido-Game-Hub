import type * as THREE from 'three';
import type { Selection } from './selection.js';

export type TransformMode = 'translate' | 'rotate' | 'scale';

/**
 * Input to a snap function.
 * `matrix` is the proposed world-space delta since the session started, already expressed
 * about the pivot: every selected point p moves to `matrix · p_start`.
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

export interface SnapProvider {
  kind: SnapKind;
  enabled: boolean;
  snap: SnapFn;
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

/**
 * Chain providers left-to-right (grid/angle first, then geometric). The first geometric
 * provider that finds a target wins; the rest are skipped.
 */
export type ComposeSnaps = (providers: readonly SnapProvider[]) => SnapFn;
