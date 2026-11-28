/** Pitch math and keyboard layout. Pure: no DOM, no audio. MIDI 60 is middle C (C4). */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const midiFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
export const isBlack = (midi: number): boolean => BLACK.has(((midi % 12) + 12) % 12);
export const noteName = (midi: number): string => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
/** MIDI number of the C that starts `octave` (C4 = 60). */
export const octaveStart = (octave: number): number => (octave + 1) * 12;

/** Playable range: C2 through C6. Wide enough for a 4-octave tablet view. */
export const MIN_OCTAVE = 2;
export const MAX_TOP_OCTAVE = 6;
/** Fewest octaves on a narrow phone; most that still fit inside C2–C6. */
export const MIN_SPAN = 1;
export const MAX_SPAN = MAX_TOP_OCTAVE - MIN_OCTAVE;
/** Minimum CSS-pixel width of a white key so a finger can hit it. */
export const MIN_WHITE_PX = 60;

export const whitesForSpan = (span: number): number => 7 * Math.max(1, Math.round(span)) + 1;

/** Highest start octave that still keeps the top C inside C6. */
export const maxStartOctave = (span: number): number => MAX_TOP_OCTAVE - span;
export const clampSpan = (span: number): number =>
  Math.max(MIN_SPAN, Math.min(MAX_SPAN, Math.round(span)));
export const clampOctave = (octave: number, span: number): number =>
  Math.max(MIN_OCTAVE, Math.min(maxStartOctave(clampSpan(span)), Math.round(octave)));

/**
 * How many octaves fit in `widthPx` without white keys shrinking below `minWhitePx`.
 * A phone-width landscape row stays at 1; a tablet grows to 2–4.
 */
export function spanForWidth(widthPx: number, minWhitePx = MIN_WHITE_PX): number {
  const whites = Math.floor(Math.max(0, widthPx) / Math.max(1, minWhitePx));
  return clampSpan(Math.floor((whites - 1) / 7));
}

/**
 * Start octave that keeps the song's C..(C+1) in view and as centred as possible.
 * span 1 → the song octave; span 3 → one octave on each side (when the range allows).
 */
export function songStartOctave(songOctave: number, span: number): number {
  const s = clampSpan(span);
  return clampOctave(songOctave - Math.floor((s - 1) / 2), s);
}

export type KeyDef = {
  midi: number;
  black: boolean;
  name: string;
  /** White key: its column. Black key: the column of the white key on its left. */
  col: number;
  /** Percent of the keyboard width. */
  left: number;
  width: number;
  /** Percent of the keyboard width at the key's centre (falling-note lanes use this). */
  center: number;
};

/** Keys from `startMidi` (a C) up to and including the C `span` octaves higher. */
export function buildKeys(startMidi: number, span: number): { keys: KeyDef[]; whites: number } {
  const s = clampSpan(span);
  const top = startMidi + 12 * s;
  const whites = whitesForSpan(s);
  const w = 100 / whites;
  const bw = w * 0.62;
  const keys: KeyDef[] = [];
  let col = -1;
  for (let m = startMidi; m <= top; m++) {
    if (isBlack(m)) {
      const left = (col + 1) * w - bw / 2;
      keys.push({ midi: m, black: true, name: noteName(m), col, left, width: bw, center: left + bw / 2 });
    } else {
      col += 1;
      keys.push({ midi: m, black: false, name: noteName(m), col, left: col * w, width: w, center: col * w + w / 2 });
    }
  }
  return { keys, whites };
}
