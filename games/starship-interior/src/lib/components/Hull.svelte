<script lang="ts">
	/** Rigid, non-editable hull for one deck: wall segment, floor slab, frames, stringers, windows, LEDs. */
	import { T } from '@threlte/core';
	import { AIRLOCK_ANGLE, AIRLOCK_WIDTH, HULL_INNER_RADIUS, HULL_WALL_THICKNESS, SLAB_THICKNESS } from '$lib/game/specs';
	import { floorTexture, mat } from '$lib/three/materials';
	import { floorGeometry, hullWall, slabGeometry } from '$lib/three/hullGeometry';
	import { MeshStandardMaterial } from 'three';

	interface Props {
		index: number;
		/** clear height of the deck */
		height: number;
		/** visible wall height (cut-away in build mode) */
		visible: number;
		/** full detail (windows, LEDs, light) */
		full: boolean;
		dim?: boolean;
		lights?: boolean;
		/** hatch openings cut through this deck's floor (XY of ladders arriving from below) */
		holes?: [number, number][];
		/** this deck carries the fixed hull airlock */
		airlock?: boolean;
		/** hull radius at the floor and at the top of the visible wall (nose decks taper) */
		rFloor?: number;
		rTop?: number;
		/** habitat section view: the ship shell draws the walls, only the floor is needed */
		floorOnly?: boolean;
	}
	let {
		index,
		height,
		visible,
		full,
		dim = false,
		lights = false,
		holes = [],
		airlock = index === 0,
		rFloor = HULL_INNER_RADIUS,
		rTop = HULL_INNER_RADIUS,
		floorOnly = false
	}: Props = $props();
	const tapered = $derived(rFloor < HULL_INNER_RADIUS - 1e-3 || rTop < HULL_INNER_RADIUS - 1e-3);
	const holeKey = $derived(JSON.stringify(holes));
	const slabGeo = $derived.by(() => slabGeometry(JSON.parse(holeKey), SLAB_THICKNESS, rFloor));
	const floorGeo = $derived.by(() => floorGeometry(JSON.parse(holeKey), rFloor));
	$effect(() => {
		const a = slabGeo;
		const b = floorGeo;
		return () => {
			a.dispose();
			b.dispose();
		};
	});

	const RI = HULL_INNER_RADIUS;
	const floorMat = new MeshStandardMaterial({ map: floorTexture(), metalness: 0.35, roughness: 0.55 });
	const wallMat = $derived(dim ? mat('steelDark') : mat('steel'));
	const wallH = $derived(visible + SLAB_THICKNESS);
	const stringers = Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2);
	const half = AIRLOCK_WIDTH / 2 / RI;
	const inGap = (a: number) => airlock && Math.abs(Math.atan2(Math.sin(a - AIRLOCK_ANGLE), Math.cos(a - AIRLOCK_ANGLE))) < half + 0.05;
	const windows = [-0.35, 0, 0.35]; // world angles around +X
	const frames = $derived([0.06, ...(visible > 1.5 ? [1.2] : []), ...(visible >= height - 0.01 ? [height - 0.12] : [])]);
	const doorH = 2.0;
</script>

