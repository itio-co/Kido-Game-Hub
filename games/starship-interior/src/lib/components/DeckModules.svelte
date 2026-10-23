<script lang="ts">
	import { T } from '@threlte/core';
	import type { Deck } from '$lib/game/types';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { dimsOf } from '$lib/game/geometry';
	import { HULL_INNER_RADIUS } from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';
	import { mat } from '$lib/three/materials';
	import ModuleMesh from './ModuleMesh.svelte';

	interface Props {
		deck: Deck;
		hideUid?: number | null;
	}
	let { deck, hideUid = null }: Props = $props();
	const k = $derived(game.decks.indexOf(deck));
	/**
	 * Wall mounts: a flat-backed item touches the curved hull only at its back corners, leaving a gap
	 * (sagitta) at the middle that read as "floating". A backplate + two rail brackets bridge it to the hull.
	 */
	function mountGap(m: Deck['modules'][number]) {
		const def = CATALOG_BY_ID[m.type];
		if (!def) return null;
		const dm = dimsOf(def, game.phase);
		const R = game.deckRadius[k] ?? HULL_INNER_RADIUS;
		const gap = Math.max(0.004, R - (Math.hypot(m.x, m.z) + dm.d / 2));
		if (gap > 0.25) return null;
		return { w: dm.w, d: dm.d, h: dm.height, gap };
	}
</script>

{#each deck.modules as m (m.uid)}
	{#if m.uid !== hideUid}
		<T.Group position={[m.x, m.y ?? 0, m.z]} rotation.y={(m.angle * Math.PI) / 180} userData={{ uid: m.uid, type: m.type }} name={m.type}>
			<ModuleMesh type={m.type} deckHeight={deck.height} phase={game.phase} mount={m.mount} doorKey="{k}:{m.uid}" />
			{#if m.mount === 'wall'}
				{@const g = mountGap(m)}
				{#if g && g.h > 0.06}
					<T.Mesh position={[0, g.h / 2, -g.d / 2 - g.gap / 2 - 0.004]} material={mat('steelDark')} name="wall-backplate">
						<T.BoxGeometry args={[g.w * 0.86, Math.max(0.04, g.h * 0.8), g.gap + 0.012]} />
					</T.Mesh>
					{#each [Math.min(0.06, g.h * 0.2), Math.max(g.h - 0.06, g.h * 0.8)] as y}
						<T.Mesh position={[0, y, -g.d / 2 - g.gap / 2 - 0.006]} material={mat('steel')} name="wall-rail">
							<T.BoxGeometry args={[g.w * 0.96, 0.035, g.gap + 0.02]} />
						</T.Mesh>
					{/each}
				{/if}
			{/if}
		</T.Group>
	{/if}
{/each}
