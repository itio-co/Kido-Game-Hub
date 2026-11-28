// Typing rules + the gtypist (.typ) parser and the Typist source adapters.
// Optional: TYPIST_REAL_FILE=/path/to/programming_quotes.typ also checks the parser against the real course file (the file is not in the repo).
import { accuracy, cellMark, cellsOf, correctChars, createState, elapsedMs, eraseChar, errorCount, isComplete, markAt, starsFor, summarize, typeChar, wordsOf, wpm } from '../src/modules/typing/engine.ts';
import { exerciseCount, exerciseFor, SETS, setById } from '../src/modules/typing/content.ts';
import { TYPING_DIFFICULTIES, TYPING_RULESETS, TYPING_VERSION, typingRuleset } from '../src/modules/typing/ruleset.ts';
import { defaultPrefs, parsePrefs } from '../src/modules/typing/store.ts';
import { normalizeForTyping, parseTypist, tokenize } from '../src/modules/typing/sources/typParser.ts';
import { createTypTextSource, createTypUrlSource, quotesSource, SourceError, TYPIST_QUOTES_URL, TYPIST_SOURCES } from '../src/modules/typing/sources/typist.ts';
import { SAMPLE_TYP } from '../src/modules/typing/sources/sample.ts';
import { authorFromInstruction, buildQuoteCard, looksLikePersonName, wrapQuote } from '../src/modules/typing/quote.ts';
import { findPortrait, initialsOf, portraitCatalog } from '../src/modules/typing/portrait.ts';
import { MINI_TYP } from './fixtures/typistMini.ts';

