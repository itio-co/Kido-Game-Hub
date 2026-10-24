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
  const familyCharacters = $derived(SHOWCASE_ASSETS.filter((a) => a.kind === 'character'));

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

  const initial: NightstandVariant = location.hash.includes('model=meshy-measured')
    ? 'meshy-measured'
    : location.hash.includes('model=meshy1k5')
      ? 'meshy1k5'
      : location.hash.includes('model=master')
        ? 'master'
        : 'lowpoly';
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
        onclick={() => pick(asset.slug)}
      >
        {#if asset.characterRefs?.profilePhoto}
          <img class="asset-avatar" src={asset.characterRefs.profilePhoto} alt="" loading="lazy" />
        {/if}
        {asset.title}
      </button>
    {/each}
  </nav>

  {#if selected.kind === 'character'}
    <dl>
      <div><dt>id</dt><dd>{selected.id}</dd></div>
      <div><dt>kind</dt><dd>{selected.kind}</dd></div>
      <div><dt>title</dt><dd>{selected.title}</dd></div>
      <div><dt>slug</dt><dd>{selected.slug}</dd></div>
    </dl>

    {#if selected.characterRefs}
      <section class="char-refs" data-character-refs aria-label={t('game.showcase.refsHeading')}>
        <div class="char-refs-head">
          <h2>{t('game.showcase.refsHeading')}</h2>
          <span class="status-badge" class:rigged={Boolean(selected.character)} data-character-status>
            {selected.character ? t('game.showcase.statusRigged') : t('game.showcase.statusConcept')}
          </span>
        </div>
        <div class="char-refs-grid">
          <figure class="ref-card" data-ref-card="profile">
            <div class="ref-img-wrap">
              <img
                data-ref-profile
                src={selected.characterRefs.profilePhoto}
                alt={`${selected.title} — ${t('game.showcase.refProfile')}`}
              />
            </div>
            <figcaption>{t('game.showcase.refProfile')}</figcaption>
          </figure>
          <figure class="ref-card" data-ref-card="tpose">
            <div class="ref-img-wrap">
              <img
                data-ref-tpose
                src={selected.characterRefs.tposeMockup}
                alt={`${selected.title} — ${t('game.showcase.refTpose')}`}
              />
            </div>
            <figcaption>{t('game.showcase.refTpose')}</figcaption>
          </figure>
          <figure class="ref-card" data-ref-card="scene">
            <div class="ref-img-wrap">
              <img
                data-ref-scene
                src={selected.characterRefs.sceneMockup}
                alt={`${selected.title} — ${t('game.showcase.refScene')}`}
              />
            </div>
            <figcaption>{t('game.showcase.refScene')}</figcaption>
          </figure>
        </div>
      </section>
    {/if}

    {#if selected.character}
      <section>
        <h2>{t('game.showcase.orbit')}</h2>
        {#key selected.slug}
          <CharacterView asset={selected} />
        {/key}
      </section>
    {:else}
      <p class="note concept-note" data-concept-only>{t('game.showcase.conceptOnlyNote')}</p>
    {/if}
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

    <div class="toggle variants-toggle" role="radiogroup" aria-label={t('game.showcase.variants')}>
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

  <section class="family-roster" data-character-gallery aria-label={t('game.showcase.familyGallery')}>
    <h2>{t('game.showcase.familyGallery')}</h2>
    <div class="roster-grid">
      {#each familyCharacters as charAsset (charAsset.slug)}
        <button
          type="button"
          class="roster-card"
          class:on={charAsset.slug === slug}
          data-roster-card={charAsset.slug}
          onclick={() => pick(charAsset.slug)}
        >
          {#if charAsset.characterRefs}
            <div class="roster-thumbs">
              <img
                class="roster-profile"
                src={charAsset.characterRefs.profilePhoto}
                alt={charAsset.title}
                loading="lazy"
              />
              <img
                class="roster-tpose"
                src={charAsset.characterRefs.tposeMockup}
                alt={`${charAsset.title} T-Pose`}
                loading="lazy"
              />
            </div>
          {/if}
          <div class="roster-meta">
            <strong>{charAsset.title}</strong>
            <span class="roster-badge" class:rigged={Boolean(charAsset.character)}>
              {charAsset.character ? t('game.showcase.statusRigged') : t('game.showcase.statusConcept')}
            </span>
          </div>
        </button>
      {/each}
    </div>
  </section>
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
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 14px;
  }
  .toggle button {
    flex: 1 1 130px;
    min-height: 44px;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: 10px;
    border: 2px solid #3a5a74;
    background: #10202e;
    color: #eaf6ff;
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }
  .toggle button.on {
    background: #8fdfff;
    border-color: #8fdfff;
    color: #082030;
  }
  .asset-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    border: 1.5px solid rgba(255, 255, 255, 0.45);
    flex-shrink: 0;
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
  .concept-note {
    padding: 12px 14px;
    border-radius: 10px;
    border: 1.5px dashed #3a5a74;
    background: #10202e;
    color: #8fdfff;
    font-weight: 600;
  }
  .char-refs {
    padding: 12px;
    border-radius: 12px;
    border: 1.5px solid #2d475d;
    background: #12212f;
  }
  .char-refs-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .char-refs-head h2 {
    margin: 0;
  }
  .status-badge {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    background: #233b50;
    color: #bfe6ff;
    border: 1px solid #3a5a74;
  }
  .status-badge.rigged {
    background: #1e6f43;
    color: #eafff2;
    border-color: #36a165;
  }
  .char-refs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }
  .ref-card {
    margin: 0;
    border-radius: 10px;
    overflow: hidden;
    border: 1.5px solid #2d475d;
    background: #0d1924;
    display: flex;
    flex-direction: column;
  }
  .ref-img-wrap {
    width: 100%;
    height: 210px;
    background: #e8ded1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .ref-img-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .ref-card figcaption {
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 600;
    color: #c5d7e6;
    border-top: 1px solid #243a4d;
  }
  .family-roster {
    margin-top: 26px;
    padding-top: 16px;
    border-top: 1.5px solid #2d475d;
  }
  .roster-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(195px, 1fr));
    gap: 10px;
  }
  .roster-card {
    padding: 8px;
    border-radius: 12px;
    border: 2px solid #2d475d;
    background: #10202e;
    color: #eaf6ff;
    font: inherit;
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .roster-card.on {
    border-color: #8fdfff;
    box-shadow: 0 0 0 2px rgba(143, 223, 255, 0.25);
  }
  .roster-thumbs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    height: 100px;
  }
  .roster-thumbs img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
    background: #e8ded1;
  }
  .roster-thumbs .roster-tpose {
    object-fit: contain;
  }
  .roster-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 13px;
  }
  .roster-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 999px;
    background: #233b50;
    color: #bfe6ff;
    white-space: nowrap;
  }
  .roster-badge.rigged {
    background: #1e6f43;
    color: #eafff2;
  }
</style>
