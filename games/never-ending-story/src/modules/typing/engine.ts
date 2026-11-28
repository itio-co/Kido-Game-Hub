/** Typing rules: per-character marks, combo, score, WPM, accuracy, stars. Pure; callers pass the clock (ms). */
import type { TypingRules, TypingRuleset, TypingScoring } from './ruleset.ts';

/** Text is handled as Unicode code points so Thai and other non-ASCII keystrokes count once. */
export const toChars = (text: string): string[] => Array.from(text);

export type TypingState = {
  target: string[];
  typed: string[];
  correctKeys: number;
  wrongKeys: number;
  combo: number;
  maxCombo: number;
  score: number;
  /** Clock value of the first keystroke; WPM time starts here. */
  startMs: number | null;
  /** Set once the run is complete. */
  endMs: number | null;
};

export function createState(text: string): TypingState {
  return { target: toChars(text), typed: [], correctKeys: 0, wrongKeys: 0, combo: 0, maxCombo: 0, score: 0, startMs: null, endMs: null };
}

export type Mark = 'ok' | 'bad' | 'cursor' | 'todo';

/** Mark of the character at `i`: typed right, typed wrong, the next one to type, or still ahead. */
export function markAt(s: TypingState, i: number): Mark {
  if (i < s.typed.length) return s.typed[i] === s.target[i] ? 'ok' : 'bad';
  return i === s.typed.length ? 'cursor' : 'todo';
}

export const isComplete = (s: TypingState, rules: Pick<TypingRules, 'backspace'>): boolean =>
  s.target.length > 0 && s.typed.length === s.target.length && (!rules.backspace || errorCount(s) === 0);

/** Wrong characters currently on the line (corrected ones are gone). */
export function errorCount(s: TypingState): number {
  let n = 0;
  for (let i = 0; i < s.typed.length; i++) if (s.typed[i] !== s.target[i]) n++;
  return n;
}

export type KeyResult = 'ok' | 'bad' | 'ignored';

/**
 * One typed character. A wrong character stays on the line (marked) and the cursor moves on.
 * Typing past the end or after completion is ignored.
 */
export function typeChar(s: TypingState, ch: string, now: number, cfg: { rules: TypingRules; scoring: TypingScoring }): KeyResult {
  if (s.endMs !== null || s.typed.length >= s.target.length || ch === '') return 'ignored';
  if (s.startMs === null) s.startMs = now;
  const good = ch === s.target[s.typed.length];
  s.typed.push(ch);
  if (good) {
    s.correctKeys += 1;
    s.combo += 1;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.score += cfg.scoring.hit + Math.min(s.combo, cfg.scoring.comboCap) * cfg.scoring.comboBonus;
  } else {
    s.wrongKeys += 1;
    s.combo = 0;
  }
  if (isComplete(s, cfg.rules)) s.endMs = now;
  return good ? 'ok' : 'bad';
}

/** Backspace. Not allowed in hard mode or after completion. Score and error counts are not refunded. */
export function eraseChar(s: TypingState, rules: Pick<TypingRules, 'backspace'>): boolean {
  if (!rules.backspace || s.endMs !== null || s.typed.length === 0) return false;
  s.typed.pop();
  return true;
}

/** Characters on the line that match the target. */
export function correctChars(s: TypingState): number {
  let n = 0;
  for (let i = 0; i < s.typed.length; i++) if (s.typed[i] === s.target[i]) n++;
  return n;
}

export function elapsedMs(s: TypingState, now: number): number {
  if (s.startMs === null) return 0;
  return Math.max(0, (s.endMs ?? now) - s.startMs);
}

/** Net WPM: matching characters / word length per minute, with the clock floored at one second. */
export function wpm(s: TypingState, now: number, wordChars: number): number {
  const ms = elapsedMs(s, now);
  if (ms <= 0) return 0;
  return correctChars(s) / wordChars / (Math.max(ms, 1000) / 60000);
}

/** Share of keystrokes that were right, corrected mistakes included. 1 before the first key. */
export function accuracy(s: TypingState): number {
  const total = s.correctKeys + s.wrongKeys;
  return total === 0 ? 1 : s.correctKeys / total;
}

/** 0 stars below the accuracy floor; +1 for speed, +1 for speed and gold accuracy. */
export function starsFor(acc: number, speed: number, rules: TypingRules): number {
  if (acc < rules.minAccuracy) return 0;
  let stars = 1;
  if (speed >= rules.wpm[0]) stars += 1;
  if (speed >= rules.wpm[1] && acc >= rules.goldAccuracy) stars += 1;
  return stars;
}

export type TypingSummary = { wpm: number; accuracy: number; errors: number; maxCombo: number; score: number; timeMs: number; stars: number; chars: number };

export function summarize(s: TypingState, now: number, ruleset: TypingRuleset, rules: TypingRules): TypingSummary {
  const speed = wpm(s, now, ruleset.wordChars);
  const acc = accuracy(s);
  return { wpm: speed, accuracy: acc, errors: s.wrongKeys, maxCombo: s.maxCombo, score: Math.round(s.score), timeMs: Math.round(elapsedMs(s, now)), stars: starsFor(acc, speed, rules), chars: s.target.length };
}

/** A base character with any combining marks after it (Thai vowels and tone marks) is one cell on screen. */
export type Cell = { text: string; from: number; to: number };
export function cellsOf(target: string[]): Cell[] {
  const cells: Cell[] = [];
  target.forEach((ch, i) => {
    const last = cells[cells.length - 1];
    if (last && /^\p{M}$/u.test(ch)) {
      last.text += ch;
      last.to = i + 1;
    } else cells.push({ text: ch, from: i, to: i + 1 });
  });
  return cells;
}

/** Cells grouped into words (a word keeps its trailing space) so lines wrap between words. */
export function wordsOf(cells: Cell[]): Cell[][] {
  const words: Cell[][] = [];
  let cur: Cell[] = [];
  for (const cell of cells) {
    cur.push(cell);
    if (cell.text === ' ') {
      words.push(cur);
      cur = [];
    }
  }
  if (cur.length) words.push(cur);
  return words;
}

/** Mark of a whole cell: bad if any code point in it was typed wrong; cursor if the cursor is inside it. */
export function cellMark(s: TypingState, cell: Cell): Mark {
  let bad = false;
  for (let i = cell.from; i < cell.to; i++) if (i < s.typed.length && s.typed[i] !== s.target[i]) bad = true;
  if (bad) return 'bad';
  if (s.typed.length >= cell.to) return 'ok';
  if (s.typed.length >= cell.from) return 'cursor';
  return 'todo';
}
