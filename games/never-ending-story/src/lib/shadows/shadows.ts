import type { Affine, SceneLight, ShadowCaster, ShadowPlan } from './types.ts';

export * from './types.ts';

const DEG = Math.PI / 180;
/** Floor foreshortening for this camera: floor depth looks about a third as long as width. */
const FLOOR_SQUASH = 0.35;

export const DEFAULT_LIGHT: SceneLight = { shadowAngleDeg: 300, elevationDeg: 40, softness: 0.5, intensity: 0.7, color: '#3a2a35' };

/** Unit vector (image space) along which shadows fall, and the shadow length per pixel of height. */
export function shadowDirection(light: SceneLight): { dx: number; dy: number; length: number } {
  const elevation = Math.min(85, Math.max(5, light.elevationDeg));
  return {
    dx: Math.cos(light.shadowAngleDeg * DEG),
    dy: Math.sin(light.shadowAngleDeg * DEG),
    length: Math.min(3, 1 / Math.tan(elevation * DEG)),
  };
}

/** Light vector for normal-map shading (+Y up, toward the light, normalised). */
export function lightVector(light: SceneLight): [number, number, number] {
  const { dx, dy } = shadowDirection(light);
  const z = Math.tan(Math.min(85, Math.max(5, light.elevationDeg)) * DEG);
  const x = -dx;
  const y = dy;
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

/**
 * Plan how one caster's shadow is drawn. `moveX/moveY` is how far the caster
 * was moved from its layout position, so the shadow follows it.
 */
export function planShadows(caster: ShadowCaster, light: SceneLight, moveX = 0, moveY = 0): ShadowPlan[] {
  const plans: ShadowPlan[] = [];
  const main = planShadow(caster, light, moveX, moveY);
  if (main) plans.push(main);
  const contact = caster.shadow.contact ?? 0;
  if (contact > 0 && caster.shadow.type !== 'contact' && caster.shadow.type !== 'wall-cast') {
    const extra = planShadow({ ...caster, shadow: { ...caster.shadow, type: 'contact', opacity: contact, scale: 1 } }, light, moveX, moveY);
    if (extra) plans.push(extra);
  }
  return plans;
}

/** Plan the main shadow of one caster (see planShadows for main + contact). */
export function planShadow(caster: ShadowCaster, light: SceneLight, moveX = 0, moveY = 0): ShadowPlan | null {
  const plan = planShape(caster, light, moveX, moveY);
  if (plan && caster.shadow.receivers?.length) plan.receivers = [...caster.shadow.receivers];
  return plan;
}

function planShape(caster: ShadowCaster, light: SceneLight, moveX: number, moveY: number): ShadowPlan | null {
  const cfg = caster.shadow;
  if (cfg.type === 'none') return null;
  const { dx, dy, length } = shadowDirection(light);
  const scale = cfg.scale ?? 1;
  const [ox, oy] = cfg.offset ?? [0, 0];
  const blurPx = (2 + light.softness * 18) * (cfg.blur ?? 1);
  const opacity = Math.min(1, Math.max(0, light.intensity * (cfg.opacity ?? 1)));
  const floorY = (cfg.floorY ?? caster.y + caster.h) + moveY;
  const none = { cx: 0, cy: 0, rx: 0, ry: 0 };
  // Silhouette plans map the caster alpha as already drawn at its moved position, so only the offset is added.
  const translate = (m: Affine): Affine => [m[0], m[1], m[2], m[3], m[4] + ox, m[5] + oy];

  if (cfg.type === 'wall-cast') {
    const d = (cfg.distance ?? 6) * scale;
    return { kind: 'silhouette', matrix: translate([1, 0, 0, 1, dx * d, Math.abs(dy) * d]), ellipse: none, blurPx: blurPx * 0.5, opacity };
  }
  if (cfg.type === 'surface-drop') {
    // Shadow on a surface just behind/under the caster (e.g. grandma on the sofa): the silhouette slides along the light.
    const d = (cfg.distance ?? 14) * scale * length;
    return { kind: 'silhouette', matrix: translate([1, 0, 0, 1, dx * d, dy * d * 0.6]), ellipse: none, blurPx: blurPx * 0.7, opacity };
  }
  if (cfg.type === 'contact') {
    const cx = caster.x + caster.w / 2 + moveX + ox + dx * 4;
    const rx = (caster.w / 2) * scale * 1.05;
    return {
      kind: 'ellipse',
      matrix: [1, 0, 0, 1, 0, 0],
      ellipse: { cx, cy: floorY + oy - 2, rx, ry: Math.max(4, rx * 0.16) },
      blurPx: blurPx * 0.6,
      opacity,
    };
  }
  // ground-drop: a point h pixels above the floor line lands h*length along the light, squashed onto the floor.
  const kx = dx * length * scale;
  const ky = dy * length * scale * FLOOR_SQUASH;
  // (x, y) in layout coordinates; the caster's alpha is drawn already moved, so floor uses the moved line.
  const m: Affine = [1, 0, -kx, -ky, kx * floorY, floorY * (1 + ky)];
  return { kind: 'silhouette', matrix: [m[0], m[1], m[2], m[3], m[4] + ox, m[5] + oy], ellipse: none, blurPx, opacity };
}

/** Parse `#/layers?off=a,b&move=box:-300:0&shadows=0&angle=300` for deep links and tests. */
export function parseLayersQuery(hash: string): { off: string[]; move: Record<string, [number, number]>; shadows: boolean; angle?: number } {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const off = (params.get('off') ?? '').split(',').filter(Boolean);
  const move: Record<string, [number, number]> = {};
  for (const item of (params.get('move') ?? '').split(',').filter(Boolean)) {
    const [name, x, y] = item.split(':');
    if (name) move[name] = [Number(x) || 0, Number(y) || 0];
  }
  const angle = params.has('angle') ? Number(params.get('angle')) : undefined;
  return { off, move, shadows: params.get('shadows') !== '0', angle };
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
