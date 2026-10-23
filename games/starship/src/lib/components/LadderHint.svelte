<script lang="ts">
	/** Pulsing ring that marks the nearest ladder / hatch after "Go to a ladder to change deck". */
	import { T, useTask } from '@threlte/core';
	import { Mesh, MeshBasicMaterial, TorusGeometry } from 'three';
	import { game } from '$lib/game/state.svelte';

	const geo = new TorusGeometry(0.62, 0.045, 8, 40);
	const mat = new MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthTest: false });
	let ring = $state<Mesh>();
	useTask(() => {
		const h = game.ladderHint;
		if (!ring) return;
		if (!h || performance.now() > h.until) {
			ring.visible = false;
			return;
		}
		ring.visible = true;
		const t = performance.now() / 1000;
		ring.position.set(h.x, (game.floorY[h.deck] ?? 0) + 0.06, h.z);
		ring.scale.setScalar(1 + 0.18 * Math.sin(t * 6));
	});
</script>

<T.Mesh bind:ref={ring} geometry={geo} material={mat} rotation.x={-Math.PI / 2} renderOrder={999} visible={false} name="Ladder hint" />
