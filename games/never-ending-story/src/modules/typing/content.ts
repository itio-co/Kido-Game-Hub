/** Built-in practice sets. English text lives here; the Thai set reads its text from the locale tables. */
export type SetId = 'home' | 'words' | 'sentences' | 'thai';

export type PracticeSet = {
  id: SetId;
  icon: string;
  /** Exercise texts (English). Empty when the texts come from locale keys. */
  texts: readonly string[];
  /** Locale keys (under `typing.`) for sets whose text is localized. */
  textKeys?: readonly string[];
};

export const SETS: readonly PracticeSet[] = [
  {
    id: 'home',
    icon: '🏠',
    texts: [
      'asdf jkl; asdf jkl; fjdk slaj dsa ;lkj fall flask salad dad had a lad ask',
      'a sad lad had a salad; dad asks all lads; a flask falls; sag shall glass;',
      'half a flag; fads and gags; a lass had a jag; ask dad; add salsa; jaks fall',
    ],
  },
  {
    id: 'words',
    icon: '🔤',
    texts: [
      'type write quiet power water tower route story pretty poetry proper report',
      'time keys with your hands on the home row and look at the words not the board',
      'quick brown jumps lazy every mixed zebra vexed jazz wave voice night bright',
    ],
  },
  {
    id: 'sentences',
    icon: '📝',
    texts: [
      'The quick brown fox jumps over the lazy dog.',
      'Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump!',
      'Sphinx of black quartz, judge my vow. The five boxing wizards jump quickly.',
    ],
  },
  {
    id: 'thai',
    icon: '🇹🇭',
    texts: [],
    textKeys: ['thai.t1', 'thai.t2', 'thai.t3'],
  },
];

export const setById = (id: string): PracticeSet => SETS.find((s) => s.id === id) ?? SETS[0];

/** Exercise for the `plays`-th run of a set, cycling through its texts. */
export function exerciseFor(set: PracticeSet, plays: number, text: (key: string) => string): string {
  const n = set.textKeys?.length ?? set.texts.length;
  const i = ((Math.floor(plays) % n) + n) % n;
  return set.textKeys ? text(set.textKeys[i]) : set.texts[i];
}

export const exerciseCount = (set: PracticeSet): number => set.textKeys?.length ?? set.texts.length;
