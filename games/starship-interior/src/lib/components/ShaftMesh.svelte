<script lang="ts">
	/**
	 * One ladder connection (deck `from` → deck `from+1`), in world space:
	 * a single straight ladder from the lower deck floor through the slab opening to 1.0 m above the
	 * upper floor, a hatch collar + guard rail (gap at the front, local +Z) on the upper deck, and a
	 * climbing-zone ring on the lower deck.
	 */
	import { T } from '@threlte/core';
	import { LADDER_EXTENSION } from '$lib/game/catalog';
	import { game } from '$lib/game/state.svelte';
	import Part from './Part.svelte';
	import { SLAB_THICKNESS } from '$lib/game/specs';
	import { BackSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
	// shared: dark recess wall + shadowed void under the opening + yellow/black coaming stripes
	const recessMat = new MeshStandardMaterial({ color: '#1a1d22', metalness: 0.3, roughness: 0.8, side: BackSide });
	const voidMat = new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.6, depthWrite: false });
	const stripeMat = new MeshStandardMaterial({ color: '#111111', roughness: 0.6 });

	interface Props {
		x: number;
		z: number;
		angle: number;
		from: number;
		ghost?: string | null;
		/** clip everything above this world Y (build mode with upper decks hidden) */
		maxY?: number;
	}
	let { x, z, angle, from, ghost = null, maxY = Infinity }: Props = $props();
	const PI = Math.PI;
	const y0 = $derived(game.floorY[from] ?? 0);
	const yTop = $derived(game.floorY[from + 1] ?? y0 + 2.65);
	const y1 = $derived(Math.min(yTop + LADDER_EXTENSION, maxY));
	const len = $derived(Math.max(0.05, y1 - y0));
	const rungs = $derived.by(() => {
		const r: number[] = [];
		for (let y = 0.3; y < len - 0.05; y += 0.3) r.push(y);
		return r;
	});
	const showUpper = $derived(yTop <= maxY + 1e-6);
	// ceiling opening collar seen from the lower deck (underside of the upper slab)
	const showCeiling = $derived(yTop - SLAB_THICKNESS <= maxY + 1e-6);
	const stripes = Array.from({ length: 12 }, (_, k) => (k * PI) / 6);
	// guard-rail posts around the opening, leaving a 100° gap at the front (+Z)
	const posts = Array.from({ length: 8 }, (_, k) => ((50 + (k * 260) / 7) * PI) / 180);
	const RR = 0.5;
</script>

<T.Group position={[x, 0, z]} rotation.y={(angle * PI) / 180}>
	<!-- lower deck: climbing zone ring -->
	<T.Group position.y={y0}>
		<Part shape="torus" args={[0.5, 0.015, 4, 40]} position={[0, 0.01, 0]} rotation={[PI / 2, 0, 0]} m="yellow" {ghost} />
	</T.Group>
	<!-- continuous ladder -->
	<T.Group position.y={y0}>
		{#each [-0.2, 0.2] as lx}
			<Part shape="cyl" args={[0.022, 0.022, len, 8]} position={[lx, len / 2, -0.33]} m="steel" {ghost} />
		{/each}
		{#each rungs as ry}
			<Part shape="cyl" args={[0.016, 0.016, 0.4, 8]} position={[0, ry, -0.33]} rotation={[0, 0, PI / 2]} m="steelDark" {ghost} />
		{/each}
	</T.Group>
	<!-- lower deck: ceiling opening collar (underside of the upper slab) -->
	{#if showCeiling && !ghost}
		<T.Group position.y={yTop - SLAB_THICKNESS}>
			<Part shape="torus" args={[0.43, 0.035, 6, 40]} position={[0, -0.02, 0]} rotation={[PI / 2, 0, 0]} m="yellow" />
		</T.Group>
	{/if}
	<!-- upper deck: recess through the slab, coaming, open lid, guard rail -->
	{#if showUpper}
		<T.Group position.y={yTop}>
			{#if !ghost}
				<!-- dark recess: the slab's inner wall plus a shadowed void, so it reads as a real hole -->
				<T.Mesh position.y={-SLAB_THICKNESS / 2} material={recessMat}>
					<T.CylinderGeometry args={[0.4, 0.4, SLAB_THICKNESS, 40, 1, true]} />
				</T.Mesh>
				<T.Mesh position.y={-SLAB_THICKNESS + 0.01} rotation.x={-PI / 2} material={voidMat} renderOrder={2}>
					<T.CircleGeometry args={[0.4, 40]} />
				</T.Mesh>
				<!-- black stripes on the yellow coaming -->
				{#each stripes as a}
					<T.Mesh position={[Math.sin(a) * 0.43, 0.045, Math.cos(a) * 0.43]} rotation.y={a + PI / 4} material={stripeMat}>
						<T.BoxGeometry args={[0.05, 0.035, 0.075]} />
					</T.Mesh>
				{/each}
			{/if}
			<Part shape="torus" args={[0.43, 0.035, 6, 40]} position={[0, 0.03, 0]} rotation={[PI / 2, 0, 0]} m="yellow" {ghost} />
			<!-- hatch lid, open: hinged on the +X side of the coaming, standing up -->
			<T.Group position={[0.44, 0.06, 0]} rotation.z={PI / 2 - 0.15}>
				<Part shape="cyl" args={[0.4, 0.4, 0.04, 32]} position={[0.4, 0.02, 0]} m="grey" {ghost} />
				<Part shape="torus" args={[0.12, 0.012, 6, 16]} position={[0.4, 0.06, 0]} rotation={[PI / 2, 0, 0]} m="steel" {ghost} />
			</T.Group>
			<Part shape="torus" args={[0.47, 0.02, 6, 40]} position={[0, 0.02, 0]} rotation={[PI / 2, 0, 0]} m="steel" {ghost} />
			{#if Math.min(maxY, Infinity) >= yTop + 1.0}
				{#each posts as a}
					<Part shape="cyl" args={[0.018, 0.018, 1.0, 8]} position={[Math.sin(a) * RR, 0.5, Math.cos(a) * RR]} m="steel" {ghost} />
				{/each}
				{#each posts.slice(0, -1) as a, k}
					{@const b = posts[k + 1]}
					{@const mx = ((Math.sin(a) + Math.sin(b)) / 2) * RR}
					{@const mz = ((Math.cos(a) + Math.cos(b)) / 2) * RR}
					{#each [0.5, 1.0] as ry}
						<Part
							shape="cyl"
							args={[0.016, 0.016, 2 * RR * Math.sin((b - a) / 2), 6]}
							position={[mx, ry, mz]}
							rotation={[0, (a + b) / 2, PI / 2]}
							m="steel"
							{ghost}
						/>
					{/each}
				{/each}
			{/if}
		</T.Group>
	{/if}
</T.Group>
