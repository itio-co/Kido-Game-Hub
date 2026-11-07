<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { version } from '../../../package.json';
  import { readPlayerId, setNickname } from '../../lib/playerId';
  import { clearRun, defaultRun, readRun, recordBest, starsFor, writeRun, type RhythmRun } from './store';
  import type { Judgement, RhythmPack, StageProps } from './types';
  import manifest from './module.json';
  import { rhythmRuleset } from './ruleset';
  import { buildChart, chartId, isChartSeed, newChartSeed, paramsFor, parseRhythmHash, rhythmHash, RHYTHM_DIFFICULTIES, type RhythmDifficulty, type RhythmLink } from './chart';
  import { currentRuleset, resolveGame, versionIn } from '../../lib/rulesetCatalog';
  import { gameCopy, nextPhase, RulesetBanner, submitFinishedRun, UnsupportedRuleset } from '../minigame-core';

  let { pack, onExit }: { pack: RhythmPack; onExit: () => void } = $props();
  let run = $state<RhythmRun>(defaultRun());
  let link = $state<RhythmLink>({ difficulty: null, seed: null, ruleset: null, from: null });
  const resolution = $derived(resolveGame(pack.leaderboardId, link.ruleset));
  const rulesetKey = $derived(resolution.ok ? resolution.key : currentRuleset(pack.leaderboardId));
  const engineVersion = $derived(resolution.ok ? versionIn(resolution, manifest.id) : manifest.version);
  const packVersion = $derived(resolution.ok ? versionIn(resolution, pack.id) : pack.version);
  const engineRules = $derived(rhythmRuleset(engineVersion) ?? rhythmRuleset(manifest.version)!);
  const packRules = $derived(pack.rulesets[packVersion] ?? pack.rulesets[pack.version]);
  const P = $derived(paramsFor(packRules.params, run.difficulty, engineRules.tuning));
  const S = $derived(engineRules.scoring);
  /** Extra-lane cue times (ms from start), fixed by pack + difficulty + seed + the active params. */
  const chart = $derived(engineRules.chart === 'v1' ? buildChart(pack.id, run.difficulty, run.seed, P) : []);
  let playStart = 0;
  const c = gameCopy(pack.copy);
  let last = $state<Judgement | null>(null);
  let pulse = $state(0);

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
    beat: ringGlow, extraDue: run.ingredientDue !== null, last, pulse, packVersion,
  });

  function judge(j: Judgement): void {
    last = j;
    pulse += 1;
    pack.hooks?.onJudge?.(j, stageProps);
  }

  async function submitOnline(): Promise<void> {
    const me = readPlayerId();
    const elapsed = Math.round((P.durationSec - run.timeLeft) * 1000);
    const sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sf-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
    const token = await submitFinishedRun({
      sessionId, playerId: me.playerId, nickname: me.nickname ?? '', game: pack.leaderboardId, difficulty: run.difficulty,
      seed: run.seed, score: Math.round(run.score), timeMs: Math.max(engineRules.submit.minMs, elapsed), version: `${version};${rulesetKey}`, ruleset: rulesetKey, timestampMs: Date.now(),
      challengerSessionId: '', challengerNickname: '', challengerScore: 0, challengerTimeMs: 0,
    });
    if (token) onlineNote = c('onlineSaved');
  }

  const stars = $derived(starsFor(run.score, run.progress, P.stars));
  const prompt = $derived(
    run.ingredientDue !== null ? c('prompt.add') : c('prompt.stir'),
  );
  const timeLabel = $derived(String(Math.max(0, Math.ceil(run.timeLeft))).padStart(2, '0'));
  const scoreLabel = $derived(String(Math.round(run.score)).padStart(4, '0'));

  function persist(): void {
    writeRun(pack.storageKey, run);
  }

  let msgTimer = 0;
  /** Show a judgement label; a newer label always replaces the previous one at once. */
  let msgJudgement = $state('');
  function flash(text: string, judgement = ''): void {
    window.clearTimeout(msgTimer);
    msg = text;
    msgJudgement = judgement;
    msgTimer = window.setTimeout(() => (msg = ''), 700);
  }

  /** Schedule the next chart cue (never sooner than `minGap` from now). */
  function scheduleCue(now: number, minGap: number): void {
    const at = chart[run.cue];
    nextIngAt = at === undefined ? Infinity : Math.max(playStart + at, now + minGap);
  }

  function pickDifficulty(d: RhythmDifficulty): void {
    run = { ...run, difficulty: d };
  }
  function newChart(): void {
    run = { ...run, seed: newChartSeed() };
    link = { ...link, from: null };
  }

  function bumpProgress(amount: number): void {
    run.progress = Math.max(0, Math.min(100, run.progress + amount));
  }

  function start(): void {
    const bestScore = run.bestScore;
    const bestStars = run.bestStars;
    const difficulty = run.difficulty;
    const seed = isChartSeed(run.seed) ? run.seed : newChartSeed();
    const phase = nextPhase('ready', 'start');
    if (phase !== 'play') return;
    run = { ...defaultRun(), timeLeft: P.durationSec, phase, startedAt: Date.now(), bestScore, bestStars, difficulty, seed, cue: 0 };
    playStart = performance.now();
    nextBeatAt = playStart + P.beatMs;
    nextIngAt = playStart + (chart[0] ?? Infinity);
    persist();
    lastTs = 0;
  }

  function finish(reason: 'done' | 'time'): void {
    if (run.phase !== 'play') return;
    const phase = nextPhase(run.phase, 'end');
    if (phase !== 'result') return;
    const best = recordBest(pack.storageKey, run.score, run.progress, P.stars);
    pack.hooks?.onFinish?.(run.score, run.progress);
    run = {
      ...run,
      phase,
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
    const { difficulty, seed } = run;
    clearRun(pack.storageKey);
    run = { ...run, difficulty, seed };
    needNick = false;
    start();
  }

  function saveNick(): void {
    if (!nickname.trim()) return;
    setNickname(nickname);
    needNick = false;
  }

  async function shareLink(): Promise<void> {
    const me = readPlayerId();
    const from = run.phase === 'result'
      ? { nick: me.nickname || '?', score: Math.round(run.score), time: Math.round((P.durationSec - run.timeLeft) * 10) / 10 }
      : undefined;
    const hash = rhythmHash(pack.route, run.difficulty, run.seed, from, rulesetKey);
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
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
      const bonus = Math.round((1 - delta / P.perfectMs) * S.perfectBonus) + run.combo * S.perfectCombo;
      run.score += S.perfectBase + bonus;
      run.combo = Math.min(run.combo + 1, S.perfectComboCap);
      bumpProgress(S.perfectProgress);
      beatFlash = true;
      window.setTimeout(() => (beatFlash = false), 140);
      judge('perfect');
      flash(c('perfect'), 'perfect');
    } else if (delta <= P.goodMs) {
      run.score += S.goodBase + run.combo * S.goodCombo;
      run.combo = Math.min(run.combo + 1, S.goodComboCap);
      bumpProgress(S.goodProgress);
      judge('good');
      flash(c('good'), 'good');
    } else {
      run.combo = 0;
      run.score = Math.max(0, run.score - S.missPenalty);
      judge('miss');
      flash(c('miss'), 'miss');
    }
    run.heat = Math.max(0, Math.min(100, run.heat - P.pressureDropPerTap));
    persist();
    if (run.progress >= 100) finish('done');
  }

  function onIngredient(): void {
    if (run.phase !== 'play' || run.ingredientDue === null) return;
    const now = performance.now();
    if (Math.abs(now - run.ingredientDue) <= P.extraWindowMs) {
      run.score += S.extraHitBase + run.combo * S.extraHitCombo;
      run.ingredientHits += 1;
      bumpProgress(S.extraProgress);
      judge('extra-hit');
      flash(c('ingHit'), 'extra-hit');
    } else {
      run.ingredientMiss += 1;
      run.combo = 0;
      judge('extra-miss');
      flash(c('ingMiss'), 'extra-miss');
    }
    run.ingredientDue = null;
    run.cue += 1;
    scheduleCue(now, S.cueMinGapMs);
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
      pack.hooks?.onBeat?.();
    }

    if (run.ingredientDue === null && ts >= nextIngAt) {
      run.ingredientDue = ts + P.extraLeadMs;
    }
    if (run.ingredientDue !== null && ts > run.ingredientDue + S.extraMissGraceMs) {
      run.ingredientMiss += 1;
      run.combo = 0;
      run.ingredientDue = null;
      run.cue += 1;
      scheduleCue(ts, S.cueMissGapMs);
      judge('extra-miss');
      flash(c('ingMiss'), 'extra-miss');
    }

    const inZone = run.heat >= P.pressureZone[0] && run.heat <= P.pressureZone[1];
    if (inZone) {
      run.score += dt * S.zoneScorePerSec;
      bumpProgress(dt * S.zoneProgressPerSec);
    } else {
      run.score = Math.max(0, run.score - dt * S.outZonePenaltyPerSec);
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
    const saved = readRun(pack.storageKey);
    if (saved.phase === 'play' && saved.timeLeft > 1 && saved.progress < 100) {
      if (!isChartSeed(saved.seed)) saved.seed = newChartSeed();
      run = saved;
      const now = performance.now();
      playStart = now - (P.durationSec - run.timeLeft) * 1000;
      nextBeatAt = now + P.beatMs;
      run.ingredientDue = null;
      scheduleCue(now, 1600);
    } else if (saved.phase === 'result') {
      run = saved;
      const profile = readPlayerId();
      needNick = !profile.nickname;
      nickname = profile.nickname ?? '';
    } else {
      run = { ...defaultRun(), bestScore: saved.bestScore, bestStars: saved.bestStars, difficulty: saved.difficulty, seed: newChartSeed() };
    }
    applyLink();
    addEventListener('hashchange', applyLink);
    readPlayerId();
    raf = requestAnimationFrame(tick);
  });

  /** A challenge link fixes the chart; it wins over a saved run that is not in progress. Unsupported rulesets do not start. */
  function applyLink(): void {
    link = parseRhythmHash(pack.route, location.hash);
    const resolved = resolveGame(pack.leaderboardId, link.ruleset);
    if (!resolved.ok || !link.difficulty || !link.seed) return;
    if (run.phase === 'play' && run.difficulty === link.difficulty && run.seed === link.seed) return;
    if (run.phase === 'play' || run.phase === 'result') run = { ...defaultRun(), bestScore: run.bestScore, bestStars: run.bestStars };
    run = { ...run, difficulty: link.difficulty, seed: link.seed };
  }

  onDestroy(() => {
    removeEventListener('hashchange', applyLink);
    window.clearTimeout(msgTimer);
    cancelAnimationFrame(raf);
    if (run.phase === 'play') persist();
  });

  function playCurrent(): void {
    const diff = link.difficulty ?? run.difficulty;
    const seed = link.seed && link.seed > 0 ? link.seed : run.seed;
    const from = link.from ? { nick: link.from.nick, score: link.from.score, time: link.from.time } : undefined;
    const key = currentRuleset(pack.leaderboardId);
    location.hash = link.difficulty && link.seed ? rhythmHash(pack.route, diff, seed, from, key) : `${pack.route}`;
  }
