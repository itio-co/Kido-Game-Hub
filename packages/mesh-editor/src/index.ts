/**
 * @itio/mesh-editor core. Contract: API.md (Agreed v1).
 * Runtime: mesh ops, viewport, history, and the snap composition helpers.
 * Snapping providers, camera match, GLB import and the Svelte panels stay stubs.
 */
export type * from './core/math.js';
export type * from './core/mesh.js';
export type * from './core/document.js';
export type * from './core/edits.js';
export type * from './core/selection.js';
export type * from './core/host.js';
export type * from './core/snap.js';
export { composeSnaps, splitDelta, makeDelta, GEOMETRIC_SNAP_KINDS } from './core/snap.js';
export type * from './core/transform.js';
export { createHistory, createSnapshotCommand } from './core/history.js';
export type * from './core/history.js';
export type * from './core/viewport.js';
/** The viewport contract (no private fields). The class export shares the name `EditorViewport`. */
export type { EditorViewport as ViewportApi } from './core/viewport.js';
export { EditorViewport } from './core/viewport-impl.js';
export { editMeshOps } from './core/ops.js';
export type { CameraMatch } from './camera-match/index.js';
