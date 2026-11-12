/** D1 event progress document. Field names match what the Worker funnel already reads. */

export type EventProgressBody = {
  status: 'started' | 'completed';
  progress: Record<string, unknown>;
};

export type HouseMapFlow = {
  slug?: string;
  events?: { eventId?: string; unlockAfter?: string | null }[];
  games?: { game?: string; unlocksHouseMap?: unknown }[];
} | null | undefined;

type RegisteredGate = { evidence: string; match: (flow: HouseMapFlow) => boolean };
const registeredGates: RegisteredGate[] = [];

/**
 * A story pack registers the evidence code that unlocks the house-map button.
 * Used when the loaded story file has no `unlocksHouseMap` (a cache-first copy
 * from before that field existed). A pack that does not register stays open.
 */
export function registerHouseMapGate(evidence: string, match: (flow: HouseMapFlow) => boolean): void {
  if (!evidence) return;
  const next = registeredGates.filter((item) => item.evidence !== evidence);
  next.push({ evidence, match });
  registeredGates.splice(0, registeredGates.length, ...next);
}

/** Evidence code that unlocks the house-map button, or null when this pack does not gate it. */
export function houseMapGate(flow: HouseMapFlow): string | null {
  const code = flow?.games?.find((game) => game.game === 'jigsaw')?.unlocksHouseMap;
  if (typeof code === 'string' && code.length > 0) return code;
  return registeredGates.find((item) => item.match(flow))?.evidence ?? null;
}

/** A pack with no gate leaves the button available. A gated pack unlocks it only once that evidence is in the save. */
export function houseMapUnlocked(flow: HouseMapFlow, evidence: readonly string[]): boolean {
  const gate = houseMapGate(flow);
  return gate === null || evidence.includes(gate);
}

/** The one bottom-bar rule for every scene. `sceneHasMap` is the scene's `map` flag. */
export function showHouseMapButton(input: {
  context: string;
  sceneHasMap: boolean;
  flow: HouseMapFlow;
  evidence: readonly string[];
}): boolean {
  return input.context === 'event' && input.sceneHasMap && houseMapUnlocked(input.flow, input.evidence);
}

/**
 * The saved flag is not the button. Rewrite it when it disagrees with the evidence
 * gate: missing flag after a real win, or a true flag without that evidence.
 */
export function mapUnlockNeedsPersist(savedFlag: boolean | undefined, unlocked: boolean): boolean {
  if (unlocked) return savedFlag !== true;
  return savedFlag === true;
}

/** Null until the player has actually started the case (same rule as before). */
export function eventProgressBody(flow: Record<string, unknown> | undefined): EventProgressBody | null {
  const f = flow ?? {};
  const started = (Array.isArray(f.evidence) && f.evidence.length > 0) || f.poster || f.caseDone || f.solved;
  if (!started) return null;
  return {
    status: f.caseDone ? 'completed' : 'started',
    progress: {
      evidence: f.evidence,
      solved: f.solved,
      deduced: f.deduced,
      reward: f.reward,
      posterShown: f.poster,
      endingSeen: f.caseDone,
      seen: f.seen,
      mapUnlocked: f.mapUnlocked === true,
      bag: Array.isArray(f.bag) ? f.bag : [],
    },
  };
}

/** Inventory id of the key awarded when the case deduction is solved. Not an evidence code. */
export const CASE_KEY_ID = 'case-key';

type EvidenceFlow = { evidence?: { code?: unknown }[] } | null | undefined;

/** Evidence codes this pack lists in the notebook. The HUD denominator is this length. */
export function catalogCodes(flow: EvidenceFlow): string[] {
  return (flow?.evidence ?? [])
    .map((item) => item.code)
    .filter((code): code is string => typeof code === 'string' && code.length > 0);
}

/** Held codes that are still evidence. Dropped codes such as a retired E05 do not count. */
export function countedEvidence(catalog: readonly string[], held: readonly string[]): string[] {
  const allowed = new Set(catalog);
  return held.filter((code) => allowed.has(code));
}

/** สรุปคดี opens once every notebook evidence code is in the save. */
export function canSolveCase(catalog: readonly string[], held: readonly string[]): boolean {
  return catalog.length > 0 && catalog.every((code) => held.includes(code));
}

/**
 * Old saves stored E05 as evidence, or finished the case before the key existed.
 * Those players receive the key. E05 is removed so the counter stays x/catalog.
 */
export function migrateCaseBag(
  input: {
    evidence: readonly string[];
    bag?: readonly string[];
    solved?: boolean;
    deduced?: boolean;
    caseDone?: boolean;
  },
  catalog: readonly string[],
): { evidence: string[]; bag: string[]; changed: boolean } {
  const hadRetired = input.evidence.includes('E05');
  const evidence = catalog.length > 0 ? countedEvidence(catalog, input.evidence) : [...input.evidence];
  const bag = [...(input.bag ?? [])];
  const earned = hadRetired || input.solved === true || input.deduced === true || input.caseDone === true;
  let changed = evidence.length !== input.evidence.length || evidence.some((code, index) => code !== input.evidence[index]);
  if (earned && !bag.includes(CASE_KEY_ID)) {
    bag.push(CASE_KEY_ID);
    changed = true;
  }
  return { evidence, bag, changed };
}
