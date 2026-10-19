<script lang="ts">
	/**
	 * Equipment Designer workbench: cm grid, 1.75 m human, the selected equipment as data-driven
	 * parts, TransformControls (snap 1 cm / 5° / 1 cm) for custom designs, footprint + access zone.
	 * Built-ins are rendered once from their procedural model and converted to parts (read-only).
	 */
	import { T, useThrelte } from '@threlte/core';
	import { HTML, OrbitControls, TransformControls, interactivity } from '@threlte/extras';
	import { tick, untrack } from 'svelte';
	import { Group, PMREMGenerator, PerspectiveCamera, type Material, type Texture } from 'three';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
	import { equip } from '$lib/game/equipStore.svelte';
	import { extractParts, poseOf } from '$lib/game/equipment';
	import { isBuiltin } from '$lib/game/catalog';
	import type { ModuleId } from '$lib/game/types';
	import EquipPartMesh from './EquipPartMesh.svelte';
	import EditOverlay from './EditOverlay.svelte';
	import { emptySel } from '$lib/game/editMesh';
	import ModuleMesh from './ModuleMesh.svelte';
	import Silhouette from './Silhouette.svelte';
	import Outline from './Outline.svelte';
	import Avatar from '$lib/sim/Avatar.svelte';
	import { couchFrame, type AvatarState } from '$lib/sim/avatarPose';
	import { couchOccupant } from '$lib/game/couchModel';

	const COUCH = couchFrame(couchOccupant());

	const { renderer, scene, invalidate } = useThrelte();
	interactivity();
	renderer.localClippingEnabled = false;
	renderer.clippingPlanes = [];
	let envTex: Texture | undefined;
	{
		const pmrem = new PMREMGenerator(renderer);
		envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();
		scene.environment = envTex;
		scene.environmentIntensity = 0.6;
	}

	const def = $derived(equip.selected);
	const occupants = $derived.by((): AvatarState[] => {
		if (!def || !equip.occupant || equip.pose === 'stowed' || !def.seats || (def.stowPhase ?? 'launch') !== 'surface') return [];
		const n = def.seats;
		return Array.from({ length: n }, (_, i) => ({ x: (i - (n - 1) / 2) * 0.8, y: 0, z: 0, yaw: 0, pose: 'couch', t: i, visible: true, couch: COUCH }));
	});
	// camera presets (Iso / Side / Front / Top)
	let camRef = $state<PerspectiveCamera>();
	let orbit = $state<OrbitControlsImpl>();
	$effect(() => {
		const v = equip.view;
		const c = camRef;
		const o = orbit;
		if (!c || !o || v.id === 0) return;
		const d = untrack(() => Math.max(2.4, Math.max(def?.d ?? 1, def?.launch?.d ?? 0, def?.w ?? 1) * 1.9));
		const ty = 0.55;
		const pos: Record<string, [number, number, number]> = {
			iso: [d * 0.8, ty + d * 0.6, d],
			side: [d * 0.8, ty + 0.05, 0],
			front: [0, ty + 0.05, d * 0.9],
			top: [0, ty + d * 1.5, 0.001]
		};
		c.position.set(...pos[v.name]);
		o.target.set(0, ty, 0);
		o.update();
		invalidate();
	});
	const stowed = $derived(equip.pose === 'stowed');
	const parts = $derived(def?.parts ?? []);
	const editable = $derived(equip.editable);

	// ---- built-in extraction (both phases, paired by index) ----
	const needsExtract = $derived(!!def && def.builtin && isBuiltin(def.id) && !equip.builtinParts[def.id]);
	let exSurface = $state<Group>();
	let exLaunch = $state<Group>();
	$effect(() => {
		if (!needsExtract || !def) return;
		const id = def.id;
		const stowPhase = def.stowPhase ?? 'launch';
		untrack(async () => {
			await tick();
			await new Promise((r) => requestAnimationFrame(() => r(null)));
			if (!exSurface || !exLaunch) return;
			const name = (m: Material) => m.name || undefined;
			const surf = extractParts(exSurface, name);
			const laun = extractParts(exLaunch, name);
			const dep = stowPhase === 'surface' ? laun : surf;
			const sto = stowPhase === 'surface' ? surf : laun;
			if (sto.length === dep.length) dep.forEach((p, i) => (p.stowed = { pos: sto[i].pos, rot: sto[i].rot, size: sto[i].size }));
			equip.builtinParts = { ...equip.builtinParts, [id]: dep };
			invalidate();
		});
	});

	// ---- component edit mode (Vertex / Edge / Face) on the selected part ----
	const editing = $derived(editable && equip.editMode !== 'object' && !!equip.part && equip.part.shape !== 'glb');
	let lastPart: string | null = null;
	$effect(() => {
		const id = equip.partId;
		untrack(() => {
			if (id !== lastPart && equip.editMode !== 'object') {
				equip.editMode = 'object';
				equip.sel = emptySel();
			}
			lastPart = id;
		});
	});

	// ---- transform gizmo on the selected part (custom designs only) ----
	let refs = $state<Record<string, Group | undefined>>({});
	const target = $derived(editable && equip.partId && equip.editMode === 'object' ? refs[equip.partId] : undefined);
	const D = 180 / Math.PI;
	const r3 = (n: number, k = 1000) => Math.round(n * k) / k;
	function onChange() {
		const o = target;
		const p = equip.part;
		if (!o || !p || equip.gizmo === 'scale') return;
		if (equip.gizmo === 'translate') equip.setPose(p.id, { pos: [r3(o.position.x), r3(o.position.y), r3(o.position.z)] });
		else equip.setPose(p.id, { rot: [r3(o.rotation.x * D, 10), r3(o.rotation.y * D, 10), r3(o.rotation.z * D, 10)] });
	}
	function onEnd() {
		const o = target;
		const p = equip.part;
		if (!o || !p || equip.gizmo !== 'scale') return;
		const cur = poseOf(p, stowed).size;
		const s = o.scale;
		equip.setPose(p.id, { size: [r3(Math.max(0.005, cur[0] * s.x)), r3(Math.max(0.005, cur[1] * s.y)), r3(Math.max(0.005, cur[2] * s.z))] });
		o.scale.set(1, 1, 1);
	}

	const fp = $derived.by(() => {
		if (!def) return null;
		// footprint shown for the current pose (deployed vs stowed → surface / launch dims)
		const stowPhase = def.stowPhase ?? 'launch';
		const useLaunch = (stowed && stowPhase === 'launch') || (!stowed && stowPhase === 'surface');
		const L = useLaunch && def.launch ? def.launch : { w: def.w, d: def.d, height: def.height };
		return L;
	});
