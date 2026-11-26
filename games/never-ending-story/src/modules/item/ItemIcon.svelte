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
  {#if iconUrl}
    <img src={iconUrl} alt="" />
  {:else}
    <span class="fallback" aria-hidden="true">{title.slice(0, 1)}</span>
  {/if}
</button>

<style>
  .item-icon {
    width: 100%;
    aspect-ratio: 1;
    min-width: 72px;
    min-height: 72px;
    padding: 8px;
    border-radius: 16px;
    border: 3px solid var(--cyan);
    background: var(--hud);
    color: var(--ink);
    display: grid;
    place-items: center;
    cursor: pointer;
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
  .item-icon.fresh { animation: item-fresh 0.7s ease; }
  @keyframes item-fresh {
    0% { transform: scale(0.86); box-shadow: 0 0 0 0 var(--cyan); }
    45% { transform: scale(1.08); box-shadow: 0 0 0 6px transparent; }
    100% { transform: scale(1); }
  }
</style>
