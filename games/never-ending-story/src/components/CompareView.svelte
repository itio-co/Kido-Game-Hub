<script lang="ts">
  import CompareSlider from './CompareSlider.svelte';
  import NightstandView from './NightstandView.svelte';
  import { t, type MessageKey } from '../lib/i18n/core';

  type Pair = 'room' | 'grandma';
  const BASE = import.meta.env.BASE_URL;
  const wanted = new URLSearchParams(location.hash.split('?')[1] ?? '').get('pair');
  let pair = $state<Pair>(wanted === 'grandma' ? 'grandma' : 'room');

  function pick(next: Pair): void {
    pair = next;
    history.replaceState(history.state, '', `#/compare?pair=${next}`);
  }
</script>

<div class="compare-page" data-compare-page>
  <header>
    <p class="kicker">{t('game.compare.kicker')}</p>
    <h1>{t('game.compare.title')}</h1>
  </header>

  <div class="toggle" role="radiogroup" aria-label={t('game.compare.tabsAria')}>
    {#each ['room', 'grandma'] as const as id (id)}
      <button type="button" role="radio" aria-checked={pair === id} class:on={pair === id} data-pair={id} onclick={() => pick(id)}>
        {t(`game.compare.tab.${id}` as MessageKey)}
      </button>
    {/each}
  </div>

  <p class="hint">{t('game.compare.hint')}</p>
  {#if pair === 'room'}
    <div class="frame room-frame" data-compare-frame="room">
      <CompareSlider src={`${BASE}showcase/nightstand-ref.png`} beforeLabel={t('game.compare.before')} afterLabel={t('game.compare.after')}>
        <NightstandView variant="lowpoly" />
      </CompareSlider>
    </div>
    <p class="note">{t('game.compare.roomNote')}</p>
  {:else}
    <div class="frame grandma-frame" data-compare-frame="grandma">
      <CompareSlider
        src={`${BASE}showcase/characters/grandma-mali-tpose.jpg`}
        beforeLabel={t('game.compare.before')}
        afterLabel={t('game.compare.after')}
      >
        <img class="render" src={`${BASE}showcase/characters/grandma-mali-3d-render.jpg`} alt="" draggable="false" />
      </CompareSlider>
    </div>
    <p class="note">{t('game.compare.grandmaNote')}</p>
  {/if}

  <nav class="links">
    <a href="#/" data-compare-back>{t('game.compare.back')}</a>
    <a href={pair === 'grandma' ? '#/showcase?asset=characters/grandma' : '#/showcase?asset=player-room/nightstand'} data-compare-demo
      >{t('game.compare.demo')}</a
    >
  </nav>
</div>

<style>
  .compare-page {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #1b2430;
    color: #eaf6ff;
    padding: 16px 14px 28px;
  }
  .kicker { margin: 0; font-size: 13px; letter-spacing: 0.04em; color: #8fdfff; }
  h1 { margin: 2px 0 12px; font-size: 24px; line-height: 1.2; }
  .toggle { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
  .toggle button {
    flex: 1 1 130px;
    min-height: 44px;
    padding: 6px 10px;
    border-radius: 10px;
    border: 1.5px solid #3a5a74;
    background: #10202e;
    color: #eaf6ff;
    font-weight: 700;
  }
  .toggle button.on { background: #8fdfff; border-color: #8fdfff; color: #082030; }
  .hint, .note { margin: 0 0 10px; font-size: 14px; color: #c5d7e6; }
  .note { margin-top: 10px; }
  .frame { position: relative; width: 100%; max-width: 480px; margin: 0 auto; border-radius: 12px; overflow: hidden; }
  .room-frame { aspect-ratio: 252 / 284; }
  .grandma-frame { aspect-ratio: 3 / 4; }
  .render { display: block; width: 100%; height: 100%; object-fit: fill; }
  .links { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; }
  .links a {
    padding: 10px 14px;
    border-radius: 10px;
    border: 2px solid var(--cyan);
    background: var(--hud);
    color: var(--ink);
    font-weight: 700;
    text-decoration: none;
  }
</style>
