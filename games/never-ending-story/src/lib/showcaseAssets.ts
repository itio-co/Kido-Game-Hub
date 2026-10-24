import * as THREE from 'three';
import { t, type MessageKey } from './i18n/core.ts';

/**
 * Models shown in the showcase (#/showcase) and, unless `editable` is false, in the model editor (#/editor).
 * Add an entry here when a new asset from games/never-ending-story/assets-src/<slug>/ is exported to public/models/;
 * both pages pick it up automatically.
 */
export type ShowcaseVariant = {
  id: string;
  label: string;
  url: string;
  /** Low-poly look: flat shading on load. */
  flat?: boolean;
  /** Triangle count and file size, shown when comparing mesh variants (LODs). */
  tris?: number;
  bytes?: number;
};

export type MatchedCamera = {
  /** Horizontal field of view (deg). Vertical FOV is derived from the canvas aspect. */
  hfovDeg: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

/** One animation clip of a rigged character, by its name in the GLB. */
export type CharacterClip = {
  id: string;
  /** Animation name in the GLB. */
  clip: string;
  label: string;
  /** Sitting clips need the seat; picking one turns the seat on. */
  seated: boolean;
  /** One-shot transition: plays once, then cross-fades into `next`. */
  next?: string;
};

/**
 * Rigged character data (model space, metres, +Y up). The seat numbers come from the pelvis offset measured in
 * assets-src/<slug>/asset.json (`exports.seat`).
 */
export type CharacterInfo = {
  clips: CharacterClip[];
  /** Default variant id selected in the Showcase and game (defaults to the first variant). */
  defaultVariant?: string;
  /** Clip played on load and when leaving the seat. */
  idle: string;
  /** Transition played when the seat is turned on. */
  sitDown: string;
  seat: {
    /** Direction the seated character faces (unit vector in the XZ plane). */
    facing: [number, number];
    /** Hips position at the end of the sit-down clip. */
    hips: [number, number, number];
    /** Height of the seat surface. */
    top: number;
    /** Seat front edge, measured from the hips along `facing` (m). */
    front: number;
    depth: number;
    width: number;
  };
};

export type ShowcaseAsset = {
  /** Entity id from the room data / asset.json. */
  id: string;
  /** `prop` (default) or a rigged `character`. */
  kind?: 'prop' | 'character';
  slug: string;
  title: string;
  /** false = not listed in #/editor (skinned characters cannot be edited there). Default true. */
  editable?: boolean;
  variants: ShowcaseVariant[];
  /** Short known-issues note shown under the viewer. */
  notes?: string;
  /** Present for rigged characters. */
  character?: CharacterInfo;
  /** Profile picture (2-inch 1:1), full-body T-pose mockup (3:4), and original scene concept for character showcase. */
  characterRefs?: {
    profilePhoto: string;
    tposeMockup: string;
    sceneMockup: string;
  };
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
      {
        id: 'meshy1k5',
        get label() {
          return t('asset.nightstand.variant.meshy1k5');
        },
        url: `${BASE}models/nightstand-meshy-1k5.glb`,
        tris: 961,
        bytes: 356648,
      },
      {
        id: 'meshy-measured',
        get label() {
          return t('asset.nightstand.variant.meshyMeasured');
        },
        url: `${BASE}models/nightstand-meshy-measured.glb`,
        flat: true,
        tris: 212,
        bytes: 27468,
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
  {
    // Meshy image-to-3D + rig + animations; see assets-src/grandma/README.md.
    id: '7b6006ee-456a-45c5-9012-f35d26fd71a8',
    kind: 'character',
    slug: 'characters/grandma',
    get title() {
      return t('asset.grandma.title');
    },
    editable: false,
    get notes() {
      return t('asset.grandma.knownIssues');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/grandma-mali-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/grandma-mali-tpose.jpg`,
      sceneMockup: `${BASE}img/living-grandma.jpg`,
    },
    variants: [
      // Original 19.4k cutout head (living-grandma.jpg, enable_pbr: false) transplanted onto the 6k T-pose body.
      {
        id: 'head19k',
        get label() {
          return t('asset.grandma.variant.head19k');
        },
        url: `${BASE}models/grandma-mali-head19k-tpose.glb`,
        tris: 10865,
        bytes: 3143288,
      },
      // Highest-detail Ultra model generated with enable_pbr: false and image_enhancement: false (pure diffuse).
      {
        id: 'ultraNoPbr',
        get label() {
          return t('asset.grandma.variant.ultraNoPbr');
        },
        url: `${BASE}models/grandma-mali-ultra-nopbr.glb`,
        tris: 235018,
        bytes: 8031204,
      },
      // Smooth big-face T-pose Ultra (Meshy 7.1 4K geometry + refined face).
      {
        id: 'ultra',
        get label() {
          return t('asset.grandma.variant.ultra');
        },
        url: `${BASE}models/grandma-mali-ultra.glb`,
        tris: 233332,
        bytes: 8206988,
      },
      // Parametric standard human base body + modular clothing + high-detail focused head.
      {
        id: 'parametric',
        get label() {
          return t('asset.grandma.variant.parametric');
        },
        url: `${BASE}models/grandma-mali-parametric.glb`,
        tris: 21360,
        bytes: 1328712,
      },
      // Primary runtime model: Smooth big-face T-pose 6k Meshy Remesh + PBR maps + 24-bone skin weights.
      {
        id: 'remesh6k',
        get label() {
          return t('asset.grandma.variant.remesh6k');
        },
        url: `${BASE}models/grandma-mali-remesh-6k.glb`,
        tris: 6251,
        bytes: 2263588,
      },
      {
        id: 'remesh1k5',
        get label() {
          return t('asset.grandma.variant.remesh1k5');
        },
        url: `${BASE}models/grandma-mali-remesh-1k5.glb`,
        tris: 1556,
        bytes: 953848,
      },
      // Earlier comparison variants (cutout-based 19.4k + meshoptimizer QEM LODs); see assets-src/grandma/build/build.mjs.
      {
        id: 'rigged',
        get label() {
          return t('asset.grandma.variant.rigged');
        },
        url: `${BASE}models/grandma-mali-cutout-19k.glb`,
        tris: 19416,
        bytes: 1250112,
      },
      {
        id: 'lod6k',
        get label() {
          return t('asset.grandma.variant.lod6k');
        },
        url: `${BASE}models/grandma-mali-6k.glb`,
        tris: 5999,
        bytes: 733344,
      },
      {
        id: 'lod3k',
        get label() {
          return t('asset.grandma.variant.lod3k');
        },
        url: `${BASE}models/grandma-mali-3k.glb`,
        tris: 3000,
        bytes: 635424,
      },
      {
        id: 'lod1k5',
        get label() {
          return t('asset.grandma.variant.lod1k5');
        },
        url: `${BASE}models/grandma-mali-1k5.glb`,
        tris: 1500,
        bytes: 593032,
      },
    ],
    character: {
      clips: [
        {
          id: 'idle',
          clip: 'Idle',
          seated: false,
          get label() {
            return t('asset.grandma.clip.idle');
          },
        },
        {
          id: 'wave',
          clip: 'Wave',
          seated: false,
          get label() {
            return t('asset.grandma.clip.wave');
          },
        },
        {
          id: 'sitDown',
          clip: 'SitDown',
          seated: true,
          next: 'SitIdle',
          get label() {
            return t('asset.grandma.clip.sitDown');
          },
        },
        {
          id: 'sitIdle',
          clip: 'SitIdle',
          seated: true,
          get label() {
            return t('asset.grandma.clip.sitIdle');
          },
        },
        {
          id: 'sitTalk',
          clip: 'SitTalk',
          seated: true,
          get label() {
            return t('asset.grandma.clip.sitTalk');
          },
        },
        {
          id: 'walk',
          clip: 'Walk',
          seated: false,
          get label() {
            return t('asset.grandma.clip.walk');
          },
        },
      ],
      defaultVariant: 'head19k',
      idle: 'Idle',
      sitDown: 'SitDown',
      // SitDown turns 90 degrees, so she sits facing +X with the hips at (-0.35, 0.48, 0.903).
      // Seat top = hips - ~0.05 m (pelvis offset); front edge 0.2 m in front of the hips.
      seat: { facing: [1, 0], hips: [-0.35, 0.481, 0.903], top: 0.44, front: 0.2, depth: 0.55, width: 1.0 },
    },
    orbit: { target: 0.85, distance: 3.1, height: 1.35 },
  },
  {
    id: 'char-child-player',
    kind: 'character',
    slug: 'characters/child',
    get title() {
      return t('asset.child.title');
    },
    editable: false,
    get notes() {
      return t('asset.child.notes');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/child-player-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/child-player-tpose.jpg`,
      sceneMockup: `${BASE}img/cutscene-01-p1.jpg`,
    },
    variants: [],
    orbit: { target: 0.7, distance: 2.8, height: 1.15 },
  },
  {
    id: 'char-mom',
    kind: 'character',
    slug: 'characters/mom',
    get title() {
      return t('asset.mom.title');
    },
    editable: false,
    get notes() {
      return t('asset.mom.notes');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/mom-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/mom-tpose.jpg`,
      sceneMockup: `${BASE}img/album-found.jpg`,
    },
    variants: [],
    orbit: { target: 0.85, distance: 3.1, height: 1.35 },
  },
  {
    id: 'char-dad',
    kind: 'character',
    slug: 'characters/dad',
    get title() {
      return t('asset.dad.title');
    },
    editable: false,
    get notes() {
      return t('asset.dad.notes');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/dad-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/dad-tpose.jpg`,
      sceneMockup: `${BASE}img/album-found.jpg`,
    },
    variants: [],
    orbit: { target: 0.9, distance: 3.2, height: 1.4 },
  },
  {
    id: 'char-uncle-mek',
    kind: 'character',
    slug: 'characters/uncle-mek',
    get title() {
      return t('asset.uncleMek.title');
    },
    editable: false,
    get notes() {
      return t('asset.uncleMek.notes');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/uncle-mek-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/uncle-mek-tpose.jpg`,
      sceneMockup: `${BASE}img/uncle-mek.jpg`,
    },
    variants: [],
    orbit: { target: 0.9, distance: 3.2, height: 1.4 },
  },
  {
    id: 'char-aunt-rin',
    kind: 'character',
    slug: 'characters/aunt-rin',
    get title() {
      return t('asset.auntRin.title');
    },
    editable: false,
    get notes() {
      return t('asset.auntRin.notes');
    },
    characterRefs: {
      profilePhoto: `${BASE}showcase/characters/aunt-rin-2inch-photo.jpg`,
      tposeMockup: `${BASE}showcase/characters/aunt-rin-tpose.jpg`,
      sceneMockup: `${BASE}img/rin.jpg`,
    },
    variants: [],
    orbit: { target: 0.85, distance: 3.1, height: 1.35 },
  },
];

/** Assets listed in the model editor (#/editor). */
export const EDITABLE_ASSETS: ShowcaseAsset[] = SHOWCASE_ASSETS.filter((asset) => asset.editable !== false);

export function findAsset(slug: string): ShowcaseAsset | undefined {
  return SHOWCASE_ASSETS.find((asset) => asset.slug === slug);
}

export function vfovFromHfov(hfovDeg: number, aspect: number): number {
  const h = THREE.MathUtils.degToRad(hfovDeg);
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
}
