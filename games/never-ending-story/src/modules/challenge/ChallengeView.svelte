<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { version } from '../../../package.json';
  import { t } from '../../lib/i18n';
  import { imageUrl } from '../../lib/imageUrl';
  import { artworkFile } from '../cutscene';
  import { nextPhase, RulesetBanner, submitFinishedRun, UnsupportedRuleset } from '../minigame-core';
  import { readPlayerId, setNickname } from '../../lib/playerId';
  import {
    DIFFICULTIES, challengeHash, clearRun, compare, fmtTime, leaderboard, newSeed, readRun,
    rng, scoreFor, shareUrl, shuffle, writeRun,
    type ChallengeParams, type Difficulty, type Tally,
  } from './challenge';
  import { challengeScoring, CHALLENGE_VERSION } from './ruleset';
  import { crossRules } from '../crossword/ruleset';
  import { jigRules } from '../jigsaw/ruleset';
  import { slideRules } from '../slide/ruleset';
  import { currentRuleset, resolveGame, versionIn } from '../../lib/rulesetCatalog';
  import { appendRun, newSessionId } from './runLog';
  import { unpackRun } from './runProto';
  import { submitRun } from '../../lib/cloudSync';

  let { params, onExit, onBoard }: { params: ChallengeParams; onExit: () => void; onBoard: () => void } = $props();

  type Board =
    | { kind: 'cross'; words: { tiles: string[]; clue: string }[]; wi: number; filled: number; pool: string[]; used: boolean[] }
    | { kind: 'jig'; cols: number; rows: number; placed: number[]; tray: number[]; sel: number | null }
    | { kind: 'slide'; n: number; cells: number[]; moves: number; scramble: number };

  type Run = {
    id: string;
    game: ChallengeParams['game'];
    difficulty: Difficulty;
    seed: number;
    from: ChallengeParams['from'];
    phase: 'pick' | 'play' | 'result';
    board: Board | null;
    tally: Tally;
    combo: number;
    elapsedMs: number;
    score: number;
    sessionId: string;
    token?: string;
  };

  const runId = (p: ChallengeParams) => `${p.game}|${p.difficulty ?? ''}|${p.seed ?? ''}|${p.ruleset ?? ''}|${p.from?.nick ?? ''}|${p.runToken ?? ''}`;

  function freshRun(p: ChallengeParams): Run {
    return {
      id: runId(p), game: p.game, difficulty: p.difficulty ?? 'easy', seed: p.seed ?? newSeed(), from: p.from,
      phase: p.difficulty && p.seed ? 'pick' : 'pick', board: null,
      tally: { correct: 0, mistakes: 0, hints: 0, maxCombo: 0 }, combo: 0, elapsedMs: 0, score: 0, sessionId: '',
    };
  }

  const saved = readRun<Run>();
  let run = $state<Run>(saved && saved.id === runId(params) ? saved : freshRun(params));
  const resolution = $derived(resolveGame(params.game, params.ruleset));
  const rulesetKey = $derived(resolution.ok ? resolution.key : currentRuleset(params.game));
  const scoring = $derived(challengeScoring(resolution.ok ? versionIn(resolution, 'challenge') : CHALLENGE_VERSION) ?? challengeScoring(CHALLENGE_VERSION)!);
  const locked = !!(params.difficulty && params.seed);
  const profile = readPlayerId();
  let nick = $state(profile.nickname ?? '');
  let hasNick = $state(!!profile.nickname);
  let flashBad = $state(false);
  let note = $state('');
  let timer = 0;
  let verified = $state<null | boolean>(null);
  let lastToken = '';

  if (params.runToken && run.from) {
    void unpackRun(params.runToken).then((res) => {
      verified = !!res?.valid;
      // Record the challenger's embedded run once (unverified: it is not ranked online).
      if (res?.valid && params.runToken) submitRun(params.runToken, false);
      if (res?.valid && run.from) {
        run.from = { nick: res.run.nickname || run.from.nick, score: res.run.score, time: Math.floor(res.run.timeMs / 1000), sessionId: res.run.sessionId };
      }
    });
  }

  $effect(() => writeRun($state.snapshot(run)));

  function activeCross() {
    const version = resolution.ok ? versionIn(resolution, 'crossword') : '1.0.0';
    return crossRules(version) ?? crossRules('1.0.0')!;
  }
  function build(): Board {
    const rand = rng(run.seed * 7 + DIFFICULTIES.indexOf(run.difficulty));
    if (run.game === 'cross') {
      const gen = activeCross();
      const count = gen.words[run.difficulty];
      const bank = Array.from({ length: gen.bank }, (_, i) => t(`challenge.word.${i + 1}`).split('|'));
      const words = shuffle(bank, rand).slice(0, count).map(([w, clue]) => ({ tiles: Array.from(w), clue }));
      const b: Board = { kind: 'cross', words, wi: 0, filled: 0, pool: [], used: [] };
      dealCross(b, rand);
      return b;
    }
    if (run.game === 'jig') {
      const gen = jigRules(resolution.ok ? versionIn(resolution, 'jigsaw') : '1.0.0') ?? jigRules('1.0.0')!;
      const [cols, rows] = gen.grid[run.difficulty];
      return { kind: 'jig', cols, rows, placed: [], tray: shuffle(Array.from({ length: cols * rows }, (_, i) => i), rand), sel: null };
    }
    const slideGen = slideRules(resolution.ok ? versionIn(resolution, 'slide') : '1.0.0') ?? slideRules('1.0.0')!;
    const n = slideGen.size[run.difficulty];
    const scramble = slideGen.scramble[run.difficulty];
    const cells = Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n));
    let blank = n * n - 1;
    let prev = -1;
    for (let k = 0; k < scramble; k++) {
      const opts = neighbors(blank, n).filter((x) => x !== prev);
      const pick = opts[Math.floor(rand() * opts.length)];
      [cells[blank], cells[pick]] = [cells[pick], cells[blank]];
      prev = blank;
      blank = pick;
    }
    return { kind: 'slide', n, cells, moves: 0, scramble };
  }

  function dealCross(b: Extract<Board, { kind: 'cross' }>, rand = rng(run.seed + b.wi * 31)): void {
    const decoys = activeCross().decoys[run.difficulty];
    const extra = Array.from(t('challenge.decoys')).filter((c) => c.trim());
    b.pool = shuffle([...b.words[b.wi].tiles, ...shuffle(extra, rand).slice(0, decoys)], rand);
    b.used = b.pool.map(() => false);
    b.filled = 0;
  }

  function neighbors(i: number, n: number): number[] {
    const r = Math.floor(i / n), c = i % n, out: number[] = [];
    if (r > 0) out.push(i - n);
    if (r < n - 1) out.push(i + n);
    if (c > 0) out.push(i - 1);
    if (c < n - 1) out.push(i + 1);
    return out;
  }

  function start(): void {
    if (!hasNick) {
      if (!nick.trim()) return;
      setNickname(nick);
      hasNick = true;
    }
    run.board = build();
    run.tally = { correct: 0, mistakes: 0, hints: 0, maxCombo: 0 };
    run.combo = 0;
    run.elapsedMs = 0;
    run.sessionId = newSessionId();
    run.phase = 'play';
  }

  function good(): void {
    run.tally.correct += 1;
    run.combo += 1;
    run.tally.maxCombo = Math.max(run.tally.maxCombo, run.combo);
  }
  function bad(): void {
    run.tally.mistakes += 1;
    run.combo = 0;
    flashBad = true;
    window.setTimeout(() => (flashBad = false), 250);
  }

  function tapTile(i: number): void {
    const b = run.board;
    if (b?.kind !== 'cross' || b.used[i]) return;
    const want = b.words[b.wi].tiles[b.filled];
    if (b.pool[i] !== want) return bad();
    b.used[i] = true;
    b.filled += 1;
    good();
    advanceCross(b);
  }
  function advanceCross(b: Extract<Board, { kind: 'cross' }>): void {
    if (b.filled < b.words[b.wi].tiles.length) return;
    if (b.wi + 1 >= b.words.length) { void finish(); return; }
    b.wi += 1;
    dealCross(b);
  }

  function hint(): void {
    const b = run.board;
    if (!b) return;
    run.tally.hints += 1;
    run.combo = 0;
    if (b.kind === 'cross') {
      const want = b.words[b.wi].tiles[b.filled];
      const i = b.pool.findIndex((c, k) => c === want && !b.used[k]);
      if (i >= 0) b.used[i] = true;
      b.filled += 1;
      advanceCross(b);
    } else if (b.kind === 'jig') {
      const piece = b.tray[0];
      b.tray = b.tray.slice(1);
      b.placed = [...b.placed, piece];
      b.sel = null;
      if (!b.tray.length) finish();
    }
  }

  function pickPiece(p: number): void {
    if (run.board?.kind === 'jig') run.board.sel = p;
  }
  function dropAt(slot: number): void {
    const b = run.board;
    if (b?.kind !== 'jig' || b.sel === null) return;
    if (b.sel !== slot) return bad();
    b.placed = [...b.placed, slot];
    b.tray = b.tray.filter((x) => x !== slot);
    b.sel = null;
    good();
    if (!b.tray.length) finish();
  }

  function tapCell(i: number): void {
    const b = run.board;
    if (b?.kind !== 'slide') return;
    const blank = b.cells.indexOf(0);
    if (!neighbors(blank, b.n).includes(i)) return bad();
    [b.cells[blank], b.cells[i]] = [b.cells[i], b.cells[blank]];
    b.moves += 1;
    if (b.cells.every((v, k) => v === (k + 1) % (b.n * b.n))) {
      run.tally.correct = b.n * b.n - 1 + 4;
      run.tally.maxCombo = 0;
      run.tally.mistakes += Math.max(0, Math.floor((b.moves - b.scramble) / 4));
      finish();
    }
  }

  async function finish(): Promise<void> {
    if (run.phase !== 'play') return;
    const phase = nextPhase(run.phase, 'end');
    if (phase !== 'result') return;
    const time = Math.floor(run.elapsedMs / 1000);
    run.score = scoreFor(run.game, run.difficulty, run.tally, time, scoring);
    run.phase = phase;
    const me = readPlayerId();
    const base = { game: run.game, difficulty: run.difficulty, seed: run.seed, at: Date.now() };
    await leaderboard.submit({ ...base, nick: me.nickname ?? '?', playerId: me.playerId, score: run.score, time, source: 'me', ruleset: rulesetKey });
    if (run.from) await leaderboard.submit({ ...base, nick: run.from.nick, playerId: null, score: run.from.score, time: run.from.time, source: 'challenger', ruleset: rulesetKey });
    lastToken = await submitFinishedRun({
      sessionId: run.sessionId, playerId: me.playerId, nickname: me.nickname ?? '', game: run.game, difficulty: run.difficulty,
      seed: run.seed, score: run.score, timeMs: run.elapsedMs, version: `${version};${rulesetKey}`, ruleset: rulesetKey, timestampMs: Date.now(),
      challengerSessionId: run.from?.sessionId ?? '', challengerNickname: run.from?.nick ?? '',
      challengerScore: run.from?.score ?? 0, challengerTimeMs: (run.from?.time ?? 0) * 1000,
    });
    run.token = lastToken;
    try {
      await appendRun({
        sessionId: run.sessionId, playerId: me.playerId, nickname: me.nickname, game: run.game, difficulty: run.difficulty,
        seed: run.seed, score: run.score, timeMs: run.elapsedMs, version: `${version};${rulesetKey}`, timestamp: new Date().toISOString(), challengeFrom: run.from,
      });
    } catch {
      /* Web Crypto unavailable (non-secure context) — run still counts locally. */
    }
  }

  async function share(): Promise<void> {
    const me = readPlayerId();
    const url = shareUrl(challengeHash(run.game, run.difficulty, run.seed, { nick: me.nickname ?? '?', token: run.token ?? '', score: run.score, time: Math.floor(run.elapsedMs / 1000) }, rulesetKey));
    const text = t('challenge.shareText', { game: t(`challenge.game.${run.game}`), score: run.score, time: fmtTime(run.elapsedMs / 1000) });
    try {
      if (navigator.share) {
        await navigator.share({ title: t('challenge.title'), text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      note = t('challenge.copied');
    } catch {
      note = url;
    }
  }

  function again(sameSeed: boolean): void {
    if (!sameSeed && !locked) run.seed = newSeed();
    start();
  }

  function exit(): void {
    clearRun();
    onExit();
  }

  onMount(() => {
    timer = window.setInterval(() => {
      if (run.phase === 'play' && document.visibilityState === 'visible') run.elapsedMs += 250;
    }, 250);
  });
  onDestroy(() => window.clearInterval(timer));

  const secs = $derived(Math.floor(run.elapsedMs / 1000));
  const liveScore = $derived(scoreFor(run.game, run.difficulty, run.tally, secs, scoring));

  function playCurrent(): void {
    const diff = run.difficulty;
    const seed = params.seed ?? run.seed;
    const from = run.from ? { nick: run.from.nick, token: params.runToken ?? '', score: run.from.score, time: run.from.time } : undefined;
    window.location.hash = challengeHash(run.game, diff, seed, from, currentRuleset(run.game));
  }
  const verdict = $derived(run.from ? compare({ score: run.score, time: secs }, run.from) : null);
</script>

<div class="ch" class:bad={flashBad} data-testid="challenge" data-ruleset={resolution.ok ? rulesetKey : ''}>
  <div class="top">
    <button type="button" class="x" aria-label={t('stirfry.exit')} onclick={exit}>✕</button>
    <div class="mid">
      <h1>{t('challenge.title')} · {t(`challenge.game.${run.game}`)}</h1>
      <span class="ver">v{version} · {t(`challenge.diff.${run.difficulty}`)} · #{run.seed}</span>
      <RulesetBanner ruleset={resolution.ok ? rulesetKey : params.ruleset ?? ''} />
    </div>
    <button type="button" class="x" aria-label={t('challenge.board')} onclick={onBoard}>🏆</button>
  </div>

  {#if !resolution.ok}
    <UnsupportedRuleset ruleset={resolution.requested} onPlayCurrent={playCurrent} />
  {:else if run.from}
    <div class="banner" data-testid="challenge-banner">
      ⚔️ {t('challenge.from', { nick: run.from.nick, score: run.from.score, time: fmtTime(run.from.time) })}
      {#if verified === true}<small> ✓</small>{:else if verified === false}<small> · {t('challenge.unverified')}</small>{/if}
    </div>
  {/if}

  {#if resolution.ok && run.phase === 'pick'}
    <div class="body center">
      <p class="lead">{t('challenge.howto')}</p>
      {#if !hasNick}
        <label class="nick">{t('stirfry.nickname')}
          <input bind:value={nick} maxlength="24" placeholder={t('stirfry.nicknamePh')} />
        </label>
      {/if}
      {#if locked}
        <p class="lock">{t('challenge.lockedDiff', { d: t(`challenge.diff.${run.difficulty}`) })}</p>
      {:else}
        <div class="diffs" role="radiogroup">
          {#each DIFFICULTIES as d (d)}
            <button type="button" role="radio" aria-checked={run.difficulty === d} class:on={run.difficulty === d} onclick={() => (run.difficulty = d)}>
              <b>{t(`challenge.diff.${d}`)}</b><small>{t('challenge.par', { time: fmtTime(scoring.par[run.game][d]) })}</small>
            </button>
          {/each}
        </div>
      {/if}
      <p class="rules">{t('challenge.rules')}</p>
    </div>
    <div class="foot">
      <button type="button" class="primary" disabled={!hasNick && !nick.trim()} onclick={start}>{t('challenge.start')}</button>
    </div>
  {:else if resolution.ok && run.phase === 'play' && run.board}
    <div class="hud">
      <span>⏱ {fmtTime(secs)}</span>
      <span>{t('challenge.points')} {liveScore}</span>
      <span>🔥 x{run.combo}</span>
    </div>
    <div class="body">
      {#if run.board.kind === 'cross'}
        {@const w = run.board.words[run.board.wi]}
        <p class="prog">{t('challenge.wordN', { n: run.board.wi + 1, total: run.board.words.length })}</p>
        <p class="clue">{w.clue}</p>
        <div class="slots">
          {#each w.tiles as ch, i (i)}<span class="slot" class:f={i < run.board.filled}>{i < run.board.filled ? ch : ''}</span>{/each}
        </div>
        <div class="pool">
          {#each run.board.pool as ch, i (i)}
            <button type="button" class="tile" disabled={run.board.used[i]} onclick={() => tapTile(i)}>{ch}</button>
          {/each}
        </div>
      {:else if run.board.kind === 'jig'}
        {@const b = run.board}
        <div class="jgb" style="grid-template-columns:repeat({b.cols},1fr);grid-template-rows:repeat({b.rows},1fr)">
          {#each Array.from({ length: b.cols * b.rows }, (_, i) => i) as i (i)}
            {#if b.placed.includes(i)}
              <div class="pc" style="background-image:url('{imageUrl(artworkFile('prologue.house-map'))}');background-size:{b.cols * 100}% {b.rows * 100}%;background-position:{(i % b.cols) * (100 / (b.cols - 1))}% {Math.floor(i / b.cols) * (100 / (b.rows - 1))}%"></div>
            {:else}
              <button type="button" class="hole" aria-label={`slot ${i + 1}`} onclick={() => dropAt(i)}></button>
            {/if}
          {/each}
        </div>
        <div class="tray">
          {#each b.tray as p (p)}
            <button type="button" class="pc tp" class:sel={b.sel === p} aria-label={`piece ${p + 1}`} onclick={() => pickPiece(p)}
              style="background-image:url('{imageUrl(artworkFile('prologue.house-map'))}');background-size:{b.cols * 100}% {b.rows * 100}%;background-position:{(p % b.cols) * (100 / (b.cols - 1))}% {Math.floor(p / b.cols) * (100 / (b.rows - 1))}%"></button>
          {/each}
        </div>
      {:else}
        {@const b = run.board}
        <p class="prog">{t('challenge.moves', { n: b.moves })}</p>
        <div class="sg" style="grid-template-columns:repeat({b.n},1fr)">
          {#each b.cells as v, i (i)}
            {#if v === 0}<div class="st empty"></div>{:else}<button type="button" class="st" onclick={() => tapCell(i)}>{v}</button>{/if}
          {/each}
        </div>
        <p class="prog">{t('challenge.slideGoal')}</p>
      {/if}
    </div>
    <div class="foot">
      {#if run.board.kind !== 'slide'}<button type="button" class="ghost" onclick={hint}>{t('challenge.hint')}</button>{/if}
    </div>
  {:else if resolution.ok}
    <div class="body center" data-testid="challenge-result">
      <p class="big">{run.score}</p>
      <p class="sub">{t('challenge.points')} · ⏱ {fmtTime(secs)}</p>
      <p class="detail">{t('challenge.detail', { c: run.tally.correct, m: run.tally.mistakes, h: run.tally.hints, combo: run.tally.maxCombo })}</p>
      {#if run.from && verdict}
        <div class="vs {verdict}">
          <b>{t(`challenge.${verdict}`, { nick: run.from.nick })}</b>
          <span>{t('challenge.vsLine', { me: run.score, meT: fmtTime(secs), them: run.from.score, themT: fmtTime(run.from.time), nick: run.from.nick })}</span>
        </div>
      {/if}
      {#if note}<p class="note">{note}</p>{/if}
    </div>
    <div class="foot two">
      <button type="button" class="primary" onclick={share}>{run.from ? t('challenge.shareBack') : t('challenge.share')}</button>
      <button type="button" class="ghost" onclick={() => again(true)}>{t('challenge.retry')}</button>
      {#if !locked}<button type="button" class="ghost" onclick={() => again(false)}>{t('challenge.newSeed')}</button>{/if}
      <button type="button" class="ghost" onclick={onBoard}>{t('challenge.board')}</button>
    </div>
  {/if}
</div>

<style>
  .ch { position: absolute; inset: 0; z-index: 9; height: 100dvh; background: #15202b; color: #eaf6ff; display: flex; flex-direction: column; gap: 8px; padding: calc(8px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)); box-sizing: border-box; overflow: hidden; transition: background 0.2s; }
  .ch.bad { background: #3a1d24; }
  .top { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 8px; flex: none; }
  .mid { text-align: center; min-width: 0; }
  .mid h1 { margin: 0; font-size: calc(var(--fs) + 1px); line-height: 1.2; }
  .ver { font-size: 11px; opacity: 0.75; font-weight: 700; overflow-wrap: anywhere; }
  .x { width: 44px; height: 44px; border-radius: 50%; border: 2px solid #39e0ff; background: #0d4a66; color: #fff; font-size: 18px; }
  .banner { flex: none; background: #ffcf4a; color: #3a2a00; border-radius: 12px; padding: 8px 12px; font-weight: 800; text-align: center; font-size: var(--fs-sm); }
  .hud { flex: none; display: flex; justify-content: space-between; background: rgba(6, 30, 48, 0.92); border: 1px solid #39e0ff; border-radius: 12px; padding: 8px 12px; font-weight: 800; font-variant-numeric: tabular-nums; }
  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
  .center { justify-content: center; align-items: center; text-align: center; }
  .lead { margin: 0; font-size: calc(var(--fs) + 1px); font-weight: 700; }
  .rules, .lock, .detail, .prog { margin: 0; font-size: var(--fs-sm); opacity: 0.85; text-align: center; }
  .nick { display: flex; flex-direction: column; gap: 6px; font-weight: 700; width: 100%; max-width: 300px; }
  .nick input { padding: 10px; border-radius: 10px; border: 2px solid #39e0ff; font-size: var(--fs); }
  .diffs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 100%; }
  .diffs button { display: flex; flex-direction: column; gap: 4px; padding: 14px 6px; border-radius: 14px; border: 2px solid #39a8d8; background: #1d3346; color: #fff; }
  .diffs button.on { background: #ffcf4a; color: #3a2a00; border-color: #ffcf4a; }
  .foot { flex: none; display: flex; gap: 8px; justify-content: center; min-height: 52px; }
  .foot.two { display: grid; grid-template-columns: 1fr 1fr; }
  .primary, .ghost { min-height: 52px; border-radius: 14px; font-weight: 800; font-size: var(--fs); padding: 0 16px; }
  .primary { background: #ffcf4a; color: #3a2a00; border: 0; flex: 1; }
  .primary:disabled { opacity: 0.5; }
  .ghost { background: #0d4a66; color: #fff; border: 2px solid #39e0ff; }
  .clue { margin: 0; background: #f4efe2; color: #13324a; border-radius: 12px; padding: 12px; font-weight: 700; text-align: center; }
  .slots { display: flex; gap: 6px; justify-content: center; }
  .slot { width: 48px; height: 56px; border-radius: 10px; border: 2px dashed #39e0ff; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 800; }
  .slot.f { background: #fff; color: #13324a; border-style: solid; }
  .pool { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
  .tile { width: 56px; height: 56px; border-radius: 12px; border: 2px solid #39a8d8; background: #fff; color: #13324a; font-size: 26px; font-weight: 800; }
  .tile:disabled { opacity: 0.2; }
  .jgb { display: grid; gap: 2px; width: min(100%, 300px); aspect-ratio: 3 / 4; margin: 0 auto; background: #efe6d2; border: 6px solid #6b4a2f; border-radius: 8px; flex: none; }
  .hole { border: 1px dashed rgba(0, 0, 0, 0.3); background: transparent; }
  .pc { border: 0; padding: 0; border-radius: 3px; background-repeat: no-repeat; }
  .tray { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; background: #2c3e50; border-radius: 12px; padding: 8px; }
  .tp { width: 54px; height: 54px; }
  .tp.sel { outline: 3px solid #ffcf4a; }
  .sg { display: grid; gap: 6px; width: min(100%, 320px); aspect-ratio: 1; margin: 0 auto; background: #2d55a6; padding: 8px; border-radius: 14px; box-sizing: border-box; }
  .st { border: 0; border-radius: 10px; background: #f2b632; color: #3b2412; font-size: 28px; font-weight: 800; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3); }
  .st.empty { background: rgba(0, 0, 0, 0.2); box-shadow: none; }
  .big { margin: 0; font-size: 64px; font-weight: 900; color: #ffcf4a; line-height: 1; }
  .sub { margin: 0; font-weight: 700; }
  .vs { display: flex; flex-direction: column; gap: 4px; padding: 12px; border-radius: 14px; width: 100%; box-sizing: border-box; }
  .vs.win { background: #1f6b3a; }
  .vs.lose { background: #6b1f2a; }
  .vs.tie { background: #4a4a6b; }
  .note { font-size: 12px; word-break: break-all; margin: 0; }
</style>
