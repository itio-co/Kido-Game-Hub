import * as THREE from 'three';
import type { MatchedCamera, ShowcaseAsset } from '../showcaseAssets';
import {
  blenderEulerDeg,
  mulMM,
  mulMV,
  rotvec,
  scale,
  transpose,
  type Cam,
  type GuideLine,
  type M3,
  type PointPair,
  type V3,
} from './camMath';

/** Blender world (Z-up, cm) → Three.js world (Y-up, m): (x, y, z) → (x, z, −y) / 100. */
const B: M3 = [
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
];
/** OpenCV camera axes ↔ Three.js camera axes (y and z flipped). */
const F: M3 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];

export const SENSOR_MM = 36;

/** Visible window of the reference image, in ref px. */
export type ViewRect = { x0: number; y0: number; w: number; h: number };

/** The asset's stored (committed) camera as a pinhole camera in ref px. */
export function camFromMatched(m: MatchedCamera, width: number, height: number): Cam {
  const f = width / 2 / Math.tan(THREE.MathUtils.degToRad(m.hfovDeg) / 2);
  const e = new THREE.Matrix4().makeRotationFromQuaternion(m.quaternion).elements;
  const M: M3 = [
    [e[0]!, e[4]!, e[8]!],
    [e[1]!, e[5]!, e[9]!],
    [e[2]!, e[6]!, e[10]!],
  ];
  // M = B Rᵀ F  →  R = F Mᵀ B
  const R = mulMM(mulMM(F, transpose(M)), B);
  const C = scale(mulMV(transpose(B), [m.position.x, m.position.y, m.position.z]), 100);
  return { f, cx: width / 2, cy: height / 2, R, C };
}

/** Three.js pose (metres, Y-up) of a pinhole camera. */
export function threePose(cam: Cam): { position: THREE.Vector3; quaternion: THREE.Quaternion; matrix: M3 } {
  const M = mulMM(mulMM(B, transpose(cam.R)), F);
  const m4 = new THREE.Matrix4().set(M[0][0], M[0][1], M[0][2], 0, M[1][0], M[1][1], M[1][2], 0, M[2][0], M[2][1], M[2][2], 0, 0, 0, 0, 1);
  const p = scale(mulMV(B, cam.C), 0.01);
  return { position: new THREE.Vector3(...p), quaternion: new THREE.Quaternion().setFromRotationMatrix(m4), matrix: M };
}

