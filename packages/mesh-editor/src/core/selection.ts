import type { EdgeKey } from './mesh.js';

export type SelectMode = 'object' | 'vertex' | 'edge' | 'face';

/** Element selection inside one object. Indices refer to that object's current EditMesh. */
export interface ElementSelection {
  verts: number[];
  /** Sorted pairs as keys, `"a-b"` with a < b. */
  edges: EdgeKey[];
  faces: number[];
}

/**
 * Selection model. Immutable value: every change produces a new object and is reported
 * through `EditorHost.onSelectionChange`.
 *
 * - `object` mode: `objects` lists selected object ids; `elements` is empty.
 * - element modes: `objects` lists objects being edited (multi-object edit allowed);
 *   `elements[objId]` holds that object's selection in the current mode only
 *   (switching mode converts: verts → edges/faces fully enclosed, faces → their verts, …).
 * - `active` is the last-clicked object (gizmo orientation in local space, typed values target it).
 */
export interface Selection {
  mode: SelectMode;
  objects: string[];
  active: string | null;
  elements: Record<string, ElementSelection>;
}

/** How a pick merges with the existing selection. */
export type SelectOp = 'replace' | 'add' | 'subtract' | 'toggle';
