import type * as THREE from 'three';
import type { History } from './history.js';
import type { EditorHost } from './host.js';
import type { SelectMode, Selection, SelectOp } from './selection.js';
import type { SnapFn, TransformMode } from './snap.js';
import type { TransformSession, TypedValue } from './transform.js';

export interface EditorViewportOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Element that receives pointer events (usually the renderer canvas). */
  domElement: HTMLElement;
  host: EditorHost;
  /** Default: grid 5 mm + angle 15° (Kido defaults). */
  snap?: SnapFn;
  /** Default: a new snapshot History. Pass one to share undo with the app. */
  history?: History;
  /** Tap vs drag threshold in CSS px. Default 8 (same as the Kido editor). */
  tapSlopPx?: number;
  /** Screen-space pick radius for vertices in CSS px. Default 22 (touch). Edges use 0.7 × this. */
  pickRadiusPx?: number;
}

export interface EditorViewportEvents {
  selectionchange: Selection;
  modechange: { select: SelectMode; transform: TransformMode | null };
  /** Fired after every live update and on end; carries the session. */
  transform: TransformSession;
  history: { canUndo: boolean; canRedo: boolean };
}

/**
 * Imperative editor bound to an existing three.js scene. Construct, then `attach()`.
 *
 * Contract:
 * - Listeners are added to `domElement` in the capture phase on `attach()` and removed on
 *   `detach()`. Events from non-primary pointers (`!event.isPrimary`, i.e. 2nd finger) are
 *   ignored so pinch / two-finger orbit still reach the camera controls; a 2nd finger during a
 *   drag cancels the session.
 * - When a pointerdown hits the gizmo or starts a box select, the viewport calls
 *   `host.setNavigationEnabled(false)` and `stopPropagation()`; it re-enables on pointerup /
 *   cancel. Taps on empty space are not swallowed (camera controls still see them).
 * - No render loop: after any visible change it calls `host.requestRender()`.
 * - Overlays (gizmo, vertex dots, edge lines, box rect) are added under one Group in `scene`
 *   on attach, removed on detach, and never exported.
 */
export interface EditorViewport {
  readonly options: Readonly<EditorViewportOptions>;
  readonly attached: boolean;
  attach(): void;
  detach(): void;
  /** detach() + dispose overlays / gizmo. The viewport cannot be reattached. */
  dispose(): void;

  // ---- modes ----
  readonly selectMode: SelectMode;
  setSelectMode(mode: SelectMode): void;
  /** null = select only (no gizmo). */
  readonly transformMode: TransformMode | null;
  setTransformMode(mode: TransformMode | null): void;
  /** Gizmo orientation. */
  space: 'local' | 'world';

  // ---- selection ----
  readonly selection: Selection;
  setSelection(selection: Selection): void;
  /**
   * Tap pick. Desktop: Shift = add, Ctrl/Cmd = toggle. Touch: `multiSelect` makes taps toggle.
   */
  multiSelect: boolean;
  /**
   * When on, a drag that starts on empty space draws a box (desktop and touch). Regardless of
   * this flag, Alt+drag (replace) and Shift+drag (add) on empty space also box-select.
   */
  boxSelect: boolean;
  /** Programmatic box select in CSS px relative to domElement. Occluded elements are skipped unless `xray`. */
  selectBox(rect: { x: number; y: number; width: number; height: number }, op?: SelectOp): void;
  selectAll(): void;
  selectNone(): void;
  /** See-through picking: include back-facing / occluded elements. Default false. */
  xray: boolean;

  // ---- transform ----
  setSnap(snap: SnapFn | null): void;
  /** Same path as a gizmo drag: snap → live commit → one final commit + one undo step. */
  applyTyped(value: TypedValue): void;
  readonly session: TransformSession | null;
  readonly history: History;

  /** Returns an unsubscribe function. */
  on<K extends keyof EditorViewportEvents>(type: K, listener: (event: EditorViewportEvents[K]) => void): () => void;
}

/** Constructor shape of the runtime class: `new EditorViewport(options)`. */
export interface EditorViewportConstructor {
  new (options: EditorViewportOptions): EditorViewport;
}
