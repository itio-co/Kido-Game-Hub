// Plain test for the master guide line per axis (no test framework in games/never-ending-story/): `npm test` in games/never-ending-story/.
import type { Axis, GuideLine, V2 } from '../src/lib/editor/camMath.ts';
import { addMasterFlag, applyMasterIds, ensureMasters, MASTER_PARALLEL_WARN_DEG, masterIds, masterPairAngle, mastersNearlyParallel, parseMasterMap, promoteMaster, removeMasterFlag, roomAuthoritative, setMaster2Flag, setMasterFlag, withDefaultMasters } from '../src/lib/editor/masterLine.ts';
import { consolidate, fitParallel, fitVP, fitVPMode, frameOf, lockVp } from '../src/lib/editor/vpFit.ts';

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
const D = 180 / Math.PI;
const angOf = (l: { a: V2; b: V2 }): number => {
  let t = Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0]) * D;
  return ((t % 180) + 180) % 180;
};
let nextId = 1;
const seg = (a: V2, b: V2, axis: Axis = 0, master = false): GuideLine => ({ id: nextId++, axis, a, b, ...(master ? { master: true } : {}) });
/** Homogeneous line through a segment (normalised). */
const hline = (l: GuideLine): [number, number, number] => {
  const a = [l.a[0], l.a[1], 1];
  const b = [l.b[0], l.b[1], 1];
  const m: [number, number, number] = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
  const n = Math.hypot(m[0], m[1]);
  return [m[0] / n, m[1] / n, m[2] / n];
};
/** Distance (px) of a finite VP from the master's infinite line. */
const offLine = (l: GuideLine, p: V2): number => {
  const m = hline(l);
  return Math.abs(m[0] * p[0] + m[1] * p[1] + m[2]);
};

// three lines roughly through (1500, 300), the first deliberately a bit off
const VP: V2 = [1500, 300];
const toward = (p: V2, len: number, axis: Axis = 0, master = false, jitter: V2 = [0, 0]): GuideLine => {
  const d: V2 = [VP[0] + jitter[0] - p[0], VP[1] + jitter[1] - p[1]];
  const n = Math.hypot(d[0], d[1]);
  return seg(p, [p[0] + (d[0] / n) * len, p[1] + (d[1] / n) * len], axis, master);
};

test('the VP lies on the master line (and the master residual is 0)', () => {
  const lines = [toward([100, 600], 300, 0, true, [0, 60]), toward([200, 100], 300), toward([150, 400], 300)];
  const free = fitVP(lines.map(({ master: _m, ...l }) => l))!;
  const fit = fitVP(lines)!;
  ok(!!fit.point, 'finite VP');
  const d = offLine(lines[0]!, fit.point!);
  ok(d < 1e-6 * 1500, `VP off the master line by ${d} px`);
  ok(fit.resDeg[0] === 0, `master residual ${fit.resDeg[0]}`);
  ok(offLine(lines[0]!, free.point!) > 1, 'free fit is NOT on the master (test is meaningful)');
  // master index can also be forced
  const f2 = fitVP(lines, frameOf(lines), { master: 1 })!;
  ok(offLine(lines[1]!, f2.point!) < 1e-3, 'opts.master moves the constraint');
});

test('only the master on an axis → no VP; the master + one line → VP = their intersection', () => {
  const m = toward([100, 600], 300, 0, true);
  ok(fitVP([m]) === null, 'master alone has no VP');
  const o = toward([200, 100], 300);
  const f = fitVP([m, o])!;
  ok(Math.hypot(f.point![0] - VP[0], f.point![1] - VP[1]) < 1e-3, `VP ${f.point}`);
});

test('the master is never an outlier', () => {
  const lines = [toward([100, 600], 300, 0, true, [0, 900]), toward([200, 100], 300), toward([150, 400], 300), toward([300, 250], 250), toward([400, 500], 250)];
  const fit = fitVP(lines, frameOf(lines), { robust: true })!;
  ok(!fit.outlier[0], 'master flagged as outlier');
  ok(offLine(lines[0]!, fit.point ?? [0, 0]) < 1e-3 || !fit.point, 'VP on the master');
});

