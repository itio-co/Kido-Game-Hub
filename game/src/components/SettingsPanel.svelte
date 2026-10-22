<script lang="ts">
  import type { TextSize } from '../lib/types';

  let {
    textSize,
    soundEnabled,
    onTextSize,
    onSound,
    onClose,
  }: {
    textSize: TextSize;
    soundEnabled: boolean;
    onTextSize: (size: TextSize) => void;
    onSound: (enabled: boolean) => void;
    onClose: () => void;
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
    <button type="button" class="close" onclick={onClose}>ปิด</button>
  </dialog>
</div>
