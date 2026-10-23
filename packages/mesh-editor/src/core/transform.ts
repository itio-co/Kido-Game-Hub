import type * as THREE from 'three';
import type { Selection } from './selection.js';
import type { TransformMode } from './snap.js';

/** A numeric value typed into a field. Goes through the same snap → apply → commit path as a drag. */
export interface TypedValue {
  kind: 'position' | 'rotation' | 'scale' | 'size';
  axis: 0 | 1 | 2;
  /** position/size: metres; rotation: degrees; scale: unitless. Absolute value, not a delta. */
  value: number;
  /** Default: 'local' for object mode, 'world' for element modes. */
  space?: 'local' | 'world';
}

/**
 * One gesture: gizmo drag start → release, or one typed value.
 *
 * 1. `begin()` snapshots the selection's meshes / transforms and fixes `pivot` at the
 *    selection centroid (world).
 * 2. Each gizmo change → `update(matrix)`: snap(candidate) → apply to the start snapshot →
 *    `host.commit(…, { live: true })` → `host.requestRender()`.
 * 3. Release → `end()`: one `host.commit(…, { live: false })` per object and exactly one
 *    History command. `cancel()` (Esc / second finger) restores the snapshot, no command.
 * A typed value is `begin()` + `update()` + `end()` in one call (`applyTyped`).
 */
export interface TransformSession {
  readonly mode: TransformMode;
  readonly selection: Selection;
  /** World-space pivot, fixed for the whole session. */
  readonly pivot: THREE.Vector3;
  readonly active: boolean;
  /** Last applied (post-snap) delta. */
  readonly matrix: THREE.Matrix4;
  update(matrix: THREE.Matrix4): void;
  end(): void;
  cancel(): void;
}