test('parallel mode uses the master direction', () => {
  const lines = [seg([0, 100], [400, 130], 2, true), seg([0, 300], [400, 300], 2), seg([0, 500], [400, 490], 2)];
  const fit = fitParallel(lines)!;
  const want = angOf(lines[0]!);
  const got = ((Math.atan2(fit.vp[1], fit.vp[0]) * D) % 180 + 180) % 180;
  ok(Math.abs(got - want) < 1e-6, `direction ${got} vs master ${want}`);
  ok(fit.resDeg[0] === 0, 'master residual 0');
  ok(fitVPMode(lines, frameOf(lines), 'parallel')!.resDeg[0] === 0, 'fitVPMode parallel honours the master');
});

test('consolidate (Merge / Parallel) never moves the master', () => {
  for (const mode of ['auto', 'parallel'] as const) {
    const lines = [toward([100, 600], 300, 0, true, [0, 80]), toward([200, 100], 300, 0, false, [0, -40]), toward([150, 400], 300, 0, false, [30, 0])];
    const before = JSON.stringify(lines[0]);
    const r = consolidate(lines, [0], undefined, 1e-6, [mode, 'auto', 'auto']);
    const m = r.lines.find((l) => l.id === lines[0]!.id)!;
    ok(JSON.stringify(m) === before, `${mode}: master moved`);
    ok(!r.moved.includes(m.id), `${mode}: master reported as moved`);
    ok(r.moved.length === 2, `${mode}: others moved (${r.moved.length})`);
    ok(m.master === true, `${mode}: flag kept`);
    // after consolidating, every line goes through the master-constrained VP
    const fit = fitVPMode(r.lines, frameOf(r.lines), mode)!;
    ok(Math.max(...fit.resDeg) < 1e-6, `${mode}: residuals ${fit.resDeg}`);
  }
});

test('lock-to-VP: dragging the master is free; others lock to the master-constrained VP', () => {
  const lines = [toward([100, 600], 300, 0, true, [0, 60]), toward([200, 100], 300), toward([150, 400], 300), toward([300, 250], 250)];
  ok(lockVp(lines, lines[0]!.id) === null, 'master is never locked');
  const vp = lockVp(lines, lines[3]!.id)!;
  const p: V2 = [vp[0] / vp[2], vp[1] / vp[2]];
  ok(offLine(lines[0]!, p) < 1e-3, 'lock VP lies on the master');
});

test('first line is master by default; one master per axis; setting demotes the old', () => {
  const ls = [seg([0, 0], [1, 0], 0), seg([0, 1], [1, 1], 0), seg([0, 0], [0, 1], 1), seg([0, 2], [0, 3], 1, true), seg([5, 5], [6, 6], 1, true)];
  ok(ensureMasters(ls), 'changed');
  ok(JSON.stringify(masterIds(ls)) === JSON.stringify([ls[0]!.id, ls[3]!.id, null]), `ids ${masterIds(ls)}`);
  ok(!ls[4]!.master, 'extra flag dropped');
  ok(!ensureMasters(ls), 'idempotent');
  ok(setMasterFlag(ls, ls[1]!.id), 'set');
  ok(!ls[0]!.master && ls[1]!.master === true && ls[3]!.master === true, 'demoted only on that axis');
  ok(!setMasterFlag(ls, ls[1]!.id), 'already master → false');
  ok(!setMasterFlag(ls, 9999), 'unknown → false');
});

test('deleting the master promotes the lowest-residual line', () => {
  const good = toward([200, 100], 300);
  const bad = toward([150, 400], 300, 0, false, [0, 300]);
  const good2 = toward([300, 600], 300, 0, false, [2, 0]);
  const rest = [bad, good2, good];
  const id = promoteMaster(rest, 0);
  ok(id === good.id || id === good2.id, `promoted ${id} (bad = ${bad.id})`);
  const free = fitVP(rest.map(({ master: _m, ...l }) => l))!;
  const best = rest[free.resDeg.indexOf(Math.min(...free.resDeg))]!;
  ok(id === best.id, `promoted ${id}, lowest residual ${best.id}`);
  ok(rest.filter((l) => l.master).length === 1, 'exactly one master');
  ok(promoteMaster(rest, 0) === null, 'already has a master → null');
  const single = [seg([0, 0], [5, 5], 2)];
  ok(promoteMaster(single, 2) === single[0]!.id, 'single remaining line becomes master');
  ok(promoteMaster([], 1) === null, 'empty axis → null');
});

