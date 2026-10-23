/**
 * @itio/mesh-editor core. Contract: API.md (Agreed v1). Mostly types in v0.0.1; the only
 * runtime exports are the snap composition helpers.
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
export type * from './core/history.js';
export type * from './core/viewport.js';
export type { CameraMatch } from './camera-match/index.js';
