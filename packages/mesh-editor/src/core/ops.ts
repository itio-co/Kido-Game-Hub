/**
 * Pure EditMesh operations. Never mutates the input mesh or the input BufferGeometry.
 * Every returned mesh is quantized to 1e-5 m. See API.md §2.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';
import type { EditMesh, EditMeshOps, Edge, FromGeometryOptions, ToGeometryOptions } from './mesh.js';

const EPS = 1e-5;

export function quantizeComponent(n: number): number {
  const rounded = Math.round(n * 1e5) / 1e5;
  return rounded === 0 ? 0 : rounded;
}

export function cloneMesh(mesh: EditMesh): EditMesh {
  const out: EditMesh = { v: mesh.v.slice(), f: mesh.f.map((face) => face.slice()) };
  if (mesh.fm) out.fm = mesh.fm.slice();
  if (mesh.sm) out.sm = true;
  return out;
}

function vertCount(mesh: EditMesh): number {
  return mesh.v.length / 3;
}

function getV(mesh: EditMesh, i: number, out = new Vector3()): Vector3 {
  return out.set(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0);
}

function setV(mesh: EditMesh, i: number, p: Vector3): void {
  mesh.v[3 * i] = quantizeComponent(p.x);
  mesh.v[3 * i + 1] = quantizeComponent(p.y);
  mesh.v[3 * i + 2] = quantizeComponent(p.z);
}

function addV(mesh: EditMesh, p: Vector3): number {
  mesh.v.push(quantizeComponent(p.x), quantizeComponent(p.y), quantizeComponent(p.z));
  return mesh.v.length / 3 - 1;
}

function matOf(mesh: EditMesh, face: number): string | null {
  return mesh.fm?.[face] ?? null;
}

function pushFace(mesh: EditMesh, face: number[], mat: string | null): number {
  mesh.f.push(face);
  const fi = mesh.f.length - 1;
  if (mesh.fm || mat) {
    if (!mesh.fm) mesh.fm = Array.from({ length: fi }, () => null);
    mesh.fm.push(mat);
  }
  return fi;
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Unique edges, `a < b`, first-appearance order (face order, then loop order). */
export function edgesOf(mesh: EditMesh): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const face of mesh.f) {
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined || a === b) continue;
      const lo = a < b ? a : b;
      const hi = a < b ? b : a;
      const key = `${lo}-${hi}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([lo, hi]);
    }
  }
  return out;
}

/** Un-normalized Newell normal (length tracks area). */
function newell(mesh: EditMesh, face: readonly number[]): Vector3 {
  const n = new Vector3();
  for (let k = 0; k < face.length; k++) {
    const i = face[k];
    const j = face[(k + 1) % face.length];
    if (i === undefined || j === undefined) continue;
    const ax = mesh.v[3 * i] ?? 0;
    const ay = mesh.v[3 * i + 1] ?? 0;
    const az = mesh.v[3 * i + 2] ?? 0;
    const bx = mesh.v[3 * j] ?? 0;
    const by = mesh.v[3 * j + 1] ?? 0;
    const bz = mesh.v[3 * j + 2] ?? 0;
    n.x += (ay - by) * (az + bz);
    n.y += (az - bz) * (ax + bx);
    n.z += (ax - bx) * (ay + by);
  }
  return n;
}

export function faceNormal(mesh: EditMesh, face: number): [number, number, number] {
  const loop = mesh.f[face];
  if (!loop || loop.length < 3) return [0, 0, 0];
  const n = newell(mesh, loop);
  const len = n.length();
  if (len < 1e-12) return [0, 0, 0];
  return [n.x / len, n.y / len, n.z / len];
}

export function centroid(mesh: EditMesh, verts: readonly number[]): [number, number, number] {
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  const count = vertCount(mesh);
  for (const i of verts) {
    if (i < 0 || i >= count) continue;
    x += mesh.v[3 * i] ?? 0;
    y += mesh.v[3 * i + 1] ?? 0;
    z += mesh.v[3 * i + 2] ?? 0;
    n++;
  }
  if (!n) return [0, 0, 0];
  return [x / n, y / n, z / n];
}

export function quantize(mesh: EditMesh): EditMesh {
  const out = cloneMesh(mesh);
  out.v = out.v.map(quantizeComponent);
  return out;
}

export function transformVerts(mesh: EditMesh, verts: readonly number[], matrix: ArrayLike<number>): EditMesh {
  const out = cloneMesh(mesh);
  const m: number[] = [];
  for (let i = 0; i < 16; i++) m.push(matrix[i] ?? (i % 5 === 0 ? 1 : 0));
  const p = new Vector3();
  const count = vertCount(mesh);
  for (const i of verts) {
    if (i < 0 || i >= count) continue;
    p.set(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0);
    const x = m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!;
    const y = m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!;
    const z = m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!;
    setV(out, i, p.set(x, y, z));
  }
  return quantize(out);
}

interface CompactResult {
  mesh: EditMesh;
  /** Old vertex index → new index, for vertices that survived. */
  map: Map<number, number>;
  /** Old face index → new index, or -1 when the face was dropped. */
  faceMap: number[];
}

/** Drop degenerate faces. With `dropLoose`, also drop vertices no face uses and reindex. */
function compact(mesh: EditMesh, dropLoose: boolean): CompactResult {
  const faces: number[][] = [];
  const fm: (string | null)[] = [];
  const faceMap: number[] = [];
  mesh.f.forEach((face, fi) => {
    const g: number[] = [];
    for (const i of face) if (g[g.length - 1] !== i) g.push(i);
    while (g.length > 1 && g[0] === g[g.length - 1]) g.pop();
    if (new Set(g).size >= 3) {
      faceMap.push(faces.length);
      faces.push(g);
      fm.push(matOf(mesh, fi));
    } else faceMap.push(-1);
  });
  const map = new Map<number, number>();
  const v: number[] = [];
  const used = new Set<number>();
  for (const face of faces) for (const i of face) used.add(i);
  const source = dropLoose ? used : new Set<number>(Array.from({ length: vertCount(mesh) }, (_, i) => i));
  // Stable order: ascending old index, so results don't depend on face order.
  const ordered = [...source].sort((a, b) => a - b);
  for (const i of ordered) {
    map.set(i, v.length / 3);
    v.push(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0);
  }
  for (const face of faces) {
    for (let k = 0; k < face.length; k++) {
      const i = face[k];
      if (i === undefined) continue;
      const ni = map.get(i);
      if (ni === undefined) continue;
      face[k] = ni;
    }
  }
  const out: EditMesh = { v, f: faces };
  if (fm.some((x) => x != null)) out.fm = fm;
  if (mesh.sm) out.sm = true;
  return { mesh: out, map, faceMap };
}

export function extrude(mesh: EditMesh, faces: readonly number[], distance: number): { mesh: EditMesh; faces: number[] } {
  const selected = [...faces].filter((fi) => (mesh.f[fi]?.length ?? 0) >= 3);
  if (!selected.length) return { mesh: quantize(mesh), faces: [] };
  const out = cloneMesh(mesh);
  const n = new Vector3();
  for (const fi of selected) {
    const fn = faceNormal(mesh, fi);
    n.x += fn[0];
    n.y += fn[1];
    n.z += fn[2];
  }
  if (n.lengthSq() < 1e-12) {
    const fn = faceNormal(mesh, selected[0]!);
    n.set(fn[0], fn[1], fn[2]);
  }
  if (n.lengthSq() < 1e-12) n.set(0, 1, 0);
  n.normalize();
  const count = new Map<string, number>();
  for (const fi of selected) {
    const face = mesh.f[fi];
    if (!face) continue;
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) continue;
      const key = edgeKey(a, b);
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  const dup = new Map<number, number>();
  const p = new Vector3();
  const nv = (i: number): number => {
    const hit = dup.get(i);
    if (hit !== undefined) return hit;
    const j = addV(out, getV(mesh, i, p).addScaledVector(n, distance));
    dup.set(i, j);
    return j;
  };
  for (const fi of selected) {
    const face = mesh.f[fi];
    if (!face) continue;
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) continue;
      if (count.get(edgeKey(a, b)) === 1) pushFace(out, [a, b, nv(b), nv(a)], matOf(mesh, fi));
    }
  }
  for (const fi of selected) {
    const face = mesh.f[fi];
    if (face) out.f[fi] = face.map((i) => nv(i));
  }
  return { mesh: quantize(out), faces: selected };
}

function lineIntersect(p1: Vector3, d1: Vector3, p2: Vector3, d2: Vector3): Vector3 | null {
  const cr = new Vector3().crossVectors(d1, d2);
  const denom = cr.lengthSq();
  if (denom < 1e-14) return null;
  const t = new Vector3().subVectors(p2, p1).cross(d2).dot(cr) / denom;
  return p1.clone().addScaledVector(d1, t);
}

/** Inset one polygon by moving each corner onto the intersection of its offset edges. */
function insetLoop(mesh: EditMesh, loop: readonly number[], thickness: number, normal: Vector3): number[] {
  const out: number[] = [];
  const p = new Vector3();
  const prevP = new Vector3();
  const nextP = new Vector3();
  for (let i = 0; i < loop.length; i++) {
    const iPrev = loop[(i - 1 + loop.length) % loop.length]!;
    const iCur = loop[i]!;
    const iNext = loop[(i + 1) % loop.length]!;
    getV(mesh, iPrev, prevP);
    getV(mesh, iCur, p);
    getV(mesh, iNext, nextP);
    const d1 = p.clone().sub(prevP);
    const d2 = nextP.clone().sub(p);
    const len1 = d1.length();
    const len2 = d2.length();
    if (len1 < 1e-12 || len2 < 1e-12) {
      out.push(addV(mesh, p));
      continue;
    }
    d1.multiplyScalar(1 / len1);
    d2.multiplyScalar(1 / len2);
    const in1 = new Vector3().crossVectors(normal, d1).normalize();
    const in2 = new Vector3().crossVectors(normal, d2).normalize();
    const a = prevP.clone().addScaledVector(in1, thickness);
    const b = p.clone().addScaledVector(in2, thickness);
    const hit = lineIntersect(a, d1, b, d2) ?? p.clone().addScaledVector(in1, thickness);
    out.push(addV(mesh, hit));
  }
  return out;
}

function insetIndividual(mesh: EditMesh, faces: readonly number[], thickness: number): { mesh: EditMesh; faces: number[] } {
  const out = cloneMesh(mesh);
  const kept: number[] = [];
  for (const fi of faces) {
    const face = out.f[fi];
    if (!face || face.length < 3) continue;
    const n = newell(out, face);
    if (n.lengthSq() < 1e-16) continue;
    n.normalize();
    const inner = insetLoop(out, face, thickness, n);
    for (let k = 0; k < face.length; k++) {
      const j = (k + 1) % face.length;
      const a = face[k];
      const b = face[j];
      const ib = inner[j];
      const ia = inner[k];
      if (a === undefined || b === undefined || ia === undefined || ib === undefined) continue;
      pushFace(out, [a, b, ib, ia], matOf(out, fi));
    }
    out.f[fi] = inner;
    kept.push(fi);
  }
  return { mesh: quantize(out), faces: kept };
}

function insetRegion(mesh: EditMesh, faces: readonly number[], thickness: number): { mesh: EditMesh; faces: number[] } {
  const out = cloneMesh(mesh);
  const sel = new Set(faces.filter((fi) => (out.f[fi]?.length ?? 0) >= 3));
  if (!sel.size) return { mesh: quantize(out), faces: [] };
  const count = new Map<string, number>();
  const directed: [number, number, number][] = [];
  for (const fi of sel) {
    const face = out.f[fi];
    if (!face) continue;
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) continue;
      const key = edgeKey(a, b);
      count.set(key, (count.get(key) ?? 0) + 1);
      directed.push([a, b, fi]);
    }
  }
  const outgoing = new Map<number, number>();
  const incoming = new Map<number, number>();
  for (const [a, b] of directed) {
    if (count.get(edgeKey(a, b)) !== 1) continue;
    outgoing.set(a, b);
    incoming.set(b, a);
  }
  const boundary = [...outgoing.keys()];
  if (!boundary.length) return { mesh: quantize(out), faces: [...sel] };
  // Average normal of the region, for the offset direction.
  const n = new Vector3();
  for (const fi of sel) n.add(newell(out, out.f[fi] ?? []));
  if (n.lengthSq() < 1e-16) n.set(0, 1, 0);
  n.normalize();
  const mapped = new Map<number, number>();
  // Walk each boundary loop once.
  const seen = new Set<number>();
  for (const start of boundary) {
    if (seen.has(start)) continue;
    const loop: number[] = [];
    let cur: number | undefined = start;
    for (let guard = 0; cur !== undefined && !seen.has(cur) && guard < boundary.length + 2; guard++) {
      seen.add(cur);
      loop.push(cur);
      cur = outgoing.get(cur);
      if (cur === start) break;
    }
    if (loop.length < 3) continue;
    const inner = insetLoop(out, loop, thickness, n);
    loop.forEach((v, i) => {
      const ni = inner[i];
      if (ni !== undefined) mapped.set(v, ni);
    });
    for (let k = 0; k < loop.length; k++) {
      const a = loop[k];
      const b = loop[(k + 1) % loop.length];
      const ia = inner[k];
      const ib = inner[(k + 1) % loop.length];
      if (a === undefined || b === undefined || ia === undefined || ib === undefined) continue;
      pushFace(out, [a, b, ib, ia], null);
    }
  }
  for (const fi of sel) {
    const face = out.f[fi];
    if (!face) continue;
    out.f[fi] = face.map((i) => mapped.get(i) ?? i);
  }
  return { mesh: quantize(out), faces: [...sel] };
}

export function inset(
  mesh: EditMesh,
  faces: readonly number[],
  thickness: number,
  opts?: { individual?: boolean },
): { mesh: EditMesh; faces: number[] } {
  const selected = [...faces];
  if (!selected.length || thickness === 0) return { mesh: quantize(mesh), faces: selected };
  if (opts?.individual === false) return insetRegion(mesh, selected, thickness);
  return insetIndividual(mesh, selected, thickness);
}

function edgeFaces(mesh: EditMesh): Map<string, number[]> {
  const map = new Map<string, number[]>();
  mesh.f.forEach((face, fi) => {
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) continue;
      const key = edgeKey(a, b);
      const list = map.get(key);
      if (list) list.push(fi);
      else map.set(key, [fi]);
    }
  });
  return map;
}

export function bevel(
  mesh: EditMesh,
  edges: readonly Edge[],
  width: number,
  segments?: number,
): { mesh: EditMesh; faces: number[] } {
  const out = cloneMesh(mesh);
  const segs = Math.max(1, Math.floor(segments ?? 1));
  const created: number[] = [];
  const pos = (i: number, target = new Vector3()) => getV(out, i, target);
  for (const [ea, eb] of edges) {
    const adj = edgeFaces(out).get(edgeKey(ea, eb));
    if (!adj || adj.length !== 2) continue;
    let f1i = adj[0]!;
    let f2i = adj[1]!;
    const dirIn = (fi: number, a: number, b: number) => {
      const face = out.f[fi];
      if (!face) return false;
      const k = face.indexOf(a);
      return k >= 0 && face[(k + 1) % face.length] === b;
    };
    let a = ea;
    let b = eb;
    if (!dirIn(f1i, a, b)) {
      const swap = a;
      a = b;
      b = swap;
    }
    if (!dirIn(f1i, a, b)) continue;
    if (!dirIn(f2i, b, a)) {
      if (dirIn(f2i, a, b) && dirIn(f1i, b, a)) {
        const s = f1i;
        f1i = f2i;
        f2i = s;
        const swap = a;
        a = b;
        b = swap;
      } else continue;
    }
    const face1 = out.f[f1i];
    const face2 = out.f[f2i];
    if (!face1 || !face2) continue;
    const prevIn = (face: number[], i: number) => face[(face.indexOf(i) - 1 + face.length) % face.length]!;
    const nextIn = (face: number[], i: number) => face[(face.indexOf(i) + 1) % face.length]!;
    const len = pos(a).distanceTo(pos(b));
    const ww = Math.min(Math.abs(width), len * 0.45);
    const slide = (from: number, to: number): number => {
      const pa = pos(from);
      const dir = pos(to).sub(pa);
      const l = dir.length();
      const dist = Math.min(ww, l * 0.45);
      return addV(out, pa.addScaledVector(l > 1e-12 ? dir.multiplyScalar(1 / l) : dir, dist));
    };
    const p1 = prevIn(face1, a);
    const r1 = nextIn(face1, b);
    const q2 = nextIn(face2, a);
    const s2 = prevIn(face2, b);
    const a1 = slide(a, p1);
    const b1 = slide(b, r1);
    const a2 = slide(a, q2);
    const b2 = slide(b, s2);
    const nbA: Record<number, number> = { [p1]: a1, [q2]: a2 };
    const nbB: Record<number, number> = { [r1]: b1, [s2]: b2 };
    out.f = out.f.map((face, fi) => {
      if (fi === f1i) return face.map((i) => (i === a ? a1 : i === b ? b1 : i));
      if (fi === f2i) return face.map((i) => (i === a ? a2 : i === b ? b2 : i));
      const g: number[] = [];
      for (let k = 0; k < face.length; k++) {
        const i = face[k];
        if (i === undefined) continue;
        if (i !== a && i !== b) {
          g.push(i);
          continue;
        }
        const rep = i === a ? nbA : nbB;
        const prev = face[(k - 1 + face.length) % face.length];
        const next = face[(k + 1) % face.length];
        const x = prev !== undefined ? rep[prev] : undefined;
        const y = next !== undefined ? rep[next] : undefined;
        if (x !== undefined) g.push(x);
        if (y !== undefined && y !== x) g.push(y);
        if (x === undefined && y === undefined) g.push(i);
      }
      return g;
    });
    const mat = matOf(out, f1i);
    if (segs === 1) {
      created.push(pushFace(out, [b1, a1, a2, b2], mat));
    } else {
      // Strips from face 1 toward face 2.
      let prevA = a1;
      let prevB = b1;
      const pa = new Vector3();
      const pb = new Vector3();
      const qa = new Vector3();
      const qb = new Vector3();
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const na = s === segs ? a2 : addV(out, getV(out, a1, pa).lerp(getV(out, a2, qa), t));
        const nb = s === segs ? b2 : addV(out, getV(out, b1, pb).lerp(getV(out, b2, qb), t));
        created.push(pushFace(out, [prevB, prevA, na, nb], mat));
        prevA = na;
        prevB = nb;
      }
    }
  }
  const compacted = compact(out, true);
  const faces = created.map((fi) => compacted.faceMap[fi] ?? -1).filter((fi) => fi >= 0);
  return { mesh: quantize(compacted.mesh), faces };
}

export function merge(
  mesh: EditMesh,
  verts: readonly number[],
  to: 'centroid' | 'first' | 'last' = 'centroid',
): { mesh: EditMesh; vert: number } {
  const count = vertCount(mesh);
  const uniq: number[] = [];
  const seen = new Set<number>();
  for (const i of verts) {
    if (i < 0 || i >= count || seen.has(i)) continue;
    seen.add(i);
    uniq.push(i);
  }
  if (uniq.length < 2) return { mesh: quantize(mesh), vert: uniq[0] ?? 0 };
  const keep = to === 'last' ? uniq[uniq.length - 1]! : uniq[0]!;
  const target =
    to === 'first' ? ([mesh.v[3 * keep] ?? 0, mesh.v[3 * keep + 1] ?? 0, mesh.v[3 * keep + 2] ?? 0] as const)
    : to === 'last' ? ([mesh.v[3 * keep] ?? 0, mesh.v[3 * keep + 1] ?? 0, mesh.v[3 * keep + 2] ?? 0] as const)
    : centroid(mesh, uniq);
  const out = cloneMesh(mesh);
  setV(out, keep, new Vector3(target[0], target[1], target[2]));
  out.f = out.f.map((face) => face.map((i) => (seen.has(i) ? keep : i)));
  const compacted = compact(out, true);
  return { mesh: quantize(compacted.mesh), vert: compacted.map.get(keep) ?? 0 };
}

export function weld(mesh: EditMesh, epsilon = EPS): EditMesh {
  const n = vertCount(mesh);
  if (n === 0) return quantize(mesh);
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const grid = new Map<string, number[]>();
  const cellOf = (value: number) => Math.floor(value / epsilon);
  for (let i = 0; i < n; i++) {
    const x = mesh.v[3 * i] ?? 0;
    const y = mesh.v[3 * i + 1] ?? 0;
    const z = mesh.v[3 * i + 2] ?? 0;
    const cx = cellOf(x);
    const cy = cellOf(y);
    const cz = cellOf(z);
    let found = -1;
    for (let dx = -1; dx <= 1 && found < 0; dx++) {
      for (let dy = -1; dy <= 1 && found < 0; dy++) {
        for (let dz = -1; dz <= 1 && found < 0; dz++) {
          const bucket = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!bucket) continue;
          for (const j of bucket) {
            const d = Math.hypot(x - (mesh.v[3 * j] ?? 0), y - (mesh.v[3 * j + 1] ?? 0), z - (mesh.v[3 * j + 2] ?? 0));
            if (d <= epsilon + 1e-12) {
              found = find(j);
              break;
            }
          }
        }
      }
    }
    if (found >= 0) parent[i] = found;
    else {
      const key = `${cx},${cy},${cz}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
  }
  const out = cloneMesh(mesh);
  out.f = out.f.map((face) => face.map((i) => find(i)));
  return quantize(compact(out, true).mesh);
}

