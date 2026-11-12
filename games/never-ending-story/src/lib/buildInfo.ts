import { version } from '../../package.json';
import { GOD_VERSION } from '../modules/god/version';
import { GOD_MODE_VERSION } from '../modules/god-mode/version';
import { currentRuleset, GAME_MODULES } from './rulesetCatalog';
import { RHYTHM_VERSION } from '../modules/rhythm/ruleset';
import { STIRFRY_VERSION } from '../modules/stirfry/ruleset';
import { CHALLENGE_VERSION } from '../modules/challenge/ruleset';
import { CROSS_VERSION } from '../modules/crossword/ruleset';
import { JIG_VERSION } from '../modules/jigsaw/ruleset';
import { SLIDE_VERSION } from '../modules/slide/ruleset';

/** App version is the core build. Module versions are the ones this bundle plays. */
export function buildInfo(): { app: string; build: string; modules: Record<string, string>; rulesets: Record<string, string> } {
  const rulesets: Record<string, string> = {};
  for (const game of Object.keys(GAME_MODULES)) rulesets[game] = currentRuleset(game);
  return {
    app: version,
    build: version,
    modules: {
      core: version,
      god: GOD_VERSION,
      'god-mode': GOD_MODE_VERSION,
      rhythm: RHYTHM_VERSION,
      stirfry: STIRFRY_VERSION,
      challenge: CHALLENGE_VERSION,
      crossword: CROSS_VERSION,
      jigsaw: JIG_VERSION,
      slide: SLIDE_VERSION,
    },
    rulesets,
  };
}
