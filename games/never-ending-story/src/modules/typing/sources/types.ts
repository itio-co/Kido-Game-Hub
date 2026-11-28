/** Source-adapter layer for the Typist lessons sub-game. A source turns some lesson file into `Lesson[]`. */
export type DrillKind = 'drill' | 'speed';

export type Drill = {
  /** Unique within its source. Safe to use in a best-score key (letters, digits, `_`, `-`). */
  id: string;
  /** The gtypist label (`*:LABEL`) the drill sits under, or a generated one. */
  label: string;
  kind: DrillKind;
  /** The line shown above the text (gtypist `I:`), usually a source credit or a hint. */
  instruction: string;
  /** Text to type: one line, normalized for a keyboard. */
  text: string;
};

export type Lesson = {
  id: string;
  title: string;
  summary: string;
  /** Tutorial text (gtypist `T:`) shown before the drills. */
  intro: string;
  drills: Drill[];
};

export interface LessonSource {
  id: string;
  title: string;
  /** Where the lessons come from, shown to the player. */
  origin: string;
  /** `online` sources fetch at runtime and can fail; `bundled` ones always load. */
  kind: 'online' | 'bundled';
  load(signal?: AbortSignal): Promise<Lesson[]>;
}
