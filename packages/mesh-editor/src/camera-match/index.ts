/**
 * @itio/mesh-editor/camera-match: match a three.js / Blender camera to a reference image.
 * Types only in v0.0.1; see API.md §10.
 */
import type * as THREE from 'three';
import type { Quat, Vec2, Vec3 } from '../core/math.js';

/** three.js world axes: x right, y up, z towards the viewer. Blender: (x, y, z)_b = (x, −z, y)_three. */
export type Axis = 'x' | 'y' | 'z';

/** A line drawn on the image along one world axis. Image px, origin top-left, +y down. */
export interface GuideLine {
  a: Vec2;
  b: Vec2;
}

/** Known 3D point ↔ image point, used by PnP-style solves (e.g. solve_cam.py). */
export interface PointMatch {
  label?: string;
  /** Metres, three.js world axes. */
  world: Vec3;
  /** Image px. */
  image: Vec2;
}

export interface CameraMatch {
  version: 1;
  /** The reference image the camera is matched to (the crop, if cropped). */
  image: {
    src?: string;
    width: number;
    height: number;
    /**
     * Where this image sits inside the original (uncropped) picture, px. Informational unless
     * `principalPoint` is omitted and the solve was done on the original picture.
     */
    crop?: { x: number; y: number; sourceWidth: number; sourceHeight: number };
  };
  /** Guide lines per world axis (2+ per axis gives a vanishing point). */
  guides: Partial<Record<Axis, GuideLine[]>>;
  /** Vanishing point per axis in image px; `null` = lines parallel in the image (point at infinity). */
  vanishingPoints: Partial<Record<Axis, Vec2 | null>>;
  points?: PointMatch[];
  /** Always 36 with horizontal sensor fit (Blender default, matches cam.json / add_cam.py). */
  sensorWidthMm: 36;
  sensorFit: 'horizontal';
  /** Focal length on the 36 mm sensor. `lensMm = fPx / image.width * 36`. */
  lensMm: number;
  /** Horizontal FOV, degrees. `hfov = 2·atan(18 / lensMm)`. */
  hfovDeg: number;
  /** Vertical FOV for this image's aspect, degrees (derived; a viewport recomputes for its own aspect). */
  vfovDeg: number;
  /** Image px; default = image centre. */
  principalPoint?: Vec2;
  /** Camera position, metres, three.js world axes. */
  position: Vec3;
  /** three.js camera orientation (camera looks down its local −Z, +Y up). */
  quaternion: Quat;
  /** RMS reprojection error of guides / points, px. */
  residualPx: number;
}

/**
 * Exact shape of game/assets-src/<slug>/blender/cam.json as written by solve_cam.py and read by
 * add_cam.py. Units: centimetres, Blender world (Z-up, front = −Y). Camera model: OpenCV
 * (x right, y down, z forward), principal point at the image centre.
 */
export interface BlenderCamJson {
  /**
   * Solver parameters. Index 5 = focal length in px (`fPx`), 6–8 = Rodrigues rotation vector of
   * `R`, 9–11 = translation `t = −R·C` (cm). Indices 0–4 are asset-specific model parameters
   * (nightstand: W, D, t, o, L in cm); a generic exporter writes 0 there.
   */
  p: number[];
  /** Rotation world (Blender) → camera (OpenCV), row-major 3×3. */
  R: [Vec3, Vec3, Vec3];
  /** Camera centre, Blender world, cm. */
  C: Vec3;
  /** Image width / height, px. */
  IW: number;
  IH: number;
  /** Asset-specific (nightstand: top height in cm). Generic exporter writes 0. */
  H: number;
  // Added, optional, ignored by add_cam.py:
  lensMm?: number;
  sensorWidthMm?: 36;
  residualPx?: number;
  crop?: { x: number; y: number; sourceWidth: number; sourceHeight: number };
}

/**
 * Shape used by the game for a matched camera (ShowcaseAsset.ref.camera / nightstandStage MATCH),
 * as plain JSON. Runtime: `new THREE.Vector3(...position)`, `new THREE.Quaternion(...quaternion)`,
 * `camera.fov = vfovFromHfov(hfovDeg, aspect)`.
 */
export interface ThreeCameraExport {
  hfovDeg: number;
  /** Metres, three.js world axes. */
  position: Vec3;
  quaternion: Quat;
  image: { width: number; height: number };
}

/** Planned functions of this subpath (signatures only). */
export interface CameraMatchApi {
  /** Solve from guides (≥2 vanishing points) and/or point matches. */
  solve(input: Pick<CameraMatch, 'image' | 'guides' | 'points'> & { lensMm?: number }): CameraMatch;
  /** Vanishing point of ≥2 guide lines (least squares), or null if parallel. */
  vanishingPoint(lines: readonly GuideLine[]): Vec2 | null;
  toBlenderCamJson(match: CameraMatch, extra?: { p0to4?: number[]; H?: number }): BlenderCamJson;
  fromBlenderCamJson(json: BlenderCamJson, src?: string): CameraMatch;
  toThreeCamera(match: CameraMatch): ThreeCameraExport;
  /** Set fov / position / quaternion (and view offset for a principal point) on a camera for a canvas aspect. */
  applyToCamera(match: CameraMatch | ThreeCameraExport, camera: THREE.PerspectiveCamera, aspect: number): void;
  vfovFromHfov(hfovDeg: number, aspect: number): number;
}
