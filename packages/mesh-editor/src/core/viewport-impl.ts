/**
 * EditorViewport runtime: picking, transform sessions, gizmo, overlays, history.
 * Contract: API.md §6–§9. The type lives in viewport.ts; this is the class.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Euler,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
} from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createHistory, createSnapshotCommand, type History, type ObjectSnapshot } from './history.js';
import type { EditorHost } from './host.js';
import type { EditMesh, EdgeKey } from './mesh.js';
import type { Transform } from './math.js';
import { editMeshOps } from './ops.js';
import { makeDelta, splitDelta, type SnapCandidate, type SnapFn, type TransformMode } from './snap.js';
import { convertSelection, edgeKey, emptyElements, selectionKey, vertsFor } from './selection-ops.js';
import type { ElementSelection, Selection, SelectMode, SelectOp } from './selection.js';
import type { TransformSession, TypedValue } from './transform.js';
import type { EditorNotice, EditorViewport as EditorViewportType, EditorViewportEvents, EditorViewportOptions, LockedReason } from './viewport.js';

const DEG = Math.PI / 180;
const _v = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();

type HitKind = 'object' | 'vertex' | 'edge' | 'face';
interface Hit {
  objId: string;
  kind: HitKind;
  /** Vertex index, face index, or unused for objects. */
  index: number;
  edge?: EdgeKey;
}

interface Gesture {
  kind: 'gizmo' | 'box' | 'tap';
  id: number;
  x: number;
  y: number;
  shift: boolean;
  ctrl: boolean;
  touch: boolean;
  hit?: Hit | null;
}

interface StartState {
  mesh: EditMesh | null;
  transform: Transform;
  matrixWorld: Matrix4;
  parentWorld: Matrix4;
  verts: number[];
}

function q(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function readTransform(obj: Object3D): Transform {
  return {
    position: [obj.position.x, obj.position.y, obj.position.z],
    quaternion: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w],
    scale: [obj.scale.x, obj.scale.y, obj.scale.z],
  };
}

function cloneMesh(mesh: EditMesh): EditMesh {
  const out: EditMesh = { v: mesh.v.slice(), f: mesh.f.map((face) => face.slice()) };
  if (mesh.fm) out.fm = mesh.fm.slice();
  if (mesh.sm) out.sm = true;
  return out;
}

function snapLinear(linear: Matrix4, kind: 'rotate' | 'scale', step: number): Matrix4 {
  const quat = new Quaternion();
  const scl = new Vector3();
  linear.decompose(new Vector3(), quat, scl);
  if (kind === 'rotate') {
    const eu = new Euler().setFromQuaternion(quat);
    const s = step * DEG;
    eu.x = Math.round(eu.x / s) * s;
    eu.y = Math.round(eu.y / s) * s;
    eu.z = Math.round(eu.z / s) * s;
    quat.setFromEuler(eu);
    return new Matrix4().makeRotationFromQuaternion(quat);
  }
  const snapped = scl.clone();
  snapped.x = Math.round(scl.x / step) * step;
  snapped.y = Math.round(scl.y / step) * step;
  snapped.z = Math.round(scl.z / step) * step;
  if (snapped.x === 0) snapped.x = Math.sign(scl.x) || 1;
  if (snapped.y === 0) snapped.y = Math.sign(scl.y) || 1;
  if (snapped.z === 0) snapped.z = Math.sign(scl.z) || 1;
  return new Matrix4().makeScale(snapped.x, snapped.y, snapped.z);
}

/** Kido defaults: 5 mm grid, 15° rotation, 0.05 scale. Used when no snap is passed. */
export function defaultSnap(c: SnapCandidate): Matrix4 {
  const { t, linear } = splitDelta(c.matrix, c.pivot);
  const step = 0.005;
  t.set(Math.round(t.x / step) * step, Math.round(t.y / step) * step, Math.round(t.z / step) * step);
  let L = linear;
  if (c.mode === 'rotate') L = snapLinear(linear, 'rotate', 15);
  else if (c.mode === 'scale') L = snapLinear(linear, 'scale', 0.05);
  return makeDelta(c.pivot, t, L);
}

function mergeIds<T>(current: readonly T[], picked: readonly T[], op: SelectOp): T[] {
  if (op === 'replace') return [...picked];
  if (op === 'add') {
    const out = [...current];
    for (const id of picked) if (!out.includes(id)) out.push(id);
    return out;
  }
  if (op === 'subtract') {
    const drop = new Set(picked);
    return current.filter((id) => !drop.has(id));
  }
  const out = [...current];
  for (const id of picked) {
    const i = out.indexOf(id);
    if (i >= 0) out.splice(i, 1);
    else out.push(id);
  }
  return out;
}

class DragSession implements TransformSession {
  readonly mode: TransformMode;
  readonly selection: Selection;
  readonly pivot: Vector3;
  active = true;
  readonly matrix = new Matrix4();
  source: 'drag' | 'typed' = 'drag';
  axis: string | null = null;
  space: 'local' | 'world' = 'world';
  invert = false;
  readonly starts = new Map<string, StartState>();

  constructor(private readonly vp: EditorViewport, mode: TransformMode, selection: Selection, pivot: Vector3) {
    this.mode = mode;
    this.selection = selection;
    this.pivot = pivot.clone();
  }

  update(matrix: Matrix4, live = true): void {
    if (!this.active) return;
    const snapped = this.vp.snapOf({
      matrix,
      pivot: this.pivot,
      selection: this.selection,
      mode: this.mode,
      source: this.source,
      axis: this.axis,
      space: this.space,
      invert: this.invert,
    });
    this.matrix.copy(snapped);
    if (!live) return;
    const next = this.evaluate(snapped);
    for (const [id, snap] of Object.entries(next)) {
      if (!snap) continue;
      if (this.selection.mode === 'object') this.vp.host.commitTransform(id, snap.transform, { live: true });
      else this.vp.host.commit(id, snap.mesh, { live: true });
    }
    this.vp.afterLiveEdit();
    this.vp.emit('transform', this);
  }

