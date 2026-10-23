/**
 * Object ↔ room guide-line groups for camera matching (pure functions, no DOM / Svelte).
 *
 * Two groups of guide lines describe ONE photo:
 *   - 'object' ("วัตถุ") — drawn on the crop (the item itself),
 *   - 'room'   ("ห้อง")  — drawn on the full mock-up (walls, floor, furniture around it).
 * The crop is a sub-rectangle of the full image, so both groups live in one coordinate system once the crop
 * transform is applied:   full = (x + s·u, y + s·v)   for a crop px (u, v)   (CropT = { x, y, s }).
 * The camera is the same for both; only the principal point / focal must be taken in FULL-image terms
 * (the principal point is the full-image centre, not the crop centre).
 *
 * Joint solve:
 *   - aligned ("วัตถุวางตรงกับห้อง"): the object stands square to the room → the X/Y/Z lines of both groups
 *     share one VP per axis; it is plain solveFromLines on the union.
 *   - yawed: only the vertical is shared (horizon, tilt, focal). The object is turned about Z by ψ (yaw):
 *     X_room = Rz(ψ) · X_obj, so the room's axis a seen in object coordinates is Rz(−ψ)·e_a and
 *     R_room = R_obj · Rz(ψ)ᵀ. One Levenberg–Marquardt fit over rotation, focal and ψ.
 * Parallel axes (VpMode 'parallel', one set of modes shared by both groups): the axis' VP is forced to infinity.
 * When aligned this holds for both groups' lines of that axis; when yawed, Z parallel (level camera) holds for both,
 * and X/Y parallel constrains each group's own X/Y direction. The agreement flags a group whose lines of a
 * parallel axis clearly are NOT parallel (> 1° RMS from their mean direction).
 * Agreement: per axis, the angle between the object-group VP direction and the room-group VP direction
 * (after undoing ψ) — 0° when the two drawings describe the same camera.
 */
import {
  dot,
  lineResidual,
  PARALLEL_WEIGHT,
  mulMM,
  mulMV,
  orthonormalize,
  rodrigues,
  solveFromLines,
  solveLinear,
  transpose,
  unit,
  type Axis,
  type Cam,
  type GuideLine,
  type M3,
  type V2,
  type V3,
} from './camMath.ts';
import { AUTO_MODES, angleToVp, fitParallel, fitVPMode, type Frame, type VpMode } from './vpFit.ts';

export type LineGroup = 'object' | 'room';
export type GroupedLine = GuideLine & { group: LineGroup };
/** Crop → full-image transform: full = (x + s·u, y + s·v). */
export type CropT = { x: number; y: number; s: number };
export type Band = 'good' | 'warn' | 'bad';

export const IDENTITY_CROP: CropT = { x: 0, y: 0, s: 1 };
export const GROUP_NAMES: Record<LineGroup, string> = { object: 'วัตถุ', room: 'ห้อง' };

const D = 180 / Math.PI;

// ---------- crop transform ----------
export const toFull = (p: V2, t: CropT): V2 => [t.x + t.s * p[0], t.y + t.s * p[1]];
export const toCrop = (p: V2, t: CropT): V2 => [(p[0] - t.x) / t.s, (p[1] - t.y) / t.s];
export function lineToFull<L extends GuideLine>(l: L, t: CropT): L {
  return { ...l, a: toFull(l.a, t), b: toFull(l.b, t) };
}
export function lineToCrop<L extends GuideLine>(l: L, t: CropT): L {
  return { ...l, a: toCrop(l.a, t), b: toCrop(l.b, t) };
}
/** Intrinsics in full-image px (rotation / position unchanged). */
export function camToFull(cam: Cam, t: CropT): Cam {
  return { ...cam, f: cam.f * t.s, cx: t.x + t.s * cam.cx, cy: t.y + t.s * cam.cy };
}
export function camToCrop(cam: Cam, t: CropT): Cam {
  return { ...cam, f: cam.f / t.s, cx: (cam.cx - t.x) / t.s, cy: (cam.cy - t.y) / t.s };
}
/** Centre of the full image, in crop px — the principal point of an un-shifted photo. */
export function fullCentreInCrop(full: { w: number; h: number }, t: CropT): V2 {
  return toCrop([full.w / 2, full.h / 2], t);
}

