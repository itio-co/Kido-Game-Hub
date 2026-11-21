<script lang="ts">
  import type { Snippet } from 'svelte';
  import { imageUrl } from '../../lib/imageUrl';
  import { swipeDirection } from './swipe';

  export type ComicLine = { id: string; who: string; text: string; x: number; y: number; w: number };

  let {
    image,
    lines,
    caption,
    tapLabel,
    count,
    index,
    onNext,
    onPrev = undefined,
    actions = undefined,
  }: {
    image: string;
    lines: ComicLine[];
    caption: string;
    tapLabel: string;
    count: number;
    index: number;
    onNext: () => void;
    /** Swipe right (finger moves left→right) goes back a page; no button for it. */
    onPrev?: () => void;
    /** Controls shown at the right end of the bottom bar (e.g. the single skip button). */
    actions?: Snippet;
  } = $props();

  let start: { x: number; y: number; id: number } | null = null;
  let swallowClick = false;

  function down(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function up(event: PointerEvent): void {
    if (!start || start.id !== event.pointerId) return;
    const dir = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (!dir) return;
    swallowClick = true; // the click that follows a swipe must not also advance
    setTimeout(() => (swallowClick = false), 400);
    if (dir === 'next') onNext();
    else onPrev?.();
  }

  function tap(): void {
    if (swallowClick) { swallowClick = false; return; }
    onNext();
  }
</script>

<div
  class="cs"
  data-testid="comic-panel"
  role="presentation"
  onpointerdown={down}
  onpointerup={up}
  onpointercancel={() => (start = null)}
>
  <button type="button" class="tap" data-testid="comic-tap" aria-label={tapLabel} onclick={tap}></button>
  <img src={imageUrl(image)} alt="" draggable="false" />
  {#each lines as line (line.id)}
    <span class="bub" style="left:{line.x}%;top:{line.y}%;max-width:{line.w}%"><b>{line.who}</b>{line.text}</span>
  {/each}
  <div class="foot">
    <p class="cap" data-testid="comic-caption">{caption}</p>
    <div class="bar">
      <span class="dots" data-testid="comic-dots" aria-label="{index + 1}/{count}">{#each { length: count } as _, i (i)}<i class:on={i === index}></i>{/each}</span>
      <span class="tapnext" data-testid="comic-tapnext">{tapLabel}</span>
      {#if actions}<span class="actions">{@render actions()}</span>{/if}
    </div>
  </div>
</div>

<style>
  .cs { position: absolute; inset: 0; background: #000; overflow: hidden; touch-action: pan-y; user-select: none; -webkit-user-select: none; }
  .tap { position: absolute; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; }
  .cs img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
  .bub { position: absolute; z-index: 2; pointer-events: none; background: #fff; color: #2b2233; border-radius: 16px; padding: 8px 12px; font-size: var(--fs); line-height: 1.4; text-align: left; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
  .bub b { display: block; font-size: var(--fs-sm); color: #b0567a; }
  /* One bottom stack, top to bottom: caption, then a bar with the dots, the tap hint and the actions.
     The bar keeps clear of the round back button the app draws at the bottom-left (12px + 64px). */
  .foot { position: absolute; z-index: 3; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 10px; padding: 0 4% calc(14px + env(safe-area-inset-bottom)); pointer-events: none; }
  .cap { margin: 0; background: #fff6dc; color: #3a2a10; border-radius: 10px; padding: 10px 12px; font-size: var(--fs); line-height: 1.45; text-align: left; }
  .bar { min-height: 64px; display: flex; align-items: center; gap: 10px; padding-left: 76px; }
  .dots { display: flex; gap: 8px; flex: 0 0 auto; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
  .dots i.on { background: #fff; }
  .tapnext { flex: 1 1 auto; min-width: 0; color: #fff; font-size: var(--fs-sm); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); text-align: right; }
  .actions { flex: 0 0 auto; pointer-events: auto; }
</style>
