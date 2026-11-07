/** Readable challenge paths. The ruleset segment is `module@version+module@version`. */
import { RULESET_SRC } from './ruleset';

export { RULESET_SRC };

/** `#/play/stirfry/normal/482913` or the same path plus `/rhythm@1.1.0+stirfry@1.2.0`. */
export function seededPath(route: string, difficulty: string, seed: number, ruleset?: string | null): string {
  return `${route}/${difficulty}/${seed}${ruleset ? `/${ruleset}` : ''}`;
}

/** Append `/vs/<nick>?<query>` without changing the path or the query keys. */
export function withChallenger(path: string, nick: string, query: Record<string, string>): string {
  return `${path}/vs/${encodeURIComponent(nick)}?${new URLSearchParams(query).toString()}`;
}

/**
 * Where a hash route should open. Same branches the shell used before this module existed.
 * `#/play/…` is a rhythm-pack challenge link, not the puzzle challenge screen.
 */
export function minigameRoute(hash: string): 'challenge' | 'rhythm' | 'leaderboard' | null {
  if (hash.startsWith('#/leaderboard')) return 'leaderboard';
  if (hash.startsWith('#/challenge')) return 'challenge';
  if (hash.startsWith('#/play/')) return 'rhythm';
  return null;
}
