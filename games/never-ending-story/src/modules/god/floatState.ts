/** Local GOD-float preference. The admin session cookie is separate and is never stored here. */

export type FloatPrefs = { on: boolean; x: number; y: number };

export const GOD_FLOAT_KEY = 'nesg.god.float.v1';

const MIN = 0.04;
const MAX = 0.92;

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

/** Admin page for this deployment. `/never` and `/dev/never` both stay on their own base. */
export function godAdminUrl(origin: string, base: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return new URL('god', `${origin}${root}`).href;
}
