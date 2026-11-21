/** Horizontal swipe on a comic page: finger right→left = next page, left→right = previous. */
export const SWIPE_MIN_PX = 48;

export function swipeDirection(dx: number, dy: number, min = SWIPE_MIN_PX): 'next' | 'prev' | null {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? 'next' : 'prev';
}
