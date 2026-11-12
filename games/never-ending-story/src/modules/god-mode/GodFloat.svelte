<script lang="ts">
  import { appBase } from '../../lib/deployment';
  import { t } from '../../lib/i18n';
  import { godAdminUrl, type FloatPrefs } from './floatState';
  import { inspectDocument, type InspectPage } from './inspect';

  let {
    page,
    prefs,
    onPrefs,
  }: {
    page: InspectPage;
    prefs: FloatPrefs;
    onPrefs: (next: FloatPrefs) => void;
  } = $props();

  let menu = $state(false);
  let inspect = $state(false);
  let copied = $state(false);
  let dragging = $state(false);
  let x = $state(0.78);
  let y = $state(0.62);
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  $effect(() => {
    if (!dragging) {
      x = prefs.x;
      y = prefs.y;
    }
  });

  const doc = $derived(inspectDocument(page));
  const text = $derived(JSON.stringify(doc, null, 2));
  const sections = $derived(Object.entries(doc));

  function point(event: PointerEvent): void {
    const parent = (event.currentTarget as HTMLElement).offsetParent as HTMLElement | null;
    const rect = parent?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.hypot(dx, dy) > 6) moved = true;
    x = Math.min(0.92, Math.max(0.04, originX + dx / rect.width));
    y = Math.min(0.92, Math.max(0.04, originY + dy / rect.height));
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
    if (!moved) menu = !menu;
  }

  function openAdmin(): void {
    window.location.assign(godAdminUrl(window.location.origin, appBase()));
  }

  function openInspect(): void {
    menu = false;
    inspect = true;
    copied = false;
  }

  async function copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<div class="god-float" style="left:{x * 100}%;top:{y * 100}%">
  {#if menu}
    <div class="menu" data-testid="god-float-menu">
      <button type="button" data-testid="god-float-admin" onclick={openAdmin}>{t('god.float.admin')}</button>
      <button type="button" data-testid="god-float-inspect" onclick={openInspect}>{t('god.float.inspect')}</button>
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
  >{t('god.float.toggle')}</button>
</div>

{#if inspect}
  <section class="inspect" data-testid="god-inspect" aria-label={t('god.float.inspectTitle')}>
    <header>
      <h2>{t('god.float.inspectTitle')}</h2>
      <button type="button" data-testid="god-inspect-copy" onclick={copyJson}>{copied ? t('god.float.copied') : t('god.float.copy')}</button>
      <button type="button" onclick={() => (inspect = false)}>{t('god.float.close')}</button>
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
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
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
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 132px;
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
