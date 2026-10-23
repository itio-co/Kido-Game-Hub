import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Vector3 } from 'three';
import { editMeshOps, type EditMesh } from '../src/index.js';

/** Unit cube, 1 m, centred, CCW quads seen from outside. Face 4 is +X. */
const cube = (): EditMesh => ({
  v: [-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5],
  f: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [1, 2, 6, 5],
    [0, 4, 7, 3],
  ],
  fm: [null, null, null, null, null, 'wood'],
});

function vert(mesh: EditMesh, i: number): [number, number, number] {
  return [mesh.v[3 * i] ?? 0, mesh.v[3 * i + 1] ?? 0, mesh.v[3 * i + 2] ?? 0];
}

describe('EditMeshOps', () => {
  it('lists cube edges a<b in first-appearance order', () => {
    const edges = editMeshOps.edgesOf(cube());
    expect(edges).toEqual([
      [0, 3], [2, 3], [1, 2], [0, 1],
      [4, 5], [5, 6], [6, 7], [4, 7],
      [1, 5], [0, 4],
      [3, 7], [2, 6],
    ]);
    expect(edges.every(([a, b]) => a < b)).toBe(true);
  });

  it('returns a unit Newell normal and a vertex centroid', () => {
    const mesh = cube();
    expect(editMeshOps.faceNormal(mesh, 4).map((n) => Math.round(n * 1e6) / 1e6)).toEqual([1, 0, 0]);
    expect(editMeshOps.faceNormal(mesh, 5)).toEqual([-1, 0, 0]);
    expect(editMeshOps.centroid(mesh, [1, 2, 6, 5])).toEqual([0.5, 0, 0]);
    expect(editMeshOps.faceNormal({ v: [0, 0, 0, 0, 0, 0, 0, 0, 0], f: [[0, 1, 2]] }, 0)).toEqual([0, 0, 0]);
  });

  it('quantizes to 1e-5 and never mutates the input', () => {
    const mesh: EditMesh = { v: [0.123456789, -0.000004, 1], f: [[0]] };
    const before = structuredClone(mesh);
    const out = editMeshOps.quantize(mesh);
    expect(out.v).toEqual([0.12346, 0, 1]);
    expect(mesh).toEqual(before);
    expect(out).not.toBe(mesh);
  });

  it('transformVerts applies a column-major matrix to the listed vertices only', () => {
    const mesh = cube();
    const before = structuredClone(mesh);
    const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.25, 0, 0, 1];
    const out = editMeshOps.transformVerts(mesh, [1, 5], m);
    expect(vert(out, 1)).toEqual([0.75, -0.5, -0.5]);
    expect(vert(out, 5)).toEqual([0.75, -0.5, 0.5]);
    expect(vert(out, 0)).toEqual(vert(mesh, 0));
    expect(mesh).toEqual(before);
  });

  it('extrudes the +X face by 0.25 m', () => {
    const mesh = cube();
    const before = structuredClone(mesh);
    const { mesh: out, faces } = editMeshOps.extrude(mesh, [4], 0.25);
    expect(mesh).toEqual(before);
    expect(out.f).toHaveLength(10);
    expect(faces).toEqual([4]);
    const cap = out.f[4] ?? [];
    const c = editMeshOps.centroid(out, cap);
    expect(c[0]).toBeCloseTo(0.75, 5);
    expect(c[1]).toBeCloseTo(0, 5);
    expect(c[2]).toBeCloseTo(0, 5);
    const n = editMeshOps.faceNormal(out, 4);
    expect(n[0]).toBeCloseTo(1, 5);
    expect(out.fm?.[5]).toBe('wood');
  });

  it('insets one face by a metre thickness', () => {
    const mesh = cube();
    const { mesh: out, faces } = editMeshOps.inset(mesh, [4], 0.1);
    expect(out.f).toHaveLength(10);
    expect(faces).toEqual([4]);
    const inner = (out.f[4] ?? []).map((i) => vert(out, i));
    for (const p of inner) {
      expect(p[0]).toBeCloseTo(0.5, 5);
      expect(Math.abs(p[1])).toBeCloseTo(0.4, 5);
      expect(Math.abs(p[2])).toBeCloseTo(0.4, 5);
    }
  });

  it('bevels one manifold edge into one new face', () => {
    const mesh = cube();
    const { mesh: out, faces } = editMeshOps.bevel(mesh, [[1, 2]], 0.1);
    expect(out.f.length).toBe(mesh.f.length + 1);
    expect(faces).toHaveLength(1);
    const created = out.f[faces[0] ?? -1];
    expect(created?.length).toBe(4);
  });

  it('merges vertices to their centroid and returns the new index', () => {
    const mesh = cube();
    const { mesh: out, vert: kept } = editMeshOps.merge(mesh, [0, 1], 'centroid');
    expect(out.v.length / 3).toBe(7);
    expect(vert(out, kept)[0]).toBeCloseTo(0, 5);
    expect(vert(out, kept)[1]).toBeCloseTo(-0.5, 5);
    expect(vert(out, kept)[2]).toBeCloseTo(-0.5, 5);
    const first = editMeshOps.merge(mesh, [0, 1], 'first');
    expect(vert(first.mesh, first.vert)).toEqual(vert(mesh, 0));
  });

  it('welds vertices inside epsilon and drops the duplicate', () => {
    const mesh = cube();
    mesh.v.push(0.500004, -0.5, -0.5);
    const extra = mesh.v.length / 3 - 1;
    mesh.f[4] = [extra, 2, 6, 5];
    const out = editMeshOps.weld(mesh, 1e-5);
    expect(out.v.length / 3).toBe(8);
    expect(out.f[4]).toEqual([1, 2, 6, 5]);
  });

  it('deletes faces and optionally drops loose vertices', () => {
    const mesh = cube();
    const kept = editMeshOps.deleteFaces(mesh, [4]);
    expect(kept.f).toHaveLength(5);
    expect(kept.v.length / 3).toBe(8);
    const gone = editMeshOps.deleteFaces(mesh, mesh.f.map((_, i) => i), { dropLooseVerts: true });
    expect(gone.f).toEqual([]);
    expect(gone.v).toEqual([]);
  });

  it('flips winding', () => {
    const mesh = cube();
    const out = editMeshOps.flip(mesh, [4]);
    expect(out.f[4]).toEqual([5, 6, 2, 1]);
    expect(editMeshOps.faceNormal(out, 4)[0]).toBeCloseTo(-1, 5);
    expect(mesh.f[4]).toEqual([1, 2, 6, 5]);
  });

  it('builds grouped triangle geometry with a triFace map', () => {
    const mesh = cube();
    const flat = editMeshOps.toBufferGeometry(mesh);
    const pos = flat.getAttribute('position');
    expect(pos.count).toBe(36);
    expect(flat.groups.map((g) => [g.start, g.count, g.materialIndex])).toEqual([
      [0, 30, 0],
      [30, 6, 1],
    ]);
    const triFace = flat.userData.triFace as number[];
    expect(triFace).toHaveLength(12);
    expect(triFace.filter((f) => f === 5)).toHaveLength(2);
    const n = flat.getAttribute('normal');
    expect(n.getX(0)).toBeCloseTo(0, 5);
    expect(n.getZ(0)).toBeCloseTo(-1, 5);
    expect(n.getX(1)).toBeCloseTo(n.getX(0), 5);
    const smooth = editMeshOps.toBufferGeometry({ ...mesh, sm: true });
    const sn = smooth.getAttribute('normal');
    const a = new Vector3(sn.getX(0), sn.getY(0), sn.getZ(0));
    const faceN = new Vector3(0, 0, -1);
    expect(a.dot(faceN)).toBeLessThan(0.99);
  });

  it('rebuilds a cube from indexed and non-indexed BoxGeometry', () => {
    const indexed = new BoxGeometry(1, 1, 1);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const fromIndexed = editMeshOps.fromBufferGeometry(indexed, { groupMaterialIds: ids });
    expect(fromIndexed.v.length / 3).toBe(8);
    expect(fromIndexed.f).toHaveLength(6);
    expect(fromIndexed.f.every((face) => face.length === 4)).toBe(true);
    expect(new Set(fromIndexed.fm)).toEqual(new Set(ids));
    const positions = indexed.getAttribute('position').clone();
    const loose = indexed.toNonIndexed();
    const fromLoose = editMeshOps.fromBufferGeometry(loose, { groupMaterialIds: ids });
    expect(fromLoose.v.length / 3).toBe(8);
    expect(fromLoose.f).toHaveLength(6);
    expect(indexed.getAttribute('position').array).toEqual(positions.array);
    const tris = editMeshOps.fromBufferGeometry(loose, { quadify: false, groupMaterialIds: ids });
    expect(tris.f).toHaveLength(12);
    expect(tris.f.every((face) => face.length === 3)).toBe(true);
    indexed.dispose();
    loose.dispose();
    void new BufferGeometry();
  });
});
