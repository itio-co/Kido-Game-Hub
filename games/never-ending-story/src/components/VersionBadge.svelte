<script lang="ts">
  import { version } from '../../package.json';
  import { t } from '../lib/i18n';
  import { nextVersionTap, type TapClock } from '../modules/god-mode';

  let { onUnlock }: { onUnlock: () => void } = $props();

  let clock = $state<TapClock | null>(null);
  let hint = $state(false);
  let remaining = $state(0);

  function tap(): void {
    const step = nextVersionTap(clock, Date.now());
    clock = step.clock;
    hint = step.hint;
    remaining = step.remaining;
    if (step.unlocked) onUnlock();
  }
</script>

<button type="button" class="ver" data-testid="version-badge" onclick={tap}>
  v{version}
  {#if hint}<i data-testid="version-hint">{t('god.float.tapHint', { n: remaining })}</i>{/if}
</button>

<style>
  /* Sit under the HUD on the left — never overlaps the settings gear (top-right). */
  .ver {
    position: absolute;
    z-index: 40;
    top: calc(52px + env(safe-area-inset-top));
    left: 8px;
    right: auto;
    bottom: auto;
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.45);
    padding: 2px 6px;
    border-radius: 8px;
    border: 0;
    cursor: pointer;
    font-family: inherit;
  }
  i {
    display: block;
    font-style: normal;
    font-weight: 600;
    opacity: 0.8;
  }
</style>
