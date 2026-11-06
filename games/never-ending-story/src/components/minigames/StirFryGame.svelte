<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { readPlayerId, setNickname } from '../../lib/playerId';
  import {
    clearStirFry,
    defaultRun,
    readStirFry,
    starsFor,
    writeStirFry,
    type StirFryRun,
  } from '../../lib/stirfrySave';

  let { onExit }: { onExit: () => void } = $props();

  let run = $state<StirFryRun>(defaultRun());
  let nickname = $state('');
  let needNick = $state(false);
  let beatFlash = $state(false);
  let msg = $state('');
  let heatDir = $state(0);
  let raf = 0;
  let lastTs = 0;
  let beatPeriod = 700;
  let nextBeatAt = 0;
  let nextIngAt = 0;

  const stars = $derived(starsFor(run.score));

  function persist(): void {
    writeStirFry(run);
  }

  function toast(text: string): void {
    msg = text;
    window.setTimeout(() => {
      if (msg === text) msg = '';
    }, 900);
  }

  function start(): void {
    run = { ...defaultRun(), phase: 'play', startedAt: Date.now() };
    nextBeatAt = performance.now() + beatPeriod;
    nextIngAt = performance.now() + 2200;
    persist();
    lastTs = 0;
  }

  function finish(): void {
    run = { ...run, phase: 'result', timeLeft: 0 };
    persist();
    const profile = readPlayerId();
    needNick = !profile.nickname;
    nickname = profile.nickname ?? '';
  }

  function retry(): void {
    clearStirFry();
    needNick = false;
    start();
  }

  function saveNick(): void {
    if (!nickname.trim()) return;
    setNickname(nickname);
    needNick = false;
  }

  function onStir(): void {
    if (run.phase !== 'play') return;
    const now = performance.now();
    const delta = Math.abs(now - nextBeatAt);
    const windowMs = 160;
    if (delta <= windowMs) {
      const bonus = Math.round((1 - delta / windowMs) * 40) + run.combo * 2;
      run.score += 60 + bonus;
      run.combo = Math.min(run.combo + 1, 12);
      beatFlash = true;
      window.setTimeout(() => (beatFlash = false), 120);
      toast(t('stirfry.hit'));
    } else {
      run.combo = 0;
      run.score = Math.max(0, run.score - 15);
      toast(t('stirfry.miss'));
    }
    // heat drifts cooler when stirring well
    run.heat = Math.max(0, Math.min(100, run.heat - 3));
    persist();
  }

  function onIngredient(): void {
    if (run.phase !== 'play' || run.ingredientDue === null) return;
    const now = performance.now();
    if (Math.abs(now - run.ingredientDue) <= 450) {
      run.score += 120 + run.combo * 5;
      run.ingredientHits += 1;
      toast(t('stirfry.ingHit'));
    } else {
      run.ingredientMiss += 1;
      run.combo = 0;
      toast(t('stirfry.ingMiss'));
    }
    run.ingredientDue = null;
    nextIngAt = now + 2500 + Math.random() * 1500;
    persist();
  }

  function nudgeHeat(dir: number): void {
    if (run.phase !== 'play') return;
    heatDir = dir;
  }

  function releaseHeat(): void {
    heatDir = 0;
  }

  function tick(ts: number): void {
    if (run.phase !== 'play') {
      raf = requestAnimationFrame(tick);
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, (ts - lastTs) / 1000);
    lastTs = ts;

    run.timeLeft = Math.max(0, run.timeLeft - dt);
    // heat rises naturally; player counters with stir / heat buttons
    run.heat = Math.max(0, Math.min(100, run.heat + dt * 8 + heatDir * dt * 35));

    if (ts >= nextBeatAt) nextBeatAt += beatPeriod;
    if (run.ingredientDue === null && ts >= nextIngAt) {
      run.ingredientDue = ts + 900;
    }
    if (run.ingredientDue !== null && ts > run.ingredientDue + 500) {
      run.ingredientMiss += 1;
      run.combo = 0;
      run.ingredientDue = null;
      nextIngAt = ts + 2000;
      toast(t('stirfry.ingMiss'));
    }

    // score penalty if heat out of sweet band 40-70
    if (run.heat < 30 || run.heat > 80) {
      run.score = Math.max(0, run.score - dt * 20);
    } else {
      run.score += dt * 8;
    }

    if (Math.floor(ts / 250) % 2 === 0) persist();

    if (run.timeLeft <= 0) {
      finish();
    }
    raf = requestAnimationFrame(tick);
  }

  onMount(() => {
    const saved = readStirFry();
    if (saved.phase === 'play' && saved.timeLeft > 1) {
      run = saved;
      nextBeatAt = performance.now() + beatPeriod;
      nextIngAt = performance.now() + 1500;
    } else if (saved.phase === 'result') {
      run = saved;
      const profile = readPlayerId();
      needNick = !profile.nickname;
      nickname = profile.nickname ?? '';
    } else {
      run = defaultRun();
    }
    readPlayerId(); // ensure UUID exists
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    if (run.phase === 'play') persist();
  });
</script>

