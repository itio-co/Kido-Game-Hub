<script lang="ts">
  import type { Snippet } from 'svelte';
  import { imageUrl } from '../../lib/imageUrl';
  import { artPctToPx, placeBubble, type FaceMask } from './bubbleLayout';
  import { swipeDirection } from './swipe';

  export type ComicLine = { id: string; who: string; text: string; x: number; y: number; w: number };
  export type { FaceMask };

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
    faces = [],
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
    /** Face/head masks in % of the source art. Authored bubble coords are only a preference. */
    faces?: FaceMask[];
  } = $props();

  let start: { x: number; y: number; id: number } | null = null;
  let swallowClick = false;
  let linesBox: HTMLDivElement | undefined;
  let artBox: HTMLDivElement | undefined;
  const debugFaces = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debugFaces');

  /** Keep every bubble inside the padded art frame and off every face mask. */
  function clampBubbles(): void {
    const node = linesBox;
    const art = artBox;
    if (!node || !art) return;
    const artR = art.getBoundingClientRect();
    const boundR = node.getBoundingClientRect();
    const bounds = { x: boundR.x - artR.x, y: boundR.y - artR.y, w: boundR.width, h: boundR.height };
    const masks = faces.map((face) => artPctToPx(face, artR.width, artR.height));
    for (const el of node.querySelectorAll<HTMLElement>('.bub')) {
      el.style.transform = '';
      el.style.left = '';
      el.style.top = '';
      el.style.maxWidth = '';
      const b = el.getBoundingClientRect();
      const placed = placeBubble({
        box: { x: b.x - artR.x, y: b.y - artR.y, w: b.width, h: b.height },
        bounds,
        masks,
        minW: Math.max(72, bounds.w * 0.22),
        heightAtWidth: (width) => {
          el.style.maxWidth = `${width}px`;
          return el.getBoundingClientRect().height;
        },
      });
      el.style.maxWidth = `${placed.w}px`;
      el.style.left = `${placed.x - bounds.x}px`;
      el.style.top = `${placed.y - bounds.y}px`;
    }
  }

  $effect(() => {
    void image;
    void lines;
    void index;
    void faces;
    const node = linesBox;
    if (!node) return;
    const ro = new ResizeObserver(() => clampBubbles());
    ro.observe(node);
    const id = requestAnimationFrame(() => clampBubbles());
    return () => { cancelAnimationFrame(id); ro.disconnect(); };
  });

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
    <div class="art" data-testid="comic-art" bind:this={artBox}>
      <img src={imageUrl(image)} alt="" draggable="false" />
      {#if debugFaces}
        {#each faces as face (face.name)}
          <i
            class="face-mask"
            data-testid="comic-face-mask"
            style="left:{face.x}%;top:{face.y}%;width:{face.w}%;height:{face.h}%"
            title={face.name}
          ></i>
        {/each}
      {/if}
      <div class="lines" data-testid="comic-bubbles" bind:this={linesBox}>
        {#each lines as line (line.id)}
          <span
            class="bub"
            data-testid="comic-bubble"
            style="--x:{line.x}%;--y:{line.y}%;--w:{line.w}%"
          ><b>{line.who}</b><span class="txt">{line.text}</span></span>
        {/each}
      </div>
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
    box-sizing: border-box;
    margin: 0;
    background: #fff6dc;
    color: #3a2a10;
    border-radius: 10px;
    /* Same inner padding as the speech bubbles (10×12 at the design size). */
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
  .face-mask {
    position: absolute;
    z-index: 3;
    box-sizing: border-box;
    pointer-events: none;
    border: 2px solid #ff3b5c;
    background: rgba(255, 59, 92, 0.28);
  }
  /* Inset the bubble layer from the art frame (>= 10px, a little more on a wider art box). */
  .lines { position: absolute; inset: max(10px, 3cqw); z-index: 2; pointer-events: none; }
  /* Bubble type tracks the art width (design size ~390px) so a long line cannot spill into the next strip. */
  .bub {
    position: absolute;
    box-sizing: border-box;
    z-index: 2;
    pointer-events: none;
    left: min(var(--x), calc(100% - var(--w)));
    top: var(--y);
    max-width: min(var(--w), 100%);
    background: #fff;
    color: #2b2233;
    border-radius: 16px;
    /* Same 10×12 rhythm as the caption, with a floor so small art never jams the text against the border.
       Use a unitless coefficient times cqw — `10px * 100cqw` is an invalid length×length product and
       the declaration was being dropped (computed padding 0). */
    padding: 10px 12px;
    padding: clamp(8px, calc(10 * 100cqw / 390), 10px) clamp(10px, calc(12 * 100cqw / 390), 12px);
    font-size: var(--fs);
    font-size: clamp(12px, calc(var(--fs) * (100cqw / 390px)), var(--fs));
    line-height: 1.4;
    text-align: left;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .bub b { display: block; font-size: var(--fs-sm); font-size: clamp(10px, calc(var(--fs-sm) * (100cqw / 390px)), var(--fs-sm)); color: #b0567a; }
  .bub .txt { display: block; }
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
