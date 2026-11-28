<script lang="ts">
  import { appBase } from '../../lib/deployment';
  import { t } from '../../lib/i18n';
  import { ApiError, god } from '../god/api';
  import { tick } from 'svelte';
  import { playerAuthHeaders } from '../../lib/cloudSync';
  import { captureElement } from './capture';
  import WishList from './WishList.svelte';
  import WishSheet from './WishSheet.svelte';
  import type { Role } from '../../lib/roles';
  import { floatDragged, godAdminLinkVisible, godWishVisible, godAdminUrl, nextFloatPosition, type FloatPrefs } from './floatState';
  import { inspectDocument, type InspectPage } from './inspect';

  let {
    page,
    prefs,
    onPrefs,
    role = 'super_god',
  }: {
    page: InspectPage;
    prefs: FloatPrefs;
    onPrefs: (next: FloatPrefs) => void;
    /** Server-confirmed role. A god player gets Inspect and Wish; Admin is only for a super god / admin session. */
    role?: Role | null;
  } = $props();

  let menu = $state(false);
  let inspect = $state(false);
  let shareTtl = $state<'1h' | '24h' | '7d'>('24h');
  let shareUrl = $state('');
  let shareError = $state('');
  let sharing = $state(false);
  let dragging = $state(false);
  let capturing = $state(false);
  let wish = $state<{ shot: string | null } | null>(null);
  let wishList = $state(false);
  let root = $state<HTMLDivElement>();
  let x = $state(0.78);
  let y = $state(0.62);
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  /** True after a tap opens the menu, until a new pointerdown arrives on the menu. */
  let suppressItemClick = false;

  $effect(() => {
    if (!dragging) {
      x = prefs.x;
      y = prefs.y;
    }
  });

  const doc = $derived(inspectDocument(page));
  const sections = $derived(Object.entries(doc));

  function stageBox(): { width: number; height: number } | null {
    const stage = root?.offsetParent as HTMLElement | null;
    const rect = stage?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return { width: rect.width, height: rect.height };
  }

  function point(event: PointerEvent): void {
    const stage = stageBox();
    if (!stage) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (floatDragged(dx, dy)) moved = true;
    const next = nextFloatPosition({ x: originX, y: originY }, { x: dx, y: dy }, stage);
    x = next.x;
    y = next.y;
  }

  function onDown(event: PointerEvent): void {
    dragging = true;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    originX = x;
    originY = y;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onMove(event: PointerEvent): void {
    if (!dragging) return;
    point(event);
  }

  function onUp(): void {
    if (!dragging) return;
    dragging = false;
    onPrefs({ on: true, x, y });
    if (!moved) {
      menu = !menu;
      suppressItemClick = menu;
    }
  }

  function onMenuPointerDown(): void {
    suppressItemClick = false;
  }

  function choose(action: () => void): (event: MouseEvent) => void {
    return (event: MouseEvent) => {
      // A leftover click has no new pointerdown on the menu, so the suppress flag is still set.
      if (suppressItemClick) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      action();
    };
  }

  function onBubbleContextMenu(event: MouseEvent): void {
    event.preventDefault();
  }

  function openAdmin(): void {
    window.location.assign(godAdminUrl(window.location.origin, appBase()));
  }

  function openInspect(): void {
    menu = false;
    inspect = true;
    shareUrl = '';
    shareError = '';
  }

  /** Hide the float, photograph the phone, then open the wish sheet. A failed capture still opens it without an image. */
  function openWishList(): void {
    menu = false;
    wishList = true;
  }

  async function openWish(): Promise<void> {
    menu = false;
    capturing = true;
    await tick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const stage = root?.offsetParent as HTMLElement | null;
    const shot = stage ? await captureElement(stage) : null;
    capturing = false;
    wish = { shot };
  }

  async function shareLink(): Promise<void> {
    sharing = true;
    shareError = '';
    try {
      const made = await god<{ url: string }>('snapshots', { method: 'POST', headers: playerAuthHeaders(), body: JSON.stringify({ ttl: shareTtl, document: doc }) });
      shareUrl = made.url;
    } catch (error) {
      shareUrl = '';
      shareError = error instanceof ApiError ? error.code : 'error';
    } finally {
      sharing = false;
    }
  }

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      shareError = 'copy';
    }
  }
</script>

