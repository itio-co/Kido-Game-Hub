<script lang="ts">
	/**
	 * One moving door leaf: children are in module space; the leaf rotates (hinge), translates (slide)
	 * or folds (curtain) about its pivot by the live openness of the item's door.
	 */
	import { T, useTask, useThrelte } from '@threlte/core';
	import type { Snippet } from 'svelte';
	import type { Group } from 'three';
	import { doorEase, type DoorLeaf } from '$lib/game/doors';
	import { doorValue } from '$lib/sim/doorState';

	interface Props {
		leaf: DoorLeaf;
		/** item key "deck:uid"; null = preview (rest state) */
		doorKey?: string | null;
		restOpen?: boolean;
		/** fixed openness (designer preview) */
		preview?: number | null;
		children: Snippet;
	}
	let { leaf, doorKey = null, restOpen = false, preview = null, children }: Props = $props();
	const cur = () => (preview !== null ? preview : doorValue(doorKey, restOpen));
	let g = $state<Group>();
	const D = Math.PI / 180;
	let last = -1;
	const { invalidate } = useThrelte();
	function apply(v: number) {
		if (!g || v === last) return;
		last = v;
		const t = doorEase(v);
		g.rotation.set(0, 0, 0);
		g.scale.set(1, 1, 1);
		g.position.set(leaf.pivot[0], leaf.pivot[1], leaf.pivot[2]);
		if (leaf.slide) g.position.set(leaf.pivot[0] + leaf.slide[0] * t, leaf.pivot[1] + leaf.slide[1] * t, leaf.pivot[2] + leaf.slide[2] * t);
		else if (leaf.fold !== undefined) g.scale.x = 1 + (leaf.fold - 1) * t;
		else if (leaf.angle) {
			const a = leaf.angle * D * t;
			if (leaf.axis === 'x') g.rotation.x = a;
			else if (leaf.axis === 'z') g.rotation.z = a;
			else g.rotation.y = a;
		}
		g.updateMatrix();
		invalidate();
	}
	$effect(() => {
		void leaf;
		last = -1;
		void preview;
		if (g) apply(cur());
	});
	useTask(() => apply(cur()), { autoInvalidate: false });
</script>

<T.Group bind:ref={g} position={leaf.pivot} name="door-leaf" userData={{ door: true }}>
	<T.Group position={[-leaf.pivot[0], -leaf.pivot[1], -leaf.pivot[2]]}>
		{@render children()}
	</T.Group>
</T.Group>
