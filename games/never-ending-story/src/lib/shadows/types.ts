/** Scene-level light. Angles are in image space: 0 = right, 90 = down. */
export interface SceneLight {
  /** Direction in which shadows fall, in degrees. */
  shadowAngleDeg: number;
  /** Light elevation above the floor in degrees; lower = longer shadows. */
  elevationDeg: number;
  /** 0 = hard edge, 1 = very soft. */
  softness: number;
  /** 0..1 global shadow strength. */
  intensity: number;
  /** Shadow tint as #rrggbb, applied with multiply. */
  color: string;
}

export type ShadowType = 'none' | 'contact' | 'ground-drop' | 'wall-cast' | 'surface-drop';

/** Per-object shadow settings. */
export interface ShadowConfig {
  type: ShadowType;
  /** Image-space y of the surface the object stands on (defaults to the bbox bottom). */
  floorY?: number;
  /** Extra offset in pixels added after projection. */
  offset?: [number, number];
  /** Size multiplier (contact width, ground-drop length). */
  scale?: number;
  /** Blur multiplier on top of the light softness. */
  blur?: number;
  /** Opacity multiplier on top of the light intensity. */
  opacity?: number;
  /** Extra soft contact darkening (0..1) under the base, added to any type except wall-cast. */
  contact?: number;
  /**
   * Layers this shadow may darken. Omit to darken everything drawn below the caster.
   * Use 'shell' for the bare room (floor, walls); other entries are object layer names,
   * e.g. grandma -> ['sofa', 'sofa_back_cushion_R'], coffee_table -> ['shell', 'rug'].
   */
  receivers?: string[];
  /** wall-cast / surface-drop: distance from the receiving surface in pixels. */
  distance?: number;
}

export interface ShadowCaster {
  x: number;
  y: number;
  w: number;
  h: number;
  shadow: ShadowConfig;
}

/** 2D affine matrix in canvas setTransform order (a, b, c, d, e, f). */
export type Affine = [number, number, number, number, number, number];

export interface ShadowPlan {
  kind: 'silhouette' | 'ellipse';
  /** silhouette: maps scene coordinates of the caster's alpha to shadow coordinates. */
  matrix: Affine;
  /** ellipse: centre and radii in scene coordinates. */
  ellipse: { cx: number; cy: number; rx: number; ry: number };
  blurPx: number;
  opacity: number;
  /** Copied from the config; undefined = no receiver mask. */
  receivers?: string[];
}
