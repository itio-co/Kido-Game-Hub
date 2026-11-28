// Piano rules: pitch math, key layout, keyboard map, songs, chart, judging, scoring, prefs.
import { accuracy, buildChart, createRun, isFinished, maxScore, press, starsFor, sweep } from '../src/modules/piano/engine.ts';
import { labelForMidi, midiForCode, isPianoCode, LOWER_CODES, UPPER_CODES } from '../src/modules/piano/keymap.ts';
import { buildKeys, clampOctave, isBlack, midiFreq, noteName, octaveStart } from '../src/modules/piano/notes.ts';
import { PIANO_RULESETS, PIANO_VERSION, pianoRuleset } from '../src/modules/piano/ruleset.ts';
import { degreeSemitones, SONGS } from '../src/modules/piano/songs.ts';
import { parsePrefs } from '../src/modules/piano/store.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

const rules = pianoRuleset(PIANO_VERSION)!;
const C4 = octaveStart(4);

test('pitch math: A4 is 440 Hz, C4 is midi 60, names and black keys', () => {
  ok(octaveStart(4) === 60, 'C4 = 60');
  ok(Math.abs(midiFreq(69) - 440) < 1e-9, 'A4');
  ok(Math.abs(midiFreq(81) - 880) < 1e-9, 'A5');
  ok(noteName(60) === 'C4' && noteName(61) === 'C#4' && noteName(71) === 'B4' && noteName(84) === 'C6', 'names');
  ok(isBlack(61) && isBlack(70) && !isBlack(60) && !isBlack(64), 'black keys');
});

test('one-octave view has 8 white and 5 black keys; two octaves 15 and 10', () => {
  const one = buildKeys(C4, 1);
  ok(one.whites === 8 && one.keys.filter((k) => !k.black).length === 8 && one.keys.filter((k) => k.black).length === 5, 'one octave');
  const two = buildKeys(C4, 2);
  ok(two.whites === 15 && two.keys.filter((k) => k.black).length === 10, 'two octaves');
  ok(one.keys[0].midi === 60 && one.keys[one.keys.length - 1].midi === 72, 'range C4..C5');
  const first = one.keys[0];
  ok(Math.abs(first.width - 12.5) < 1e-9, 'white width');
  const cs = one.keys.find((k) => k.midi === 61)!;
  ok(cs.black && cs.center > first.center && cs.center < one.keys[2].center, 'C# sits between C and D');
});

test('octave range is C3..C6', () => {
  ok(clampOctave(0, 1) === 3 && clampOctave(99, 1) === 5, 'one octave: C3..C6');
  ok(clampOctave(99, 2) === 4, 'two octaves top out at C6');
});

test('keyboard map: two rows, one octave each, I is the top C', () => {
  ok(LOWER_CODES.length === 12 && UPPER_CODES.length === 12, 'twelve each');
  ok(midiForCode('KeyZ', C4) === 60 && midiForCode('KeyS', C4) === 61 && midiForCode('KeyM', C4) === 71, 'lower row');
  ok(midiForCode('KeyQ', C4) === 72 && midiForCode('Digit2', C4) === 73 && midiForCode('KeyU', C4) === 83, 'upper row');
  ok(midiForCode('KeyI', C4) === 84, 'I');
  ok(midiForCode('KeyP', C4) === null && !isPianoCode('KeyP') && isPianoCode('ArrowUp') && isPianoCode('Comma'), 'unmapped');
  ok(isBlack(midiForCode('KeyG', C4)!) && isBlack(midiForCode('Digit5', C4)!), 'black key positions');
  ok(labelForMidi(60, C4) === 'Z' && labelForMidi(72, C4) === 'Q' && labelForMidi(84, C4) === 'I' && labelForMidi(85, C4) === null, 'labels');
  const seen = new Set([...LOWER_CODES, ...UPPER_CODES]);
  ok(seen.size === 24, 'no duplicate keys');
});

test('songs stay inside one octave and have no overlapping notes (one hand, no chords)', () => {
  ok(SONGS.length === 4, 'four songs');
  for (const song of SONGS) {
    ok(song.notes.length >= 20, `${song.id} is a real tune`);
    for (const [degree, beats] of song.notes) ok(Number.isInteger(degree) && degree >= 0 && degree <= 7 && beats > 0, `${song.id} note range`);
    const chart = buildChart(song, { beatMs: 600 }, 3, C4);
    const lo = Math.min(...chart.notes.map((n) => n.midi));
    const hi = Math.max(...chart.notes.map((n) => n.midi));
    ok(lo >= 60 && hi <= 72 && hi - lo <= 12, `${song.id} spans at most an octave`);
    ok(chart.notes.every((n) => !isBlack(n.midi)), `${song.id} uses white keys only`);
    for (let i = 1; i < chart.notes.length; i++) ok(chart.notes[i].at > chart.notes[i - 1].at, `${song.id} notes are in sequence`);
  }
  ok(degreeSemitones(0) === 0 && degreeSemitones(4) === 7 && degreeSemitones(7) === 12, 'major scale');
});

