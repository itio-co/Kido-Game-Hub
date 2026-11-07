/** D1 event progress document. Field names match what the Worker funnel already reads. */

export type EventProgressBody = {
  status: 'started' | 'completed';
  progress: Record<string, unknown>;
};

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
    },
  };
}
