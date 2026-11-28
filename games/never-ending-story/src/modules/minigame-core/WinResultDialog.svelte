<script lang="ts">
  import { t } from '../../lib/i18n';
  import { formatScore, formatTime, type WinResult } from './result';
  import type { Snippet } from 'svelte';

  let {
    result,
    onContinue,
    onReplay,
    onClose,
    children,
  }: {
    result: WinResult;
    onContinue?: () => void;
    onReplay?: () => void;
    onClose?: () => void;
    children?: Snippet;
  } = $props();

  let scrim = $state<HTMLDivElement | undefined>(undefined);
  let continueBtn = $state<HTMLButtonElement | undefined>(undefined);
  const scoreMetric = $derived(result.metric === 'score');
  const subtitle = $derived(result.subtitle ?? t('minigame.winSubtitle'));
  const hasActions = $derived(!!onReplay || !!onClose);
  const bestScoreText = $derived(result.bestScore != null ? formatScore(result.bestScore) : '—');

  /** Render on `.phone`, outside any translated event view, matching LeaveEventHost. */
  $effect(() => {
    const node = scrim;
    if (!node) return;
    const host = document.querySelector('.phone');
    if (host && node.parentElement !== host) host.appendChild(node);
    continueBtn?.focus();
    return () => {
      node.remove();
    };
  });
</script>

<div
  bind:this={scrim}
  class="win-scrim"
  data-testid="minigame-win-dialog"
  role="presentation"