  /** Post-snap meshes / transforms for the current matrix, from the start snapshot. */
  evaluate(matrix: Matrix4): Record<string, ObjectSnapshot | null> {
    const out: Record<string, ObjectSnapshot | null> = {};
    for (const [id, start] of this.starts) {
      if (this.selection.mode === 'object') {
        const world = matrix.clone().multiply(start.matrixWorld);
        const local = start.parentWorld.clone().invert().multiply(world);
        local.decompose(_v, _q, _s);
        out[id] = {
          mesh: start.mesh ? cloneMesh(start.mesh) : { v: [], f: [] },
          transform: {
            position: [q(_v.x), q(_v.y), q(_v.z)],
            quaternion: [_q.x, _q.y, _q.z, _q.w],
            scale: [_s.x, _s.y, _s.z],
          },
        };
      } else if (start.mesh && start.verts.length) {
        const invW = start.matrixWorld.clone().invert();
        const local = invW.multiply(matrix).multiply(start.matrixWorld);
        out[id] = { mesh: editMeshOps.transformVerts(start.mesh, start.verts, local.elements), transform: { ...start.transform, position: [...start.transform.position], quaternion: [...start.transform.quaternion], scale: [...start.transform.scale] } };
      } else {
        out[id] = { mesh: start.mesh ? cloneMesh(start.mesh) : { v: [], f: [] }, transform: { ...start.transform, position: [...start.transform.position], quaternion: [...start.transform.quaternion], scale: [...start.transform.scale] } };
      }
    }
    return out;
  }

  end(): void {
    if (!this.active) return;
    this.active = false;
    const before: Record<string, ObjectSnapshot | null> = {};
    for (const [id, start] of this.starts) {
      before[id] = { mesh: start.mesh ? cloneMesh(start.mesh) : { v: [], f: [] }, transform: { position: [...start.transform.position], quaternion: [...start.transform.quaternion], scale: [...start.transform.scale] } };
    }
    const after = this.evaluate(this.matrix);
    const full = this.vp.selection;
    const label = this.source === 'typed' ? `typed:${this.mode}:${this.axis ?? ''}` : this.mode;
    this.vp.history.push(createSnapshotCommand({
      label: label[0] ? label[0].toUpperCase() + label.slice(1) : label,
      before,
      after,
      selectionBefore: full,
      selectionAfter: full,
      host: this.vp.host,
      applySelection: (sel) => this.vp.setSelection(sel),
      ...(this.source === 'typed' ? { mergeKey: `typed:${this.mode}:${this.axis ?? ''}:${this.selection.active ?? ''}` } : {}),
    }));
    this.vp.emit('transform', this);
    this.vp.finishSession();
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    for (const [id, start] of this.starts) {
      if (this.selection.mode === 'object') this.vp.host.commitTransform(id, start.transform, { live: true });
      else if (start.mesh) this.vp.host.commit(id, start.mesh, { live: true });
    }
    this.vp.finishSession();
  }
}

interface OverlaySlot {
  group: Group;
  lines: LineSegments;
  points: Points;
  faces: Mesh;
}

export class EditorViewport implements EditorViewportType {
  readonly options: Readonly<EditorViewportOptions>;
  readonly history: History;
  readonly host: EditorHost;
  multiSelect = false;
  boxSelect = false;
  xray = false;
  private camera: Camera;
  private readonly dom: HTMLElement;
  private readonly scene: EditorViewportOptions['scene'];
  private readonly overlay = new Group();
  private readonly controls: TransformControls;
  private readonly helper: Object3D;
  private readonly proxy = new Object3D();
  private readonly raycaster = new Raycaster();
  private readonly slots = new Map<string, OverlaySlot>();
  private readonly lineMat = new LineBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private readonly pointMat = new PointsMaterial({ vertexColors: true, size: 9, sizeAttenuation: false });
  private readonly faceMat = new MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  private listeners: { [K in keyof EditorViewportEvents]?: Set<(event: EditorViewportEvents[K]) => void> } = {};
  private _attached = false;
  private _disposed = false;
  private _selectMode: SelectMode = 'object';
  private _transformMode: TransformMode | null = null;
  private _space: 'local' | 'world' = 'world';
  private _selection: Selection = { mode: 'object', objects: [], active: null, elements: {} };
  private _session: DragSession | null = null;
  private _snap: SnapFn | null;
  private gesture: Gesture | null = null;
  private pointerInvert = false;
  private proxyStart = new Matrix4();
  private suppressGizmo = false;
  private boxEl: HTMLElement | null = null;
  private readonly tapSlop: number;
  private readonly pickRadius: number;
  private noticeForced = false;
  /** Same event can arrive on `domElement` and on `window` (capture retarget). */
  private seenEvent: Event | null = null;
  private windowArmed = false;

  constructor(options: EditorViewportOptions) {
    this.options = options;
    this.host = options.host;
    this.camera = options.camera;
    this.dom = options.domElement;
    this.scene = options.scene;
    this.history = options.history ?? createHistory();
    this._snap = options.snap === undefined ? defaultSnap : options.snap;
    this.tapSlop = options.tapSlopPx ?? 8;
    this.pickRadius = options.pickRadiusPx ?? 22;
    this.overlay.name = 'mesh-editor-overlay';
    this.overlay.userData.meshEditorOverlay = true;
    this.proxy.name = 'mesh-editor-proxy';
    this.controls = new TransformControls(this.camera);
    this.controls.setSize(0.7);
    this.helper = this.controls.getHelper();
    this.helper.userData.meshEditorOverlay = true;
    this.overlay.add(this.proxy);
    this.overlay.add(this.helper);
    this.controls.addEventListener('objectChange', this.onGizmoChange);
    this.history.onChange(() => this.emit('history', { canUndo: this.history.canUndo, canRedo: this.history.canRedo }));
  }

  get attached(): boolean {
    return this._attached;
  }
  get selectMode(): SelectMode {
    return this._selectMode;
  }
  get transformMode(): TransformMode | null {
    return this._transformMode;
  }
  get selection(): Selection {
    return this._selection;
  }
  get session(): TransformSession | null {
    return this._session;
  }
  get space(): 'local' | 'world' {
    return this._space;
  }
  set space(value: 'local' | 'world') {
    this._space = value;
    this.controls.setSpace(value);
    if (!this._session) this.refreshGizmo();
    this.host.requestRender();
  }

