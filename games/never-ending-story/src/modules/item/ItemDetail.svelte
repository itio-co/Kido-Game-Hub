<script lang="ts">
  let {
    title,
    description,
    imageUrl,
    closeLabel,
    onClose,
  }: {
    title: string;
    description: string;
    imageUrl: string;
    closeLabel: string;
    onClose: () => void;
  } = $props();
</script>

<div class="item-detail" data-testid="item-detail" role="dialog" aria-label={title}>
  <button type="button" class="close" data-testid="item-detail-close" aria-label={closeLabel} onclick={onClose}>✕</button>
  {#if imageUrl}
    <img src={imageUrl} alt="" />
  {/if}
  <h2>{title}</h2>
  <p>{description}</p>
</div>

<style>
  .item-detail {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 8px 8px 4px;
    text-align: center;
  }
  .item-detail img {
    width: min(100%, 240px);
    aspect-ratio: 1;
    object-fit: contain;
  }
  .item-detail h2 {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.35;
    font-weight: 800;
  }
  .item-detail p {
    margin: 0;
    font-size: var(--fs);
    line-height: 1.5;
  }
  .close {
    position: absolute;
    top: 0;
    right: 0;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 0;
    background: #fff;
    color: #333;
    font-size: 18px;
  }
</style>