test('hard is quicker than easy and still leaves room between the closest notes', () => {
  for (const song of SONGS) {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const t = rules.difficulties[d];
      const chart = buildChart(song, t, rules.leadInBeats, C4);
      for (let i = 1; i < chart.notes.length; i++) ok(chart.notes[i].at - chart.notes[i - 1].at > t.goodMs, `${song.id}/${d} windows do not overlap`);
    }
  }
  ok(rules.difficulties.hard.beatMs < rules.difficulties.easy.beatMs && rules.difficulties.hard.goodMs < rules.difficulties.easy.goodMs, 'hard is tighter');
  ok(PIANO_RULESETS[PIANO_VERSION] !== undefined, 'current version has a ruleset');
});

const timing = rules.difficulties.normal;
const sc = rules.scoring;
function fresh() {
  return createRun(buildChart(SONGS[0], timing, rules.leadInBeats, C4));
}

test('a right key on time is perfect, a bit off is good, outside the window is a free stray', () => {
  const run = fresh();
  const first = run.chart.notes[0];
  ok(press(run, first.midi, first.at + 20, timing, sc).kind === 'perfect', 'perfect');
  ok(run.score === sc.perfect && run.combo === 1, 'score and combo');
  const second = run.chart.notes[1];
  ok(press(run, second.midi, second.at + timing.perfectMs + 30, timing, sc).kind === 'good', 'good');
  ok(run.combo === 2 && run.score === sc.perfect + sc.good + sc.comboBonus, 'combo bonus');
  const third = run.chart.notes[2];
  const stray = press(run, third.midi, third.at - timing.goodMs - 50, timing, sc);
  ok(stray.kind === 'stray' && run.combo === 2 && run.wrong === 0, 'early press is free');
});

test('a wrong key near a waiting note resets combo; a note cannot be hit twice', () => {
  const run = fresh();
  const n = run.chart.notes[0];
  press(run, n.midi, n.at, timing, sc);
  const m = run.chart.notes[1];
  const wrong = press(run, m.midi + 1, m.at, timing, sc);
  ok(wrong.kind === 'wrong' && run.combo === 0 && run.wrong === 1, 'wrong key');
  ok(press(run, n.midi, n.at, timing, sc).kind === 'stray', 'already hit');
});

test('notes past the good window become misses; the run finishes when all are judged', () => {
  const run = fresh();
  ok(sweep(run, 0, timing) === 0, 'nothing missed at the start');
  const last = run.chart.notes[run.chart.notes.length - 1];
  const missed = sweep(run, last.at + timing.goodMs + 1, timing);
  ok(missed === run.chart.notes.length && run.miss === missed && run.combo === 0, 'all missed');
  ok(isFinished(run), 'finished');
});

test('perfect run: accuracy 1, max score matches, three stars', () => {
  const run = fresh();
  for (const n of run.chart.notes) press(run, n.midi, n.at, timing, sc);
  ok(run.perfect === run.chart.notes.length && run.maxCombo === run.chart.notes.length, 'all perfect');
  ok(accuracy(run, sc) === 1 && run.score === maxScore(run.chart.notes.length, sc), 'full marks');
  ok(starsFor(1, rules.stars) === 3, 'three stars');
});

test('star thresholds', () => {
  ok(starsFor(0.49, rules.stars) === 0 && starsFor(0.5, rules.stars) === 1, 'one star at 50%');
  ok(starsFor(0.75, rules.stars) === 2 && starsFor(0.9, rules.stars) === 3, 'two and three');
  const run = fresh();
  run.perfect = 5;
  run.good = 5;
  ok(Math.abs(accuracy(run, sc) - (5 + 5 * sc.goodWeight) / run.chart.notes.length) < 1e-9, 'good counts partly');
});

test('chords: two keys down together both sound (two notes at the same time are separate hits)', () => {
  const run = createRun({ notes: [{ id: 0, at: 1000, midi: 60, beats: 1 }, { id: 1, at: 1000, midi: 64, beats: 1 }], endMs: 2000 });
  ok(press(run, 60, 1000, timing, sc).kind === 'perfect' && press(run, 64, 1000, timing, sc).kind === 'perfect', 'chord hits');
});

test('prefs parse safely and clamp', () => {
  ok(parsePrefs(null).octave === 4 && parsePrefs('nope').song === 'twinkle', 'defaults');
  const p = parsePrefs(JSON.stringify({ octave: 99, muted: true, difficulty: 'hard', song: 'mary' }));
  ok(p.octave === 5 && p.muted && p.difficulty === 'hard' && p.song === 'mary', 'valid values');
  ok(parsePrefs(JSON.stringify({ difficulty: 'x', song: 'y' })).difficulty === 'easy', 'bad values fall back');
});

console.log(`piano: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
