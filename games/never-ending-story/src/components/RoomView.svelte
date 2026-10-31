<script lang="ts">
  import { onMount } from 'svelte';
  import type { PlayerRoom } from '../lib/types';
  import { mountRoom, type RoomView as View } from '../lib/scene';
  import { tx } from '../lib/i18n/content';

  let {
    room,
    selectedId = null,
    hintId = null,
    decor = {},
    onTap = () => {},
    onMiss = () => {},
    showMarkers = true,
  }: {
    room: PlayerRoom;
    selectedId?: string | null;
    hintId?: string | null;
    decor?: Record<string, string | null>;
    onTap?: (id: string) => void;
    onMiss?: () => void;
    showMarkers?: boolean;
  } = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let ready = $state(false);
  let spots = $state<{ id: string; x: number; y: number; visible: boolean }[]>([]);

  const byId = $derived(new Map(room.hotspots.map((hotspot) => [hotspot.id, hotspot])));

  onMount(() => {
    if (!canvas) return;
    const view: View = mountRoom(canvas, room);
    const layout = () => {
      view.resize();
      spots = room.hotspots.map((hotspot) => ({ id: hotspot.id, ...view.project(hotspot.anchor) }));
      ready = true;
    };
    const observer = new ResizeObserver(layout);
    observer.observe(canvas);
    layout();
    const onPointerUp = (event: PointerEvent) => {
      if (!showMarkers) return;
      const id = view.pick(event.clientX, event.clientY);
      if (id) onTap(id);
      else onMiss();
    };
    if (showMarkers) canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      observer.disconnect();
      canvas?.removeEventListener('pointerup', onPointerUp);
      view.dispose();
    };
  });
</script>

<div class="room">
  <canvas bind:this={canvas} aria-label={tx(room, 'title')}></canvas>
  <div class="spots">
    {#if ready && showMarkers}
      {#each spots as spot (spot.id)}
        {@const hotspot = byId.get(spot.id)}
        {#if hotspot && spot.visible}
          {@const filled = hotspot.kind === 'decor-slot' && !!decor[hotspot.id]}
          <button
            type="button"
            class="spot"
            class:decor={hotspot.kind === 'decor-slot' && !filled}
            class:hint={hintId === spot.id}
            class:below={spot.y < 96}
            style="left:{spot.x}px;top:{spot.y}px"
            aria-label={tx(hotspot, 'title')}
            aria-pressed={selectedId === spot.id}
            onclick={(event) => {
              event.stopPropagation();
              onTap(spot.id);
            }}
          >
            <span class="mark">{#if hotspot.kind === 'decor-slot' && !filled}<span>+</span>{/if}</span>
            {#if selectedId === spot.id}
              <span class="pill">{filled ? decor[hotspot.id] : tx(hotspot, 'title')}</span>
            {/if}
          </button>
        {/if}
      {/each}
    {/if}
  </div>
</div>
