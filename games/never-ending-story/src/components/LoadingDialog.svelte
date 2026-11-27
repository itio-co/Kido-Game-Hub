<script lang="ts">
  let {
    title,
    body = '',
  }: {
    title: string;
    body?: string;
  } = $props();
</script>

<div class="loading-scrim" data-testid="loading-dialog" role="presentation">
  <div
    class="loading-card"
    role="dialog"
    aria-modal="true"
    aria-labelledby="loading-title"
    aria-describedby={body ? 'loading-body' : undefined}
    aria-busy="true"
    aria-live="polite"
  >
    <h2 id="loading-title">{title}</h2>
    {#if body}
      <p id="loading-body">{body}</p>
    {/if}
    <div class="loading-spinner" aria-hidden="true"></div>
  </div>
</div>

<style>
  .loading-scrim {
    position: absolute;
    inset: 0;
    z-index: 50;
    background: rgba(0, 0, 0, 0.62);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    box-sizing: border-box;
  }
  .loading-card {
    width: 100%;
    max-width: 320px;
    margin: 0;
    background: #06212f;
    border: 2px solid #39e0ff;
    border-radius: 16px;
    padding: 16px 16px 18px;
    color: #eaf6ff;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    text-align: center;
  }
  .loading-card h2 { margin: 0 0 8px; font-size: calc(var(--fs) + 2px); }
  .loading-card p { margin: 0 0 12px; line-height: 1.5; }
  .loading-spinner {
    width: 28px;
    height: 28px;
    margin: 4px auto 0;
    border: 3px solid rgba(57, 224, 255, 0.25);
    border-top-color: #39e0ff;
    border-radius: 50%;
    animation: loading-spin 0.8s linear infinite;
  }
  @keyframes loading-spin {
    to { transform: rotate(360deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading-spinner { animation: none; opacity: 0.85; }
  }
</style>