test('persistence: parseMasterMap / applyMasterIds / withDefaultMasters (missing map = default rule)', () => {
  ok(parseMasterMap(undefined) === null && parseMasterMap({}) === null && parseMasterMap({ object: [1, 2] }) === null, 'malformed → null');
  const pm = parseMasterMap({ object: [3, null, 'x'], room: [null, null, 9] })!;
  ok(JSON.stringify(pm) === JSON.stringify({ object: [3, null, null], room: [null, null, 9] }), JSON.stringify(pm));
  const ls = [seg([0, 0], [1, 0], 0), seg([0, 1], [1, 1], 0), seg([0, 0], [0, 1], 2)];
  // stored id wins
  applyMasterIds(ls, [ls[1]!.id, null, null]);
  ok(ls[1]!.master === true && !ls[0]!.master && ls[2]!.master === true, 'stored + default for Z');
  // an id of the wrong axis / unknown falls back to the default rule
  const ls2 = [seg([0, 0], [1, 0], 0), seg([0, 1], [1, 1], 0)];
  applyMasterIds(ls2, [ls2.length + 1e6, ls2[1]!.id, null]);
  ok(ls2[0]!.master === true && !ls2[1]!.master, 'bad ids → first line');
  // legacy file (no map): default rule per group; explicit map round-trips
  const legacy = {
    version: 2,
    lines: [
      { id: 1, axis: 0, a: [0, 0], b: [1, 0] },
      { id: 2, axis: 0, a: [0, 1], b: [1, 1] },
      { id: 3, axis: 2, a: [0, 0], b: [0, 1], group: 'room' },
      { id: 4, axis: 2, a: [2, 0], b: [2, 1], group: 'room' },
    ],
  };
  const filled = withDefaultMasters(legacy) as typeof legacy & { master: unknown };
  ok(JSON.stringify(filled.master) === JSON.stringify({ object: [1, null, null], room: [null, null, 3] }), JSON.stringify(filled.master));
  ok(!('master' in legacy), 'input not mutated');
  const explicit = { ...legacy, master: { object: [2, null, null], room: [null, null, 4] } };
  ok(JSON.stringify((withDefaultMasters(explicit) as typeof explicit).master) === JSON.stringify(explicit.master), 'explicit map kept');
});

test('joint rule: the room master is authoritative on shared axes', () => {
  const object = [seg([0, 0], [1, 0], 0, true), seg([0, 0], [0, 1], 2, true)];
  const room = [seg([5, 0], [5, 1], 2, true)];
  const j = roomAuthoritative(object, room);
  ok(j[0]!.master === true, 'object X master kept (room has no X master)');
  ok(!j[1]!.master, 'object Z master demoted to an ordinary line in the joint fit');
  ok(object[1]!.master === true, 'input not mutated');
});

// ---------- two masters on a converging axis ----------
/** Exact intersection of two segments' infinite lines (px). */
const cross2 = (p: GuideLine, q: GuideLine): V2 => {
  const [a1, b1, c1] = hline(p);
  const [a2, b2, c2] = hline(q);
  const w = a1 * b2 - a2 * b1;
  return [(b1 * c2 - b2 * c1) / w, (a2 * c1 - a1 * c2) / w];
};

