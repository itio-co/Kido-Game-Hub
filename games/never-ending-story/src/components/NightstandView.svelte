<script lang="ts">
  import { onMount } from 'svelte';
  import { mountNightstandStage, type NightstandVariant } from '../lib/nightstandStage';

  let { variant = 'lowpoly', orbit = false }: { variant?: NightstandVariant; orbit?: boolean } = $props();
  let canvas = $state<HTMLCanvasElement>();

  onMount(() => {
    if (!canvas) return;
    const view = mountNightstandStage(canvas, variant, orbit ? 'orbit' : 'fit');
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
