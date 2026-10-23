import type * as THREE from 'three';
import type { EditObject } from './document.js';
import type { Transform } from './math.js';
import type { EditMesh } from './mesh.js';
import type { Selection } from './selection.js';

export interface CommitOptions {
  /**
   * `true` while a drag / slider is in progress: update the render mesh only, no undo step,
   * no persistence. `false` on release / typed value / op: final value, the host may persist.
   * Exactly one `live: false` commit follows a series of `live: true` commits.
   */
  live: boolean;
}

/**
 * What the editor needs from the app that owns the scene. The host owns the documents,
 * the THREE objects, persistence and the render loop; the editor never renders by itself.
 */
export interface EditorHost {
  /**
   * Current mesh of an object. `null` = the object can be selected (and transformed, unless
   * locked) in object mode, but cannot be edited at the element level (vertex / edge / face).
   */
  getMesh(objId: string): EditMesh | null;
  /** Replace an object's mesh. The host rebuilds geometry (see EditMeshOps.toBufferGeometry). */
  commit(objId: string, mesh: EditMesh, opts: CommitOptions): void;
  /** Called by the editor whenever the selection changes (pick, box select, undo, mode switch). */
  onSelectionChange(selection: Selection): void;
  /** Disable camera navigation (OrbitControls etc.) while the editor owns a gesture; re-enable after. */
  setNavigationEnabled(enabled: boolean): void;
  /** Ask the host to draw one frame (coalesced by the host, e.g. one rAF). */
  requestRender(): void;
  /** Material for an id from `EditMesh.fm` / `EditObject.materialId`. `null` = host default. */
  resolveMaterial(id: string | null): THREE.Material;

  // ---- Agreed additions (API.md §5) ----

  /** Pickable object ids, in list order. Default: none (editor picks nothing). */
  listObjects(): string[];
  /** The THREE object that renders `objId` (used for raycast, matrixWorld, gizmo attach). */
  getObject3D(objId: string): THREE.Object3D | null;
  /** Object-mode transform commit, same `live` rules as `commit`. */
  commitTransform(objId: string, transform: Transform, opts: CommitOptions): void;
  /** Optional: create / remove objects (duplicate, delete, undo of those). */
  addObject?(object: EditObject, index?: number): void;
  removeObject?(objId: string): void;
  /**
   * Optional lock. Absent or `true` = editable. `false` or a string = locked: the object can be
   * selected, but gets no gizmo, starts no transform session and rejects typed values. A string
   * is the reason shown in the UI. Called at each session start and each typed value.
   */
  canEdit?(objId: string): boolean | string;
}
