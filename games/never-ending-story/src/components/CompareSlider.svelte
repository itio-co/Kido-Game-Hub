<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '../lib/i18n/core';

  type Crop = { x: number; y: number; w: number; h: number };

  let {
    src,
    crop = null,
    beforeLabel = 'Mock-up',
    afterLabel = '3D',
    children,
  }: {
    src: string;
    /** Percent of the full frame. Both layers use the same rect so they stay aligned. */
    crop?: Crop | null;
    /** Corner labels for the left (image) and right (live) layers. */
    beforeLabel?: string;
    afterLabel?: string;
    children: Snippet;
  } = $props();

  let value = $state(50);
  let root = $state<HTMLDivElement>();

  const shift = $derived(
    crop
      ? `width:${10000 / crop.w}%;height:${10000 / crop.h}%;left:${(-crop.x / crop.w) * 100}%;top:${(-crop.y / crop.h) * 100}%;`
      : 'inset:0;',
  );

  function seek(event: PointerEvent): void {
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width) return;
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    value = (x / rect.width) * 100;
  }

  function down(event: PointerEvent): void {
    root?.setPointerCapture(event.pointerId);
    seek(event);
  }

  function move(event: PointerEvent): void {
    if (!root?.hasPointerCapture(event.pointerId)) return;
    seek(event);
  }
</script>

<div
  class="cmp"
  bind:this={root}
  onpointerdown={down}
  onpointermove={move}
  role="slider"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(value)}
  aria-label={t('game.showcase.compare')}
  tabindex="0"
>
  <img class="fill" style={shift} {src} alt={beforeLabel} draggable="false" />
  <div class="live" style="clip-path: inset(0 0 0 {value}%)">
    <div class="fill" style={shift}>
      {@render children()}
    </div>
  </div>
  <span class="label mock">{beforeLabel}</span>
  <span class="label three">{afterLabel}</span>
  <div class="line" style="left:{value}%">
    <span class="handle" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path d="M14 6 8 12l6 6M10 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </div>
</div>

<style>
  .cmp {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    cursor: ew-resize;
    background: #c4925c;
  }
  .fill {
    position: absolute;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: fill;
    max-width: none;
    pointer-events: none;
  }
  .live {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }
  .label {
    position: absolute;
    z-index: 4;
    top: 10px;
    padding: 4px 10px;
    border-radius: 10px;
    background: rgba(6, 24, 40, 0.78);
    color: #fff;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: 0.01em;
    pointer-events: none;
  }
  .mock { left: 10px; }
  .three { right: 10px; }
  .line {
    position: absolute;
    z-index: 5;
    top: 0;
    bottom: 0;
    width: 4px;
    margin-left: -2px;
    background: #fff;
    box-shadow: 0 0 0 1px rgba(8, 24, 40, 0.55);
    pointer-events: none;
  }
  .handle {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 52px;
    height: 52px;
    margin: -26px 0 0 -26px;
    border-radius: 50%;
    border: 3px solid #fff;
    background: #083044;
    color: #fff;
    display: grid;
    place-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
</style>
