<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { version } from '../../../package.json';
  import { bestKey, gameCopy, readBest, recordBestScore, reportWin, WinResultDialog, type WinResult } from '../minigame-core';
  import { PianoAudio } from './audio';
  import { accuracy, buildChart, createRun, isFinished, press, starsFor, sweep, type Run } from './engine';
  import { isPianoCode, labelForMidi, midiForCode, SHIFT_DOWN_CODES, SHIFT_UP_CODES } from './keymap';
  import { buildKeys, clampOctave, noteName, octaveStart, type KeyDef } from './notes';
  import manifest from './module.json';
  import { PIANO_DIFFICULTIES, pianoRuleset, type PianoDifficulty } from './ruleset';
  import { SONGS, songById, type SongId } from './songs';
  import { readPrefs, writePrefs } from './prefs';
  import type { PianoPrefs } from './store.ts';

  let { onExit }: { onExit: () => void } = $props();
  const c = gameCopy('piano');
  const rules = pianoRuleset(manifest.version)!;
  const audio = new PianoAudio();

  /** Songs sit on this octave's scale (C4..C5). */
  const SONG_OCTAVE = 4;
  const finePointer = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

  let prefs = $state<PianoPrefs>(readPrefs());
  let screen = $state<'menu' | 'song' | 'free'>('menu');
  let phase = $state<'play' | 'paused' | 'done'>('play');
  /** Octaves shown in free play (song mode always shows one). Desktop starts with two. */
  let freeSpan = $state<1 | 2>(finePointer ? 2 : 1);
  let labels = $state(finePointer);
  let kbUsed = $state(false);

  const span = $derived(screen === 'song' ? 1 : freeSpan);
  const octave = $derived(screen === 'song' ? SONG_OCTAVE : clampOctave(prefs.octave, span));
  const viewStart = $derived(octaveStart(octave));
  const layout = $derived(buildKeys(viewStart, span));
  const whites = $derived(layout.keys.filter((k) => !k.black));
  const blacks = $derived(layout.keys.filter((k) => k.black));
  const rangeLabel = $derived(`${noteName(viewStart)}–${noteName(viewStart + 12 * span)}`);
  const timing = $derived(rules.difficulties[prefs.difficulty]);
  const song = $derived(songById(prefs.song));

  let pressed = $state<Record<number, number>>({});
  let held = new Map<string, number>();
  let tick = $state(0);
  let score = $state(0);
  let combo = $state(0);
  let msg = $state('');
  let msgKind = $state('');
  let msgTimer = 0;
  let wrongMidi = $state(-1);
  let fallH = $state(240);
  let winResult = $state<WinResult | null>(null);

  let run = null as Run | null;
  let startAt = 0;
  let pausedTotal = 0;
  let pauseStart = 0;
  let raf = 0;
  let doneTimer = 0;
  let finishing = false;

  const songTime = (): number => (phase === 'paused' ? pauseStart : performance.now()) - startAt - pausedTotal;

  function flash(kind: string, text: string): void {
    window.clearTimeout(msgTimer);
    msg = text;
    msgKind = kind;
    msgTimer = window.setTimeout(() => (msg = ''), 650);
  }

  function noteDown(id: string, midi: number): void {
    if (held.has(id)) return;
    held.set(id, midi);
    pressed = { ...pressed, [midi]: (pressed[midi] ?? 0) + 1 };
    audio.noteOn(id, midi);
    if (screen === 'song' && phase === 'play' && run) {
      const res = press(run, midi, songTime(), timing, rules.scoring);
      if (res.kind === 'perfect' || res.kind === 'good') {
        flash(res.kind, c(res.kind));
      } else if (res.kind === 'wrong') {
        flash('wrong', c('wrong'));
        wrongMidi = midi;
        window.setTimeout(() => (wrongMidi = -1), 220);
      }
      score = Math.round(run.score);
      combo = run.combo;
    }
  }

  function noteUp(id: string): void {
    const midi = held.get(id);
    if (midi === undefined) return;
    held.delete(id);
    const left = (pressed[midi] ?? 1) - 1;
    const next = { ...pressed };
    if (left <= 0) delete next[midi];
    else next[midi] = left;
    pressed = next;
    audio.release(id);
  }

  function releaseAll(): void {
    for (const id of [...held.keys()]) noteUp(id);
    audio.releaseAll();
  }

  function shiftOctave(delta: number): void {
    if (screen !== 'free') return;
    const next = clampOctave(prefs.octave + delta, span);
    if (next === octave) return;
    prefs = { ...prefs, octave: next };
    writePrefs(prefs);
  }

  function setSpan(next: 1 | 2): void {
    freeSpan = next;
    prefs = { ...prefs, octave: clampOctave(prefs.octave, next) };
  }

  function toggleMute(): void {
    prefs = { ...prefs, muted: !prefs.muted };
    audio.setMuted(prefs.muted);
    writePrefs(prefs);
  }

  function pickSong(id: SongId): void {
    prefs = { ...prefs, song: id };
    writePrefs(prefs);
  }
  function pickDifficulty(d: PianoDifficulty): void {
    prefs = { ...prefs, difficulty: d };
    writePrefs(prefs);
  }

  function startSong(): void {
    releaseAll();
    window.clearTimeout(doneTimer);
    winResult = null;
    screen = 'song';
    phase = 'play';
    finishing = false;
    const chart = buildChart(song, timing, rules.leadInBeats, octaveStart(SONG_OCTAVE));
    run = createRun(chart);
    score = 0;
    combo = 0;
    msg = '';
    startAt = performance.now();
    pausedTotal = 0;
    pauseStart = 0;
  }

  function startFree(): void {
    releaseAll();
    window.clearTimeout(doneTimer);
    winResult = null;
    run = null;
    screen = 'free';
    phase = 'play';
    msg = '';
  }

  function toMenu(): void {
    releaseAll();
    window.clearTimeout(doneTimer);
    winResult = null;
    run = null;
    screen = 'menu';
  }

  function togglePause(): void {
    if (screen !== 'song') return;
    if (phase === 'play') {
      phase = 'paused';
      pauseStart = performance.now();
      releaseAll();
    } else if (phase === 'paused') {
      pausedTotal += performance.now() - pauseStart;
      phase = 'play';
    }
  }

  function finishSong(): void {
    if (!run || phase === 'done') return;
    phase = 'done';
    const stars = starsFor(accuracy(run, rules.scoring), rules.stars);
    const finalScore = Math.round(run.score);
    const game = `piano-${song.id}`;
    const key = bestKey(game, prefs.difficulty);
    const timeMs = Math.round(run.chart.endMs);
    const rec = recordBestScore(key, finalScore, stars, timeMs);
    if (stars >= 1) reportWin('piano');
    winResult = {
      game,
      gameLabel: `${c('title')} · ${c(`song.${song.id}`)}`,
      difficulty: c(`diff.${prefs.difficulty}`),
      stars,
      timeMs,
      bestMs: rec.current.timeMs,
      previousBestMs: rec.previous?.timeMs ?? null,
      isNewRecord: rec.isNewRecord,
      metric: 'score',
      score: finalScore,
      bestScore: rec.current.score ?? finalScore,
      previousBestScore: rec.previous?.score ?? null,
      subtitle: stars === 0 ? c('result.retry') : undefined,
      detail: c('result.detail', { p: run.perfect, g: run.good, m: run.miss, c: run.maxCombo }),
    };
  }

  function frame(): void {
    raf = requestAnimationFrame(frame);
    if (screen !== 'song' || !run || phase !== 'play') return;
    const t = songTime();
    if (sweep(run, t, timing) > 0) {
      flash('miss', c('miss'));
      combo = run.combo;
    }
    tick = (tick + 1) % 1_000_000;
    if (isFinished(run) && !finishing) {
      finishing = true;
      doneTimer = window.setTimeout(finishSong, 450);
    }
  }

  function isEditable(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (screen === 'menu' || isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!isPianoCode(e.code)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (SHIFT_UP_CODES.includes(e.code)) return shiftOctave(1);
    if (SHIFT_DOWN_CODES.includes(e.code)) return shiftOctave(-1);
    if (phase === 'paused') return;
    if (!kbUsed) {
      kbUsed = true;
      labels = true;
      if (screen === 'free' && freeSpan === 1) setSpan(2);
    }
    const midi = midiForCode(e.code, viewStart);
    if (midi !== null) noteDown(`kb:${e.code}`, midi);
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (isPianoCode(e.code)) noteUp(`kb:${e.code}`);
  }
  function onHide(): void {
    if (document.hidden) {
      if (screen === 'song' && phase === 'play') togglePause();
      else releaseAll();
    }
  }

  onMount(() => {
    audio.setMuted(prefs.muted);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', onHide);
    // Orientation lock only works in fullscreen or an installed app; the portrait layout rotates instead.
    const orient = (window.screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
    try {
      void orient?.lock?.('landscape')?.catch(() => undefined);
    } catch {
      // Not supported here.
    }
    raf = requestAnimationFrame(frame);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    window.clearTimeout(msgTimer);
    window.clearTimeout(doneTimer);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseAll);
    document.removeEventListener('visibilitychange', onHide);
    audio.dispose();
  });

  const keyByMidi = $derived(new Map(layout.keys.map((k) => [k.midi, k] as const)));

  /** Falling notes currently on screen: `bottom` px from the top of the lane area, `h` px tall. */
  const falling = $derived.by(() => {
    void tick;
    if (screen !== 'song' || !run) return [];
    const t = songTime();
    const out: { id: number; left: number; width: number; y: number; h: number; status: string; name: string }[] = [];
    for (const note of run.chart.notes) {
      const status = run.status[note.id];
      if (status === 'perfect' || status === 'good') continue;
      const key = keyByMidi.get(note.midi);
      if (!key) continue;
      const bottom = ((t - (note.at - timing.fallMs)) / timing.fallMs) * fallH;
      const h = Math.max(30, ((note.beats * timing.beatMs) / timing.fallMs) * fallH * 0.9);
      if (bottom < 0 || bottom - h > fallH) continue;
      const width = (100 / layout.whites) * 0.86;
      out.push({ id: note.id, left: key.center - width / 2, width, y: bottom - h, h, status: status ?? 'wait', name: noteName(note.midi).replace(/\d/, '') });
    }
    return out;
  });

  const progress = $derived.by(() => {
    void tick;
    if (screen !== 'song' || !run) return 0;
    return Math.min(100, Math.max(0, (songTime() / run.chart.endMs) * 100));
  });
  const progressPct = $derived(Math.round(progress));

  const heldNames = $derived(Object.keys(pressed).map((m) => noteName(Number(m))).join(' '));

  function bestStars(id: SongId): number {
    return readBest(bestKey(`piano-${id}`, prefs.difficulty))?.stars ?? 0;
  }

  function keyLabel(k: KeyDef): string | null {
    return labels ? labelForMidi(k.midi, viewStart) : null;
  }
  const showNames = $derived(screen === 'song' && timing.names);

  function down(e: PointerEvent, k: KeyDef): void {
    e.preventDefault();
    noteDown(`p${e.pointerId}`, k.midi);
  }
  function up(e: PointerEvent): void {
    noteUp(`p${e.pointerId}`);
  }
</script>

<div class="pn" data-testid="piano" data-screen={screen} data-phase={phase} data-difficulty={prefs.difficulty} data-song={prefs.song} data-span={span} data-octave={octave} data-labels={labels ? 'on' : 'off'} data-version={manifest.version}>
  <header class="top">
    <button type="button" class="ib" data-testid="piano-exit" aria-label={screen === 'menu' ? c('exit') : c('back')} onclick={screen === 'menu' ? onExit : toMenu}>←</button>
    <div class="ttl">
      <h1>🎹 {c('title')}</h1>
      <span class="ver">v{version} · piano@{manifest.version}</span>
    </div>
    {#if screen === 'song'}
      <div class="stat" aria-live="off"><span>{c('score')} <b data-testid="piano-score">{score}</b></span><span>{c('combo')} <b data-testid="piano-combo">x{combo}</b></span></div>
    {/if}
    <div class="tools">
      {#if screen === 'free'}
        <div class="oct" role="group" aria-label={c('range', { range: rangeLabel })}>
          <button type="button" class="ib" data-testid="piano-oct-down" aria-label={c('octaveDown')} disabled={octave <= clampOctave(0, span)} onclick={() => shiftOctave(-1)}>◀</button>
          <b class="rng" data-testid="piano-range">{rangeLabel}</b>
          <button type="button" class="ib" data-testid="piano-oct-up" aria-label={c('octaveUp')} disabled={octave >= clampOctave(99, span)} onclick={() => shiftOctave(1)}>▶</button>
        </div>
        <button type="button" class="ib txt" data-testid="piano-span" aria-label={freeSpan === 1 ? c('spanTwo') : c('spanOne')} onclick={() => setSpan(freeSpan === 1 ? 2 : 1)}>{freeSpan === 1 ? '1×' : '2×'}</button>
      {/if}
      {#if screen !== 'menu'}
        <button type="button" class="ib txt" class:on={labels} data-testid="piano-labels" aria-pressed={labels} aria-label={labels ? c('labelsOn') : c('labelsOff')} onclick={() => (labels = !labels)}>⌨</button>
      {/if}
      {#if screen === 'song'}
        <button type="button" class="ib" data-testid="piano-pause" aria-label={phase === 'paused' ? c('resume') : c('pause')} onclick={togglePause}>{phase === 'paused' ? '▶' : '⏸'}</button>
      {/if}
      <button type="button" class="ib" data-testid="piano-mute" aria-pressed={prefs.muted} aria-label={prefs.muted ? c('unmute') : c('mute')} onclick={toggleMute}>{prefs.muted ? '🔇' : '🔊'}</button>
    </div>
  </header>
  <p class="rot" data-testid="piano-rotate">{c('rotate')}</p>

  {#if screen === 'menu'}
    <main class="menu">
      <section class="col" aria-label={c('menu.songs')}>
        <h2>{c('menu.songs')}</h2>
        <div class="songs" role="radiogroup" aria-label={c('menu.songs')}>
          {#each SONGS as s (s.id)}
            {@const st = bestStars(s.id)}
            <button type="button" role="radio" aria-checked={prefs.song === s.id} class="song" class:on={prefs.song === s.id} data-song={s.id} onclick={() => pickSong(s.id)}>
              <span>{c(`song.${s.id}`)}</span><i aria-label="stars">{'★'.repeat(st)}{'☆'.repeat(3 - st)}</i>
            </button>
          {/each}
        </div>
      </section>
      <section class="col side">
        <h2>{c('menu.level')}</h2>
        <div class="diffs" role="radiogroup" aria-label={c('menu.level')}>
          {#each PIANO_DIFFICULTIES as d (d)}
            <button type="button" role="radio" aria-checked={prefs.difficulty === d} class="diff" class:on={prefs.difficulty === d} data-diff={d} onclick={() => pickDifficulty(d)}>{c(`diff.${d}`)}</button>
          {/each}
        </div>
        <button type="button" class="primary" data-testid="piano-start" onclick={startSong}>{c('menu.play')}</button>
        <button type="button" class="ghost" data-testid="piano-free" onclick={startFree}>{c('menu.free')}</button>
        <p class="how">{c('howto.touch')}</p>
        <p class="how keys">{c('howto.keys')}</p>
      </section>
    </main>
  {:else}
    <div class="fall" bind:clientHeight={fallH} data-testid="piano-fall">
      {#if screen === 'song'}
        <div class="prog"><i style="width:{progress}%"></i></div>
        {#each falling as n (n.id)}
          <div class="note {n.status}" data-note={n.id} style="left:{n.left}%;width:{n.width}%;height:{n.h}px;transform:translateY({n.y}px)">{showNames ? n.name : ''}</div>
        {/each}
        <div class="hitline"></div>
        <div class="msg {msgKind}" data-testid="piano-judgement" data-judgement={msg ? msgKind : ''} role="status">{msg || '\u00a0'}</div>
        {#if phase === 'paused'}<div class="paused">⏸ {c('pause')}</div>{/if}
        <span class="sr" data-testid="piano-progress" data-pct={progressPct}></span>
      {:else}
        <div class="freehint">
          <p>{c('free.hint')}</p>
          <p class="held" data-testid="piano-held">{heldNames || '\u00a0'}</p>
          <p class="how keys">{c('howto.keys')}</p>
        </div>
      {/if}
    </div>
    <div class="kbd" role="group" aria-label={c('keysAria')} data-testid="piano-keys" style="--whites:{layout.whites}">
      {#each whites as k (k.midi)}
        {@const lab = keyLabel(k)}
        <button type="button" class="key white" class:down={!!pressed[k.midi]} class:bad={wrongMidi === k.midi} data-midi={k.midi} data-note={k.name} style="left:{k.left}%;width:{k.width}%" aria-label={k.name} onpointerdown={(e) => down(e, k)} onpointerup={up} onpointercancel={up} onpointerleave={up} oncontextmenu={(e) => e.preventDefault()}>
          {#if showNames || k.name.startsWith('C')}<small class="nm">{showNames ? k.name.replace(/\d/, '') : k.name}</small>{/if}
          {#if lab}<b class="lb">{lab}</b>{/if}
        </button>
      {/each}
      {#each blacks as k (k.midi)}
        {@const lab = keyLabel(k)}
        <button type="button" class="key black" class:down={!!pressed[k.midi]} class:bad={wrongMidi === k.midi} data-midi={k.midi} data-note={k.name} style="left:{k.left}%;width:{k.width}%" aria-label={k.name} onpointerdown={(e) => down(e, k)} onpointerup={up} onpointercancel={up} onpointerleave={up} oncontextmenu={(e) => e.preventDefault()}>
          {#if lab}<b class="lb">{lab}</b>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if winResult}
  <WinResultDialog result={winResult} onReplay={startSong} onClose={toMenu} />
{/if}

<style>
  .pn {
    position: fixed;
    inset: 0;
    z-index: 9;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: calc(6px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
    box-sizing: border-box;
    background: radial-gradient(120% 120% at 50% 0%, #2a1a3a 0%, #120c1c 70%);
    color: #f4ecff;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  /* Portrait phones: lay the game out sideways instead of squeezing the keys. */
  @media (orientation: portrait) {
    .pn {
      inset: auto;
      top: 0;
      left: 100vw;
      width: 100dvh;
      height: 100vw;
      transform-origin: top left;
      transform: rotate(90deg);
    }
    .rot { display: block !important; }
  }
  .rot { display: none; margin: 0; text-align: center; font-size: 12px; opacity: 0.8; position: absolute; top: 4px; left: 0; right: 0; pointer-events: none; }
  .top { display: flex; align-items: center; gap: 8px; flex: none; min-height: 42px; }
  .ttl { min-width: 0; display: flex; flex-direction: column; }
  .ttl h1 { margin: 0; font-size: 16px; line-height: 1.1; white-space: nowrap; }
  .ver { font-size: 10px; opacity: 0.65; white-space: nowrap; }
  .stat { display: flex; gap: 14px; margin-left: 6px; font-weight: 800; font-size: 14px; }
  .stat b { font-variant-numeric: tabular-nums; color: #ffd34d; }
  .tools { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .oct { display: flex; align-items: center; gap: 4px; }
  .rng { min-width: 74px; text-align: center; font-size: 14px; font-variant-numeric: tabular-nums; }
  .ib {
    min-width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 2px solid #b78cff;
    background: rgba(40, 22, 66, 0.9);
    color: #fff;
    font-size: 16px;
    font-weight: 800;
    padding: 0 6px;
  }
  .ib.on { background: #b78cff; color: #1c0f30; }
  .ib:disabled { opacity: 0.35; }
  .menu { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.25fr 1fr; gap: 14px; overflow: auto; align-items: start; touch-action: pan-y; }
  .col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .col h2 { margin: 0; font-size: 13px; opacity: 0.8; font-weight: 700; }
  .songs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .song { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-height: 60px; padding: 8px 10px; border-radius: 12px; border: 2px solid #4a3470; background: rgba(40, 22, 66, 0.7); color: #fff; font-weight: 700; font-size: 14px; text-align: left; }
  .song i { font-style: normal; color: #ffd34d; letter-spacing: 2px; }
  .song.on { border-color: #ffd34d; background: rgba(90, 60, 130, 0.85); }
  .diffs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .diff { height: 40px; border-radius: 10px; border: 2px solid #4a3470; background: rgba(40, 22, 66, 0.7); color: #fff; font-weight: 800; }
  .diff.on { border-color: #ffd34d; background: #ffd34d; color: #2a1a00; }
  .primary { height: 48px; border: 0; border-radius: 12px; background: #ffd34d; color: #2a1a00; font-weight: 800; font-size: 17px; }
  .ghost { height: 42px; border-radius: 12px; border: 2px solid #b78cff; background: transparent; color: #fff; font-weight: 700; font-size: 15px; }
  .how { margin: 0; font-size: 12px; line-height: 1.35; opacity: 0.8; }
  .fall { position: relative; flex: 1; min-height: 0; border-radius: 12px; background: linear-gradient(#1a1128, #241838); overflow: hidden; border: 1px solid #3a2a58; }
  .prog { position: absolute; left: 0; right: 0; top: 0; height: 4px; background: rgba(255, 255, 255, 0.12); }
  .prog i { display: block; height: 100%; background: #ffd34d; }
  .note { position: absolute; top: 0; border-radius: 8px; background: linear-gradient(#ffd34d, #ff9f4d); color: #2a1a00; font-weight: 800; font-size: 13px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 3px; box-sizing: border-box; border: 2px solid rgba(255, 255, 255, 0.55); will-change: transform; }
  .note.miss { background: #55455f; color: #bbb; border-color: transparent; opacity: 0.6; }
  .hitline { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: #39e0ff; box-shadow: 0 0 10px #39e0ff; }
  .msg { position: absolute; left: 0; right: 0; top: 14px; text-align: center; font-size: 22px; font-weight: 900; pointer-events: none; }
  .msg.perfect { color: #ffd34d; }
  .msg.good { color: #7dffb3; }
  .msg.miss, .msg.wrong { color: #ff7d8f; }
  .paused { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0, 0, 0, 0.55); font-size: 22px; font-weight: 800; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; }
  .freehint { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 6px; padding: 8px 18px; text-align: center; }
  .freehint p { margin: 0; font-size: 13px; opacity: 0.85; }
  .held { font-size: 26px !important; font-weight: 900; color: #ffd34d; min-height: 34px; opacity: 1 !important; }
  .kbd { position: relative; flex: none; height: clamp(120px, 42%, 300px); border-radius: 10px; touch-action: none; }
  .key { position: absolute; top: 0; margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; touch-action: none; transition: background 60ms linear, transform 60ms linear; }
  .key.white { height: 100%; background: linear-gradient(#fdfdfd, #e6e0f0); border: 1px solid #8d7fa8; border-radius: 0 0 8px 8px; color: #2a1a3a; box-sizing: border-box; padding-bottom: 6px; z-index: 1; }
  .key.black { height: 62%; background: linear-gradient(#3a3a46, #0c0a12); border-radius: 0 0 6px 6px; color: #e8dcff; z-index: 2; padding-bottom: 6px; border: 1px solid #000; box-sizing: border-box; }
  .key.white.down { background: linear-gradient(#ffe9a3, #ffd34d); }
  .key.black.down { background: linear-gradient(#7a5cc4, #4a2f90); }
  .key.bad { background: #ff7d8f !important; }
  .key .nm { font-size: 11px; font-weight: 700; opacity: 0.7; }
  .key .lb { font-size: 14px; font-weight: 900; background: rgba(120, 90, 190, 0.18); border-radius: 6px; padding: 1px 6px; }
  .key.black .lb { background: rgba(255, 255, 255, 0.16); font-size: 12px; padding: 1px 4px; }
  @media (prefers-reduced-motion: reduce) {
    .key { transition: none; }
  }
</style>
