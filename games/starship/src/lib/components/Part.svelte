<script lang="ts">
	import { T } from '@threlte/core';
	import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
	import { ghostMat, mat, type MatName } from '$lib/three/materials';

	type Shape = 'box' | 'rbox' | 'cyl' | 'torus' | 'sphere' | 'capsule' | 'plane';
	interface Props {
		shape?: Shape;
		args?: number[];
		position?: [number, number, number];
		rotation?: [number, number, number];
		scale?: [number, number, number];
		m?: MatName;
		/** ghost preview tint (translucent, no shadows) */
		ghost?: string | null;
	}
	let { shape = 'box', args = [1, 1, 1], position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], m = 'white', ghost = null }: Props =
		$props();
	const material = $derived(ghost ? ghostMat(ghost) : mat(m));
	const rbox = $derived.by(() => {
		if (shape !== 'rbox') return null;
		const [w, h, d] = args;
		return new RoundedBoxGeometry(w, h, d, 2, Math.max(0.002, Math.min(w, h, d) * 0.3));
	});
	$effect(() => {
		const g = rbox;
		return () => g?.dispose();
	});
</script>

{#if shape === 'rbox' && rbox}
	<T.Mesh {position} {rotation} {scale} {material} geometry={rbox} castShadow={!ghost} receiveShadow={!ghost} />
{:else}
	<T.Mesh {position} {rotation} {scale} {material} castShadow={!ghost} receiveShadow={!ghost}>
		{#if shape === 'box'}
			<T.BoxGeometry args={args as [number, number, number]} />
		{:else if shape === 'cyl'}
			<T.CylinderGeometry args={[args[0], args[1], args[2], args[3] ?? 16]} />
		{:else if shape === 'torus'}
			<T.TorusGeometry args={[args[0], args[1], args[2] ?? 8, args[3] ?? 32]} />
		{:else if shape === 'capsule'}
			<T.CapsuleGeometry args={[args[0], args[1], 4, 12]} />
		{:else if shape === 'plane'}
			<T.PlaneGeometry args={[args[0], args[1]]} />
		{:else}
			<T.SphereGeometry args={[args[0], args[1] ?? 24, args[2] ?? 16]} />
		{/if}
	</T.Mesh>
{/if}
