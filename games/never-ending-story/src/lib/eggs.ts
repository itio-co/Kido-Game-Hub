const EGG_KEY = 'nesg.eggs.v1';

export type EggState = {
  fanSticker: boolean;
  fanTaps: number;
};

function empty(): EggState {
  return { fanSticker: false, fanTaps: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function readEggs(): EggState {
  try {
    const raw = localStorage.getItem(EGG_KEY);
    if (!raw) return empty();
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data)) return empty();
    return {
      fanSticker: data.fanSticker === true,
      fanTaps: typeof data.fanTaps === 'number' ? data.fanTaps : 0,
    };
  } catch {
    return empty();
  }
}

export function writeEggs(state: EggState): void {
  localStorage.setItem(EGG_KEY, JSON.stringify(state));
}

/** Returns true when the sticker is newly unlocked this tap. */
export function tapFanEgg(): { state: EggState; unlocked: boolean } {
  const state = readEggs();
  if (state.fanSticker) return { state, unlocked: false };
  state.fanTaps += 1;
  let unlocked = false;
  if (state.fanTaps >= 5) {
    state.fanSticker = true;
    unlocked = true;
  }
  writeEggs(state);
  return { state, unlocked };
}
