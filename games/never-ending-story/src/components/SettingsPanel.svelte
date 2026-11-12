<script lang="ts">
  import { appVersionLabel } from '../lib/appVersion';
  import { t } from '../lib/i18n';
  import type { TextSize } from '../lib/types';

  let {
    textSize,
    soundEnabled,
    onTextSize,
    onSound,
    onClose,
    onReplayPrologue,
  }: {
    textSize: TextSize;
    soundEnabled: boolean;
    onTextSize: (size: TextSize) => void;
    onSound: (enabled: boolean) => void;
    onClose: () => void;
    onReplayPrologue?: () => void;
  } = $props();

  const sizes: { id: TextSize; label: string }[] = [
    { id: 'sm', label: 'เล็ก' },
    { id: 'md', label: 'กลาง' },
    { id: 'lg', label: 'ใหญ่' },
  ];
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label="ตั้งค่า" open onclick={(event) => event.stopPropagation()}>
    <h2>ตั้งค่า</h2>
    <p data-testid="settings-version">{appVersionLabel()}</p>
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
