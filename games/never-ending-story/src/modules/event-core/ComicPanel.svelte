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
  <div class="head">
    <p class="cap" data-testid="comic-caption">{caption}</p>
  </div>
  <div class="stage">
    <div class="art" data-testid="comic-art">
      <img src={imageUrl(image)} alt="" draggable="false" />
      {#each lines as line (line.id)}
        <span class="bub" style="left:{line.x}%;top:{line.y}%;max-width:{line.w}%"><b>{line.who}</b>{line.text}</span>
      {/each}
    </div>
  </div>
  <div class="foot">
    <div class="bar">
      <span class="dots" data-testid="comic-dots" aria-label="{index + 1}/{count}">{#each { length: count } as _, i (i)}<i class:on={i === index}></i>{/each}</span>
      <span class="tapnext" data-testid="comic-tapnext">{tapLabel}</span>
      {#if actions}<span class="actions">{@render actions()}</span>{/if}
    </div>
  </div>
</div>

<style>
  .cs {
    position: absolute;
    inset: 0;
    background: #000;
    overflow: hidden;
    touch-action: pan-y;
    user-select: none;
    -webkit-user-select: none;
    display: flex;
    flex-direction: column;
  }
  .tap { position: absolute; inset: 0; z-index: 1; border: 0; padding: 0; background: transparent; }
  /* Reserved band under the HUD title and the version badge (badge: top 52px + ~20px). */
  .head {
    flex: 0 0 auto;
    z-index: 3;
    padding: calc(82px + env(safe-area-inset-top)) 4% 8px;
    box-sizing: border-box;
    pointer-events: none;
  }
  .cap {
    margin: 0;
    background: #fff6dc;
    color: #3a2a10;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: var(--fs);
    line-height: 1.45;
    text-align: left;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .stage {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
    container-type: size;
    display: grid;
    place-items: center;
  }
  /* Fit the whole 9:16 page in the remaining area so the caption never covers the art. */
  .art {
    position: relative;
    container-type: inline-size;
    aspect-ratio: 720 / 1280;
    width: min(100%, calc(100cqh * 720 / 1280));
    height: min(100%, calc(100cqw * 1280 / 720));
    max-width: 100%;
    max-height: 100%;
  }
  .art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; pointer-events: none; }
  /* Bubble type tracks the art width (design size ~390px) so a long line cannot spill into the next strip. */
  .bub { position: absolute; z-index: 2; pointer-events: none; background: #fff; color: #2b2233; border-radius: 16px; padding: clamp(5px, calc(8px * 100cqw / 390), 8px) clamp(8px, calc(12px * 100cqw / 390), 12px); font-size: clamp(12px, calc(var(--fs) * 100cqw / 390), var(--fs)); line-height: 1.4; text-align: left; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
  .bub b { display: block; font-size: clamp(10px, calc(var(--fs-sm) * 100cqw / 390), var(--fs-sm)); color: #b0567a; }
  /* Bottom bar: the dots, the tap hint and the actions; keeps clear of the app's round back button
     at the bottom-left (12px + 64px). */
  .foot { flex: 0 0 auto; z-index: 3; padding: 0 4% calc(14px + env(safe-area-inset-bottom)); pointer-events: none; }
  .bar { min-height: 64px; display: flex; align-items: center; gap: 10px; padding-left: 76px; }
  .dots { display: flex; gap: 8px; flex: 0 0 auto; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
  .dots i.on { background: #fff; }
  .tapnext { flex: 1 1 auto; min-width: 0; color: #fff; font-size: var(--fs-sm); text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); text-align: right; }
  .actions { flex: 0 0 auto; pointer-events: auto; }
</style>
