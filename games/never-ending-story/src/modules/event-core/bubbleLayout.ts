/** Place a speech bubble so it stays inside the art inset and misses face/head masks. */

export type Rect = { x: number; y: number; w: number; h: number };

/** Face/head mask in percent of the source comic art (hair included). Do not use `id` — catalog validation treats it as an entity UUID. */
export type FaceMask = { name: string; x: number; y: number; w: number; h: number };

export const MASK_GAP = 4;

export function rectsOverlap(a: Rect, b: Rect, slop = 0.5): boolean {
  return a.x < b.x + b.w - slop && b.x < a.x + a.w - slop && a.y < b.y + b.h - slop && b.y < a.y + a.h - slop;
}

export function artPctToPx(mask: FaceMask, artW: number, artH: number): Rect {
  return { x: artW * mask.x / 100, y: artH * mask.y / 100, w: artW * mask.w / 100, h: artH * mask.h / 100 };
}

export function clampToBounds(box: Rect, bounds: Rect): Rect {
  const w = Math.min(box.w, bounds.w);
  const h = Math.min(box.h, bounds.h);
  return {
    x: Math.min(Math.max(box.x, bounds.x), bounds.x + bounds.w - w),
    y: Math.min(Math.max(box.y, bounds.y), bounds.y + bounds.h - h),
    w,
    h,
  };
}

function hitsAny(box: Rect, masks: Rect[]): boolean {
  return masks.some((mask) => rectsOverlap(box, mask));
}

function distance2(a: Rect, b: Rect): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Preferred `box` is the authored bubble, already measured at the current viewport.
 * Authored x/y/w are a starting point, not a guarantee. Tries shift, then shrink+reflow,
 * then a coarse grid, and always stays inside `bounds`.
 */
export function placeBubble(opts: {
  box: Rect;
  bounds: Rect;
  masks: Rect[];
  minW: number;
  gap?: number;
  heightAtWidth?: (width: number) => number;
}): Rect {
  const gap = opts.gap ?? MASK_GAP;
  const { bounds, masks } = opts;
  const preferred = opts.box;
  const minW = Math.min(Math.max(8, opts.minW), bounds.w);

  const tryBox = (box: Rect): Rect | null => {
    const clamped = clampToBounds(box, bounds);
    return hitsAny(clamped, masks) ? null : clamped;
  };

  const heightFor = (width: number): number => {
    if (Math.abs(width - preferred.w) < 0.5) return preferred.h;
    return opts.heightAtWidth?.(width) ?? preferred.h;
  };

  const widths: number[] = [];
  for (const ratio of [1, 0.88, 0.76, 0.64]) {
    const width = Math.max(minW, preferred.w * ratio);
    if (!widths.some((item) => Math.abs(item - width) < 0.5)) widths.push(width);
  }
  if (!widths.some((item) => Math.abs(item - minW) < 0.5)) widths.push(minW);

  const pick = (candidates: Rect[]): Rect | null => {
    const fitted = candidates.map(tryBox).filter((item): item is Rect => !!item);
    if (!fitted.length) return null;
    fitted.sort((a, b) => distance2(a, preferred) - distance2(b, preferred));
    return fitted[0];
  };

  for (const w of widths) {
    const h = heightFor(w);
    const base = { x: preferred.x, y: preferred.y, w, h };
    const candidates: Rect[] = [base];
    for (const mask of masks) {
      candidates.push(
        { x: mask.x - gap - w, y: base.y, w, h },
        { x: mask.x + mask.w + gap, y: base.y, w, h },
        { x: base.x, y: mask.y - gap - h, w, h },
        { x: base.x, y: mask.y + mask.h + gap, w, h },
      );
    }
    const found = pick(candidates);
    if (found) return found;
  }

  const stepX = Math.max(8, bounds.w / 8);
  const stepY = Math.max(8, bounds.h / 12);
  for (const w of widths) {
    const h = heightFor(w);
    const grid: Rect[] = [];
    for (let y = bounds.y; y + h <= bounds.y + bounds.h + 0.5; y += stepY) {
      for (let x = bounds.x; x + w <= bounds.x + bounds.w + 0.5; x += stepX) {
        grid.push({ x, y, w, h });
      }
    }
    const found = pick(grid);
    if (found) return found;
  }

  return clampToBounds(preferred, bounds);
}
