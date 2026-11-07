<script lang="ts">
  import { imageUrl } from '../../lib/flow/loadFlow';

  export type ComicLine = { id: string; who: string; text: string; x: number; y: number; w: number };

  let {
    image,
    lines,
    caption,
    tapLabel,
    count,
    index,
    onNext,
  }: {
    image: string;
    lines: ComicLine[];
    caption: string;
    tapLabel: string;
    count: number;
    index: number;
    onNext: () => void;
  } = $props();
</script>

<button type="button" class="cs" data-testid="comic-panel" onclick={onNext}>
  <img src={imageUrl(image)} alt="" />
  {#each lines as line (line.id)}
    <span class="bub" style="left:{line.x}%;top:{line.y}%;max-width:{line.w}%"><b>{line.who}</b>{line.text}</span>
  {/each}
  <span class="cap">{caption}</span>
  <span class="tapnext">{tapLabel}</span>
  <span class="dots">{#each { length: count } as _, i (i)}<i class:on={i === index}></i>{/each}</span>
</button>

<style>
  .cs { position: absolute; inset: 0; border: 0; padding: 0; background: #000; }
  .cs img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bub { position: absolute; background: #fff; color: #2b2233; border-radius: 16px; padding: 8px 12px; font-size: var(--fs); line-height: 1.4; text-align: left; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
  .bub b { display: block; font-size: var(--fs-sm); color: #b0567a; }
  .cap { position: absolute; left: 4%; right: 4%; bottom: 96px; background: #fff6dc; color: #3a2a10; border-radius: 10px; padding: 10px 12px; font-size: var(--fs); line-height: 1.45; text-align: left; }
  .tapnext { position: absolute; right: 12px; bottom: 64px; color: #fff; font-size: var(--fs-sm); }
  .dots { position: absolute; left: 0; right: 0; bottom: 34px; display: flex; justify-content: center; gap: 8px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
  .dots i.on { background: #fff; }
</style>
