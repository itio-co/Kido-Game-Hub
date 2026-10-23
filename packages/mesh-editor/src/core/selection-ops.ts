import type { EditMesh, EdgeKey } from './mesh.js';
import { edgesOf } from './ops.js';
import type { ElementSelection, Selection, SelectMode } from './selection.js';

export function emptyElements(): ElementSelection {
  return { verts: [], edges: [], faces: [] };
}

export function edgeKey(a: number, b: number): EdgeKey {
  return (a < b ? `${a}-${b}` : `${b}-${a}`) as EdgeKey;
}

export function parseEdge(key: string): [number, number] {
  const [a, b] = key.split('-').map(Number);
  return [a ?? 0, b ?? 0];
}

/** Vertex indices touched by an element selection in `mode`. */
export function vertsFor(mesh: EditMesh, mode: SelectMode, el: ElementSelection | undefined): number[] {
  if (!el || mode === 'object') return [];
  const count = mesh.v.length / 3;
  const set = new Set<number>();
  if (mode === 'vertex') for (const v of el.verts) set.add(v);
  else if (mode === 'edge') {
    for (const key of el.edges) {
      const [a, b] = parseEdge(key);
      set.add(a);
      set.add(b);
    }
  } else {
    for (const fi of el.faces) for (const v of mesh.f[fi] ?? []) set.add(v);
  }
  return [...set].filter((i) => i >= 0 && i < count);
}

function facesOf(mesh: EditMesh, faces: readonly number[]): number[] {
  return faces.filter((fi) => fi >= 0 && fi < mesh.f.length);
}

function edgesOfFaces(mesh: EditMesh, faces: readonly number[]): EdgeKey[] {
  const set = new Set<EdgeKey>();
  for (const fi of faces) {
    const face = mesh.f[fi];
    if (!face) continue;
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) continue;
      set.add(edgeKey(a, b));
    }
  }
  return [...set];
}

function convertOne(mesh: EditMesh, from: SelectMode, to: SelectMode, el: ElementSelection): ElementSelection {
  if (to === 'vertex') {
    return { verts: vertsFor(mesh, from, el), edges: [], faces: [] };
  }
  if (to === 'edge') {
    if (from === 'edge') return { verts: [], edges: el.edges.slice(), faces: [] };
    if (from === 'face') return { verts: [], edges: edgesOfFaces(mesh, facesOf(mesh, el.faces)), faces: [] };
    const verts = new Set(el.verts);
    const edges = edgesOf(mesh)
      .filter(([a, b]) => verts.has(a) && verts.has(b))
      .map(([a, b]) => edgeKey(a, b));
    return { verts: [], edges, faces: [] };
  }
  if (from === 'face') return { verts: [], edges: [], faces: facesOf(mesh, el.faces) };
  if (from === 'vertex') {
    const verts = new Set(el.verts);
    const faces = mesh.f.map((_, fi) => fi).filter((fi) => (mesh.f[fi] ?? []).every((v) => verts.has(v)) && (mesh.f[fi]?.length ?? 0) >= 3);
    return { verts: [], edges: [], faces };
  }
  const edges = new Set(el.edges);
  const faces = mesh.f.map((face, fi) => ({ face, fi })).filter(({ face }) => {
    if (face.length < 3) return false;
    for (let k = 0; k < face.length; k++) {
      const a = face[k];
      const b = face[(k + 1) % face.length];
      if (a === undefined || b === undefined) return false;
      if (!edges.has(edgeKey(a, b))) return false;
    }
    return true;
  }).map(({ fi }) => fi);
  return { verts: [], edges: [], faces };
}

/** Switching mode converts the selection (API.md §7). Object mode drops elements. */
export function convertSelection(sel: Selection, to: SelectMode, getMesh: (id: string) => EditMesh | null): Selection {
  if (to === sel.mode) return sel;
  if (to === 'object') return { mode: 'object', objects: sel.objects.slice(), active: sel.active, elements: {} };
  const elements: Record<string, ElementSelection> = {};
  for (const id of sel.objects) {
    const mesh = getMesh(id);
    const from = sel.elements[id] ?? emptyElements();
    elements[id] = !mesh || sel.mode === 'object' ? emptyElements() : convertOne(mesh, sel.mode, to, from);
  }
  return { mode: to, objects: sel.objects.slice(), active: sel.active, elements };
}

export function selectionKey(sel: Selection): string {
  const parts = sel.objects.map((id) => {
    const el = sel.elements[id];
    return `${id}:${el?.verts.join(',') ?? ''}|${el?.edges.join(',') ?? ''}|${el?.faces.join(',') ?? ''}`;
  });
  return `${sel.mode}:${sel.active ?? ''}:${parts.join(';')}`;
}
