<script lang="ts">
  let { title, body, onClose }: { title: string; body: string; onClose: () => void } = $props();
</script>

<div class="scrim" onclick={onClose} role="presentation">
  <dialog class="sheet" aria-label={title} open onclick={(event) => event.stopPropagation()}>
    <h2>{title}</h2>
    <p>{body}</p>
    <button type="button" class="close" onclick={onClose}>ปิด</button>
  </dialog>
</div>
