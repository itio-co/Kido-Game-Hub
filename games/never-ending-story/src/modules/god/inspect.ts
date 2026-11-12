/**
 * Pretty data behind the current page. Token-like fields are replaced before display or copy.
 * The God password and the player bearer token are never accepted as inputs.
 */

const SECRET_KEY = /token|password|secret|authorization|cookie|credential/i;
const JWT = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : redact(child);
    }
    return out;
  }
  if (typeof value === 'string' && (JWT.test(value) || /^Bearer\s+\S+/i.test(value))) return '[redacted]';
  return value;
}

export type InspectPage = {
  page: { screen: string; title: string; route: string };
  room: unknown;
  scene: unknown;
  hotspots: unknown;
  event: Record<string, unknown>;
  save: unknown;
  versions: Record<string, unknown>;
};

/** Stable key order so the panel and the clipboard match. */
export function inspectDocument(page: InspectPage): Record<string, unknown> {
  return redact({
    page: page.page,
    scene: page.scene,
    event: page.event,
    hotspots: page.hotspots,
    room: page.room,
    save: page.save,
    versions: page.versions,
  }) as Record<string, unknown>;
}

export function inspectText(page: InspectPage): string {
  return JSON.stringify(inspectDocument(page), null, 2);
}
