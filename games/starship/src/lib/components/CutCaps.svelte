<script lang="ts">
	/** Solid caps + highlighted edges on every section cut face (exempt from local clipping). */
	import { T } from '@threlte/core';
	import { BufferGeometry, DoubleSide, LineBasicMaterial, MeshStandardMaterial, ShapeGeometry, Vector3 } from 'three';
	import { game } from '$lib/game/state.svelte';
	import { cabinProfiles, habitatProfiles, toShape, type CapKind } from '$lib/three/capProfiles';

	interface Props {
		faces: number[];
	}
	let { faces }: Props = $props();

	const mk = (color: string, emissive = '#000000', ei = 0) => {
		const m = new MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, side: DoubleSide, metalness: 0.1, roughness: 0.8 });
		m.userData.noLocalClip = true;
		m.polygonOffset = true;
		m.polygonOffsetFactor = -1;
		return m;
	};
	const soilColor = $derived(game.hab.location === 'mars' ? '#8a4b2e' : '#77746e');
	const mats = $derived<Record<CapKind, MeshStandardMaterial>>({
		steel: mk('#e2502f', '#ff3b1a', 0.35),
		dome: mk('#f08a2a', '#ff7a00', 0.35),
		slab: mk('#b8a27a', '#5a4a20', 0.25),
		soil: mk(soilColor),
		backfill: mk(game.hab.location === 'mars' ? '#a5603c' : '#8f8b84')
	});
	const edgeMat = new LineBasicMaterial({ color: '#ffd23a' });
	edgeMat.userData.noLocalClip = true;

	const profiles = $derived(
		game.shipMode === 'habitat'
			? habitatProfiles(game.ship, game.hab, game.floorY, game.floorRadius)
			: cabinProfiles(game.floorY, game.decks.map((d) => d.height), game.stackTop)
	);
	const geos = $derived(
		profiles.map((p) => ({
			kind: p.kind,
			fill: new ShapeGeometry(toShape(p.pts)),
			edge: new BufferGeometry().setFromPoints([...p.pts, p.pts[0]].map((v) => new Vector3(v.x, v.y, 0)))
		}))
	);
	$effect(() => {
		const g = geos;
		return () => g.forEach((x) => (x.fill.dispose(), x.edge.dispose()));
	});
</script>

{#each faces as a}
	<T.Group rotation.y={a - Math.PI / 2}>
		{#each geos as g}
			<T.Mesh geometry={g.fill} material={mats[g.kind]} />
			{#if g.kind !== 'soil'}
				<T.Line geometry={g.edge} material={edgeMat} />
			{/if}
		{/each}
	</T.Group>
{/each}
