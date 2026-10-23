/**
 * Master guide lines per axis (pure helpers, no DOM / Svelte).
 *
 * Each axis of each line group (object, room) has ONE or TWO master lines once it has any line:
 *   - the first line drawn on an axis becomes its master (★1) by default (array order = drawing order);
 *   - ★ on another line of a converging axis adds it as the second master (★2); with two masters already, the
 *     oldest (★1) is dropped, ★2 becomes ★1 and the new line ★2;
 *   - a parallel axis uses ONE master (its direction); ★ there replaces the master, and a stored ★2 is ignored;
 *   - ★ on a master removes it (★2 → plain; ★1 → ★2 takes over as ★1); the last master of an axis stays;
 *   - deleting ★1 hands over to ★2, or (no ★2) promotes the remaining line with the lowest residual;
 *   - one master: the VP is constrained to the master's infinite line; two masters: the VP IS their intersection
 *     (the other lines only report residuals); parallel mode uses ★1's direction; consolidate and edge snapping
 *     never move a master (see vpFit.ts).
 * Joint solve rule (object aligned with the room, or the room/object verticals shared in a yawed solve): when one
 * fit mixes both groups' lines of an axis, the ROOM masters are authoritative and the object masters are only
 * ordinary lines in that fit (`roomAuthoritative`). Per-group fits (overlay residuals, agreement) keep their own.
 *
 * Stored on the line as `master: true` (★1) / `master: 2` (★2) (so undo snapshots and the local draft carry it), and
 * in camera-match.json as `master: { object: [x, y, z], room: [x, y, z] }` where each axis entry is a line id (one
 * master), `[★1, ★2]` (two masters) or null (axis without lines). A missing map (older files) means the default rule;
 * a single id (older files) still loads as one master.
 */
import type { Axis, GuideLine } from './camMath';
import { fitVPMode, frameOf, type Frame, type VpMode } from './vpFit.ts';

export type MasterEntry = number | [number, number] | null;
export type MasterIds = [MasterEntry, MasterEntry, MasterEntry];
export type MasterMap = { object: MasterIds; room: MasterIds };
type Flagged = { id: number; axis: Axis; master?: boolean | 2 };

const AXES: Axis[] = [0, 1, 2];
const D = 180 / Math.PI;

/** Two masters closer than this (degrees) meet at an unstable VP — the UI warns. */
export const MASTER_PARALLEL_WARN_DEG = 1;

/** 0 = not a master, 1 = ★1, 2 = ★2. */
export function masterRank(l: Flagged): 0 | 1 | 2 {
  return l.master === 2 ? 2 : l.master ? 1 : 0;
}
/** ★1 of an axis (falls back to a lone ★2 on unnormalised input). */
export function masterOf<L extends Flagged>(lines: readonly L[], axis: Axis): L | undefined {
  const ls = lines.filter((l) => l.axis === axis);
  return ls.find((l) => masterRank(l) === 1) ?? ls.find((l) => masterRank(l) === 2);
}
/** ★2 of an axis (only when the axis also has a ★1). */
export function master2Of<L extends Flagged>(lines: readonly L[], axis: Axis): L | undefined {
  const m1 = masterOf(lines, axis);
  return m1 && masterRank(m1) === 1 ? lines.find((l) => l.axis === axis && masterRank(l) === 2) : undefined;
}
/** Masters of an axis in order [★1, ★2?]. */
export function mastersOf<L extends Flagged>(lines: readonly L[], axis: Axis): L[] {
  const m1 = masterOf(lines, axis);
  const m2 = master2Of(lines, axis);
  return m1 ? (m2 ? [m1, m2] : [m1]) : [];
}
/** Master entry per axis (id, [★1, ★2] or null). */
export function masterIds(lines: readonly Flagged[]): MasterIds {
  return AXES.map((a) => {
    const ms = mastersOf(lines, a);
    return ms.length === 2 ? [ms[0]!.id, ms[1]!.id] : (ms[0]?.id ?? null);
  }) as MasterIds;
}

/**
 * Normalise the master flags (in place): at most two per axis (★1 first, then ★2, extra flags dropped); a lone ★2
 * becomes ★1; an axis with lines but no master gets its first line. Returns true when anything changed.
 */
