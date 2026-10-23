/**
 * Snapping and linking for camera-match guide lines (pure functions, no DOM / Svelte).
 *
 * While an endpoint (or a whole line) is dragged it snaps to guide lines of a DIFFERENT axis, in this order:
 *   1. that line's endpoints            ('endpoint')
 *   2. where the dragged line's extension crosses the other line ('intersection')
 *   3. the nearest point on the other segment ('segment')
 * Endpoints that snapped onto another endpoint can be linked into a shared corner ("joint") and then move together.
 * All coordinates are image (ref) px; `threshold` is in the same units (screen px ÷ zoom scale).
 */
import type { GuideLine, V2 } from './camMath';

export type End = 'a' | 'b';
export type EndRef = { line: number; end: End };
export type SnapKind = 'endpoint' | 'intersection' | 'segment';
export type SnapTarget = { kind: SnapKind; point: V2; line: number; end?: End; dist: number };

/** Screen-space snap radius: bigger for fingers. */
export const SNAP_PX = { mouse: 12, touch: 22 } as const;

const other = (end: End): End => (end === 'a' ? 'b' : 'a');
const dist = (p: V2, q: V2): number => Math.hypot(p[0] - q[0], p[1] - q[1]);

/** Nearest point on segment a–b to p, with its parameter t ∈ [0, 1]. */
export function closestOnSegment(p: V2, a: V2, b: V2): { point: V2; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-18 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return { point: [a[0] + dx * t, a[1] + dy * t], t };
}