>
  <div
    class="win-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="minigame-win-title"
    aria-describedby="minigame-win-subtitle"
    tabindex="-1"
  >
    <p class="game" data-testid="minigame-win-game">{result.gameLabel}</p>
    <h2 id="minigame-win-title" data-testid="minigame-win-title">{t('minigame.winTitle')}</h2>
    <p id="minigame-win-subtitle" class="sub" data-testid="minigame-win-subtitle">{subtitle}</p>
    <p class="diff" data-testid="minigame-win-difficulty">{result.difficulty}</p>

    <p
      class="stars"
      data-testid="minigame-win-stars"
      data-stars={String(result.stars)}
      aria-label={t('minigame.winStars', { n: result.stars })}
    >
      {#each [1, 2, 3] as n (n)}
        <span class="star" class:on={n <= result.stars} style="--d: {(n - 1) * 120}ms">{n <= result.stars ? '⭐' : '☆'}</span>
      {/each}
    </p>

    <dl class="stats">
      {#if scoreMetric}
        <div>
          <dt>{t('minigame.winScoreLabel')}</dt>
          <dd data-testid="minigame-win-score">{formatScore(result.score ?? 0)}</dd>
        </div>
        <div>
          <dt>{t('minigame.winBestLabel')}</dt>
          <dd data-testid="minigame-win-best">{bestScoreText}</dd>
        </div>
      {:else}
        <div>
          <dt>{t('minigame.winTimeLabel')}</dt>
          <dd data-testid="minigame-win-time">{formatTime(result.timeMs)}</dd>
        </div>
        <div>
          <dt>{t('minigame.winBestLabel')}</dt>
          <dd data-testid="minigame-win-best">{result.bestMs != null ? formatTime(result.bestMs) : '—'}</dd>
        </div>
      {/if}
    </dl>

    {#if scoreMetric}
      <p class="time-line" data-testid="minigame-win-time">{t('minigame.winTimeLabel')} {formatTime(result.timeMs)}</p>
    {/if}

    {#if result.isNewRecord}
      <p class="record" data-testid="minigame-win-record">{t('minigame.winNewRecord')}</p>
    {/if}

    {#if result.hints != null}
      <p class="hints" data-testid="minigame-win-hints">
        {result.hints > 0 ? t('minigame.winHints', { n: result.hints }) : t('minigame.winHintsNone')}
      </p>
    {/if}

    {#if result.detail}
      <p class="hints" data-testid="minigame-win-detail">{result.detail}</p>
    {/if}

    {#if hasActions}
      <div class="actions">
        {#if onReplay}
          <button
            bind:this={continueBtn}
            type="button"
            class="go"
            data-testid="minigame-win-replay"
            onclick={() => onReplay?.()}
          >
            {t('minigame.winReplay')}
          </button>
        {/if}
        {#if onClose}
          <button
            type="button"
            class="ghost"
            data-testid="minigame-win-close"
            onclick={() => onClose?.()}
          >
            {t('minigame.winClose')}
          </button>
        {/if}
      </div>
    {:else if onContinue}
      <button
        bind:this={continueBtn}
        type="button"
        class="go"
        data-testid="minigame-win-continue"
        onclick={() => onContinue()}
      >
        {t('minigame.winContinue')}
      </button>
    {/if}

    {#if children}
      <div class="extra">
        {@render children()}
      </div>
    {/if}
  </div>
</div>

<style>
  .win-scrim {
    position: absolute;
    inset: 0;
    z-index: 36;
    background: rgba(0, 0, 0, 0.62);
    display: flex;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .win-card {
    position: relative;
    width: 100%;
    max-width: 320px;
    /* auto margins centre the card, and let it scroll from the top when the screen is short */
    margin: auto 0;
    background: #06212f;
    border: 2px solid #39e0ff;
    border-radius: 16px;
    padding: 20px 16px 18px;
    color: #eaf6ff;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    outline: none;
    text-align: center;
  }
  .game {
    margin: 0 0 4px;
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #9ad8ea;
  }
  .win-card h2 {
    margin: 0;
    font-size: calc(var(--fs) + 10px);
    line-height: 1.2;
  }
  .sub { margin: 6px 0 10px; line-height: 1.45; }
  .diff {
    display: inline-block;
    margin: 0 0 12px;
    background: #0d4a66;
    border: 1px solid #39e0ff;
    border-radius: 999px;
    padding: 3px 10px;
    font-size: var(--fs-sm);
    font-weight: 700;
  }
  .stars {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin: 0 0 14px;
    font-size: 32px;
    letter-spacing: 2px;
    line-height: 1;
  }
  .star {
    display: inline-block;
    opacity: 0.35;
    transform: scale(0.6);
  }
  .star.on {
    opacity: 1;
    animation: star-pop 0.45s ease-out both;
    animation-delay: var(--d, 0ms);
  }
  @keyframes star-pop {
    0% { transform: scale(0.4); opacity: 0; }
    70% { transform: scale(1.18); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin: 0 0 10px;
    text-align: center;
  }
  .stats dt {
    margin: 0;
    font-size: var(--fs-sm);
    color: #9ad8ea;
  }
  .stats dd {
    margin: 2px 0 0;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    font-size: calc(var(--fs) + 4px);
  }
  .time-line {
    margin: 0 0 10px;
    font-size: var(--fs-sm);
    color: #cfe8f4;
    font-variant-numeric: tabular-nums;
  }
  .record {
    display: inline-block;
    margin: 0 0 10px;
    background: #ffcf4a;
    color: #3a2a00;
    border-radius: 999px;
    padding: 3px 10px;
    font-weight: 800;
    font-size: var(--fs-sm);
    animation: badge-pop 0.45s ease-out both;
  }
  @keyframes badge-pop {
    0% { transform: scale(0.7); opacity: 0; }
    70% { transform: scale(1.08); }
    100% { transform: scale(1); opacity: 1; }
  }
  .hints { margin: 0 0 14px; font-size: var(--fs-sm); color: #cfe8f4; }
  .actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .actions:has(button:only-child) { grid-template-columns: 1fr; }
  .go, .ghost {
    min-height: 44px;
    width: 100%;
    border-radius: 10px;
    font-weight: 700;
    padding: 8px 14px;
  }
  .go {
    border: 1px solid #39e0ff;
    background: #0d4a66;
    color: #fff;
  }
  .ghost {
    border: 1px solid #39e0ff;
    background: transparent;
    color: #fff;
  }
  .extra { margin-top: 10px; }
  .extra :global(.win-extra-note) {
    margin: 0 0 8px;
    font-size: var(--fs-sm);
    opacity: 0.85;
  }
  .extra :global(.win-nick) {
    display: grid;
    gap: 6px;
    text-align: left;
    margin: 0 0 8px;
  }
  .extra :global(.win-nick input) {
    height: 44px;
    border-radius: 10px;
    border: 1px solid #39e0ff;
    background: #082030;
    color: #fff;
    padding: 8px 10px;
  }
  .extra :global(button) {
    min-height: 44px;
    width: 100%;
    margin-top: 8px;
    border-radius: 10px;
    font-weight: 700;
    padding: 8px 14px;
  }
  .extra :global(button.win-extra-primary) {
    border: 0;
    background: #39e0ff;
    color: #06212f;
  }
  .extra :global(.win-vs) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border-radius: 14px;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 8px;
    text-align: center;
  }
  .extra :global(.win-vs.win) { background: #1f6b3a; }
  .extra :global(.win-vs.lose) { background: #6b1f2a; }
  .extra :global(.win-vs.tie) { background: #4a4a6b; }
  .extra :global(button.win-extra-ghost) {
    border: 1px solid #39e0ff;
    background: transparent;
    color: #fff;
  }
  @media (prefers-reduced-motion: reduce) {
    .star.on, .record { animation: none; transform: none; opacity: 1; }
  }
  /* Landscape phones: keep the whole result on one screen. */
  @media (max-height: 480px) {
    .win-scrim { padding: 6px 12px; }
    .win-card { max-width: 440px; padding: 8px 14px 10px; }
    .game { margin: 0; }
    .win-card h2 { font-size: calc(var(--fs) + 4px); }
    .sub { margin: 2px 0 4px; line-height: 1.25; }
    .diff { margin: 0 0 4px; }
    .stars { margin: 0 0 4px; font-size: 24px; }
    .stats { margin: 0 0 4px; gap: 4px; }
    .stats dd { font-size: var(--fs); }
    .time-line, .hints { margin: 0 0 4px; }
    .record { margin: 0 0 4px; }
    .go, .ghost { min-height: 38px; padding: 4px 12px; }
  }
</style>