</script>

<T.Color attach="background" args={['#0b1018']} />
<T.AmbientLight intensity={0.25} />
<T.HemisphereLight args={['#e4ecff', '#30302c', 0.5]} />
<T.DirectionalLight position={[3, 5, 4]} intensity={2.2} castShadow shadow.mapSize={[2048, 2048]} shadow.camera.left={-3} shadow.camera.right={3} shadow.camera.top={3} shadow.camera.bottom={-3} shadow.bias={-0.0004} />

<T.PerspectiveCamera makeDefault position={[2.6, 2.0, 3.2]} fov={40} near={0.01} far={100} bind:ref={camRef}>
	<OrbitControls bind:ref={orbit} enableDamping target={[0, 0.55, 0]} minDistance={0.3} maxDistance={14} maxPolarAngle={Math.PI - 0.05} />
</T.PerspectiveCamera>

<!-- floor + cm grid (1 cm / 10 cm / 1 m) -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.001} receiveShadow onclick={() => !editing && (equip.partId = null)}>
	<T.PlaneGeometry args={[8, 8]} />
	<T.MeshStandardMaterial color="#1a222d" roughness={0.95} />
</T.Mesh>
<T.GridHelper args={[2, 200, '#2a3a4e', '#223040']} position.y={0.0005} />
<T.GridHelper args={[8, 80, '#3d5675', '#2c3e55']} position.y={0.001} />
<T.GridHelper args={[8, 8, '#6f93bf', '#5c7ea8']} position.y={0.0015} />

{#if def}
	<Silhouette x={-(Math.max(def.w, def.launch?.w ?? 0) / 2 + 0.55)} z={-(Math.max(def.d, def.launch?.d ?? 0) / 2) + 0.15} />
	{#if fp}
		<!-- footprint (auto-fit or entered) and front access zone (+Z) -->
		<Outline points={[[-fp.w / 2, -fp.d / 2], [fp.w / 2, -fp.d / 2], [fp.w / 2, fp.d / 2], [-fp.w / 2, fp.d / 2]]} color="#49a6ff" y={0.004} />
		<T.Mesh rotation.x={-Math.PI / 2} position.y={0.002}>
			<T.PlaneGeometry args={[fp.w, fp.d]} />
			<T.MeshBasicMaterial color="#49a6ff" transparent opacity={0.16} depthWrite={false} />
		</T.Mesh>
		{#if def.access > 0}
			<T.Mesh rotation.x={-Math.PI / 2} position={[0, 0.0025, fp.d / 2 + def.access / 2]}>
				<T.PlaneGeometry args={[fp.w, def.access]} />
				<T.MeshBasicMaterial color="#3ddc84" transparent opacity={0.13} depthWrite={false} />
			</T.Mesh>
		{/if}
		<HTML position={[0, 0.01, fp.d / 2 + Math.max(def.access, 0.1) + 0.12]} center pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="dim">{(fp.w * 100).toFixed(0)} × {(fp.d * 100).toFixed(0)} × {(fp.height * 100).toFixed(0)} cm · {stowed ? 'stowed' : 'deployed'}</div>
		</HTML>
	{/if}

	{#each parts as p (p.id)}
		{#if !(editing && p.id === equip.partId)}
			<EquipPartMesh
				part={p}
				pose={poseOf(p, stowed)}
				selected={!editing && p.id === equip.partId}
				onpick={editing ? undefined : (id) => (equip.partId = id)}
				bind:ref={refs[p.id]}
			/>
		{/if}
	{/each}
	{#if editing && equip.part}
		<EditOverlay part={equip.part} {orbit} />
	{/if}
	{#if target}
		<TransformControls
			object={target}
			mode={equip.gizmo}
			translationSnap={0.01}
			rotationSnap={(5 * Math.PI) / 180}
			scaleSnap={0.01}
			size={0.8}
			onobjectChange={onChange}
			onmouseUp={onEnd}
		/>
	{/if}

	{#each occupants as o, i (i)}
		<Avatar av={o} color={['#3f7fd6', '#d6643f', '#3fae6a', '#b04fc4'][i % 4]} id={100 + i} />
	{/each}

	<!-- hidden procedural renders used once to convert a built-in into parts -->
	{#if needsExtract}
		<T.Group visible={false} bind:ref={exSurface}><ModuleMesh type={def.id as ModuleId} phase="surface" /></T.Group>
		<T.Group visible={false} bind:ref={exLaunch}><ModuleMesh type={def.id as ModuleId} phase="launch" /></T.Group>
	{/if}
{/if}

<style>
	.dim {
		font: 11px system-ui;
		color: #cfe3ff;
		background: rgba(10, 16, 26, 0.75);
		padding: 1px 6px;
		border-radius: 4px;
		white-space: nowrap;
	}
</style>
