/** Pitch math and keyboard layout. Pure: no DOM, no audio. MIDI 60 is middle C (C4). */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const midiFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
export const isBlack = (midi: number): boolean => BLACK.has(((midi % 12) + 12) % 12);
export const noteName = (midi: number): string => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
/** MIDI number of the C that starts `octave` (C4 = 60). */
export const octaveStart = (octave: number): number => (octave + 1) * 12;

/** Octave range the player can reach: C3 through C6. */
export const MIN_OCTAVE = 3;
export const MAX_TOP_OCTAVE = 6;

/** Highest start octave that still keeps the top C inside C6. */
export const maxStartOctave = (span: number): number => MAX_TOP_OCTAVE - span;
export const clampOctave = (octave: number, span: number): number =>
  Math.max(MIN_OCTAVE, Math.min(maxStartOctave(span), Math.round(octave)));

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
  const top = startMidi + 12 * span;
  const whites = 7 * span + 1;
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