test('two masters: the VP is exactly their intersection; other lines only report residuals', () => {
  const m1 = toward([100, 600], 300, 0, true, [0, 40]);
  const m2 = { ...toward([200, 100], 300, 0, false, [-30, 0]), master: 2 as const };
  const others = [toward([150, 400], 300, 0, false, [0, 120]), toward([300, 250], 250), toward([400, 500], 250, 0, false, [50, -60])];
  const lines = [m1, m2, ...others];
  const X = cross2(m1, m2);
  const fit = fitVP(lines)!;
  ok(fit.twoMasters === true, 'flagged as a two-master VP');
  ok(Math.hypot(fit.point![0] - X[0], fit.point![1] - X[1]) < 1e-6, `VP ${fit.point} vs intersection ${X}`);
  ok(fit.resDeg[0] === 0 && fit.resDeg[1] === 0, 'masters have residual 0');
  ok(fit.resDeg[2]! > 0.5, `others report residuals (${fit.resDeg[2]})`);
  ok(!fit.outlier[0] && !fit.outlier[1], 'masters are never outliers');
  // adding / moving other lines never moves the VP (no IRLS)
  const more = [...lines, toward([600, 200], 200, 0, false, [0, -400]), toward([50, 50], 200, 0, false, [300, 300])];
  const f2 = fitVP(more)!;
  ok(Math.hypot(f2.point![0] - X[0], f2.point![1] - X[1]) < 1e-6, `VP moved to ${f2.point}`);
  // just the two masters is enough
  const f3 = fitVP([m1, m2])!;
  ok(Math.hypot(f3.point![0] - X[0], f3.point![1] - X[1]) < 1e-6, 'two masters alone');
  // one master → the old behaviour (VP on the master line, IRLS from the others)
  const one = [m1, { ...m2, master: undefined }, ...others];
  const f4 = fitVP(one)!;
  ok(!f4.twoMasters && offLine(m1, f4.point!) < 1e-3, 'one master: constrained to its line');
  ok(Math.hypot(f4.point![0] - X[0], f4.point![1] - X[1]) > 1, 'one master: not the intersection (test is meaningful)');
  // consolidate turns the others onto the intersection and never moves either master
  const r = consolidate(more, [0]);
  ok(!r.moved.includes(m1.id) && !r.moved.includes(m2.id), 'masters not moved');
  const after = fitVP(r.lines)!;
  ok(Math.max(...after.resDeg) < 1e-6 && Math.hypot(after.point![0] - X[0], after.point![1] - X[1]) < 1e-6, 'all lines through the intersection');
  // lock-to-VP for a non-master line = the intersection
  const lv = lockVp(more, others[0]!.id)!;
  ok(Math.hypot(lv[0] / lv[2] - X[0], lv[1] / lv[2] - X[1]) < 1e-6, 'lock VP = intersection');
});

test('parallel axis: one master defines the direction; a ★2 is ignored', () => {
  const lines = [seg([0, 100], [400, 130], 2, true), { ...seg([0, 300], [400, 280], 2), master: 2 as const }, seg([0, 500], [400, 490], 2)];
  const fit = fitParallel(lines)!;
  const got = ((Math.atan2(fit.vp[1], fit.vp[0]) * D) % 180 + 180) % 180;
  ok(Math.abs(got - angOf(lines[0]!)) < 1e-6, 'direction = ★1');
  ok(fit.resDeg[1]! > 1, '★2 is an ordinary line (has a residual)');
  // ★ on a parallel axis replaces the master
  const ls = [seg([0, 0], [1, 0], 2, true), seg([0, 1], [1, 1], 2), seg([0, 2], [1, 2], 2)];
  const r = addMasterFlag(ls, ls[1]!.id, true)!;
  ok(r.kind === 'parallelReplaced' && !ls[0]!.master && ls[1]!.master === true && !ls[2]!.master, `parallel replace ${JSON.stringify(r)}`);
});

