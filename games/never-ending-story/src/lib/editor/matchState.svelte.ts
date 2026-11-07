import type { ShowcaseAsset } from '../showcaseAssets';
import { FORMAT_MATCH, stableStringify } from './editorFilesCore.mjs';
import {
  dehom,
  fromBlenderEulerDeg,
  mulMM,
  transpose,
  blenderEulerDeg,
  mulMV,
  project,
  refine,
  rmsErrors,
  solveFull,
  solvePosition,
  sub,
  turnAround,
  vanishingPoint,
  type Axis,
  type Cam,
  type GuideLine,
  type PointPair,
  type V2,
  type V3,
  type M3,
} from './camMath';
import { blenderValues, camFromMatched, camJson, focalFromLens, fullExport, hfovDeg, lensMm, type ViewRect } from './cameraMatch';
import type { DisplayMode } from './modelEditor';
import { T } from './strings';
import { t } from '../i18n/core';
import { camToObject, camToWorld, placeToLocal, type Placement } from './placement';
import { anchorCam, axisScreenDir, depthOf, flipAxisR, keepAnchorAt, originCandidates, snapOrigin, type OriginCandidate, type OriginSeg } from './originMatch';
import { frameWindow, FOCUS_PAD, type Box2 } from './viewFrame';
import { jointMembers, linkEnds, removeLineLinks, unlinkEnd, type EndRef } from './guideSnap';
import { addMasterFlag, applyMasterIds, ensureMasters, master2Of, masterIds, masterOf, masterPairAngle, mastersNearlyParallel, parseMasterMap, promoteMaster, removeMasterFlag, setMaster2Flag, setMasterFlag, type MasterMap } from './masterLine';
import { classifySegments, detectLinesChunked, type AxisPredictor } from './lineDetect';
import { alignLine, edgeMapFromRGBA, edgeOverlayRGBA, refineLine, type EdgeAlign, type EdgeMap } from './edgeAlign';
import { consolidate as consolidateLines, fitAxes, parallelSuggestion, type Frame, type VpFit, type VpMode, type VpModes } from './vpFit';
import {
  agreement as agreementOf,
  camToCrop,
  camToFull,
  fullCentreInCrop,
  GROUP_NAMES,
  lineToCrop,
  lineToFull,
  migrateV1Lines,
  toCrop,
  toFull,
  pruneLinks,
  rotZ,
  solveJoint,
  type Agreement,
  type CropT,
  type GroupedLine,
  type LineGroup,
} from './roomMatch';

export type ImageChoice = 'crop' | 'wide';
export type PrincipalMode = 'center' | 'vp3' | 'free';
export type PickStep = { pairId: number; want: 'model' | 'image' } | null;

type Saved = {
  /** 1 = one list of lines in crop px; 2 = grouped lines in FULL-image px (+ crop transform). */
  v: 1 | 2;
  cam: Cam;
  lines: (GuideLine & { group?: LineGroup })[];
  /** v2: crop → full transform the lines were stored with. */
  crop?: CropT;
  /** Master line id per axis per group (missing → first line of the axis; see masterLine.ts). */
  master?: Partial<MasterMap> | null;
  /** v2: faint other-group lines shown. */
  ghost?: boolean;
  /** v2: full rays (T.groups.rays). */
  rays?: boolean;
  /** v2: object square to the room (T.room.aligned). */
  roomAligned?: boolean;
  /** v2: object yaw vs the room (deg). */
  roomYaw?: number;
  pairs: PointPair[];
  image: ImageChoice;
  principal: PrincipalMode;
  lockLens: boolean;
  /** Guide-line snapping on/off (optional; default on). */
  snap?: boolean;
  /** Difference view of model vs mock-up (optional; default 'drag'). */
  diff?: DiffMode;
  modelDiff?: DiffMode;
  edgeMode?: EdgeMode;
  edgeSnap?: boolean;
  /** Lock to VP (T.vp.lock; optional; default off). */
  lockVp?: boolean;
  /** Per-axis VP mode ('auto' | 'parallel'), shared by both groups (optional; default auto). */
  vpModes?: VpModes;
  /** v2: axis origin per group (FULL px; missing / null = not set). */
  axisOrigin?: { object?: V2 | null; room?: V2 | null } | null;
  /** Include detected candidates in the origin corner search (optional; default on). */
  originUseDetected?: boolean;
};
/** Axis origin per line group (crop px). */
export type AxisOrigins = { object: V2 | null; room: V2 | null };
const isPt = (p: unknown): p is V2 => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v));
export type EdgeMode = 'drag' | 'always' | 'off';
/** A detected straight edge proposed as a guide line (ref px); never saved until accepted. */
export type Candidate = { id: number; a: V2; b: V2; axis: Axis | null; len: number; score: number };

/** Load an image, build its edge map in an idle callback and paint the overlay (null when it can't be read). */
async function computeEdges(src: string): Promise<{ map: EdgeMap; url: string; w: number; h: number } | null> {
  if (typeof document === 'undefined') return null;
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    await new Promise<void>((res) => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
      if (ric) ric(() => res(), { timeout: 600 });
      else setTimeout(res, 30);
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const map = edgeMapFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h);
    const o = document.createElement('canvas');
    o.width = map.w;
    o.height = map.h;
    const octx = o.getContext('2d')!;
    const data = new ImageData(map.w, map.h);
    data.data.set(edgeOverlayRGBA(map));
    octx.putImageData(data, 0, 0);
    const blob = await new Promise<Blob | null>((res) => o.toBlob(res, 'image/png'));
    if (!blob) return null;
    return { map, url: URL.createObjectURL(blob), w, h };
  } catch {
    return null;
  }
}

/** 'drag' = difference view only while a guide/point is dragged, 'always' = left on, 'off' = normal overlay. */
export type DiffMode = 'drag' | 'always' | 'off';

export const AXIS_COLORS = ['#ff4d4d', '#3ddc6a', '#4d8dff'] as const;
export const AXIS_NAMES = ['X', 'Y', 'Z'] as const;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Camera-match session for one asset: guide lines, point pairs, the solved camera and the view window. */
/** Default screen-px strip kept free under the fitted image for the stage's zoom buttons. */
const PAD_BOTTOM_DEFAULT = 60;

export class MatchState {
  readonly asset: ShowcaseAsset;
  readonly width: number;
  readonly height: number;
  readonly stored: Cam;
  /** Crop → full-image transform (identity when the asset has no mock-up). */
  readonly crop: CropT;
  /** Full image size in its own px. */
  readonly full: { w: number; h: number };

