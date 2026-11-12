/**
 * Which modules make a shareable game's ruleset, and the registries this build can play.
 * Leaderboards partition on the canonical key from here. The app version is not included.
 */
import gamesDoc from './ruleset-games.json';
import { canonicalRuleset, pinVersion, resolveRuleset, supportedKeys, type ModulePin, type ModuleRules, type RulesetResolution } from './ruleset';
import type { RhythmRuleset } from '../modules/rhythm/ruleset';
import type { StirfryRuleset } from '../modules/stirfry/ruleset';
import rhythmMeta from '../modules/rhythm/module.json';
import rhythmData from '../modules/rhythm/ruleset.json';
import stirfryMeta from '../modules/stirfry/module.json';
import stirfryData from '../modules/stirfry/ruleset.json';
import { CHALLENGE_RULESETS, CHALLENGE_VERSION, challengeScoring, type ChallengeScoring } from '../modules/challenge/ruleset';
import { CROSS_RULESETS, CROSS_VERSION, crossRules, type CrossRuleset } from '../modules/crossword/ruleset';
import { JIG_RULESETS, JIG_VERSION, jigRules, type JigRuleset } from '../modules/jigsaw/ruleset';
import { SLIDE_RULESETS, SLIDE_VERSION, slideRules, type SlideRuleset } from '../modules/slide/ruleset';

export const LEGACY_APP = gamesDoc.legacyApp;
const LEGACY = gamesDoc.legacy as Record<string, string>;
export const GAME_MODULES = gamesDoc.games as Record<string, string[]>;

const REGISTRY: Record<string, { version: string; versions: string[] }> = {
  rhythm: { version: rhythmMeta.version, versions: Object.keys(rhythmData) },
  stirfry: { version: stirfryMeta.version, versions: Object.keys(stirfryData) },
  challenge: { version: CHALLENGE_VERSION, versions: Object.keys(CHALLENGE_RULESETS) },
  crossword: { version: CROSS_VERSION, versions: Object.keys(CROSS_RULESETS) },
  jigsaw: { version: JIG_VERSION, versions: Object.keys(JIG_RULESETS) },
  slide: { version: SLIDE_VERSION, versions: Object.keys(SLIDE_RULESETS) },
};

export function moduleRules(id: string): ModuleRules | null {
  const reg = REGISTRY[id];
  if (!reg) return null;
  return { id, versions: reg.versions, current: reg.version, legacy: LEGACY[id] ?? reg.version };
}

export function gameModules(game: string): ModuleRules[] {
  const ids = GAME_MODULES[game];
  if (!ids) return [];
  return ids.flatMap((id) => {
    const rules = moduleRules(id);
    return rules ? [rules] : [];
  });
}

export function currentRuleset(game: string): string {
  return canonicalRuleset(gameModules(game).map((m) => ({ id: m.id, version: m.current })));
}

export function legacyRuleset(game: string): string {
  return canonicalRuleset(gameModules(game).map((m) => ({ id: m.id, version: m.legacy })));
}

export function supportedRulesets(game: string): string[] {
  return supportedKeys(gameModules(game));
}

export function resolveGame(game: string, requested: string | null): RulesetResolution {
  return resolveRuleset(gameModules(game), requested);
}

/** Canonical key when `raw` is a supported ruleset, else null. Empty raw → legacy (v0.6.10). */
export function acceptRuleset(game: string, raw: string | null | undefined): string | null {
  if (!GAME_MODULES[game]) return null;
  if (!raw) return legacyRuleset(game);
  const res = resolveRuleset(gameModules(game), raw);
  return res.ok ? res.key : null;
}

export function rulesetAllowed(game: string, key: string): boolean {
  return acceptRuleset(game, key) !== null;
}

export function pinsOf(res: Extract<RulesetResolution, { ok: true }>): ModulePin[] {
  return res.pins;
}

export function versionIn(res: Extract<RulesetResolution, { ok: true }>, id: string): string {
  return pinVersion(res.pins, id);
}

export function rhythmFor(version: string): RhythmRuleset | null {
  return (rhythmData as unknown as Record<string, RhythmRuleset>)[version] ?? null;
}
export function stirfryFor(version: string): StirfryRuleset | null {
  return (stirfryData as unknown as Record<string, StirfryRuleset>)[version] ?? null;
}
export function scoringFor(version: string): ChallengeScoring | null {
  return challengeScoring(version);
}
export function crosswordFor(version: string): CrossRuleset | null {
  return crossRules(version);
}
export function jigsawFor(version: string): JigRuleset | null {
  return jigRules(version);
}
export function slideFor(version: string): SlideRuleset | null {
  return slideRules(version);
}
