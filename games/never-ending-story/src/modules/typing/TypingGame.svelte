<script lang="ts">
  import { onDestroy, onMount, tick as nextTick } from 'svelte';
  import { version } from '../../../package.json';
  import { bestKey, gameCopy, readBests, recordBestScore, reportWin, WinResultDialog, type WinResult } from '../minigame-core';
  import { cellMark, cellsOf, createState, eraseChar, summarize, typeChar, wordsOf, wpm as liveWpm, accuracy as liveAccuracy, errorCount, type TypingState } from './engine';
  import { exerciseCount, exerciseFor, SETS, setById, type SetId } from './content';
  import manifest from './module.json';
  import { TYPING_DIFFICULTIES, typingRuleset, type TypingDifficulty } from './ruleset';
  import { readPrefs, writePrefs } from './prefs';
  import type { TypingPrefs } from './store';
  import { SourceError, sourceById, TYPIST_SOURCES, type Drill, type Lesson } from './sources';

  let { onExit }: { onExit: () => void } = $props();
  const c = gameCopy('typing');
  const rs = typingRuleset(manifest.version)!;

  type Screen = 'menu' | 'typist' | 'play';
  type Run = { game: string; label: string; instruction: string; text: string; back: 'menu' | 'typist' };

  let prefs = $state<TypingPrefs>(readPrefs());
  let screen = $state<Screen>('menu');
  let phase = $state<'play' | 'done'>('play');
  let st = $state<TypingState>(createState(''));
  let run = $state<Run | null>(null);
  let winResult = $state<WinResult | null>(null);
  let now = $state(performance.now());
  let focused = $state(false);
  let bests = $state(readBests());
  let inputEl = $state<HTMLInputElement | undefined>(undefined);
  let textEl = $state<HTMLDivElement | undefined>(undefined);
  let vv = $state<{ h: number; top: number } | null>(null);
  let timer = 0;

  const rules = $derived(rs.difficulties[prefs.difficulty]);
  const cells = $derived(cellsOf(st.target));
  const words = $derived(wordsOf(cells));
  const started = $derived(st.startMs !== null);
  const wpmNow = $derived(started ? Math.round(liveWpm(st, now, rs.wordChars)) : 0);
  const accNow = $derived(Math.round(liveAccuracy(st) * 100));
  const secondsNow = $derived(started ? Math.floor(((st.endMs ?? now) - (st.startMs ?? now)) / 1000) : 0);
  const errorsLeft = $derived(errorCount(st));
  const pct = $derived(st.target.length ? Math.round((st.typed.length / st.target.length) * 100) : 0);
  const fullLine = $derived(st.typed.length >= st.target.length && st.target.length > 0);
  const hint = $derived(
    !focused && phase === 'play'
      ? c('hint.tap')
      : fullLine && errorsLeft > 0 && rules.backspace
        ? c('hint.fix')
        : !started
          ? rules.backspace
            ? c('hint.start')
            : c('hint.noback')
          : '\u00a0',
  );

  function savePrefs(next: TypingPrefs): void {
    prefs = next;
    writePrefs(next);
  }
  const pickDifficulty = (d: TypingDifficulty): void => savePrefs({ ...prefs, difficulty: d });
  const pickSet = (id: SetId): void => savePrefs({ ...prefs, set: id });

  function levelHelp(d: TypingDifficulty): string {
    const r = rs.difficulties[d];
    return c(r.backspace ? 'levelHelp.back' : 'levelHelp.noback', {
      acc: Math.round(r.minAccuracy * 100),
      w1: r.wpm[0],
      w2: r.wpm[1],
      gold: Math.round(r.goldAccuracy * 100),
    });
  }

  function starsOf(game: string): number {
    return bests[bestKey(game, prefs.difficulty)]?.stars ?? 0;
  }
  const refreshBests = (): void => {
    bests = readBests();
  };

  // ---- running a text ----
  async function beginRun(next: Run): Promise<void> {
    window.clearInterval(timer);
    winResult = null;
    run = next;
    st = createState(next.text);
    phase = 'play';
    screen = 'play';
    now = performance.now();
    timer = window.setInterval(() => (now = performance.now()), 100);
    await nextTick();
    if (inputEl) {
      inputEl.value = '';
      inputEl.focus();
    }
    if (textEl) textEl.scrollTop = 0;
  }

  function startSet(): void {
    const set = setById(prefs.set);
    const plays = prefs.plays[set.id] ?? 0;
    void beginRun({ game: `typing-${set.id}`, label: `${c('title')} · ${c(`set.${set.id}`)}`, instruction: c(`set.${set.id}.desc`), text: exerciseFor(set, plays, c), back: 'menu' });
  }

  function startDrill(lesson: Lesson, drill: Drill): void {
    const kind = c(`typist.kind.${drill.kind}`);
    void beginRun({
      game: `typist-${prefs.source}-${drill.id}`,
      label: `${c('typist.title')} · ${lesson.title}`,
      instruction: drill.instruction || kind,
      text: drill.text,
      back: 'typist',
    });
  }

  function restart(): void {
    if (run) void beginRun(run);
  }

  function leave(): void {
    window.clearInterval(timer);
    winResult = null;
    refreshBests();
    if (screen === 'play' && run) {
      screen = run.back;
    } else if (screen === 'typist') {
      screen = 'menu';
    } else {
      onExit();
    }
  }

  function finish(): void {
    if (!run || phase === 'done') return;
    phase = 'done';
    window.clearInterval(timer);
    inputEl?.blur();
    const sum = summarize(st, st.endMs ?? performance.now(), rs, rules);
    const key = bestKey(run.game, prefs.difficulty);
    const rec = recordBestScore(key, sum.score, sum.stars, sum.timeMs);
    if (sum.stars >= 1) reportWin('typing');
    if (run.back === 'menu') {
      const id = prefs.set;
      savePrefs({ ...prefs, plays: { ...prefs.plays, [id]: (prefs.plays[id] ?? 0) + 1 } });
    }
    refreshBests();
    winResult = {
      game: run.game,
      gameLabel: run.label,
      difficulty: c(`diff.${prefs.difficulty}`),
      stars: sum.stars,
      timeMs: sum.timeMs,
      bestMs: rec.current.timeMs,
      previousBestMs: rec.previous?.timeMs ?? null,
      isNewRecord: rec.isNewRecord,
      metric: 'score',
      score: sum.score,
      bestScore: rec.current.score ?? sum.score,
      previousBestScore: rec.previous?.score ?? null,
      subtitle: sum.stars === 0 ? c('result.retry', { min: Math.round(rules.minAccuracy * 100) }) : undefined,
      detail: c('result.detail', { wpm: Math.round(sum.wpm), acc: Math.round(sum.accuracy * 100), err: sum.errors, combo: sum.maxCombo }),
    };
  }

  /**
   * Every keystroke arrives as a change of the hidden input's value, so physical and soft keyboards behave the same.
   * The value is diffed against what is already typed: removed tail = backspaces, new tail = typed characters.
   */
  function onInput(): void {
    if (!inputEl || phase !== 'play' || screen !== 'play') return;
    const typed = st.typed;
    const next = Array.from(inputEl.value);
    let p = 0;
    while (p < typed.length && p < next.length && typed[p] === next[p]) p++;
    for (let i = typed.length - p; i > 0; i--) eraseChar(st, rules);
    const t0 = performance.now();
    for (const ch of next.slice(p)) typeChar(st, ch, t0, { rules, scoring: rs.scoring });
    now = performance.now();
    const line = st.typed.join('');
    if (inputEl.value !== line) inputEl.value = line;
    inputEl.setSelectionRange(line.length, line.length);
    if (st.endMs !== null) finish();
  }

  function onInputKey(e: KeyboardEvent): void {
    if (e.key === 'Tab') {
      e.preventDefault();
      restart();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      leave();
    } else if (['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
    }
  }

  /** A key pressed while focus is elsewhere moves focus to the input so the character still lands there. */
  function onWindowKey(e: KeyboardEvent): void {
    if (screen !== 'play' || phase !== 'play' || !inputEl || document.activeElement === inputEl) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') return leave();
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT') && e.key.length !== 1) return;
    inputEl.focus();
  }

  function onViewport(): void {
    const v = window.visualViewport;
    vv = v && Math.abs(v.height - window.innerHeight) > 1 ? { h: v.height, top: v.offsetTop } : null;
  }

  $effect(() => {
    void st.typed.length;
    const box = textEl;
    if (!box) return;
    const cur = box.querySelector<HTMLElement>('.ch.cursor');
    if (!cur) return;
    const top = cur.offsetTop;
    const bottom = top + cur.offsetHeight;
    if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  });

  // ---- Typist lessons ----
  let loadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let loadReason = $state('network');
  let lessons = $state<Lesson[]>([]);
  let lessonId = $state('');
  let loadCtl: AbortController | null = null;
  const lesson = $derived(lessons.find((l) => l.id === lessonId) ?? lessons[0] ?? null);
  const source = $derived(sourceById(prefs.source));

  async function loadSource(id: string): Promise<void> {
    loadCtl?.abort();
    const mine = new AbortController();
    loadCtl = mine;
    loadState = 'loading';
    lessons = [];
    try {
      const got = await sourceById(id).load(mine.signal);
      if (mine.signal.aborted) return;
      lessons = got;
      if (!got.some((l) => l.id === lessonId)) lessonId = got[0]?.id ?? '';
      loadState = 'ready';
    } catch (e) {
      if (mine.signal.aborted) return;
      loadReason = e instanceof SourceError ? e.reason : 'network';
      loadState = 'error';
    }
  }

  function openTypist(): void {
    refreshBests();
    screen = 'typist';
    void loadSource(prefs.source);
  }
  function pickSource(id: string): void {
    savePrefs({ ...prefs, source: id });
    void loadSource(id);
  }
  function lessonStars(l: Lesson): number {
    let n = 0;
    for (const d of l.drills) n += bests[bestKey(`typist-${prefs.source}-${d.id}`, prefs.difficulty)]?.stars ?? 0;
    return n;
  }

  onMount(() => {
    window.addEventListener('keydown', onWindowKey);
    window.visualViewport?.addEventListener('resize', onViewport);
    window.visualViewport?.addEventListener('scroll', onViewport);
    onViewport();
  });
  onDestroy(() => {
    window.clearInterval(timer);
    loadCtl?.abort();
    window.removeEventListener('keydown', onWindowKey);
    window.visualViewport?.removeEventListener('resize', onViewport);
    window.visualViewport?.removeEventListener('scroll', onViewport);
  });

</script>

<div
  class="tp"
  style={vv ? `height:${vv.h}px;top:${vv.top}px;bottom:auto` : undefined}
  data-testid="typing"
  data-screen={screen}
  data-phase={phase}
  data-difficulty={prefs.difficulty}
  data-set={prefs.set}
  data-source={prefs.source}
  data-load={loadState}
  data-version={manifest.version}
>
  <header class="top">
    <button type="button" class="ib" data-testid="typing-exit" aria-label={screen === 'menu' ? c('exit') : c('back')} onclick={leave}>←</button>
    <div class="ttl">
      <h1>⌨️ {screen === 'typist' || (screen === 'play' && run?.back === 'typist') ? c('typist.title') : c('title')}</h1>
      <span class="ver">v{version} · typing@{manifest.version}</span>
    </div>
    {#if screen === 'play'}
      <div class="stat" aria-live="off">
        <span>{c('wpm')} <b data-testid="typing-wpm">{wpmNow}</b></span>
        <span>{c('acc')} <b data-testid="typing-acc">{accNow}%</b></span>
        <span>{c('combo')} <b data-testid="typing-combo">x{st.combo}</b></span>
        <span>{c('score')} <b data-testid="typing-score">{Math.round(st.score)}</b></span>
        <span class="opt">{c('time')} <b data-testid="typing-time">{secondsNow}s</b></span>
      </div>
      <div class="tools">
        <button type="button" class="ib txt" data-testid="typing-restart" aria-label={c('restart')} onclick={restart}><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z" fill="currentColor" /></svg></button>
      </div>
    {/if}
  </header>

  {#if screen === 'menu'}
    <main class="menu">
      <section class="col" aria-label={c('menu.sets')}>
        <h2>{c('menu.sets')}</h2>
        <div class="sets" role="radiogroup" aria-label={c('menu.sets')}>
          {#each SETS as s (s.id)}
            {@const stars = starsOf(`typing-${s.id}`)}
            <button type="button" role="radio" aria-checked={prefs.set === s.id} class="set" class:on={prefs.set === s.id} data-testid="typing-set-{s.id}" data-set={s.id} onclick={() => pickSet(s.id)}>
              <span class="nm">{s.icon} {c(`set.${s.id}`)}</span>
              <small>{c(`set.${s.id}.desc`)}</small>
              <i aria-label="stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</i>
            </button>
          {/each}
        </div>
      </section>
      <section class="col side">
        <h2>{c('menu.level')}</h2>
        <div class="diffs" role="radiogroup" aria-label={c('menu.level')}>
          {#each TYPING_DIFFICULTIES as d (d)}
            <button type="button" role="radio" aria-checked={prefs.difficulty === d} class="diff" class:on={prefs.difficulty === d} data-testid="typing-diff-{d}" data-diff={d} onclick={() => pickDifficulty(d)}>{c(`diff.${d}`)}</button>
          {/each}
        </div>
        <p class="how" data-testid="typing-levelhelp">{levelHelp(prefs.difficulty)}</p>
        <button type="button" class="primary" data-testid="typing-start" onclick={startSet}>{c('menu.play')}</button>
        <button type="button" class="ghost" data-testid="typing-typist" onclick={openTypist}>{c('menu.typist')}<small>{c('menu.typistHint')}</small></button>
        <p class="how">{c('howto.keys')}</p>
        <p class="how">{c('howto.touch')}</p>
      </section>
    </main>
  {:else if screen === 'typist'}
    <div class="srcbar">
      <div class="tabs" role="radiogroup" aria-label={c('typist.source')}>
        {#each TYPIST_SOURCES as s (s.id)}
          <button type="button" role="radio" aria-checked={prefs.source === s.id} class="tab" class:on={prefs.source === s.id} data-testid="typing-source-{s.id}" onclick={() => pickSource(s.id)}>{c(`typist.src.${s.id}`)}</button>
        {/each}
      </div>
      <div class="diffs small" role="radiogroup" aria-label={c('menu.level')}>
        {#each TYPING_DIFFICULTIES as d (d)}
          <button type="button" role="radio" aria-checked={prefs.difficulty === d} class="diff" class:on={prefs.difficulty === d} data-testid="typing-diff-{d}" onclick={() => pickDifficulty(d)}>{c(`diff.${d}`)}</button>
        {/each}
      </div>
    </div>
    {#if loadState === 'loading' || loadState === 'idle'}
      <p class="state" data-testid="typing-loading" role="status">{c('typist.loading')}</p>
    {:else if loadState === 'error'}
      <div class="state err" data-testid="typing-error" role="alert">
        <p><b>{c('typist.error', { reason: c(`typist.reason.${loadReason}`) })}</b></p>
        <p class="how">{c('typist.errorHint')}</p>
        <div class="btns">
          <button type="button" class="primary sm" data-testid="typing-retry" onclick={() => loadSource(prefs.source)}>{c('typist.retry')}</button>
          {#if source.kind === 'online'}
            <button type="button" class="ghost sm" data-testid="typing-use-sample" onclick={() => pickSource('sample')}>{c('typist.useSample')}</button>
          {/if}
        </div>
      </div>
    {:else}
      <main class="lessons">
        <section class="lcol" aria-label={c('typist.lessons')}>
          <h2>{c('typist.lessons')} <span class="n">{lessons.length}</span></h2>
          <ul class="list" data-testid="typing-lessons">
            {#each lessons as l (l.id)}
              <li>
                <button type="button" class="row" class:on={lesson?.id === l.id} data-testid="typing-lesson-{l.id}" onclick={() => (lessonId = l.id)}>
                  <span class="t">{l.title}</span>
                  <small>{c('typist.drillCount', { n: l.drills.length })} · ★ {lessonStars(l)}/{l.drills.length * 3}</small>
                </button>
              </li>
            {/each}
          </ul>
        </section>
        <section class="dcol" aria-label={c('typist.drills')}>
          {#if lesson}
            <h2>{lesson.title}</h2>
            {#if lesson.summary}<p class="how">{lesson.summary}</p>{/if}
            {#if lesson.intro}<p class="how intro">{lesson.intro}</p>{/if}
            <ul class="list" data-testid="typing-drills">
              {#each lesson.drills as d (d.id)}
                {@const stars = bests[bestKey(`typist-${prefs.source}-${d.id}`, prefs.difficulty)]?.stars ?? 0}
                <li>
                  <button type="button" class="row" data-testid="typing-drill-{d.id}" data-kind={d.kind} onclick={() => startDrill(lesson, d)}>
                    <span class="t">{d.instruction || d.label || d.id}</span>
                    <small>{c(`typist.kind.${d.kind}`)} · {c('typist.chars', { n: d.text.length })}</small>
                    <i aria-label="stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</i>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="how">{c('typist.pick')}</p>
          {/if}
          <p class="how credit">{c('typist.note')}</p>
          <p class="how credit" data-testid="typing-credit">{c('typist.credit', { origin: source.origin })}</p>
        </section>
      </main>
    {/if}
  {:else}
    <p class="instr" data-testid="typing-instruction">{run?.instruction ?? ''}</p>
    <div
      class="txt"
      bind:this={textEl}
      data-testid="typing-text"
      data-pos={st.typed.length}
      data-len={st.target.length}
      data-errors={errorsLeft}
      data-started={started ? '1' : '0'}
      role="textbox"
      aria-readonly="true"
      aria-label={c('textAria')}
      tabindex="-1"
      onclick={() => inputEl?.focus()}
      onkeydown={() => undefined}
    >
      <div class="line">{#each words as w, wi (wi)}<span class="w">{#each w as cell (cell.from)}<span class="ch {cellMark(st, cell)}" data-mark={cellMark(st, cell)}>{cell.text === ' ' ? '\u00a0' : cell.text}</span>{/each}</span>{/each}</div>
    </div>
    <input
      bind:this={inputEl}
      class="hid"
      data-testid="typing-input"
      type="text"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      inputmode="text"
      enterkeyhint="done"
      aria-label={c('inputAria')}
      oninput={onInput}
      onkeydown={onInputKey}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      onpaste={(e) => e.preventDefault()}
      ondrop={(e) => e.preventDefault()}
    />
    <footer class="foot">
      <div class="bar" role="progressbar" aria-label={c('progressAria')} aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style="width:{pct}%"></i></div>
      <p class="hint" data-testid="typing-hint" role="status">{hint}</p>
    </footer>
  {/if}
</div>

{#if winResult}
  <WinResultDialog result={winResult} onReplay={restart} onClose={leave} />
{/if}

<style>
  .tp {
    position: fixed;
    inset: 0;
    z-index: 9;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: calc(6px + env(safe-area-inset-top)) calc(10px + env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom)) calc(10px + env(safe-area-inset-left));
    box-sizing: border-box;
    background: radial-gradient(120% 120% at 50% 0%, #1d2a44 0%, #0d1424 70%);
    color: #eaf1ff;
    overflow: hidden;
    touch-action: manipulation;
  }
  .top { display: flex; align-items: center; gap: 8px; flex: none; min-height: 42px; }
  .ttl { min-width: 0; display: flex; flex-direction: column; }
  .ttl h1 { margin: 0; font-size: 16px; line-height: 1.1; white-space: nowrap; }
  .ver { font-size: 10px; opacity: 0.65; white-space: nowrap; }
  .stat { display: flex; gap: 12px; margin-left: 6px; font-weight: 800; font-size: 13px; flex-wrap: wrap; }
  .stat b { font-variant-numeric: tabular-nums; color: #7ee0ff; }
  .tools { margin-left: auto; display: flex; align-items: center; gap: 6px; }
  .top > .ib:first-child { flex: none; }
  .ib { min-width: 40px; height: 40px; border-radius: 12px; border: 2px solid #5aa8ff; background: rgba(20, 36, 66, 0.9); color: #fff; font-size: 16px; font-weight: 800; padding: 0 6px; }
  .menu { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.25fr 1fr; gap: 14px; overflow: auto; align-items: start; touch-action: pan-y; }
  .col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .col h2, .lcol h2, .dcol h2 { margin: 0; font-size: 13px; opacity: 0.85; font-weight: 700; }
  .sets { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .set { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; min-height: 74px; padding: 8px 10px; border-radius: 12px; border: 2px solid #2d4a7a; background: rgba(20, 36, 66, 0.7); color: #fff; font-weight: 700; font-size: 14px; text-align: left; }
  .set small { font-weight: 500; font-size: 11px; opacity: 0.75; }
  .set i, .row i { font-style: normal; color: #ffd34d; letter-spacing: 2px; }
  .set.on { border-color: #7ee0ff; background: rgba(40, 80, 130, 0.85); }
  .diffs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .diffs.small { min-width: 210px; }
  .diff { height: 40px; border-radius: 10px; border: 2px solid #2d4a7a; background: rgba(20, 36, 66, 0.7); color: #fff; font-weight: 800; }
  .diff.on { border-color: #7ee0ff; background: #7ee0ff; color: #04182a; }
  .primary { height: 48px; border: 0; border-radius: 12px; background: #7ee0ff; color: #04182a; font-weight: 800; font-size: 17px; }
  .ghost { min-height: 46px; border-radius: 12px; border: 2px solid #5aa8ff; background: transparent; color: #fff; font-weight: 700; font-size: 15px; display: flex; flex-direction: column; justify-content: center; padding: 4px 8px; }
  .ghost small { font-size: 11px; font-weight: 500; opacity: 0.75; }
  .sm { height: 40px; min-height: 40px; padding: 0 14px; font-size: 14px; }
  .how { margin: 0; font-size: 12px; line-height: 1.4; opacity: 0.8; }
  .how.credit { opacity: 0.6; font-size: 11px; word-break: break-all; }
  .srcbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: none; }
  .tabs { display: flex; gap: 6px; flex: 1; min-width: 0; }
  .tab { flex: 1; min-height: 40px; border-radius: 10px; border: 2px solid #2d4a7a; background: rgba(20, 36, 66, 0.7); color: #fff; font-weight: 700; font-size: 13px; padding: 2px 8px; }
  .tab.on { border-color: #7ee0ff; background: rgba(40, 80, 130, 0.9); }
  .state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; margin: 0; font-size: 15px; }
  .state.err { border: 2px solid #ff7d8f; border-radius: 12px; background: rgba(80, 20, 36, 0.4); padding: 12px; margin-top: 6px; }
  .state p { margin: 0; }
  .btns { display: flex; gap: 8px; }
  .lessons { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(180px, 0.9fr) 1.4fr; gap: 12px; }
  .lcol, .dcol { min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; overflow: auto; touch-action: pan-y; overscroll-behavior: contain; }
  .n { opacity: 0.6; font-weight: 500; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .row.on, .list .row.on { border-color: #7ee0ff; background: rgba(40, 80, 130, 0.9); }
  .list .row { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 46px; padding: 6px 10px; border-radius: 10px; border: 2px solid #2d4a7a; background: rgba(20, 36, 66, 0.7); color: #fff; text-align: left; font-size: 13px; font-weight: 700; }
  .list .row .t { overflow-wrap: anywhere; }
  .list .row small { font-weight: 500; opacity: 0.7; font-size: 11px; }
  .intro { font-style: italic; }
  .instr { margin: 0; flex: none; font-size: 13px; opacity: 0.85; min-height: 18px; overflow-wrap: anywhere; }
  .txt {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border-radius: 12px;
    border: 1px solid #2d4a7a;
    background: rgba(8, 14, 28, 0.7);
    padding: 12px 16px;
    font-family: ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Noto Sans Thai', 'Sarabun', monospace;
    font-size: clamp(20px, 4.2vw, 46px);
    line-height: 1.7;
    display: grid;
    align-content: safe center;
    cursor: text;
    user-select: none;
    -webkit-user-select: none;
  }
  .w { display: inline-block; white-space: nowrap; }
  .ch { border-radius: 3px; }
  .ch.todo { color: #9fb2d6; }
  .ch.ok { color: #7dffb3; }
  .ch.bad { color: #fff; background: #e0405a; }
  .ch.cursor { color: #04182a; background: #7ee0ff; animation: blink 1s steps(2, jump-none) infinite; }
  @keyframes blink { 50% { background: rgba(126, 224, 255, 0.35); } }
  .hid { position: absolute; left: 0; top: 0; width: 1px; height: 1px; opacity: 0; border: 0; padding: 0; font-size: 16px; pointer-events: none; }
  .foot { flex: none; display: flex; flex-direction: column; gap: 4px; }
  .bar { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
  .bar i { display: block; height: 100%; background: #7ee0ff; transition: width 80ms linear; }
  .hint { margin: 0; text-align: center; font-size: 12px; opacity: 0.85; min-height: 16px; }
  @media (prefers-reduced-motion: reduce) {
    .ch.cursor { animation: none; }
    .bar i { transition: none; }
  }
  /* Short screens (landscape phones): tighter header and lists. */
  @media (max-height: 480px) {
    .tp { gap: 4px; }
    .top { min-height: 38px; }
    .ib { height: 36px; min-width: 36px; }
    .primary { height: 42px; }
    .set { min-height: 58px; padding: 6px 8px; }
    .txt { padding: 8px 12px; font-size: clamp(18px, 6vh, 30px); }
    .stat .opt { display: none; }
  }
</style>