declare const process: { exitCode?: number; env: Record<string, string | undefined> };
let failed = 0;
let passed = 0;
const pending: Promise<void>[] = [];
function test(name: string, fn: () => void | Promise<void>): void {
  const done = (ok: boolean, e?: unknown): void => {
    if (ok) passed++;
    else {
      failed++;
      console.error(`FAIL ${name}: ${(e as Error).message}`);
    }
  };
  try {
    const r = fn();
    if (r instanceof Promise) pending.push(r.then(() => done(true), (e) => done(false, e)));
    else done(true);
  } catch (e) {
    done(false, e);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

const rs = typingRuleset(TYPING_VERSION)!;
const cfg = (d: 'easy' | 'normal' | 'hard') => ({ rules: rs.difficulties[d], scoring: rs.scoring });
const typeAll = (s: ReturnType<typeof createState>, text: string, t0: number, d: 'easy' | 'normal' | 'hard' = 'easy', step = 100): number => {
  let t = t0;
  for (const ch of Array.from(text)) {
    typeChar(s, ch, t, cfg(d));
    t += step;
  }
  return t;
};
const fixture = MINI_TYP;

// ---- core typing ----
test('ruleset registry covers the current version and every difficulty', () => {
  ok(Object.keys(TYPING_RULESETS).includes(TYPING_VERSION), 'current version present');
  for (const d of TYPING_DIFFICULTIES) {
    const r = rs.difficulties[d];
    ok(r.minAccuracy > 0 && r.minAccuracy < r.goldAccuracy && r.wpm[0] < r.wpm[1], `${d} thresholds ordered`);
  }
  ok(rs.difficulties.easy.backspace && rs.difficulties.normal.backspace && !rs.difficulties.hard.backspace, 'hard has no backspace');
  ok(rs.difficulties.easy.wpm[1] < rs.difficulties.hard.wpm[1], 'harder needs more speed');
});

test('right characters mark ok, wrong ones bad, the next one is the cursor', () => {
  const s = createState('cat');
  typeAll(s, 'cx', 0);
  ok(markAt(s, 0) === 'ok' && markAt(s, 1) === 'bad' && markAt(s, 2) === 'cursor', 'marks');
  ok(errorCount(s) === 1 && s.wrongKeys === 1 && s.correctKeys === 1, 'counts');
  ok(!isComplete(s, rs.difficulties.easy), 'not complete');
});

test('first key starts the clock; WPM = matching chars / 5 per minute', () => {
  const s = createState('a'.repeat(50));
  ok(s.startMs === null && wpm(s, 5000, 5) === 0, 'no clock before the first key');
  typeAll(s, 'a'.repeat(50), 1000, 'easy', 240); // 50 chars, last key at 1000+49*240
  ok(s.startMs === 1000 && s.endMs === 1000 + 49 * 240, 'start and end');
  const w = wpm(s, 99999, 5);
  ok(Math.abs(w - (10 / (49 * 240 / 60000))) < 1e-9, `wpm ${w}`);
  ok(elapsedMs(s, 99999) === 49 * 240, 'frozen after completion');
});

test('a wrong key moves on, resets combo, and counts against accuracy even after the fix', () => {
  const s = createState('abcd');
  typeAll(s, 'ab', 0);
  ok(s.combo === 2, 'combo 2');
  typeChar(s, 'x', 300, cfg('easy'));
  ok(s.combo === 0 && s.maxCombo === 2 && s.typed.length === 3, 'combo reset, cursor moved');
  ok(eraseChar(s, rs.difficulties.easy) && s.typed.length === 2, 'backspace');
  typeAll(s, 'cd', 400);
  ok(isComplete(s, rs.difficulties.easy) && s.endMs !== null, 'complete after the fix');
  ok(Math.abs(accuracy(s) - 4 / 5) < 1e-9, 'accuracy counts the mistake: 4 of 5 keys');
  ok(s.wrongKeys === 1 && errorCount(s) === 0, 'no errors left on the line');
});

test('easy/normal must fix errors before finishing; extra keys at the end are ignored', () => {
  const s = createState('go');
  typeAll(s, 'gx', 0);
  ok(s.typed.length === 2 && s.endMs === null, 'full line with an error is not done');
  ok(typeChar(s, 'o', 200, cfg('normal')) === 'ignored', 'ignored past the end');
  eraseChar(s, rs.difficulties.normal);
  typeChar(s, 'o', 300, cfg('normal'));
  ok(s.endMs === 300 && correctChars(s) === 2, 'finished');
  ok(typeChar(s, 'z', 400, cfg('normal')) === 'ignored' && !eraseChar(s, rs.difficulties.normal), 'locked after the finish');
});

test('hard mode: no backspace, finishes at the last character even with errors', () => {
  const s = createState('ab');
  typeChar(s, 'x', 0, cfg('hard'));
  ok(!eraseChar(s, rs.difficulties.hard) && s.typed.length === 1, 'cannot erase');
  typeChar(s, 'b', 100, cfg('hard'));
  ok(s.endMs === 100 && errorCount(s) === 1, 'ends with one error left');
  const sum = summarize(s, 100, rs, rs.difficulties.hard);
  ok(sum.stars === 0 && sum.errors === 1, 'accuracy 50% earns no star');
});

test('score: 10 per key plus combo bonus capped at 20; mistakes do not subtract', () => {
  const s = createState('a'.repeat(25));
  typeAll(s, 'a'.repeat(25), 0);
  // keys 1..20 earn 10 + n, keys 21..25 earn 10 + 20
  const want = Array.from({ length: 25 }, (_, i) => 10 + Math.min(i + 1, 20)).reduce((a, b) => a + b, 0);
  ok(s.score === want && s.maxCombo === 25, `score ${s.score} want ${want}`);
  const bad = createState('ab');
  typeAll(bad, 'xb', 0);
  ok(bad.score === 10 + 1, 'wrong key scores nothing, next right key starts a new combo');
});

test('stars: accuracy floor, speed, gold accuracy', () => {
  const e = rs.difficulties.easy;
  ok(starsFor(0.79, 99, e) === 0, 'below floor');
  ok(starsFor(0.8, 1, e) === 1, 'floor only');
  ok(starsFor(0.85, 10, e) === 2, 'speed 2');
  ok(starsFor(0.85, 20, e) === 2, 'fast but not gold accurate');
  ok(starsFor(0.9, 20, e) === 3, 'three');
  ok(starsFor(0.96, 44, rs.difficulties.hard) === 2 && starsFor(0.98, 45, rs.difficulties.hard) === 3, 'hard thresholds');
});

test('Thai: code points count once; marks stay with their base character', () => {
  const text = 'ฉันชอบพิมพ์ดีดทุกวัน';
  const s = createState(text);
  ok(s.target.length === Array.from(text).length, 'code points');
  const cells = cellsOf(s.target);
  ok(cells.length < s.target.length, 'combining marks join their base character');
  ok(cells.every((c) => !/^\p{M}/u.test(c.text)), 'no cell starts with a mark');
  typeAll(s, 'ฉั', 0);
  ok(cellMark(s, cells[0]) === 'ok', 'first cell typed right (base + mark)');
  typeChar(s, 'x', 100, cfg('easy'));
  ok(cellMark(s, cells[1]) === 'bad', 'wrong code point marks its cell');
  const ws = wordsOf(cellsOf(createState('ab cd e').target));
  ok(ws.length === 3 && ws[0].map((c) => c.text).join('') === 'ab ' && ws[2].map((c) => c.text).join('') === 'e', 'words keep the trailing space');
});

test('built-in sets: four sets, cycling exercises, Thai set reads locale keys', () => {
  ok(SETS.map((s) => s.id).join() === 'home,words,sentences,thai', 'set ids');
  for (const set of SETS) {
    const n = exerciseCount(set);
    ok(n >= 3, `${set.id} has exercises`);
    const t = (k: string): string => `T:${k}`;
    for (let i = 0; i < n; i++) {
      const text = exerciseFor(set, i, t);
      ok(text.length > 5, 'non-empty');
      if (!set.textKeys) ok(/^[\x20-\x7e]+$/.test(text), `${set.id}[${i}] is plain typable ASCII`);
    }
    ok(exerciseFor(set, n, t) === exerciseFor(set, 0, t) && exerciseFor(set, -1, t) === exerciseFor(set, n - 1, t), 'cycles');
  }
  ok(exerciseFor(setById('thai'), 1, (k) => `T:${k}`) === 'T:thai.t2', 'thai from locale key');
  ok(setById('nope').id === 'home', 'unknown set falls back');
});

test('prefs: defaults, validation, plays counter', () => {
  const d = defaultPrefs();
  ok(d.difficulty === 'easy' && d.set === 'home' && d.source === TYPIST_SOURCES[0].id, 'defaults');
  ok(JSON.stringify(parsePrefs(null)) === JSON.stringify(d) && JSON.stringify(parsePrefs('{nope')) === JSON.stringify(d), 'bad input');
  const p = parsePrefs(JSON.stringify({ difficulty: 'hard', set: 'thai', source: 'sample', plays: { thai: 2, home: -1, x: 4 } }));
  ok(p.difficulty === 'hard' && p.set === 'thai' && p.source === 'sample' && p.plays.thai === 2 && p.plays.home === undefined, 'valid prefs kept, junk dropped');
  ok(parsePrefs(JSON.stringify({ difficulty: 'insane', set: 'zzz', source: 'zzz' })).set === 'home', 'unknown values fall back');
});

// ---- gtypist parser ----
test('tokenize: comments skipped, continuation lines attach, CRLF and BOM tolerated', () => {
  const cmds = tokenize('\uFEFF# c\r\nS:one\r\n :two\r\n\r\nD:x\r\n');
  ok(cmds.length === 2 && cmds[0].cmd === 'S' && cmds[0].lines.join('|') === 'one|two' && cmds[1].cmd === 'D', 'tokens');
  ok(tokenize('# only a comment\n\n').length === 0, 'empty');
  ok(tokenize('*:LABEL')[0].arg === 'LABEL', 'label arg');
});

test('normalizeForTyping: typographic marks become keyboard characters', () => {
  ok(normalizeForTyping('It’s “fine” — really…') === 'It\'s "fine" - really...', 'quotes, dash, ellipsis');
  ok(normalizeForTyping('a  b\t c\u00a0d') === 'a b c d', 'white space collapses');
  ok(normalizeForTyping('  x  ') === 'x', 'trim');
});

test('parseTypist: fixture lessons, menu titles, drills, tutorial, flow commands skipped', () => {
  const r = parseTypist(fixture);
  ok(r.title === 'Mini Quotes Course', `course title ${r.title}`);
  ok(r.lessons.map((l) => l.id).join() === 'ONE,TWO', `empty lesson dropped: ${r.lessons.map((l) => l.id)}`);
  const [one, two] = r.lessons;
  ok(one.title === 'First lesson' && one.summary === 'Two short quotes', 'menu title and summary');
  ok(one.drills.length === 2 && one.drills[0].id === 'ONE_1' && one.drills[0].kind === 'speed', 'speed drills');
  ok(one.drills[0].instruction === '[1] Ada Example, a note', 'instruction kept');
  ok(one.drills[0].text === 'Programs should be small, and then they should be smaller still.', `text ${one.drills[0].text}`);
  ok(one.drills[1].text === 'It\'s "fine" - really... A tab here. Second paragraph after a blank line.', `normalized text ${one.drills[1].text}`);
  ok(two.intro === 'A tutorial paragraph split over two lines.', 'T: becomes intro, not a drill');
  ok(two.drills.map((d) => d.kind).join() === 'drill,drill', 'D: and d: are drills');
  ok(two.drills[0].text === 'asdf jkl; fjdk slaj', 'drill continuation joined');
  ok(two.drills.every((d) => d.text.length > 0), 'empty D: skipped');
  ok(r.warnings.some((w) => w.includes('"Z:"')) && r.warnings.some((w) => w.includes('empty D:')), `warnings: ${r.warnings.join(' / ')}`);
  ok(!r.warnings.some((w) => /"[GYNQKEX]:"/.test(w)), 'flow commands skipped silently');
});

test('parseTypist: no menu → banners open lessons; drills before any lesson get a default one', () => {
  const r = parseTypist('B:Alpha\nS:first text\nB:Beta\nI:hint\nD:second text\n');
  ok(r.lessons.length === 2 && r.lessons[0].title === 'Alpha' && r.lessons[1].drills[0].instruction === 'hint', 'banner lessons');
  const bare = parseTypist('S:just a speed test\n');
  ok(bare.lessons.length === 1 && bare.lessons[0].drills[0].text === 'just a speed test', 'default lesson');
  ok(parseTypist('').lessons.length === 0 && parseTypist('# nothing\n').lessons.length === 0, 'empty files');
});

test('parseTypist: drill ids are unique and safe for best-score keys', () => {
  const r = parseTypist('*:A B:C\nS:one\nS:two\n*:A B:C\nS:three\n');
  const ids = r.lessons.flatMap((l) => l.drills.map((d) => d.id));
  ok(new Set(ids).size === ids.length && ids.length === 3, `unique ${ids}`);
  ok(ids.every((id) => /^[A-Za-z0-9_-]+$/.test(id)), `safe ${ids}`);
});

test('bundled sample parses into two lessons with both drill kinds and an intro', () => {
  const r = parseTypist(SAMPLE_TYP);
  ok(r.lessons.length === 2 && r.title === 'Sample course', 'two lessons');
  ok(r.lessons[0].intro.length > 20 && r.lessons.flatMap((l) => l.drills).some((d) => d.kind === 'drill') && r.lessons.flatMap((l) => l.drills).some((d) => d.kind === 'speed'), 'kinds and intro');
  ok(r.lessons.flatMap((l) => l.drills).every((d) => /^[\x20-\x7e]+$/.test(d.text)), 'typable text');
  ok(r.warnings.length === 0, `no warnings: ${r.warnings}`);
});

// ---- adapters ----
test('source registry: online quotes source points at the raw .typ URL; sample is bundled', () => {
  ok(TYPIST_QUOTES_URL === 'https://raw.githubusercontent.com/rawitat/gtypist_lessons/main/programming_quotes.typ', 'url');
  ok(TYPIST_SOURCES[0] === quotesSource && quotesSource.kind === 'online' && quotesSource.origin === TYPIST_QUOTES_URL, 'quotes source');
  ok(TYPIST_SOURCES.some((s) => s.id === 'sample' && s.kind === 'bundled'), 'sample source');
  ok(new Set(TYPIST_SOURCES.map((s) => s.id)).size === TYPIST_SOURCES.length, 'unique ids');
});

test('URL adapter: loads and parses, caches a success, reports failures as SourceError', async () => {
  let calls = 0;
  const good = createTypUrlSource({ id: 't', title: 'T', url: 'https://example.test/a.typ', fetchImpl: async (url) => { calls++; ok(url === 'https://example.test/a.typ', 'url passed'); return { ok: true, status: 200, text: async () => fixture }; } });
  const a = await good.load();
  const b = await good.load();
  ok(a.length === 2 && a === b && calls === 1, 'cached after the first success');

  const http = createTypUrlSource({ id: 'h', title: 'H', url: 'x', fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }) });
  const e1 = await http.load().then(() => null, (e: unknown) => e);
  ok(e1 instanceof SourceError && e1.reason === 'http', 'http error');

  const net = createTypUrlSource({ id: 'n', title: 'N', url: 'x', fetchImpl: async () => { throw new Error('offline'); } });
  const e2 = await net.load().then(() => null, (e: unknown) => e);
  ok(e2 instanceof SourceError && e2.reason === 'network', 'network error');

  const empty = createTypUrlSource({ id: 'e', title: 'E', url: 'x', fetchImpl: async () => ({ ok: true, status: 200, text: async () => '# nothing here\n' }) });
  const e3 = await empty.load().then(() => null, (e: unknown) => e);
  ok(e3 instanceof SourceError && e3.reason === 'empty', 'empty file');

  let n = 0;
  const flaky = createTypUrlSource({ id: 'f', title: 'F', url: 'x', fetchImpl: async () => (++n === 1 ? { ok: false, status: 500, text: async () => '' } : { ok: true, status: 200, text: async () => fixture }) });
  await flaky.load().catch(() => undefined);
  ok((await flaky.load()).length === 2, 'failure is not cached, retry works');
});

