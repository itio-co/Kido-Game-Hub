<script lang="ts">
	import { T } from '@threlte/core';
	import { BufferGeometry, CapsuleGeometry, Group, MeshStandardMaterial, TorusGeometry, type Object3D } from 'three';
	import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
	import type { EquipPart } from '$lib/game/equipment';
	import { ghostMat, mat } from '$lib/three/materials';
	import { loadGlbPart } from '$lib/three/glbPart';

	interface Props {
		part: EquipPart;
		pose: { pos: [number, number, number]; rot: [number, number, number]; size: [number, number, number] };
		ghost?: string | null;
		selected?: boolean;
		onpick?: (id: string) => void;
		/** designer binds the mesh for TransformControls */
		ref?: Group;
	}
	let { part, pose, ghost = null, selected = false, onpick, ref = $bindable() }: Props = $props();
	const D = Math.PI / 180;
	const material = $derived(ghost ? ghostMat(ghost) : mat(part.m));
	const hi = new MeshStandardMaterial({ color: '#49a6ff', emissive: '#1e6fd0', emissiveIntensity: 0.6, transparent: true, opacity: 0.35, depthWrite: false });

	// rounded box and capsule depend on the aspect ratio → geometry built for the actual size (scale 1)
	const special = $derived.by((): BufferGeometry | null => {
		const [x, y, z] = pose.size;
		if (part.shape === 'rbox') return new RoundedBoxGeometry(x, y, z, 2, Math.max(0.002, Math.min(x, y, z) * 0.25));
		if (part.shape === 'capsule') {
			const r = Math.min(x, z) / 2;
			const g = new CapsuleGeometry(r, Math.max(0.001, y - 2 * r), 4, 12);
			g.scale(x / (2 * r), 1, z / (2 * r));
			return g;
		}
		if (part.shape === 'torus') {
			const tube = Math.min(0.49, z / x / 2);
			const g = new TorusGeometry(0.5 - tube, tube, 10, 40);
			g.scale(x, y, x);
			return g;
		}
		return null;
	});
	$effect(() => {
		const g = special;
		return () => g?.dispose();
	});
	const unitScale = $derived(special ? ([1, 1, 1] as [number, number, number]) : pose.size);

	let glb = $state<Object3D | null>(null);
	$effect(() => {
		if (part.shape !== 'glb' || !part.glb) return;
		let live = true;
		loadGlbPart(part.glb).then((o) => live && (glb = o));
		return () => {
			live = false;
		};
	});
	const pick = (e: { stopPropagation: () => void }) => {
		if (!onpick) return;
		e.stopPropagation();
		onpick(part.id);
	};

</script>

<T.Group bind:ref position={pose.pos} rotation={[pose.rot[0] * D, pose.rot[1] * D, pose.rot[2] * D]} name={part.name}>
	{#if part.shape === 'glb'}
		{#if glb}
			<T is={glb} scale={pose.size} onclick={pick} />
		{:else}
			<T.Mesh scale={pose.size} material={hi}><T.BoxGeometry /></T.Mesh>
		{/if}
	{:else if special}
		<T.Mesh geometry={special} {material} castShadow={!ghost} receiveShadow={!ghost} onclick={pick} />
	{:else}
		<T.Mesh scale={unitScale} {material} castShadow={!ghost} receiveShadow={!ghost} onclick={pick}>
			{#if part.shape === 'box'}
				<T.BoxGeometry />
			{:else if part.shape === 'cyl'}
				<T.CylinderGeometry args={[0.5, 0.5, 1, 24]} />
			{:else if part.shape === 'sphere'}
				<T.SphereGeometry args={[0.5, 24, 16]} />
			{:else if part.shape === 'plane'}
				<T.PlaneGeometry />
			{/if}
		</T.Mesh>
	{/if}
	{#if selected}
		<T.Mesh scale={[pose.size[0] + 0.012, pose.size[1] + 0.012, Math.max(pose.size[2], 0.004) + 0.012]} material={hi}>
			<T.BoxGeometry />
		</T.Mesh>
	{/if}
</T.Group>