export function deleteFaces(mesh: EditMesh, faces: readonly number[], opts?: { dropLooseVerts?: boolean }): EditMesh {
  const drop = new Set(faces);
  const out = cloneMesh(mesh);
  const kept: number[][] = [];
  const fm: (string | null)[] = [];
  out.f.forEach((face, fi) => {
    if (drop.has(fi)) return;
    kept.push(face);
    if (out.fm) fm.push(out.fm[fi] ?? null);
  });
  out.f = kept;
  if (out.fm) out.fm = fm;
  if (!out.fm?.some((x) => x != null)) delete out.fm;
  const compacted = opts?.dropLooseVerts ? compact(out, true).mesh : out;
  return quantize(compacted);
}

export function flip(mesh: EditMesh, faces: readonly number[]): EditMesh {
  const out = cloneMesh(mesh);
  for (const fi of faces) {
    const face = out.f[fi];
    if (face) out.f[fi] = face.slice().reverse();
  }
  return quantize(out);
}

function quadFromTris(t1: readonly number[], t2: readonly number[]): number[] | null {
  let a = -1;
  let b = -1;
  for (let k = 0; k < 3; k++) {
    const u = t1[k];
    const v = t1[(k + 1) % 3];
    if (u === undefined || v === undefined) continue;
    if (t2.includes(u) && t2.includes(v)) {
      a = u;
      b = v;
      break;
    }
  }
  if (a < 0 || b < 0) return null;
  const c = t1.find((v) => v !== a && v !== b);
  const d = t2.find((v) => v !== a && v !== b);
  if (c === undefined || d === undefined) return null;
  const ib = t2.indexOf(b);
  if (ib < 0 || t2[(ib + 1) % 3] !== a) return null;
  return [b, c, a, d];
}

