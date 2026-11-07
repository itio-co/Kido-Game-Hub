/** Which story event is the one you can start, and where its ending pages live. */

export type StoryEvent = { eventId: string; unlockAfter: string | null };

/**
 * The unlocked story event in a pack. case-01 is the only one in the current
 * data, and it is also the fallback before the pack has loaded.
 */
export function primaryEventId(flow: { events: StoryEvent[] } | null | undefined): string {
  return flow?.events.find((item) => !item.unlockAfter)?.eventId ?? 'case-01';
}

/** Ending cutscene pages use `${eventId}-ending` (case-01 → case-01-ending). */
export function endingIdFor(eventId: string): string {
  return `${eventId}-ending`;
}