test('text adapter loads a bundled string', async () => {
  const src = createTypTextSource({ id: 'b', title: 'B', origin: 'bundled', text: fixture });
  ok((await src.load()).length === 2 && src.kind === 'bundled', 'bundled load');
});

test('real course file (optional): every drill is typable text', async () => {
  const file = process.env.TYPIST_REAL_FILE;
  if (!file) return;
  const mod: string = 'node:fs';
  const fs = (await import(mod)) as { readFileSync(path: string, enc: string): string };
  const r = parseTypist(fs.readFileSync(file, 'utf8'));
  const drills = r.lessons.flatMap((l) => l.drills);
  console.log(`  real file: ${r.lessons.length} lessons, ${drills.length} drills, ${r.warnings.length} warnings`);
  ok(r.lessons.length >= 20 && drills.length >= 700, 'lesson and drill counts');
  ok(r.title.length > 0 && r.lessons[0].title.length > 0 && r.lessons[0].summary.length > 0, 'titles');
  ok(drills.every((d) => d.text.length > 0 && !/[\r\n\t]/.test(d.text) && !/  /.test(d.text)), 'normalized one-line text');
  ok(drills.every((d) => /^[\x20-\x7e]+$/.test(d.text)), 'all text is plain ASCII after normalization');
  ok(new Set(drills.map((d) => d.id)).size === drills.length, 'unique ids');
  ok(r.warnings.length === 0, `warnings: ${r.warnings.slice(0, 3)}`);
});


