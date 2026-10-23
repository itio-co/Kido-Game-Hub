import type * as THREE from 'three';

/**
 * EditMesh: the editable polygon mesh. Plain JSON, object-local metres.
 * All operations are pure: they never mutate their input and return a new EditMesh.
 */

/**
 * Editable polygon mesh.
 *
 * - `v`: flat vertex positions `[x0, y0, z0, x1, y1, z1, ...]`, object-local metres,
 *   each component rounded to 1e-5. Vertex index `i` lives at `v[3i .. 3i+2]`.
 * - `f`: faces as vertex-index loops, counter-clockwise when seen from the front
 *   (outside), i.e. right-hand normal. Quads preferred; tris and n-gons (n ≥ 3) allowed.
 *   No repeated index inside one face. Faces must be planar enough to fan-triangulate.
 * - `fm`: optional per-face material id, `fm.length === f.length`. `null` = object default
 *   (`EditObject.materialId`). Ids are resolved by `EditorHost.resolveMaterial`.
 * - `sm`: smooth shading. `true` = averaged vertex normals, `false`/absent = flat (low-poly look).
 *
 * Edges are not stored; derive them with `edgesOf()`.
 */
export interface EditMesh {
  v: number[];
  f: number[][];
  fm?: (string | null)[];
  sm?: boolean;
}

/** Undirected edge as a sorted vertex pair: `a < b`. */
export type Edge = [a: number, b: number];

/** Stable string key for an edge: `"${a}-${b}"` with `a < b`. Used in Selection and maps. */
export type EdgeKey = `${number}-${number}`;

/** `edgesOf(mesh)`: unique edges of all faces, each sorted `a < b`, ordered by first appearance. */
export type EdgesOf = (mesh: EditMesh) => Edge[];

/** Options for converting a three.js BufferGeometry (e.g. from a GLB) into an EditMesh. */
export interface FromGeometryOptions {
  /** Merge vertices closer than this (metres). Default 1e-5. Also merges coplanar tri pairs into quads when `quadify`. */
  weldEpsilon?: number;
  /** Rebuild quads from triangle pairs that share an edge and are coplanar within `quadAngleDeg`. Default true. */
  quadify?: boolean;
  /** Max dihedral angle (deg) between two tris to merge them into a quad. Default 1. */
  quadAngleDeg?: number;
  /** Material id per geometry group index (`geometry.groups[i].materialIndex`). */
  groupMaterialIds?: (string | null)[];
}

/** Options for building render geometry from an EditMesh. */
export interface ToGeometryOptions {
  /** Override `mesh.sm`. */
  smooth?: boolean;
}

/**
 * Pure mesh operations. Signatures only; implementations land in later PRs.
 * Element indices refer to the input mesh. Every op returns a new mesh and, where
 * useful, the indices of the new/affected elements so the caller can reselect them.
 */
export interface EditMeshOps {
  edgesOf: EdgesOf;
  /** Face normal (unit, object-local). Newell's method, so it works for non-planar n-gons. */
  faceNormal(mesh: EditMesh, face: number): [number, number, number];
  /** Centroid of a set of vertices (object-local). */
  centroid(mesh: EditMesh, verts: readonly number[]): [number, number, number];
  /** Round every component of `v` to 1e-5. */
  quantize(mesh: EditMesh): EditMesh;
  /** Apply a 4×4 column-major matrix (object-local) to the given vertices. */
  transformVerts(mesh: EditMesh, verts: readonly number[], matrix: ArrayLike<number>): EditMesh;

  extrude(mesh: EditMesh, faces: readonly number[], distance: number): { mesh: EditMesh; faces: number[] };
  inset(mesh: EditMesh, faces: readonly number[], thickness: number, opts?: { individual?: boolean }): { mesh: EditMesh; faces: number[] };
  bevel(mesh: EditMesh, edges: readonly Edge[], width: number, segments?: number): { mesh: EditMesh; faces: number[] };
  /** Merge vertices into one at their centroid (or at `to`). Degenerate faces are dropped. */
  merge(mesh: EditMesh, verts: readonly number[], to?: 'centroid' | 'first' | 'last'): { mesh: EditMesh; vert: number };
  /** Merge vertices closer than `epsilon` (default 1e-5). Used after GLB import. */
  weld(mesh: EditMesh, epsilon?: number): EditMesh;
  deleteFaces(mesh: EditMesh, faces: readonly number[], opts?: { dropLooseVerts?: boolean }): EditMesh;
  /** Reverse winding of the given faces. */
  flip(mesh: EditMesh, faces: readonly number[]): EditMesh;

  /** BufferGeometry (indexed or not) → EditMesh. Implemented with THREE at runtime. */
  fromBufferGeometry(geometry: THREE.BufferGeometry, opts?: FromGeometryOptions): EditMesh;
  /**
   * EditMesh → BufferGeometry. Fan-triangulates faces, one group per distinct `fm` value
   * (in first-appearance order), flat or smooth normals per `sm`.
   */
  toBufferGeometry(mesh: EditMesh, opts?: ToGeometryOptions): THREE.BufferGeometry;
}
