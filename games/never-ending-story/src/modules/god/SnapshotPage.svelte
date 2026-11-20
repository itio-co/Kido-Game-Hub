<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { ApiError, fmtDate, god } from './api';

  let { id, token }: { id: string; token: string } = $props();
  let status = $state<'loading' | 'ready' | 'expired' | 'revoked' | 'bad-token' | 'error'>('loading');
  let title = $state('');
  let expiresAt = $state(0);
  let documentText = $state('');

  function message(code: string): 'expired' | 'revoked' | 'bad-token' | 'error' {
    if (code === 'expired' || code === 'revoked' || code === 'bad-token') return code;
    return 'error';
  }

  onMount(() => {
    void god<{ title?: string; expiresAt?: number; document?: unknown }>(`snapshots/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`)
      .then((data) => {
        title = String(data.title ?? '');
        expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
        documentText = JSON.stringify(data.document, null, 2);
        status = 'ready';
      })
      .catch((error: unknown) => {
        status = error instanceof ApiError ? message(error.code) : 'error';
      });
  });

  function download(): void {
    const blob = new Blob([documentText], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nes-snapshot-${id.slice(0, 12)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
</script>

<main class="snap">
  {#if status === 'loading'}
    <p>{t('god.loading')}</p>
  {:else if status === 'ready'}
    <header>
      <h1>{title || t('god.snap.viewer')}</h1>
      <p>{t('god.snap.until', { at: fmtDate(expiresAt) })}</p>
      <button type="button" data-testid="snapshot-download" onclick={download}>{t('god.snap.download')}</button>
    </header>
    <pre data-testid="snapshot-json">{documentText}</pre>
  {:else}
    <p class="warn" role="alert" data-testid="snapshot-error">{t(`god.snap.${status}`)}</p>
  {/if}
</main>

<style>
  .snap { max-width: 880px; margin: 0 auto; padding: 24px 16px 48px; color: #eaf6ff; }
  header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  h1 { margin: 0; font-size: 1.3rem; flex: 1; }
  p { margin: 0; }
  button { min-height: 44px; border-radius: 10px; border: 1px solid #39e0ff; background: #0d4a66; color: white; font-weight: 700; padding: 8px 14px; }
  pre { margin-top: 16px; white-space: pre-wrap; word-break: break-word; background: #08141c; border-radius: 12px; padding: 12px; font-size: 13px; line-height: 1.45; }
  .warn { padding: 16px; border: 1px solid #ffb020; border-radius: 12px; background: #2a2010; }
</style>
