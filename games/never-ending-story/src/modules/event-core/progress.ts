/** D1 event progress document. Field names match what the Worker funnel already reads. */

export type EventProgressBody = {
  status: 'started' | 'completed';
  progress: Record<string, unknown>;
};

type GatedFlow = { games?: { game?: string; unlocksHouseMap?: unknown }[] } | null | undefined;

/** Evidence code that unlocks the house-map button, or null when this pack does not gate it. */
export function houseMapGate(flow: GatedFlow): string | null {
  const code = flow?.games?.find((game) => game.game === 'jigsaw')?.unlocksHouseMap;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

/** A pack with no gate leaves the button available. A gated pack unlocks it once that evidence is in the save. */
export function houseMapUnlocked(flow: GatedFlow, evidence: readonly string[]): boolean {
  const gate = houseMapGate(flow);
  return gate === null || evidence.includes(gate);
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
