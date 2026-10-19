<script lang="ts">
	/**
	 * True-to-scale procedural equipment. Local space: footprint centred on origin,
	 * def.w along X, def.d along Z, floor at y = 0, FRONT (access side) = +Z.
	 */
	import { T } from '@threlte/core';
	import type { ModuleId, Phase } from '$lib/game/types';
	import { couchParts, couchRowParts } from '$lib/game/couchModel';
	import Part from './Part.svelte';
	import PartsModel from './PartsModel.svelte';
	import EquipModel from './EquipModel.svelte';
	import Self from './ModuleMesh.svelte';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { DOORS } from '$lib/game/doors';
	import DoorLeaf from './DoorLeaf.svelte';

	interface Props {
		type: ModuleId;
		ghost?: string | null;
		/** deck clear height, for floor-to-ceiling items */
		deckHeight?: number;
		/** mission phase: couches deploy and stowables stow in 'launch' */
		phase?: Phase;
		/** wall / ceiling mount (handrails orient their standoffs to the mounting surface) */
		mount?: 'wall' | 'ceiling';
		/** placed item key "deck:uid": door leaves follow the live door state (null = closed / rest) */
		doorKey?: string | null;
	}
	let { type, ghost = null, deckHeight = 2.4, phase = 'surface', mount, doorKey = null }: Props = $props();
	const door = $derived(DOORS[type]);
	const launch = $derived(phase === 'launch');
	const customDef = $derived(type.startsWith('custom:') ? CATALOG_BY_ID[type] : null);
	const couch = $derived(
		type === 'couch' ? couchParts(0) : type === 'pilotcouch' ? couchParts(0, true, 0.9) : type === 'couchrow3' ? couchRowParts(3) : type === 'couchrow4' ? couchRowParts(4) : null
	);
	const H = $derived(deckHeight);
	const rungs = $derived(Array.from({ length: Math.max(1, Math.floor((H - 0.2) / 0.3)) }, (_, k) => 0.3 + k * 0.3));
	const PI = Math.PI;
</script>

