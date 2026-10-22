<script lang="ts">
  import { onMount } from 'svelte';
  import type { PlayerRoom } from '../lib/types';
  import { mountRoom, type RoomView as View } from '../lib/scene';

  let {
    room,
    selectedId,
    hintId,
    decor,
    onTap,
    onMiss,
  }: {
    room: PlayerRoom;
    selectedId: string | null;
    hintId: string | null;
    decor: Record<string, string | null>;
    onTap: (id: string) => void;
    onMiss: () => void;
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
      const id = view.pick(event.clientX, event.clientY);
      if (id) onTap(id);
      else onMiss();
    };
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      observer.disconnect();
      canvas?.removeEventListener('pointerup', onPointerUp);
      view.dispose();
    };
  });
</script>

<div class="room">
  <canvas bind:this={canvas} aria-label={room.name}></canvas>
  <div class="spots">
    {#if ready}
      {#each spots as spot (spot.id)}
        {@const hotspot = byId.get(spot.id)}
        {#if hotspot && spot.visible}
          {@const filled = hotspot.action === 'decor' && hotspot.slotId && decor[hotspot.slotId]}
          <button
            type="button"
            class="spot"
            class:decor={hotspot.action === 'decor' && !filled}
            class:hint={hintId === spot.id}
            class:below={spot.y < 96}
            style="left:{spot.x}px;top:{spot.y}px"
            aria-label={hotspot.label}
            aria-pressed={selectedId === spot.id}
            onclick={(event) => {
              event.stopPropagation();
              onTap(spot.id);
            }}
          >
            <span class="mark">{#if hotspot.action === 'decor' && !filled}<span>+</span>{/if}</span>
            {#if selectedId === spot.id}
              <span class="pill">{hotspot.label}</span>
            {/if}
          </button>
        {/if}
      {/each}
    {/if}
  </div>
</div>