// ---------- groups / migration ----------
/** Drop link ids that no longer join ≥ 2 endpoints (e.g. a corner split between groups). */
export function pruneLinks<L extends GuideLine>(lines: L[]): L[] {
  const count = new Map<number, number>();
  for (const l of lines) for (const j of Object.values(l.links ?? {})) count.set(j!, (count.get(j!) ?? 0) + 1);
  return lines.map((l) => {
    if (!l.links) return l;
    const links: { a?: number; b?: number } = {};
    if (l.links.a !== undefined && (count.get(l.links.a) ?? 0) >= 2) links.a = l.links.a;
    if (l.links.b !== undefined && (count.get(l.links.b) ?? 0) >= 2) links.b = l.links.b;
    const { links: _old, ...rest } = l;
    return (Object.keys(links).length ? { ...rest, links } : rest) as L;
  });
}

/**
 * v1 saves had ONE list of lines (crop px) drawn on whichever view was open. Split it:
 *   - a line with an endpoint outside the crop rectangle can only have been drawn on the full mock-up → 'room';
 *   - every other line goes to the group of the view that was saved ('wide' → 'room', 'crop' → 'object').
 * Corners shared across the two groups are unlinked (links never cross groups).
 */
export function migrateV1Lines(lines: readonly GuideLine[], view: 'crop' | 'wide', crop: { w: number; h: number }): { object: GuideLine[]; room: GuideLine[] } {
  const inside = (p: V2) => p[0] >= -0.5 && p[1] >= -0.5 && p[0] <= crop.w + 0.5 && p[1] <= crop.h + 0.5;
  const object: GuideLine[] = [];
  const room: GuideLine[] = [];
  for (const l of lines) {
    const c = JSON.parse(JSON.stringify(l)) as GuideLine;
    if (!inside(l.a) || !inside(l.b) || view === 'wide') room.push(c);
    else object.push(c);
  }
  return { object: pruneLinks(object), room: pruneLinks(room) };
}

// ---------- geometry ----------
/** Rotation about Blender Z by `deg` (counter-clockwise seen from above). */
export function rotZ(deg: number): M3 {
  const c = Math.cos(deg / D);
  const s = Math.sin(deg / D);
  return [
    [c, -s, 0],
    [s, c, 0],
    [0, 0, 1],
  ];
}
const E: V3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** Direction (object frame) of guide-line axis `axis` of `group`: room X/Y are the object's turned by −ψ. */
export function axisDir(group: LineGroup, axis: Axis, yawDeg: number): V3 {
  return group === 'room' && axis !== 2 ? mulMV(rotZ(-yawDeg), E[axis]!) : E[axis]!;
}
/** Homogeneous VP of an object-frame direction. */
export function vpOfDir(cam: Cam, d: V3): V3 {
  const r = mulMV(cam.R, d);
  return [cam.f * r[0] + cam.cx * r[2], cam.f * r[1] + cam.cy * r[2], r[2]];
}
/** Object-frame direction of a measured VP (sign-free). */
function dirOfVp(cam: Cam, vp: V3): V3 {
  return mulMV(transpose(cam.R), unit([(vp[0] - cam.cx * vp[2]) / cam.f, (vp[1] - cam.cy * vp[2]) / cam.f, vp[2]]));
}
const wrap180 = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Yaw (deg) of the room relative to the object from the horizontal VPs of `room` lines, given the object camera.
 * Sign-free lines → ψ is defined modulo 180°; the representative nearest `near` is returned. null without a VP.
 */
export function yawFromRoom(cam: Cam, room: readonly GuideLine[], frame: Frame, near = 0, modes: readonly VpMode[] = AUTO_MODES): number | null {
  return yawFrom(cam, room, frame, near, (axis, th) => (axis === 0 ? -th : 90 - th), modes);
}
/** Yaw from the object's horizontal VPs, given the ROOM camera. */
function yawFromObject(camRoom: Cam, object: readonly GuideLine[], frame: Frame, near = 0, modes: readonly VpMode[] = AUTO_MODES): number | null {
  return yawFrom(camRoom, object, frame, near, (axis, th) => (axis === 0 ? th : th - 90), modes);
}
function yawFrom(cam: Cam, lines: readonly GuideLine[], frame: Frame, near: number, toPsi: (axis: 0 | 1, th: number) => number, modes: readonly VpMode[]): number | null {
  let sx = 0;
  let sy = 0;
  for (const axis of [0, 1] as const) {
    const fit = fitVPMode(lines.filter((l) => l.axis === axis), frame, modes[axis]);
    if (!fit) continue;
    const d = dirOfVp(cam, fit.vp);
    const w = Math.hypot(d[0], d[1]);
    if (w < 0.2) continue; // (nearly) vertical — says nothing about yaw
    const psi = toPsi(axis, Math.atan2(d[1], d[0]) * D);
    sx += w * Math.cos((2 * psi) / D);
    sy += w * Math.sin((2 * psi) / D);
  }
  if (sx === 0 && sy === 0) return null;
  const m = (Math.atan2(sy, sx) * D) / 2; // mod 180
  return wrap180(m + 180 * Math.round((near - m) / 180));
}

