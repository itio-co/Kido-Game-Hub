<script lang="ts">
  let {
    title,
    hintLabel,
    settingsLabel,
    showHint = true,
    onHint,
    onSettings,
  }: {
    title: string;
    hintLabel: string;
    settingsLabel: string;
    showHint?: boolean;
    onHint: () => void;
    onSettings: () => void;
  } = $props();
</script>

<header class="hud">
  {#if showHint}
    <button type="button" class="icon" aria-label={hintLabel} onclick={onHint}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          d="M9 18h6M10 21h4"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <path
          d="M12 3a6 6 0 0 0-3.2 11.1c.4.4.7 1 .8 1.6h4.8c.1-.6.4-1.2.8-1.6A6 6 0 0 0 12 3z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
        />
      </svg>
    </button>
  {:else}
    <span class="spacer" aria-hidden="true"></span>
  {/if}
  <span class="rule"></span>
  <span class="place">{title}</span>
  <span class="rule"></span>
  <button type="button" class="icon" aria-label={settingsLabel} onclick={onSettings}>
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M18 6l-1.6 1.6M7.6 16.4 6 18"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
    </svg>
  </button>
</header>
