<script lang="ts">
	/** Renders data-driven equipment parts (unit primitives scaled by size) in one pose. */
	import { T } from '@threlte/core';
	import type { EquipPart } from '$lib/game/equipment';
	import { poseOf } from '$lib/game/equipment';
	import EquipPartMesh from './EquipPartMesh.svelte';

	interface Props {
		parts: EquipPart[];
		stowed?: boolean;
		ghost?: string | null;
		/** designer: highlight + pick */
		selectedId?: string | null;
		onpick?: (id: string) => void;
	}
	let { parts, stowed = false, ghost = null, selectedId = null, onpick }: Props = $props();
</script>

<T.Group>
	{#each parts as p (p.id)}
		{@const pose = poseOf(p, stowed)}
		<EquipPartMesh part={p} {pose} {ghost} selected={p.id === selectedId} {onpick} />
	{/each}
</T.Group>
