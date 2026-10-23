// Plain test for object ↔ room guide-line groups (no test framework in games/never-ending-story/): `npm test` in games/never-ending-story/.
import { fromBlenderEulerDeg, mulMV, project, sub, type Axis, type Cam, type GuideLine, type V2, type V3 } from '../src/lib/editor/camMath.ts';
import {
  agreement,
  camToCrop,
  camToFull,
  fullCentreInCrop,
  lineToCrop,
  lineToFull,
  migrateV1Lines,
  rotZ,
  solveJoint,
  toCrop,
  toFull,
  type CropT,
} from '../src/lib/editor/roomMatch.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

// ---------- synthetic scene: 720×1280 full image, nightstand-like crop ----------
const FULL = { w: 720, h: 1280 };
const T: CropT = { x: 368, y: 540, s: 1 };
const R = fromBlenderEulerDeg([78, 0, 28]);
const view = mulMV([[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]], [0, 0, 1]);
const C: V3 = [-view[0] * 320, -view[1] * 320, -view[2] * 320 + 30];
const TRUE: Cam = { f: 1450, cx: 360, cy: 640, R, C };
let nextId = 1;
/** Lines along the edges of a box (object frame) after turning it by Rz(yaw) — a "room" when yaw ≠ 0. */
function boxLines(cam: Cam, centre: V3, size: V3, yawDeg = 0, axes: Axis[] = [0, 1, 2]): GuideLine[] {
  const rz = rotZ(-yawDeg); // room axes in object coordinates
  const [w, d, h] = size;
  const pt = (sx: number, sy: number, sz: number): V3 => {
    const p = mulMV(rz, [sx * w / 2, sy * d / 2, sz * h / 2]);
    return [centre[0] + p[0], centre[1] + p[1], centre[2] + p[2]];
  };
  const out: GuideLine[] = [];
  const add = (axis: Axis, p: V3, q: V3) => {
    if (!axes.includes(axis)) return;
    const a = project(cam, p);
    const b = project(cam, q);
    if (a && b) out.push({ id: nextId++, axis, a, b });
  };
  for (const [sy, sz] of [[-1, -1], [-1, 1], [1, 1]]) add(0, pt(-1, sy!, sz!), pt(1, sy!, sz!));
  for (const [sx, sz] of [[1, -1], [1, 1], [-1, 1]]) add(1, pt(sx!, -1, sz!), pt(sx!, 1, sz!));
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1]]) add(2, pt(sx!, sy!, -1), pt(sx!, sy!, 1));
  return out;
}
const frame = { cx: 360, cy: 640, s: 1280 };
const prior = (): Cam => ({ ...TRUE, f: 1100, R: fromBlenderEulerDeg([74, 3, 22]) });
const angleBetween = (A: Cam, B: Cam): number => {
  // largest column angle (deg)
  let m = 0;
  for (let j = 0; j < 3; j++) {
    const c = A.R[0][j]! * B.R[0][j]! + A.R[1][j]! * B.R[1][j]! + A.R[2][j]! * B.R[2][j]!;
    m = Math.max(m, (Math.acos(Math.min(1, Math.abs(c))) * 180) / Math.PI);
  }
  return m;
};

test('crop transform: points, lines and intrinsics round-trip', () => {
  for (const t of [T, { x: -12.5, y: 40, s: 1.75 }]) {
    const p: V2 = [17.25, -3.5];
    const q = toCrop(toFull(p, t), t);
    ok(close(q[0], p[0], 1e-9) && close(q[1], p[1], 1e-9), `point ${q}`);
    const l: GuideLine = { id: 1, axis: 0, a: [1, 2], b: [30, 40], links: { a: 3 } };
    const l2 = lineToCrop(lineToFull(l, t), t);
    ok(close(l2.a[0], 1, 1e-9) && close(l2.b[1], 40, 1e-9) && l2.links?.a === 3, `line ${JSON.stringify(l2)}`);
    const camC: Cam = { ...TRUE, f: 900, cx: 120, cy: 150 };
    const camF = camToFull(camC, t);
    const back = camToCrop(camF, t);
    ok(close(back.f, 900, 1e-9) && close(back.cx, 120, 1e-9) && close(back.cy, 150, 1e-9), 'cam round trip');
    // projecting with the full-px camera = crop projection mapped to full px
    const X: V3 = [10, 5, 30];
    const uc = project(camC, X)!;
    const uf = project(camF, X)!;
    const m = toFull(uc, t);
    ok(close(uf[0], m[0], 1e-6) && close(uf[1], m[1], 1e-6), `projection ${uf} vs ${m}`);
  }
  const c = fullCentreInCrop(FULL, T);
  ok(c[0] === -8 && c[1] === 100, `full centre in crop px ${c} (want −8, 100)`);
});