// ---------- joint solve ----------
export type JointOpts = {
  /** Normalisation frame in FULL px (full-image principal point, max(W, H)). */
  frame: Frame;
  fixedF: boolean;
  principal: 'fixed' | 'vp3';
  /** true = object square to the room (shared X/Y/Z VPs); false = shared vertical only, solve the yaw ψ. */
  aligned: boolean;
  /** Start / kept yaw (deg) for the yawed mode. */
  yaw0?: number;
  /** Per-axis VP modes (shared by both groups). */
  modes?: readonly VpMode[];
};
export type JointResult = { ok: boolean; message?: string; cam?: Cam; yaw: number; yawSolved: boolean };

/** Line residuals (px) of both groups against one camera (object frame) and yaw. */
export function jointResiduals(cam: Cam, object: readonly GuideLine[], room: readonly GuideLine[], yawDeg: number): number[] {
  const vp = (g: LineGroup, a: Axis) => vpOfDir(cam, axisDir(g, a, yawDeg));
  const vps = { object: [0, 1, 2].map((a) => vp('object', a as Axis)), room: [0, 1, 2].map((a) => vp('room', a as Axis)) };
  const r: number[] = [];
  for (const [g, ls] of [['object', object], ['room', room]] as const) {
    for (const l of ls) r.push(lineResidual([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], vps[g][l.axis]!, l.a));
  }
  return r;
}

/** Stiff penalties keeping every parallel axis (of each group that has lines on it) parallel to the image plane. */
export function jointParallelPenalty(cam: Cam, object: readonly GuideLine[], room: readonly GuideLine[], yawDeg: number, modes: readonly VpMode[]): number[] {
  const r: number[] = [];
  for (const a of [0, 1, 2] as Axis[]) {
    if (modes[a] !== 'parallel') continue;
    for (const [g, ls] of [['object', object], ['room', room]] as const) {
      if (a !== 2 && !ls.some((l) => l.axis === a)) continue;
      r.push(PARALLEL_WEIGHT * cam.f * dot(cam.R[2], axisDir(g, a, yawDeg)));
      if (a === 2) break; // shared vertical: once
    }
  }
  return r;
}

/** Small Levenberg–Marquardt with a forward-difference Jacobian. */
function lm(n: number, resid: (x: number[]) => number[], iterations = 80): number[] {
  let x = new Array(n).fill(0) as number[];
  let r = resid(x);
  let cost = r.reduce((s, v) => s + v * v, 0);
  if (!r.length || n === 0) return x;
  let lambda = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const J: number[][] = [];
    for (let k = 0; k < n; k++) {
      const xp = [...x];
      xp[k]! += 1e-6;
      const rp = resid(xp);
      J.push(rp.map((v, m) => (v - r[m]!) / 1e-6));
    }
    const A = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a]!.reduce((s, v, m) => s + v * J[b]![m]!, 0)));
    const g = Array.from({ length: n }, (_, a) => J[a]!.reduce((s, v, m) => s + v * r[m]!, 0));
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const dx = solveLinear(A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v))), g.map((v) => -v));
      if (!dx) {
        lambda *= 10;
        continue;
      }
      const xn = x.map((v, k) => v + dx[k]!);
      const rn = resid(xn);
      const cn = rn.reduce((s, v) => s + v * v, 0);
      if (Number.isFinite(cn) && cn < cost) {
        const gain = cost - cn;
        x = xn;
        r = rn;
        cost = cn;
        lambda = Math.max(lambda / 3, 1e-9);
        improved = true;
        if (gain < 1e-12 * (1 + cost)) it = iterations;
        break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  return x;
}

const hasHorizontal = (ls: readonly GuideLine[]) => ls.some((l) => l.axis !== 2);

