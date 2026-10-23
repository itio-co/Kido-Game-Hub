<script lang="ts">
	/** Faint link lines from a selected group table to its seat objects (current deck, build mode). */
	import { T } from '@threlte/core';
	import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial } from 'three';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { game } from '$lib/game/state.svelte';
	const mat = new LineBasicMaterial({ color: '#5eead4', transparent: true, opacity: 0.7, depthTest: false });
	const sel = $derived(game.selectedUid !== null ? game.deck.modules.find((m) => m.uid === game.selectedUid) : undefined);
	const table = $derived(sel && CATALOG_BY_ID[sel.type]?.group ? sel : sel && CATALOG_BY_ID[sel.type]?.seat ? game.deck.modules.find((t) => CATALOG_BY_ID[t.type]?.group && game.seatsOf(t.uid).some((c) => c.uid === sel.uid)) : undefined);
	const geo = $derived.by(() => {
		const g = new BufferGeometry();
		if (!table) return g;
		const pts: number[] = [];
		for (const c of game.seatsOf(table.uid)) pts.push(table.x, 0.8, table.z, c.x, 0.5, c.z);
		g.setAttribute('position', new Float32BufferAttribute(pts, 3));
		return g;
	});
</script>

{#if table}
	<T.LineSegments geometry={geo} material={mat} renderOrder={10} />
{/if}
