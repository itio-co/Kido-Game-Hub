<script lang="ts">
	import { T } from '@threlte/core';
	import { LineBasicMaterial } from 'three';
	import { loop } from '$lib/three/hullGeometry';

	interface Props {
		points: [number, number][];
		y?: number;
		color?: string;
		opacity?: number;
	}
	let { points, y = 0.02, color = '#ffffff', opacity = 1 }: Props = $props();
	const geometry = $derived(loop(points, y));
	const material = $derived(new LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest: false }));
	$effect(() => {
		const g = geometry;
		const m = material;
		return () => {
			g.dispose();
			m.dispose();
		};
	});
</script>

<T.LineLoop {geometry} {material} renderOrder={5} />
