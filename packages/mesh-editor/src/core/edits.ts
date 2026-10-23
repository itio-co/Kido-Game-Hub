import type { EditMesh } from './mesh.js';
import type { Vec3 } from './math.js';

/**
 * edits.json: what the editor exports so a change can be ported back into the Blender
 * build scripts (games/never-ending-story/assets-src/<slug>/blender/build_master.py).
 *
 * `kido-model-edits/1` is the format already written by the Kido model editor
 * (games/never-ending-story/src/lib/editor/modelEditor.ts, `exportEdits()`). Every field below that is not marked
 * "added" exists there today with the same name, unit and meaning. Added fields are optional,
 * so files written by the current editor stay valid and readers of the current format can
 * ignore them.
 */

/** Axis-aligned box in Blender world coordinates (Z-up, front = −Y), centimetres, 2 decimals. */
export interface BlenderBoxCm {
  x: [min: number, max: number];
  y: [min: number, max: number];
  z: [min: number, max: number];
}

export interface KidoPartEdit {
  /** Part name (GLB top-level node name; copies are `<source>_copy<n>`). */
  name: string;
  /** Present only on duplicated parts: the original part's name. */
  copyOf?: string;
  /** True if anything differs from the loaded GLB (name, deleted, colour, transform; added: mesh). */
  changed: boolean;
  deleted: boolean;
  hidden: boolean;
  /** Position change vs. the loaded part, cm, glTF / three.js axes (x right, y up, z front). 2 decimals. */
  positionDeltaCm: Vec3;
  /** Absolute rotation, Euler XYZ (three.js default order), degrees, 3 decimals. Not a delta. */
  rotationDeg: Vec3;
  /** Absolute scale (not a delta), 5 decimals. */
  scale: Vec3;
  /** Size W×H×D (three.js X, Y, Z) of the part at load (scale 1) and after edits, cm. */
  sizeCm: { before: Vec3; after: Vec3 };
  /** Flat colour override `#rrggbb`, or null. */
  color: string | null;
  /** World box in Blender cm. `before` = as loaded (copies: their source), `after` = null when deleted. */
  blenderBoxCm: { before: BlenderBoxCm | null; after: BlenderBoxCm | null };

  /**
   * Added: true for an object that did not exist in the GLB and is not a copy (e.g. a new
   * primitive). Then `positionDeltaCm` is measured from the origin, `sizeCm.before` is
   * `[0, 0, 0]`, `blenderBoxCm.before` is null and `mesh` is always present.
   */
  created?: boolean;
  /** Added: stable object id (EditObject.id) when known. */
  id?: string;
  /** Added: absolute rotation as quaternion [x, y, z, w], to avoid Euler ambiguity. */
  quaternion?: [number, number, number, number];
  /** Added: material id override for the whole part. */
  materialId?: string | null;
  /**
   * Added: geometry after edits, object-local metres, only when the mesh was edited
   * (vertex / edge / face mode). Absent = geometry unchanged from the GLB.
   */
  mesh?: EditMesh;
  /** Added: vertex/face counts before and after, for a quick review. */
  meshStats?: { before: { verts: number; faces: number }; after: { verts: number; faces: number } };
}

export interface KidoModelEdits {
  format: 'kido-model-edits/1';
  /** Asset slug, e.g. "player-room/nightstand". */
  asset: string | undefined;
  /** Variant id, e.g. "lowpoly" | "master". */
  variant: string | undefined;
  /** Model path relative to public/, e.g. "models/nightstand.glb". */
  model: string | undefined;
  /** ISO 8601 UTC. */
  savedAt: string;
  /** Human-readable unit notes (copied verbatim by the exporter). */
  units: { positionDeltaCm: string; blenderBoxCm: string; [k: string]: string };
  summary: {
    deleted: string[];
    /** Names of copies (parts with copyOf). Added: also brand-new objects. */
    added: string[];
    /** Changed, not deleted, not a copy. */
    changed: string[];
  };
  parts: KidoPartEdit[];
}
