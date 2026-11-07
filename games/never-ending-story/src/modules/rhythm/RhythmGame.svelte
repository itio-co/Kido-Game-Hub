<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { version } from '../../../package.json';
  import { readPlayerId, setNickname } from '../../lib/playerId';
  import { clearRun, defaultRun, readRun, recordBest, starsFor, writeRun, type RhythmRun } from './store';
  import type { Judgement, RhythmEdition, StageProps } from './types';
  import manifest from './module.json';
  import { submitRun } from '../../lib/cloudSync';
  import { packRun } from '../challenge/proto';

  let { edition, onExit }: { edition: RhythmEdition; onExit: () => void } = $props();
  const P = $derived(edition.params);
  const c = (key: string, vars?: Record<string, string | number>) => t(`${edition.copy}.${key}`, vars);
  let last = $state<Judgement | null>(null);
  let pulse = $state(0);

  let run = $state<RhythmRun>(defaultRun());
  let nickname = $state('');
  let needNick = $state(false);
  let beatFlash = $state(false);
  let ringGlow = $state(0); // 0..1 proximity to beat
  let msg = $state('');
  let raf = 0;
  let lastTs = 0;
  let nextBeatAt = 0;
  let nextIngAt = 0;
  let shareNote = $state('');
  let onlineNote = $state('');

  const stageProps = $derived<StageProps>({
    progress: run.progress, pressure: run.heat, pressureZone: P.pressureZone, combo: run.combo,
    beat: ringGlow, extraDue: run.ingredientDue !== null, last, pulse,
  });

  function judge(j: Judgement): void {
    last = j;
    pulse += 1;
    edition.hooks?.onJudge?.(j, stageProps);
  }

  async function submitOnline(): Promise<void> {
    const me = readPlayerId();
    const elapsed = Math.round((P.durationSec - run.timeLeft) * 1000);
    const sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sf-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    const token = await packRun({
      sessionId, playerId: me.playerId, nickname: me.nickname ?? '', game: edition.leaderboardId, difficulty: 'normal',
      seed: 0, score: Math.round(run.score), timeMs: Math.max(3000, elapsed), version: `${version};${manifest.id}@${manifest.version};${edition.id}`, timestampMs: Date.now(),
      challengerSessionId: '', challengerNickname: '', challengerScore: 0, challengerTimeMs: 0,
    }).catch(() => '');
    if (token) {
      submitRun(token, true);
      onlineNote = c('onlineSaved');
    }
  }

  const stars = $derived(starsFor(run.score, run.progress, P.stars));
  const prompt = $derived(
    run.ingredientDue !== null ? c('prompt.add') : c('prompt.stir'),
  );
  const timeLabel = $derived(String(Math.max(0, Math.ceil(run.timeLeft))).padStart(2, '0'));
  const scoreLabel = $derived(String(Math.round(run.score)).padStart(4, '0'));

  function persist(): void {
    writeRun(edition.storageKey, run);
  }

  function flash(text: string): void {
    msg = text;
    window.setTimeout(() => {
      if (msg === text) msg = '';
    }, 700);
  }

  function bumpProgress(amount: number): void {
    run.progress = Math.max(0, Math.min(100, run.progress + amount));
  }

  function start(): void {
    const bestScore = run.bestScore;
    const bestStars = run.bestStars;
    run = { ...defaultRun(), timeLeft: P.durationSec, phase: 'play', startedAt: Date.now(), bestScore, bestStars };
    nextBeatAt = performance.now() + P.beatMs;
    nextIngAt = performance.now() + P.extraFirstMs;
    persist();
    lastTs = 0;
  }

  function finish(reason: 'done' | 'time'): void {
    if (run.phase !== 'play') return;
    const best = recordBest(edition.storageKey, run.score, run.progress, P.stars);
    edition.hooks?.onFinish?.(run.score, run.progress);
    run = {
      ...run,
      phase: 'result',
      timeLeft: reason === 'time' ? 0 : run.timeLeft,
      bestScore: best.bestScore,
      bestStars: best.bestStars,
      endReason: reason,
    };
    persist();
    void submitOnline();
    const profile = readPlayerId();
    needNick = !profile.nickname;
    nickname = profile.nickname ?? '';
  }

  function retry(): void {
    clearRun(edition.storageKey);
    needNick = false;
    start();
  }

  function saveNick(): void {
    if (!nickname.trim()) return;
    setNickname(nickname);
    needNick = false;
  }

  async function shareLink(): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}${edition.route}`;
    try {
      await navigator.clipboard.writeText(url);
      shareNote = c('shared');
    } catch {
      shareNote = url;
    }
    window.setTimeout(() => (shareNote = ''), 1600);
  }

  function onStir(): void {
    if (run.phase !== 'play') return;
    // If ingredient is due, prefer that action — don't punish stir, just ignore timing miss lightly
    if (run.ingredientDue !== null) {
      flash(c('prompt.add'));
      return;
    }
    const now = performance.now();
    const delta = Math.abs(now - nextBeatAt);
    if (delta <= P.perfectMs) {
      const bonus = Math.round((1 - delta / P.perfectMs) * 50) + run.combo * 3;
      run.score += 80 + bonus;
      run.combo = Math.min(run.combo + 1, 12);
      bumpProgress(4.2);
      beatFlash = true;
      window.setTimeout(() => (beatFlash = false), 140);
      judge('perfect');
      flash(c('perfect'));
    } else if (delta <= P.goodMs) {
      run.score += 40 + run.combo;
      run.combo = Math.min(run.combo + 1, 8);
      bumpProgress(2.4);
      judge('good');
      flash(c('good'));
    } else {
      run.combo = 0;
      run.score = Math.max(0, run.score - 10);
      judge('miss');
      flash(c('miss'));
    }
    run.heat = Math.max(0, Math.min(100, run.heat - P.pressureDropPerTap));
    persist();
    if (run.progress >= 100) finish('done');
  }

  function onIngredient(): void {
    if (run.phase !== 'play' || run.ingredientDue === null) return;
    const now = performance.now();
    if (Math.abs(now - run.ingredientDue) <= P.extraWindowMs) {
      run.score += 140 + run.combo * 6;
      run.ingredientHits += 1;
      bumpProgress(9);
      judge('extra-hit');
      flash(c('ingHit'));
    } else {
      run.ingredientMiss += 1;
      run.combo = 0;
      judge('extra-miss');
      flash(c('ingMiss'));
    }
    run.ingredientDue = null;
    nextIngAt = now + P.extraGapMs[0] + Math.random() * (P.extraGapMs[1] - P.extraGapMs[0]);
    persist();
    if (run.progress >= 100) finish('done');
  }

  function tick(ts: number): void {
    if (run.phase !== 'play') {
      ringGlow = 0;
      raf = requestAnimationFrame(tick);
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    run.timeLeft = Math.max(0, run.timeLeft - dt);
    // heat rises slowly; good stirs cool it (no extra heat buttons)
    run.heat = Math.max(0, Math.min(100, run.heat + dt * P.pressureRise));

    const dist = Math.min(Math.abs(ts - nextBeatAt), P.beatMs - Math.abs(ts - nextBeatAt));
    ringGlow = Math.max(0, 1 - dist / (P.beatMs * 0.5));
    if (ts >= nextBeatAt) {
      nextBeatAt += P.beatMs;
      edition.hooks?.onBeat?.();
    }

    if (run.ingredientDue === null && ts >= nextIngAt) {
      run.ingredientDue = ts + P.extraLeadMs;
    }
    if (run.ingredientDue !== null && ts > run.ingredientDue + 520) {
      run.ingredientMiss += 1;
      run.combo = 0;
      run.ingredientDue = null;
      nextIngAt = ts + 2200;
      judge('extra-miss');
      flash(c('ingMiss'));
    }

    const inZone = run.heat >= P.pressureZone[0] && run.heat <= P.pressureZone[1];
    if (inZone) {
      run.score += dt * 10;
      bumpProgress(dt * 1.1);
    } else {
      run.score = Math.max(0, run.score - dt * 12);
    }

    if (Math.floor(ts / 300) % 2 === 0) persist();

    if (run.progress >= 100) {
      finish('done');
    } else if (run.timeLeft <= 0) {
      finish('time');
    }
    raf = requestAnimationFrame(tick);
  }

  onMount(() => {
    const saved = readRun(edition.storageKey);
    if (saved.phase === 'play' && saved.timeLeft > 1 && saved.progress < 100) {
      run = saved;
      nextBeatAt = performance.now() + P.beatMs;
      nextIngAt = performance.now() + 1600;
    } else if (saved.phase === 'result') {
      run = saved;
      const profile = readPlayerId();
      needNick = !profile.nickname;
      nickname = profile.nickname ?? '';
    } else {
      run = { ...defaultRun(), bestScore: saved.bestScore, bestStars: saved.bestStars };
    }
    readPlayerId();
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (run.phase === 'play') persist();
  });
</script>

<div class="sf" data-edition={edition.id} style="--kitchen:url('{new URL(edition.theme.background, document.baseURI).href}')">
  <header class="top">
    <button type="button" class="sf-exit" aria-label={c('exit')} onclick={onExit}>←</button>
    <div class="topmid">
      <h1>{c('title')}</h1>
      <span class="ver">v{version}</span>
    </div>
    <span class="time" aria-label="timer">{timeLabel}s</span>
  </header>

  {#if run.phase === 'ready'}
    <div class="panel howto">
      <p class="line">{c('howto1')}</p>
      <p class="line">{c('howto2')}</p>
      <p class="line">{c('howto3')}</p>
      <button type="button" class="primary" onclick={start}>{c('start')}</button>
    </div>
  {:else if run.phase === 'play'}
    <div class="play">
      <div class="meters">
        <div class="meter">
          <div class="meter-label">
            <span>{c('goal')}</span>
            <span class="num">{Math.round(run.progress)}%</span>
          </div>
          <div class="bar dish"><i style="width:{run.progress}%"></i></div>
        </div>
        <div class="meter row">
          <span class="score">{c('score')} <b class="num">{scoreLabel}</b></span>
          <span class="combo">x{run.combo}</span>
          <span class="heatlab">{c('heat')}</span>
          <div class="bar heat"><i style="width:{run.heat}%"></i><em style="left:35%"></em><em style="left:75%"></em></div>
        </div>
      </div>

      <div class="sf-stage">
        <p class="prompt" class:add={run.ingredientDue !== null} role="status">{prompt}</p>
        <div class="msgslot" aria-live="polite">{msg || '\u00a0'}</div>
        <button
          type="button"
          class="wok"
          class:flash={beatFlash}
          class:due={run.ingredientDue !== null}
          style="--glow:{ringGlow}"
          onclick={run.ingredientDue !== null ? onIngredient : onStir}
          aria-label={run.ingredientDue !== null ? c('add') : c('stir')}
        >
          <edition.Stage {...stageProps} />
          <span class="ring"></span>
        </button>
      </div>

      <div class="controls">
        <button type="button" class="stir" onclick={onStir}>{c('stir')}</button>
        <button
          type="button"
          class="ing"
          class:due={run.ingredientDue !== null}
          disabled={run.ingredientDue === null}
          onclick={onIngredient}
        >{c('add')}</button>
      </div>
    </div>
  {:else}
    <div class="panel result">
      <p class="banner">{run.endReason === 'done' ? c('resultDone') : c('resultTime')}</p>
      <p class="stars">{'⭐'.repeat(stars)}</p>
      <h2>{c('resultTitle')}</h2>
      <p>{c('resultScore', { n: Math.round(run.score) })}</p>
      <p class="small">{c('best', { n: Math.round(run.bestScore), stars: '⭐'.repeat(run.bestStars || 0) || '—' })}</p>
      <p class="small">{c('resultDetail', { p: Math.round(run.progress), hits: run.ingredientHits, miss: run.ingredientMiss })}</p>
      {#if needNick}
        <label class="nick">
          <span>{c('nickname')}</span>
          <input bind:value={nickname} maxlength="24" placeholder={c('nicknamePh')} />
        </label>
        <button type="button" class="primary" onclick={saveNick}>{c('saveNick')}</button>
      {:else}
        {#if onlineNote}<p class="small online">🌐 {onlineNote}</p>{/if}
        <button type="button" class="primary" onclick={retry}>{c('retry')}</button>
        <button type="button" class="ghost" onclick={() => (window.location.hash = '#/leaderboard')}>{c('board')}</button>
        <button type="button" class="ghost" onclick={onExit}>{c('backList')}</button>
        <button type="button" class="ghost" onclick={shareLink}>{c('share')}</button>
        {#if shareNote}<p class="small">{shareNote}</p>{/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .sf {
    position: absolute;
    inset: 0;
    z-index: 9;
    height: 100dvh;
    max-height: 100dvh;
    background-color: #15202b;
    background-size: cover;
    background-position: center;
    background-image: linear-gradient(rgba(10, 14, 20, 0.35), rgba(10, 14, 20, 0.55)), var(--kitchen);
    color: #eaf6ff;
    display: flex;
    flex-direction: column;
    padding: calc(8px + env(safe-area-inset-top)) 12px calc(10px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow: hidden;
  }
  .top {
    display: grid;
    grid-template-columns: 44px 1fr 56px;
    align-items: center;
    gap: 8px;
    flex: none;
    min-height: 48px;
  }
  .topmid { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
  .topmid h1 { margin: 0; font-size: calc(var(--fs) + 2px); line-height: 1.1; }
  .ver { font-size: 11px; opacity: 0.75; font-weight: 700; }
  .sf-exit {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid #39e0ff;
    background: rgba(6, 24, 40, 0.92);
    color: #fff;
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
    padding: 0;
  }
  .time {
    width: 56px;
    height: 36px;
    display: grid;
    place-items: center;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 10px;
  }
  .play {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 8px;
    position: relative;
  }
  .meters { display: grid; gap: 6px; }
  .meter-label { display: flex; justify-content: space-between; font-size: var(--fs-sm); font-weight: 700; margin-bottom: 2px; }
  .num { font-variant-numeric: tabular-nums; }
  .bar { position: relative; height: 14px; border-radius: 8px; background: #0a1822; border: 1px solid #39e0ff; overflow: hidden; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #39e0ff, #7dffb3); }
  .bar.heat i { background: linear-gradient(90deg, #4db2ff, #ffcf4a, #ff5d73); }
  .bar em { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.65); }
  .meter.row { display: grid; grid-template-columns: auto auto 28px 1fr; gap: 8px; align-items: center; font-size: var(--fs-sm); font-weight: 700; }
  .combo { min-width: 28px; text-align: center; opacity: 0.9; }
  .sf-stage {
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .prompt {
    margin: 0;
    min-height: 1.35em;
    font-weight: 800;
    font-size: calc(var(--fs) + 1px);
    text-align: center;
  }
  .prompt.add { color: #7dffb3; }
  .msgslot {
    min-height: 1.3em;
    font-weight: 800;
    color: #ffcf4a;
    text-align: center;
  }
  .wok {
    position: relative;
    width: min(86vw, 52dvh, 340px);
    aspect-ratio: 1;
    border-radius: 24px;
    border: 0;
    background: transparent;
    padding: 0;
    flex: none;
    overflow: visible;
  }
  .wok.flash :global(.pan) { box-shadow: 0 0 0 4px #ffcf4a, 0 14px 30px rgba(0, 0, 0, 0.55); }
  .wok.due :global(.pan) { box-shadow: 0 0 0 4px #7dffb3, 0 14px 30px rgba(0, 0, 0, 0.55); }
  .ring {
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    border: 4px solid rgba(57, 224, 255, calc(0.1 + var(--glow) * 0.85));
    box-shadow: 0 0 calc(8px + var(--glow) * 22px) rgba(57, 224, 255, calc(var(--glow) * 0.9));
    pointer-events: none;
    transition: border-color 40ms linear, box-shadow 40ms linear;
  }
  .online { color: #7dffb3; }
  .controls {
    display: grid;
    grid-template-columns: 1.25fr 1fr;
    gap: 10px;
    min-height: 64px;
    padding-top: 4px;
  }
  .controls button {
    height: 64px;
    min-height: 64px;
    max-height: 64px;
    border-radius: 16px;
    border: 2px solid #39e0ff;
    background: #0d4a66;
    color: #fff;
    font-weight: 800;
    font-size: calc(var(--fs) + 2px);
  }
  .stir { background: #ffcf4a !important; color: #3a2a00 !important; border-color: #ffcf4a !important; }
  .ing:disabled { opacity: 0.4; }
  .ing.due { background: #39e0ff; color: #06212f; box-shadow: 0 0 0 3px rgba(57,224,255,0.35); }
  .panel {
    margin: auto 0;
    background: #0d2a3c;
    border: 2px solid #39e0ff;
    border-radius: 16px;
    padding: 18px;
    text-align: center;
  }
  .howto .line { margin: 0 0 10px; line-height: 1.45; text-align: left; font-weight: 700; }
  .primary {
    display: block;
    width: 100%;
    margin-top: 12px;
    height: 52px;
    border: 0;
    border-radius: 12px;
    background: #39e0ff;
    color: #06212f;
    font-weight: 800;
    font-size: var(--fs);
  }
  .ghost {
    display: block;
    width: 100%;
    margin-top: 8px;
    height: 48px;
    background: transparent;
    border: 1px solid #39e0ff;
    color: #fff;
    border-radius: 12px;
    font-weight: 700;
  }
  .banner { margin: 0 0 6px; font-weight: 800; color: #7dffb3; }
  .result .stars { font-size: 28px; margin: 0; }
  .small { font-size: var(--fs-sm); opacity: 0.85; }
  .nick { display: grid; gap: 6px; text-align: left; margin-top: 12px; }
  .nick input {
    height: 44px;
    border-radius: 10px;
    border: 1px solid #39e0ff;
    background: #082030;
    color: #fff;
    padding: 8px 10px;
  }
</style>
