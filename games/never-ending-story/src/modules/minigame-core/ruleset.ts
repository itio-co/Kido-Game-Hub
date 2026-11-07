/**
 * Gameplay ruleset pins carried on share links and used to partition leaderboards.
 * A ruleset is one or more `module@version` pins. The app version is never part of it.
 * Canonical form sorts module ids so `stirfry@1.2.0+rhythm@1.1.0` and
 * `rhythm@1.1.0+stirfry@1.2.0` are the same board.
 */

export type ModulePin = { id: string; version: string };

export type ModuleRules = {
  id: string;
  /** Versions this build can still play (keys of that module's ruleset registry). */
  versions: readonly string[];
  /** module.json version. New runs and the default board use this. */
  current: string;
  /** Version shipped in app 0.6.10. Versionless links resolve to this. */
  legacy: string;
};

export type RulesetOk = { ok: true; pins: ModulePin[]; key: string; legacy: boolean };
export type RulesetBad = { ok: false; requested: string; currentKey: string };
export type RulesetResolution = RulesetOk | RulesetBad;

const SEMVER = String.raw`(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)`;
/** One path segment: `rhythm@1.1.0+stirfry@1.2.0`. */
export const RULESET_SRC = `[a-z][a-z0-9-]*@${SEMVER}(?:\\+[a-z][a-z0-9-]*@${SEMVER})*`;
const PIN_RE = new RegExp(`^([a-z][a-z0-9-]*)@(${SEMVER})$`);

export function canonicalRuleset(pins: readonly ModulePin[]): string {
  return [...pins]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => `${p.id}@${p.version}`)
    .join('+');
}

/** Parse a ruleset segment. Order does not matter; duplicates and junk return null. */
export function parseRuleset(raw: string): ModulePin[] | null {
  if (!raw || raw.length > 240 || raw.includes(' ') || raw.includes('%')) return null;
  const pins: ModulePin[] = [];
  const seen = new Set<string>();
  for (const part of raw.split('+')) {
    const m = PIN_RE.exec(part);
    if (!m || seen.has(m[1])) return null;
    seen.add(m[1]);
    pins.push({ id: m[1], version: m[2] });
  }
  return pins.length ? pins : null;
}

export function pinVersion(pins: readonly ModulePin[], id: string): string {
  return pins.find((p) => p.id === id)?.version ?? '';
}

/** Every combination of registered module versions, canonical keys. */
export function supportedKeys(modules: readonly ModuleRules[]): string[] {
  let acc: ModulePin[][] = [[]];
  for (const mod of modules) {
    const versions = mod.versions.length ? mod.versions : [mod.current];
    acc = acc.flatMap((prefix) => versions.map((version) => [...prefix, { id: mod.id, version }]));
  }
  return acc.map((pins) => canonicalRuleset(pins));
}

/**
 * `requested` null → the v0.6.10 legacy pins (versionless links).
 * A segment is ok only when it names exactly this game's modules and every version is registered.
 */
export function resolveRuleset(modules: readonly ModuleRules[], requested: string | null): RulesetResolution {
  const currentKey = canonicalRuleset(modules.map((m) => ({ id: m.id, version: m.current })));
  if (!modules.length) return { ok: false, requested: requested ?? '', currentKey };
  if (!requested) {
    const pins = modules.map((m) => ({ id: m.id, version: m.legacy }));
    return { ok: true, pins, key: canonicalRuleset(pins), legacy: true };
  }
  const pins = parseRuleset(requested);
  if (!pins || pins.length !== modules.length) return { ok: false, requested, currentKey };
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const pin of pins) {
    const mod = byId.get(pin.id);
    if (!mod || !mod.versions.includes(pin.version)) return { ok: false, requested, currentKey };
  }
  return { ok: true, pins, key: canonicalRuleset(pins), legacy: false };
}