// ---- quote cards ----
test('authorFromInstruction: strip index, split name and work', () => {
  const a = authorFromInstruction('[14] Donald E. Knuth, "Selected Papers on Computer Science"');
  ok(!!a && a.author === 'Donald E. Knuth' && a.work.includes('Selected Papers'), JSON.stringify(a));
  ok(authorFromInstruction('[10] Linus Torvalds')?.author === 'Linus Torvalds', 'plain name');
  ok(authorFromInstruction('[3] Olin Shivers')?.author === 'Olin Shivers', 'olin');
  ok(authorFromInstruction('Home row') === null, 'hint is not a name');
  ok(authorFromInstruction('[1] Keep names clear') === null, 'imperative title is not a name');
});

test('looksLikePersonName accepts initials and particles', () => {
  ok(looksLikePersonName('C.A.R Hoare') && looksLikePersonName('Frederick P. Brooks Jr.') && looksLikePersonName('Abelson & Sussman'), 'names');
  ok(!looksLikePersonName('Read the error message first'), 'sentence');
});

test('buildQuoteCard wraps the quote in ASCII quotes and appends a typable author line; every shown character is in text', () => {
  const c = buildQuoteCard({ text: 'Talk is cheap.  Show me the code.', instruction: '[10] Linus Torvalds' })!;
  ok(c.author === 'Linus Torvalds' && c.quote === '"Talk is cheap. Show me the code."', c.quote);
  ok(c.authorLine === '- Linus Torvalds', c.authorLine);
  ok(c.text === '"Talk is cheap. Show me the code." - Linus Torvalds', c.text);
  ok(c.text.slice(c.authorFrom) === '- Linus Torvalds', 'authorFrom');
  ok(c.text === `${c.quote} ${c.authorLine}`, 'text is quote, space, author line');
  const already = buildQuoteCard({ text: '"Hello."', instruction: 'Ada' })!;
  ok(already.quote === '"Hello."' && already.text === '"Hello." - Ada', already.text);
  const trailing = buildQuoteCard({ text: 'Hello world -- Jane Doe' })!;
  ok(trailing.author === 'Jane Doe' && trailing.quote === '"Hello world"', trailing.quote);
  ok(buildQuoteCard({ text: 'asdf jkl;', instruction: 'Home row' }) === null, 'no card for drills without an author');
});