/**
 * One camera (focal + rotation, object frame, FULL px) from both groups. Position is untouched (prior.C).
 * Lines and prior must already be in full px.
 */
export function solveJoint(object: readonly GuideLine[], room: readonly GuideLine[], prior: Cam, opts: JointOpts): JointResult {
  const modes = opts.modes ?? AUTO_MODES;
  const base = { frame: opts.frame, fixedF: opts.fixedF, principal: opts.principal, modes };
  const yaw0 = opts.yaw0 ?? 0;
  if (opts.aligned) {
    const res = solveFromLines([...object, ...room], prior, base);
    return res.ok && res.cam ? { ok: true, cam: res.cam, yaw: 0, yawSolved: false } : { ok: false, message: res.message, yaw: 0, yawSolved: false };
  }
  // yawed: start from whichever group pins the rotation on its own (the other group's verticals help)
  const roomZ = room.filter((l) => l.axis === 2);
  const objZ = object.filter((l) => l.axis === 2);
  let init: Cam | null = null;
  let yaw = yaw0;
  let message: string | undefined;
  const a = solveFromLines([...object, ...roomZ], prior, base);
  if (a.ok && a.cam) {
    init = a.cam;
    yaw = yawFromRoom(a.cam, room, opts.frame, yaw0, modes) ?? yaw0;
  } else {
    message = a.message;
    const priorRoom: Cam = { ...prior, R: mulMM(prior.R, transpose(rotZ(yaw0))) };
    const b = solveFromLines([...room, ...objZ], priorRoom, base);
    if (b.ok && b.cam) {
      yaw = yawFromObject(b.cam, object, opts.frame, yaw0, modes) ?? yaw0;
      init = { ...b.cam, R: orthonormalize(mulMM(b.cam.R, rotZ(yaw))) };
    }
  }
  if (!init) return { ok: false, message: message ?? 'ต้องมีเส้นอย่างน้อย 2 เส้น ใน 2 แกน', yaw: yaw0, yawSolved: false };
  // yaw is only observable when both groups have horizontal (X/Y) lines
  const yawFree = hasHorizontal(object) && hasHorizontal(room);
  const n = 3 + (opts.fixedF ? 0 : 1) + (yawFree ? 1 : 0);
  const start = init;
  const build = (x: number[]): { cam: Cam; yaw: number } => {
    let i = 3;
    const cam: Cam = { ...start, R: mulMM(rodrigues([x[0]!, x[1]!, x[2]!]), start.R) };
    if (!opts.fixedF) cam.f = start.f * Math.exp(x[i++]!);
    return { cam, yaw: yawFree ? yaw + x[i]! * D : yaw };
  };
  const x = lm(n, (x) => {
    const b = build(x);
    return [...jointResiduals(b.cam, object, room, b.yaw), ...jointParallelPenalty(b.cam, object, room, b.yaw, modes)];
  });
  const out = build(x);
  out.cam.R = orthonormalize(out.cam.R);
  if (!(out.cam.f > 0) || ![out.cam.f, ...out.cam.R.flat(), out.yaw].every(Number.isFinite)) {
    return { ok: false, message: 'คำนวณไม่สำเร็จ', yaw: yaw0, yawSolved: false };
  }
  return { ok: true, cam: out.cam, yaw: wrap180(out.yaw), yawSolved: yawFree, message: yawFree ? undefined : 'ต้องมีเส้นแกน X/Y ทั้งในวัตถุและห้อง จึงจะหามุมหมุนได้ (ใช้มุมเดิม)' };
}

// ---------- agreement ----------
/** Agreement bands (deg between the two groups' VP directions). */
export const AGREE_GOOD_DEG = 1;
export const AGREE_BAD_DEG = 3;
export function agreeBand(deg: number): Band {
  return deg < AGREE_GOOD_DEG ? 'good' : deg <= AGREE_BAD_DEG ? 'warn' : 'bad';
}
/** Focal agreement bands (% difference of the per-group focals). */
export function focalBand(pct: number): Band {
  return pct < 5 ? 'good' : pct <= 15 ? 'warn' : 'bad';
}
const worse = (a: Band | null, b: Band | null): Band | null => {
  const rank = { good: 0, warn: 1, bad: 2 } as const;
  if (!a) return b;
  if (!b) return a;
  return rank[a] >= rank[b] ? a : b;
};

