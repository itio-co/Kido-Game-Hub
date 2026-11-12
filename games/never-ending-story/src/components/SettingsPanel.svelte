<script lang="ts">
  import { t } from '../lib/i18n';
  import type { TextSize } from '../lib/types';

  let {
    textSize,
    soundEnabled,
    onTextSize,
    onSound,
    onClose,
    onReplayPrologue,
    showGod = false,
    godOn = false,
    onGodToggle,
  }: {
    textSize: TextSize;
    soundEnabled: boolean;
    onTextSize: (size: TextSize) => void;
    onSound: (enabled: boolean) => void;
    onClose: () => void;
    onReplayPrologue?: () => void;
    /** Shown only when this device already has a God admin session. */
    showGod?: boolean;
    godOn?: boolean;
    onGodToggle?: () => void;
  } = $props();

  const sizes: { id: TextSize; label: string }[] = [
    { id: 'sm', label: 'เล็ก' },
    { id: 'md', label: 'กลาง' },
    { id: 'lg', label: 'ใหญ่' },
  ];
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label={t('settings.title')} open onclick={(event) => event.stopPropagation()}>
    <header class="head">
      <h2>{t('settings.title')}</h2>
      {#if showGod}
        <button
          type="button"
          class="god"
          class:on={godOn}
          data-testid="god-mode-toggle"
          aria-pressed={godOn}
          onclick={onGodToggle}
        >{t('god.float.toggle')}</button>
      {/if}
    </header>
    <p>ขนาดตัวอักษร</p>
    <div class="row">
      {#each sizes as size (size.id)}
        <button
          type="button"
          class="choice"
          class:on={textSize === size.id}
          aria-pressed={textSize === size.id}
          onclick={() => onTextSize(size.id)}
        >
          {size.label}
        </button>
      {/each}
    </div>
    <p>เสียงพากย์</p>
    <div class="row">
      <button
        type="button"
        class="toggle"
        class:on={soundEnabled}
        aria-pressed={soundEnabled}
        onclick={() => onSound(!soundEnabled)}
      >
        {soundEnabled ? 'เปิดอยู่' : 'ปิดอยู่'}
      </button>
    </div>
    <p class="note">ยังไม่มีเสียงในหน้านี้ สวิตช์ถูกจำไว้ในเครื่อง</p>
    {#if onReplayPrologue}
      <button type="button" class="toggle" data-testid="replay-prologue" onclick={onReplayPrologue}>{t('settings.replayPrologue')}</button>
    {/if}
    <button type="button" class="close" onclick={onClose}>ปิด</button>
  </dialog>
</div>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
  .head h2 { margin: 0; }
  .god {
    margin-left: auto;
    min-height: 36px;
    border-radius: 999px;
    border: 1px solid var(--cyan);
    background: #123246;
    color: #eaf6ff;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 6px 12px;
  }
  .god.on { background: #ffcf4a; color: #3a2a00; }
</style>