  /**
   * The camera in WORLD space (Blender cm): what the 3D view renders and what camera.json stores. Moving the whole
   * object (its placement) never moves it; the solvers work in the object's frame (`camObj`) — guide lines and point
   * pairs belong to the object — and write back through `toWorld`.
   */
  cam = $state.raw<Cam>(null as unknown as Cam);
  /** The whole object's placement (from the model editor); undefined = identity. */
  placement = $state.raw<Placement | undefined>(undefined);
  setPlacement(p: Placement | null | undefined): void {
    const next = p ?? undefined;
    if (JSON.stringify(next ?? null) !== JSON.stringify(this.placement ?? null)) this.placement = next ? (JSON.parse(JSON.stringify(next)) as Placement) : undefined;
  }
  /** The camera in the object's own frame (object at the origin, as the solver and point pairs see it). */
  get camObj(): Cam {
    return camToObject(this.cam, this.placement);
  }
  private toWorld(cam: Cam): Cam {
    return camToWorld(cam, this.placement);
  }
  /** Guide lines of the ACTIVE group (the one drawn on the current view); crop px. */
  lines = $state<GuideLine[]>([]);
  /** Lines of the other group (crop px), shown as a faint ghost. */
  otherLines = $state<GuideLine[]>([]);
  /** Show the other group's lines faintly (and let lines snap to them). */
  ghost = $state(true);
  /** Full rays (T.groups.rays): draw every guide line as a ray from its VP, through the segment, on to the view edge. */
  rays = $state(true);
  /** Object square to the room (T.room.aligned): object axes = room axes (X/Y/Z VPs shared). Off: only the vertical is shared. */
  roomAligned = $state(true);
  /** Object yaw relative to the room (deg, Blender Z): X_room = Rz(yaw)·X_obj. Solved when not aligned. */
  roomYaw = $state(0);
  /** Lines to outline after tapping a disagreeing axis in the agreement panel. */
  highlight = $state<{ axis: Axis; ids: number[] } | null>(null);
  pairs = $state<PointPair[]>([]);
  image = $state<ImageChoice>('crop');
  principal = $state<PrincipalMode>('center');
  lockLens = $state(false);
  /** Line magnet (T.snap.label): snap dragged guide lines to lines of other axes. */
  snap = $state(true);
  /** Model difference-blend (T.diff): off by default — line editing compares lines with image edges. */
  diff = $state<DiffMode>('off');
  /** Guide line ↔ mock-up edges: 'drag' = edge overlay while dragging, 'always', 'off'. */
  edgeMode = $state<EdgeMode>('drag');
  /** Snap to image edges while dragging (below corner/axis snap; Alt disables). */
  edgeSnap = $state(false);
  /** Edge map of the current view image (null while computing / unavailable). */
  edgeMap = $state.raw<EdgeMap | null>(null);
  /** Blob URL of the painted edge overlay of the current view image. */
  edgeUrl = $state<string | null>(null);
  /** Detected line candidates of the current view (T.detect); transient, never persisted. */
  candidates = $state<Candidate[]>([]);
  /** Detection progress 0..1 while running, else null. */
  detecting = $state<number | null>(null);
  /** Minimum candidate length (image px of the view image). */
  detectMinLen = $state(40);
  private detectRun = 0;
  private candId = 1;
  /**
   * Axis origin per group (crop px; T.axisOrigin): the pixel the origin is pinned to. The object group pins the
   * model's origin (pivot), the room group pins the world origin. The line solves keep it on that pixel (it is the
   * anchor of `keepAnchor`; without one the origin keeps its current pixel). Flips live in the camera itself.
   */
  axisOrigins = $state<AxisOrigins>({ object: null, room: null });
  /** Let detected (not yet accepted) candidates make origin corners too. */
  originUseDetected = $state(true);
  /** Origin mode (transient): corner markers and the ⌖ handle take clicks / drags instead of the guide lines. */
  originMode = $state(false);
  /** Natural size of the current view image (edge map / image px space). */
  private edgeNat = { w: 1, h: 1 };
  private static edgeCache = new Map<string, Promise<{ map: EdgeMap; url: string; w: number; h: number } | null>>();
  /** Lock to VP (T.vp.lock): a dragged endpoint keeps its line aimed at the VP of the other lines of its axis. */
  lockVp = $state(false);
  /** Per-axis VP mode: 'auto' (free VP) or 'parallel' (VP at infinity), shared by both groups. */
  vpModes = $state<VpModes>(['auto', 'auto', 'auto']);
  /** A guide line / point is being dragged (live solve + diff view). */
  dragging = $state(false);
  /** The last live solve failed; the camera stays at the last good solve. */
  liveFail = $state(false);
  private liveBase: Cam | null = null;
  /** Undo/redo stacks for guide-line edits (snapshots of `lines`). */
  private lineUndo: GuideLine[][] = [];
  private lineRedo: GuideLine[][] = [];
  /** Undo/redo of the inactive group (swapped in with its lines). */
  private otherUndo: GuideLine[][] = [];
  private otherRedo: GuideLine[][] = [];
  lineUndoCount = $state(0);
  lineRedoCount = $state(0);
  display = $state<DisplayMode>('solid');
  opacity = $state(70);
  split = $state(0);
  selectedLine = $state<number | null>(null);
  selectedPair = $state<number | null>(null);
  pick = $state<PickStep>(null);
  message = $state<string | null>(null);
  /** Pan/zoom of the stage: centre of view in ref px and zoom (1 = image fits). */
  zoom = $state(1);
  center = $state<V2>([0, 0]);
  stageW = $state(1);
  stageH = $state(1);
  /** Screen px kept free under the image at fit (the stage's bottom tool row); set by the view. */
  padBottom = $state(PAD_BOTTOM_DEFAULT);
  /** True once the user zoomed or panned since the last fit (then resizes keep the window instead of refitting). */
  userView = false;
  private nextId = 1;

  /** Where this session started: a localStorage draft, the committed source file, or fresh seeded lines. */
  origin: 'draft' | 'file' | 'seed' = 'seed';
  /** stableStringify(fileData()) of the untouched default session. */
  readonly defaultText: string;

  constructor(asset: ShowcaseAsset, baseline?: unknown) {
    const ref = asset.ref!;
    this.asset = asset;
    this.width = ref.width;
    this.height = ref.height;
    this.stored = camFromMatched(ref.camera, ref.width, ref.height);
    const m = ref.mockup;
    this.crop = m ? { x: m.crop.x, y: m.crop.y, s: m.scale ?? 1 } : { x: 0, y: 0, s: 1 };
    this.full = m ? { w: m.width, h: m.height } : { w: ref.width, h: ref.height };
    this.cam = clone(this.stored);
    this.center = [ref.width / 2, ref.height / 2];
    // the untouched default (seeded lines, stored camera): "nothing to save" when there is no file yet
    this.seedLines();
    this.defaultText = stableStringify(this.fileData());
    if (this.restore()) this.origin = 'draft';
    else if (baseline && this.loadFile(baseline)) this.origin = 'file';
  }

  // ---------- source file (games/never-ending-story/assets-src/<item>/editor/camera-match.json) ----------
  /**
   * The work as stored in the committed source file: lines (both groups, FULL-image px), point
   * pairs, solver settings and the solved camera. UI preferences (image, ghost, rays, snap, diff,
   * edge view) stay in localStorage only. Coordinates are rounded to 1e-4 px so a save → load →
   * save round trip is byte-identical.
   */
  fileData(): Record<string, unknown> {
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    const pt = (p: V2 | null | undefined) => (p ? ([r4(p[0]), r4(p[1])] as V2) : p);
    return {
      format: FORMAT_MATCH,
      asset: this.asset.slug,
      crop: { ...this.crop },
      fullImage: [this.full.w, this.full.h],
      lines: this.groupedFullLines().map(({ master: _m, ...l }) => ({ ...l, a: pt(l.a)!, b: pt(l.b)! })),
      master: this.masterMap(),
      pairs: ($state.snapshot(this.pairs) as PointPair[]).map((p) => ({ ...p, image: pt(p.image) ?? null })),
      lockVp: this.lockVp,
      vpModes: [...this.vpModes],
      principal: this.principal,
      lockLens: this.lockLens,
      roomAligned: this.roomAligned,
      roomYaw: this.roomYaw,
      ...this.axisOriginFile(),
      camera: $state.snapshot(this.cam),
      solved: {
        note: 'derived from camera (crop px) — for reading in review; ignored on load',
        blender: blenderValues(this.cam, this.width, this.height),
        roomYawDeg: Math.round(this.yaw * 1e4) / 1e4,
      },
    };
  }
  /** Load the work from a source file (keeps the UI preferences). */
  loadFile(data: unknown): boolean {
    const f = data as Record<string, any> | null;
    if (!f || f.format !== FORMAT_MATCH || !f.camera?.R) return false;
    const d: Saved = {
      v: 2,
      cam: f.camera as Cam,
      crop: f.crop as CropT,
      lines: Array.isArray(f.lines) ? f.lines : [],
      master: parseMasterMap(f.master),
      pairs: Array.isArray(f.pairs) ? f.pairs : [],
      ghost: this.ghost,
      rays: this.rays,
      roomAligned: f.roomAligned,
      roomYaw: f.roomYaw,
      image: this.image,
      principal: f.principal === 'vp3' || f.principal === 'free' ? f.principal : 'center',
      lockLens: !!f.lockLens,
      snap: this.snap,
      modelDiff: this.diff,
      edgeMode: this.edgeMode,
      edgeSnap: this.edgeSnap,
      lockVp: f.lockVp === true,
      vpModes: f.vpModes as VpModes,
      axisOrigin: f.axisOrigin ?? null,
      originUseDetected: this.originUseDetected,
    };
    if (!this.restoreFrom(d)) return false;
    this.lineUndo = [];
    this.lineRedo = [];
    this.otherUndo = [];
    this.otherRedo = [];
    this.lineUndoCount = 0;
    this.lineRedoCount = 0;
    this.selectedLine = null;
    this.selectedPair = null;
    this.pick = null;
    return true;
  }

