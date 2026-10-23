<script lang="ts">
	/** Flat translucent rectangle or disc on the floor. */
	import { T } from '@threlte/core';
	import type { Footprint } from '$lib/game/geometry';
	import { overlayMat } from '$lib/three/materials';

	interface Props {
		f: Footprint;
		color: string;
		opacity?: number;
		y?: number;
	}
	let { f, color, opacity = 0.2, y = 0.012 }: Props = $props();
</script>

<T.Group position={[f.cx, y, f.cz]} rotation.y={f.kind === 'rect' ? (f.angle * Math.PI) / 180 : 0}>
	<T.Mesh rotation.x={-Math.PI / 2} material={overlayMat(color, opacity)} renderOrder={4}>
		{#if f.kind === 'rect'}
			<T.PlaneGeometry args={[f.hw * 2, f.hd * 2]} />
		{:else}
			<T.CircleGeometry args={[f.r, 40]} />
		{/if}
	</T.Mesh>
</T.Group>
