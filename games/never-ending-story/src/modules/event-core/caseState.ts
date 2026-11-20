/**
 * Event-01 save invariants. The key is awarded when the case is deduced and
 * consumed when the star box opens. Dialogue, the bag, and the house-map flag
 * are rewritten to match that on load.
 */

import { CASE_KEY_ID, canSolveCase, countedEvidence, houseMapUnlocked, type HouseMapFlow } from './progress.ts';

export type CaseStage = 'investigate' | 'deduced' | 'opened' | 'poster' | 'done';

export type CaseViolation = { code: string; detail: string };

export type CaseStateInput = {
  evidence?: readonly string[];
  bag?: readonly string[];
  solved?: boolean;
  deduced?: boolean;
  caseDone?: boolean;
  poster?: boolean;
  mapUnlocked?: boolean;
  talkSlug?: string | null;
};

export const GRANDMA_OPEN = 'flow/dialogue/grandma-open';
export const GRANDMA_ASK = 'flow/dialogue/grandma-ask';
export const GRANDMA_HAS_KEY = 'flow/dialogue/grandma-has-key';
export const GRANDMA_FOUND = 'flow/dialogue/grandma-need-poster';
export const GRANDMA_WIN = 'flow/dialogue/grandma-win';

const GRANDMA_STAGE_SLUGS = new Set([GRANDMA_OPEN, GRANDMA_HAS_KEY, GRANDMA_FOUND, GRANDMA_WIN]);

export function caseStage(input: { solved?: boolean; deduced?: boolean; poster?: boolean; caseDone?: boolean }): CaseStage {
  if (input.caseDone) return 'done';
  if (input.poster) return 'poster';
  if (input.solved) return 'opened';
  if (input.deduced) return 'deduced';
  return 'investigate';
}

/** Grandma's entry line for this stage. Mid-conversation choices are not remapped. */
export function grandmaDialogueSlug(stage: CaseStage): string {
  if (stage === 'done' || stage === 'poster') return GRANDMA_WIN;
  if (stage === 'opened') return GRANDMA_FOUND;
  if (stage === 'deduced') return GRANDMA_HAS_KEY;
  return GRANDMA_OPEN;
}

export function isGrandmaStageSlug(slug: string): boolean {
  return GRANDMA_STAGE_SLUGS.has(slug);
}

export type NormalizedCase = {
  evidence: string[];
  bag: string[];
  solved: boolean;
  deduced: boolean;
  caseDone: boolean;
  poster: boolean;
  mapUnlocked: boolean;
  talkSlug: string | null;
  stage: CaseStage;
  violations: CaseViolation[];
  changed: boolean;
};

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Repair one save. `gate` is the house-map evidence code, or null when this pack does not gate the button.
 * A true map flag without that evidence is cleared. Evidence that includes the code keeps the button.
 */
export function normalizeCaseState(input: CaseStateInput, catalog: readonly string[], gate: string | null): NormalizedCase {
  const violations: CaseViolation[] = [];
  const rawEvidence = [...(input.evidence ?? [])];
  let evidence = catalog.length > 0 ? countedEvidence(catalog, rawEvidence) : [...rawEvidence];
  const dropped = rawEvidence.filter((code) => !evidence.includes(code));
  if (dropped.length > 0) violations.push({ code: 'evidence-retired', detail: dropped.join(',') });

  let solved = input.solved === true;
  let deduced = input.deduced === true;
  let poster = input.poster === true;
  let caseDone = input.caseDone === true;
  let bag = [...(input.bag ?? [])];

  if (rawEvidence.includes('E05') && !solved) {
    solved = true;
    violations.push({ code: 'album-evidence', detail: 'E05 means the album was already found in the box' });
  }
  if ((poster || caseDone) && !solved) {
    solved = true;
    violations.push({ code: 'progress-before-open', detail: 'the poster or ending requires the opened box' });
  }
  if (caseDone && !poster) {
    poster = true;
    violations.push({ code: 'ending-without-poster', detail: 'the ending requires the poster' });
  }
  if (solved && !deduced) {
    deduced = true;
    violations.push({ code: 'opened-without-deduction', detail: 'an opened box implies the case was solved' });
  }

  const opened = solved;
  const holdsKey = bag.includes(CASE_KEY_ID);
  if (opened && holdsKey) {
    bag = bag.filter((id) => id !== CASE_KEY_ID);
    violations.push({ code: 'key-after-open', detail: 'the star-box key stays in the bag after the box was opened' });
  }
  if (!opened && deduced && !bag.includes(CASE_KEY_ID)) {
    bag = [...bag, CASE_KEY_ID];
    violations.push({ code: 'missing-key', detail: 'the case is solved but the key is not in the bag' });
  }
  if (!opened && !deduced && holdsKey) {
    if (canSolveCase(catalog, evidence)) {
      deduced = true;
      violations.push({ code: 'key-without-deduction', detail: 'the bag key implies the case was solved' });
    } else {
      bag = bag.filter((id) => id !== CASE_KEY_ID);
      violations.push({ code: 'unearned-key', detail: 'the key is in the bag before the case is solved' });
    }
  }
  if (deduced && !opened && catalog.length > 0 && !canSolveCase(catalog, evidence)) {
    violations.push({ code: 'deduced-without-clues', detail: 'the case is marked solved without every notebook clue' });
  }

  const mapFlow: HouseMapFlow = gate ? { games: [{ game: 'jigsaw', unlocksHouseMap: gate }] } : null;
  const mapShould = houseMapUnlocked(mapFlow, evidence);
  if (gate && (input.mapUnlocked === true) !== mapShould) {
    violations.push({
      code: 'map-flag',
      detail: mapShould
        ? 'the jigsaw evidence is in the save but the house-map flag was off'
        : 'the house-map flag was on without the jigsaw evidence',
    });
  }

  const stage = caseStage({ solved, deduced, poster, caseDone });
  let talkSlug = input.talkSlug ?? null;
  const expectedTalk = grandmaDialogueSlug(stage);
  const staleAsk = stage !== 'investigate' && talkSlug === GRANDMA_ASK;
  if (talkSlug && ((GRANDMA_STAGE_SLUGS.has(talkSlug) && talkSlug !== expectedTalk) || staleAsk)) {
    violations.push({ code: 'dialogue-stage', detail: `${talkSlug} does not match ${stage}` });
    talkSlug = expectedTalk;
  }

  const mapUnlocked = gate ? mapShould : input.mapUnlocked === true;
  const changed = !sameList(evidence, rawEvidence)
    || !sameList(bag, input.bag ?? [])
    || solved !== (input.solved === true)
    || deduced !== (input.deduced === true)
    || poster !== (input.poster === true)
    || caseDone !== (input.caseDone === true)
    || (gate !== null && mapUnlocked !== (input.mapUnlocked === true))
    || talkSlug !== (input.talkSlug ?? null);

  return { evidence, bag, solved, deduced, caseDone, poster, mapUnlocked, talkSlug, stage, violations, changed };
}
