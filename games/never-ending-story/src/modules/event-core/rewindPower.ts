/** Clock/calendar rewind rules shared by the session, UI, and tests. */

export type UnlockBy = string | string[] | null | undefined;

export type RewindSlot = {
  part: string;
  unlockBy?: UnlockBy;
};

export function unlockCodes(unlockBy: UnlockBy): string[] {
  if (!unlockBy) return [];
  return (Array.isArray(unlockBy) ? unlockBy : [unlockBy]).filter((code) => typeof code === 'string' && code.length > 0);
}

/** A slot is open when it has no requirement, or when any listed clue is held (OR). */
export function slotUnlocked(unlockBy: UnlockBy, held: readonly string[]): boolean {
  const codes = unlockCodes(unlockBy);
  if (codes.length === 0) return true;
  return codes.some((code) => held.includes(code));
}

/**
 * The hour-rewind power appears only after a clue that unlocks an hour slot
 * other than the free "now" slot. Tapping the clock before that must not open
 * the rewind panel.
 */
export function hasClockRewind(slots: readonly RewindSlot[] | null | undefined, held: readonly string[]): boolean {
  return (slots ?? []).some((item) => item.part === 'hour' && unlockCodes(item.unlockBy).length > 0 && slotUnlocked(item.unlockBy, held));
}
