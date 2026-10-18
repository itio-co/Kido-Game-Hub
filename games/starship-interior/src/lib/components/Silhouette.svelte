<script lang="ts">
	/** 1.75 m human reference figure (standing, arms down). */
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { MeshStandardMaterial } from 'three';
	interface Props {
		x?: number;
	}
	let { x = -1 }: Props = $props();
	const m = new MeshStandardMaterial({ color: '#7f9bbd', transparent: true, opacity: 0.55, roughness: 0.8 });
</script>

<T.Group position.x={x} name="1.75 m human">
	<T.Mesh position.y={1.635} material={m}><T.SphereGeometry args={[0.115, 20, 14]} /></T.Mesh>
	<T.Mesh position.y={1.49} material={m}><T.CylinderGeometry args={[0.05, 0.055, 0.08, 12]} /></T.Mesh>
	<T.Mesh position.y={1.2} material={m}><T.CapsuleGeometry args={[0.17, 0.36, 4, 12]} /></T.Mesh>
	<T.Mesh position.y={0.93} material={m}><T.CapsuleGeometry args={[0.16, 0.08, 4, 12]} /></T.Mesh>
	{#each [-1, 1] as s}
		<T.Mesh position={[s * 0.235, 1.12, 0]} rotation.z={s * 0.06} material={m}><T.CapsuleGeometry args={[0.045, 0.6, 4, 10]} /></T.Mesh>
		<T.Mesh position={[s * 0.1, 0.45, 0]} material={m}><T.CapsuleGeometry args={[0.07, 0.72, 4, 10]} /></T.Mesh>
		<T.Mesh position={[s * 0.1, 0.03, 0.05]} material={m}><T.BoxGeometry args={[0.1, 0.06, 0.26]} /></T.Mesh>
	{/each}
	<!-- height bar -->
	<T.Mesh position={[-0.35, 0.875, 0]} material={m}><T.BoxGeometry args={[0.01, 1.75, 0.01]} /></T.Mesh>
	<HTML position={[-0.35, 1.8, 0]} center pointerEvents="none" zIndexRange={[5, 0]}>
		<div style="font: 11px system-ui; color: #cfe3ff; background: rgba(10,16,26,.7); padding: 1px 5px; border-radius: 4px; white-space: nowrap">1.75 m</div>
	</HTML>
</T.Group>
