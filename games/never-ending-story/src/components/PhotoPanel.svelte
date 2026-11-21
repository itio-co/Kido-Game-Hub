<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../lib/i18n';
  import { PHOTO_OVERLAY, type GrandpaPhotoState } from '../lib/decor';

  let {
    title,
    photoState = 'shelf',
    onState,
    onClose,
  }: {
    title: string;
    photoState?: GrandpaPhotoState;
    onState: (next: GrandpaPhotoState) => void;
    onClose: () => void;
  } = $props();

  /** Collapsed every time the panel opens, same as the calendar's change menu. */
  let manageOpen = $state(false);
  let body = $state<HTMLDivElement | null>(null);
  const stored = $derived(photoState === 'stored');
  /** The framed photo exactly as it stands on the shelf: a crop of the room overlay (frame x 452–556, y 265–388). */
  const FRAME = { x: 452, y: 265, w: 104, h: 123 };
  const SHOW_W = 150;
  const k = SHOW_W / FRAME.w;
  const frameStyle = `width:${SHOW_W}px;height:${Math.round(FRAME.h * k)}px;background-image:url('${import.meta.env.BASE_URL}img/decor/${PHOTO_OVERLAY}');background-size:${720 * k}px ${1280 * k}px;background-position:${-FRAME.x * k}px ${-FRAME.y * k}px`;

  async function toggleManage(): Promise<void> {
    manageOpen = !manageOpen;
    if (!manageOpen) return;
    await tick();
    const section = body?.querySelector<HTMLElement>('[data-testid="photo-manage"]');
    if (!body || !section) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const bottom = section.offsetTop + section.offsetHeight - body.clientHeight;
    if (bottom > body.scrollTop) body.scrollTo({ top: bottom, behavior: reduce ? 'auto' : 'smooth' });
  }
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet calendar-sheet photo-sheet" aria-label={title} open onclick={(event) => event.stopPropagation()}>
    <div class="sheet-body" data-testid="photo-scroll" bind:this={body}>
      <h2>{title}</h2>
      <figure class="keepsake" class:stored>
        <div class="frame" role="img" aria-label={t('photo.title')} style={frameStyle}></div>
        <figcaption>{stored ? t('photo.storedBody') : t('photo.onShelfBody')}</figcaption>
      </figure>
      <div class="themes" class:open={manageOpen} data-testid="photo-manage">
        <button
          type="button"
          class="change-toggle"
          data-testid="photo-manage-toggle"
          aria-expanded={manageOpen}
          aria-controls="photo-manage-options"
          onclick={toggleManage}
        >
          <span class="label">{t('photo.manage')}</span>
          <span class="current">{stored ? t('photo.storedShort') : t('photo.onShelfShort')}</span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
        {#if manageOpen}
          <div id="photo-manage-options" data-testid="photo-manage-options">
            {#if stored}<p class="note">{t('photo.storedNote')}</p>{/if}
            <div class="row">
              {#if stored}
                <button type="button" class="choice wall-action" data-testid="photo-put-back" onclick={() => onState('shelf')}>{t('photo.putBack')}</button>
              {:else}
                <button type="button" class="choice wall-action" data-testid="photo-store" onclick={() => onState('stored')}>{t('photo.store')}</button>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
    <div class="sheet-foot">
      <button type="button" class="close" data-testid="photo-close" onclick={onClose}>{t('calendar.close')}</button>
    </div>
  </dialog>
</div>
