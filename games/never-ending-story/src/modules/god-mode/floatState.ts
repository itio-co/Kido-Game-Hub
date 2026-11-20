/** Local GOD-float preference. The admin session cookie is separate and is never stored here. */

export type FloatPrefs = { on: boolean; x: number; y: number };

export const GOD_FLOAT_KEY = 'nesg.god.float.v1';

const MIN = 0.04;
const MAX = 0.92;

/** A shorter pointer travel stays a tap, so the menu still opens. */
export const FLOAT_TAP_SLOP_PX = 6;

export function defaultFloatPrefs(): FloatPrefs {
  return { on: false, x: 0.78, y: 0.62 };
}

function axis(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(MAX, Math.max(MIN, value));
}

export function parseFloatPrefs(raw: string | null): FloatPrefs {
  const base = defaultFloatPrefs();
  if (!raw) return base;
  try {
    const data = JSON.parse(raw) as { on?: unknown; x?: unknown; y?: unknown };
    return { on: data.on === true, x: axis(data.x, base.x), y: axis(data.y, base.y) };
  } catch {
    return base;
  }
}

export function loadFloatPrefs(read: (key: string) => string | null): FloatPrefs {
  return parseFloatPrefs(read(GOD_FLOAT_KEY));
}

export function saveFloatPrefs(write: (key: string, value: string) => void, prefs: FloatPrefs): void {
  const next = { on: prefs.on === true, x: axis(prefs.x, defaultFloatPrefs().x), y: axis(prefs.y, defaultFloatPrefs().y) };
  write(GOD_FLOAT_KEY, JSON.stringify(next));
}

/** Settings shows the GOD control only while this device has a God admin session. */
export function godButtonVisible(hasSession: boolean): boolean {
  return hasSession === true;
}

/** The pet bubble is on only when the session is valid and the player turned it on. */
export function godFloatVisible(hasSession: boolean, on: boolean): boolean {
  return hasSession === true && on === true;
}

/** True once the pointer has left the tap slop. */
export function floatDragged(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > FLOAT_TAP_SLOP_PX;
}

/**
 * Next bubble anchor after a pointer move.
 *
 * `origin` and the result are fractions of the positioning parent (the phone).
 * The bubble's `left` and `top` are percentages of that parent, and a
 * `translate(-50%, -50%)` keeps the grabbed point on the bubble.
 * `deltaPx` is pointer travel in viewport pixels from the grab.
 * `stage` is that parent's visual box from `getBoundingClientRect`.
 * The bubble itself is `position: absolute`, so it is the button's
 * `offsetParent`; dividing by the bubble box moves it at phoneSize/bubbleSize.
 * A CSS scale makes `offsetWidth` differ from the visual box; only the visual
 * box keeps the grab point under the pointer.
 */
export function nextFloatPosition(
  origin: { x: number; y: number },
  deltaPx: { x: number; y: number },
  stage: { width: number; height: number },
): { x: number; y: number } {
  const width = stage.width > 0 ? stage.width : 0;
  const height = stage.height > 0 ? stage.height : 0;
  return {
    x: axis(width > 0 ? origin.x + deltaPx.x / width : origin.x, origin.x),
    y: axis(height > 0 ? origin.y + deltaPx.y / height : origin.y, origin.y),
  };
}

/** Admin page for this deployment. `/never` and `/dev/never` both stay on their own base. */
export function godAdminUrl(origin: string, base: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return new URL('god', `${origin}${root}`).href;
}
