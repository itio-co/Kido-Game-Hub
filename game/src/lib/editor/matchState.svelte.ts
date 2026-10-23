import type { ShowcaseAsset } from '../showcaseAssets';
import {
  dehom,
  fitVanishingPoint,
  fromBlenderEulerDeg,
  blenderEulerDeg,
  mulMV,
  project,
  refine,
  rmsErrors,
  solveFromLines,
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

export type ImageChoice = 'crop' | 'wide';
export type PrincipalMode = 'center' | 'vp3' | 'free';
export type PickStep = { pairId: number; want: 'model' | 'image' } | null;

type Saved = {
  v: 1;
  cam: Cam;
  lines: GuideLine[];
  pairs: PointPair[];
  image: ImageChoice;
  principal: PrincipalMode;
  lockLens: boolean;
  /** Guide-line snapping on/off (optional; default on). */
  snap?: boolean;
  /** Difference view of model vs mock-up (optional; default 'drag'). */
  diff?: DiffMode;
};
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

  cam = $state.raw<Cam>(null as unknown as Cam);
  lines = $state<GuideLine[]>([]);
  pairs = $state<PointPair[]>([]);
  image = $state<ImageChoice>('crop');
  principal = $state<PrincipalMode>('center');
  lockLens = $state(false);
  /** "แม่เหล็กเส้น": snap dragged guide lines to lines of other axes. */
  snap = $state(true);
  diff = $state<DiffMode>('drag');
  /** A guide line / point is being dragged (live solve + diff view). */
  dragging = $state(false);
  /** The last live solve failed; the camera stays at the last good solve. */
  liveFail = $state(false);
  private liveBase: Cam | null = null;
  /** Undo/redo stacks for guide-line edits (snapshots of `lines`). */
  private lineUndo: GuideLine[][] = [];
  private lineRedo: GuideLine[][] = [];
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
    this.cam = clone(this.stored);
    this.center = [ref.width / 2, ref.height / 2];
    if (!this.restore()) this.seedLines();
  }

  // ---------- image / view window ----------
  /** Displayed image rectangle in ref px. */
  get imageRect(): { x: number; y: number; w: number; h: number; src: string } {
    const ref = this.asset.ref!;
    if (this.image === 'wide' && ref.mockup) {
      const m = ref.mockup;
      return { x: -m.crop.x, y: -m.crop.y, w: m.width, h: m.height, src: m.src };
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
    this.image = next;
    if (this.principal === 'center') this.applyPrincipalCentre();
    this.fit();
  }
  /** Principal point at the centre of the displayed image (crop centre or full mock-up centre). */
  applyPrincipalCentre(): void {
    const r = this.imageRect;
    this.cam = { ...this.cam, cx: r.x + r.w / 2, cy: r.y + r.h / 2 };
  }

  // ---------- guide lines ----------
  get vps(): ({ vp: V3; rms: number } | null)[] {
    const frame = { cx: this.cam.cx, cy: this.cam.cy, s: Math.max(this.width, this.height) };
    return ([0, 1, 2] as Axis[]).map((a) => fitVanishingPoint(this.lines.filter((l) => l.axis === a), frame));
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
    this.nextId = Math.max(this.nextId, 1 + Math.max(0, ...this.lines.map((l) => l.id)));
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
  seedLines(): void {
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
  solveLines(): boolean {
    const prior = this.cam;
    const frame = { cx: prior.cx, cy: prior.cy, s: Math.max(this.width, this.height) };
    const res = solveFromLines(this.lines, prior, {
      frame,
      fixedF: this.lockLens,
      principal: this.principal === 'vp3' ? 'vp3' : 'fixed',
    });
    if (!res.ok || !res.cam) {
      this.say(res.message ?? 'คำนวณไม่สำเร็จ');
      return false;
    }
    let cam = res.cam;
    if (this.completePairs.length >= 2) cam = solvePosition(cam, this.completePairs) ?? cam;
    else cam = this.keepAnchor(prior, cam);
    this.cam = cam;
    this.say(`คำนวณจากเส้นแล้ว · เลนส์ ${lensMm(cam.f, this.width).toFixed(1)} มม.`);
    return true;
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
        const frame = { cx: base.cx, cy: base.cy, s: Math.max(this.width, this.height) };
        const res = solveFromLines(this.lines, base, { frame, fixedF: this.lockLens, principal: this.principal === 'vp3' ? 'vp3' : 'fixed' });
        if (res.ok && res.cam) cam = pairs.length >= 2 ? (solvePosition(res.cam, pairs) ?? res.cam) : this.keepAnchor(base, res.cam);
      } else if (pairs.length >= 4) {
        const start = solvePosition(base, pairs) ?? base;
        cam = solveFull(start, this.lines, pairs, { fixedF: this.lockLens, principal: this.principal === 'free' && pairs.length >= 6 });
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
    const cam = solveFull(start, this.lines, this.completePairs, { fixedF: this.lockLens, principal: usePrincipal });
    this.cam = cam;
    this.say(`ปรับละเอียดแล้ว (${n} คู่${usePrincipal ? ' + จุดกึ่งกลางภาพ' : ''})`);
    return true;
  }
  /** Only the selected parameters, keeping the rest (used after numeric edits). */
  refineRotation(): void {
    this.cam = refine(this.cam, this.lines, this.completePairs, { f: false, rotation: true, position: false, principal: false }).cam;
  }
  flip(): void {
    this.cam = turnAround(this.cam);
  }
  resetCamera(): void {
    this.cam = clone(this.stored);
    if (this.principal === 'center') this.applyPrincipalCentre();
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
    return m ? lensMm(this.cam.f, m.width) : null;
  }
  get wideHfov(): number | null {
    const m = this.asset.ref?.mockup;
    return m ? hfovDeg(this.cam.f, m.width) : null;
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
      v: 1,
      cam: this.cam,
      lines: $state.snapshot(this.lines),
      pairs: $state.snapshot(this.pairs) as PointPair[],
      image: this.image,
      principal: this.principal,
      lockLens: this.lockLens,
      snap: this.snap,
      diff: this.diff,
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
      if (d.v !== 1 || !d.cam?.R) return false;
      this.cam = d.cam;
      this.lines = d.lines ?? [];
      this.pairs = d.pairs ?? [];
      this.image = d.image === 'wide' && this.asset.ref?.mockup ? 'wide' : 'crop';
      this.principal = d.principal ?? 'center';
      this.lockLens = !!d.lockLens;
      this.snap = d.snap !== false;
      this.diff = d.diff === 'always' || d.diff === 'off' ? d.diff : 'drag';
      this.nextId = 1 + Math.max(0, ...this.lines.map((l) => l.id), ...this.pairs.map((p) => p.id));
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
  camJson(dims: V3): object {
    return camJson(this.cam, this.width, this.height, dims, this.asset.ref?.camParams);
  }
  fullJson(dims: V3): object {
    return fullExport(this.cam, {
      asset: this.asset,
      dims,
      lines: $state.snapshot(this.lines),
      pairs: $state.snapshot(this.pairs) as PointPair[],
      residual: this.residual,
      image: this.image === 'wide' ? 'mockup (full)' : 'crop',
    });
  }
}
