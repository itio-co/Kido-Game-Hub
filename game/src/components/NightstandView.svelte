<script lang="ts">
  import { onMount } from 'svelte';
  import type { NightstandEntity } from '../lib/types';
  import { mountNightstandStage } from '../lib/nightstandStage';

  let { entity, orbit = false }: { entity: NightstandEntity; orbit?: boolean } = $props();
  let canvas = $state<HTMLCanvasElement>();

  onMount(() => {
    if (!canvas) return;
    const view = mountNightstandStage(canvas, entity, orbit ? 'orbit' : 'fit');
    return () => view.dispose();
  });
</script>

<div class="stage">
  <canvas bind:this={canvas} aria-label={orbit ? 'หมุนตู้ข้างเตียง' : 'ตู้ข้างเตียงสามมิติ'}></canvas>
</div>

<style>
  .stage,
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }
  canvas { touch-action: none; }
</style>