function convexQuad(mesh: EditMesh, quad: readonly number[], normal: Vector3): boolean {
  const p = [0, 1, 2, 3].map((i) => getV(mesh, quad[i]!));
  for (let k = 0; k < 4; k++) {
    const prev = p[(k + 3) % 4]!;
    const cur = p[k]!;
    const next = p[(k + 1) % 4]!;
    const cr = new Vector3().subVectors(cur, prev).cross(new Vector3().subVectors(next, cur));
    if (cr.dot(normal) < -1e-8) return false;
  }
  return true;
}

function quadifyMesh(mesh: EditMesh, angleDeg: number): EditMesh {
  const limit = Math.cos((angleDeg * Math.PI) / 180);
  const tris = mesh.f.map((face, i) => ({ face, i })).filter((t) => t.face.length === 3);
  const buckets = new Map<string, number[]>();
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const a = t.face[k];
      const b = t.face[(k + 1) % 3];
      if (a === undefined || b === undefined) continue;
      const key = edgeKey(a, b);
      const list = buckets.get(key);
      if (list) list.push(t.i);
      else buckets.set(key, [t.i]);
    }
  }
  const used = new Set<number>();
  const faces: number[][] = [];
  const fm: (string | null)[] = [];
  const normals = mesh.f.map((face) => newell(mesh, face));
  for (let i = 0; i < mesh.f.length; i++) {
    if (used.has(i)) continue;
    const face = mesh.f[i];
    if (!face) continue;
    if (face.length !== 3) {
      used.add(i);
      faces.push(face.slice());
      fm.push(matOf(mesh, i));
      continue;
    }
    let partner = -1;
    let quad: number[] | null = null;
    for (let k = 0; k < 3 && partner < 0; k++) {
      const a = face[k];
      const b = face[(k + 1) % 3];
      if (a === undefined || b === undefined) continue;
      for (const j of buckets.get(edgeKey(a, b)) ?? []) {
        if (j === i || used.has(j)) continue;
        const other = mesh.f[j];
        if (!other || other.length !== 3) continue;
        if (matOf(mesh, i) !== matOf(mesh, j)) continue;
        const ni = normals[i] ?? new Vector3();
        const nj = normals[j] ?? new Vector3();
        const li = ni.length();
        const lj = nj.length();
        if (li < 1e-12 || lj < 1e-12) continue;
        if (ni.dot(nj) / (li * lj) < limit) continue;
        const candidate = quadFromTris(face, other);
        if (!candidate || !convexQuad(mesh, candidate, ni)) continue;
        partner = j;
        quad = candidate;
        break;
      }
    }
    used.add(i);
    if (partner >= 0 && quad) {
      used.add(partner);
      faces.push(quad);
      fm.push(matOf(mesh, i));
    } else {
      faces.push(face.slice());
      fm.push(matOf(mesh, i));
    }
  }
  const out: EditMesh = { v: mesh.v.slice(), f: faces };
  if (fm.some((x) => x != null)) out.fm = fm;
  if (mesh.sm) out.sm = true;
  return out;
}

