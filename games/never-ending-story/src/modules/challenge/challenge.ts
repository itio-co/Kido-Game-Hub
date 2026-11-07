/** Challenge mode: seeded puzzles, points + time scoring, share links, leaderboard adapter. */
import { RULESET_SRC, seededPath, withChallenger } from '../minigame-core/framework';
import { challengeScoring, CHALLENGE_VERSION, type ChallengeScoring } from './ruleset';
import { currentRuleset, legacyRuleset } from '../../lib/rulesetCatalog';

export type ChallengeGame = 'cross' | 'jig' | 'slide';
export type Difficulty = 'easy' | 'medium' | 'hard';

export const CHALLENGE_GAMES: ChallengeGame[] = ['cross', 'jig', 'slide'];
export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export type ChallengeParams = {
  game: ChallengeGame;
  difficulty: Difficulty | null;
  seed: number | null;
  /** Ruleset path segment, or null on a versionless (v0.6.10) link. */
  ruleset: string | null;
  from: { nick: string; score: number; time: number; sessionId: string } | null;
  runToken: string | null;
};

export type ChallengeResult = { score: number; time: number };

export type LeaderEntry = {
  game: ChallengeGame;
  difficulty: Difficulty;
  nick: string;
  playerId: string | null;
  score: number;
  time: number;
  seed: number;
  at: number;
  source: 'me' | 'challenger';
  /** Canonical ruleset. Missing on rows saved before 0.6.11 (treated as the legacy ruleset). */
  ruleset?: string;
};

/** mulberry32 — tiny deterministic PRNG so friends get the same puzzle from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function newSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}

const isGame = (v: string): v is ChallengeGame => (CHALLENGE_GAMES as string[]).includes(v);
const isDiff = (v: string | null): v is Difficulty => !!v && (DIFFICULTIES as string[]).includes(v);

/**
 * Human-readable URLs:
 *   #/challenge/<game>                                   → difficulty picker
 *   #/challenge/<game>/<difficulty>/<seed>               → fixed puzzle (v0.6.10 rules)
 *   #/challenge/<game>/<difficulty>/<seed>/<ruleset>     → same puzzle, pinned rules
 *   #/challenge/<game>/<difficulty>/<seed>[/<ruleset>]/vs/<nick>?score=<pts>&time=<sec>&run=<protobuf.tag>
 * `ruleset` is `challenge@1.1.0+crossword@1.0.0`.
 */
export function parseChallengeHash(hash: string): ChallengeParams | null {
  const m = new RegExp(`^#\\/challenge\\/([a-z]+)(?:\\/([a-z]+)\\/(\\d+))?(?:\\/(${RULESET_SRC}))?(?:\\/vs\\/([^?/]+))?(?:\\?(.*))?$`).exec(hash);
  if (!m || !isGame(m[1])) return null;
  const q = new URLSearchParams(m[6] ?? '');
  const d = m[2] ?? null;
  const s = Number(m[3]);
  const sc = Number(q.get('score'));
  const tm = Number(q.get('time'));
  let nick = '';
  try {
    nick = m[5] ? decodeURIComponent(m[5]).slice(0, 24) : '';
  } catch {
    nick = '';
  }
  return {
    game: m[1],
    difficulty: isDiff(d) ? d : null,
    seed: Number.isFinite(s) && s > 0 ? Math.floor(s) : null,
    ruleset: m[4] ?? null,
    from: nick && Number.isFinite(sc) && Number.isFinite(tm)
      ? { nick, score: Math.max(0, Math.floor(sc)), time: Math.max(0, Math.floor(tm)), sessionId: '' }
      : null,
    runToken: q.get('run'),
  };
}

export function challengeHash(game: ChallengeGame, difficulty: Difficulty, seed: number, from?: { nick: string; token: string } & ChallengeResult, ruleset?: string | null): string {
  const path = seededPath(`#/challenge/${game}`, difficulty, seed, ruleset);
  if (!from) return path;
  return withChallenger(path, from.nick, { score: String(from.score), time: String(from.time), run: from.token });
}

export function shareUrl(hash: string): string {
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** Higher score wins; equal score → faster time wins. */
export function compare(me: ChallengeResult, other: ChallengeResult): 'win' | 'lose' | 'tie' {
  if (me.score !== other.score) return me.score > other.score ? 'win' : 'lose';
  if (me.time !== other.time) return me.time < other.time ? 'win' : 'lose';
  return 'tie';
}

const CURRENT_SCORING = challengeScoring(CHALLENGE_VERSION)!;
export const DIFF_MULT: Record<Difficulty, number> = CURRENT_SCORING.mult;
export const PAR_SECONDS: Record<ChallengeGame, Record<Difficulty, number>> = CURRENT_SCORING.par;

export type Tally = { correct: number; mistakes: number; hints: number; maxCombo: number };

/** Points: correctness + combo − mistakes − hints, plus a time bonus under par; scaled by difficulty. */
export function scoreFor(game: ChallengeGame, difficulty: Difficulty, tally: Tally, seconds: number, scoring: ChallengeScoring = CURRENT_SCORING): number {
  const base = tally.correct * scoring.correct + tally.maxCombo * scoring.combo - tally.mistakes * scoring.mistake - tally.hints * scoring.hint;
  const timeBonus = Math.max(0, scoring.par[game][difficulty] - seconds) * scoring.timeBonus;
  return Math.max(scoring.floor, Math.round((base + timeBonus) * scoring.mult[difficulty]));
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Leaderboard storage is behind an adapter so a global backend can be dropped in later. */
export interface LeaderboardAdapter {
  readonly kind: 'local' | 'global';
  submit(entry: LeaderEntry): Promise<void>;
  top(game: ChallengeGame, difficulty: Difficulty, limit?: number, ruleset?: string): Promise<LeaderEntry[]>;
}

const LB_KEY = 'nesg.challenge.board.v1';

function readAll(): LeaderEntry[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LB_KEY) ?? '[]');
    return Array.isArray(data) ? (data as LeaderEntry[]).filter((e) => e && typeof e.score === 'number') : [];
  } catch {
    return [];
  }
}

export class LocalLeaderboard implements LeaderboardAdapter {
  readonly kind = 'local' as const;
  async submit(entry: LeaderEntry): Promise<void> {
    const all = readAll();
    const key = (e: LeaderEntry) => `${e.game}|${e.difficulty}|${e.ruleset ?? legacyRuleset(e.game)}|${e.source}|${e.source === 'me' ? 'me' : e.nick}|${e.seed}`;
    const idx = all.findIndex((e) => key(e) === key(entry));
    if (idx >= 0) {
      if (compare(entry, all[idx]) === 'win') all[idx] = entry;
    } else all.push(entry);
    localStorage.setItem(LB_KEY, JSON.stringify(all.slice(-300)));
  }
  async top(game: ChallengeGame, difficulty: Difficulty, limit = 10, ruleset = currentRuleset(game)): Promise<LeaderEntry[]> {
    return readAll()
      .filter((e) => e.game === game && e.difficulty === difficulty && (e.ruleset || legacyRuleset(game)) === ruleset)
      .sort((a, b) => b.score - a.score || a.time - b.time)
      .slice(0, limit);
  }
}

export const leaderboard: LeaderboardAdapter = new LocalLeaderboard();

const RUN_KEY = 'nesg.challenge.run.v1';

export function readRun<T>(): T | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function writeRun(run: unknown): void {
  localStorage.setItem(RUN_KEY, JSON.stringify(run));
}
export function clearRun(): void {
  localStorage.removeItem(RUN_KEY);
}
