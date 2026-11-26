<script lang="ts">
  let {
    title,
    iconUrl,
    fresh = false,
    slug,
    onclick,
  }: {
    title: string;
    iconUrl: string;
    fresh?: boolean;
    slug: string;
    onclick: () => void;
  } = $props();
</script>

<button
  type="button"
  class="item-icon"
  class:fresh
  data-testid={'item-slot-' + slug}
  aria-label={title}
  {onclick}
>
  <span class="glyph">
    {#if iconUrl}
      <img src={iconUrl} alt="" />
    {:else}
      <span class="fallback" aria-hidden="true">{title.slice(0, 1)}</span>
    {/if}
  </span>
  <span class="name">{title}</span>
</button>

<style>
  .item-icon {
    width: 100%;
    min-width: 72px;
    padding: 8px 6px 6px;
    border-radius: 16px;
    border: 3px solid var(--cyan);
    background: var(--hud);
    color: var(--ink);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    cursor: pointer;
  }
  .glyph {
    width: 100%;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
  }
  .item-icon img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }
  .fallback {
    font-size: 1.6rem;
    font-weight: 800;
  }
  .name {
    min-height: 2.5em;
    font-size: var(--fs-sm, 0.85rem);
    font-weight: 700;
    line-height: 1.25;
    text-align: center;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
  }
  .item-icon.fresh { animation: item-fresh 0.7s ease; }
  @keyframes item-fresh {
    0% { transform: scale(0.86); box-shadow: 0 0 0 0 var(--cyan); }
    45% { transform: scale(1.08); box-shadow: 0 0 0 6px transparent; }
    100% { transform: scale(1); }
  }
</style>
