/**
 * Physical keyboard layout, tracker style (two hands, one octave each).
 * Bottom row Z S X D C V G B H N J M = lower octave (C..B, black keys on the row above).
 * Top row Q 2 W 3 E R 5 T 6 Y 7 U = upper octave, `I` = the C above it.
 * Uses `KeyboardEvent.code`, so the layout is the same on any keyboard language.
 */

export const LOWER_CODES = ['KeyZ', 'KeyS', 'KeyX', 'KeyD', 'KeyC', 'KeyV', 'KeyG', 'KeyB', 'KeyH', 'KeyN', 'KeyJ', 'KeyM'] as const;
export const UPPER_CODES = ['KeyQ', 'Digit2', 'KeyW', 'Digit3', 'KeyE', 'KeyR', 'Digit5', 'KeyT', 'Digit6', 'KeyY', 'Digit7', 'KeyU'] as const;
export const TOP_CODE = 'KeyI';
export const LOWER_LABELS = ['Z', 'S', 'X', 'D', 'C', 'V', 'G', 'B', 'H', 'N', 'J', 'M'] as const;
export const UPPER_LABELS = ['Q', '2', 'W', '3', 'E', 'R', '5', 'T', '6', 'Y', '7', 'U'] as const;

export const SHIFT_UP_CODES: readonly string[] = ['ArrowUp', 'Period'];
export const SHIFT_DOWN_CODES: readonly string[] = ['ArrowDown', 'Comma'];

const OFFSETS = new Map<string, number>();
LOWER_CODES.forEach((code, i) => OFFSETS.set(code, i));
UPPER_CODES.forEach((code, i) => OFFSETS.set(code, 12 + i));
OFFSETS.set(TOP_CODE, 24);

/** True for keys the piano owns (so the page must not scroll or type with them). */
export const isPianoCode = (code: string): boolean => OFFSETS.has(code) || SHIFT_UP_CODES.includes(code) || SHIFT_DOWN_CODES.includes(code);

/** MIDI note for a key, given the C where the lower row starts. */
export function midiForCode(code: string, baseMidi: number): number | null {
  const offset = OFFSETS.get(code);
  return offset === undefined ? null : baseMidi + offset;
}

/** Letter printed on the key that plays `midi`, or null when no computer key does. */
export function labelForMidi(midi: number, baseMidi: number): string | null {
  const offset = midi - baseMidi;
  if (offset < 0 || offset > 24) return null;
  if (offset === 24) return 'I';
  return offset < 12 ? LOWER_LABELS[offset] : UPPER_LABELS[offset - 12];
}
