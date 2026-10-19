<script lang="ts">
	/**
	 * Low-poly crew avatar (≈1.75 m). Reads a plain mutable state object every frame (no Svelte
	 * reactivity in the hot path) and poses the joint hierarchy procedurally.
	 */
	import { T, useTask } from '@threlte/core';
	import { CapsuleGeometry, Color, Group, MeshStandardMaterial, SphereGeometry, BoxGeometry, CylinderGeometry, Mesh } from 'three';
	import { BODY, avatarFrame, type AvatarState } from './avatarPose';

	interface Props {
		av: AvatarState;
		color: string;
		g?: number;
		selected?: boolean;
		id?: number;
		ref?: Group;
	}
	let { av, color, g = 1, selected = false, id = 0, ref = $bindable() }: Props = $props();

	// shared geometries (module scope would be nicer, but cheap enough per avatar)
	const G = {
		torso: new CapsuleGeometry(0.15, 0.22, 3, 8),
		pelvis: new CapsuleGeometry(0.13, 0.06, 3, 8),
		head: new SphereGeometry(BODY.headR, 12, 9),
		neck: new CylinderGeometry(0.045, 0.05, 0.08, 8),
		upper: new CapsuleGeometry(0.048, BODY.upperArm - 0.09, 3, 6),
		fore: new CapsuleGeometry(0.04, BODY.forearm - 0.08, 3, 6),
		thigh: new CapsuleGeometry(0.07, BODY.thigh - 0.12, 3, 7),
		shin: new CapsuleGeometry(0.055, BODY.shin - 0.1, 3, 7),
		foot: new BoxGeometry(0.1, 0.06, 0.24),
		visor: new BoxGeometry(0.15, 0.05, 0.05),
		patch: new BoxGeometry(0.1, 0.06, 0.02),
		ring: new CylinderGeometry(0.34, 0.34, 0.015, 24, 1, true)
	};
	const suit = $derived(new MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 }));
	const dark = new MeshStandardMaterial({ color: '#2a2f38', roughness: 0.8 });
	const skin = new MeshStandardMaterial({ color: '#d9b39a', roughness: 0.7 });
	const visorM = new MeshStandardMaterial({ color: '#1b2430', roughness: 0.2, metalness: 0.4 });
	const white = new MeshStandardMaterial({ color: '#eef2f6', roughness: 0.6 });
	const ringM = new MeshStandardMaterial({ color: '#ffd23f', emissive: new Color('#ffb000'), emissiveIntensity: 0.8, transparent: true, opacity: 0.85 });

	let root = $state<Group>();
	$effect(() => {
		ref = root;
	});
	let hips = $state<Group>();
	let spine = $state<Group>();
	let head = $state<Group>();
	let thL = $state<Group>(), thR = $state<Group>(), knL = $state<Group>(), knR = $state<Group>();
	let arL = $state<Group>(), arR = $state<Group>(), elL = $state<Group>(), elR = $state<Group>();

	useTask(() => {
		const r = root;
		if (!r || !hips || !spine || !head || !thL || !thR || !knL || !knR || !arL || !arR || !elL || !elR) return;
		r.visible = av.visible;
		if (!av.visible) return;
		r.position.set(av.x, av.y, av.z);
		const f = avatarFrame(av, g);
		if (av.q) {
			// free-floating: root = hip joint, full 3D orientation
			r.quaternion.set(av.q[0], av.q[1], av.q[2], av.q[3]);
			hips.position.set(0, 0, 0);
		} else {
			r.rotation.set(0, av.yaw, 0);
			hips.position.set(0, f.hipY, f.hipZ);
		}
		hips.rotation.x = f.root;
		spine.rotation.x = f.spine;
		head.rotation.x = f.head;
		thL.rotation.x = f.thighL;
		thR.rotation.x = f.thighR;
		knL.rotation.x = f.kneeL;
		knR.rotation.x = f.kneeR;
		arL.rotation.set(f.armL, 0, f.splay);
		arR.rotation.set(f.armR, 0, -f.splay);
		elL.rotation.x = f.elbowL;
		elR.rotation.x = f.elbowR;
	});
	const sh = (m: Mesh) => ((m.castShadow = true), m);
</script>

<T.Group bind:ref={root} name={`Crew avatar ${id}`} userData={{ crewId: id }}>
	<T.Group>
		{#if selected}
			<T.Mesh geometry={G.ring} material={ringM} position.y={0.02} />
		{/if}
		<T.Group bind:ref={hips}>
			<T.Mesh geometry={G.pelvis} material={dark} rotation.z={Math.PI / 2} position.y={0.02} castShadow />
			<!-- torso / head -->
			<T.Group bind:ref={spine}>
				<T.Mesh geometry={G.torso} material={suit} position.y={0.27} scale={[1.15, 1, 0.75]} castShadow />
				<T.Mesh geometry={G.patch} material={white} position={[0.07, 0.36, 0.11]} />
				<T.Mesh geometry={G.neck} material={skin} position.y={BODY.torso + 0.02} />
				<T.Group bind:ref={head} position.y={BODY.torso + 0.06}>
					<T.Mesh geometry={G.head} material={skin} position.y={BODY.headR + 0.02} castShadow />
					<T.Mesh geometry={G.visor} material={visorM} position={[0, BODY.headR + 0.04, 0.085]} />
				</T.Group>
				<!-- arms -->
				<T.Group bind:ref={arL} position={[-BODY.shoulderW, BODY.torso - 0.05, 0]}>
					<T.Mesh geometry={G.upper} material={suit} position.y={-BODY.upperArm / 2} castShadow />
					<T.Group bind:ref={elL} position.y={-BODY.upperArm}>
						<T.Mesh geometry={G.fore} material={suit} position.y={-BODY.forearm / 2} castShadow />
						<T.Mesh geometry={G.head} material={skin} position.y={-BODY.forearm} scale={0.4} />
					</T.Group>
				</T.Group>
				<T.Group bind:ref={arR} position={[BODY.shoulderW, BODY.torso - 0.05, 0]}>
					<T.Mesh geometry={G.upper} material={suit} position.y={-BODY.upperArm / 2} castShadow />
					<T.Group bind:ref={elR} position.y={-BODY.upperArm}>
						<T.Mesh geometry={G.fore} material={suit} position.y={-BODY.forearm / 2} castShadow />
						<T.Mesh geometry={G.head} material={skin} position.y={-BODY.forearm} scale={0.4} />
					</T.Group>
				</T.Group>
			</T.Group>
			<!-- legs -->
			<T.Group bind:ref={thL} position.x={-BODY.hipW}>
				<T.Mesh geometry={G.thigh} material={suit} position.y={-BODY.thigh / 2} castShadow />
				<T.Group bind:ref={knL} position.y={-BODY.thigh}>
					<T.Mesh geometry={G.shin} material={suit} position.y={-BODY.shin / 2} castShadow />
					<T.Mesh geometry={G.foot} material={dark} position={[0, -BODY.shin - 0.03 + 0.03, 0.05]} />
				</T.Group>
			</T.Group>
			<T.Group bind:ref={thR} position.x={BODY.hipW}>
				<T.Mesh geometry={G.thigh} material={suit} position.y={-BODY.thigh / 2} castShadow />
				<T.Group bind:ref={knR} position.y={-BODY.thigh}>
					<T.Mesh geometry={G.shin} material={suit} position.y={-BODY.shin / 2} castShadow />
					<T.Mesh geometry={G.foot} material={dark} position={[0, -BODY.shin - 0.03 + 0.03, 0.05]} />
				</T.Group>
			</T.Group>
		</T.Group>
	</T.Group>
</T.Group>
