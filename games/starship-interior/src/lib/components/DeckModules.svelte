<script lang="ts">
	import { T } from '@threlte/core';
	import type { Deck } from '$lib/game/types';
	import { game } from '$lib/game/state.svelte';
	import ModuleMesh from './ModuleMesh.svelte';

	interface Props {
		deck: Deck;
		hideUid?: number | null;
	}
	let { deck, hideUid = null }: Props = $props();
</script>

{#each deck.modules as m (m.uid)}
	{#if m.uid !== hideUid}
		<T.Group position={[m.x, 0, m.z]} rotation.y={(m.angle * Math.PI) / 180} userData={{ uid: m.uid, type: m.type }} name={m.type}>
			<ModuleMesh type={m.type} deckHeight={deck.height} phase={game.phase} />
		</T.Group>
	{/if}
{/each}
