/**
 * Master guide line per axis (pure helpers, no DOM / Svelte).
 *
 * Each axis of each line group (object, room) has exactly ONE master line once it has any line:
 *   - the first line drawn on an axis becomes its master by default (array order = drawing order);
 *   - setting a new master demotes the old one;
 *   - deleting the master promotes the remaining line with the lowest residual to the free (unconstrained) VP fit;
 *   - the VP is constrained to the master's infinite line, parallel mode uses the master's direction, and
 *     consolidate never moves the master (see vpFit.ts).
 * Joint solve rule (object aligned with the room, or the room/object verticals shared in a yawed solve): when one
 * fit mixes both groups' lines of an axis, the ROOM master is authoritative and the object master is only an
 * ordinary line in that fit (`roomAuthoritative`). Per-group fits (overlay residuals, agreement) keep their own master.
 *
 * Stored on the line as `master: true` (so undo snapshots and the local draft carry it), and in
 * camera-match.json as `master: { object: [x, y, z], room: [x, y, z] }` (line ids, null = axis without lines).
 * A missing map (older files) means the default rule.
 */
import type { Axis, GuideLine } from './camMath';
import { fitVPMode, frameOf, type Frame, type VpMode } from './vpFit.ts';

export type MasterIds = [number | null, number | null, number | null];
export type MasterMap = { object: MasterIds; room: MasterIds };
type Flagged = { id: number; axis: Axis; master?: boolean };

const AXES: Axis[] = [0, 1, 2];

export function masterOf<L extends Flagged>(lines: readonly L[], axis: Axis): L | undefined {
  return lines.find((l) => l.axis === axis && l.master === true);
}
/** Master id per axis (null when the axis has no master). */
export function masterIds(lines: readonly Flagged[]): MasterIds {
  return AXES.map((a) => masterOf(lines, a)?.id ?? null) as MasterIds;
}

/**
 * Enforce exactly one master per axis that has lines (in place): extra flags are dropped (the first flagged line
 * stays master); an axis without one gets its first line. Returns true when anything changed.
 */
export function ensureMasters(lines: Flagged[]): boolean {
  let changed = false;
  for (const a of AXES) {
    const ls = lines.filter((l) => l.axis === a);
    if (!ls.length) continue;
    const keep = ls.find((l) => l.master === true) ?? ls[0]!;
    for (const l of ls) {
      if (l === keep && l.master !== true) {
        l.master = true;
        changed = true;
      } else if (l !== keep && 'master' in l) {
        delete l.master;
        changed = true;
      }
    }
  }
  return changed;
}

/** Make line `id` the master of its axis (in place; the old master is demoted). False when it already is / unknown. */
export function setMasterFlag(lines: Flagged[], id: number): boolean {
  const line = lines.find((l) => l.id === id);
  if (!line || line.master === true) return false;
  for (const l of lines) if (l.axis === line.axis && 'master' in l) delete l.master;
  line.master = true;
  return true;
}

/**
 * After the master of `axis` was deleted: promote the remaining line with the lowest residual against the free
 * (unconstrained) fit of the remaining lines; a single remaining line simply becomes master. In place; returns the
 * new master's id (null when the axis is now empty or still has a master).
 */
export function promoteMaster(lines: GuideLine[], axis: Axis, frame?: Frame, mode: VpMode = 'auto'): number | null {
  const ls = lines.filter((l) => l.axis === axis);
  if (!ls.length || ls.some((l) => l.master === true)) return null;
  const free = ls.map(({ master: _m, ...l }) => l);
  const fit = fitVPMode(free, frame ?? frameOf(free), mode);
  let best = 0;
  if (fit) for (let i = 1; i < ls.length; i++) if (fit.resDeg[i]! < fit.resDeg[best]!) best = i;
  ls[best]!.master = true;
  return ls[best]!.id;
}

/** Apply stored master ids (in place) — ids that don't match a line of that axis fall back to the default rule. */
export function applyMasterIds(lines: Flagged[], ids: readonly (number | null)[] | null | undefined): void {
  if (Array.isArray(ids)) {
    for (const a of AXES) {
      const id = ids[a];
      const line = typeof id === 'number' ? lines.find((l) => l.id === id && l.axis === a) : undefined;
      if (line) setMasterFlag(lines, line.id);
    }
  }
  ensureMasters(lines);
}

/** Valid stored master map, or null (missing / malformed → default rule). */
export function parseMasterMap(v: unknown): Partial<MasterMap> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const ids = (x: unknown): MasterIds | undefined =>
    Array.isArray(x) && x.length === 3 ? (x.map((i) => (typeof i === 'number' ? i : null)) as MasterIds) : undefined;
  const out: Partial<MasterMap> = {};
  const ob = ids(o.object);
  const ro = ids(o.room);
  if (ob) out.object = ob;
  if (ro) out.room = ro;
  return ob || ro ? out : null;
}

/**
 * Lines for a fit that mixes both groups: the object's master flags are dropped on every axis where the room has
 * a master (the room master is authoritative; the object master becomes an ordinary line in that fit).
 */
export function roomAuthoritative(object: readonly GuideLine[], room: readonly GuideLine[]): GuideLine[] {
  const roomAxes = new Set(room.filter((l) => l.master === true).map((l) => l.axis));
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
