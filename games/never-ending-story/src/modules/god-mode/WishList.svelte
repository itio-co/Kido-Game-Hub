<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { playerAuthHeaders } from '../../lib/cloudSync';
  import { t } from '../../lib/i18n';
  import { short } from '../god/api';
  import {
    fetchWishPage,
    fetchWishShotUrl,
    stampText,
    WISH_PAGE_SIZE,
    type WishPage,
    type WishRow,
  } from './wish';

  let { onClose }: { onClose: () => void } = $props();

  let loading = $state(true);
  let failure = $state(false);
  let pack = $state<WishPage>({ wishes: [], total: 0, page: 1, pageSize: WISH_PAGE_SIZE });
  let current = $state(1);
  let open = $state<WishRow | null>(null);
  let zoom = $state<string | null>(null);
  let thumbs = $state<Record<string, string>>({});

  const pages = $derived(Math.max(1, Math.ceil(pack.total / pack.pageSize)));
  const headers = () => playerAuthHeaders();

  function revokeAll(map: Record<string, string>): void {
    for (const url of Object.values(map)) URL.revokeObjectURL(url);
  }

  async function loadShots(rows: WishRow[]): Promise<void> {
    const next: Record<string, string> = {};
    await Promise.all(rows.map(async (w) => {
      if (!w.screenshotUrl) return;
      const path = new URL(w.screenshotUrl, location.origin).pathname;
      const url = await fetchWishShotUrl(`${location.origin}${path}`, fetch, headers());
      if (url) next[w.id] = url;
    }));
    revokeAll(thumbs);
    thumbs = next;
  }

  async function load(page: number): Promise<void> {
    loading = true;
    failure = false;
    open = null;
    zoom = null;
    const result = await fetchWishPage(page, fetch, headers(), location.origin);
    loading = false;
    if (!result.ok) {
      failure = true;
      pack = { wishes: [], total: 0, page, pageSize: WISH_PAGE_SIZE };
      return;
    }
    pack = result.page;
    current = result.page.page;
    await loadShots(result.page.wishes);
  }

  function go(page: number): void {
    const next = Math.min(pages, Math.max(1, page));
    if (next === current && !failure) return;
    void load(next);
  }

  function roleLabel(role: string | null): string {
    if (role === 'god' || role === 'super_god' || role === 'player') return t(`god.role.${role}`);
    return '';
  }

  function sender(w: WishRow): string {
    if (w.playerId) return short(w.playerId);
    return t('god.wish.senderAdmin');
  }

  onMount(() => { void load(1); });
  onDestroy(() => revokeAll(thumbs));
</script>

