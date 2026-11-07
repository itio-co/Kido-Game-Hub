import * as THREE from 'three';
import { t, type MessageKey } from './i18n/core.ts';

/**
 * Models shown in the showcase (#/showcase) and editable in the model editor (#/editor).
 * Add an entry here when a new asset from games/never-ending-story/assets-src/<slug>/ is exported to public/models/;
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
    /**
     * Full mock-up the crop was cut from. `crop` = top-left of the crop inside it (mock-up px) and `scale` =
     * mock-up px per crop px (default 1): full = (x + scale·u, y + scale·v). The nightstand crop was verified
     * by pixel match (mean abs diff 0 at (368, 540), scale 1).
     */
    mockup?: { src: string; width: number; height: number; crop: { x: number; y: number }; scale?: number };
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
  const points: { id: string; p: [number, number, number] }[] = [
    { id: 'FLT', p: [x0, y0, H] },
    { id: 'FRT', p: [x1, y0, H] },
    { id: 'BLT', p: [x0, y1, H] },
    { id: 'BRT', p: [x1, y1, H] },
    { id: 'FLB', p: [x0, y0, H - T] },
    { id: 'FRB', p: [x1, y0, H - T] },
    { id: 'BRB', p: [x1, y1, H - T] },
    { id: 'FLlegTL', p: [x0 + O, y0 + O, H - T] },
    { id: 'FLlegTR', p: [x0 + O + L, y0 + O, H - T] },
    { id: 'FLfoot', p: [x0 + O, y0 + O, 0] },
    { id: 'FRlegTL', p: [x1 - O - L, y0 + O, H - T] },
    { id: 'FRlegTR', p: [x1 - O, y0 + O, H - T] },
    { id: 'FRfoot', p: [x1 - O, y0 + O, 0] },
    { id: 'BRfoot', p: [x1 - O, y1 - O, 0] },
    { id: 'BLfootL', p: [x0 + O, y1 - O - L, 0] },
  ];
  // Labels are getters so they follow the active locale.
  return points.map((point) => ({
    ...point,
    get label() {
      return t(`asset.nightstand.point.${point.id}` as MessageKey);
    },
  }));
}

export const SHOWCASE_ASSETS: ShowcaseAsset[] = [
  {
    id: '3a07eebc-03c1-421c-87a7-7e6d0037ceae',
    slug: 'player-room/nightstand',
    get title() {
      return t('asset.nightstand.title');
    },
    variants: [
      {
        id: 'lowpoly',
        get label() {
          return t('asset.nightstand.variant.lowpoly');
        },
        url: `${BASE}models/nightstand.glb`,
        flat: true,
      },
      {
        id: 'master',
        get label() {
          return t('asset.nightstand.variant.master');
        },
        url: `${BASE}models/nightstand-master.glb`,
      },
    ],
    ref: {
      src: `${BASE}showcase/nightstand-ref.png`,
      width: 252,
      height: 284,
      /**
       * Camera matched in Blender to showcase/nightstand-ref.png (252×284).
       * Blender: lens 162.12 mm on a 36 mm sensor (horizontal fit), location (1.5167, -3.0410, 1.3648) m,
       * rotation XYZ (73.63°, 0.54°, 26.89°). Converted Z-up → Y-up as (x, y, z) → (x, z, -y).
       * See games/never-ending-story/assets-src/nightstand/blender/cam.json and solve_cam.py.
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
