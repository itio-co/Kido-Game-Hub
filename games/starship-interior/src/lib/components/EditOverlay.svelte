<script lang="ts">
	/**
	 * Solid mesh for the part being edited. Picking, highlights and the gizmo live in
	 * @itio/mesh-editor (Threlte adapter). This overlay keeps the designer's materials,
	 * the hover tint, and the __designerEdit screen-space hook the tests use.
	 */
	import { T, useThrelte } from '@threlte/core';
	import MeshEditor from '@itio/mesh-editor/threlte/MeshEditor.svelte';
	import type { EditorViewport, ThrelteEditorOptions } from '@itio/mesh-editor/threlte';
	import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import { equip } from '$lib/game/equipStore.svelte';
	import { faceCentroid, toGeometry, type EditMesh } from '$lib/game/editMesh';
	import type { EquipPart } from '$lib/game/equipment';
	import { mat as libMat, type MatName } from '$lib/three/materials';
	import type { Material } from 'three';

	let { part, orbit }: { part: EquipPart; orbit?: OrbitControlsImpl } = $props();
	const { camera, renderer, invalidate } = useThrelte();
	const D = Math.PI / 180;
	const mode = $derived(equip.editMode as 'vertex' | 'edge' | 'face');
	const M = $derived(equip.workMesh);
	let group = $state<Group>();
	let faceMesh = $state<Mesh>();
	let hover = $state<number | null>(null);
	let viewport = $state<EditorViewport | null>(null);

	const editorOptions: ThrelteEditorOptions = {
		host: equip.host,
		history: equip.history,
		snap: (c) => equip.snapCandidate(c),
		getControls: () => orbit
	};

	const faces = $derived(M ? toGeometry(M, part.m) : null);
	const editMat = new MeshStandardMaterial({ color: '#c3cedc', roughness: 0.7, metalness: 0.05, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
	const faceMats = new Map<string, Material>();
	function editMatFor(name: MatName): Material {
		let m = faceMats.get(name);
		if (!m) {
			m = libMat(name).clone();
			Object.assign(m, { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
			faceMats.set(name, m);
		}
		return m;
	}
	$effect(() => () => faceMats.forEach((m) => m.dispose()));
	const smooth = $derived(!!M?.sm);
	$effect(() => {
		editMat.flatShading = !smooth;
		editMat.needsUpdate = true;
	});
	const faceMatList = $derived(faces ? faces.mats.map((n) => (n === part.m ? editMat : editMatFor(n))) : []);
	const hovMat = new MeshStandardMaterial({ color: '#7cc4ff', emissive: '#2f8cff', emissiveIntensity: 0.4, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
	function subGeo(m: EditMesh, list: number[]) {
		const pos: number[] = [];
		for (const fi of list) {
			const f = m.f[fi];
			if (!f) continue;
			for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) if (i !== undefined) pos.push(m.v[3 * i] ?? 0, m.v[3 * i + 1] ?? 0, m.v[3 * i + 2] ?? 0);
		}
		const g = new BufferGeometry();
		g.setAttribute('position', new Float32BufferAttribute(pos, 3));
		g.computeVertexNormals();
		return g;
	}
	const hovGeo = $derived(M && mode === 'face' && hover !== null ? subGeo(M, [hover]) : null);
	$effect(() => {
		const gs = [faces?.geo, hovGeo];
		invalidate();
		return () => gs.forEach((g) => g?.dispose());
	});

	$effect(() => {
		equip.editObject = faceMesh ?? null;
		equip.viewport = viewport;
		return () => {
			if (equip.editObject === faceMesh) equip.editObject = null;
			if (equip.viewport === viewport) equip.viewport = null;
		};
	});

	$effect(() => {
		const vp = viewport;
		if (!vp) return;
		equip.sel;
		equip.editMode;
		equip.multi;
		equip.boxSelect;
		equip.gizmo;
		vp.multiSelect = equip.multi;
		vp.boxSelect = equip.boxSelect;
		if (vp.transformMode !== equip.gizmo) vp.setTransformMode(equip.gizmo);
		vp.setSelection(equip.packageSelection());
	});

	const ray = new Raycaster();
	const v = new Vector3();
	function screen(local: Vector3, rect: DOMRect) {
		v.copy(local).applyMatrix4(group!.matrixWorld).project(camera.current);
		return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, z: v.z };
	}
	function rayFace(px: number, py: number, rect: DOMRect): number | null {
		if (!faceMesh || !faces) return null;
		ray.setFromCamera(new Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1), camera.current);
		const hit = ray.intersectObject(faceMesh, false)[0];
		return hit && hit.faceIndex != null ? (faces.triFace[hit.faceIndex] ?? null) : null;
	}
	$effect(() => {
		const el = renderer.domElement;
		const move = (e: PointerEvent) => {
			if (e.pointerType !== 'mouse' || mode !== 'face' || !group) return;
			const r = el.getBoundingClientRect();
			const h = rayFace(e.clientX - r.left, e.clientY - r.top, r);
			if (h !== hover) hover = h;
		};
		el.addEventListener('pointermove', move);
		return () => el.removeEventListener('pointermove', move);
	});

	$effect(() => {
		(window as unknown as { __designerEdit: unknown }).__designerEdit = {
			vertexScreen: (i: number) => {
				const m = equip.workMesh;
				if (!m || !group) return null;
				group.updateMatrixWorld(true);
				const r = renderer.domElement.getBoundingClientRect();
				const s = screen(new Vector3(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]), r);
				return { x: r.left + s.x, y: r.top + s.y };
			},
			faceScreen: (fi: number) => {
				const m = equip.workMesh;
				if (!m || !group || !m.f[fi]) return null;
				group.updateMatrixWorld(true);
				const r = renderer.domElement.getBoundingClientRect();
				const s = screen(faceCentroid(m, m.f[fi]), r);
				return { x: r.left + s.x, y: r.top + s.y };
			}
		};
	});
</script>

<MeshEditor options={editorOptions} bind:viewport />

<T.Group bind:ref={group} position={part.pos} rotation={[part.rot[0] * D, part.rot[1] * D, part.rot[2] * D]} name="edit-overlay">
	{#if faces}
		<T.Mesh bind:ref={faceMesh} geometry={faces.geo} material={faceMatList} castShadow receiveShadow name="edit-mesh" />
	{/if}
	{#if hovGeo}<T.Mesh geometry={hovGeo} material={hovMat} renderOrder={3} raycast={() => null} />{/if}
</T.Group>