<section class="list" data-testid="wish-list" aria-label={t('god.wish.listTitle')}>
  <header>
    {#if open}
      <button type="button" class="to-list" data-testid="wish-list-back" onclick={() => (open = null)}>{t('god.wish.backToList')}</button>
    {/if}
    <h2>{open ? t('god.wish.detailTitle') : t('god.wish.listTitle')}</h2>
    <button type="button" data-testid="wish-list-close" onclick={onClose}>{t('god.float.close')}</button>
  </header>

  {#if loading}
    <p class="meta" data-testid="wish-list-loading">{t('god.wish.listLoading')}</p>
  {:else if failure}
    <p class="err" role="alert" data-testid="wish-list-error">{t('god.wish.listError')}</p>
    <div class="row"><button type="button" class="primary" onclick={() => load(current)}>{t('god.wish.listRetry')}</button></div>
  {:else if open}
    {@const w = open}
    <article class="detail" data-testid="wish-detail" data-id={w.id}>
      <div class="meta-row">
        <time datetime={w.createdAt} data-testid="wish-detail-date">{stampText(w.createdAt)}</time>
        <span class="badge" class:fresh={!w.readAt} data-testid="wish-detail-badge">{w.readAt ? t('god.wishes.read') : t('god.wishes.unread')}</span>
      </div>
      <p class="from">{t('god.wish.sender')}: <code data-testid="wish-detail-sender">{sender(w)}</code>
        {#if w.playerId && roleLabel(w.role)}<span class="role" data-role={w.role}>{roleLabel(w.role)}</span>{/if}
      </p>
      {#if thumbs[w.id]}
        <button type="button" class="shot big" data-testid="wish-detail-thumb" onclick={() => (zoom = thumbs[w.id])} aria-label={t('god.wish.enlarge')}>
          <img src={thumbs[w.id]} alt={t('god.wish.shotAlt')} />
        </button>
      {:else if w.screenshotUrl}
        <div class="noshot">{t('god.wish.noShot')}</div>
      {/if}
      <p class="body" data-testid="wish-detail-text">{w.text}</p>
      {#if w.title || w.screen}<p class="meta">{w.title || w.screen}{w.appVersion ? ` · v${w.appVersion}` : ''}</p>{/if}
      {#if w.inspectUrl}<p class="meta"><a href={w.inspectUrl} data-testid="wish-detail-link" target="_blank" rel="noopener">{t('god.wish.inspectLink')}</a></p>{/if}
    </article>
  {:else if pack.wishes.length === 0}
    <p class="meta" data-testid="wish-list-empty">{t('god.wish.listEmpty')}</p>
  {:else}
    <ul class="rows">
      {#each pack.wishes as w (w.id)}
        <li class="card" data-testid="wish-card" data-id={w.id}>
          {#if thumbs[w.id]}
            <button type="button" class="thumb-btn" data-testid="wish-card-thumb" aria-label={t('god.wish.enlarge')} onclick={() => (zoom = thumbs[w.id])}>
              <img class="thumb" src={thumbs[w.id]} alt="" />
            </button>
          {:else}
            <div class="thumb empty" data-testid="wish-card-noshot"></div>
          {/if}
          <button type="button" class="info" data-testid="wish-card-open" onclick={() => (open = w)}>
            <div class="meta-row">
              <time datetime={w.createdAt}>{stampText(w.createdAt)}</time>
              <span class="badge" class:fresh={!w.readAt}>{w.readAt ? t('god.wishes.read') : t('god.wishes.unread')}</span>
            </div>
            <p class="preview">{w.text}</p>
            <p class="from"><code>{sender(w)}</code>
              {#if w.playerId && roleLabel(w.role)}<span class="role" data-role={w.role}>{roleLabel(w.role)}</span>{/if}
            </p>
          </button>
          {#if w.inspectUrl}<a class="ilink" href={w.inspectUrl} data-testid="wish-card-link" target="_blank" rel="noopener">{t('god.wish.inspectLink')}</a>{/if}
        </li>
      {/each}
    </ul>
    <div class="pager" data-testid="wish-pager" role="navigation">
      <button type="button" data-testid="wish-prev" disabled={current <= 1} onclick={() => go(current - 1)}>{t('god.player.prev')}</button>
      <span data-testid="wish-page-info">{t('god.wish.listPage', { page: current, pages, total: pack.total })}</span>
      <button type="button" data-testid="wish-next" disabled={current >= pages} onclick={() => go(current + 1)}>{t('god.player.next')}</button>
    </div>
  {/if}

  {#if zoom}
    <div class="zoom" data-testid="wish-zoom" role="dialog" tabindex="0" aria-label={t('god.wish.enlarge')} onclick={() => (zoom = null)} onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') zoom = null; }}>
      <img src={zoom} alt={t('god.wish.shotAlt')} />
      <button type="button" class="primary" data-testid="wish-zoom-close">{t('god.wish.closeShot')}</button>
    </div>
  {/if}
</section>

<style>
  .list {
    position: absolute;
    z-index: 24;
    left: 10px;
    right: 10px;
    top: 64px;
    bottom: 16px;
    overflow: hidden;
    padding: 12px;
    border-radius: 16px;
    background: rgba(8, 18, 28, 0.98);
    color: #eaf6ff;
    border: 1px solid var(--cyan, #39e0ff);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: nowrap;
    flex: 0 0 auto;
  }
  h2 { margin: 0; font-size: 1rem; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button {
    min-height: 44px;
    padding: 0 14px;
    border-radius: 10px;
    border: 1px solid var(--cyan, #39e0ff);
    background: #0d4a66;
    color: white;
    font-weight: 700;
  }
  button.primary { background: #f0a202; border-color: #f0a202; color: #3a2a00; }
  button:disabled { opacity: 0.5; }
  .to-list { position: static; display: inline-flex; align-items: center; width: auto; height: 44px; min-height: 44px; padding: 0 10px; white-space: nowrap; font-size: 13px; inset: auto; }
  .meta, .from, .preview { margin: 0; font-size: 12px; line-height: 1.45; opacity: 0.9; }
  .err { margin: 0; color: #ffb020; }
  .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; flex: 1; overflow: auto; }
  .card {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 8px;
    border-radius: 10px;
    background: #06121c;
    border: 1px solid rgba(57, 224, 255, 0.35);
  }
  .thumb-btn { padding: 0; border: 0; background: transparent; min-height: 0; flex: none; }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    padding: 4px 8px;
    background: transparent;
    border: 0;
    font-weight: 400;
    min-height: 0;
  }
  .thumb, .shot img, .noshot {
    width: 56px;
    aspect-ratio: 390 / 844;
    object-fit: cover;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: #0d4a66;
    flex: none;
  }
  .thumb.empty { min-height: 48px; }
  .meta-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
  time { font-size: 11px; opacity: 0.8; }
  .badge { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px; background: #1d2b3a; color: #9fb4c8; }
  .badge.fresh { background: #3a2f0a; color: #ffd479; }
  .preview { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; }
  .role { display: inline-block; margin-left: 6px; font-size: 10px; font-weight: 800; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 999px; background: #3a2f0a; color: #ffd479; }
  .role[data-role="super_god"] { background: #4a1230; color: #ff8fc8; }
  .pager { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: space-between; }
  .pager span { font-size: 12px; flex: 1; text-align: center; }
  .detail { display: flex; flex-direction: column; gap: 10px; overflow: auto; flex: 1; min-height: 0; }
  .shot.big { padding: 0; background: transparent; border: 0; align-self: flex-start; }
  .shot.big img { width: 120px; }
  .body { margin: 0; white-space: pre-wrap; word-break: break-word; }
  a { color: var(--cyan, #39e0ff); }
  .ilink { flex: none; writing-mode: horizontal-tb; font-size: 11px; padding: 8px 4px 0 0; align-self: flex-end; }
  .zoom {
    position: absolute;
    inset: 0;
    z-index: 30;
    background: rgba(4, 10, 16, 0.92);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 16px;
  }
  .zoom img { max-width: 100%; max-height: 80%; object-fit: contain; border-radius: 8px; }
</style>
