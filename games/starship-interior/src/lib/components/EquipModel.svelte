<script lang="ts">
	/** Renders data-driven equipment parts (unit primitives scaled by size) in one pose. */
	import { T } from '@threlte/core';
	import type { EquipPart } from '$lib/game/equipment';
	import { poseOf } from '$lib/game/equipment';
	import EquipPartMesh from './EquipPartMesh.svelte';
	import DoorLeaf from './DoorLeaf.svelte';
	import { partDoorLeaf } from '$lib/game/doors';

	interface Props {
		parts: EquipPart[];
		stowed?: boolean;
		ghost?: string | null;
		/** designer: highlight + pick */
		selectedId?: string | null;
		onpick?: (id: string) => void;
		/** placed item key: parts marked as door follow the live door state */
		doorKey?: string | null;
		/** designer preview: openness override for door parts (0..1) */
		doorPreview?: number | null;
	}
	let { parts, stowed = false, ghost = null, selectedId = null, onpick, doorKey = null, doorPreview = null }: Props = $props();
</script>

<T.Group>
	{#each parts as p (p.id)}
		{@const pose = poseOf(p, stowed)}
		{#if p.door && (doorKey || doorPreview !== null)}
			<DoorLeaf leaf={partDoorLeaf(p.door, p)} {doorKey} preview={doorPreview}>
				<EquipPartMesh part={p} {pose} {ghost} selected={p.id === selectedId} {onpick} />
			</DoorLeaf>
		{:else}
			<EquipPartMesh part={p} {pose} {ghost} selected={p.id === selectedId} {onpick} />
		{/if}
	{/each}
</T.Group>
