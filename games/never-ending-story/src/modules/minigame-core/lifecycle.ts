/** Shared run phases. Games keep their own timers; this only names the transitions. */

export type RunPhase = 'ready' | 'play' | 'paused' | 'result';
export type PhaseEvent = 'start' | 'pause' | 'resume' | 'end';

/** The next phase for a lifecycle event. Unknown pairs stay put. */
export function nextPhase(phase: RunPhase, event: PhaseEvent): RunPhase {
  if (event === 'start' && (phase === 'ready' || phase === 'result' || phase === 'paused')) return 'play';
  if (event === 'pause' && phase === 'play') return 'paused';
  if (event === 'resume' && phase === 'paused') return 'play';
  if (event === 'end' && (phase === 'play' || phase === 'paused')) return 'result';
  return phase;
}