<div class="sf">
  <header class="top">
    <button type="button" class="back" onclick={onExit}>{t('stirfry.exit')}</button>
    <h1>{t('stirfry.title')}</h1>
    <span class="time">{Math.ceil(run.timeLeft)}s</span>
  </header>

  {#if run.phase === 'ready'}
    <div class="panel">
      <p>{t('stirfry.howto')}</p>
      <button type="button" class="primary" onclick={start}>{t('stirfry.start')}</button>
    </div>
  {:else if run.phase === 'play'}
    <div class="hudrow">
      <span>{t('stirfry.score')}: {Math.round(run.score)}</span>
      <span>x{run.combo}</span>
    </div>
    <div class="wok" class:flash={beatFlash}>
      <div class="wok-inner"></div>
      <div class="veg a"></div>
      <div class="veg b"></div>
      <div class="veg c"></div>
    </div>
    <div class="heat">
      <span>{t('stirfry.heat')}</span>
      <div class="bar"><i style="width:{run.heat}%"></i><em style="left:40%"></em><em style="left:70%"></em></div>
      <div class="heatbtns">
        <button type="button" onpointerdown={() => nudgeHeat(-1)} onpointerup={releaseHeat} onpointerleave={releaseHeat}>{t('stirfry.cooler')}</button>
        <button type="button" onpointerdown={() => nudgeHeat(1)} onpointerup={releaseHeat} onpointerleave={releaseHeat}>{t('stirfry.hotter')}</button>
      </div>
    </div>
    <div class="actions">
      <button type="button" class="stir" onclick={onStir}>{t('stirfry.stir')}</button>
      <button
        type="button"
        class="ing"
        class:due={run.ingredientDue !== null}
        disabled={run.ingredientDue === null}
        onclick={onIngredient}
      >{t('stirfry.add')}</button>
    </div>
    {#if msg}<p class="msg" role="status">{msg}</p>{/if}
  {:else}
    <div class="panel result">
      <p class="stars">{'⭐'.repeat(stars)}</p>
      <h2>{t('stirfry.resultTitle')}</h2>
      <p>{t('stirfry.resultScore', { n: Math.round(run.score) })}</p>
      <p class="small">{t('stirfry.resultDetail', { hits: run.ingredientHits, miss: run.ingredientMiss })}</p>
      {#if needNick}
        <label class="nick">
          <span>{t('stirfry.nickname')}</span>
          <input bind:value={nickname} maxlength="24" placeholder={t('stirfry.nicknamePh')} />
        </label>
        <button type="button" class="primary" onclick={saveNick}>{t('stirfry.saveNick')}</button>
      {:else}
        <button type="button" class="primary" onclick={retry}>{t('stirfry.retry')}</button>
        <button type="button" class="ghost" onclick={onExit}>{t('stirfry.exit')}</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .sf { position: absolute; inset: 0; z-index: 9; background: #1a2430; color: #eaf6ff; display: flex; flex-direction: column; padding: calc(10px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)); }
  .top { display: flex; align-items: center; gap: 8px; }
  .top h1 { flex: 1; margin: 0; font-size: calc(var(--fs) + 2px); text-align: center; }
  .top .back, .ghost { background: transparent; border: 1px solid #39e0ff; color: #fff; border-radius: 12px; padding: 8px 10px; font-weight: 700; }
  .time { font-variant-numeric: tabular-nums; font-weight: 800; min-width: 42px; text-align: right; }
  .panel { margin: auto 0; background: #0d2a3c; border: 2px solid #39e0ff; border-radius: 16px; padding: 18px; text-align: center; }
  .panel p { line-height: 1.45; }
  .primary { display: block; width: 100%; margin-top: 12px; min-height: 48px; border: 0; border-radius: 12px; background: #39e0ff; color: #06212f; font-weight: 800; font-size: var(--fs); }
  .hudrow { display: flex; justify-content: space-between; margin: 8px 0; font-weight: 700; }
  .wok { position: relative; height: 210px; margin: 6px auto; width: min(100%, 280px); border-radius: 50%; background: #2b3340; border: 8px solid #555; box-shadow: inset 0 0 0 10px #1c222b; }
  .wok.flash { background: #3d4a2e; }
  .wok-inner { position: absolute; inset: 18%; border-radius: 50%; background: #6b4a2a; }
  .veg { position: absolute; width: 28px; height: 18px; border-radius: 6px; }
  .veg.a { left: 36%; top: 42%; background: #3ecf6a; transform: rotate(-20deg); }
  .veg.b { left: 52%; top: 48%; background: #ff6b4a; transform: rotate(25deg); }
  .veg.c { left: 44%; top: 56%; background: #ffe066; }
  .heat { margin: 8px 0; }
  .bar { position: relative; height: 16px; border-radius: 8px; background: #0a1822; border: 1px solid #39e0ff; overflow: hidden; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #4db2ff, #ffcf4a, #ff5d73); }
  .bar em { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255,255,255,0.7); }
  .heatbtns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .heatbtns button, .actions button { min-height: 52px; border-radius: 14px; border: 2px solid #39e0ff; background: #0d4a66; color: #fff; font-weight: 800; font-size: var(--fs); }
  .actions { display: grid; grid-template-columns: 1.2fr 1fr; gap: 8px; margin-top: auto; }
  .stir { background: #ffcf4a !important; color: #3a2a00 !important; border-color: #ffcf4a !important; }
  .ing:disabled { opacity: 0.35; }
  .ing.due { background: #39e0ff; color: #06212f; animation: pulse 0.6s ease infinite alternate; }
  @keyframes pulse { from { transform: scale(1); } to { transform: scale(1.04); } }
  .msg { text-align: center; min-height: 1.2em; margin: 6px 0 0; font-size: var(--fs-sm); }
  .result .stars { font-size: 28px; margin: 0; }
  .small { font-size: var(--fs-sm); opacity: 0.85; }
  .nick { display: grid; gap: 6px; text-align: left; margin-top: 12px; }
  .nick input { min-height: 44px; border-radius: 10px; border: 1px solid #39e0ff; background: #082030; color: #fff; padding: 8px 10px; }
  .ghost { width: 100%; margin-top: 8px; }
</style>
