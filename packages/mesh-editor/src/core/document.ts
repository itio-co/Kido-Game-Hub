import type { CameraMatch } from '../camera-match/index.js';
import type { Transform } from './math.js';
import type { EditMesh } from './mesh.js';

/** One editable object. `transform` is relative to the document root (object space → scene). */
export interface EditObject {
  /** Stable id. UUID v4 for authored Kido entities; otherwise any unique string. */
  id: string;
  /** Display / export name. Matches the GLB node name and `parts[].name` in edits.json. */
  name: string;
  transform: Transform;
  /** Geometry in object-local metres. */
  mesh: EditMesh;
  /** Default material for faces whose `fm` entry is null / missing. */
  materialId?: string;
  /** Hidden in the viewport (still exported). */
  hidden?: boolean;
}

/** A complete editor document. Plain JSON, safe to `JSON.stringify`. */
export interface EditDocument {
  version: 1;
  /** Order is draw / list order. Ids are unique. */
  objects: EditObject[];
  /** Optional matched camera for the reference image. */
  camera?: CameraMatch;
  /** Free-form metadata (asset slug, source GLB url, author, …). Not interpreted by the core. */
  meta?: Record<string, unknown>;
}