export function ensureMasters(lines: Flagged[]): boolean {
  let changed = false;
  for (const a of AXES) {
    const ls = lines.filter((l) => l.axis === a);
    if (!ls.length) continue;
    // one ★1 (extra `true` flags are dropped, as before) and at most one ★2; a lone ★2 is promoted
    const m1 = ls.find((l) => masterRank(l) === 1);
    const m2s = ls.filter((l) => masterRank(l) === 2);
    const keep = m1 ? [m1, ...m2s.slice(0, 1)] : m2s.length ? m2s.slice(0, 2) : [ls[0]!];
    for (const l of ls) {
      const want = l === keep[0] ? true : l === keep[1] ? 2 : undefined;
      if (want === undefined) {
        if ('master' in l) {
          delete l.master;
          changed = true;
        }
      } else if (l.master !== want) {
        l.master = want;
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Make line `id` the ★1 of its axis (in place). Replaces the old ★1; when `id` was ★2 the two swap. A ★2 stays.
 * False when it already is ★1 / unknown.
 */
export function setMasterFlag(lines: Flagged[], id: number): boolean {
  const line = lines.find((l) => l.id === id);
  if (!line || masterRank(line) === 1) return false;
  const old = masterOf(lines, line.axis);
  const wasSecond = masterRank(line) === 2;
  for (const l of lines) if (l.axis === line.axis && masterRank(l) === 1) delete l.master;
  if (wasSecond && old && old !== line) old.master = 2;
  line.master = true;
  return true;
}

export type AddMasterResult =
  | { kind: 'first' | 'second' }
  | { kind: 'replacedOldest'; dropped: number }
  | { kind: 'parallelReplaced'; dropped: number[] };

/**
 * ★ on a line that is not a master (in place). Converging axis: no master → ★1; one master → ★2 (two masters: the VP
 * is their intersection); two masters → the oldest (★1) is dropped, ★2 becomes ★1 and this line ★2.
 * Parallel axis (`parallel`): one master only — this line replaces it (and any ★2). Null when it already is a master.
 */
export function addMasterFlag(lines: Flagged[], id: number, parallel = false): AddMasterResult | null {
  const line = lines.find((l) => l.id === id);
  if (!line || masterRank(line)) return null;
  const ms = mastersOf(lines, line.axis);
  if (parallel) {
    if (!ms.length) {
      line.master = true;
      return { kind: 'first' };
    }
    for (const m of ms) delete m.master;
    line.master = true;
    return { kind: 'parallelReplaced', dropped: ms.map((m) => m.id) };
  }
  if (!ms.length) {
    line.master = true;
    return { kind: 'first' };
  }
  if (ms.length === 1) {
    ms[0]!.master = true;
    line.master = 2;
    return { kind: 'second' };
  }
  delete ms[0]!.master;
  ms[1]!.master = true;
  line.master = 2;
  return { kind: 'replacedOldest', dropped: ms[0]!.id };
}

/**
 * ★ on a master (in place): ★2 → plain line; ★1 → plain, ★2 takes over as ★1. The only master of an axis stays
 * (false: an axis with lines always has a master).
 */
export function removeMasterFlag(lines: Flagged[], id: number): boolean {
  const line = lines.find((l) => l.id === id);
  if (!line || !masterRank(line)) return false;
  const ms = mastersOf(lines, line.axis);
  if (ms.length < 2) return false;
  delete line.master;
  const rest = ms.find((m) => m !== line)!;
  rest.master = true;
  return true;
}

/** Set (or clear, id = null) the ★2 of an axis directly (in place). False when nothing changed / not allowed. */
export function setMaster2Flag(lines: Flagged[], axis: Axis, id: number | null): boolean {
  const m1 = masterOf(lines, axis);
  const m2 = master2Of(lines, axis);
  if (id === null) {
    if (!m2) return false;
    delete m2.master;
    return true;
  }
  const line = lines.find((l) => l.id === id && l.axis === axis);
  if (!line || !m1 || line === m1 || line === m2) return false;
  if (m2) delete m2.master;
  line.master = 2;
  return true;
}

/** Angle (degrees, 0…90) between two segments; the two masters of an axis meet at an unstable VP below ~1°. */
export function segAngleDeg(p: { a: [number, number]; b: [number, number] }, q: { a: [number, number]; b: [number, number] }): number {
  const u = [p.b[0] - p.a[0], p.b[1] - p.a[1]];
  const v = [q.b[0] - q.a[0], q.b[1] - q.a[1]];
  return Math.atan2(Math.abs(u[0]! * v[1]! - u[1]! * v[0]!), Math.abs(u[0]! * v[0]! + u[1]! * v[1]!)) * D;
}
/** Angle between the two masters of `axis` (null without two masters). */
export function masterPairAngle(lines: readonly GuideLine[], axis: Axis): number | null {
  const ms = mastersOf(lines, axis);
  return ms.length === 2 ? segAngleDeg(ms[0]!, ms[1]!) : null;
}
/** True when the two masters of `axis` are nearly parallel (< MASTER_PARALLEL_WARN_DEG): their VP is unstable. */
export function mastersNearlyParallel(lines: readonly GuideLine[], axis: Axis, limitDeg = MASTER_PARALLEL_WARN_DEG): boolean {
  const d = masterPairAngle(lines, axis);
  return d !== null && d < limitDeg;
}

/**
 * After a master of `axis` was deleted: with a ★2 left it simply becomes ★1 (null: no promotion message); otherwise
 * promote the remaining line with the lowest residual against the free (unconstrained) fit of the remaining lines; a
 * single remaining line simply becomes master. In place; returns the promoted line's id (null when the axis is now
 * empty or still has a master).
 */
export function promoteMaster(lines: GuideLine[], axis: Axis, frame?: Frame, mode: VpMode = 'auto'): number | null {
  const ls = lines.filter((l) => l.axis === axis);
  if (!ls.length) return null;
  if (ls.some((l) => masterRank(l))) {
    ensureMasters(lines);
    return null;
  }
  const free = ls.map(({ master: _m, ...l }) => l);
  const fit = fitVPMode(free, frame ?? frameOf(free), mode);
  let best = 0;
  if (fit) for (let i = 1; i < ls.length; i++) if (fit.resDeg[i]! < fit.resDeg[best]!) best = i;
  ls[best]!.master = true;
  return ls[best]!.id;
}

/**
 * Apply stored master entries (in place) — an id (one master) or [★1, ★2]; ids that don't match a line of that axis
 * fall back to the default rule.
 */
export function applyMasterIds(lines: Flagged[], ids: readonly MasterEntry[] | null | undefined): void {
  if (Array.isArray(ids)) {
    for (const a of AXES) {
      const e = ids[a];
      const want = (Array.isArray(e) ? e : [e]).map((id) => (typeof id === 'number' ? lines.find((l) => l.id === id && l.axis === a) : undefined));
      if (!want[0]) continue;
      for (const l of lines) if (l.axis === a && 'master' in l) delete l.master;
      want[0].master = true;
      if (want[1] && want[1] !== want[0]) want[1].master = 2;
    }
  }
  ensureMasters(lines);
}

/** Valid stored master map, or null (missing / malformed → default rule). Accepts single ids (older files). */
export function parseMasterMap(v: unknown): Partial<MasterMap> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const entry = (i: unknown): MasterEntry =>
    typeof i === 'number'
      ? i
      : Array.isArray(i) && i.length === 2 && typeof i[0] === 'number' && typeof i[1] === 'number' && i[0] !== i[1]
        ? [i[0], i[1]]
        : Array.isArray(i) && typeof i[0] === 'number'
          ? i[0]
          : null;
  const ids = (x: unknown): MasterIds | undefined => (Array.isArray(x) && x.length === 3 ? (x.map(entry) as MasterIds) : undefined);
  const out: Partial<MasterMap> = {};
  const ob = ids(o.object);
  const ro = ids(o.room);
  if (ob) out.object = ob;
  if (ro) out.room = ro;
  return ob || ro ? out : null;
}

/**
 * Lines for a fit that mixes both groups: the object's master flags are dropped on every axis where the room has
 * a master (the room masters are authoritative; the object masters become ordinary lines in that fit).
 */
export function roomAuthoritative(object: readonly GuideLine[], room: readonly GuideLine[]): GuideLine[] {
  const roomAxes = new Set(room.filter((l) => masterRank(l)).map((l) => l.axis));
  return object.map((l) => {
    if (!l.master || !roomAxes.has(l.axis)) return l;
    const { master: _m, ...rest } = l;
    return rest;
  });
}

/**
 * camera-match.json data with the `master` map filled in by the default rule when it is missing (older files), so
 * a legacy file compares equal to the same work re-serialised with explicit masters. Line-level flags are ignored.
 */
export function withDefaultMasters<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.lines)) return data;
  const stored = parseMasterMap(d.master);
  const lines = d.lines as (Flagged & { group?: string })[];
  const map = {} as MasterMap;
  for (const g of ['object', 'room'] as const) {
    const ls = lines.filter((l) => (l.group ?? 'object') === g).map((l) => ({ id: l.id, axis: l.axis }) as Flagged);
    applyMasterIds(ls, stored?.[g]);
    map[g] = masterIds(ls);
  }
  return { ...d, master: map } as T;
}
