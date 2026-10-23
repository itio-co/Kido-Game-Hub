import * as THREE from 'three';

/**
 * Models shown in the showcase (#/showcase) and editable in the model editor (#/editor).
 * Add an entry here when a new asset from game/assets-src/<slug>/ is exported to public/models/;
 * both pages pick it up automatically.
 */
export type ShowcaseVariant = {
  id: string;
  label: string;
  url: string;
  /** Low-poly look: flat shading on load. */
  flat?: boolean;
};

export type MatchedCamera = {
  /** Horizontal field of view (deg). Vertical FOV is derived from the canvas aspect. */
  hfovDeg: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type ShowcaseAsset = {
  /** Entity id from the room data / asset.json. */
  id: string;
  slug: string;
  title: string;
  variants: ShowcaseVariant[];
  /** Mock-up crop and the camera matched to it (Blender cam.json converted to Y-up). */
  ref?: {
    src: string;
    width: number;
    height: number;
    camera: MatchedCamera;
    /** Full mock-up the crop was cut from; `crop` = top-left of the crop inside it (px). */
    /** First five cam.json `p` values (W, D, T, O, L) from the asset's solve_cam.py fit, echoed on export. */
    camParams?: readonly number[];
    mockup?: { src: string; width: number; height: number; crop: { x: number; y: number } };
    /** Named 3D points (Blender cm: X right, Y back, Z up) for camera-match point pairs. */
    keyPoints?: { id: string; label: string; p: [number, number, number] }[];
  };
  /** Orbit framing: look-at height and distance (m). */
  orbit: { target: number; distance: number; height: number };
};

const BASE = import.meta.env.BASE_URL;

/** Corners of the nightstand (assets-src/nightstand/blender/dims.json: W 61, D 40.5, H 55, top 6.6, legs 7.5 inset 0.9). */
function nightstandKeyPoints(): { id: string; label: string; p: [number, number, number] }[] {
  const [W, D, H, T, L, O] = [61, 40.5, 55, 6.6, 7.5, 0.9];
  const [x0, x1, y0, y1] = [-W / 2, W / 2, -D / 2, D / 2];
  return [
    { id: 'FLT', label: 'มุมบน หน้า-ซ้าย', p: [x0, y0, H] },
    { id: 'FRT', label: 'มุมบน หน้า-ขวา', p: [x1, y0, H] },
    { id: 'BLT', label: 'มุมบน หลัง-ซ้าย', p: [x0, y1, H] },
    { id: 'BRT', label: 'มุมบน หลัง-ขวา', p: [x1, y1, H] },
    { id: 'FLB', label: 'ใต้ท็อป หน้า-ซ้าย', p: [x0, y0, H - T] },
    { id: 'FRB', label: 'ใต้ท็อป หน้า-ขวา', p: [x1, y0, H - T] },
    { id: 'BRB', label: 'ใต้ท็อป หลัง-ขวา', p: [x1, y1, H - T] },
    { id: 'FLlegTL', label: 'ขาหน้าซ้าย บน-นอก', p: [x0 + O, y0 + O, H - T] },
    { id: 'FLlegTR', label: 'ขาหน้าซ้าย บน-ใน', p: [x0 + O + L, y0 + O, H - T] },
    { id: 'FLfoot', label: 'ขาหน้าซ้าย ปลายล่าง', p: [x0 + O, y0 + O, 0] },
    { id: 'FRlegTL', label: 'ขาหน้าขวา บน-ใน', p: [x1 - O - L, y0 + O, H - T] },
    { id: 'FRlegTR', label: 'ขาหน้าขวา บน-นอก', p: [x1 - O, y0 + O, H - T] },
    { id: 'FRfoot', label: 'ขาหน้าขวา ปลายล่าง', p: [x1 - O, y0 + O, 0] },
    { id: 'BRfoot', label: 'ขาหลังขวา ปลายล่าง', p: [x1 - O, y1 - O, 0] },
    { id: 'BLfootL', label: 'ขาหลังซ้าย ปลายล่าง', p: [x0 + O, y1 - O - L, 0] },
  ];
}

export const SHOWCASE_ASSETS: ShowcaseAsset[] = [
  {
    id: '3a07eebc-03c1-421c-87a7-7e6d0037ceae',
    slug: 'player-room/nightstand',
    title: 'ตู้ข้างเตียง',
    variants: [
      { id: 'lowpoly', label: 'Low-poly (เกม)', url: `${BASE}models/nightstand.glb`, flat: true },
      { id: 'master', label: 'Master', url: `${BASE}models/nightstand-master.glb` },
    ],
    ref: {
      src: `${BASE}showcase/nightstand-ref.png`,
      width: 252,
      height: 284,
      /**
       * Camera matched in Blender to showcase/nightstand-ref.png (252×284).
       * Blender: lens 162.12 mm on a 36 mm sensor (horizontal fit), location (1.5167, -3.0410, 1.3648) m,
       * rotation XYZ (73.63°, 0.54°, 26.89°). Converted Z-up → Y-up as (x, y, z) → (x, z, -y).
       * See game/assets-src/nightstand/blender/cam.json and solve_cam.py.
       */
      camera: {
        hfovDeg: 2 * THREE.MathUtils.radToDeg(Math.atan(36 / 2 / 162.1169)),
        position: new THREE.Vector3(1.51665, 1.36477, 3.04096),
        quaternion: new THREE.Quaternion(-0.139571, 0.230806, 0.028608, 0.962512),
      },
      mockup: { src: `${BASE}img/player-room-wide.jpg`, width: 720, height: 1280, crop: { x: 368, y: 540 } },
      keyPoints: nightstandKeyPoints(),
      camParams: [61.02402536913852, 40.53803905099494, 6.575529655854545, 0.8650713919262639, 7.509763478210199],
    },
    orbit: { target: 0.26, distance: 1.7, height: 0.9 },
  },
];

export function findAsset(slug: string): ShowcaseAsset | undefined {
  return SHOWCASE_ASSETS.find((asset) => asset.slug === slug);
}

export function vfovFromHfov(hfovDeg: number, aspect: number): number {
  const h = THREE.MathUtils.degToRad(hfovDeg);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}
