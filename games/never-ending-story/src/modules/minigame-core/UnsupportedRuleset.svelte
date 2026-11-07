<script lang="ts">
  import { t } from '../../lib/i18n';

  let {
    ruleset,
    onPlayCurrent,
    onExit,
    exitLabel = '',
  }: {
    ruleset: string;
    onPlayCurrent: () => void;
    onExit?: () => void;
    exitLabel?: string;
  } = $props();
</script>

<div class="panel" data-testid="ruleset-unsupported">
  <p class="vs">{t('ruleset.unsupported', { ruleset })}</p>
  <button type="button" class="primary" onclick={onPlayCurrent}>{t('ruleset.playCurrent')}</button>
  {#if onExit}
    <button type="button" class="ghost" onclick={onExit}>{exitLabel}</button>
  {/if}
</div>

<style>
  .panel {
    margin: auto 0;
    background: #0d2a3c;
    border: 2px solid #39e0ff;
    border-radius: 16px;
    padding: 18px;
    text-align: center;
  }
  .vs { text-align: center; font-weight: 700; color: #ffd34d; }
  .primary, .ghost {
    display: block;
    width: 100%;
    margin-top: 12px;
    height: 52px;
    border-radius: 12px;
    font-weight: 800;
    font-size: 1rem;
  }
  .primary { border: 0; background: #39e0ff; color: #06212f; }
  .ghost { background: transparent; color: #eaf6ff; border: 2px solid #39e0ff; }
</style>