  // ---------- image / view window ----------
  /** Displayed image rectangle in ref px. */
  get imageRect(): { x: number; y: number; w: number; h: number; src: string } {
    const ref = this.asset.ref!;
    if (this.image === 'wide' && ref.mockup) {
      const t = this.crop;
      return { x: -t.x / t.s, y: -t.y / t.s, w: this.full.w / t.s, h: this.full.h / t.s, src: ref.mockup.src };
    }
    return { x: 0, y: 0, w: ref.width, h: ref.height, src: ref.src };
  }
  /** Default strip kept free under the image at fit, so the zoom buttons never cover it (phones). */
  static readonly PAD_BOTTOM = PAD_BOTTOM_DEFAULT;
  get fitScale(): number {
    const r = this.imageRect;
    return Math.min(this.stageW / r.w, Math.max(this.stageH * 0.5, this.stageH - this.padBottom) / r.h);
  }
  /** Screen px per ref px. */
  get k(): number {
    return this.fitScale * this.zoom;
  }
  get viewRect(): ViewRect {
    const w = this.stageW / this.k;
    const h = this.stageH / this.k;
    return { x0: this.center[0] - w / 2, y0: this.center[1] - h / 2, w, h };
  }
  /** Last framed box (ref px) — test hook / debug (data-focus-box). */
  focusBox = $state.raw<Box2 | null>(null);
  private anim = 0;
  /** Cancel a running framing animation (any direct zoom / pan / fit wins). */
  private stopAnim(): void {
    if (this.anim) cancelAnimationFrame(this.anim);
    this.anim = 0;
  }
  /**
   * Zoom / pan so `box` (ref px) fills the usable stage with `pad` padding (Focus / Object crop).
   * Animates ~200 ms (geometric zoom), or jumps when `animate` is false or the user prefers reduced motion.
   */
  frameBox(box: Box2, pad = FOCUS_PAD, animate = true): void {
    this.stopAnim();
    const target = frameWindow(box, { w: this.stageW, h: this.stageH, padBottom: this.padBottom }, this.fitScale, { pad });
    this.focusBox = box;
    this.userView = true;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || reduce || typeof requestAnimationFrame !== 'function') {
      this.zoom = target.zoom;
      this.center = target.center;
      return;
    }
    const z0 = this.zoom;
    const c0 = this.center;
    const t0 = performance.now();
    const D = 200;
    const step = (now: number): void => {
      const t = Math.min(1, (now - t0) / D);
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const z = z0 * (target.zoom / z0) ** e;
      // interpolate the screen position of the target centre so the motion looks straight at a changing zoom
      const a = (1 / z0 - 1 / z) / (1 / z0 - 1 / target.zoom || 1);
      const w = Math.abs(target.zoom - z0) < 1e-9 ? e : a;
      this.zoom = z;
      this.center = [c0[0] + (target.center[0] - c0[0]) * w, c0[1] + (target.center[1] - c0[1]) * w];
      this.anim = t < 1 ? requestAnimationFrame(step) : 0;
      if (t >= 1) {
        this.zoom = target.zoom;
        this.center = target.center;
      }
    };
    this.anim = requestAnimationFrame(step);
  }
  /** The asset's mock-up crop rect in ref (= crop) px — the object crop, vs the room at Fit when image = 'wide'. */
  get cropRect(): Box2 {
    const ref = this.asset.ref!;
    return { x0: 0, y0: 0, x1: ref.width, y1: ref.height };
  }
  cropPreset(animate = true): void {
    this.frameBox(this.cropRect, 0, animate);
  }
  fit(): void {
    this.stopAnim();
    this.focusBox = null;
    const r = this.imageRect;
    this.zoom = 1;
    this.userView = false;
    const pad = Math.min(this.padBottom, this.stageH * 0.5);
    this.center = [r.x + r.w / 2, r.y + r.h / 2 + pad / 2 / this.fitScale];
  }
  zoomAt(factor: number, at?: V2): void {
    this.stopAnim();
    const z = Math.min(40, Math.max(0.5, this.zoom * factor));
    const p = at ?? this.center;
    const f = this.zoom / z;
    this.center = [p[0] + (this.center[0] - p[0]) * f, p[1] + (this.center[1] - p[1]) * f];
    this.zoom = z;
    this.userView = true;
  }
  /** Pan the view window by a screen-px drag (content follows the pointer). */
  panScreen(dx: number, dy: number): void {
    this.stopAnim();
    const k = this.k;
    this.center = [this.center[0] - dx / k, this.center[1] - dy / k];
    this.userView = true;
  }
  /** Screen point (relative to the stage's top-left) → ref px. */
  stageToRef(x: number, y: number): V2 {
    const v = this.viewRect;
    return [v.x0 + x / this.k, v.y0 + y / this.k];
  }
  setImage(next: ImageChoice): void {
    const before = this.group;
    if (next !== this.image) {
      this.clearCandidates();
      this.originMode = false;
    }
    this.image = next;
    if (this.group !== before) this.swapGroups();
    // the principal point no longer depends on the view (full-image centre), so nothing to move here
    this.fit();
  }
  /**
   * Principal point at the centre of the FULL image (the photo the crop was cut from), in crop px —
   * the crop centre is not the optical centre. Same in both views.
   */
  applyPrincipalCentre(): void {
    const [cx, cy] = fullCentreInCrop(this.full, this.crop);
    this.cam = { ...this.cam, cx, cy };
  }

  // ---------- object / room groups ----------
  /** Group edited on the current view: crop = object, full mock-up = room. */
  get group(): LineGroup {
    return this.image === 'wide' ? 'room' : 'object';
  }
  get otherGroup(): LineGroup {
    return this.group === 'room' ? 'object' : 'room';
  }
  get groupName(): string {
    return GROUP_NAMES[this.group];
  }
  get objectLines(): GuideLine[] {
    return this.group === 'object' ? this.lines : this.otherLines;
  }
  get roomLines(): GuideLine[] {
    return this.group === 'room' ? this.lines : this.otherLines;
  }
  /** Lines lines snap to: the active group, plus the ghost group when it is shown. */
  get snapPool(): GuideLine[] {
    return this.ghost ? [...this.lines, ...this.otherLines] : this.lines;
  }
  isActive(id: number): boolean {
    return this.lines.some((l) => l.id === id);
  }
  private swapGroups(): void {
    const l = $state.snapshot(this.lines) as GuideLine[];
    this.lines = $state.snapshot(this.otherLines) as GuideLine[];
    this.otherLines = l;
    [this.lineUndo, this.otherUndo] = [this.otherUndo, this.lineUndo];
    [this.lineRedo, this.otherRedo] = [this.otherRedo, this.lineRedo];
    this.lineUndoCount = this.lineUndo.length;
    this.lineRedoCount = this.lineRedo.length;
    this.selectedLine = null;
  }
  /** Yaw actually used: 0 when the object is square to the room. */
  get yaw(): number {
    return this.roomAligned ? 0 : this.roomYaw;
  }
  /** Normalisation frame of the joint solve (FULL px): full-image principal point, max(W, H). */
  private fullFrame(cam: Cam): Frame {
    const c = camToFull(cam, this.crop);
    return { cx: c.cx, cy: c.cy, s: Math.max(this.full.w, this.full.h) };
  }
  private fullLines(ls: readonly GuideLine[]): GuideLine[] {
    return (($state.snapshot(ls) as GuideLine[]) ?? []).map((l) => lineToFull(l, this.crop));
  }
  /** Object ↔ room agreement (T.room.agreement); null until both groups have lines. */
  readonly agreement = $derived.by((): Agreement | null => {
    const o = this.objectLines;
    const r = this.roomLines;
    if (!o.length || !r.length) return null;
    try {
      return agreementOf(this.fullLines(o), this.fullLines(r), camToFull(this.camObj, this.crop), this.yaw, this.fullFrame(this.camObj), 3, this.vpModes);
    } catch {
      return null;
    }
  });
  /** Tap on an axis of the agreement panel: outline its worst lines (and show the other group). */
  highlightAxis(axis: Axis | null): void {
    const a = axis === null ? null : this.agreement?.axes[axis];
    if (!a || this.highlight?.axis === axis) {
      this.highlight = null;
      return;
    }
    this.highlight = { axis: axis!, ids: a.worst.map((w) => w.id) };
    this.ghost = true;
  }
  /** Lines both groups contribute to a rotation-only refine in the object frame. */
  private refineLines(): GuideLine[] {
    if (this.roomAligned) return [...this.objectLines, ...this.roomLines];
    return [...this.objectLines, ...this.roomLines.filter((l) => l.axis === 2)];
  }

  // ---------- guide lines ----------
  /** Normalisation frame of the VP fits (same as the camera solve). */
  get vpFrame(): Frame {
    return { cx: this.cam.cx, cy: this.cam.cy, s: Math.max(this.width, this.height) };
  }
  /** Consolidated (robust least-squares) VP per axis, with per-line residuals; null with < 2 lines. */
  readonly vpFits = $derived.by((): ({ fit: VpFit; ids: number[] } | null)[] => fitAxes(this.lines, this.vpFrame, this.vpModes));
  /** Same for the ghost (other) group — its lines draw their own faint rays. */
  readonly ghostFits = $derived.by((): ({ fit: VpFit; ids: number[] } | null)[] => fitAxes(this.otherLines, this.vpFrame, this.vpModes));
  /**
   * One-tap suggestion per axis to switch to parallel mode: the free VP is > 20 image diagonals away, or forcing parallel
   * costs (almost) nothing. Only for 'auto' axes with ≥ 2 lines in the active group; null otherwise.
   */
  readonly parallelHints = $derived.by(() =>
    ([0, 1, 2] as Axis[]).map((a) => {
      if (this.vpModes[a] !== 'auto') return null;
      const ls = this.lines.filter((l) => l.axis === a);
      const s = parallelSuggestion(ls, this.vpFrame, Math.hypot(this.width, this.height));
      return s?.suggest ? s : null;
    }),
  );
  /** Axes currently forced parallel. */
  get parallelAxes(): Axis[] {
    return ([0, 1, 2] as Axis[]).filter((a) => this.vpModes[a] === 'parallel');
  }
  setVpMode(axis: Axis, mode: VpMode): void {
    if (this.vpModes[axis] === mode) return;
    const m = [...this.vpModes] as VpModes;
    m[axis] = mode;
    this.vpModes = m;
  }
  get vps(): ({ vp: V3; rms: number } | null)[] {
    return this.vpFits.map((f) => (f ? { vp: f.fit.vp, rms: f.fit.rms } : null));
  }
  /** Residual (degrees) + outlier flag of one line against its axis VP; null when the axis has < 2 lines. */
  lineResidual(id: number): { deg: number; outlier: boolean } | null {
    for (const f of this.vpFits) {
      const i = f ? f.ids.indexOf(id) : -1;
      if (f && i >= 0) return { deg: f.fit.resDeg[i]!, outlier: f.fit.outlier[i]! };
    }
    return null;
  }
  /**
   * Consolidate VPs (T.vp.consolidateAll): turn every line of `axis` (or of all axes) so it passes exactly through the consolidated VP.
   * Undoable; lines with both ends linked are skipped and reported.
   */
  consolidate(axis?: Axis, mode?: VpMode): { moved: number; skipped: number; message: string } {
    // per-axis "consolidate" → back to a free (finite) VP; per-axis "parallel" → parallel; all axes keeps each axis' mode
    if (axis !== undefined && mode) this.setVpMode(axis, mode);
    const axes = axis === undefined ? ([0, 1, 2] as Axis[]) : [axis];
    const ready = axes.filter((a) => this.vpFits[a]);
    const name = axis === undefined ? '' : T.vp.axisName(axis);
    const par = axis !== undefined && this.vpModes[axis] === 'parallel';
    if (!ready.length) {
      return { moved: 0, skipped: 0, message: T.vp.needTwoBefore(name, par) };
    }
    this.pushLines();
    const r = consolidateLines($state.snapshot(this.lines) as GuideLine[], ready, this.vpFrame, 1e-6, this.vpModes);
    if (!r.moved.length) this.dropLastPush();
    else this.lines = r.lines;
    let message = par
      ? r.moved.length
        ? T.vp.madeParallel(name, r.moved.length)
        : T.vp.alreadyParallel(name)
      : r.moved.length
        ? T.vp.consolidated(name, r.moved.length)
        : T.vp.alreadyConsolidated(name);
    if (r.skipped.length) message += T.vp.skippedLinked(r.skipped.length);
    return { moved: r.moved.length, skipped: r.skipped.length, message };
  }
  /** Remember the current lines before an edit (for undo). */
  pushLines(): void {
    this.lineUndo.push($state.snapshot(this.lines) as GuideLine[]);
    if (this.lineUndo.length > 100) this.lineUndo.shift();
    this.lineRedo = [];
    this.lineUndoCount = this.lineUndo.length;
    this.lineRedoCount = 0;
  }
  /** Drop the last snapshot when an edit turned out to change nothing (e.g. a tap on a handle). */
  dropLastPush(): void {
    const last = this.lineUndo.at(-1);
    if (last && JSON.stringify(last) === JSON.stringify($state.snapshot(this.lines))) {
      this.lineUndo.pop();
      this.lineUndoCount = this.lineUndo.length;
    }
  }
  undoLines(): boolean {
    const prev = this.lineUndo.pop();
    if (!prev) return false;
    this.lineRedo.push($state.snapshot(this.lines) as GuideLine[]);
    this.lines = prev;
    this.afterHistory();
    return true;
  }
  redoLines(): boolean {
    const next = this.lineRedo.pop();
    if (!next) return false;
    this.lineUndo.push($state.snapshot(this.lines) as GuideLine[]);
    this.lines = next;
    this.afterHistory();
    return true;
  }
  private afterHistory(): void {
    this.lineUndoCount = this.lineUndo.length;
    this.lineRedoCount = this.lineRedo.length;
    if (this.selectedLine !== null && !this.lines.some((l) => l.id === this.selectedLine)) this.selectedLine = null;
    this.nextId = Math.max(this.nextId, 1 + Math.max(0, ...this.lines.map((l) => l.id), ...this.otherLines.map((l) => l.id)));
  }
  /** Endpoints that move with `ref` (its shared corner). */
  members(ref: EndRef): EndRef[] {
    return jointMembers(this.lines, ref);
  }
  link(p: EndRef, q: EndRef): void {
    linkEnds(this.lines, p, q);
  }
  /** Unlink one endpoint from its corner. */
  unlink(ref: EndRef): boolean {
    if (this.members(ref).length < 2) return false;
    this.pushLines();
    unlinkEnd(this.lines, ref);
    return true;
  }
  /** Unlink both ends of a line; returns how many ends were linked. */
  unlinkLine(id: number | null): number {
    const line = this.lines.find((l) => l.id === id);
    if (!line?.links) return 0;
    this.pushLines();
    const n = Object.keys(line.links).length;
    removeLineLinks(this.lines, line.id);
    return n;
  }
  get linkedEnds(): number {
    return this.lines.reduce((n, l) => n + (l.links ? Object.keys(l.links).length : 0), 0);
  }
  addLine(axis: Axis): void {
    this.pushLines();
    const r = this.viewRect;
    const n = this.lines.filter((l) => l.axis === axis).length;
    const cx = r.x0 + r.w * (0.3 + 0.12 * axis + 0.05 * n);
    const cy = r.y0 + r.h * (0.35 + 0.08 * n);
    const len = Math.min(r.w, r.h) * 0.3;
    const dir = axis === 2 ? [0, 1] : axis === 0 ? [1, 0.15] : [0.8, -0.6];
    const id = this.nextId++;
    // the first line drawn on an axis becomes its master
    this.lines.push({ id, axis, a: [cx - dir[0]! * len * 0.5, cy - dir[1]! * len * 0.5], b: [cx + dir[0]! * len * 0.5, cy + dir[1]! * len * 0.5], ...(n ? {} : { master: true }) });
    this.selectedLine = id;
  }
  /** Delete a line. Deleting a master promotes the remaining line with the lowest residual; returns that message. */
  removeLine(id: number | null): string | null {
    if (id === null) return null;
    const gone = this.lines.find((l) => l.id === id);
    if (!gone) return null;
    this.pushLines();
    removeLineLinks(this.lines, id);
    this.lines = this.lines.filter((l) => l.id !== id);
    if (this.selectedLine === id) this.selectedLine = null;
    if (!gone.master) return null;
    const next = promoteMaster(this.lines, gone.axis, this.vpFrame, this.vpModes[gone.axis]);
    if (next === null) return null;
    const msg = T.master.promoted(this.lineLabel(next), AXIS_NAMES[gone.axis]);
    this.say(msg);
    return msg;
  }

  // ---------- master line per axis ----------
  /** "X2" = the 2nd X line of the active group (drawing order). */
  lineLabel(id: number): string {
    const l = this.lines.find((x) => x.id === id);
    if (!l) return '?';
    return `${AXIS_NAMES[l.axis]}${this.lines.filter((x) => x.axis === l.axis).indexOf(l) + 1}`;
  }
  /** Master (★1) line id of an axis in the active group. */
  masterId(axis: Axis): number | null {
    return masterOf(this.lines, axis)?.id ?? null;
  }
  /** Second master (★2) line id of an axis in the active group. */
  master2Id(axis: Axis): number | null {
    return master2Of(this.lines, axis)?.id ?? null;
  }
  /** Warning text when the two masters of `axis` are nearly parallel (unstable VP), else null. */
  masterWarning(axis: Axis): string | null {
    if (this.vpModes[axis] === 'parallel' || !mastersNearlyParallel(this.lines, axis)) return null;
    const d = masterPairAngle(this.lines, axis)!;
    return T.master.nearParallel(AXIS_NAMES[axis], `${d.toFixed(2)}°`);
  }
  /**
   * ★ toggle on a line (undoable): a master is unset (the last master of an axis stays); another line becomes ★1, or
   * ★2 on a converging axis (two masters already: the oldest is replaced), or the only master of a parallel axis.
   * Returns the toast (with the near-parallel warning appended), or null when nothing changed.
   */
  toggleMaster(id: number | null): string | null {
    const l = this.lines.find((x) => x.id === id);
    if (!l) return null;
    const ax = AXIS_NAMES[l.axis];
    let msg: string;
    if (l.master) {
      this.pushLines();
      if (!removeMasterFlag(this.lines, l.id)) {
        this.dropLastPush();
        msg = T.master.keepOne(ax);
        this.say(msg);
        return msg;
      }
      msg = T.master.unsetToast(this.lineLabel(l.id), ax);
    } else {
      this.pushLines();
      const r = addMasterFlag(this.lines, l.id, this.vpModes[l.axis] === 'parallel');
      if (!r) {
        this.dropLastPush();
        return null;
      }
      const name = this.lineLabel(l.id);
      msg =
        r.kind === 'second'
          ? T.master.secondToast(name, ax)
          : r.kind === 'replacedOldest'
            ? T.master.replacedOldestToast(this.lineLabel(r.dropped), this.lineLabel(this.masterId(l.axis)!), name, ax)
            : r.kind === 'parallelReplaced'
              ? T.master.parallelOne(name, ax)
              : T.master.setToast(name, ax);
    }
    const w = this.masterWarning(l.axis);
    if (w) msg += ` · ${w}`;
    this.say(msg);
    return msg;
  }
  /** Set / clear (null) the second master of an axis directly (undoable). */
  setMaster2(axis: Axis, id: number | null): string | null {
    if (this.vpModes[axis] === 'parallel' && id !== null) {
      const msg = T.master.parallelIgnored(this.lineLabel(id));
      this.say(msg);
      return msg;
    }
    const old = this.master2Id(axis);
    this.pushLines();
    if (!setMaster2Flag(this.lines, axis, id)) {
      this.dropLastPush();
      return null;
    }
    let msg = id === null ? T.master.unsetToast(this.lineLabel(old!), AXIS_NAMES[axis]) : T.master.secondToast(this.lineLabel(id), AXIS_NAMES[axis]);
    const w = this.masterWarning(axis);
    if (w) msg += ` · ${w}`;
    this.say(msg);
    return msg;
  }
  /** Master ids per axis of both groups (what camera-match.json stores). */
  masterMap(): MasterMap {
    return { object: masterIds(this.objectLines), room: masterIds(this.roomLines) };
  }
  /** Make a line the master of its axis (undoable); returns the toast, or null when nothing changed. */
  setMaster(id: number | null): string | null {
    const l = this.lines.find((x) => x.id === id);
    if (!l || l.master) return null;
    this.pushLines();
    setMasterFlag(this.lines, l.id);
    const msg = T.master.setToast(this.lineLabel(l.id), AXIS_NAMES[l.axis]);
    this.say(msg);
    return msg;
  }
  /** Move the master of `axis` to the next line of that axis (drawing order, wrapping). */
  cycleMaster(axis: Axis): string | null {
    // ★1 moves over the lines that are not ★2
    const ls = this.lines.filter((l) => l.axis === axis && l.master !== 2);
    if (ls.length < 2) return null;
    const i = ls.findIndex((l) => l.master);
    return this.setMaster(ls[(i + 1) % ls.length]!.id);
  }
  clearLines(): void {
    this.pushLines();
    this.lines = [];
    this.selectedLine = null;
  }
  /** Two guide lines per axis along the model's box edges, as seen by the current camera. */
  seedLines(): boolean {
    if (this.group === 'room') {
      this.say(T.groups.roomSeedNote);
      return false;
    }
    const kp = this.keyPoints();
    const by = (id: string) => kp.find((p) => p.id === id)?.p;
    const edges: [Axis, string, string][] = [
      [0, 'FLT', 'FRT'],
      [0, 'FLB', 'FRB'],
      [1, 'FRT', 'BRT'],
      [1, 'FRB', 'BRB'],
      [2, 'FLlegTL', 'FLfoot'],
      [2, 'FRlegTR', 'FRfoot'],
    ];
    if (this.lines.length) this.pushLines();
    const lines: GuideLine[] = [];
    const at = new Map<string, EndRef[]>();
    for (const [axis, a, b] of edges) {
      const A = by(a);
      const Bp = by(b);
      const pa = A && project(this.camObj, A);
      const pb = Bp && project(this.camObj, Bp);
      if (!pa || !pb) continue;
      const id = this.nextId++;
      lines.push({ id, axis, a: pa, b: pb });
      at.set(a, [...(at.get(a) ?? []), { line: id, end: 'a' }]);
      at.set(b, [...(at.get(b) ?? []), { line: id, end: 'b' }]);
    }
    // box corners shared by lines of different axes start as linked corners
    for (const ends of at.values()) for (let i = 1; i < ends.length; i++) linkEnds(lines, ends[0]!, ends[i]!);
    ensureMasters(lines);
    this.lines = lines;
    this.selectedLine = null;
    return true;
  }

  // ---------- point pairs ----------
  keyPoints(): { id: string; label: string; p: V3 }[] {
    return this.asset.ref?.keyPoints ?? [];
  }
  addPair(world: V3 | null, label?: string): number {
    const id = this.nextId++;
    this.pairs.push({ id, world, image: null, label });
    this.selectedPair = id;
    this.pick = world ? { pairId: id, want: 'image' } : { pairId: id, want: 'model' };
    return id;
  }
  removePair(id: number | null): void {
    if (id === null) return;
    this.pairs = this.pairs.filter((p) => p.id !== id);
    if (this.pick?.pairId === id) this.pick = null;
    if (this.selectedPair === id) this.selectedPair = null;
  }
  setPairWorld(id: number, world: V3, label?: string): void {
    const p = this.pairs.find((q) => q.id === id);
    if (!p) return;
    p.world = world;
    if (label) p.label = label;
    this.pick = p.image ? null : { pairId: id, want: 'image' };
  }
  setPairImage(id: number, image: V2): void {
    const p = this.pairs.find((q) => q.id === id);
    if (!p) return;
    p.image = image;
    this.pick = p.world ? null : { pairId: id, want: 'model' };
  }
  get completePairs(): PointPair[] {
    return this.pairs.filter((p) => p.world && p.image);
  }

  // ---------- solving ----------
  get residual(): { lines: number | null; points: number | null } {
    return rmsErrors(this.camObj, this.lines, this.completePairs);
  }
  private say(msg: string): void {
    this.message = msg;
  }
  /** Focal length (unless locked) + rotation from the guide lines. Keeps the model origin where it was on screen. */
  /**
   * One camera from BOTH groups (object + room), solved in full-image px (full-image principal point and
   * focal), returned in crop px. Aligned: shared X/Y/Z VPs; otherwise shared vertical + the object's yaw.
   */
  private jointSolve(prior: Cam): { cam: Cam | null; message?: string; yaw: number; yawSolved: boolean } {
    if (this.principal === 'center') {
      const [cx, cy] = fullCentreInCrop(this.full, this.crop);
      prior = { ...prior, cx, cy };
    }
    const priorF = camToFull(prior, this.crop);
    const res = solveJoint(this.fullLines(this.objectLines), this.fullLines(this.roomLines), priorF, {
      frame: this.fullFrame(prior),
      fixedF: this.lockLens,
      principal: this.principal === 'vp3' ? 'vp3' : 'fixed',
      aligned: this.roomAligned,
      yaw0: this.roomYaw,
      modes: this.vpModes,
    });
    return { cam: res.ok && res.cam ? camToCrop(res.cam, this.crop) : null, message: res.message, yaw: res.yaw, yawSolved: res.yawSolved };
  }
  solveLines(): boolean {
    const prior = this.camObj;
    const res = this.jointSolve(prior);
    if (!res.cam) {
      this.say(res.message ?? t('editor.match.solve.failed'));
      return false;
    }
    let cam = res.cam;
    if (this.completePairs.length >= 2) cam = this.pinOrigin(solvePosition(cam, this.completePairs) ?? cam);
    else cam = this.keepAnchor(prior, cam);
    if (!this.saneCam(cam)) {
      // e.g. two nearly parallel masters put the VP near infinity → a degenerate lens / distance
      this.say(T.master.degenerate);
      return false;
    }
    this.cam = this.toWorld(cam);
    if (!this.roomAligned && res.yawSolved) this.roomYaw = res.yaw;
    const both = !!(this.objectLines.length && this.roomLines.length);
    const yaw = this.roomAligned ? null : this.roomYaw.toFixed(1);
    this.say(T.room.solvedFromLines(both, lensMm(cam.f, this.width).toFixed(1), yaw, res.message ?? null));
    return true;
  }
  // ---------- line detection (edge view → candidates) ----------
  /** Axis predictors in IMAGE px of the view image: a finite VP, or a direction (parallel / VP at infinity). */
  private axisPredictors(): AxisPredictor[] {
    return ([0, 1, 2] as Axis[]).map((a): AxisPredictor => {
      const v = this.vps[a]?.vp;
      if (!v) {
        // one line on a parallel axis already fixes the direction
        const l = this.vpModes[a] === 'parallel' ? this.lines.find((x) => x.axis === a) : undefined;
        if (!l) return null;
        const p = this.refToImg(l.a), q = this.refToImg(l.b);
        return { kind: 'dir', d: [q[0] - p[0], q[1] - p[1]] };
      }
      const big = Math.max(this.width, this.height) * 1e3;
      if (Math.abs(v[2]) * big < Math.hypot(v[0], v[1])) {
        const o = this.refToImg([0, 0]), q = this.refToImg([v[0], v[1]]);
        return { kind: 'dir', d: [q[0] - o[0], q[1] - o[1]] };
      }
      return { kind: 'vp', p: this.refToImg([v[0] / v[2], v[1] / v[2]]) };
    });
  }
  /**
   * Detect straight edges on the current view's edge map (chunked, never freezes the UI) and propose them as
   * candidates (ref px), each classified onto an axis. Returns the number of candidates, or null when superseded.
   */
  async detectLines(): Promise<number | null> {
    const run = ++this.detectRun;
    this.detecting = 0;
    if (!this.edgeMap) await this.loadEdges();
    const map = this.edgeMap;
    if (run !== this.detectRun) return null;
    if (!map) {
      this.detecting = null;
      this.say(T.edges.preparing);
      return 0;
    }
    const segs = await detectLinesChunked(map, { minLen: this.detectMinLen, max: 40 }, (f) => {
      if (run === this.detectRun) this.detecting = f;
    }, 12, () => run !== this.detectRun);
    if (!segs || run !== this.detectRun) return null;
    const axes = classifySegments(segs, this.axisPredictors());
    // drop candidates that duplicate an existing line (same place)
    const k = this.refPerImg;
    const dup = (a: V2, b: V2) => this.lines.some((l) => {
      const d = (p: V2) => {
        const u: V2 = [l.b[0] - l.a[0], l.b[1] - l.a[1]];
        const n = Math.hypot(u[0], u[1]) || 1;
        return Math.abs(u[0] * (p[1] - l.a[1]) - u[1] * (p[0] - l.a[0])) / n;
      };
      return d(a) < 6 * k && d(b) < 6 * k;
    });
    this.candidates = segs
      .map((sg, i): Candidate => ({ id: this.candId++, a: this.imgToRef(sg.a), b: this.imgToRef(sg.b), axis: axes[i] ?? null, len: sg.len * k, score: sg.score }))
      .filter((c) => !dup(c.a, c.b));
    this.detecting = null;
    const n = (a: Axis | null) => this.candidates.filter((c) => c.axis === a).length;
    this.say(this.candidates.length ? T.detect.found(this.candidates.length, n(0), n(1), n(2), n(null)) : T.detect.none);
    return this.candidates.length;
  }
  clearCandidates(): void {
    this.detectRun++;
    this.detecting = null;
    this.candidates = [];
  }
  setCandidateAxis(id: number, axis: Axis | null): void {
    const c = this.candidates.find((x) => x.id === id);
    if (c) c.axis = axis;
  }
  private pushCandidate(c: Candidate, axis: Axis): number {
    const first = !this.lines.some((l) => l.axis === axis);
    const id = this.nextId++;
    this.lines.push({ id, axis, a: [...c.a], b: [...c.b], ...(first ? { master: true } : {}) });
    return id;
  }
  /** Accept a candidate as a guide line on `axis` (default: its classified axis). Undoable. Toast text, or null. */
  acceptCandidate(id: number, axis?: Axis): string | null {
    const c = this.candidates.find((x) => x.id === id);
    if (!c) return null;
    const ax = axis ?? c.axis;
    if (ax === null) return T.detect.needAxis;
    this.pushLines();
    const lid = this.pushCandidate(c, ax);
    this.candidates = this.candidates.filter((x) => x.id !== id);
    this.selectedLine = lid;
    return T.detect.accepted(this.lineLabel(lid));
  }
  /** Accept every candidate classified on `axis` (one undo step). */
  acceptAll(axis: Axis): string | null {
    const cs = this.candidates.filter((c) => c.axis === axis);
    if (!cs.length) return null;
    this.pushLines();
    for (const c of cs) this.pushCandidate(c, axis);
    this.candidates = this.candidates.filter((c) => c.axis !== axis);
    return T.detect.acceptedAll(cs.length, AXIS_NAMES[axis]);
  }

  // ---------- guide line ↔ mock-up edges ----------
  /** Build (once per image, cached) the edge map of the current view image, in an idle callback. */
  async loadEdges(): Promise<void> {
    const src = this.imageRect.src;
    let job = MatchState.edgeCache.get(src);
    if (!job) {
      job = computeEdges(src);
      MatchState.edgeCache.set(src, job);
    }
    const r = await job;
    if (this.imageRect.src !== src) return; // view switched meanwhile
    this.edgeMap = r?.map ?? null;
    this.edgeUrl = r?.url ?? null;
    if (r) this.edgeNat = { w: r.w, h: r.h };
  }
  get showEdges(): boolean {
    return !!this.edgeMap && (this.edgeMode === 'always' || (this.edgeMode === 'drag' && this.dragging));
  }
  /** Ref px → current view image px. */
  refToImg(p: V2): V2 {
    const r = this.imageRect;
    return [((p[0] - r.x) * this.edgeNat.w) / r.w, ((p[1] - r.y) * this.edgeNat.h) / r.h];
  }
  imgToRef(p: V2): V2 {
    const r = this.imageRect;
    return [r.x + (p[0] * r.w) / this.edgeNat.w, r.y + (p[1] * r.h) / this.edgeNat.h];
  }
  /** Ref px per image px of the current view. */
  get refPerImg(): number {
    return this.imageRect.w / this.edgeNat.w;
  }
  /** Alignment of a segment (ref px) with the image edges; samples / offsets back in ref px. */
  edgeAlignOf(a: V2, b: V2): EdgeAlign | null {
    const m = this.edgeMap;
    if (!m) return null;
    const k = this.refPerImg;
    const r = alignLine(m, this.refToImg(a), this.refToImg(b), { band: 8 / k });
    return {
      ...r,
      meanOff: r.meanOff === null ? null : r.meanOff * k,
      samples: r.samples.map((x) => ({ ...x, p: this.imgToRef(x.p), q: x.q ? this.imgToRef(x.q) : null, off: x.off === null ? null : x.off * k })),
    };
  }
  /** Fit a segment (ref px) to the edges in its band; null when nothing better was found. */
  edgeFitSegment(a: V2, b: V2, fixed: { a?: boolean; b?: boolean }, band = 8): { a: V2; b: V2; before: number | null; after: number | null } | null {
    const m = this.edgeMap;
    if (!m) return null;
    const k = this.refPerImg;
    const r = refineLine(m, this.refToImg(a), this.refToImg(b), fixed, { band: band / k });
    if (!r.moved) return null;
    return { a: this.imgToRef(r.a), b: this.imgToRef(r.b), before: r.before.meanOff === null ? null : r.before.meanOff * k, after: r.after.meanOff === null ? null : r.after.meanOff * k };
  }
  /**
   * Snap to image edges (T.edges.refineSelected): refine the selected line (or all lines) onto the image edges. Linked corners stay fixed
   * (the line pivots about them). Undoable as one step.
   */
  edgeRefine(which: 'selected' | 'all'): { moved: number; message: string } {
    if (!this.edgeMap) return { moved: 0, message: T.edges.preparing };
    const ids = which === 'all' ? this.lines.map((l) => l.id) : this.selectedLine !== null ? [this.selectedLine] : [];
    if (!ids.length) return { moved: 0, message: T.edges.selectFirst };
    this.pushLines();
    let moved = 0;
    let fixedBoth = 0;
    let keptMasters = 0;
    const before: number[] = [];
    const after: number[] = [];
    for (const id of ids) {
      const l = this.lines.find((x) => x.id === id);
      if (!l) continue;
      // masters are references: edge snapping never moves them
      if (l.master) {
        keptMasters++;
        continue;
      }
      const fixed = { a: l.links?.a !== undefined, b: l.links?.b !== undefined };
      if (fixed.a && fixed.b) {
        fixedBoth++;
        continue;
      }
      const r = this.edgeFitSegment([...l.a] as V2, [...l.b] as V2, fixed);
      if (!r) continue;
      l.a = r.a;
      l.b = r.b;
      moved++;
      if (r.before !== null) before.push(r.before);
      if (r.after !== null) after.push(r.after);
    }
    if (!moved) this.dropLastPush();
    const avg = (v: number[]) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : 0);
    let message = moved
      ? T.edges.refinedMany(moved, avg(before).toFixed(1), avg(after).toFixed(1))
      : T.edges.nothingToRefine;
    if (fixedBoth) message += T.edges.skippedLinked(fixedBoth);
    if (keptMasters) message += T.master.edgeKept(keptMasters);
    return { moved, message };
  }
  get showDiff(): boolean {
    return this.diff === 'always' || (this.diff === 'drag' && this.dragging);
  }
  beginLive(): void {
    this.dragging = true;
    this.liveFail = false;
    this.liveBase = this.camObj;
  }
  endLive(): void {
    this.dragging = false;
    this.liveBase = null;
  }
  /**
   * Re-solve while dragging (called at most once per frame). Starts from the camera at drag start so the
   * result doesn't drift; on failure keeps the last good camera and flags `liveFail`.
   */
  solveLive(what: 'lines' | 'pairs'): boolean {
    const base = this.liveBase ?? this.camObj;
    const pairs = this.completePairs;
    let cam: Cam | null = null;
    try {
      if (what === 'lines') {
        const res = this.jointSolve(base);
        if (res.cam) cam = pairs.length >= 2 ? this.pinOrigin(solvePosition(res.cam, pairs) ?? res.cam) : this.keepAnchor(base, res.cam);
        if (res.cam && !this.roomAligned && res.yawSolved) this.roomYaw = res.yaw;
      } else if (pairs.length >= 4) {
        const start = solvePosition(base, pairs) ?? base;
        cam = solveFull(start, this.refineLines(), pairs, { fixedF: this.lockLens, principal: this.principal === 'free' && pairs.length >= 6, parallel: this.parallelAxes });
      } else if (pairs.length >= 2) {
        cam = solvePosition(base, pairs);
      } else return true; // nothing to solve from yet
    } catch {
      cam = null;
    }
    const finite = !!cam && this.saneCam(cam);
    this.liveFail = !finite;
    if (finite) this.cam = this.toWorld(cam!);
    return finite;
  }
  /** Finite, positive focal within a sane range, camera not absurdly far (guards degenerate VPs). */
  saneCam(cam: Cam): boolean {
    if (![cam.f, cam.cx, cam.cy, ...cam.C, ...cam.R.flat()].every(Number.isFinite)) return false;
    return cam.f > 0.05 * this.width && cam.f < 100 * this.width && Math.hypot(...cam.C) < 1e4;
  }
  /**
   * Keep the anchor at its pixel after a rotation / focal re-solve. With an axis origin the anchor is that origin
   * (model pivot for the object group, world origin for the room group) and its pixel is the stored one; without
   * one it is the model origin at the pixel it had in `prior`. Depth scales with the focal change.
   */
  private keepAnchor(prior: Cam, cam: Cam): Cam {
    const g = this.anchorGroup;
    if (!g) return keepAnchorAt(prior, cam, [0, 0, 0], null);
    return keepAnchorAt(prior, cam, this.anchorPoint(g), this.axisOrigins[g]);
  }
  /** After a point-pair position solve: keep its distance, but put the axis origin exactly on its pixel. */
  private pinOrigin(cam: Cam): Cam {
    const g = this.anchorGroup;
    if (!g) return cam;
    const X = this.anchorPoint(g);
    const d = depthOf(cam, X);
    return d > 0 ? anchorCam(cam, X, this.axisOrigins[g]!, d) : cam;
  }

  // ---------- axis origin (T.axisOrigin) ----------
  /** Group whose axis origin the solve uses: the active view's, else the other view's, else none. */
  get anchorGroup(): LineGroup | null {
    if (this.axisOrigins[this.group]) return this.group;
    if (this.axisOrigins[this.otherGroup]) return this.otherGroup;
    return null;
  }
  /** Axis origin of the active view (crop px) or null. */
  get axisOrigin(): V2 | null {
    return this.axisOrigins[this.group];
  }
  /** The object-frame point an origin pins: the model pivot (object group) or the world origin (room group). */
  anchorPoint(g: LineGroup): V3 {
    if (g === 'room') return placeToLocal(this.placement, [0, 0, 0]);
    const o = this.placement?.origin;
    return o ? [o[0], o[1], o[2]] : [0, 0, 0];
  }
  /** Object-frame directions of the frame axes of a group (room axes: X_room = Rz(yaw)·X_obj). */
  private frameAxes(g: LineGroup): [V3, V3, V3] {
    const I: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    if (g === 'object' || !this.yaw) return I;
    const Rt = transpose(rotZ(this.yaw));
    return I.map((e) => mulMV(Rt, e)) as [V3, V3, V3];
  }
  /** Line segments the corner search uses (active group; plus axis-tagged detected candidates). */
  private originSegs(): OriginSeg[] {
    const segs: OriginSeg[] = this.lines.map((l) => ({ id: l.id, axis: l.axis, a: l.a, b: l.b }));
    if (this.originUseDetected) for (const c of this.candidates) if (c.axis !== null) segs.push({ id: -c.id, axis: c.axis, a: c.a, b: c.b, detected: true });
    return segs;
  }
  /** Crossing tolerance in ref px: ~6 screen px at the current zoom. */
  get originTol(): number {
    return 6 / Math.max(1e-6, this.k);
  }
  /** Triple junctions (X, Y and Z lines within ~6 screen px) of the active view, best first. */
  readonly originCands = $derived.by((): OriginCandidate[] => {
    try {
      return originCandidates(this.originSegs(), this.originTol, 6);
    } catch {
      return [];
    }
  });
  /** Snap a dragged origin handle to candidates and line crossings (ref px). */
  snapAxisOrigin(p: V2): { p: V2; kind: 'candidate' | 'cross' | null } {
    return snapOrigin(p, this.originCands, this.originSegs(), 12 / Math.max(1e-6, this.k), this.originTol);
  }
  /**
   * Tripod of the active view: origin pixel, where the pinned point projects with the current camera, and the
   * screen direction of each frame axis (toward / away from its VP, or along the parallel direction).
   */
  get originTripod(): { at: V2; proj: V2 | null; dirs: (V2 | null)[]; set: boolean } | null {
    const g = this.anchorGroup ?? this.group;
    const set = !!this.axisOrigins[g];
    const cam = this.camObj;
    const X = this.anchorPoint(g);
    const proj = project(cam, X);
    const at = this.axisOrigins[this.group] ?? (set ? proj : null);
    if (!at) return null;
    const len = Math.max(1, Math.abs(depthOf(cam, X)) * 0.05);
    return { at, proj, dirs: this.frameAxes(g).map((d) => axisScreenDir(cam, X, d, len)), set };
  }
  /**
   * Set (or clear with null) the axis origin of the active view and move the camera so the pinned point projects
   * exactly there (rotation, focal and distance unchanged).
   */
  setAxisOrigin(p: V2 | null, quiet = false): boolean {
    const g = this.group;
    this.axisOrigins = { ...this.axisOrigins, [g]: p ? ([p[0], p[1]] as V2) : null };
    if (!p) {
      if (!quiet) this.say(T.axisOrigin.cleared);
      return true;
    }
    const cam = this.camObj;
    const X = this.anchorPoint(g);
    const d = depthOf(cam, X);
    const next = d > 0 ? anchorCam(cam, X, p, d) : null;
    if (!next || !this.saneCam(next)) {
      if (!quiet) this.say(T.axisOrigin.setNoCam);
      return false;
    }
    this.cam = this.toWorld(next);
    if (!quiet) this.say(T.axisOrigin.set);
    return true;
  }
  /** Flip one axis direction (and a second one, keeping the frame right-handed); the origin stays on its pixel. */
  flipOriginAxis(axis: Axis): void {
    const cam = this.camObj;
    const g = this.anchorGroup ?? this.group;
    const X = this.anchorPoint(g);
    const uv = this.axisOrigins[g] ?? project(cam, X);
    const d = depthOf(cam, X);
    // flip in the group's frame: R_obj · (A F Aᵀ) with A = the group's axes (yaw only for the room)
    const A = this.frameAxes(g);
    const Am: M3 = [
      [A[0][0], A[1][0], A[2][0]],
      [A[0][1], A[1][1], A[2][1]],
      [A[0][2], A[1][2], A[2][2]],
    ];
    const { R: AF, flipped } = flipAxisR(Am, axis);
    const R = mulMM(cam.R, mulMM(AF, transpose(Am)));
    let next: Cam = { ...cam, R };
    if (uv && d > 0) next = anchorCam(next, X, uv, d);
    if (!this.saneCam(next)) return;
    this.cam = this.toWorld(next);
    const N = ['X', 'Y', 'Z'];
    const c = [0, 1, 2].find((k) => !flipped.includes(k as Axis))!;
    this.say(T.axisOrigin.flipped(N[flipped[0]]!, N[flipped[1]]!, N[c]!));
  }
  /** Axis origins in FULL px (rounded like the lines). */
  private axisOriginFull(): { object: V2 | null; room: V2 | null } {
    const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
    const f = (p: V2 | null) => (p ? (toFull(p, this.crop).map(r4) as V2) : null);
    return { object: f(this.axisOrigins.object), room: f(this.axisOrigins.room) };
  }
  /** `axisOrigin` block of the source file: only written once an origin is set (older files stay byte-identical). */
  private axisOriginFile(): { axisOrigin?: { object: V2 | null; room: V2 | null } } {
    const o = this.axisOriginFull();
    return o.object || o.room ? { axisOrigin: o } : {};
  }
  solvePosition(): boolean {
    if (this.completePairs.length < 2) {
      this.say(t('editor.match.pairs.needTwo'));
      return false;
    }
    const cam = solvePosition(this.camObj, this.completePairs);
    if (!cam) {
      this.say(t('editor.match.pairs.positionFailed'));
      return false;
    }
    this.cam = this.toWorld(cam);
    this.say(t('editor.match.pairs.positionSet'));
    return true;
  }
  solveAll(): boolean {
    const n = this.completePairs.length;
    if (n < 4) {
      this.say(t('editor.match.pairs.refineNeedsFour'));
      return false;
    }
    const usePrincipal = this.principal === 'free' && n >= 6;
    let start = this.camObj;
    // start from a sane position if the camera is far off
    start = solvePosition(start, this.completePairs) ?? start;
    const cam = solveFull(start, this.refineLines(), this.completePairs, { fixedF: this.lockLens, principal: usePrincipal, parallel: this.parallelAxes });
    this.cam = this.toWorld(cam);
    this.say(t('editor.match.pairs.refined', { n, principal: usePrincipal ? t('editor.match.pairs.refinedPrincipalTag') : '' }));
    return true;
  }
  /** Only the selected parameters, keeping the rest (used after numeric edits). */
  refineRotation(): void {
    this.cam = this.toWorld(refine(this.camObj, this.refineLines(), this.completePairs, { f: false, rotation: true, position: false, principal: false, parallel: this.parallelAxes }).cam);
  }
  flip(): void {
    this.cam = this.toWorld(turnAround(this.camObj));
  }
  resetCamera(): void {
    // the stored Blender camera is crop-centred (its own fit); the next line solve moves cx/cy to the
    // full-image centre when the principal mode is 'center'
    // the stored camera belongs to the model at the origin: keep that view of the (placed) object
    this.cam = this.toWorld(clone(this.stored));
    this.say(t('editor.match.camera.resetToStored'));
  }

  // ---------- numeric values ----------
  get lens(): number {
    return lensMm(this.cam.f, this.width);
  }
  get hfov(): number {
    return hfovDeg(this.cam.f, this.width);
  }
  get wideLens(): number | null {
    const m = this.asset.ref?.mockup;
    return m ? lensMm(this.cam.f * this.crop.s, m.width) : null;
  }
  get wideHfov(): number | null {
    const m = this.asset.ref?.mockup;
    return m ? hfovDeg(this.cam.f * this.crop.s, m.width) : null;
  }
  /** Lens (mm, crop-width convention like `lens`) of a focal given in full-image px. */
  lensOfFull(fFull: number): number {
    return lensMm(fFull / this.crop.s, this.width);
  }
  get euler(): V3 {
    return blenderEulerDeg(this.cam.R);
  }
  setLens(mm: number): void {
    if (!(mm > 1)) return;
    this.cam = { ...this.cam, f: focalFromLens(mm, this.width) };
  }
  setPosition(axis: 0 | 1 | 2, cm: number): void {
    if (!Number.isFinite(cm)) return;
    const C = [...this.cam.C] as V3;
    C[axis] = cm;
    this.cam = { ...this.cam, C };
  }
  setEuler(axis: 0 | 1 | 2, deg: number): void {
    if (!Number.isFinite(deg)) return;
    const e = this.euler;
    e[axis] = deg;
    this.cam = { ...this.cam, R: fromBlenderEulerDeg(e) };
  }
  setPrincipal(axis: 0 | 1, px: number): void {
    if (!Number.isFinite(px)) return;
    this.cam = axis === 0 ? { ...this.cam, cx: px } : { ...this.cam, cy: px };
  }

  // ---------- overlay geometry ----------
  vpOf(axis: Axis): V2 | null {
    return dehom(vanishingPoint(this.camObj, axis));
  }
  /** Project a model point (object frame, Blender cm), e.g. a point pair's model end. */
  projectPoint(p: V3): V2 | null {
    return project(this.camObj, p);
  }

  // ---------- persistence / export ----------
  get storageKey(): string {
    return `kido-cam:${this.asset.slug}`;
  }
  save(): void {
    const data: Saved = {
      v: 2,
      cam: this.cam,
      crop: { ...this.crop },
      lines: this.groupedFullLines(),
      master: this.masterMap(),
      ghost: this.ghost,
      rays: this.rays,
      roomAligned: this.roomAligned,
      roomYaw: this.roomYaw,
      pairs: $state.snapshot(this.pairs) as PointPair[],
      image: this.image,
      principal: this.principal,
      lockLens: this.lockLens,
      snap: this.snap,
      modelDiff: this.diff,
      edgeMode: this.edgeMode,
      edgeSnap: this.edgeSnap,
      lockVp: this.lockVp,
      vpModes: [...this.vpModes] as VpModes,
      axisOrigin: this.axisOriginFull(),
      originUseDetected: this.originUseDetected,
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      /* storage full or blocked */
    }
    this.onSave?.();
  }
  /** Called after every save (the view refreshes its "unsaved to source file" list). */
  onSave: (() => void) | null = null;
  private restore(): boolean {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      return this.restoreFrom(JSON.parse(raw) as Saved);
    } catch {
      return false;
    }
  }
  private restoreFrom(d: Saved): boolean {
    try {
      if ((d.v !== 1 && d.v !== 2) || !d.cam?.R) return false;
      this.cam = d.cam;
      this.image = d.image === 'wide' && this.asset.ref?.mockup ? 'wide' : 'crop';
      let groups: { object: GuideLine[]; room: GuideLine[] };
      if (d.v === 1) {
        // v1: one list in crop px, drawn on the view that was open → split by view / crop bounds
        groups = migrateV1Lines(d.lines ?? [], this.image, { w: this.width, h: this.height });
      } else {
        // v2: full px with the crop transform they were saved with (falls back to the asset's)
        const t = d.crop && d.crop.s > 0 ? d.crop : this.crop;
        const back = (g: LineGroup) =>
          pruneLinks((d.lines ?? []).filter((l) => (l.group ?? 'object') === g).map(({ group: _g, ...l }) => lineToCrop(l as GuideLine, t)));
        groups = { object: back('object'), room: back('room') };
        this.ghost = d.ghost !== false;
        this.rays = d.rays !== false;
        this.roomAligned = d.roomAligned !== false;
        this.roomYaw = Number.isFinite(d.roomYaw) ? d.roomYaw! : 0;
      }
      // axis origin: v2 only (full px → crop px with the stored transform); absent = not set
      {
        const t = d.v === 2 && d.crop && d.crop.s > 0 ? d.crop : this.crop;
        const o = d.v === 2 ? d.axisOrigin : null;
        this.axisOrigins = { object: isPt(o?.object) ? toCrop(o.object, t) : null, room: isPt(o?.room) ? toCrop(o.room, t) : null };
        this.originUseDetected = d.originUseDetected !== false;
      }
      // masters: the stored map wins, then line flags (drafts), then the default rule (first line per axis)
      const stored = parseMasterMap(d.master);
      applyMasterIds(groups.object, stored?.object);
      applyMasterIds(groups.room, stored?.room);
      this.lines = this.group === 'room' ? groups.room : groups.object;
      this.otherLines = this.group === 'room' ? groups.object : groups.room;
      this.pairs = d.pairs ?? [];
      this.principal = d.principal ?? 'center';
      this.lockLens = !!d.lockLens;
      this.snap = d.snap !== false;
      // the model diff used to default to 'drag'; it is now opt-in (saved as modelDiff)
      this.diff = d.modelDiff === 'always' || d.modelDiff === 'drag' ? d.modelDiff : 'off';
      this.edgeMode = d.edgeMode === 'always' || d.edgeMode === 'off' ? d.edgeMode : 'drag';
      this.edgeSnap = d.edgeSnap === true;
      this.lockVp = d.lockVp === true;
      this.vpModes = [0, 1, 2].map((a) => (d.vpModes?.[a] === 'parallel' ? 'parallel' : 'auto')) as VpModes;
      this.nextId = 1 + Math.max(0, ...this.lines.map((l) => l.id), ...this.otherLines.map((l) => l.id), ...this.pairs.map((p) => p.id));
      return true;
    } catch {
      return false;
    }
  }
  hasSaved(): boolean {
    try {
      return !!localStorage.getItem(this.storageKey);
    } catch {
      return false;
    }
  }
  forget(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* ignore */
    }
  }
  /** Both groups, tagged, in FULL-image px. */
  groupedFullLines(): GroupedLine[] {
    return [
      ...this.fullLines(this.objectLines).map((l) => ({ ...l, group: 'object' as const })),
      ...this.fullLines(this.roomLines).map((l) => ({ ...l, group: 'room' as const })),
    ];
  }
  /** Room block of the export: crop transform, yaw, and the room-frame camera / model placement. */
  private roomExport(): object {
    const yaw = this.yaw;
    const co = this.camObj;
    const camRoom = { ...co, R: mulMM(co.R, transpose(rotZ(yaw))), C: mulMV(rotZ(yaw), co.C) };
    const ag = this.agreement;
    const r = (v: number | null | undefined, k = 3) => (v === null || v === undefined ? null : Math.round(v * 10 ** k) / 10 ** k);
    const full = camToFull(this.cam, this.crop);
    return {
      crop: { ...this.crop, note: 'full px = (x + s·u, y + s·v) for crop px (u, v)' },
      fullImage: [this.full.w, this.full.h],
      intrinsicsFullPx: { f: r(full.f), cx: r(full.cx), cy: r(full.cy) },
      aligned: this.roomAligned,
      vpModes: [...this.vpModes],
      yawDeg: r(yaw, 4),
      yawConvention: 'X_room = Rz(yaw)·X_obj (Blender Z up); the model is rotated by yaw about Z when placed in the room',
      modelPlacement: {
        blenderRotationEulerDeg: [0, 0, r(yaw, 4)],
        threeRotationYDeg: r(yaw, 4),
      },
      objectPlacement: this.placement
        ? { ...$state.snapshot(this.placement), note: 'whole-object placement in the scene (Blender cm / deg); camera = world, roomCamera = object frame' }
        : null,
      roomCamera: { R: camRoom.R, C: camRoom.C, blenderEulerDeg: blenderEulerDeg(camRoom.R).map((v) => r(v, 4)) },
      agreement: ag
        ? {
            axesDeg: ag.axes.map((a) => r(a.deg, 4)),
            bands: ag.axes.map((a) => a.band),
            focalObjectPx: r(ag.fObject),
            focalRoomPx: r(ag.fRoom),
            focalDiffPct: r(ag.fDiffPct, 2),
            overall: ag.band,
          }
        : null,
      linesFullPx: this.groupedFullLines(),
    };
  }
  camJson(dims: V3): object {
    return camJson(this.cam, this.width, this.height, dims, this.asset.ref?.camParams);
  }
  fullJson(dims: V3): object {
    return fullExport(this.cam, {
      asset: this.asset,
      dims,
      lines: [
        ...($state.snapshot(this.objectLines) as GuideLine[]).map((l) => ({ ...l, group: 'object' })),
        ...($state.snapshot(this.roomLines) as GuideLine[]).map((l) => ({ ...l, group: 'room' })),
      ],
      pairs: $state.snapshot(this.pairs) as PointPair[],
      residual: this.residual,
      image: this.image === 'wide' ? 'mockup (full)' : 'crop',
      room: this.roomExport(),
    });
  }
}