{#if !floorOnly}
	{#if tapered}
		<!-- nose-cone deck: tapered wall (ogive approximated as a frustum over the deck height) -->
		<T.Mesh position.y={(visible - SLAB_THICKNESS) / 2} material={wallMat} castShadow receiveShadow>
			<T.CylinderGeometry args={[rTop + HULL_WALL_THICKNESS / 2, rFloor + HULL_WALL_THICKNESS / 2, wallH, 96, 1, true]} />
		</T.Mesh>
	{:else}
		<!-- hull wall (outside the 4.5 m radius), from slab bottom up to the visible height -->
		<T.Mesh position.y={-SLAB_THICKNESS} scale={[1, wallH, 1]} geometry={hullWall(airlock)} material={wallMat} castShadow receiveShadow />
	{/if}
{/if}

<!-- floor slab + panelled floor -->
<T.Mesh position.y={-SLAB_THICKNESS} geometry={slabGeo} material={mat('steelDark')} receiveShadow castShadow />
<T.Mesh position.y={0.002} geometry={floorGeo} material={floorMat} receiveShadow />

{#if !floorOnly && !tapered}
<!-- circumferential frames (inside face, within the 5 cm wall margin) -->
{#each frames as y}
	<T.Mesh position.y={y} rotation.x={Math.PI / 2} material={mat('steelDark')}>
		<T.TorusGeometry args={[RI - 0.02, 0.025, 4, 96]} />
	</T.Mesh>
{/each}

<!-- longitudinal stringers -->
{#each stringers as a}
	{#if !inGap(a)}
		<T.Mesh
			position={[Math.cos(a) * (RI - 0.02), visible / 2, Math.sin(a) * (RI - 0.02)]}
			rotation.y={-a}
			material={mat('steelDark')}
			castShadow
		>
			<T.BoxGeometry args={[0.035, visible, 0.06]} />
		</T.Mesh>
	{/if}
{/each}

{#if full}
	<!-- small round windows on the +X side -->
	{#each windows as a}
		<T.Group position={[Math.cos(a) * (RI - 0.015), 1.45, Math.sin(a) * (RI - 0.015)]} rotation.y={-a - Math.PI / 2}>
			<T.Mesh material={mat('steel')}>
				<T.TorusGeometry args={[0.2, 0.035, 8, 32]} />
			</T.Mesh>
			<T.Mesh material={mat('glass')}>
				<T.CircleGeometry args={[0.2, 32]} />
			</T.Mesh>
		</T.Group>
	{/each}
	<!-- LED light strip along the ceiling -->
	<T.Mesh position.y={height - 0.04} rotation.x={Math.PI / 2} material={mat('led')}>
		<T.TorusGeometry args={[RI - 0.3, 0.02, 4, 96]} />
	</T.Mesh>
{/if}
{/if}
{#if lights}
	<T.PointLight position={[0, height - 0.3, 0]} intensity={14} distance={9} decay={1.6} color="#fff2e2" />
{/if}

{#if airlock && !floorOnly && !tapered}
	<!-- fixed hull airlock in the wall gap -->
	{@const r = RI + HULL_WALL_THICKNESS / 2}
	{@const dh = Math.min(doorH, visible)}
	<T.Group position={[Math.cos(AIRLOCK_ANGLE) * r, 0, Math.sin(AIRLOCK_ANGLE) * r]} rotation.y={-AIRLOCK_ANGLE}>
		<T.Mesh position={[0.02, dh / 2, 0]} material={mat('steelDark')}>
			<T.BoxGeometry args={[0.06, dh, AIRLOCK_WIDTH - 0.2]} />
		</T.Mesh>
		<T.Mesh position={[-0.02, dh / 2, 0]} material={mat('yellow')}>
			<T.BoxGeometry args={[0.02, Math.max(dh - 0.1, 0.05), AIRLOCK_WIDTH - 0.15]} />
		</T.Mesh>
		<T.Mesh position={[-0.035, dh / 2, 0]} material={mat('grey')}>
			<T.BoxGeometry args={[0.02, Math.max(dh - 0.25, 0.05), AIRLOCK_WIDTH - 0.35]} />
		</T.Mesh>
		{#if visible > 1.6}
			<T.Mesh position={[-0.05, 1.5, 0]} rotation.y={-Math.PI / 2} material={mat('glass')}>
				<T.CircleGeometry args={[0.12, 24]} />
			</T.Mesh>
		{/if}
		{#each [-1, 1] as s}
			<T.Mesh position={[0, visible / 2, s * (AIRLOCK_WIDTH / 2 - 0.05)]} material={mat('steel')} castShadow>
				<T.BoxGeometry args={[HULL_WALL_THICKNESS + 0.04, visible, 0.1]} />
			</T.Mesh>
		{/each}
		{#if visible > doorH}
			<T.Mesh position={[0, (doorH + visible) / 2, 0]} material={mat('steel')}>
				<T.BoxGeometry args={[HULL_WALL_THICKNESS, visible - doorH, AIRLOCK_WIDTH]} />
			</T.Mesh>
		{/if}
	</T.Group>
{/if}