test('joint fit (aligned): object X/Z + room X/Y/Z → one camera, groups agree', () => {
  const object = boxLines(TRUE, [0, 0, 27], [61, 40, 55], 0, [0, 2]); // only 2 axes on the object
  const room = boxLines(TRUE, [10, 60, 120], [400, 300, 240]);
  const r = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: true });
  ok(r.ok && !!r.cam, r.message ?? 'no cam');
  ok(Math.abs(r.cam!.f - TRUE.f) / TRUE.f < 0.002, `f ${r.cam!.f} (true ${TRUE.f})`);
  ok(angleBetween(r.cam!, TRUE) < 0.05, `rotation off by ${angleBetween(r.cam!, TRUE)}°`);
  const ag = agreement(object, room, r.cam!, 0, frame);
  ok(ag.axes[0]!.deg !== null && ag.axes[0]!.deg < 0.05 && ag.axes[2]!.deg! < 0.05, `axis angles ${ag.axes.map((a) => a.deg)}`);
  ok(ag.axes[1]!.deg === null, 'object has no Y lines → no Y comparison');
  ok(ag.fObject !== null && ag.fRoom !== null && Math.abs(ag.fRoom - TRUE.f) / TRUE.f < 0.002 && Math.abs(ag.fObject - TRUE.f) / TRUE.f < 0.002, `per-group f ${ag.fObject} / ${ag.fRoom}`);
  ok(ag.fDiffPct! < 0.1 && ag.fBand === 'good', `focal diff ${ag.fDiffPct}%`);
  // object with ONE axis cannot be solved alone → no per-group focal
  ok(agreement(object.filter((l) => l.axis === 2), room, r.cam!, 0, frame).fObject === null, 'object Z only → fObject null');
  ok(ag.band === 'good', `band ${ag.band}`);
});

test('joint fit beats either group alone when the room has the long lines', () => {
  const noisy = (ls: GuideLine[], amp: number, k: number) =>
    ls.map((l, i) => ({ ...l, a: [l.a[0] + amp * Math.sin(i * 1.7 + k), l.a[1] + amp * Math.cos(i * 2.3 + k)] as V2 }));
  const object = noisy(boxLines(TRUE, [0, 0, 27], [61, 40, 55]), 0.8, 1);
  const room = noisy(boxLines(TRUE, [10, 60, 120], [400, 300, 240]), 0.8, 2);
  const j = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: true });
  const o = solveJoint(object, [], prior(), { frame, fixedF: false, principal: 'fixed', aligned: true });
  ok(j.ok && o.ok, 'solves');
  const ej = Math.abs(j.cam!.f - TRUE.f);
  const eo = Math.abs(o.cam!.f - TRUE.f);
  ok(ej < eo, `joint focal error ${ej.toFixed(2)} px should beat object-only ${eo.toFixed(2)} px`);
});

test('yawed object: shared vertical, yaw ψ recovered; aligned mode flags the X/Y disagreement', () => {
  const YAW = 25;
  // camera of the OBJECT; the room is turned by ψ about Z (X_room = Rz(ψ)·X_obj)
  const object = boxLines(TRUE, [0, 0, 27], [61, 40, 55]);
  const room = boxLines(TRUE, [10, 60, 120], [400, 300, 240], YAW);
  const r = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: false, yaw0: 0 });
  ok(r.ok && !!r.cam && r.yawSolved, r.message ?? 'no cam');
  ok(close(r.yaw, YAW, 0.05), `yaw ${r.yaw} (true ${YAW})`);
  ok(Math.abs(r.cam!.f - TRUE.f) / TRUE.f < 0.002, `f ${r.cam!.f}`);
  ok(angleBetween(r.cam!, TRUE) < 0.05, `rotation off by ${angleBetween(r.cam!, TRUE)}°`);
  const ag = agreement(object, room, r.cam!, r.yaw, frame);
  ok(ag.axes.every((a) => a.deg !== null && a.deg < 0.05), `yawed agreement ${ag.axes.map((a) => a.deg)}`);
  // negative yaw, and starting from the room side (object only X lines + verticals)
  const room2 = boxLines(TRUE, [10, 60, 120], [400, 300, 240], -40);
  const obj2 = boxLines(TRUE, [0, 0, 27], [61, 40, 55], 0, [0]);
  const r2 = solveJoint(obj2, room2, prior(), { frame, fixedF: false, principal: 'fixed', aligned: false, yaw0: -30 });
  ok(r2.ok && close(r2.yaw, -40, 0.05), `yaw ${r2.yaw} (true −40) ${r2.message ?? ''}`);
  // the same yawed data forced "aligned": Z still agrees, X/Y clearly do not, and the worst lines are room lines
  const a = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: true });
  ok(a.ok, 'aligned solve runs');
  const ag2 = agreement(object, room, a.cam!, 0, frame);
  ok(ag2.axes[0]!.band === 'bad' && ag2.axes[1]!.band === 'bad', `X/Y bands ${ag2.axes.map((x) => x.band)}`);
  ok(ag2.axes[0]!.deg! > 10, `X angle ${ag2.axes[0]!.deg}`);
  ok(ag2.band === 'bad', `overall ${ag2.band}`);
});

