<script lang="ts">
  import { t } from '../lib/i18n';
  import { MAX_BATTERIES, weekRow, type StreakView } from '../lib/streak';

  let {
    view,
    synced,
    onClose,
  }: {
    view: StreakView;
    /** False when the board shows a local fallback (never reached the server). */
    synced: boolean;
    onClose: () => void;
  } = $props();

  const week = $derived(weekRow(view));
  const stateText = $derived(t(`streak.state.${view.state}`));
  const batteryList = $derived(Array.from({ length: view.maxBatteries || MAX_BATTERIES }, (_, i) => i < view.batteries));
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog
    class="sheet calendar-sheet streak-sheet"
    aria-label={t('streak.title')}
    data-testid="streak-panel"
    data-state={view.state}
    open
    onclick={(event) => event.stopPropagation()}
  >
    <div class="sheet-body">
      <header class="top">
        <h2>{t('streak.title')}</h2>
        <div
          class="batteries"
          data-testid="streak-batteries"
          data-count={String(view.batteries)}
          role="img"
          aria-label={t('streak.batteries', { n: view.batteries, max: view.maxBatteries })}
        >
          {#each batteryList as full, i (i)}
            <svg class="battery" class:full viewBox="0 0 30 16" width="30" height="16" aria-hidden="true">
              <rect x="1" y="1" width="24" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2" />
              <rect x="26" y="5" width="3" height="6" rx="1" fill="currentColor" />
              {#if full}<rect x="4" y="4" width="18" height="8" rx="1.5" fill="currentColor" />{/if}
            </svg>
          {/each}
        </div>
      </header>

      <div class="hero" class:cold={view.count === 0}>
        <svg class="bolt" viewBox="0 0 24 24" width="52" height="52" aria-hidden="true">
          <path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6z" fill="currentColor" stroke="#3a2a00" stroke-width="1.2" stroke-linejoin="round" />
        </svg>
        <p class="count" data-testid="streak-count">{view.count}</p>
        <p class="unit">{t('streak.days')}</p>
      </div>
      <p class="status" data-testid="streak-status">{stateText}</p>

      <ol class="week" data-testid="streak-week">
        {#each week as d, i (d.date)}
          <li
            class="day"
            class:win={d.kind === 'win'}
            class:saved={d.kind === 'saved'}
            class:today={d.today}
            class:future={d.future}
            data-date={d.date}
            data-kind={d.kind ?? ''}
            aria-label={`${t(`streak.day.${i}`)} ${d.kind === 'win' ? t('streak.won') : d.kind === 'saved' ? t('streak.saved') : ''}`.trim()}
          >
            <span class="dot">
              {#if d.kind === 'win'}
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M13.6 2 4.8 13.4h6l-1.4 8.6 8.8-11.4h-6z" fill="currentColor" /></svg>
              {:else if d.kind === 'saved'}
                <svg viewBox="0 0 30 16" width="20" height="11" aria-hidden="true">
                  <rect x="1" y="1" width="24" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2.4" />
                  <rect x="26" y="5" width="3" height="6" rx="1" fill="currentColor" />
                  <rect x="4" y="4" width="9" height="8" rx="1.5" fill="currentColor" />
                </svg>
              {/if}
            </span>
            <span class="label">{t(`streak.day.${i}`)}</span>
          </li>
        {/each}
      </ol>

      <div class="cards">
        <div class="card" data-testid="streak-best">
          <span class="k">{t('streak.best')}</span>
          <span class="v">{t('streak.bestValue', { n: view.best })}</span>
        </div>
        <div class="card" data-testid="streak-wins">
          <span class="k">{t('streak.wins')}</span>
          <span class="v">{t('streak.winsValue', { n: view.totalWins })}</span>
        </div>
      </div>

      <p class="refill" data-testid="streak-refill">
        {view.batteries >= view.maxBatteries ? t('streak.refillFull') : view.count > 0 ? t('streak.refill', { n: view.refillIn }) : t('streak.refillRestart')}
      </p>
      <p class="rules">{t('streak.rules')}</p>
      {#if !synced}<p class="offline" data-testid="streak-offline">{t('streak.offline')}</p>{/if}
    </div>
    <div class="sheet-foot">
      <button type="button" class="close" data-testid="streak-close" onclick={onClose}>{t('calendar.close')}</button>
    </div>
  </dialog>
</div>

<style>
  .streak-sheet { text-align: center; }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    text-align: left;
  }
  .top h2 { margin: 0; }
  .batteries { display: flex; gap: 6px; color: #ffcf4a; flex: none; }
  .battery { opacity: 0.4; }
  .battery.full { opacity: 1; }
  .hero {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin: 14px 0 2px;
    color: #ffcf4a;
  }
  .hero.cold { color: #7d93a3; }
  .bolt { filter: drop-shadow(0 0 8px rgba(255, 207, 74, 0.45)); }
  .hero.cold .bolt { filter: none; }
  .count {
    margin: 0;
    font-family: "Itim", "Noto Sans Thai", sans-serif;
    font-size: 64px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: #fff3c8;
  }
  .hero.cold .count { color: #c3d3de; }
  .unit { margin: 18px 0 0; font-weight: 700; color: #ffe08a; align-self: flex-start; }
  .hero.cold .unit { color: #c3d3de; }
  .status { margin: 6px 0 14px; color: #cfe8f4; font-size: var(--fs-sm); }
  .week {
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
  .day { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .dot {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 2px solid rgba(234, 246, 255, 0.35);
    background: rgba(6, 24, 40, 0.6);
    color: #3a2a00;
  }
  .day.win .dot { background: #ffcf4a; border-color: #ffe08a; box-shadow: 0 0 10px rgba(255, 207, 74, 0.45); }
  .day.saved .dot { background: #0d4a66; border-color: #39e0ff; color: #ffcf4a; }
  .day.today .dot { outline: 2px solid #39e0ff; outline-offset: 2px; }
  .day.future .dot { opacity: 0.35; }
  .label { font-size: 12px; color: #cfe8f4; }
  .day.today .label { color: #39e0ff; font-weight: 700; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 8px;
    border-radius: 12px;
    background: #0d4a66;
    border: 1px solid rgba(57, 224, 255, 0.5);
  }
  .card .k { font-size: var(--fs-sm); color: #9ad8ea; }
  .card .v { font-weight: 800; font-size: calc(var(--fs) + 3px); font-variant-numeric: tabular-nums; }
  .refill { margin: 0 0 6px; font-size: var(--fs-sm); color: #ffe08a; }
  .rules { margin: 0 0 4px; font-size: 13px; line-height: 1.45; color: #9ad8ea; }
  .offline { margin: 6px 0 0; font-size: 13px; color: #ffb4a8; }
</style>