test('★ toggle: add second, replace the oldest, unset, keep one', () => {
  const ls = [seg([0, 0], [1, 0], 0, true), seg([0, 1], [1, 1.1], 0), seg([0, 2], [1, 2.3], 0), seg([0, 3], [1, 3.5], 0)];
  const [a, b, c, d] = ls as [GuideLine, GuideLine, GuideLine, GuideLine];
  ok(addMasterFlag(ls, b.id)?.kind === 'second' && a.master === true && b.master === 2, 'b becomes ★2');
  ok(JSON.stringify(masterIds(ls)) === JSON.stringify([[a.id, b.id], null, null]), `ids ${JSON.stringify(masterIds(ls))}`);
  const r = addMasterFlag(ls, c.id)!;
  ok(r.kind === 'replacedOldest' && (r as { dropped: number }).dropped === a.id, 'third replaces the oldest');
  ok(!a.master && b.master === true && c.master === 2, `b ★1, c ★2 (${a.master} ${b.master} ${c.master})`);
  ok(addMasterFlag(ls, b.id) === null, 'already a master → null');
  ok(removeMasterFlag(ls, b.id) && c.master === true && !b.master, 'unset ★1 → ★2 takes over');
  ok(!removeMasterFlag(ls, c.id) && c.master === true, 'the last master stays');
  ok(setMaster2Flag(ls, 0, d.id) && d.master === 2, 'set ★2 directly');
  ok(setMaster2Flag(ls, 0, null) && !d.master, 'clear ★2');
  // ★1 select onto the ★2 swaps them
  addMasterFlag(ls, a.id);
  ok(setMasterFlag(ls, a.id) && a.master === true && c.master === 2, 'select ★2 as ★1 → swap');
  // ensureMasters keeps two, drops a third, promotes a lone ★2
  const e = [seg([0, 0], [1, 0], 1, true), { ...seg([0, 1], [1, 1], 1), master: 2 as const }, { ...seg([0, 2], [1, 2], 1), master: 2 as const }, { ...seg([0, 3], [1, 3], 2), master: 2 as const }];
  ensureMasters(e);
  ok(e[0]!.master === true && e[1]!.master === 2 && !e[2]!.master && e[3]!.master === true, `normalised ${e.map((l) => l.master)}`);
  // deleting ★1 hands over to ★2 (no promotion message)
  const p = [seg([0, 0], [1, 1], 0), { ...seg([0, 1], [1, 2], 0), master: 2 as const }, seg([0, 2], [1, 3], 0)];
  ok(promoteMaster(p, 0) === null && p[1]!.master === true, '★2 → ★1 on delete');
});

test('nearly parallel masters warn (unstable VP)', () => {
  const m1 = seg([0, 0], [1000, 0], 0, true);
  const near = { ...seg([0, 100], [1000, 100 + Math.tan(0.5 / D) * 1000], 0), master: 2 as const };
  const far = { ...seg([0, 100], [1000, 100 + Math.tan(5 / D) * 1000], 0), master: 2 as const };
  ok(Math.abs(masterPairAngle([m1, near], 0)! - 0.5) < 1e-6, `angle ${masterPairAngle([m1, near], 0)}`);
  ok(mastersNearlyParallel([m1, near], 0) && MASTER_PARALLEL_WARN_DEG === 1, 'warns under 1°');
  ok(!mastersNearlyParallel([m1, far], 0), 'no warning at 5°');
  ok(masterPairAngle([m1], 0) === null && !mastersNearlyParallel([m1], 0), 'one master: no warning');
});

test('persistence: [★1, ★2] entries round-trip; old single ids still load', () => {
  const pm = parseMasterMap({ object: [[3, 7], 4, null], room: [null, [5, 5], 9] })!;
  ok(JSON.stringify(pm) === JSON.stringify({ object: [[3, 7], 4, null], room: [null, 5, 9] }), JSON.stringify(pm));
  const ls = [seg([0, 0], [1, 0], 0), seg([0, 1], [1, 1], 0), seg([0, 2], [1, 2], 0), seg([0, 0], [0, 1], 1)];
  applyMasterIds(ls, [[ls[2]!.id, ls[0]!.id], null, null]);
  ok(ls[2]!.master === true && ls[0]!.master === 2 && !ls[1]!.master && ls[3]!.master === true, `applied ${ls.map((l) => l.master)}`);
  ok(JSON.stringify(masterIds(ls)) === JSON.stringify([[ls[2]!.id, ls[0]!.id], ls[3]!.id, null]), 'masterIds');
  // legacy single-master file: unchanged on re-serialisation
  const legacy = { lines: [{ id: 1, axis: 0, a: [0, 0], b: [1, 0] }, { id: 2, axis: 0, a: [0, 1], b: [1, 1] }], master: { object: [2, null, null], room: [null, null, null] } };
  ok(JSON.stringify((withDefaultMasters(legacy) as typeof legacy).master) === JSON.stringify(legacy.master), 'single id kept');
  const two = { ...legacy, master: { object: [[2, 1], null, null], room: [null, null, null] } };
  ok(JSON.stringify((withDefaultMasters(two) as typeof two).master) === JSON.stringify(two.master), 'pair kept');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
