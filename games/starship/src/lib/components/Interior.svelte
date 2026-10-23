<script lang="ts">
	/**
	 * Interior fit-out of one deck for the walk / possessed / cruise views: full-height wall lining
	 * (insulation panels, seams, kick plate, baked AO), handrails, cable trays, vent grilles, portholes
	 * that glow with the outside light, a panelled ceiling (underside of the deck above) with recessed
	 * LED strips and hatch rims, and the deck lights. `near` = full detail (viewer's deck ±1).
	 */
	import { T } from '@threlte/core';
	import { onDestroy } from 'svelte';
	import { HULL_INNER_RADIUS } from '$lib/game/specs';
	import { floorGeometry, OPENING_R } from '$lib/three/hullGeometry';
	import { mat } from '$lib/three/materials';
	import { cableMat, ceilingMat, fitout, inAirlock, ledStrips, ledStripMat, liningGeometry, liningMat, LIGHT_TONE, railMat, trayMat, ventMat, windowMat } from '$lib/three/interior';

	interface Props {
		index: number;
		height: number;
		rFloor?: number;
		/** hull radius at the ceiling (nose decks taper) */
		rTop?: number;
		airlock?: boolean;
		/** hatch openings in the ceiling (ladders standing on this deck) */
		holesAbove?: [number, number][];
		/** flat panelled ceiling (false: top deck – the nose dome closes it) */
		ceiling?: boolean;
		/** full detail (fit-out, windows, lights) */
		near?: boolean;
		/** number of point lights (0 = emissive strips only) */
		lights?: number;
		shadows?: boolean;
		tone?: 'warm' | 'cool';
		/** outside light through the portholes */
		outside?: { key: string; color: string; intensity: number };
	}
	let {
		index,
		height,
		rFloor = HULL_INNER_RADIUS,
		rTop = HULL_INNER_RADIUS,
		airlock = false,
		holesAbove = [],
		ceiling = true,
		near = true,
		lights = 2,
		shadows = false,
		tone = 'warm',
		outside = { key: 'space', color: '#26324a', intensity: 0.6 }
	}: Props = $props();

	const R0 = $derived(rFloor - 0.012),
		R1 = $derived(rTop - 0.012);
	const tapered = $derived(Math.abs(R0 - R1) > 1e-3);
	const lining = $derived(liningGeometry(R0, R1, height, airlock));
	const fit = $derived(near && !tapered ? fitout(R0, height, airlock, index) : null);
	const holeKey = $derived(JSON.stringify(holesAbove));
	const ceil = $derived(ceiling ? floorGeometry(JSON.parse(holeKey), R1) : null);
	const leds = $derived(ceiling && near ? ledStrips(R1, JSON.parse(holeKey)) : null);
	let old: { dispose(): void }[] = [];
	$effect(() => {
		const list = [lining, ceil, leds, fit?.rails, fit?.trays, fit?.cables, fit?.vents].filter(Boolean) as { dispose(): void }[];
		const prev = old;
		old = list;
		for (const g of prev) if (!list.includes(g)) g.dispose();
	});
	onDestroy(() => old.forEach((g) => g.dispose()));
	// portholes on the +X side and opposite, away from the airlock
	const windows = $derived([-0.35, 0, 0.35, Math.PI - 0.2, Math.PI + 0.2].filter((a) => !airlock || !inAirlock(a)));
	const lightPos = $derived(
		lights <= 0 ? [] : lights === 1 ? [[0, 0] as [number, number]] : Array.from({ length: lights }, (_, i) => [Math.cos((i / lights) * Math.PI * 2 + 0.4) * 2.1, Math.sin((i / lights) * Math.PI * 2 + 0.4) * 2.1] as [number, number])
	);
</script>

<T.Group name={`Interior ${index + 1}`}>
	<T.Mesh geometry={lining} material={liningMat()} receiveShadow name="lining" />
	{#if ceil}
		<T.Mesh geometry={ceil} position.y={height - 0.015} material={ceilingMat()} name="ceiling" />
		{#each holesAbove as [hx, hz]}
			<!-- hatch rim in the ceiling + yellow/black edge -->
			<T.Mesh position={[hx, height - 0.02, hz]} rotation.x={Math.PI / 2} material={mat('steelDark')}>
				<T.TorusGeometry args={[OPENING_R + 0.02, 0.03, 6, 40]} />
			</T.Mesh>
			<T.Mesh position={[hx, height - 0.045, hz]} rotation.x={Math.PI / 2} material={mat('yellow')}>
				<T.TorusGeometry args={[OPENING_R + 0.06, 0.012, 4, 40]} />
			</T.Mesh>
		{/each}
	{/if}
	{#if leds}
		<T.Mesh geometry={leds} position.y={height - 0.026} material={ledStripMat(tone)} name="led-strips" />
	{/if}
	{#if fit}
		{#if fit.rails}<T.Mesh geometry={fit.rails} material={railMat()} castShadow={shadows} name="handrails" />{/if}
		{#if fit.trays}<T.Mesh geometry={fit.trays} material={trayMat()} name="cable-trays" />{/if}
		{#if fit.cables}<T.Mesh geometry={fit.cables} material={cableMat()} />{/if}
		{#if fit.vents}<T.Mesh geometry={fit.vents} material={ventMat()} name="vents" />{/if}
	{/if}
	{#if near}
		{#each windows as a}
			{@const r = (R0 + R1) / 2 - 0.02}
			<T.Group position={[Math.cos(a) * r, Math.min(1.45, height - 0.6), Math.sin(a) * r]} rotation.y={-a - Math.PI / 2} name="porthole">
				<T.Mesh material={mat('steel')}>
					<T.TorusGeometry args={[0.2, 0.04, 8, 32]} />
				</T.Mesh>
				<T.Mesh material={windowMat(outside.key, outside.color, outside.intensity)} position.z={-0.005}>
					<T.CircleGeometry args={[0.2, 32]} />
				</T.Mesh>
				<T.Mesh material={mat('glass')} position.z={0.01}>
					<T.CircleGeometry args={[0.2, 32]} />
				</T.Mesh>
			</T.Group>
		{/each}
		{#each lightPos as [lx, lz], i}
			<T.PointLight position={[lx, height - 0.35, lz]} intensity={lights <= 1 ? 7 : 4.2} distance={6.5} decay={1.4} color={LIGHT_TONE[tone]} castShadow={shadows && i === 0} shadow.mapSize={[512, 512]} shadow.bias={-0.004} shadow.normalBias={0.03} />
		{/each}
	{/if}
</T.Group>