<div class="god-float" class:capturing data-wish-skip bind:this={root} style="left:{x * 100}%;top:{y * 100}%">
  {#if menu}
    <div class="menu" data-testid="god-float-menu">
      {#if godAdminLinkVisible(role)}<button type="button" data-testid="god-float-admin" onpointerdown={onMenuPointerDown} onclick={choose(openAdmin)}>{t('god.float.admin')}</button>{/if}
      <button type="button" data-testid="god-float-inspect" onpointerdown={onMenuPointerDown} onclick={choose(openInspect)}>{t('god.float.inspect')}</button>
      {#if godWishVisible(role)}<button type="button" data-testid="god-float-wishes" onpointerdown={onMenuPointerDown} onclick={choose(openWishList)}>{t('god.float.wishList')}</button>{/if}
      {#if godWishVisible(role)}<button type="button" data-testid="god-float-wish" onpointerdown={onMenuPointerDown} onclick={choose(openWish)}>{t('god.float.wish')}</button>{/if}
    </div>
  {/if}
  <button
    type="button"
    class="bubble"
    data-testid="god-float"
    aria-label={t('god.float.icon')}
    aria-expanded={menu}
    onpointerdown={onDown}
    onpointermove={onMove}
    onpointerup={onUp}
    onpointercancel={onUp}
    oncontextmenu={onBubbleContextMenu}
  >{t('god.float.toggle')}</button>
</div>

{#if wish}
  <WishSheet {page} shot={wish.shot} onClose={() => (wish = null)} />
{/if}

{#if wishList}
  <WishList onClose={() => (wishList = false)} />
{/if}


{#if inspect}
  <section class="inspect" data-testid="god-inspect" aria-label={t('god.float.inspectTitle')}>
    <header>
      <h2>{t('god.float.inspectTitle')}</h2>
      <label class="ttl">{t('god.float.shareFor')}
        <select data-testid="god-share-ttl" bind:value={shareTtl}>
          <option value="1h">{t('god.float.ttl1h')}</option>
          <option value="24h">{t('god.float.ttl24h')}</option>
          <option value="7d">{t('god.float.ttl7d')}</option>
        </select>
      </label>
      <button type="button" data-testid="god-inspect-share" disabled={sharing} onclick={shareLink}>{t('god.float.share')}</button>
      <button type="button" data-testid="god-inspect-close" onclick={() => (inspect = false)}>{t('god.float.close')}</button>
      {#if shareUrl}
        <p class="share" data-testid="god-share-url"><a href={shareUrl}>{shareUrl}</a>
          <button type="button" onclick={copyLink}>{t('god.float.copyLink')}</button>
        </p>
      {/if}
      {#if shareError}<p class="share err" role="alert">{t('god.float.shareError')}</p>{/if}
    </header>
    {#each sections as [key, value] (key)}
      <details open={key === 'page' || key === 'scene' || key === 'event' || key === 'versions'}>
        <summary>{key}</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    {/each}
  </section>
{/if}

<style>
  .god-float {
    position: absolute;
    z-index: 12;
    transform: translate(-50%, -50%);
    /* Size to the bubble so opening the menu does not shift the icon under the finger. */
    width: 64px;
    height: 64px;
  }
  .god-float.capturing { visibility: hidden; }
  .bubble {
    width: 64px;
    height: 64px;
    border: 0;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #ffe38a, #f0a202 55%, #c47b00);
    color: #3a2a00;
    font-weight: 800;
    letter-spacing: 0.04em;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
    touch-action: none;
    cursor: grab;
  }
  .menu {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 6px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 168px;
    z-index: 1;
  }
  .menu button, .inspect header button {
    min-height: 40px;
    border-radius: 10px;
    border: 1px solid var(--cyan, #39e0ff);
    background: #0d4a66;
    color: white;
    font-weight: 700;
  }
  .inspect {
    position: absolute;
    z-index: 20;
    left: 10px;
    right: 10px;
    top: 64px;
    bottom: 16px;
    overflow: auto;
    padding: 12px;
    border-radius: 16px;
    background: rgba(8, 18, 28, 0.96);
    color: #eaf6ff;
    border: 1px solid var(--cyan, #39e0ff);
    user-select: text;
  }
  .inspect header { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .ttl { display: flex; gap: 6px; align-items: center; font-size: 0.9rem; }
  .ttl select, .share button { min-height: 40px; border-radius: 10px; }
  .share { flex-basis: 100%; margin: 0; word-break: break-all; font-size: 12px; }
  .share.err { color: #ffb020; }
  .inspect h2 { margin: 0; font-size: 1rem; flex: 1; }
  .inspect details { margin-top: 8px; }
  .inspect summary { cursor: pointer; font-weight: 700; }
  .inspect pre {
    margin: 6px 0 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.4;
  }
</style>