/** Put `camera` at the pose and give it an off-axis projection showing exactly `rect` of the ref image. */
export function applyToCamera(camera: THREE.PerspectiveCamera, cam: Cam, rect: ViewRect): void {
  const pose = threePose(cam);
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.updateMatrixWorld(true);
  const n = camera.near;
  const k = n / cam.f;
  camera.projectionMatrix.makePerspective(
    k * (rect.x0 - cam.cx),
    k * (rect.x0 + rect.w - cam.cx),
    k * (cam.cy - rect.y0),
    k * (cam.cy - rect.y0 - rect.h),
    n,
    camera.far,
  );
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

export const lensMm = (f: number, width: number): number => (f * SENSOR_MM) / width;
export const focalFromLens = (mm: number, width: number): number => (mm * width) / SENSOR_MM;
export const hfovDeg = (f: number, width: number): number => THREE.MathUtils.radToDeg(2 * Math.atan(width / 2 / f));

/** Blender-side camera values (what add_cam.py / render.py would create). */
export function blenderValues(cam: Cam, width: number, height: number) {
  // Blender shift is in units of the fitted sensor side (sensor_fit HORIZONTAL → image width; verified in Blender 4.5).
  const big = width;
  return {
    location_m: cam.C.map((v) => round(v / 100, 5)),
    rotation_euler_XYZ_deg: blenderEulerDeg(cam.R).map((v) => round(v, 3)),
    lens_mm: round(lensMm(cam.f, width), 3),
    sensor_width_mm: SENSOR_MM,
    sensor_fit: 'HORIZONTAL',
    shift_x: round((width / 2 - cam.cx) / big, 5),
    shift_y: round((cam.cy - height / 2) / big, 5),
    resolution: [width, height],
  };
}

const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export type MatchExtras = {
  asset: ShowcaseAsset;
  /** Model bounding box in Blender cm: [W, D, H]. */
  dims: V3;
  lines: GuideLine[];
  pairs: PointPair[];
  residual: { lines: number | null; points: number | null };
  image: string;
  /** Object ↔ room block (crop transform, yaw, agreement, grouped lines in full px). */
  room?: object;
};

/** Same layout as game/assets-src/<item>/blender/cam.json (+ cx, cy when the principal point is off-centre). */
export function camJson(cam: Cam, width: number, height: number, dims: V3, head?: readonly number[]) {
  const rv = rotvec(cam.R);
  const t = mulMV(cam.R, scale(cam.C, -1));
  return {
    // p = [W, D, T, O, L, f, rvec(3), tvec(3)] — body params from the asset's solve_cam.py fit when known,
    // otherwise W/D from the model box (T/O/L 0; the Blender scripts only read p[5..]).
    p: [...(head && head.length === 5 ? head : [dims[0], dims[1], 0, 0, 0]), cam.f, ...rv, ...t],
    R: cam.R,
    C: cam.C,
    IW: width,
    IH: height,
    H: dims[2],
    cx: cam.cx,
    cy: cam.cy,
  };
}

export function fullExport(cam: Cam, x: MatchExtras) {
  const ref = x.asset.ref!;
  const pose = threePose(cam);
  const hf = hfovDeg(cam.f, ref.width);
  const mock = ref.mockup;
  return {
    format: 'kido-camera-match/1',
    asset: x.asset.slug,
    savedAt: new Date().toISOString(),
    conventions: {
      image: `ref px = pixels of ${ref.src.replace(/^.*\/showcase\//, 'showcase/')} (${ref.width}×${ref.height}), origin top-left`,
      world: 'Blender: X right, Y back (front = −Y), Z up, cm',
      R: 'OpenCV world→camera rotation (x right, y down, z forward); x_cam = R·(X − C)',
      three: 'Three.js / glTF: Y-up metres, (x, y, z)_three = (x, z, −y)_blender / 100',
    },
    camJson: camJson(cam, ref.width, ref.height, x.dims, ref.camParams),
    blender: blenderValues(cam, ref.width, ref.height),
    three: {
      hfovDeg: round(hf, 4),
      position: pose.position.toArray().map((v) => round(v, 5)),
      quaternion: pose.quaternion.toArray().map((v) => round(v, 6)),
      principalPoint: [round(cam.cx, 3), round(cam.cy, 3)],
      snippet: `camera: { hfovDeg: ${round(hf, 4)}, position: new THREE.Vector3(${pose.position
        .toArray()
        .map((v) => round(v, 5))
        .join(', ')}), quaternion: new THREE.Quaternion(${pose.quaternion
        .toArray()
        .map((v) => round(v, 6))
        .join(', ')}) }`,
    },
    mockup: mock
      ? {
          src: mock.src.replace(/^.*\/img\//, 'img/'),
          size: [mock.width, mock.height],
          cropOffset: [mock.crop.x, mock.crop.y],
          focal_px: round(cam.f, 3),
          principalPoint: [round(cam.cx + mock.crop.x, 3), round(cam.cy + mock.crop.y, 3)],
          lens_mm: round(lensMm(cam.f, mock.width), 3),
          hfovDeg: round(hfovDeg(cam.f, mock.width), 4),
          shift_x: round((mock.width / 2 - (cam.cx + mock.crop.x)) / mock.width, 5),
          shift_y: round((cam.cy + mock.crop.y - mock.height / 2) / mock.width, 5),
        }
      : null,
    residualPx: { lines: x.residual.lines, points: x.residual.points },
    image: x.image,
    lines: x.lines,
    pairs: x.pairs,
    room: x.room ?? null,
  };
}
