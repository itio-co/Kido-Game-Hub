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
};

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
  get fitScale(): number {
    const r = this.imageRect;
    return Math.min(this.stageW / r.w, this.stageH / r.h);
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
    this.center = [r.x + r.w / 2, r.y + r.h / 2];
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
  addLine(axis: Axis): void {
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
    this.lines = this.lines.filter((l) => l.id !== id);
    if (this.selectedLine === id) this.selectedLine = null;
  }
  clearLines(): void {
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
    const lines: GuideLine[] = [];
    for (const [axis, a, b] of edges) {
      const A = by(a);
      const Bp = by(b);
      const pa = A && project(this.cam, A);
      const pb = Bp && project(this.cam, Bp);
      if (pa && pb) lines.push({ id: this.nextId++, axis, a: pa, b: pb });
    }
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
