<script lang="ts">
  import type { NightstandEntity, PlayerRoom } from '../lib/types';
  import CompareSlider from './CompareSlider.svelte';
  import NightstandView from './NightstandView.svelte';
  import type { NightstandVariant } from '../lib/nightstandStage';
  import CharacterView from './CharacterView.svelte';
  import { SHOWCASE_ASSETS, findAsset } from '../lib/showcaseAssets';
  import { t } from '../lib/i18n/core';
  import { tx } from '../lib/i18n/content';

  let { room }: { room: PlayerRoom } = $props();

  // `#/showcase?asset=<slug>` picks the asset; the nightstand is the default.
  const wantedSlug = new URLSearchParams(location.hash.split('?')[1] ?? '').get('asset');
  let slug = $state(findAsset(wantedSlug ?? '')?.slug ?? SHOWCASE_ASSETS[0]!.slug);
  const selected = $derived(findAsset(slug) ?? SHOWCASE_ASSETS[0]!);

  function pick(next: string): void {
    slug = next;
    const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
    params.set('asset', next);
    params.delete('model');
    history.replaceState(history.state, '', `#/showcase?${params.toString().replaceAll('%2F', '/')}`);
  }

  const nightstand = $derived.by((): NightstandEntity | null => {
    const found = room.objects.find((obj) => obj.kind === 'nightstand');
    return found && found.kind === 'nightstand' ? found : null;
  });

  const mock = `${import.meta.env.BASE_URL}showcase/nightstand-ref.png`;

  const initial: NightstandVariant = location.hash.includes('model=master') ? 'master' : 'lowpoly';
  let variant = $state<NightstandVariant>(initial);
  const variants = $derived(
    (findAsset('player-room/nightstand')?.variants ?? []).map((v) => ({
      id: v.id as NightstandVariant,
      label: v.label,
    })),
  );
</script>

<div class="showcase">
  <header>
    <p class="kicker">{t('game.showcase.kicker')}</p>
    <h1>
      {#if selected.kind === 'character'}
        {selected.title}
      {:else}
        {nightstand ? tx(nightstand, 'title') : t('asset.nightstand.title')}
      {/if}
    </h1>
  </header>

  <nav class="toggle assets" aria-label={t('game.showcase.assets')}>
    {#each SHOWCASE_ASSETS as asset (asset.slug)}
      <button
        type="button"
        aria-pressed={asset.slug === slug}
        class:on={asset.slug === slug}
        data-asset={asset.slug}
        onclick={() => pick(asset.slug)}>{asset.title}</button
      >
    {/each}
  </nav>

  {#if selected.kind === 'character'}
    <dl>
      <div><dt>id</dt><dd>{selected.id}</dd></div>
      <div><dt>kind</dt><dd>{selected.kind}</dd></div>
      <div><dt>title</dt><dd>{selected.title}</dd></div>
      <div><dt>slug</dt><dd>{selected.slug}</dd></div>
    </dl>
    <section>
      <h2>{t('game.showcase.orbit')}</h2>
      {#key selected.slug}
        <CharacterView asset={selected} />
      {/key}
    </section>
    {#if selected.editable === false}
      <p class="note" data-not-editable>{t('game.showcase.notEditable')}</p>
    {/if}
    {#if selected.notes}
      <p class="note">{selected.notes}</p>
    {/if}
  {:else if nightstand}
    <dl>
      <div><dt>id</dt><dd>{nightstand.id}</dd></div>
      <div><dt>kind</dt><dd>{nightstand.kind}</dd></div>
      <div><dt>title</dt><dd>{nightstand.title}</dd></div>
      <div><dt>slug</dt><dd>{nightstand.slug}</dd></div>
    </dl>

    <div class="toggle" role="radiogroup" aria-label={t('game.showcase.variants')}>
      {#each variants as v (v.id)}
        <button
          type="button"
          role="radio"
          aria-checked={variant === v.id}
          class:on={variant === v.id}
          data-variant={v.id}
          onclick={() => (variant = v.id)}>{v.label}</button
        >
      {/each}
    </div>

    <section>
      <h2>{t('asset.nightstand.title')}</h2>
      <div class="frame table-frame">
        {#key variant}
          <CompareSlider src={mock}>
            <NightstandView {variant} />
          </CompareSlider>
        {/key}
      </div>
    </section>

    <a class="edit-link" href="#/editor?asset=player-room/nightstand&model={variant}" data-editor-link>{t('game.showcase.edit')}</a>

    <section>
      <h2>{t('game.showcase.orbit')}</h2>
      <p class="hint">{t('game.showcase.orbitHint')}</p>
      <div class="frame orbit-frame">
        {#key variant}
          <NightstandView {variant} orbit />
        {/key}
      </div>
    </section>
  {/if}
</div>

<style>
  .showcase {
    position: absolute;
    inset: 0;
    overflow: auto;
    background: #1b2430;
    color: #eaf6ff;
    padding: 16px 14px 28px;
  }
  .kicker {
    margin: 0;
    font-size: 13px;
    letter-spacing: 0.04em;
    color: #8fdfff;
  }
  h1 {
    margin: 2px 0 12px;
    font-size: 28px;
    line-height: 1.2;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 18px;
  }
  dl {
    margin: 0 0 18px;
    display: grid;
    gap: 6px;
  }
  dl div { display: grid; grid-template-columns: 52px 1fr; gap: 8px; }
  dt { color: #8fdfff; font-size: 13px; }
  dd {
    margin: 0;
    font-size: 13px;
    word-break: break-all;
  }
  section { margin: 0 0 22px; }
  .frame {
    position: relative;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
  }
  .table-frame { aspect-ratio: 252 / 284; }
  .orbit-frame { aspect-ratio: 1; }
  .toggle {
    display: flex;
    gap: 8px;
    margin: 0 0 14px;
  }
  .toggle button {
    flex: 1;
    min-height: 44px;
    border-radius: 10px;
    border: 2px solid #3a5a74;
    background: #10202e;
    color: #eaf6ff;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
  }
  .toggle button.on {
    background: #8fdfff;
    border-color: #8fdfff;
    color: #082030;
  }
  .edit-link {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    margin: 0 0 22px;
    border-radius: 10px;
    background: #ffcf4d;
    color: #2a1a00;
    font-size: 17px;
    font-weight: 700;
    text-decoration: none;
  }
  .hint { margin: 0 0 8px; font-size: 14px; color: #c5d7e6; }
  .assets { flex-wrap: wrap; }
  .assets button { flex: 1 1 140px; }
  .note { margin: 0 0 10px; font-size: 14px; color: #c5d7e6; }
</style>