test('wrapQuote is ASCII-only and does not double-wrap', () => {
  ok(wrapQuote('Hello') === '"Hello"', 'adds quotes');
  ok(wrapQuote('"already"') === '"already"', 'no double wrap');
});

test('portrait catalog: three preview authors resolve; unknown names fall back', () => {
  const linus = findPortrait('Linus Torvalds');
  const knuth = findPortrait('Donald E. Knuth');
  const bjarne = findPortrait('Bjarne Stroustrup');
  ok(!!linus && linus.license.startsWith('CC BY') && linus.file.endsWith('linus-torvalds.webp'), JSON.stringify(linus));
  ok(!!knuth && knuth.author === 'Donald Knuth' && knuth.license.startsWith('CC BY'), 'alias Donald E. Knuth');
  ok(!!bjarne && bjarne.artist === 'ICPCNews' && bjarne.file.endsWith('.webp'), 'stroustrup');
  ok(findPortrait('A Completely Unknown Person') === null && initialsOf('Linus Torvalds') === 'LT', 'fallback initials');
});

test('portrait catalog: aliases, webp-only stills, and free licenses only', () => {
  ok(portraitCatalog.length >= 100, `catalog size ${portraitCatalog.length}`);
  const licenseOk = /^(CC BY(?!-NC)(?!-ND)|CC-BY|CC0|CC Zero|Public domain|PDM)/i;
  const licenseBad = /fair\s*use|[-\s]nc(?:[-\s]|$)|[-\s]nd(?:[-\s]|$)|noncommercial|gfdl/i;
  for (const row of portraitCatalog) {
    ok(row.file.endsWith('.webp') && row.file.startsWith('/img/typing/portraits/'), row.file);
    ok(licenseOk.test(row.license) && !licenseBad.test(row.license), `${row.author} license ${row.license}`);
  }
  ok(findPortrait('G. van Rossum')?.author === 'Guido van Rossum', 'Guido alias');
  ok(findPortrait('C.A.R Hoare')?.author === 'Tony Hoare', 'Hoare typo/initials');
  ok(findPortrait('Yoggi Berra')?.author === 'Yogi Berra', 'Berra typo');
  ok(findPortrait('Ken Thompson')?.qid === 'Q1107006', 'Unix Ken Thompson pin');
  ok(findPortrait('Anonymous') === null, 'skipped names stay silhouettes');
});

await Promise.all(pending);
console.log(`typing: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
