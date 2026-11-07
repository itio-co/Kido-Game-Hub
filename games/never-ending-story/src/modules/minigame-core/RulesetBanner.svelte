<script lang="ts">
  import { t } from '../../lib/i18n';

  let { ruleset }: { ruleset: string } = $props();
</script>

<span class="ver" data-testid="ruleset-banner">{t('ruleset.banner', { ruleset })}</span>

<style>
  .ver { font-size: 11px; opacity: 0.75; font-weight: 700; overflow-wrap: anywhere; text-align: center; display: block; }
</style>