/** Intersection of the infinite lines p1–p2 and q1–q2, with the parameter u along q1→q2 (null if parallel). */
export function intersectLines(p1: V2, p2: V2, q1: V2, q2: V2): { point: V2; u: number } | null {
  const r: V2 = [p2[0] - p1[0], p2[1] - p1[1]];
  const s: V2 = [q2[0] - q1[0], q2[1] - q1[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  const scale = Math.hypot(...r) * Math.hypot(...s);
  if (scale < 1e-18 || Math.abs(den) < 1e-9 * scale) return null;
  const qp: V2 = [q1[0] - p1[0], q1[1] - p1[1]];
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const u = (qp[0] * r[1] - qp[1] * r[0]) / den;
  return { point: [p1[0] + r[0] * t, p1[1] + r[1] * t], u };
}

/** Endpoints sharing a joint with `ref` (including `ref` itself). */
export function jointMembers(lines: readonly GuideLine[], ref: EndRef): EndRef[] {
  const line = lines.find((l) => l.id === ref.line);
  const joint = line?.links?.[ref.end];
  if (joint === undefined) return [ref];
  const out: EndRef[] = [];
  for (const l of lines) for (const e of ['a', 'b'] as const) if (l.links?.[e] === joint) out.push({ line: l.id, end: e });
  return out;
}

/** Lines a snap may target while `moving` endpoints are dragged: other axis, not one of the moving lines. */
function candidates(lines: readonly GuideLine[], axis: number, moving: readonly EndRef[]): GuideLine[] {
  const skip = new Set(moving.map((m) => m.line));
  return lines.filter((l) => l.axis !== axis && !skip.has(l.id));
}

/**
 * Snap a dragged endpoint. `anchor` is the fixed other end of the dragged line (for the extension rule);
 * `moving` = the endpoints that move with it (its joint), excluded as targets.
 */
export function snapEndpoint(
  lines: readonly GuideLine[],
  dragged: EndRef,
  p: V2,
  threshold: number,
  moving: readonly EndRef[] = [dragged],
): SnapTarget | null {
  const line = lines.find((l) => l.id === dragged.line);
  if (!line || !(threshold > 0)) return null;
  const pool = candidates(lines, line.axis, moving);
  const anchor = line[other(dragged.end)];
  let best: SnapTarget | null = null;
  const consider = (t: SnapTarget): void => {
    if (t.dist <= threshold && (!best || t.dist < best.dist)) best = t;
  };
  // 1. endpoints
  for (const l of pool) for (const e of ['a', 'b'] as const) consider({ kind: 'endpoint', point: [...l[e]], line: l.id, end: e, dist: dist(p, l[e]) });
  if (best) return best;
  // 2. dragged line's extension × other line (inside the other segment, with the threshold as slack)
  if (dist(anchor, p) > 1e-9) {
    for (const l of pool) {
      const hit = intersectLines(anchor, p, l.a, l.b);
      if (!hit) continue;
      const len = dist(l.a, l.b) || 1;
      if (hit.u < -threshold / len || hit.u > 1 + threshold / len) continue;
      consider({ kind: 'intersection', point: hit.point, line: l.id, dist: dist(p, hit.point) });
    }
    if (best) return best;
  }
  // 3. nearest point on the other segment
  for (const l of pool) {
    const c = closestOnSegment(p, l.a, l.b);
    consider({ kind: 'segment', point: c.point, line: l.id, dist: dist(p, c.point) });
  }
  return best;
}

/**
 * Snap a whole line being translated to (a, b): tries both ends with the same priorities and returns the
 * translation correction plus the target. For the extension rule the end slides along the line itself.
 */
export function snapLine(
  lines: readonly GuideLine[],
  id: number,
  a: V2,
  b: V2,
  threshold: number,
  moving: readonly EndRef[] = [{ line: id, end: 'a' }, { line: id, end: 'b' }],
): (SnapTarget & { moved: End; delta: V2 }) | null {
  const line = lines.find((l) => l.id === id);
  if (!line) return null;
  const moved = lines.map((l) => (l.id === id ? { ...l, a, b } : l));
  const order: SnapKind[] = ['endpoint', 'intersection', 'segment'];
  let best: (SnapTarget & { moved: End; delta: V2 }) | null = null;
  for (const end of ['a', 'b'] as const) {
    const p = end === 'a' ? a : b;
    const t = snapEndpoint(moved, { line: id, end }, p, threshold, moving);
    if (!t) continue;
    const better = !best || order.indexOf(t.kind) < order.indexOf(best.kind) || (t.kind === best.kind && t.dist < best.dist);
    if (better) best = { ...t, moved: end, delta: [t.point[0] - p[0], t.point[1] - p[1]] };
  }
  return best;
}

/** Link two endpoints into one joint (merging existing joints). Mutates `lines`. */
export function linkEnds(lines: GuideLine[], p: EndRef, q: EndRef): number {
  const lp = lines.find((l) => l.id === p.line);
  const lq = lines.find((l) => l.id === q.line);
  if (!lp || !lq || (p.line === q.line && p.end === q.end)) return -1;
  const used = lines.flatMap((l) => [l.links?.a, l.links?.b]).filter((v): v is number => v !== undefined);
  const id = lp.links?.[p.end] ?? lq.links?.[q.end] ?? (used.length ? Math.max(...used) + 1 : 1);
  const merge = [lp.links?.[p.end], lq.links?.[q.end]].filter((v): v is number => v !== undefined && v !== id);
  for (const l of lines) for (const e of ['a', 'b'] as const) if (l.links?.[e] !== undefined && merge.includes(l.links[e]!)) l.links[e] = id;
  lp.links = { ...lp.links, [p.end]: id };
  lq.links = { ...lq.links, [q.end]: id };
  return id;
}

/** Remove an endpoint from its joint; a joint left with one member is dissolved. Mutates `lines`. */
export function unlinkEnd(lines: GuideLine[], ref: EndRef): void {
  const line = lines.find((l) => l.id === ref.line);
  const joint = line?.links?.[ref.end];
  if (!line || joint === undefined) return;
  drop(line, ref.end);
  const rest = lines.flatMap((l) => (['a', 'b'] as const).filter((e) => l.links?.[e] === joint).map((e) => ({ l, e })));
  if (rest.length === 1) drop(rest[0]!.l, rest[0]!.e);
}
function drop(line: GuideLine, end: End): void {
  if (!line.links) return;
  const { [end]: _gone, ...keep } = line.links;
  line.links = Object.keys(keep).length ? keep : undefined;
  if (!line.links) delete line.links;
}

/** Remove a line and dissolve joints left with a single member. Mutates `lines`. */
export function removeLineLinks(lines: GuideLine[], id: number): void {
  const line = lines.find((l) => l.id === id);
  if (!line) return;
  for (const e of ['a', 'b'] as const) unlinkEnd(lines, { line: id, end: e });
}

/** Joint positions for drawing shared corners (members all sit on the same point). */
export function joints(lines: readonly GuideLine[]): { id: number; point: V2; members: EndRef[] }[] {
  const map = new Map<number, { id: number; point: V2; members: EndRef[] }>();
  for (const l of lines)
    for (const e of ['a', 'b'] as const) {
      const j = l.links?.[e];
      if (j === undefined) continue;
      const g = map.get(j) ?? { id: j, point: [...l[e]] as V2, members: [] };
      g.members.push({ line: l.id, end: e });
      map.set(j, g);
    }
  return [...map.values()].filter((g) => g.members.length > 1);
}
