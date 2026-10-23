import type { ShowcaseAsset } from '../showcaseAssets';
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
} from './camMath';
import { camFromMatched, camJson, focalFromLens, fullExport, hfovDeg, lensMm, type ViewRect } from './cameraMatch';
import type { DisplayMode } from './modelEditor';
import { jointMembers, linkEnds, removeLineLinks, unlinkEnd, type EndRef } from './guideSnap';
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
  /** v2: faint other-group lines shown. */
  ghost?: boolean;
  /** v2: "เส้นต่อถึงขอบ". */
  rays?: boolean;
  /** v2: "วัตถุวางตรงกับห้อง". */
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
  /** "ล็อกเข้าจุดลับตา" (optional; default off). */
  lockVp?: boolean;
  /** Per-axis VP mode ('auto' | 'parallel'), shared by both groups (optional; default auto). */
  vpModes?: VpModes;
};
export type EdgeMode = 'drag' | 'always' | 'off';

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
export class MatchState {
  readonly asset: ShowcaseAsset;
  readonly width: number;
  readonly height: number;
  readonly stored: Cam;
  /** Crop → full-image transform (identity when the asset has no mock-up). */
  readonly crop: CropT;
  /** Full image size in its own px. */
  readonly full: { w: number; h: number };

  cam = $state.raw<Cam>(null as unknown as Cam);
  /** Guide lines of the ACTIVE group (the one drawn on the current view); crop px. */
  lines = $state<GuideLine[]>([]);
  /** Lines of the other group (crop px), shown as a faint ghost. */
  otherLines = $state<GuideLine[]>([]);
  /** Show the other group's lines faintly (and let lines snap to them). */
  ghost = $state(true);
  /** "เส้นต่อถึงขอบ": draw every guide line as a ray from its VP, through the segment, on to the view edge. */
  rays = $state(true);
  /** "วัตถุวางตรงกับห้อง": object axes = room axes (X/Y/Z VPs shared). Off: only the vertical is shared. */
  roomAligned = $state(true);
  /** Object yaw relative to the room (deg, Blender Z): X_room = Rz(yaw)·X_obj. Solved when not aligned. */
  roomYaw = $state(0);
  /** Lines to outline after tapping a disagreeing axis in the agreement panel. */
  highlight = $state<{ axis: Axis; ids: number[] } | null>(null);
  pairs = $state<PointPair[]>([]);
  image = $state<ImageChoice>('crop');
  principal = $state<PrincipalMode>('center');
  lockLens = $state(false);
  /** "แม่เหล็กเส้น": snap dragged guide lines to lines of other axes. */
  snap = $state(true);
  /** Model difference-blend ("โหมดเทียบความต่าง"): off by default — line editing compares lines with image edges. */
  diff = $state<DiffMode>('off');
  /** Guide line ↔ mock-up edges: 'drag' = edge overlay while dragging, 'always', 'off'. */
  edgeMode = $state<EdgeMode>('drag');
  /** "ดูดเข้าขอบภาพ" while dragging (below corner/axis snap; Alt disables). */
  edgeSnap = $state(false);
  /** Edge map of the current view image (null while computing / unavailable). */
  edgeMap = $state.raw<EdgeMap | null>(null);
  /** Blob URL of the painted edge overlay of the current view image. */
  edgeUrl = $state<string | null>(null);
  /** Natural size of the current view image (edge map / image px space). */
  private edgeNat = { w: 1, h: 1 };
  private static edgeCache = new Map<string, Promise<{ map: EdgeMap; url: string; w: number; h: number } | null>>();
  /** "ล็อกเข้าจุดลับตา": a dragged endpoint keeps its line aimed at the VP of the other lines of its axis. */
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
  private nextId = 1;

