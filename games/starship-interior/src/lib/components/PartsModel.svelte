<script lang="ts">
	/** Renders a data-driven parts list in its deployed or stowed pose. */
	import type { PartSpec } from '$lib/game/couchModel';
	import Part from './Part.svelte';

	interface Props {
		parts: PartSpec[];
		stowed?: boolean;
		ghost?: string | null;
	}
	let { parts, stowed = false, ghost = null }: Props = $props();
</script>

{#each parts as p}
	{@const pose = stowed && p.stowed ? p.stowed : p}
	<Part shape={p.shape} args={p.args} position={pose.pos} rotation={pose.rot} scale={pose.scale ?? [1, 1, 1]} m={p.m} {ghost} />
{/each}