export function fromBufferGeometry(geometry: BufferGeometry, opts?: FromGeometryOptions): EditMesh {
  const position = geometry.getAttribute('position');
  if (!position) return { v: [], f: [] };
  const index = geometry.getIndex();
  const triCount = Math.floor((index ? index.count : position.count) / 3);
  const v: number[] = [];
  const f: number[][] = [];
  const fm: (string | null)[] = [];
  const corner = (vertex: number): number => {
    v.push(position.getX(vertex), position.getY(vertex), position.getZ(vertex));
    return v.length / 3 - 1;
  };
  const materialAt = (tri: number): string | null => {
    const ids = opts?.groupMaterialIds;
    const cursor = tri * 3;
    const groups = geometry.groups;
    if (!groups.length) return ids?.[0] ?? null;
    for (const group of groups) {
      if (cursor >= group.start && cursor < group.start + group.count) {
        return ids?.[group.materialIndex ?? 0] ?? null;
      }
    }
    return null;
  };
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    f.push([corner(i0), corner(i1), corner(i2)]);
    fm.push(materialAt(t));
  }
  let mesh: EditMesh = { v, f };
  if (fm.some((x) => x != null)) mesh.fm = fm;
  mesh = weld(mesh, opts?.weldEpsilon ?? EPS);
  if (opts?.quadify !== false) mesh = quadifyMesh(mesh, opts?.quadAngleDeg ?? 1);
  return quantize(mesh);
}

