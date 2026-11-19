/** Eight taps on the version badge inside one short window unlock God Mode. */

export const GOD_TAP_TARGET = 8;
export const GOD_TAP_WINDOW_MS = 3000;

export type TapClock = { count: number; startedAt: number };

export type TapStep = {
  clock: TapClock | null;
  count: number;
  unlocked: boolean;
  /** Subtle hint while the player is close (taps 5–7). */
  hint: boolean;
  remaining: number;
};

export function nextVersionTap(clock: TapClock | null, now: number, windowMs = GOD_TAP_WINDOW_MS): TapStep {
  const expired = !clock || now - clock.startedAt > windowMs;
  const startedAt = expired ? now : clock.startedAt;
  const count = expired ? 1 : clock.count + 1;
  if (count >= GOD_TAP_TARGET) {
    return { clock: null, count, unlocked: true, hint: false, remaining: 0 };
  }
  return {
    clock: { count, startedAt },
    count,
    unlocked: false,
    hint: count >= 5,
    remaining: GOD_TAP_TARGET - count,
  };
}

/** A live admin session shows the bubble. Otherwise the player must log in first. */
export function unlockShowsBubble(hasSession: boolean): boolean {
  return hasSession === true;
}
