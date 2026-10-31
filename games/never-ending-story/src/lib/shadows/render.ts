import type { ShadowPlan } from './types.ts';

/**
 * Rasterise one shadow into a scene-sized alpha mask (0..255 per pixel).
 * `alpha` is the caster's colour layer already placed at its (moved) position on a scene-sized canvas.
 */
export function rasteriseShadow(plan: ShadowPlan, alpha: CanvasImageSource, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = `blur(${plan.blurPx.toFixed(1)}px)`;
  ctx.globalAlpha = plan.opacity;
  if (plan.kind === 'ellipse') {
    const { cx, cy, rx, ry } = plan.ellipse;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.setTransform(...plan.matrix);
    ctx.drawImage(alpha, 0, 0);
  }
  const data = ctx.getImageData(0, 0, width, height).data;
  const mask = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 3; i < mask.length; i++, p += 4) mask[i] = data[p];
  return mask;
}

/** Multiply a shadow mask into an RGB float buffer: out *= 1 - a + a * tint. */
export function multiplyShadow(out: Float32Array, mask: Uint8ClampedArray, tint: [number, number, number]): void {
  const tr = tint[0] / 255;
  const tg = tint[1] / 255;
  const tb = tint[2] / 255;
  for (let i = 0, o = 0; i < mask.length; i++, o += 3) {
    const a = mask[i] / 255;
    if (a === 0) continue;
    out[o] *= 1 - a + a * tr;
    out[o + 1] *= 1 - a + a * tg;
    out[o + 2] *= 1 - a + a * tb;
  }
}

/** Restrict a shadow mask to receiver pixels: mask *= receiver / 255. */
export function maskByReceivers(mask: Uint8ClampedArray, receiver: Uint8ClampedArray): void {
  for (let i = 0; i < mask.length; i++) if (mask[i]) mask[i] = (mask[i] * receiver[i]) / 255;
}
