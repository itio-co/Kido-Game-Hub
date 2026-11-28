<script lang="ts">
  import { t } from '../lib/i18n';
  import { MAX_BATTERIES, weekRow, type StreakView } from '../lib/streak';

  let {
    view,
    batteryGranted,
    onClose,
  }: {
    view: StreakView;
    batteryGranted: boolean;
    onClose: () => void;
  } = $props();

  const week = $derived(weekRow(view));
  const batteryList = $derived(Array.from({ length: view.maxBatteries || MAX_BATTERIES }, (_, i) => i < view.batteries));
  const bursts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
</script>

<div class="scrim stc-scrim" role="presentation">
  <dialog
    class="sheet calendar-sheet stc-sheet"
    aria-labelledby="stc-title"
    data-testid="streak-celebrate-dialog"
    data-granted={batteryGranted ? '1' : '0'}
    open
    onclick={(event) => event.stopPropagation()}
  >
    <div class="stc-burst" aria-hidden="true">
      {#each bursts as i (i)}
        <span class="stc-spark" class:bolt={i % 3 === 0} style="--i:{i}"></span>
      {/each}
    </div>

    <div class="sheet-body stc-body">
      <p class="stc-eyebrow">{t('streak.celebrate.eyebrow')}</p>
      <h2 id="stc-title" data-testid="streak-celebrate-title">{t('streak.celebrate.title')}</h2>

      <div class="st-hero stc-hero">
        <svg class="st-bolt stc-bolt" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true">
          <path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6z" fill="currentColor" stroke="#3a2a00" stroke-width="1.2" stroke-linejoin="round" />
        </svg>
        <p class="st-count" data-testid="streak-celebrate-count">{view.count}</p>
        <p class="st-unit">{t('streak.days')}</p>
      </div>

      <p class="st-status" data-testid="streak-celebrate-status">{t('streak.state.done')}</p>

      <div
        class="st-batteries stc-batteries"
        class:pop={batteryGranted}
        data-testid="streak-celebrate-batteries"
        data-count={String(view.batteries)}
        role="img"
        aria-label={t('streak.batteries', { n: view.batteries, max: view.maxBatteries })}
      >
        {#each batteryList as full, i (i)}
          <svg class="st-battery" class:full class:fresh={batteryGranted && i === view.batteries - 1} viewBox="0 0 30 16" width="34" height="18" aria-hidden="true">
            <rect x="1" y="1" width="24" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2" />
            <rect x="26" y="5" width="3" height="6" rx="1" fill="currentColor" />
            {#if full}<rect x="4" y="4" width="18" height="8" rx="1.5" fill="currentColor" />{/if}
          </svg>
        {/each}
      </div>

      {#if batteryGranted}
        <p class="stc-grant" data-testid="streak-celebrate-grant">{t('streak.celebrate.grant')}</p>
      {:else}
        <p class="stc-grant full" data-testid="streak-celebrate-full">{t('streak.celebrate.full')}</p>
      {/if}

      <ol class="st-week" data-testid="streak-celebrate-week">
        {#each week as d, i (d.date)}
          <li
            class="st-day"
            class:win={d.kind === 'win'}
            class:saved={d.kind === 'saved'}
            class:today={d.today}
            class:future={d.future}
            data-date={d.date}
            data-kind={d.kind ?? ''}
          >
            <span class="st-dot">
              {#if d.kind === 'win'}
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6z" fill="currentColor" /></svg>
              {:else if d.kind === 'saved'}
                <svg viewBox="0 0 30 16" width="18" height="10" aria-hidden="true">
                  <rect x="1" y="1" width="24" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.4" />
                  <rect x="26" y="5" width="3" height="6" rx="1" fill="currentColor" />
                  <rect x="4" y="4" width="9" height="8" rx="1.5" fill="currentColor" />
                </svg>
              {/if}
            </span>
            <span class="st-label">{t(`streak.day.${i}`)}</span>
          </li>
        {/each}
      </ol>

      <div class="st-cards">
        <div class="st-card" data-testid="streak-celebrate-best">
          <span class="st-k">{t('streak.best')}</span>
          <span class="st-v">{t('streak.bestValue', { n: view.best })}</span>
        </div>
        <div class="st-card" data-testid="streak-celebrate-wins">
          <span class="st-k">{t('streak.wins')}</span>
          <span class="st-v">{t('streak.winsValue', { n: view.totalWins })}</span>
        </div>
      </div>
    </div>
    <div class="sheet-foot">
      <button type="button" class="close" data-testid="streak-celebrate-close" onclick={onClose}>{t('streak.celebrate.close')}</button>
    </div>
  </dialog>
</div>

<style>
  .stc-scrim {
    z-index: 38;
    background: rgba(4, 14, 24, 0.62);
  }
  .stc-sheet {
    position: relative;
    overflow: hidden;
    text-align: center;
  }
  .stc-body { position: relative; z-index: 1; }
  .stc-eyebrow {
    margin: 0 0 4px;
    font-size: var(--fs-sm);
    letter-spacing: 0.04em;
    color: #ffe08a;
    font-weight: 700;
  }
  .stc-sheet h2 { margin: 0 0 8px; }
  .stc-hero { margin: 8px 0 2px; }
  .stc-bolt { animation: stc-pulse 0.7s ease-out both; }
  .st-count { animation: stc-pop 0.7s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
  .stc-batteries { justify-content: center; margin: 4px 0 8px; color: #ffcf4a; }
  .stc-batteries .st-battery.fresh { animation: stc-pop 0.7s cubic-bezier(0.2, 1.4, 0.4, 1) both; }
  .stc-grant {
    margin: 0 0 12px;
    font-weight: 800;
    color: #ffe08a;
  }
  .stc-grant.full { color: #9ad8ea; font-weight: 700; }

  .stc-burst {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }
  .stc-spark {
    position: absolute;
    left: 50%;
    top: 28%;
    width: 8px;
    height: 8px;
    margin: -4px;
    border-radius: 50%;
    background: #ffcf4a;
    box-shadow: 0 0 6px rgba(255, 207, 74, 0.8);
    animation: stc-burst 0.7s ease-out both;
    animation-delay: calc(var(--i) * 18ms);
    --dx: 0px;
    --dy: 0px;
  }
  .stc-spark.bolt {
    width: 10px;
    height: 14px;
    border-radius: 1px 1px 40% 40%;
    background: #fff3c8;
    clip-path: polygon(55% 0, 18% 52%, 48% 52%, 40% 100%, 82% 42%, 54% 42%);
  }
  .stc-spark:nth-child(1) { --dx: -118px; --dy: -72px; }
  .stc-spark:nth-child(2) { --dx: 112px; --dy: -64px; background: #39e0ff; }
  .stc-spark:nth-child(3) { --dx: -86px; --dy: 28px; }
  .stc-spark:nth-child(4) { --dx: 94px; --dy: 36px; background: #ff8ab8; }
  .stc-spark:nth-child(5) { --dx: -40px; --dy: -96px; }
  .stc-spark:nth-child(6) { --dx: 36px; --dy: -102px; background: #39e0ff; }
  .stc-spark:nth-child(7) { --dx: -128px; --dy: 8px; background: #fff3c8; }
  .stc-spark:nth-child(8) { --dx: 124px; --dy: 4px; }
  .stc-spark:nth-child(9) { --dx: -60px; --dy: 78px; background: #ff8ab8; }
  .stc-spark:nth-child(10) { --dx: 70px; --dy: 84px; }
  .stc-spark:nth-child(11) { --dx: -16px; --dy: 110px; background: #39e0ff; }
  .stc-spark:nth-child(12) { --dx: 10px; --dy: -70px; }

  @keyframes stc-burst {
    0% { transform: translate(0, 0) scale(0.4); opacity: 0; }
    18% { opacity: 1; }
    100% { transform: translate(var(--dx), var(--dy)) scale(1); opacity: 0; }
  }
  @keyframes stc-pop {
    0% { transform: scale(0.62); }
    55% { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @keyframes stc-pulse {
    0% { transform: scale(0.7) rotate(-8deg); filter: drop-shadow(0 0 2px rgba(255, 207, 74, 0.2)); }
    50% { transform: scale(1.16) rotate(6deg); filter: drop-shadow(0 0 14px rgba(255, 207, 74, 0.85)); }
    100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 8px rgba(255, 207, 74, 0.45)); }
  }

  @media (prefers-reduced-motion: reduce) {
    .stc-spark, .stc-bolt, .st-count, .stc-batteries .st-battery.fresh {
      animation: none !important;
    }
  }

  /* Board pieces (same look as StreakPanel; styles are scoped per component). */
  .st-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: #ffcf4a;
  }
  .st-bolt { filter: drop-shadow(0 0 8px rgba(255, 207, 74, 0.45)); }
  .st-count {
    margin: 0;
    font-family: "Itim", "Noto Sans Thai", sans-serif;
    font-size: 64px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: #fff3c8;
  }
  .st-unit { margin: 18px 0 0; font-weight: 700; color: #ffe08a; align-self: flex-start; }
  .st-status { margin: 6px 0 10px; color: #cfe8f4; font-size: var(--fs-sm); }
  .st-week {
    list-style: none;
    margin: 0 0 14px;
    padding: 10px 6px;
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    background: rgba(13, 74, 102, 0.45);
    border: 1px solid rgba(57, 224, 255, 0.35);
    border-radius: 14px;
  }
  .st-day { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .st-dot {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 2px solid rgba(234, 246, 255, 0.35);
    background: rgba(6, 24, 40, 0.6);
    color: #3a2a00;
  }
  .st-day.win .st-dot { background: #ffcf4a; border-color: #ffe08a; box-shadow: 0 0 10px rgba(255, 207, 74, 0.45); }
  .st-day.saved .st-dot { background: #0d4a66; border-color: #39e0ff; color: #ffcf4a; }
  .st-day.today .st-dot { outline: 2px solid #39e0ff; outline-offset: 2px; }
  .st-day.future .st-dot { opacity: 0.35; }
  .st-label { font-size: 12px; color: #cfe8f4; }
  .st-day.today .st-label { color: #39e0ff; font-weight: 700; }
  .st-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 4px; }
  .st-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-radius: 12px;
    background: #0d4a66;
    border: 1px solid rgba(57, 224, 255, 0.5);
  }
  .st-card .st-k { font-size: var(--fs-sm); color: #9ad8ea; }
  .st-card .st-v { font-weight: 800; font-size: calc(var(--fs) + 3px); font-variant-numeric: tabular-nums; }
  .st-batteries { display: flex; gap: 6px; color: #ffcf4a; }
  .st-battery { opacity: 0.4; }
  .st-battery.full { opacity: 1; }
</style>
