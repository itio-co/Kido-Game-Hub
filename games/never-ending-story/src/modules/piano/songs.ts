/**
 * Short public-domain children's tunes. Every note stays inside one octave (C..C above),
 * so one hand reaches them and no octave shift is needed.
 * A note is [scale degree 0..7 on the C major scale, length in beats].
 */
export type SongId = 'twinkle' | 'mary' | 'ode' | 'jingle';
export type SongNote = readonly [degree: number, beats: number];
export type Song = { id: SongId; notes: readonly SongNote[] };

const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12] as const;
/** Semitones above the octave's C for a scale degree 0..7. */
export const degreeSemitones = (degree: number): number => MAJOR[Math.max(0, Math.min(7, degree))];

const line = (...degrees: number[]): SongNote[] => degrees.map((d, i) => [d, i === degrees.length - 1 ? 2 : 1] as const);

const TWINKLE_A = line(0, 0, 4, 4, 5, 5, 4);
const TWINKLE_B = line(3, 3, 2, 2, 1, 1, 0);
const TWINKLE_C = line(4, 4, 3, 3, 2, 2, 1);

export const SONGS: readonly Song[] = [
  { id: 'twinkle', notes: [...TWINKLE_A, ...TWINKLE_B, ...TWINKLE_C, ...TWINKLE_A, ...TWINKLE_B] },
  {
    id: 'mary',
    notes: [
      [2, 1], [1, 1], [0, 1], [1, 1], [2, 1], [2, 1], [2, 2],
      [1, 1], [1, 1], [1, 2], [2, 1], [4, 1], [4, 2],
      [2, 1], [1, 1], [0, 1], [1, 1], [2, 1], [2, 1], [2, 1], [2, 1],
      [1, 1], [1, 1], [2, 1], [1, 1], [0, 4],
    ],
  },
  {
    id: 'ode',
    notes: [
      [2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1],
      [0, 1], [0, 1], [1, 1], [2, 1], [2, 1.5], [1, 0.5], [1, 2],
      [2, 1], [2, 1], [3, 1], [4, 1], [4, 1], [3, 1], [2, 1], [1, 1],
      [0, 1], [0, 1], [1, 1], [2, 1], [1, 1.5], [0, 0.5], [0, 2],
    ],
  },
  {
    id: 'jingle',
    notes: [
      [2, 1], [2, 1], [2, 2], [2, 1], [2, 1], [2, 2],
      [2, 1], [4, 1], [0, 1.5], [1, 0.5], [2, 4],
      [3, 1], [3, 1], [3, 1.5], [3, 0.5], [3, 1], [2, 1], [2, 1], [2, 0.5], [2, 0.5],
      [2, 1], [1, 1], [1, 1], [2, 1], [1, 2], [4, 2],
    ],
  },
];

export const songById = (id: string): Song => SONGS.find((song) => song.id === id) ?? SONGS[0];
