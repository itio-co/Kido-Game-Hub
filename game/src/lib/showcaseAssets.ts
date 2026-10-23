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
  ref?: { src: string; width: number; height: number; camera: MatchedCamera };
  /** Orbit framing: look-at height and distance (m). */
  orbit: { target: number; distance: number; height: number };
};

const BASE = import.meta.env.BASE_URL;

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
