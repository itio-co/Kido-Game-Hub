<script lang="ts">
  let {
    title,
    body,
    onClose,
    actionLabel = '',
    onAction = undefined,
  }: {
    title: string;
    body: string;
    onClose: () => void;
    actionLabel?: string;
    onAction?: () => void;
  } = $props();
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label={title} open onclick={(event) => event.stopPropagation()}>
    <h2>{title}</h2>
    <p>{body}</p>
    {#if actionLabel && onAction}
      <button type="button" class="close action" onclick={onAction}>{actionLabel}</button>
    {/if}
    <button type="button" class="close" onclick={onClose}>ปิด</button>
  </dialog>
</div>