</script>

<div class="sf" data-pack={pack.id} data-edition={pack.id} data-ruleset={resolution.ok ? rulesetKey : ''} data-difficulty={run.difficulty} data-seed={run.seed} data-chart={chartId(chart)} data-cues={chart.length} style="--kitchen:url('{new URL(pack.theme.background, document.baseURI).href}')">
  <header class="top">
    <button type="button" class="sf-exit" aria-label={c('exit')} onclick={onExit}>←</button>
    <div class="topmid">
      <h1>{c('title')}</h1>
      <span class="ver">v{version}</span>
      <RulesetBanner ruleset={resolution.ok ? rulesetKey : link.ruleset ?? ''} />
    </div>
    <span class="time" aria-label="timer">{timeLabel}s</span>
  </header>

  {#if !resolution.ok}
    <UnsupportedRuleset ruleset={resolution.requested} onPlayCurrent={playCurrent} {onExit} exitLabel={c('exit')} />
  {:else if run.phase === 'ready'}
    <div class="panel howto">
      <p class="line">{c('howto1')}</p>
      <p class="line">{c('howto2')}</p>
      <p class="line">{c('howto3')}</p>
      {#if link.from}<p class="vs" data-testid="rhythm-vs">{c('vs', { nick: link.from.nick, score: link.from.score })}</p>{/if}
      <div class="diffs" role="radiogroup" aria-label={c('diffLabel')}>
        {#each RHYTHM_DIFFICULTIES as d (d)}
          <button type="button" role="radio" aria-checked={run.difficulty === d} class="diff" class:on={run.difficulty === d} data-diff={d} onclick={() => pickDifficulty(d)}>{c(`diff.${d}`)}</button>
        {/each}
      </div>
      <p class="chartline"><span data-testid="rhythm-seed">{c('chart', { seed: run.seed })}</span> <button type="button" class="ghost mini" onclick={newChart}>{c('newChart')}</button> <button type="button" class="ghost mini" onclick={shareLink}>{c('share')}</button></p>
      {#if shareNote}<p class="chartline">{shareNote}</p>{/if}
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
          <div class="bar heat"><i style="width:{run.heat}%"></i><em style="left:{P.pressureZone[0]}%"></em><em style="left:{P.pressureZone[1]}%"></em></div>
        </div>
      </div>

      <div class="sf-stage">
        <p class="prompt" class:add={run.ingredientDue !== null} role="status">{prompt}</p>
        <div class="msgslot" aria-live="polite" data-testid="rhythm-judgement" data-judgement={msg ? msgJudgement : ''}>{msg || '\u00a0'}</div>
        <button
          type="button"
          class="wok"
          class:flash={beatFlash}
          class:due={run.ingredientDue !== null}
          style="--glow:{ringGlow}"
          onclick={run.ingredientDue !== null ? onIngredient : onStir}
          aria-label={run.ingredientDue !== null ? c('add') : c('stir')}
        >
          <pack.Stage {...stageProps} />
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
  .diffs { display: flex; gap: 8px; justify-content: center; margin: 10px 0 4px; }
  .diff { flex: 1; border-radius: 999px; padding: 8px 6px; border: 1px solid #5fd3ff; background: transparent; color: #eaf6ff; font-weight: 700; }
  .diff.on { background: #5fd3ff; color: #06212f; }
  .chartline { text-align: center; font-size: 0.78em; opacity: 0.9; margin: 6px 0; overflow-wrap: anywhere; }
  .ghost.mini { padding: 3px 10px; font-size: 0.85em; }
  .vs { text-align: center; font-weight: 700; color: #ffd34d; }
  .ver.ruleset { display: block; font-size: 0.72em; opacity: 0.85; word-break: break-all; }
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
  .ver { font-size: 11px; opacity: 0.75; font-weight: 700; overflow-wrap: anywhere; text-align: center; }
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
