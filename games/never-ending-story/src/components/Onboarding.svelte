<script lang="ts">
  import { t } from '../lib/i18n/core';
  import { tx } from '../lib/i18n/content';

  let {
    steps,
    index,
    onNext,
  }: {
    steps: { title: string; titleEn?: string; body: string; bodyEn?: string }[];
    index: number;
    onNext: () => void;
  } = $props();

  const step = $derived(steps[index] ?? steps[0]);
  const last = $derived(index >= steps.length - 1);
</script>

{#if step}
  <section class="tutor" aria-label={t('game.tutor.label')}>
    <div class="steps" aria-hidden="true">
      {#each steps as _, stepIndex}
        <i class:on={stepIndex === index}></i>
      {/each}
    </div>
    <h2>{tx(step, 'title')}</h2>
    <p>{tx(step, 'body')}</p>
    <button type="button" onclick={onNext}>{last ? t('game.tutor.start') : t('game.tutor.next')}</button>
  </section>
{/if}