  constructor(asset: ShowcaseAsset) {
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
    if (!this.restore()) this.seedLines();
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
  /** Strip kept free under the image at fit, so the zoom buttons never cover it (phones). */
  static readonly PAD_BOTTOM = 60;
  get fitScale(): number {
    const r = this.imageRect;
    return Math.min(this.stageW / r.w, Math.max(this.stageH * 0.5, this.stageH - MatchState.PAD_BOTTOM) / r.h);
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
  fit(): void {
    const r = this.imageRect;
    this.zoom = 1;
    const pad = Math.min(MatchState.PAD_BOTTOM, this.stageH * 0.5);
    this.center = [r.x + r.w / 2, r.y + r.h / 2 + pad / 2 / this.fitScale];
  }
  zoomAt(factor: number, at?: V2): void {
    const z = Math.min(40, Math.max(0.5, this.zoom * factor));
    const p = at ?? this.center;
    const f = this.zoom / z;
    this.center = [p[0] + (this.center[0] - p[0]) * f, p[1] + (this.center[1] - p[1]) * f];
    this.zoom = z;
  }
  setImage(next: ImageChoice): void {
    const before = this.group;
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
  /** Group edited on the current view: crop = "วัตถุ" (object), full mock-up = "ห้อง" (room). */
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
  /** Object ↔ room agreement ("ความสอดคล้อง วัตถุ↔ห้อง"); null until both groups have lines. */
  readonly agreement = $derived.by((): Agreement | null => {
    const o = this.objectLines;
    const r = this.roomLines;
    if (!o.length || !r.length) return null;
    try {
      return agreementOf(this.fullLines(o), this.fullLines(r), camToFull(this.cam, this.crop), this.yaw, this.fullFrame(this.cam), 3, this.vpModes);
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
   * One-tap suggestion per axis to switch to "ขนาน": the free VP is > 20 image diagonals away, or forcing parallel
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
   * "รวมจุดลับตา": turn every line of `axis` (or of all axes) so it passes exactly through the consolidated VP.
   * Undoable; lines with both ends linked are skipped and reported.
   */
  consolidate(axis?: Axis, mode?: VpMode): { moved: number; skipped: number; message: string } {
    // "รวม X" → back to a free (finite) VP; "ขนาน X" → parallel; "รวมจุดลับตา" (all) keeps each axis' mode
    if (axis !== undefined && mode) this.setVpMode(axis, mode);
    const axes = axis === undefined ? ([0, 1, 2] as Axis[]) : [axis];
    const ready = axes.filter((a) => this.vpFits[a]);
    const name = axis === undefined ? '' : ` แกน ${['X', 'Y', 'Z'][axis]}`;
    const par = axis !== undefined && this.vpModes[axis] === 'parallel';
    if (!ready.length) {
      return { moved: 0, skipped: 0, message: `ต้องมีอย่างน้อย 2 เส้น${name || 'ในแกนเดียวกัน'} ก่อน${par ? 'ทำให้ขนาน' : 'รวมจุดลับตา'}` };
    }
    this.pushLines();
    const r = consolidateLines($state.snapshot(this.lines) as GuideLine[], ready, this.vpFrame, 1e-6, this.vpModes);
    if (!r.moved.length) this.dropLastPush();
    else this.lines = r.lines;
    let message = par
      ? r.moved.length
        ? `ทำให้เส้น${name} ขนานกันแล้ว · ปรับ ${r.moved.length} เส้นตามทิศเฉลี่ย (จุดลับตาที่ ∞)`
        : `เส้น${name} ขนานกันอยู่แล้ว`
      : r.moved.length
        ? `รวมจุดลับตา${name}แล้ว · ปรับ ${r.moved.length} เส้นให้ผ่านจุดลับตาเดียวกัน`
        : `เส้น${name}ผ่านจุดลับตาเดียวกันอยู่แล้ว`;
    if (r.skipped.length) message += ` · ข้าม ${r.skipped.length} เส้น (ปลายทั้งสองเชื่อมมุมอยู่ — แยกมุมก่อน)`;
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
    this.lines.push({ id, axis, a: [cx - dir[0]! * len * 0.5, cy - dir[1]! * len * 0.5], b: [cx + dir[0]! * len * 0.5, cy + dir[1]! * len * 0.5] });
    this.selectedLine = id;
  }
  removeLine(id: number | null): void {
    if (id === null) return;
    this.pushLines();
    removeLineLinks(this.lines, id);
    this.lines = this.lines.filter((l) => l.id !== id);
    if (this.selectedLine === id) this.selectedLine = null;
  }
  clearLines(): void {
    this.pushLines();
    this.lines = [];
    this.selectedLine = null;
  }
  /** Two guide lines per axis along the model's box edges, as seen by the current camera. */
  seedLines(): boolean {
    if (this.group === 'room') {
      this.say('เส้นห้องวางเองตามขอบผนัง พื้น เพดาน ประตู (กล้องปัจจุบันไม่รู้รูปทรงห้อง)');
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
      const pa = A && project(this.cam, A);
      const pb = Bp && project(this.cam, Bp);
      if (!pa || !pb) continue;
      const id = this.nextId++;
      lines.push({ id, axis, a: pa, b: pb });
      at.set(a, [...(at.get(a) ?? []), { line: id, end: 'a' }]);
      at.set(b, [...(at.get(b) ?? []), { line: id, end: 'b' }]);
    }
    // box corners shared by lines of different axes start as linked corners
    for (const ends of at.values()) for (let i = 1; i < ends.length; i++) linkEnds(lines, ends[0]!, ends[i]!);
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
    return rmsErrors(this.cam, this.lines, this.completePairs);
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
    const prior = this.cam;
    const res = this.jointSolve(prior);
    if (!res.cam) {
      this.say(res.message ?? 'คำนวณไม่สำเร็จ');
      return false;
    }
    let cam = res.cam;
    if (this.completePairs.length >= 2) cam = solvePosition(cam, this.completePairs) ?? cam;
    else cam = this.keepAnchor(prior, cam);
    this.cam = cam;
    if (!this.roomAligned && res.yawSolved) this.roomYaw = res.yaw;
    const groups = this.objectLines.length && this.roomLines.length ? ' (วัตถุ+ห้อง)' : '';
    const yaw = this.roomAligned ? '' : ` · วัตถุหมุน ${this.roomYaw.toFixed(1)}°`;
    this.say(`คำนวณจากเส้นแล้ว${groups} · เลนส์ ${lensMm(cam.f, this.width).toFixed(1)} มม.${yaw}${res.message ? ` · ${res.message}` : ''}`);
    return true;
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
   * "ดูดเข้าขอบภาพ": refine the selected line (or all lines) onto the image edges. Linked corners stay fixed
   * (the line pivots about them). Undoable as one step.
   */
  edgeRefine(which: 'selected' | 'all'): { moved: number; message: string } {
    if (!this.edgeMap) return { moved: 0, message: 'กำลังเตรียมขอบภาพ… ลองอีกครั้ง' };
    const ids = which === 'all' ? this.lines.map((l) => l.id) : this.selectedLine !== null ? [this.selectedLine] : [];
    if (!ids.length) return { moved: 0, message: 'เลือกเส้นก่อน (แตะเส้น) หรือกด “ทุกเส้น”' };
    this.pushLines();
    let moved = 0;
    let fixedBoth = 0;
    const before: number[] = [];
    const after: number[] = [];
    for (const id of ids) {
      const l = this.lines.find((x) => x.id === id);
      if (!l) continue;
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
      ? `ดูดเข้าขอบภาพแล้ว ${moved} เส้น · ห่างขอบเฉลี่ย ${avg(before).toFixed(1)} → ${avg(after).toFixed(1)} px`
      : 'เส้นอยู่บนขอบภาพแล้ว หรือไม่พบขอบที่ชัดพอใกล้เส้น';
    if (fixedBoth) message += ` · ข้าม ${fixedBoth} เส้น (ปลายทั้งสองเชื่อมมุม)`;
    return { moved, message };
  }
  get showDiff(): boolean {
    return this.diff === 'always' || (this.diff === 'drag' && this.dragging);
  }
  beginLive(): void {
    this.dragging = true;
    this.liveFail = false;
    this.liveBase = this.cam;
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
    const base = this.liveBase ?? this.cam;
    const pairs = this.completePairs;
    let cam: Cam | null = null;
    try {
      if (what === 'lines') {
        const res = this.jointSolve(base);
        if (res.cam) cam = pairs.length >= 2 ? (solvePosition(res.cam, pairs) ?? res.cam) : this.keepAnchor(base, res.cam);
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
    const finite = !!cam && [cam.f, cam.cx, cam.cy, ...cam.C, ...cam.R.flat()].every(Number.isFinite) && cam.f > 0;
    this.liveFail = !finite;
    if (finite) this.cam = cam!;
    return finite;
  }
  /** Keep the model origin at the same pixel and depth as in `prior`. */
  private keepAnchor(prior: Cam, cam: Cam): Cam {
    const o: V3 = [0, 0, 0];
    const uv = project(prior, o);
    const depth = mulMV(prior.R, sub(o, prior.C))[2];
    if (!uv || depth <= 0) return cam;
    // scale depth with the focal change so the model keeps its on-screen size
    const d = depth * (cam.f / prior.f);
    const t: V3 = [((uv[0] - cam.cx) / cam.f) * d, ((uv[1] - cam.cy) / cam.f) * d, d];
    // C = −Rᵀ t
    const Rt = [
      [cam.R[0][0], cam.R[1][0], cam.R[2][0]],
      [cam.R[0][1], cam.R[1][1], cam.R[2][1]],
      [cam.R[0][2], cam.R[1][2], cam.R[2][2]],
    ];
    const C = Rt.map((row) => -(row[0]! * t[0] + row[1]! * t[1] + row[2]! * t[2])) as V3;
    return { ...cam, C };
  }
  solvePosition(): boolean {
    if (this.completePairs.length < 2) {
      this.say('ต้องมีคู่จุดครบอย่างน้อย 2 คู่');
      return false;
    }
    const cam = solvePosition(this.cam, this.completePairs);
    if (!cam) {
      this.say('คำนวณตำแหน่งไม่ได้ ลองเลือกจุดที่ห่างกันมากขึ้น');
      return false;
    }
    this.cam = cam;
    this.say('ตั้งตำแหน่ง/ระยะกล้องจากคู่จุดแล้ว');
    return true;
  }
  solveAll(): boolean {
    const n = this.completePairs.length;
    if (n < 4) {
      this.say('คำนวณละเอียดต้องมีคู่จุดอย่างน้อย 4 คู่');
      return false;
    }
    const usePrincipal = this.principal === 'free' && n >= 6;
    let start = this.cam;
    // start from a sane position if the camera is far off
    start = solvePosition(start, this.completePairs) ?? start;
    const cam = solveFull(start, this.refineLines(), this.completePairs, { fixedF: this.lockLens, principal: usePrincipal, parallel: this.parallelAxes });
    this.cam = cam;
    this.say(`ปรับละเอียดแล้ว (${n} คู่${usePrincipal ? ' + จุดกึ่งกลางภาพ' : ''})`);
    return true;
  }
  /** Only the selected parameters, keeping the rest (used after numeric edits). */
  refineRotation(): void {
    this.cam = refine(this.cam, this.refineLines(), this.completePairs, { f: false, rotation: true, position: false, principal: false, parallel: this.parallelAxes }).cam;
  }
  flip(): void {
    this.cam = turnAround(this.cam);
  }
  resetCamera(): void {
    // the stored Blender camera is crop-centred (its own fit); the next line solve moves cx/cy to the
    // full-image centre when the principal mode is 'center'
    this.cam = clone(this.stored);
    this.say('กลับเป็นกล้องที่บันทึกไว้กับโมเดล');
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
    return dehom(vanishingPoint(this.cam, axis));
  }
  projectPoint(p: V3): V2 | null {
    return project(this.cam, p);
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
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch {
      /* storage full or blocked */
    }
  }
  private restore(): boolean {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return false;
      const d = JSON.parse(raw) as Saved;
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
    const camRoom = { ...this.cam, R: mulMM(this.cam.R, transpose(rotZ(yaw))), C: mulMV(rotZ(yaw), this.cam.C) };
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
