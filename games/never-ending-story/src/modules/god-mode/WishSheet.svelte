<script lang="ts">
  import { playerAuthHeaders } from '../../lib/cloudSync';
  import { t } from '../../lib/i18n';
  import type { InspectPage } from './inspect';
  import { sendWish, stampText, wishPayload, wishProblem, WISH_MAX_TEXT, type WishFailure, type WishSent } from './wish';

  let { page, shot, onClose }: { page: InspectPage; shot: string | null; onClose: () => void } = $props();

  let text = $state('');
  let sending = $state(false);
  let failure = $state<WishFailure | null>(null);
  let sent = $state<WishSent | null>(null);

  const problem = $derived(wishProblem(text));

  async function send(): Promise<void> {
    if (sending || problem) return;
    sending = true;
    failure = null;
    const result = await sendWish(wishPayload(page, text, shot), fetch, playerAuthHeaders());
    sending = false;
    if (result.ok) sent = result.wish;
    else failure = result.failure;
  }
</script>

<div class="wish-scrim" data-wish-skip role="presentation">
  <section class="wish" data-testid="wish-sheet" aria-label={t('god.wish.title')}>
    {#if sent}
      <h2>{t('god.wish.sentTitle')}</h2>
      <p class="done" data-testid="wish-sent" role="status">{t('god.wish.sentBody', { at: stampText(sent.createdAt) })}</p>
      <p class="meta"><code data-testid="wish-sent-id">{sent.id.slice(0, 8)}</code>
        {#if sent.inspectUrl}<a href={sent.inspectUrl} data-testid="wish-sent-link">{t('god.wish.inspectLink')}</a>{/if}
      </p>
      <div class="row"><button type="button" class="primary" data-testid="wish-done" onclick={onClose}>{t('god.float.close')}</button></div>
    {:else}
      <h2>{t('god.wish.title')}</h2>
      <div class="attach">
        {#if shot}
          <img src={shot} alt={t('god.wish.shotAlt')} data-testid="wish-thumb" />
        {:else}
          <div class="noshot" data-testid="wish-noshot">{t('god.wish.noShot')}</div>
        {/if}
        <p class="meta">{t('god.wish.attached', { page: page.page.title || page.page.screen })}</p>
      </div>
      <textarea
        data-testid="wish-text"
        placeholder={t('god.wish.placeholder')}
        maxlength={WISH_MAX_TEXT}
        bind:value={text}
        disabled={sending}
      ></textarea>
      {#if failure}<p class="err" role="alert" data-testid="wish-error">{t(`god.wish.err.${failure}`)}</p>{/if}
      <div class="row">
        <button type="button" data-testid="wish-cancel" disabled={sending} onclick={onClose}>{t('god.wish.cancel')}</button>
        <button type="button" class="primary" data-testid="wish-send" disabled={sending || !!problem} onclick={send}>{sending ? t('god.wish.sending') : t('god.wish.send')}</button>
      </div>
    {/if}
  </section>
</div>

<style>
  .wish-scrim {
    position: absolute;
    inset: 0;
    z-index: 24;
    display: flex;
    align-items: flex-end;
    background: rgba(4, 10, 16, 0.55);
  }
  .wish {
    width: 100%;
    max-height: 88%;
    overflow: auto;
    box-sizing: border-box;
    padding: 16px 14px calc(14px + env(safe-area-inset-bottom));
    border-radius: 18px 18px 0 0;
    background: rgba(8, 18, 28, 0.98);
    color: #eaf6ff;
    border: 1px solid var(--cyan, #39e0ff);
    border-bottom: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 { margin: 0; font-size: 1.05rem; }
  .attach { display: flex; gap: 10px; align-items: flex-start; }
  .attach img, .noshot {
    width: 84px;
    aspect-ratio: 390 / 844;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: #0d4a66;
  }
  .noshot { display: grid; place-items: center; font-size: 11px; text-align: center; padding: 4px; box-sizing: border-box; }
  .meta { margin: 0; font-size: 12px; line-height: 1.5; opacity: 0.85; word-break: break-all; }
  textarea {
    min-height: 120px;
    box-sizing: border-box;
    width: 100%;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid var(--cyan, #39e0ff);
    background: #06121c;
    color: inherit;
    font: inherit;
    resize: vertical;
  }
  .row { display: flex; gap: 8px; justify-content: flex-end; }
  button {
    min-height: 44px;
    padding: 0 18px;
    border-radius: 10px;
    border: 1px solid var(--cyan, #39e0ff);
    background: #0d4a66;
    color: white;
    font-weight: 700;
  }
  button.primary { background: #f0a202; border-color: #f0a202; color: #3a2a00; }
  button:disabled { opacity: 0.5; }
  .err { margin: 0; color: #ffb020; font-size: 13px; }
  .done { margin: 0; color: #9be8a5; }
  a { color: var(--cyan, #39e0ff); }
</style>
