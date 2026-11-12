<script lang="ts">
  /** Loads the rhythm chunk through the host so this pack can stay on an older published file. */
  import type { Component } from 'svelte';
  import { stirfryPack } from './pack';
  import type { RhythmPack } from '../rhythm';

  let { onExit }: { onExit: () => void } = $props();
  let RhythmGame = $state<Component<{ pack: RhythmPack; onExit: () => void }> | null>(null);

  $effect(() => {
    let stop = false;
    const load = globalThis.__NES_LOAD_PILOT__;
    if (!load) return;
    load('rhythm').then((mod) => {
      if (!stop) RhythmGame = mod.RhythmGame as Component<{ pack: RhythmPack; onExit: () => void }>;
    }).catch(() => {
      if (!stop) RhythmGame = null;
    });
    return () => { stop = true; };
  });
</script>

{#if RhythmGame}
  <RhythmGame pack={stirfryPack} {onExit} />
{/if}