test('yaw is not observable without object X/Y lines → kept, reported', () => {
  const object = boxLines(TRUE, [0, 0, 27], [61, 40, 55], 0, [2]);
  const room = boxLines(TRUE, [10, 60, 120], [400, 300, 240], 15);
  const r = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: false, yaw0: 7 });
  ok(r.ok && !r.yawSolved && r.yaw === 7 && !!r.message, `yaw ${r.yaw} solved ${r.yawSolved}`);
});

test('agreement: a bent room line is ranked worst on its axis', () => {
  const object = boxLines(TRUE, [0, 0, 27], [61, 40, 55]);
  const room = boxLines(TRUE, [10, 60, 120], [400, 300, 240]);
  const bad = room.find((l) => l.axis === 0)!;
  {
    // turn it by 3° about its midpoint
    const m: V2 = [(bad.a[0] + bad.b[0]) / 2, (bad.a[1] + bad.b[1]) / 2];
    const c = Math.cos(0.0524);
    const sn = Math.sin(0.0524);
    const rot = (p: V2): V2 => [m[0] + c * (p[0] - m[0]) - sn * (p[1] - m[1]), m[1] + sn * (p[0] - m[0]) + c * (p[1] - m[1])];
    bad.a = rot(bad.a);
    bad.b = rot(bad.b);
  }
  const r = solveJoint(object, room, prior(), { frame, fixedF: false, principal: 'fixed', aligned: true });
  const ag = agreement(object, room, r.cam!, 0, frame);
  ok(ag.axes[0]!.worst[0]!.id === bad.id && ag.axes[0]!.worst[0]!.group === 'room', `worst ${JSON.stringify(ag.axes[0]!.worst)}`);
  ok(ag.axes[0]!.worst[0]!.deg > 1.5 && ag.axes[0]!.worst[0]!.deg > ag.axes[0]!.worst[1]!.deg + 0.4, `worst angles ${ag.axes[0]!.worst.map((w) => w.deg)}`);
});

test('migration of v1 lines: outside the crop → room, else the saved view; cross-group corners unlinked', () => {
  const crop = { w: 252, h: 284 };
  const lines: GuideLine[] = [
    { id: 1, axis: 0, a: [10, 10], b: [200, 30], links: { a: 1 } },
    { id: 2, axis: 2, a: [10, 10], b: [12, 200], links: { a: 1, b: 2 } },
    { id: 3, axis: 1, a: [-100, 10], b: [12, 200], links: { b: 2 } }, // reaches outside the crop
  ];
  const m = migrateV1Lines(lines, 'crop', crop);
  ok(m.object.map((l) => l.id).join() === '1,2' && m.room.map((l) => l.id).join() === '3', `groups ${m.object.map((l) => l.id)} / ${m.room.map((l) => l.id)}`);
  ok(m.object[0]!.links?.a === 1 && m.object[1]!.links?.a === 1, 'in-group corner kept');
  ok(m.object[1]!.links?.b === undefined && m.room[0]!.links === undefined, 'cross-group corner unlinked');
  const w = migrateV1Lines(lines, 'wide', crop);
  ok(w.object.length === 0 && w.room.length === 3 && w.room[1]!.links?.b === 2, 'saved on the full view → all room');
  ok(lines[1]!.links?.b === 2, 'input not mutated');
});

const _u: V3 = sub([0, 0, 0], [0, 0, 0]);
void _u;
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
