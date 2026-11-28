/** The Typist lesson sources: one online `.typ` file read at runtime, and a small bundled sample. */
import { parseTypist } from './typParser.ts';
import { SAMPLE_TYP } from './sample.ts';
import type { Lesson, LessonSource } from './types.ts';

/** Data source for the Typist lessons sub-game. The repository carries no license file, so the file is fetched at runtime and never bundled or stored. */
export const TYPIST_QUOTES_URL = 'https://raw.githubusercontent.com/rawitat/gtypist_lessons/main/programming_quotes.typ';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;

type FetchLike = (url: string, init?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export class SourceError extends Error {
  constructor(public readonly reason: 'network' | 'http' | 'empty' | 'too-big', message: string) {
    super(message);
  }
}

/** Adapter for a `.typ` file at `url`. A successful load is kept for the page's lifetime only, in memory. */
export function createTypUrlSource(opts: { id: string; title: string; url: string; fetchImpl?: FetchLike }): LessonSource {
  let cached: Lesson[] | null = null;
  return {
    id: opts.id,
    title: opts.title,
    origin: opts.url,
    kind: 'online',
    async load(signal?: AbortSignal): Promise<Lesson[]> {
      if (cached) return cached;
      const ctl = new AbortController();
      const stop = (): void => ctl.abort();
      signal?.addEventListener('abort', stop);
      const timer = setTimeout(stop, TIMEOUT_MS);
      try {
        const doFetch: FetchLike = opts.fetchImpl ?? ((u, init) => fetch(u, init));
        let res;
        try {
          res = await doFetch(opts.url, { signal: ctl.signal, cache: 'no-cache' });
        } catch (e) {
          throw new SourceError('network', (e as Error).message || 'network error');
        }
        if (!res.ok) throw new SourceError('http', `HTTP ${res.status}`);
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new SourceError('too-big', 'file too large');
        const lessons = parseTypist(text).lessons;
        if (lessons.length === 0) throw new SourceError('empty', 'no drills found');
        cached = lessons;
        return lessons;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
      }
    },
  };
}

/** Adapter for lesson text that ships with the game. */
export function createTypTextSource(opts: { id: string; title: string; origin: string; text: string }): LessonSource {
  return {
    id: opts.id,
    title: opts.title,
    origin: opts.origin,
    kind: 'bundled',
    load: () => Promise.resolve(parseTypist(opts.text).lessons),
  };
}

export const quotesSource = createTypUrlSource({ id: 'quotes', title: 'Programming quotes', url: TYPIST_QUOTES_URL });
export const sampleSource = createTypTextSource({ id: 'sample', title: 'Sample lessons', origin: 'bundled', text: SAMPLE_TYP });

/** Registry shown in the Typist lessons screen. The first entry opens by default. */
export const TYPIST_SOURCES: readonly LessonSource[] = [quotesSource, sampleSource];
export const sourceById = (id: string): LessonSource => TYPIST_SOURCES.find((s) => s.id === id) ?? TYPIST_SOURCES[0];
