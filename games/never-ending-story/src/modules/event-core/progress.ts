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
    },
  };
}