export function toBufferGeometry(mesh: EditMesh, opts?: ToGeometryOptions): BufferGeometry {
  const smooth = opts?.smooth ?? !!mesh.sm;
  const order: (string | null)[] = [];
  const buckets = new Map<string, number[]>();
  const keyOf = (mat: string | null) => (mat == null ? '\0' : mat);
  mesh.f.forEach((face, fi) => {
    if (face.length < 3) return;
    const mat = matOf(mesh, fi);
    const key = keyOf(mat);
    if (!buckets.has(key)) {
      order.push(mat);
      buckets.set(key, []);
    }
    buckets.get(key)!.push(fi);
  });
  const positions: number[] = [];
  const normals: number[] = [];
  const triFace: number[] = [];
  const smoothN = new Float32Array(mesh.v.length);
  if (smooth) {
    mesh.f.forEach((face) => {
      const n = newell(mesh, face);
      for (const i of face) {
        smoothN[3 * i] = (smoothN[3 * i] ?? 0) + n.x;
        smoothN[3 * i + 1] = (smoothN[3 * i + 1] ?? 0) + n.y;
        smoothN[3 * i + 2] = (smoothN[3 * i + 2] ?? 0) + n.z;
      }
    });
  }
  const geo = new BufferGeometry();
  let start = 0;
  const tmp = new Vector3();
  for (const mat of order) {
    const list = buckets.get(keyOf(mat)) ?? [];
    let count = 0;
    for (const fi of list) {
      const face = mesh.f[fi];
      if (!face || face.length < 3) continue;
      const fn = newell(mesh, face).normalize();
      for (let k = 1; k < face.length - 1; k++) {
        const ids = [face[0], face[k], face[k + 1]];
        for (const i of ids) {
          if (i === undefined) continue;
          positions.push(mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0);
          if (smooth) {
            tmp.set(smoothN[3 * i] ?? 0, smoothN[3 * i + 1] ?? 0, smoothN[3 * i + 2] ?? 0);
            if (tmp.lengthSq() < 1e-16) tmp.copy(fn);
            else tmp.normalize();
            normals.push(tmp.x, tmp.y, tmp.z);
          } else normals.push(fn.x, fn.y, fn.z);
        }
        triFace.push(fi);
        count += 3;
      }
    }
    geo.addGroup(start, count, order.indexOf(mat));
    start += count;
  }
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  geo.userData.triFace = triFace;
  geo.userData.groupMaterials = order;
  return geo;
}

export const editMeshOps: EditMeshOps = {
  edgesOf,
  faceNormal,
  centroid,
  quantize,
  transformVerts,
  extrude,
  inset,
  bevel,
  merge,
  weld,
  deleteFaces,
  flip,
  fromBufferGeometry,
  toBufferGeometry,
};