<T.Group>
	{#if customDef?.parts}
		<EquipModel parts={customDef.parts} stowed={phase === (customDef.stowPhase ?? 'launch')} {ghost} {doorKey} />
	{:else if couch}
		<PartsModel parts={couch} stowed={!launch} {ghost} />
	{:else if type === 'table' && launch}
		<!-- stowed for launch/landing: top folded vertical against its rail, benches folded -->
		<Part args={[1.2, 0.8, 0.04]} position={[0, 0.5, -0.17]} m="white" {ghost} />
		<Part args={[1.22, 0.06, 0.08]} position={[0, 0.93, -0.2]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.05, 0.05, 0.9, 12]} position={[0, 0.06, -0.08]} rotation={[0, 0, Math.PI / 2]} m="steel" {ghost} />
		{#each [0, 1] as k}
			<Part args={[1.1, 0.5, 0.08]} position={[0, 0.3, 0.0 + k * 0.1]} m="fabric" {ghost} />
		{/each}
		<Part args={[1.2, 0.02, 0.5]} position={[0, 0.01, 0]} m="steelDark" {ghost} />
		<Part args={[1.0, 0.03, 0.03]} position={[0, 0.58, 0.19]} m="yellow" {ghost} />
	{:else if type === 'treadmill' && launch}
		<!-- stowed for launch/landing: rails and console folded flat, belt locked -->
		<Part args={[2.0, 0.08, 0.9]} position={[0, 0.04, 0]} m="white" {ghost} />
		<Part args={[1.8, 0.16, 0.72]} position={[0.05, 0.16, 0]} m="dark" {ghost} />
		<Part args={[1.6, 0.02, 0.52]} position={[0.1, 0.25, 0]} m="rubber" {ghost} />
		{#each [-1, 1] as s}
			<Part shape="cyl" args={[0.025, 0.025, 1.0, 8]} position={[-0.35, 0.3, s * 0.36]} rotation={[0, 0, Math.PI / 2]} m="steel" {ghost} />
			<Part args={[0.9, 0.03, 0.03]} position={[0.1, 0.34, s * 0.36]} m="steel" {ghost} />
		{/each}
		<Part args={[0.3, 0.06, 0.55]} position={[-0.75, 0.38, 0]} m="dark" {ghost} />
		<Part args={[1.7, 0.02, 0.04]} position={[0, 0.43, 0]} m="yellow" {ghost} />
	{:else if type === 'bunk'}
		<Part args={[2.0, 0.4, 0.9]} position={[0, 0.2, 0]} m="white" {ghost} />
		<Part args={[1.96, 0.06, 0.86]} position={[0, 0.03, 0.0]} m="dark" {ghost} />
		<Part args={[1.9, 0.16, 0.8]} position={[0, 0.48, 0]} m="mattress" {ghost} />
		<Part args={[0.42, 0.1, 0.34]} position={[-0.68, 0.61, -0.12]} m="mattress" {ghost} />
		<Part args={[1.15, 0.04, 0.82]} position={[0.35, 0.58, 0]} m="fabric" {ghost} />
		<Part args={[2.0, 0.8, 0.04]} position={[0, 0.8, -0.43]} m="white" {ghost} />
		<Part args={[0.04, 0.8, 0.9]} position={[-0.98, 0.8, 0]} m="white" {ghost} />
		<Part args={[0.04, 0.8, 0.9]} position={[0.98, 0.8, 0]} m="white" {ghost} />
		<Part args={[2.0, 0.04, 0.9]} position={[0, 1.18, 0]} m="white" {ghost} />
		<Part args={[1.9, 0.02, 0.02]} position={[0, 1.13, 0.43]} m="steel" {ghost} />
		<DoorLeaf leaf={door!.leaves[0]} {doorKey} restOpen>
			<!-- privacy curtain: closed spans the opening, open bunches at the right end -->
			<Part args={[1.9, 0.72, 0.02]} position={[0, 0.8, 0.43]} m="fabric" {ghost} />
		</DoorLeaf>
		<Part args={[0.3, 0.02, 0.05]} position={[-0.6, 1.15, -0.3]} m="led" {ghost} />
		<Part args={[0.16, 0.1, 0.01]} position={[-0.75, 0.9, -0.405]} m="screen" {ghost} />
	{:else if type === 'crewpod' || type === 'hygiene'}
		{@const hyg = type === 'hygiene'}
		<!-- hollow compartment: back / side walls, roof, floor, door frame; the door leaf swings out -->
		<Part args={[1.0, 2.1, 0.04]} position={[0, 1.05, -0.48]} m="white" {ghost} />
		{#each [-1, 1] as s}
			<Part args={[0.04, 2.1, 0.92]} position={[s * 0.48, 1.05, -0.02]} m="white" {ghost} />
			<Part args={[0.11, 2.1, 0.06]} position={[s * 0.445, 1.05, 0.45]} m="white" {ghost} />
			<Part args={[0.03, 1.9, 0.04]} position={[s * 0.385, 0.95, 0.45]} m="steelDark" {ghost} />
		{/each}
		<Part args={[1.0, 0.04, 0.96]} position={[0, 2.08, 0]} m="white" {ghost} />
		<Part args={[0.78, 0.2, 0.06]} position={[0, 2.0, 0.45]} m="white" {ghost} />
		<Part args={[0.5, 0.12, 0.02]} position={[0, 1.98, 0.485]} m="dark" {ghost} />
		<Part args={[0.92, 0.03, 0.92]} position={[0, 0.015, -0.02]} m="steelDark" {ghost} />
		<Part args={[1.0, 0.08, 0.06]} position={[0, 0.04, 0.47]} m="dark" {ghost} />
		<Part args={[0.6, 0.02, 0.04]} position={[0, 2.05, -0.1]} m="led" {ghost} />
		<!-- occupancy light: green free, amber occupied -->
		<Part args={[0.03, 0.03, 0.01]} position={[0.44, 1.4, 0.485]} m={hyg ? 'amber' : 'green'} {ghost} />
		{#if hyg}
			<!-- toilet + basin + mirror inside -->
			<Part shape="cyl" args={[0.17, 0.19, 0.4, 18]} position={[0, 0.2, -0.28]} m="grey" {ghost} />
			<Part shape="torus" args={[0.14, 0.03, 8, 18]} position={[0, 0.41, -0.28]} rotation={[PI / 2, 0, 0]} m="dark" {ghost} />
			<Part args={[0.36, 0.4, 0.12]} position={[0, 0.6, -0.42]} m="white" {ghost} />
			<Part args={[0.1, 0.12, 0.36]} position={[0.4, 0.9, -0.15]} m="white" {ghost} />
			<Part args={[0.01, 0.36, 0.3]} position={[0.455, 1.35, -0.15]} m="glass" {ghost} />
			<Part shape="cyl" args={[0.06, 0.06, 0.3, 10]} position={[-0.3, 1.9, -0.3]} m="steel" {ghost} />
		{:else}
			<!-- vertical sleeping bag on the back wall, wall screen, stowage -->
			<Part shape="capsule" args={[0.16, 1.3, 4, 12]} position={[0, 1.1, -0.3]} m="mattress" {ghost} />
			<Part args={[0.01, 0.22, 0.32]} position={[-0.455, 1.45, -0.1]} m="screen" {ghost} />
			<Part args={[0.12, 0.5, 0.5]} position={[0.4, 1.6, -0.15]} m="grey" {ghost} />
		{/if}
		<DoorLeaf leaf={door!.leaves[0]} {doorKey}>
			<Part args={[0.74, 1.86, 0.03]} position={[0, 0.95, 0.465]} m={hyg ? 'grey' : 'white'} {ghost} />
			<Part args={[0.03, 0.2, 0.04]} position={[0.3, 1.05, 0.49]} m="steel" {ghost} />
			{#if hyg}
				<Part args={[0.4, 0.5, 0.01]} position={[0, 1.45, 0.483]} m="glass" {ghost} />
			{:else}
				<Part args={[0.2, 0.12, 0.01]} position={[0, 1.6, 0.483]} m="screen" {ghost} />
			{/if}
		</DoorLeaf>
	{:else if type === 'galley'}
		<Part args={[1.8, 0.8, 0.6]} position={[0, 0.5, -0.025]} m="white" {ghost} />
		<Part args={[1.8, 0.1, 0.5]} position={[0, 0.05, -0.07]} m="dark" {ghost} />
		<Part args={[1.8, 0.04, 0.65]} position={[0, 0.92, 0]} m="steel" {ghost} />
		{#each [-0.675, -0.225, 0.225, 0.675] as x}
			<Part args={[0.43, 0.7, 0.01]} position={[x, 0.5, 0.28]} m="grey" {ghost} />
			<Part args={[0.2, 0.02, 0.03]} position={[x, 0.8, 0.295]} m="steel" {ghost} />
		{/each}
		<Part args={[0.45, 0.02, 0.34]} position={[0.45, 0.945, 0]} m="dark" {ghost} />
		<Part shape="cyl" args={[0.015, 0.015, 0.3, 8]} position={[0.45, 1.09, -0.2]} m="steel" {ghost} />
		<Part args={[0.5, 0.36, 0.42]} position={[-0.5, 1.12, -0.08]} m="steelDark" {ghost} />
		<Part args={[0.36, 0.22, 0.01]} position={[-0.52, 1.12, 0.135]} m="glass" {ghost} />
		<Part args={[1.8, 0.56, 0.03]} position={[0, 1.22, -0.31]} m="white" {ghost} />
		<Part args={[1.8, 0.5, 0.35]} position={[0, 1.75, -0.15]} m="white" {ghost} />
		{#each [-0.45, 0.45] as x}
			<Part args={[0.88, 0.46, 0.01]} position={[x, 1.75, 0.027]} m="grey" {ghost} />
		{/each}
		<Part args={[1.7, 0.015, 0.04]} position={[0, 1.495, -0.02]} m="led" {ghost} />
	{:else if type === 'table'}
		<Part args={[1.2, 0.04, 0.8]} position={[0, 0.74, 0]} m="white" {ghost} />
		<Part args={[1.22, 0.02, 0.82]} position={[0, 0.715, 0]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.05, 0.05, 0.7, 12]} position={[0, 0.36, 0]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.3, 0.3, 0.02, 16]} position={[0, 0.01, 0]} m="steelDark" {ghost} />
		{#each [-1, 1] as s}
			<Part args={[1.0, 0.4, 0.32]} position={[0, 0.2, s * 0.64]} m="grey" {ghost} />
			<Part args={[1.1, 0.06, 0.4]} position={[0, 0.43, s * 0.65]} m="fabric" {ghost} />
			<Part args={[1.1, 0.5, 0.06]} position={[0, 0.7, s * 0.87]} m="fabric" {ghost} />
		{/each}
	{:else if type === 'workstation2'}
		{#each [-1, 1] as s}
			<T.Group position={[s * 0.6, 0, 0]} scale={[0.857, 1, 1]}><Self type="workstation" {ghost} {deckHeight} {phase} /></T.Group>
		{/each}
	{:else if type === 'workstation'}
		<Part args={[1.4, 0.035, 0.6]} position={[0, 0.74, -0.15]} m="white" {ghost} />
		<Part args={[0.03, 0.72, 0.58]} position={[-0.68, 0.36, -0.15]} m="grey" {ghost} />
		<Part args={[0.03, 0.72, 0.58]} position={[0.68, 0.36, -0.15]} m="grey" {ghost} />
		<Part args={[1.34, 0.3, 0.02]} position={[0, 0.55, -0.43]} m="grey" {ghost} />
		{#each [-1, 1] as s}
			<T.Group position={[s * 0.33, 0, -0.33]} rotation={[0, -s * 0.18, 0]}>
				<Part args={[0.62, 0.38, 0.03]} position={[0, 1.12, 0]} m="dark" {ghost} />
				<Part args={[0.58, 0.34, 0.005]} position={[0, 1.12, 0.017]} m="screen" {ghost} />
				<Part args={[0.05, 0.3, 0.03]} position={[0, 0.9, -0.03]} m="steelDark" {ghost} />
			</T.Group>
		{/each}
		<Part args={[0.45, 0.02, 0.15]} position={[0, 0.767, -0.02]} m="dark" {ghost} />
		<!-- chair -->
		<Part shape="cyl" args={[0.24, 0.24, 0.07, 16]} position={[0, 0.47, 0.22]} m="fabric" {ghost} />
		<Part args={[0.42, 0.45, 0.05]} position={[0, 0.8, 0.43]} m="fabric" {ghost} />
		<Part shape="cyl" args={[0.025, 0.025, 0.38, 8]} position={[0, 0.25, 0.22]} m="steel" {ghost} />
		{#each [0, 1, 2, 3, 4] as k}
			<Part
				args={[0.03, 0.03, 0.22]}
				position={[Math.sin((k * 2 * PI) / 5) * 0.11, 0.04, 0.22 + Math.cos((k * 2 * PI) / 5) * 0.11]}
				rotation={[0, (k * 2 * PI) / 5, 0]}
				m="dark"
				{ghost}
			/>
		{/each}
	{:else if type === 'locker'}
		<Part args={[0.6, 2.0, 0.04]} position={[0, 1.0, -0.28]} m="white" {ghost} />
		{#each [-1, 1] as s}<Part args={[0.02, 2.0, 0.58]} position={[s * 0.29, 1.0, -0.01]} m="white" {ghost} />{/each}
		<Part args={[0.6, 0.06, 0.58]} position={[0, 1.97, -0.01]} m="white" {ghost} />
		<Part args={[0.6, 0.08, 0.58]} position={[0, 0.04, -0.01]} m="white" {ghost} />
		<!-- shelves + stowage behind the doors -->
		{#each [0.45, 0.95, 1.45] as y}<Part args={[0.54, 0.02, 0.5]} position={[0, y, 0]} m="steelDark" {ghost} />{/each}
		<Part args={[0.4, 0.3, 0.35]} position={[0, 1.12, -0.05]} m="fabric" {ghost} />
		{#each [-1, 1] as s, i}
			<DoorLeaf leaf={door!.leaves[i]} {doorKey}>
				<Part args={[0.285, 1.88, 0.02]} position={[s * 0.147, 1.0, 0.29]} m="grey" {ghost} />
				<Part args={[0.02, 0.22, 0.03]} position={[s * 0.03, 1.1, 0.305]} m="steel" {ghost} />
			</DoorLeaf>
		{/each}
		<Part args={[0.4, 0.06, 0.01]} position={[0, 1.8, 0.302]} m="dark" {ghost} />
	{:else if type === 'hydroponics'}
		<Part args={[1.2, 2.0, 0.03]} position={[0, 1.0, -0.285]} m="white" {ghost} />
		{#each [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]] as p}
			<Part args={[0.04, 2.0, 0.04]} position={[p[0], 1.0, p[1]]} m="steel" {ghost} />
		{/each}
		{#each [0.12, 0.6, 1.08, 1.56] as y}
			<Part args={[1.14, 0.06, 0.54]} position={[0, y, 0]} m="white" {ghost} />
			{#each [-0.4, -0.13, 0.14, 0.41] as x, k}
				<Part shape="sphere" args={[0.1 + (k % 2) * 0.03, 7, 5]} position={[x, y + 0.13, (k % 2) * 0.08 - 0.04]} m="plant" {ghost} />
			{/each}
			<Part args={[1.05, 0.02, 0.05]} position={[0, y + 0.42, 0]} m="grow" {ghost} />
		{/each}
		<Part args={[1.2, 0.04, 0.6]} position={[0, 1.98, 0]} m="grey" {ghost} />
	{:else if type === 'treadmill'}
		<Part args={[2.0, 0.08, 0.9]} position={[0, 0.04, 0]} m="white" {ghost} />
		<Part args={[1.8, 0.16, 0.72]} position={[0.05, 0.16, 0]} m="dark" {ghost} />
		<Part args={[1.6, 0.02, 0.52]} position={[0.1, 0.25, 0]} m="rubber" {ghost} />
		{#each [-1, 1] as s}
			<Part args={[1.7, 0.03, 0.08]} position={[0.05, 0.255, s * 0.31]} m="grey" {ghost} />
			<Part shape="cyl" args={[0.025, 0.025, 1.0, 8]} position={[-0.85, 0.75, s * 0.36]} m="steel" {ghost} />
			<Part args={[0.9, 0.03, 0.03]} position={[-0.4, 1.0, s * 0.36]} m="steel" {ghost} />
			<Part shape="cyl" args={[0.02, 0.02, 1.1, 8]} position={[0.75, 0.7, s * 0.42]} m="steelDark" {ghost} />
		{/each}
		<Part args={[0.1, 0.3, 0.55]} position={[-0.88, 1.25, 0]} rotation={[0, 0, -0.35]} m="dark" {ghost} />
		<Part args={[0.01, 0.24, 0.45]} position={[-0.82, 1.27, 0]} rotation={[0, 0, -0.35]} m="screen" {ghost} />
	{:else if type === 'eclss'}
		<Part args={[1.05, 2.0, 0.84]} position={[0, 1.0, -0.03]} m="grey" {ghost} />
		{#each [0.3, 0.75, 1.2, 1.65] as y, k}
			<Part args={[0.98, 0.42, 0.02]} position={[0, y, 0.4]} m={k === 1 ? 'dark' : 'white'} {ghost} />
			<Part args={[0.04, 0.04, 0.01]} position={[0.4, y + 0.15, 0.412]} m={k === 2 ? 'amber' : 'green'} {ghost} />
			<Part args={[0.12, 0.02, 0.03]} position={[-0.38, y, 0.42]} m="steel" {ghost} />
		{/each}
		{#each [-0.2, 0, 0.2] as x}
			<Part args={[0.12, 0.25, 0.005]} position={[x, 0.75, 0.413]} m="rubber" {ghost} />
		{/each}
		<Part args={[0.3, 0.18, 0.005]} position={[0.1, 1.2, 0.413]} m="screen" {ghost} />
		{#each [-0.45, -0.38] as x}
			<Part shape="cyl" args={[0.025, 0.025, 2.0, 8]} position={[x, 1.0, -0.42]} m="steel" {ghost} />
		{/each}
	{:else if type === 'partition'}
		<Part args={[1.5, H - 0.1, 0.06]} position={[0, H / 2, 0]} m="white" {ghost} />
		<Part args={[1.5, 0.05, 0.08]} position={[0, 0.025, 0]} m="steelDark" {ghost} />
		<Part args={[1.5, 0.05, 0.08]} position={[0, H - 0.025, 0]} m="steelDark" {ghost} />
		<Part args={[0.04, H, 0.08]} position={[-0.73, H / 2, 0]} m="steelDark" {ghost} />
		<Part args={[0.04, H, 0.08]} position={[0.73, H / 2, 0]} m="steelDark" {ghost} />
	{:else if type === 'handrail'}
		<!-- 0.8 m handrail: bar + two standoffs into the mounting surface (wall: −Z, floor: −Y, ceiling: +Y) -->
		{#if mount === 'wall'}
			<Part shape="cyl" args={[0.017, 0.017, 0.8, 10]} position={[0, 0.05, 0.03]} rotation={[0, 0, PI / 2]} m="yellow" {ghost} />
			{#each [-0.32, 0.32] as x}
				<Part args={[0.04, 0.04, 0.08]} position={[x, 0.05, -0.01]} m="steel" {ghost} />
				<Part args={[0.08, 0.08, 0.01]} position={[x, 0.05, -0.045]} m="steelDark" {ghost} />
			{/each}
		{:else}
			{@const up = mount === 'ceiling'}
			<Part shape="cyl" args={[0.017, 0.017, 0.8, 10]} position={[0, up ? 0.03 : 0.07, 0]} rotation={[0, 0, PI / 2]} m="yellow" {ghost} />
			{#each [-0.32, 0.32] as x}
				<Part args={[0.04, 0.06, 0.04]} position={[x, up ? 0.07 : 0.03, 0]} m="steel" {ghost} />
				<Part args={[0.08, 0.01, 0.08]} position={[x, up ? 0.095 : 0.005, 0]} m="steelDark" {ghost} />
			{/each}
		{/if}
	{:else if type === 'footrestraint'}
		<Part args={[0.5, 0.02, 0.35]} position={[0, 0.01, 0]} m="steelDark" {ghost} />
		{#each [-0.12, 0.12] as x}
			<Part shape="torus" args={[0.09, 0.018, 6, 16, PI]} position={[x, 0.02, 0.02]} rotation={[0, PI / 2, 0]} m="blue" {ghost} />
		{/each}
		<Part args={[0.46, 0.005, 0.04]} position={[0, 0.022, -0.14]} m="yellow" {ghost} />
	{:else if type === 'sleepingbag'}
		<!-- wall-mounted sleeping bag (back panel on the hull, bag + straps, light, vent) -->
		<Part args={[0.8, 2.0, 0.03]} position={[0, 1.0, -0.085]} m="white" {ghost} />
		<Part shape="capsule" args={[0.27, 1.25, 6, 14]} position={[0, 0.95, 0.0]} m="blue" {ghost} />
		<Part args={[0.6, 0.35, 0.12]} position={[0, 1.72, -0.02]} m="mattress" {ghost} />
		{#each [0.55, 1.05, 1.45] as y}
			<Part args={[0.64, 0.04, 0.16]} position={[0, y, 0.0]} m="steelDark" {ghost} />
		{/each}
		<Part args={[0.2, 0.03, 0.02]} position={[0, 1.95, -0.06]} m="led" {ghost} />
		<Part args={[0.03, 1.9, 0.03]} position={[-0.38, 1.0, -0.05]} m="yellow" {ghost} />
	{:else if type === 'zerogtoilet'}
		<Part args={[0.9, 2.0, 0.6]} position={[0, 1.0, -0.1]} m="white" {ghost} />
		<Part args={[0.9, 0.04, 0.8]} position={[0, 0.02, 0]} m="steelDark" {ghost} />
		<Part shape="cyl" args={[0.17, 0.2, 0.42, 20]} position={[0, 0.21, 0.28]} m="grey" {ghost} />
		<Part shape="torus" args={[0.14, 0.03, 8, 20]} position={[0, 0.43, 0.28]} rotation={[PI / 2, 0, 0]} m="dark" {ghost} />
		{#each [-1, 1] as sd}
			<Part shape="cyl" args={[0.018, 0.018, 0.5, 8]} position={[sd * 0.2, 0.62, 0.36]} rotation={[PI / 2, 0, 0]} m="yellow" {ghost} />
		{/each}
		<Part shape="cyl" args={[0.03, 0.03, 0.7, 10]} position={[0.32, 0.85, 0.24]} rotation={[0.5, 0, 0]} m="rubber" {ghost} />
		<Part shape="cyl" args={[0.05, 0.03, 0.12, 12]} position={[0.32, 1.17, 0.42]} rotation={[0.5, 0, 0]} m="amber" {ghost} />
		<Part args={[0.5, 0.3, 0.02]} position={[0, 1.4, 0.205]} m="dark" {ghost} />
		<Part args={[0.2, 0.12, 0.01]} position={[0, 1.4, 0.217]} m="screen" {ghost} />
		<Part args={[0.03, 1.9, 0.03]} position={[-0.43, 1.0, 0.38]} m="steel" {ghost} />
		<Part args={[0.86, 0.03, 0.03]} position={[0, 1.95, 0.38]} m="steel" {ghost} />
		<DoorLeaf leaf={door!.leaves[0]} {doorKey} restOpen>
			<Part args={[0.86, 1.7, 0.02]} position={[0, 1.05, 0.4]} m="fabric" {ghost} />
		</DoorLeaf>
	{:else if type === 'ared'}
		<Part args={[1.6, 0.12, 1.0]} position={[0, 0.06, 0]} m="steelDark" {ghost} />
		<Part args={[0.9, 0.04, 0.6]} position={[0, 0.14, 0.1]} m="rubber" {ghost} />
		{#each [-0.7, 0.7] as x}
			<Part args={[0.1, 1.8, 0.1]} position={[x, 0.95, -0.4]} m="steel" {ghost} />
			<Part shape="cyl" args={[0.09, 0.09, 0.9, 16]} position={[x, 0.6, -0.25]} m="grey" {ghost} />
		{/each}
		<Part args={[1.5, 0.1, 0.1]} position={[0, 1.85, -0.4]} m="steel" {ghost} />
		<Part args={[0.08, 0.08, 1.2]} position={[0, 1.6, 0.05]} rotation={[-0.35, 0, 0]} m="steelDark" {ghost} />
		<Part shape="cyl" args={[0.02, 0.02, 1.5, 10]} position={[0, 1.15, 0.3]} rotation={[0, 0, PI / 2]} m="steel" {ghost} />
		{#each [-0.8, 0.8] as x}
			<Part shape="cyl" args={[0.12, 0.12, 0.05, 18]} position={[x, 1.15, 0.3]} rotation={[0, 0, PI / 2]} m="dark" {ghost} />
		{/each}
		<Part args={[0.4, 0.25, 0.03]} position={[0.5, 1.4, -0.33]} m="screen" {ghost} />
	{:else if type === 'foodwarmer'}
		<Part shape="rbox" args={[0.6, 0.88, 0.55]} position={[0, 0.44, 0]} m="white" {ghost} />
		<Part args={[0.56, 0.02, 0.5]} position={[0, 0.89, 0]} m="steel" {ghost} />
		<Part shape="rbox" args={[0.56, 0.42, 0.5]} position={[0, 1.12, -0.01]} m="steelDark" {ghost} />
		<Part args={[0.36, 0.22, 0.01]} position={[-0.05, 1.12, 0.236]} m="led" {ghost} />
		<DoorLeaf leaf={door!.leaves[0]} {doorKey}>
			<Part args={[0.4, 0.27, 0.015]} position={[-0.05, 1.125, 0.255]} m="glass" {ghost} />
			<Part args={[0.36, 0.02, 0.02]} position={[-0.05, 1.27, 0.27]} m="steel" {ghost} />
		</DoorLeaf>
		<Part args={[0.06, 0.2, 0.01]} position={[0.22, 1.12, 0.246]} m="screen" {ghost} />
		<Part args={[0.03, 0.03, 0.01]} position={[0.22, 1.02, 0.25]} m="amber" {ghost} />
		<Part args={[0.5, 0.2, 0.45]} position={[0, 1.42, -0.04]} m="white" {ghost} />
		{#each [-0.14, 0.14] as x}<Part args={[0.26, 0.82, 0.01]} position={[x, 0.45, 0.276]} m="grey" {ghost} />{/each}
	{:else if type === 'waterdispenser'}
		<Part shape="rbox" args={[0.45, 1.5, 0.4]} position={[0, 0.75, 0]} m="white" {ghost} />
		<Part args={[0.32, 0.32, 0.12]} position={[0, 1.05, 0.15]} m="dark" {ghost} />
		<Part shape="cyl" args={[0.012, 0.006, 0.12, 8]} position={[0, 1.15, 0.16]} m="steel" {ghost} />
		<Part args={[0.3, 0.02, 0.1]} position={[0, 0.9, 0.16]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.025, 0.025, 0.012, 12]} position={[-0.08, 1.32, 0.205]} rotation={[PI / 2, 0, 0]} m="amber" {ghost} />
		<Part shape="cyl" args={[0.025, 0.025, 0.012, 12]} position={[0.08, 1.32, 0.205]} rotation={[PI / 2, 0, 0]} m="blue" {ghost} />
		<Part args={[0.2, 0.08, 0.01]} position={[0, 1.42, 0.202]} m="screen" {ghost} />
		<Part args={[0.36, 0.5, 0.01]} position={[0, 0.4, 0.202]} m="grey" {ghost} />
	{:else if type === 'fridge'}
		<Part shape="rbox" args={[0.6, 1.8, 0.6]} position={[0, 0.9, -0.025]} m="white" {ghost} />
		<!-- lit interior behind the door -->
		<Part args={[0.5, 0.9, 0.02]} position={[0, 1.2, 0.28]} m="led" {ghost} />
		{#each [0.95, 1.25] as y}<Part args={[0.5, 0.02, 0.1]} position={[0, y, 0.25]} m="glass" {ghost} />{/each}
		<DoorLeaf leaf={door!.leaves[0]} {doorKey}>
			<Part args={[0.56, 1.02, 0.03]} position={[0, 1.26, 0.32]} m="grey" {ghost} />
			<Part args={[0.56, 0.66, 0.03]} position={[0, 0.38, 0.32]} m="grey" {ghost} />
			<Part args={[0.025, 0.4, 0.03]} position={[0.24, 1.2, 0.345]} m="steel" {ghost} />
			<Part args={[0.025, 0.3, 0.03]} position={[0.24, 0.5, 0.345]} m="steel" {ghost} />
		</DoorLeaf>
		<Part args={[0.12, 0.06, 0.01]} position={[-0.15, 1.62, 0.336]} m="screen" {ghost} />
		<Part args={[0.03, 0.03, 0.01]} position={[-0.05, 1.62, 0.336]} m="blue" {ghost} />
	{:else if type === 'pantry'}
		<Part args={[1.2, 2.0, 0.58]} position={[0, 1.0, -0.01]} m="white" {ghost} />
		{#each [-0.3, 0.3] as x, i}
			{#each [0.3, 0.78, 1.74] as y}
				<Part args={[0.56, 0.44, 0.02]} position={[x, y, 0.29]} m="fabric" {ghost} />
				<Part args={[0.2, 0.05, 0.01]} position={[x, y + 0.14, 0.302]} m="yellow" {ghost} />
			{/each}
			<Part args={[0.5, 0.38, 0.02]} position={[x, 1.26, 0.27]} m="dark" {ghost} />
			<DoorLeaf leaf={door!.leaves[i]} {doorKey}>
				<Part args={[0.56, 0.44, 0.02]} position={[x, 1.26, 0.29]} m="fabric" {ghost} />
				<Part args={[0.2, 0.05, 0.01]} position={[x, 1.4, 0.302]} m="yellow" {ghost} />
			</DoorLeaf>
		{/each}
	{:else if type === 'prepcounter'}
		<Part args={[1.2, 0.85, 0.6]} position={[0, 0.43, -0.025]} m="white" {ghost} />
		<Part args={[1.2, 0.04, 0.65]} position={[0, 0.93, 0]} m="steel" {ghost} />
		{#each [-0.4, 0, 0.4] as x}
			<Part args={[0.36, 0.7, 0.01]} position={[x, 0.45, 0.276]} m="grey" {ghost} />
			<Part args={[0.12, 0.025, 0.04]} position={[x, 0.965, 0.1]} m="dark" {ghost} />
			<Part args={[0.2, 0.012, 0.16]} position={[x, 0.958, -0.05]} m="blue" {ghost} />
		{/each}
		<Part shape="cyl" args={[0.006, 0.006, 1.1, 6]} position={[0, 0.975, -0.22]} rotation={[0, 0, PI / 2]} m="yellow" {ghost} />
		<Part shape="cyl" args={[0.015, 0.015, 1.1, 8]} position={[0, 0.08, 0.36]} rotation={[0, 0, PI / 2]} m="yellow" {ghost} />
	{:else if type === 'trash'}
		<Part shape="rbox" args={[0.5, 0.95, 0.55]} position={[0, 0.475, 0]} m="grey" {ghost} />
		<Part args={[0.42, 0.04, 0.42]} position={[0, 0.97, 0]} m="dark" {ghost} />
		<Part shape="torus" args={[0.12, 0.015, 8, 24]} position={[0, 0.99, 0]} rotation={[PI / 2, 0, 0]} m="steel" {ghost} />
		<Part args={[0.4, 0.5, 0.01]} position={[0, 0.45, 0.276]} m="white" {ghost} />
		<Part args={[0.03, 0.03, 0.01]} position={[0.15, 0.8, 0.278]} m="green" {ghost} />
	{:else if type === 'foodstation'}
		<Part args={[1.0, 0.04, 0.7]} position={[0, 1.03, 0]} m="white" {ghost} />
		<Part args={[1.02, 0.02, 0.72]} position={[0, 1.005, 0]} m="steel" {ghost} />
		{#each [-0.3, 0, 0.3] as x}
			{#each [-0.2, 0.2] as z}<Part args={[0.2, 0.008, 0.14]} position={[x, 1.054, z]} m="blue" {ghost} />{/each}
			<Part args={[0.06, 0.02, 0.02]} position={[x, 1.06, 0]} m="yellow" {ghost} />
		{/each}
		<Part shape="cyl" args={[0.06, 0.06, 1.0, 12]} position={[0, 0.5, 0]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.28, 0.28, 0.02, 16]} position={[0, 0.01, 0]} m="steelDark" {ghost} />
		{#each [-1, 1] as s}
			<Part shape="cyl" args={[0.015, 0.015, 0.9, 8]} position={[0, 0.1, s * 0.5]} rotation={[0, 0, PI / 2]} m="yellow" {ghost} />
			{#each [-0.4, 0.4] as x}<Part args={[0.02, 0.1, 0.02]} position={[x, 0.05, s * 0.5]} m="steel" {ghost} />{/each}
		{/each}
	{:else if type === 'galleytable'}
		<Part args={[1.2, 0.04, 0.8]} position={[0, 0.72, 0]} m="white" {ghost} />
		<Part args={[1.22, 0.02, 0.82]} position={[0, 0.695, 0]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.05, 0.05, 0.68, 12]} position={[0, 0.35, 0]} m="steel" {ghost} />
		<Part shape="cyl" args={[0.3, 0.3, 0.02, 16]} position={[0, 0.01, 0]} m="steelDark" {ghost} />
		{#each [-0.3, 0.3] as x}{#each [-0.22, 0.22] as z}<Part args={[0.22, 0.006, 0.16]} position={[x, 0.743, z]} m="blue" {ghost} />{/each}{/each}
	{:else if type === 'chair'}
		<Part args={[0.42, 0.05, 0.42]} position={[0, 0.45, 0]} m="fabric" {ghost} />
		<Part args={[0.42, 0.42, 0.04]} position={[0, 0.69, -0.2]} m="fabric" {ghost} />
		{#each [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as [x, z]}
			<Part shape="cyl" args={[0.012, 0.012, 0.43, 6]} position={[x, 0.215, z]} m="steel" {ghost} />
			<Part shape="cyl" args={[0.02, 0.02, 0.01, 8]} position={[x, 0.005, z]} m="dark" {ghost} />
		{/each}
		<Part args={[0.44, 0.02, 0.05]} position={[0, 0.5, 0.05]} m="yellow" {ghost} />
	{:else if type === 'hatch'}
		<Part shape="cyl" args={[0.5, 0.5, 0.03, 40]} position={[0, 0.015, 0]} m="steel" {ghost} />
		<Part shape="torus" args={[0.45, 0.022, 6, 40]} position={[0, 0.03, 0]} rotation={[PI / 2, 0, 0]} m="yellow" {ghost} />
		<Part shape="cyl" args={[0.4, 0.4, 0.04, 40]} position={[0, 0.03, 0]} m="dark" {ghost} />
		<Part args={[0.25, 0.03, 0.04]} position={[0, 0.06, 0.2]} m="steel" {ghost} />
		{#each [-0.2, 0.2] as x}
			<Part shape="cyl" args={[0.02, 0.02, H, 8]} position={[x, H / 2, -0.32]} m="steel" {ghost} />
		{/each}
		{#each rungs as y}
			<Part shape="cyl" args={[0.015, 0.015, 0.4, 8]} position={[0, y, -0.32]} rotation={[0, 0, PI / 2]} m="steelDark" {ghost} />
		{/each}
	{/if}
</T.Group>