export type WorstLine = { id: number; group: LineGroup; deg: number };
export type AxisAgreement = {
  axis: Axis;
  /** Angle (deg) between the object-group and room-group VP directions; null unless both have ≥ 2 lines. */
  deg: number | null;
  band: Band | null;
  /** Lines of this axis (both groups) furthest from the joint VP, worst first. */
  worst: WorstLine[];
  /** Axis mode, and the groups whose lines of a 'parallel' axis are clearly not parallel (> 1° RMS). */
  mode: VpMode;
  notParallel: LineGroup[];
};
export type Agreement = {
  axes: AxisAgreement[];
  /** Focal (full px) each group alone would give; null when that group can't be solved alone. */
  fObject: number | null;
  fRoom: number | null;
  fDiffPct: number | null;
  fBand: Band | null;
  /** Worst axis angle and the overall band (worst of the axis bands and the focal band). */
  maxDeg: number | null;
  band: Band | null;
};

/** Per-line angle (deg) to the joint VP of its axis (room X/Y use the yawed VP). */
export function jointLineAngles(cam: Cam, lines: readonly GroupedLine[], yawDeg: number): WorstLine[] {
  return lines.map((l) => ({ id: l.id, group: l.group, deg: angleToVp(l, vpOfDir(cam, axisDir(l.group, l.axis, yawDeg))) }));
}

/** Object ↔ room agreement of a joint camera (full px, object frame) and yaw. */
export function agreement(object: readonly GuideLine[], room: readonly GuideLine[], cam: Cam, yawDeg: number, frame: Frame, worstN = 3, modes: readonly VpMode[] = AUTO_MODES): Agreement {
  const rz = rotZ(yawDeg);
  const all: GroupedLine[] = [...object.map((l) => ({ ...l, group: 'object' as const })), ...room.map((l) => ({ ...l, group: 'room' as const }))];
  const angles = jointLineAngles(cam, all, yawDeg);
  const axes: AxisAgreement[] = ([0, 1, 2] as Axis[]).map((axis) => {
    const mode = modes[axis] ?? 'auto';
    const fo = fitVPMode(object.filter((l) => l.axis === axis), frame, mode);
    const fr = fitVPMode(room.filter((l) => l.axis === axis), frame, mode);
    const notParallel: LineGroup[] = [];
    if (mode === 'parallel') {
      for (const [g, ls] of [['object', object], ['room', room]] as const) {
        const p = fitParallel(ls.filter((l) => l.axis === axis));
        if (p && p.rmsDeg > AGREE_GOOD_DEG) notParallel.push(g);
      }
    }
    let deg: number | null = null;
    if (fo && fr) {
      const dO = dirOfVp(cam, fo.vp);
      const dR = mulMV(rz, dirOfVp(cam, fr.vp)); // room direction mapped onto the object's axes
      const c = Math.abs(dO[0] * dR[0] + dO[1] * dR[1] + dO[2] * dR[2]);
      const sn = Math.hypot(dO[1] * dR[2] - dO[2] * dR[1], dO[2] * dR[0] - dO[0] * dR[2], dO[0] * dR[1] - dO[1] * dR[0]);
      deg = Math.atan2(sn, c) * D;
    }
    const worst = angles
      .filter((w) => all.find((l) => l.id === w.id && l.group === w.group)!.axis === axis)
      .sort((p, q) => q.deg - p.deg)
      .slice(0, worstN);
    let band: Band | null = deg === null ? null : agreeBand(deg);
    if (notParallel.length) band = worse(band, 'warn');
    return { axis, deg, band, worst, mode, notParallel };
  });
  const focal = (ls: readonly GuideLine[]): number | null => {
    const r = solveFromLines([...ls], cam, { frame, principal: 'fixed', modes });
    return r.ok && r.cam && Number.isFinite(r.cam.f) && r.cam.f > 0 ? r.cam.f : null;
  };
  const fObject = focal(object);
  const fRoom = focal(room);
  const fDiffPct = fObject && fRoom ? (Math.abs(fObject - fRoom) / Math.sqrt(fObject * fRoom)) * 100 : null;
  const fBand = fDiffPct === null ? null : focalBand(fDiffPct);
  const degs = axes.map((a) => a.deg).filter((d): d is number => d !== null);
  const maxDeg = degs.length ? Math.max(...degs) : null;
  const band = axes.reduce<Band | null>((b, a) => worse(b, a.band), fBand);
  return { axes, fObject, fRoom, fDiffPct, fBand, maxDeg, band };
}
