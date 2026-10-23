<script lang="ts">
  let {
    steps,
    index,
    onNext,
  }: {
    steps: { title: string; body: string }[];
    index: number;
    onNext: () => void;
  } = $props();

  const step = $derived(steps[index] ?? steps[0]);
  const last = $derived(index >= steps.length - 1);
</script>

{#if step}
  <section class="tutor" aria-label="บทสอน">
    <div class="steps" aria-hidden="true">
      {#each steps as _, stepIndex}
        <i class:on={stepIndex === index}></i>
      {/each}
    </div>
    <h2>{step.title}</h2>
    <p>{step.body}</p>
    <button type="button" onclick={onNext}>{last ? 'เริ่มเล่น' : 'ถัดไป'}</button>
  </section>
{/if}