  /** Follow a Threlte camera store without changing the public options object. */
  setCamera(camera: Camera): void {
    this.camera = camera;
    this.controls.camera = camera;
  }

  /** Rebuild highlights after the host changes a mesh outside a drag. */
  refresh(): void {
    if (this._disposed) return;
    this.refreshGizmo();
    this.refreshOverlays();
    this.host.requestRender();
  }

  snapOf(c: SnapCandidate): Matrix4 {
    return this._snap ? this._snap(c) : c.matrix;
  }

  attach(): void {
    if (this._attached || this._disposed) return;
    this.scene.add(this.overlay);
    this.dom.addEventListener('pointerdown', this.onDown, { capture: true });
    this.dom.addEventListener('pointermove', this.onMove, { capture: true });
    this.dom.addEventListener('pointerup', this.onUp, { capture: true });
    this.dom.addEventListener('pointercancel', this.onCancel, { capture: true });
    const root = typeof window !== 'undefined' ? window : undefined;
    root?.addEventListener('keydown', this.onKey, { capture: true });
    this._attached = true;
    this.refresh();
  }

  detach(): void {
    if (!this._attached) return;
    this.cancelGesture();
    this.dom.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.dom.removeEventListener('pointermove', this.onMove, { capture: true });
    this.dom.removeEventListener('pointerup', this.onUp, { capture: true });
    this.dom.removeEventListener('pointercancel', this.onCancel, { capture: true });
    this.disarmWindow();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, { capture: true });
    this.scene.remove(this.overlay);
    this.removeBox();
    this._attached = false;
    this.host.setNavigationEnabled(true);
  }

  dispose(): void {
    if (this._disposed) return;
    this.detach();
    this._disposed = true;
    this.controls.removeEventListener('objectChange', this.onGizmoChange);
    if (!this.controls.domElement) {
      this.controls.domElement = { addEventListener() {}, removeEventListener() {}, style: {} } as unknown as HTMLElement;
    }
    this.controls.dispose();
    this.lineMat.dispose();
    this.pointMat.dispose();
    this.faceMat.dispose();
    for (const slot of this.slots.values()) this.disposeSlot(slot);
    this.slots.clear();
  }

  setSelectMode(mode: SelectMode): void {
    if (mode === this._selectMode) return;
    this.publish(convertSelection(this._selection, mode, (id) => this.host.getMesh(id)));
  }

  setTransformMode(mode: TransformMode | null): void {
    if (mode === this._transformMode) return;
    this._transformMode = mode;
    if (mode) this.controls.setMode(mode);
    this.emit('modechange', { select: this._selectMode, transform: mode });
    if (mode) this.classify(true);
    this.refreshGizmo();
    this.host.requestRender();
  }

  setSelection(selection: Selection): void {
    this.publish(selection);
  }

  setSnap(snap: SnapFn | null): void {
    this._snap = snap;
  }

  selectAll(): void {
    const mode = this._selectMode;
    if (mode === 'object') {
      const objects = this.host.listObjects();
      this.publish({ mode, objects, active: objects.at(-1) ?? null, elements: {} });
      return;
    }
    const elements: Record<string, ElementSelection> = {};
    const objects: string[] = [];
    for (const id of this.host.listObjects()) {
      const mesh = this.host.getMesh(id);
      if (!mesh) continue;
      objects.push(id);
      if (mode === 'vertex') elements[id] = { verts: Array.from({ length: mesh.v.length / 3 }, (_, i) => i), edges: [], faces: [] };
      else if (mode === 'edge') elements[id] = { verts: [], edges: editMeshOps.edgesOf(mesh).map(([a, b]) => edgeKey(a, b)), faces: [] };
      else elements[id] = { verts: [], edges: [], faces: mesh.f.map((_, i) => i) };
    }
    this.publish({ mode, objects, active: objects.at(-1) ?? null, elements });
  }

  selectNone(): void {
    this.publish({ mode: this._selectMode, objects: [], active: null, elements: {} });
  }

  selectBox(rect: { x: number; y: number; width: number; height: number }, op: SelectOp = 'replace'): void {
    const rectN = { x0: rect.x, y0: rect.y, x1: rect.x + rect.width, y1: rect.y + rect.height };
    const hits = this.boxHits(rectN);
    this.applyHits(hits, op);
  }

  applyTyped(value: TypedValue): void {
    this.noticeForced = true;
    const session = this.beginSession(value.kind === 'rotation' ? 'rotate' : value.kind === 'scale' || value.kind === 'size' ? 'scale' : 'translate', 'typed');
    this.noticeForced = false;
    if (!session) return;
    session.source = 'typed';
    session.axis = value.axis === 0 ? 'X' : value.axis === 1 ? 'Y' : 'Z';
    session.space = value.space ?? (this._selection.mode === 'object' ? 'local' : 'world');
    const matrix = this.matrixForTyped(value, session);
    session.update(matrix, false);
    session.end();
  }

  on<K extends keyof EditorViewportEvents>(type: K, listener: (event: EditorViewportEvents[K]) => void): () => void {
    let set = this.listeners[type] as Set<(event: EditorViewportEvents[K]) => void> | undefined;
    if (!set) {
      set = new Set();
      (this.listeners as Record<K, Set<(event: EditorViewportEvents[K]) => void>>)[type] = set;
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof EditorViewportEvents>(type: K, event: EditorViewportEvents[K]): void {
    const set = this.listeners[type] as Set<(event: EditorViewportEvents[K]) => void> | undefined;
    set?.forEach((fn) => fn(event));
  }

  afterLiveEdit(): void {
    this.refreshOverlays();
    this.host.requestRender();
  }

  finishSession(): void {
    this._session = null;
    this.suppressGizmo = true;
    this.controls.reset();
    this.suppressGizmo = false;
    this.refreshGizmo();
    this.refreshOverlays();
    this.host.requestRender();
  }

  // ---------------------------------------------------------------- pointer

  private onDown = (event: PointerEvent): void => {
    if (!event.isPrimary) {
      this.cancelGesture();
      return;
    }
    if (event.button !== 0) return;
    const p = this.localOf(event);
    this.pointerInvert = event.ctrlKey || event.metaKey;
    this.overlay.updateMatrixWorld(true);
    if (this._transformMode && this.hoverGizmo(event)) {
      event.stopPropagation();
      const session = this.beginSession(this._transformMode, 'drag');
      if (session) {
        this.host.setNavigationEnabled(false);
        this.controls.pointerDown(this.ndcEvent(event));
        this.gesture = { kind: 'gizmo', id: event.pointerId, x: p.x, y: p.y, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, touch: event.pointerType === 'touch' };
        this.armWindow();
        this.tryCapture(event);
      }
      return;
    }
    const hit = this.pickAt(p.x, p.y, event.pointerType === 'touch');
    const empty = hit == null;
    if (empty && (event.altKey || event.shiftKey || this.boxSelect)) {
      event.stopPropagation();
      this.host.setNavigationEnabled(false);
      this.gesture = { kind: 'box', id: event.pointerId, x: p.x, y: p.y, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, touch: event.pointerType === 'touch' };
      this.armWindow();
      this.tryCapture(event);
      return;
    }
    this.gesture = { kind: 'tap', id: event.pointerId, x: p.x, y: p.y, shift: event.shiftKey, ctrl: event.ctrlKey || event.metaKey, touch: event.pointerType === 'touch', hit };
    this.armWindow();
    this.tryCapture(event);
  };

  private onMove = (event: PointerEvent): void => {
    if (!this.dedupe(event)) return;
    if (!event.isPrimary) return;
    const g = this.gesture;
    if (!g || event.pointerId !== g.id) return;
    this.pointerInvert = event.ctrlKey || event.metaKey;
    if (this._session) this._session.invert = this.pointerInvert;
    if (g.kind === 'gizmo') {
      this.controls.pointerMove(this.ndcEvent(event));
      return;
    }
    if (g.kind === 'box') {
      const p = this.localOf(event);
      if (Math.hypot(p.x - g.x, p.y - g.y) > this.tapSlop) this.showBox(g, p);
    }
  };

  private onUp = (event: PointerEvent): void => {
    if (!this.dedupe(event)) return;
    const g = this.gesture;
    if (!g || event.pointerId !== g.id) return;
    const p = this.localOf(event);
    const moved = Math.hypot(p.x - g.x, p.y - g.y);
    if (g.kind === 'gizmo') {
      this.controls.pointerUp(this.ndcEvent(event));
      this._session?.end();
    } else if (g.kind === 'box') {
      if (moved > this.tapSlop) {
        const op: SelectOp = g.shift || (this.boxSelect && this.multiSelect) ? 'add' : 'replace';
        this.selectBox({ x: Math.min(g.x, p.x), y: Math.min(g.y, p.y), width: Math.abs(p.x - g.x), height: Math.abs(p.y - g.y) }, op);
      } else if (!g.shift && !g.ctrl && !this.multiSelect) this.selectNone();
    } else if (moved <= this.tapSlop) {
      const op = g.ctrl ? 'toggle' : this.multiSelect ? 'toggle' : g.shift ? 'add' : 'replace';
      if (g.hit) this.applyHits([g.hit], op);
      else if (op === 'replace') this.selectNone();
    }
    this.endGesture();
  };

  private onCancel = (event: PointerEvent): void => {
    if (!this.dedupe(event)) return;
    if (this.gesture && event.pointerId === this.gesture.id) this.cancelGesture();
  };

  private onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this._session?.active) return;
    event.stopPropagation();
    this.cancelGesture();
  };

  private onGizmoChange = (): void => {
    if (this.suppressGizmo || !this._session?.active) return;
    this.proxy.updateMatrixWorld(true);
    const delta = this.proxy.matrixWorld.clone().multiply(this.proxyStart.clone().invert());
    this._session.invert = this.pointerInvert;
    this._session.update(delta, true);
  };

  private endGesture(): void {
    this.gesture = null;
    this.disarmWindow();
    this.removeBox();
    this.host.setNavigationEnabled(true);
  }

  private cancelGesture(): void {
    if (this.gesture?.kind === 'gizmo') {
      this.suppressGizmo = true;
      this.controls.pointerUp(null);
      this.suppressGizmo = false;
      this._session?.cancel();
    }
    this.endGesture();
  }

  private tryCapture(event: PointerEvent): void {
    try {
      this.dom.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic events have nothing to capture */
    }
  }

  /**
   * Threlte's OrbitControls listens on the canvas parent and calls
   * setPointerCapture there, so pointerup never reaches `domElement`.
   * Follow the gesture from `window` as well. The same event object can
   * then be delivered twice; `dedupe` keeps one handling.
   */
  private armWindow(): void {
    if (this.windowArmed || typeof window === 'undefined') return;
    window.addEventListener('pointermove', this.onMove, { capture: true });
    window.addEventListener('pointerup', this.onUp, { capture: true });
    window.addEventListener('pointercancel', this.onCancel, { capture: true });
    this.windowArmed = true;
  }

  private disarmWindow(): void {
    if (!this.windowArmed || typeof window === 'undefined') return;
    window.removeEventListener('pointermove', this.onMove, { capture: true });
    window.removeEventListener('pointerup', this.onUp, { capture: true });
    window.removeEventListener('pointercancel', this.onCancel, { capture: true });
    this.windowArmed = false;
  }

  private dedupe(event: Event): boolean {
    if (this.seenEvent === event) return false;
    this.seenEvent = event;
    return true;
  }

  // ---------------------------------------------------------------- picking

  private localOf(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.dom.getBoundingClientRect();
    return { x: event.clientX - r.left, y: event.clientY - r.top };
  }

  private ndcEvent(event: { clientX: number; clientY: number; button?: number }): PointerEvent {
    const r = this.dom.getBoundingClientRect();
    const w = r.width || 1;
    const h = r.height || 1;
    return { x: ((event.clientX - r.left) / w) * 2 - 1, y: -((event.clientY - r.top) / h) * 2 + 1, button: event.button ?? 0 } as unknown as PointerEvent;
  }

  private ndc(x: number, y: number): Vector2 {
    const r = this.dom.getBoundingClientRect();
    return new Vector2((x / (r.width || 1)) * 2 - 1, -(y / (r.height || 1)) * 2 + 1);
  }

  private project(world: Vector3): { x: number; y: number; z: number } {
    const r = this.dom.getBoundingClientRect();
    _v.copy(world).project(this.camera);
    return { x: ((_v.x + 1) / 2) * r.width, y: ((1 - _v.y) / 2) * r.height, z: _v.z };
  }

  private hoverGizmo(event: PointerEvent): boolean {
    if (!this.controls.object) return false;
    this.overlay.updateMatrixWorld(true);
    this.controls.pointerHover(this.ndcEvent(event));
    return this.controls.axis != null;
  }

  private occluded(world: Vector3): boolean {
    if (this.xray) return false;
    this.camera.updateMatrixWorld();
    const cam = this.camera.getWorldPosition(new Vector3());
    const dir = world.clone().sub(cam);
    const dist = dir.length();
    if (dist < 1e-8) return false;
    this.raycaster.set(cam, dir.multiplyScalar(1 / dist));
    const roots = this.scene.children.filter((child) => child !== this.overlay);
    const hits = this.raycaster.intersectObjects(roots, true);
    for (const hit of hits) {
      if (this.isOverlay(hit.object) || !hit.object.visible) continue;
      const mesh = hit.object as Mesh;
      if (!mesh.isMesh) continue;
      if (hit.distance < dist - 0.004) return true;
    }
    return false;
  }

  private isOverlay(obj: Object3D): boolean {
    let cur: Object3D | null = obj;
    while (cur) {
      if (cur === this.overlay || cur.userData.meshEditorOverlay) return true;
      cur = cur.parent;
    }
    return false;
  }

  private pickAt(x: number, y: number, _touch: boolean): Hit | null {
    if (this._selectMode === 'object') return this.pickObject(x, y);
    if (this._selectMode === 'face') return this.pickFace(x, y);
    const radius = this._selectMode === 'edge' ? this.pickRadius * 0.7 : this.pickRadius;
    const rect = this.dom.getBoundingClientRect();
    void rect;
    const cands: { hit: Hit; d: number; z: number; world: Vector3 }[] = [];
    for (const id of this.host.listObjects()) {
      const mesh = this.host.getMesh(id);
      const obj = this.host.getObject3D(id);
      if (!mesh || !obj) continue;
      obj.updateMatrixWorld(true);
      if (this._selectMode === 'vertex') {
        for (let i = 0; i < mesh.v.length / 3; i++) {
          const world = new Vector3(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0).applyMatrix4(obj.matrixWorld);
          const s = this.project(world);
          const d = Math.hypot(s.x - x, s.y - y);
          if (d <= radius && s.z < 1) cands.push({ hit: { objId: id, kind: 'vertex', index: i }, d, z: s.z, world });
        }
      } else {
        for (const [a, b] of editMeshOps.edgesOf(mesh)) {
          const wa = new Vector3(mesh.v[3 * a] ?? 0, mesh.v[3 * a + 1] ?? 0, mesh.v[3 * a + 2] ?? 0).applyMatrix4(obj.matrixWorld);
          const wb = new Vector3(mesh.v[3 * b] ?? 0, mesh.v[3 * b + 1] ?? 0, mesh.v[3 * b + 2] ?? 0).applyMatrix4(obj.matrixWorld);
          const sa = this.project(wa);
          const sb = this.project(wb);
          const d = segmentDistance(x, y, sa, sb);
          if (d <= radius) cands.push({ hit: { objId: id, kind: 'edge', index: a, edge: edgeKey(a, b) }, d, z: (sa.z + sb.z) / 2, world: wa.clone().add(wb).multiplyScalar(0.5) });
        }
      }
    }
    const visible = cands.filter((c) => !this.occluded(c.world));
    visible.sort((a, b) => a.d - b.d || a.z - b.z);
    return visible[0]?.hit ?? null;
  }

  private pickObject(x: number, y: number): Hit | null {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    let best: { hit: Hit; dist: number } | null = null;
    for (const id of this.host.listObjects()) {
      const obj = this.host.getObject3D(id);
      if (!obj) continue;
      const hits = this.raycaster.intersectObject(obj, true).filter((h) => !this.isOverlay(h.object));
      const hit = hits[0];
      if (hit && (!best || hit.distance < best.dist)) best = { hit: { objId: id, kind: 'object', index: 0 }, dist: hit.distance };
    }
    return best?.hit ?? null;
  }

  private pickFace(x: number, y: number): Hit | null {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    let best: { hit: Hit; dist: number } | null = null;
    for (const id of this.host.listObjects()) {
      if (!this.host.getMesh(id)) continue;
      const obj = this.host.getObject3D(id);
      if (!obj) continue;
      for (const hit of this.raycaster.intersectObject(obj, true)) {
        const face = faceOfHit(hit);
        if (face == null) continue;
        if (!best || hit.distance < best.dist) best = { hit: { objId: id, kind: 'face', index: face }, dist: hit.distance };
      }
    }
    return best?.hit ?? null;
  }

  private boxHits(rect: { x0: number; y0: number; x1: number; y1: number }): Hit[] {
    const hits: Hit[] = [];
    const inside = (world: Vector3) => {
      const s = this.project(world);
      return s.z < 1 && s.x >= rect.x0 && s.x <= rect.x1 && s.y >= rect.y0 && s.y <= rect.y1 && !this.occluded(world);
    };
    for (const id of this.host.listObjects()) {
      const obj = this.host.getObject3D(id);
      if (!obj) continue;
      obj.updateMatrixWorld(true);
      if (this._selectMode === 'object') {
        if (inside(obj.getWorldPosition(new Vector3()))) hits.push({ objId: id, kind: 'object', index: 0 });
        continue;
      }
      const mesh = this.host.getMesh(id);
      if (!mesh) continue;
      const worldOf = (i: number) => new Vector3(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0).applyMatrix4(obj.matrixWorld);
      if (this._selectMode === 'vertex') {
        for (let i = 0; i < mesh.v.length / 3; i++) if (inside(worldOf(i))) hits.push({ objId: id, kind: 'vertex', index: i });
      } else if (this._selectMode === 'edge') {
        for (const [a, b] of editMeshOps.edgesOf(mesh)) if (inside(worldOf(a)) && inside(worldOf(b))) hits.push({ objId: id, kind: 'edge', index: a, edge: edgeKey(a, b) });
      } else {
        mesh.f.forEach((face, fi) => {
          const c = editMeshOps.centroid(mesh, face);
          if (inside(new Vector3(c[0], c[1], c[2]).applyMatrix4(obj.matrixWorld))) hits.push({ objId: id, kind: 'face', index: fi });
        });
      }
    }
    return hits;
  }

  private applyHits(hits: Hit[], op: SelectOp): void {
    const mode = this._selectMode;
    if (mode === 'object') {
      const ids = hits.map((h) => h.objId);
      const cur = this._selection.mode === 'object' ? this._selection.objects : [];
      const objects = mergeIds(cur, ids, op);
      this.publish({ mode, objects, active: hits.at(-1)?.objId ?? objects.at(-1) ?? null, elements: {} });
      return;
    }
    const cur: Record<string, ElementSelection> = {};
    if (this._selection.mode === mode) {
      for (const [id, el] of Object.entries(this._selection.elements)) cur[id] = { verts: el.verts.slice(), edges: el.edges.slice(), faces: el.faces.slice() };
    }
    const grouped = new Map<string, Hit[]>();
    for (const hit of hits) {
      const list = grouped.get(hit.objId);
      if (list) list.push(hit);
      else grouped.set(hit.objId, [hit]);
    }
    const baseIds = op === 'replace' ? [] : Object.keys(cur);
    const nextIds = new Set(baseIds);
    if (op === 'replace') for (const id of Object.keys(cur)) delete cur[id];
    for (const [id, list] of grouped) {
      const el = cur[id] ?? emptyElements();
      if (mode === 'vertex') el.verts = mergeIds(op === 'replace' ? [] : el.verts, list.map((h) => h.index), op === 'replace' ? 'replace' : op);
      else if (mode === 'edge') el.edges = mergeIds(op === 'replace' ? [] : el.edges, list.map((h) => h.edge).filter((e): e is EdgeKey => !!e), op === 'replace' ? 'replace' : op);
      else el.faces = mergeIds(op === 'replace' ? [] : el.faces, list.map((h) => h.index), op === 'replace' ? 'replace' : op);
      const empty = el.verts.length + el.edges.length + el.faces.length === 0;
      if (empty) {
        delete cur[id];
        nextIds.delete(id);
      } else {
        cur[id] = el;
        nextIds.add(id);
      }
    }
    const objects = [...nextIds];
    this.publish({ mode, objects, active: hits.at(-1)?.objId ?? objects.at(-1) ?? null, elements: cur });
  }

  // ---------------------------------------------------------------- transform

  private classify(emitNotice: boolean): { ok: string[]; locked: LockedReason[]; allLocked: boolean } {
    const ids = this._selection.objects;
    const ok: string[] = [];
    const locked: LockedReason[] = [];
    for (const id of ids) {
      const result = this.host.canEdit?.(id);
      if (result === false || typeof result === 'string') locked.push({ objId: id, ...(typeof result === 'string' ? { reason: result } : {}) });
      else ok.push(id);
    }
    const allLocked = ids.length > 0 && ok.length === 0;
    if (emitNotice && locked.length && (this._transformMode != null || this.noticeForced)) {
      const notice: EditorNotice = { kind: 'locked-skipped', count: locked.length, reasons: locked, allLocked };
      this.emit('notice', notice);
    }
    return { ok, locked, allLocked };
  }

  private editableIds(): string[] {
    const { ok } = this.classify(false);
    if (this._selectMode === 'object') return ok.filter((id) => this.host.getObject3D(id));
    return ok.filter((id) => {
      const mesh = this.host.getMesh(id);
      if (!mesh) return false;
      return vertsFor(mesh, this._selectMode, this._selection.elements[id]).length > 0;
    });
  }

  private beginSession(mode: TransformMode, source: 'drag' | 'typed'): DragSession | null {
    const { ok } = this.classify(true);
    const ids = (this._selectMode === 'object' ? ok.filter((id) => this.host.getObject3D(id)) : ok.filter((id) => {
      const mesh = this.host.getMesh(id);
      return !!mesh && vertsFor(mesh, this._selectMode, this._selection.elements[id]).length > 0;
    }));
    if (!ids.length) return null;
    const allowed = new Set(ids);
    const selection: Selection = {
      mode: this._selectMode,
      objects: this._selection.objects.filter((id) => allowed.has(id)),
      active: this._selection.active && allowed.has(this._selection.active) ? this._selection.active : ids.at(-1) ?? null,
      elements: {},
    };
    if (selection.mode !== 'object') {
      for (const id of selection.objects) selection.elements[id] = this._selection.elements[id] ?? emptyElements();
    }
    const pivot = this.pivotFor(selection);
    this.placeProxy(pivot, selection.active);
    this.proxy.updateMatrixWorld(true);
    this.proxyStart.copy(this.proxy.matrixWorld);
    const session = new DragSession(this, mode, selection, pivot);
    session.source = source;
    session.space = this._space;
    for (const id of selection.objects) {
      const obj = this.host.getObject3D(id);
      if (!obj) continue;
      obj.updateMatrixWorld(true);
      const mesh = this.host.getMesh(id);
      session.starts.set(id, {
        mesh: mesh ? cloneMesh(mesh) : null,
        transform: readTransform(obj),
        matrixWorld: obj.matrixWorld.clone(),
        parentWorld: obj.parent ? obj.parent.matrixWorld.clone() : new Matrix4(),
        verts: mesh ? vertsFor(mesh, selection.mode, selection.elements[id]) : [],
      });
    }
    if (!session.starts.size) return null;
    this._session = session;
    return session;
  }

  private pivotFor(selection: Selection): Vector3 {
    const acc = new Vector3();
    let n = 0;
    if (selection.mode === 'object') {
      for (const id of selection.objects) {
        const obj = this.host.getObject3D(id);
        if (!obj) continue;
        acc.add(obj.getWorldPosition(new Vector3()));
        n++;
      }
    } else {
      for (const id of selection.objects) {
        const mesh = this.host.getMesh(id);
        const obj = this.host.getObject3D(id);
        if (!mesh || !obj) continue;
        obj.updateMatrixWorld(true);
        for (const i of vertsFor(mesh, selection.mode, selection.elements[id])) {
          acc.add(new Vector3(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0).applyMatrix4(obj.matrixWorld));
          n++;
        }
      }
    }
    return n ? acc.multiplyScalar(1 / n) : acc;
  }

  private placeProxy(pivot: Vector3, active: string | null): void {
    this.proxy.position.copy(pivot);
    this.proxy.scale.set(1, 1, 1);
    if (this._space === 'local' && active) {
      const obj = this.host.getObject3D(active);
      if (obj) obj.getWorldQuaternion(this.proxy.quaternion);
      else this.proxy.quaternion.identity();
    } else this.proxy.quaternion.identity();
    this.proxy.updateMatrix();
    if (!this.controls.object) this.controls.attach(this.proxy);
    this.controls.setSpace(this._space);
  }

  private matrixForTyped(value: TypedValue, session: DragSession): Matrix4 {
    const space = value.space ?? (session.selection.mode === 'object' ? 'local' : 'world');
    const pivot = session.pivot;
    if (value.kind === 'position' && !(session.selection.mode === 'object' && space === 'local')) {
      const t = new Vector3();
      t.setComponent(value.axis, value.value - pivot.getComponent(value.axis));
      return makeDelta(pivot, t, new Matrix4());
    }
    if (value.kind === 'rotation' && !(session.selection.mode === 'object' && space === 'local')) {
      const eu = new Euler();
      const rad = value.value * DEG;
      if (value.axis === 0) eu.x = rad;
      else if (value.axis === 1) eu.y = rad;
      else eu.z = rad;
      return makeDelta(pivot, new Vector3(), new Matrix4().makeRotationFromEuler(eu));
    }
    if ((value.kind === 'scale' || value.kind === 'size') && !(session.selection.mode === 'object' && space === 'local')) {
      let factor = value.value;
      if (value.kind === 'size') {
        const extent = this.extent(session, value.axis);
        factor = extent > 1e-8 ? value.value / extent : 1;
      }
      const s = new Vector3(1, 1, 1);
      s.setComponent(value.axis, factor);
      return makeDelta(pivot, new Vector3(), new Matrix4().makeScale(s.x, s.y, s.z));
    }
    const id = session.selection.active ?? session.selection.objects[0];
    const start = id ? session.starts.get(id) : undefined;
    const obj = id ? this.host.getObject3D(id) : null;
    if (!start || !obj || !id) return new Matrix4();
    const p = new Vector3().fromArray(start.transform.position);
    const quat = new Quaternion().fromArray(start.transform.quaternion);
    const scl = new Vector3().fromArray(start.transform.scale);
    if (value.kind === 'position') p.setComponent(value.axis, value.value);
    else if (value.kind === 'rotation') {
      const eu = new Euler().setFromQuaternion(quat);
      const rad = value.value * DEG;
      if (value.axis === 0) eu.x = rad;
      else if (value.axis === 1) eu.y = rad;
      else eu.z = rad;
      quat.setFromEuler(eu);
    } else if (value.kind === 'scale') scl.setComponent(value.axis, value.value);
    else {
      const extent = Math.abs(start.matrixWorld.elements[value.axis === 0 ? 0 : value.axis === 1 ? 5 : 10] ?? 1);
      // size along a local axis ≈ scale * current local size; fall back to setting scale so world extent matches
      const cur = this.extent(session, value.axis);
      const next = cur > 1e-8 ? (scl.getComponent(value.axis) * value.value) / cur : value.value;
      void extent;
      scl.setComponent(value.axis, next);
    }
    const local = new Matrix4().compose(p, quat, scl);
    const world = start.parentWorld.clone().multiply(local);
    return world.multiply(start.matrixWorld.clone().invert());
  }

  private extent(session: DragSession, axis: number): number {
    let min = Infinity;
    let max = -Infinity;
    for (const [id, start] of session.starts) {
      if (!start.mesh) continue;
      for (const i of start.verts) {
        const w = new Vector3(start.mesh.v[3 * i] ?? 0, start.mesh.v[3 * i + 1] ?? 0, start.mesh.v[3 * i + 2] ?? 0).applyMatrix4(start.matrixWorld);
        const value = w.getComponent(axis);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
    return max > min ? max - min : 0;
  }

  // ---------------------------------------------------------------- overlays / gizmo

  private refreshGizmo(): void {
    if (this._session?.active) return;
    const ids = this.editableIds();
    if (!this._transformMode || !ids.length) {
      this.controls.detach();
      return;
    }
    const allowed = new Set(ids);
    const selection: Selection = {
      mode: this._selectMode,
      objects: ids,
      active: this._selection.active && allowed.has(this._selection.active) ? this._selection.active : ids.at(-1) ?? null,
      elements: this._selectMode === 'object' ? {} : this._selection.elements,
    };
    this.placeProxy(this.pivotFor(selection), selection.active);
    this.controls.setMode(this._transformMode);
  }

  private refreshOverlays(): void {
    if (this._selectMode === 'object') {
      for (const [id, slot] of this.slots) {
        this.overlay.remove(slot.group);
        this.disposeSlot(slot);
        this.slots.delete(id);
      }
      return;
    }
    const live = new Set(this.host.listObjects());
    for (const id of [...this.slots.keys()]) {
      if (!live.has(id)) {
        const slot = this.slots.get(id);
        if (!slot) continue;
        this.overlay.remove(slot.group);
        this.disposeSlot(slot);
        this.slots.delete(id);
      }
    }
    for (const id of live) {
      const mesh = this.host.getMesh(id);
      const obj = this.host.getObject3D(id);
      if (!mesh || !obj) continue;
      obj.updateMatrixWorld(true);
      let slot = this.slots.get(id);
      if (!slot) {
        slot = this.makeSlot();
        this.slots.set(id, slot);
        this.overlay.add(slot.group);
      }
      slot.group.matrix.copy(obj.matrixWorld);
      slot.group.matrixAutoUpdate = false;
      slot.group.matrixWorldNeedsUpdate = true;
      this.fillSlot(slot, mesh, this._selection.elements[id]);
    }
  }

  private makeSlot(): OverlaySlot {
    const group = new Group();
    group.userData.meshEditorOverlay = true;
    const lines = new LineSegments(new BufferGeometry(), this.lineMat);
    const points = new Points(new BufferGeometry(), this.pointMat);
    const faces = new Mesh(new BufferGeometry(), this.faceMat);
    for (const obj of [lines, points, faces]) {
      obj.userData.meshEditorOverlay = true;
      obj.raycast = () => {};
      group.add(obj);
    }
    lines.renderOrder = 4;
    points.renderOrder = 5;
    faces.renderOrder = 2;
    return { group, lines, points, faces };
  }

  private fillSlot(slot: OverlaySlot, mesh: EditMesh, el: ElementSelection | undefined): void {
    const mode = this._selectMode;
    const selV = new Set(mode === 'vertex' ? el?.verts ?? [] : mode === 'face' ? vertsFor(mesh, 'face', el) : []);
    const selE = new Set(el?.edges ?? []);
    const pos: number[] = [];
    const col: number[] = [];
    for (const [a, b] of editMeshOps.edgesOf(mesh)) {
      const on = mode === 'edge' ? selE.has(edgeKey(a, b)) : selV.has(a) && selV.has(b);
      pos.push(mesh.v[3 * a] ?? 0, mesh.v[3 * a + 1] ?? 0, mesh.v[3 * a + 2] ?? 0, mesh.v[3 * b] ?? 0, mesh.v[3 * b + 1] ?? 0, mesh.v[3 * b + 2] ?? 0);
      const c = on ? [1, 0.6, 0.15] : [0.08, 0.12, 0.18];
      col.push(...c, ...c);
    }
    this.replaceGeo(slot.lines, pos, col);
    if (mode === 'vertex') {
      const colors: number[] = [];
      const chosen = new Set(el?.verts ?? []);
      for (let i = 0; i < mesh.v.length / 3; i++) colors.push(...(chosen.has(i) ? [1, 0.55, 0.1] : [0.05, 0.07, 0.1]));
      slot.points.visible = true;
      slot.points.geometry.dispose();
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(mesh.v, 3));
      g.setAttribute('color', new Float32BufferAttribute(colors, 3));
      slot.points.geometry = g;
    } else slot.points.visible = false;
    if (mode === 'face' && el?.faces.length) {
      const fp: number[] = [];
      for (const fi of el.faces) {
        const face = mesh.f[fi];
        if (!face) continue;
        for (let k = 1; k < face.length - 1; k++) {
          for (const i of [face[0], face[k], face[k + 1]]) {
            if (i === undefined) continue;
            fp.push(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0);
          }
        }
      }
      slot.faces.visible = fp.length > 0;
      slot.faces.geometry.dispose();
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(fp, 3));
      g.computeVertexNormals();
      slot.faces.geometry = g;
    } else slot.faces.visible = false;
  }

  private replaceGeo(lines: LineSegments, pos: number[], col: number[]): void {
    lines.geometry.dispose();
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    lines.geometry = g;
  }

  private disposeSlot(slot: OverlaySlot): void {
    slot.lines.geometry.dispose();
    slot.points.geometry.dispose();
    slot.faces.geometry.dispose();
  }

  private publish(selection: Selection): void {
    if (this._disposed) {
      this._selectMode = selection.mode;
      this._selection = selection;
      this.host.onSelectionChange(selection);
      return;
    }
    if (selectionKey(selection) === selectionKey(this._selection) && selection.mode === this._selectMode) return;
    const modeChanged = selection.mode !== this._selectMode;
    this._selectMode = selection.mode;
    this._selection = selection;
    this.host.onSelectionChange(selection);
    this.emit('selectionchange', selection);
    if (modeChanged) this.emit('modechange', { select: selection.mode, transform: this._transformMode });
    if (this._transformMode) this.classify(true);
    this.refreshGizmo();
    this.refreshOverlays();
    this.host.requestRender();
  }

  private showBox(g: Gesture, p: { x: number; y: number }): void {
    const el = this.ensureBox();
    if (!el) return;
    const r = this.dom.getBoundingClientRect();
    const x0 = Math.min(g.x, p.x);
    const y0 = Math.min(g.y, p.y);
    el.style.left = `${r.left + x0}px`;
    el.style.top = `${r.top + y0}px`;
    el.style.width = `${Math.abs(p.x - g.x)}px`;
    el.style.height = `${Math.abs(p.y - g.y)}px`;
    el.style.display = 'block';
  }

  private ensureBox(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    if (!this.boxEl) {
      const el = document.createElement('div');
      el.dataset.testid = 'box-select';
      el.style.cssText = 'position:fixed;border:1px dashed #ffb35c;background:rgba(255,154,60,.12);pointer-events:none;z-index:30;display:none';
      document.body.appendChild(el);
      this.boxEl = el;
    }
    return this.boxEl;
  }

  private removeBox(): void {
    if (this.boxEl) this.boxEl.style.display = 'none';
  }
}

function segmentDistance(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function faceOfHit(hit: Intersection): number | null {
  const tri = (hit.object as Mesh).geometry?.userData?.triFace as number[] | undefined;
  if (!tri || hit.faceIndex == null) return null;
  return tri[hit.faceIndex] ?? null;
}
