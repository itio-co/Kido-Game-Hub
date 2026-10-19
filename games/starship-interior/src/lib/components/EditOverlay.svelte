<script lang="ts">
	/**
	 * Blender-style component editing of the selected designer part: vertices (dots), edges (lines),
	 * faces (hover / selection highlight), click / Shift-click / box select (occlusion-aware), and a
	 * TransformControls gizmo that moves / rotates / scales the selection around its centroid.
	 */
	import { T, useThrelte } from '@threlte/core';
	import { TransformControls } from '@threlte/extras';
	import { BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Raycaster, Vector2, Vector3 } from 'three';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import { equip } from '$lib/game/equipStore.svelte';
	import { centroidOf, cloneMesh, edgesOf, eparse, faceCentroid, selVerts, toGeometry, transformVerts, vcount, type EditMesh } from '$lib/game/editMesh';
	import type { EquipPart } from '$lib/game/equipment';
	import { mat as libMat, type MatName } from '$lib/three/materials';
	import type { Material } from 'three';

	let { part, orbit }: { part: EquipPart; orbit?: OrbitControlsImpl } = $props();
	const { camera, renderer, invalidate } = useThrelte();
	const D = Math.PI / 180;
	const mode = $derived(equip.editMode as 'vertex' | 'edge' | 'face');
	const M = $derived(equip.workMesh);
	let group = $state<Group>();
	let pivot = $state<Group>();
	let faceMesh = $state<Mesh>();
	let hover = $state<number | null>(null);

	// ---------- render data ----------
	const faces = $derived(M ? toGeometry(M, part.m) : null);
	const editMat = new MeshStandardMaterial({ color: '#c3cedc', roughness: 0.7, metalness: 0.05, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
	// per-face materials show their real look (offset so edges / dots stay on top); the part material stays neutral grey-blue
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
	const selMat = new MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff7a1a', emissiveIntensity: 0.55, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
	const hovMat = new MeshStandardMaterial({ color: '#7cc4ff', emissive: '#2f8cff', emissiveIntensity: 0.4, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
	function subGeo(m: EditMesh, list: number[]) {
		const pos: number[] = [];
		for (const fi of list) {
			const f = m.f[fi];
			if (!f) continue;
			for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) pos.push(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]);
		}
		const g = new BufferGeometry();
		g.setAttribute('position', new Float32BufferAttribute(pos, 3));
		g.computeVertexNormals();
		return g;
	}
	const selFaceGeo = $derived(M && mode === 'face' && equip.sel.f.length ? subGeo(M, equip.sel.f) : null);
	const hovGeo = $derived(M && mode === 'face' && hover !== null ? subGeo(M, [hover]) : null);
	const edgeList = $derived(M ? [...edgesOf(M).keys()] : []);
	const lineGeo = $derived.by(() => {
		if (!M) return null;
		const sv = new Set(mode === 'vertex' ? equip.sel.v : mode === 'face' ? selVerts(M, 'face', equip.sel) : []);
		const se = new Set(equip.sel.e);
		const pos: number[] = [], col: number[] = [];
		for (const k of edgeList) {
			const [a, b] = eparse(k);
			const on = mode === 'edge' ? se.has(k) : sv.has(a) && sv.has(b);
			pos.push(M.v[3 * a], M.v[3 * a + 1], M.v[3 * a + 2], M.v[3 * b], M.v[3 * b + 1], M.v[3 * b + 2]);
			const c = on ? [1, 0.6, 0.15] : [0.08, 0.12, 0.18];
			col.push(...c, ...c);
		}
		const g = new BufferGeometry();
		g.setAttribute('position', new Float32BufferAttribute(pos, 3));
		g.setAttribute('color', new Float32BufferAttribute(col, 3));
		return g;
	});
	const pointGeo = $derived.by(() => {
		if (!M || mode !== 'vertex') return null;
		const s = new Set(equip.sel.v);
		const col: number[] = [];
		for (let i = 0; i < vcount(M); i++) col.push(...(s.has(i) ? [1, 0.55, 0.1] : [0.05, 0.07, 0.1]));
		const g = new BufferGeometry();
		g.setAttribute('position', new Float32BufferAttribute(M.v, 3));
		g.setAttribute('color', new Float32BufferAttribute(col, 3));
		return g;
	});
	$effect(() => {
		const gs = [faces?.geo, selFaceGeo, hovGeo, lineGeo, pointGeo];
		invalidate();
		return () => gs.forEach((g) => g?.dispose());
	});

	// ---------- gizmo on the selection centroid ----------
	const selIdx = $derived(M ? selVerts(M, mode, equip.sel) : []);
	const centroid = $derived(M && selIdx.length ? centroidOf(M, selIdx) : null);
	let dragging = false;
	let gizmoUsed = false;
	let base: EditMesh | null = null;
	let baseIdx: number[] = [];
	const start = new Vector3();
	$effect(() => {
		const c = centroid;
		const p = pivot;
		if (!p || !c || dragging) return;
		p.position.copy(c);
		p.rotation.set(0, 0, 0);
		p.scale.set(1, 1, 1);
		invalidate();
	});
	function gDown() {
		if (!M || !pivot) return;
		dragging = true;
		gizmoUsed = true;
		base = cloneMesh(M);
		baseIdx = selIdx.slice();
		start.copy(pivot.position);
		equip.pushUndo();
	}
	function gChange() {
		if (!dragging || !base || !pivot) return;
		const m = new Matrix4().compose(pivot.position, pivot.quaternion, pivot.scale).multiply(new Matrix4().makeTranslation(-start.x, -start.y, -start.z));
		equip.setMesh(transformVerts(base, baseIdx, m), { live: true });
	}
	function gUp() {
		if (!dragging) return;
		dragging = false;
		const m = equip.workMesh;
		if (m) equip.setMesh(m, { undo: false });
		base = null;
	}

	// ---------- picking ----------
	const ray = new Raycaster();
	const v = new Vector3();
	function screen(local: Vector3, rect: DOMRect) {
		v.copy(local).applyMatrix4(group!.matrixWorld).project(camera.current);
		return { x: ((v.x + 1) / 2) * rect.width, y: ((1 - v.y) / 2) * rect.height, z: v.z };
	}
	/** is a local point hidden behind the edited surface? */
	function occluded(local: Vector3) {
		if (!faceMesh || !group) return false;
		const w = local.clone().applyMatrix4(group.matrixWorld);
		const cam = camera.current.getWorldPosition(new Vector3());
		const dir = w.clone().sub(cam);
		const dist = dir.length();
		ray.set(cam, dir.normalize());
		const hit = ray.intersectObject(faceMesh, false)[0];
		return !!hit && hit.distance < dist - 0.004;
	}
	function rayFace(px: number, py: number, rect: DOMRect): number | null {
		if (!faceMesh || !faces) return null;
		ray.setFromCamera(new Vector2((px / rect.width) * 2 - 1, -(py / rect.height) * 2 + 1), camera.current);
		const hit = ray.intersectObject(faceMesh, false)[0];
		return hit && hit.faceIndex != null ? (faces.triFace[hit.faceIndex] ?? null) : null;
	}
	function segDist(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) {
		const dx = b.x - a.x, dy = b.y - a.y;
		const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / Math.max(1e-6, dx * dx + dy * dy)));
		return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
	}
	function pickAt(px: number, py: number, rect: DOMRect, touch: boolean): number | string | null {
		const m = equip.workMesh;
		if (!m || !group) return null;
		group.updateMatrixWorld(true);
		if (mode === 'face') return rayFace(px, py, rect);
		const R = touch ? 26 : 14;
		const cands: { id: number | string; d: number; z: number; local: Vector3 }[] = [];
		const p = new Vector3(), q = new Vector3();
		if (mode === 'vertex') {
			for (let i = 0; i < vcount(m); i++) {
				p.set(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]);
				const s = screen(p, rect);
				const d = Math.hypot(s.x - px, s.y - py);
				if (d <= R && s.z < 1) cands.push({ id: i, d, z: s.z, local: p.clone() });
			}
		} else {
			for (const k of edgesOf(m).keys()) {
				const [a, b] = eparse(k);
				p.set(m.v[3 * a], m.v[3 * a + 1], m.v[3 * a + 2]);
				q.set(m.v[3 * b], m.v[3 * b + 1], m.v[3 * b + 2]);
				const sa = screen(p, rect), sb = screen(q, rect);
				const d = segDist(px, py, sa, sb);
				if (d <= R * 0.7) cands.push({ id: k, d, z: (sa.z + sb.z) / 2, local: p.clone().add(q).multiplyScalar(0.5) });
			}
		}
		if (!cands.length) return null;
		const vis = cands.filter((c) => !occluded(c.local));
		const list = (vis.length ? vis : cands).sort((a, b) => a.d - b.d || a.z - b.z);
		const best = list.filter((c) => c.d <= list[0].d + 3).sort((a, b) => a.z - b.z)[0];
		return best.id;
	}
	function apply(ids: (number | string)[], toggle: boolean, additive: boolean) {
		const key = mode === 'vertex' ? 'v' : mode === 'edge' ? 'e' : 'f';
		let cur = additive || toggle ? [...(equip.sel[key] as (number | string)[])] : [];
		for (const id of ids) {
			const i = cur.indexOf(id);
			if (toggle && i >= 0) cur.splice(i, 1);
			else if (i < 0) cur.push(id);
		}
		equip.sel = { v: [], e: [], f: [], [key]: cur };
	}
	function boxPick(r: { x0: number; y0: number; x1: number; y1: number }, rect: DOMRect): (number | string)[] {
		const m = equip.workMesh;
		if (!m || !group) return [];
		group.updateMatrixWorld(true);
		const inside = (l: Vector3) => {
			const s = screen(l, rect);
			return s.z < 1 && s.x >= r.x0 && s.x <= r.x1 && s.y >= r.y0 && s.y <= r.y1 && !occluded(l);
		};
		const p = new Vector3();
		const vin = (i: number) => inside(p.set(m.v[3 * i], m.v[3 * i + 1], m.v[3 * i + 2]));
		if (mode === 'vertex') return [...Array(vcount(m)).keys()].filter(vin);
		if (mode === 'edge') return [...edgesOf(m).keys()].filter((k) => eparse(k).every(vin));
		return m.f.map((_, fi) => fi).filter((fi) => inside(faceCentroid(m, m.f[fi])));
	}

	$effect(() => {
		const el = renderer.domElement;
		let st: { x: number; y: number; id: number; box: boolean; add: boolean; touch: boolean } | null = null;
		let rectEl: HTMLDivElement | null = null;
		const local = (e: PointerEvent) => {
			const r = el.getBoundingClientRect();
			return { x: e.clientX - r.left, y: e.clientY - r.top, rect: r };
		};
		const down = (e: PointerEvent) => {
			if (!e.isPrimary) {
				st = null;
				rectEl?.remove();
				rectEl = null;
				if (orbit) orbit.enabled = true;
				return;
			}
			if (e.button !== 0) return;
			const { x, y } = local(e);
			const touch = e.pointerType === 'touch';
			gizmoUsed = false;
			// Shift+drag box-selects (adds); plain drag box-selects when the Box toggle is on
			st = { x, y, id: e.pointerId, box: equip.boxSelect || (e.shiftKey && !touch), add: e.shiftKey || equip.multi, touch };
			if (st.box && orbit) orbit.enabled = false;
		};
		const move = (e: PointerEvent) => {
			const { x, y, rect } = local(e);
			if (st && st.box && e.pointerId === st.id && Math.hypot(x - st.x, y - st.y) > 4 && !gizmoUsed) {
				if (!rectEl) {
					rectEl = document.createElement('div');
					rectEl.dataset.testid = 'box-select';
					rectEl.style.cssText = 'position:fixed;border:1px dashed #ffb35c;background:rgba(255,154,60,.12);pointer-events:none;z-index:30';
					document.body.appendChild(rectEl);
				}
				const x0 = Math.min(x, st.x), y0 = Math.min(y, st.y);
				rectEl.style.left = rect.left + x0 + 'px';
				rectEl.style.top = rect.top + y0 + 'px';
				rectEl.style.width = Math.abs(x - st.x) + 'px';
				rectEl.style.height = Math.abs(y - st.y) + 'px';
			} else if (!st && mode === 'face' && e.pointerType === 'mouse') {
				const h = rayFace(x, y, rect);
				if (h !== hover) hover = h;
			}
		};
		const up = (e: PointerEvent) => {
			if (!st || e.pointerId !== st.id) return;
			const { x, y, rect } = local(e);
			const moved = Math.hypot(x - st.x, y - st.y);
			if (!gizmoUsed) {
				if (st.box && moved > 4) {
					apply(boxPick({ x0: Math.min(x, st.x), y0: Math.min(y, st.y), x1: Math.max(x, st.x), y1: Math.max(y, st.y) }, rect), false, st.add);
				} else if (moved < 7) {
					const id = pickAt(x, y, rect, st.touch);
					if (id !== null) apply([id], st.add, st.add);
					else if (!st.add) equip.sel = { v: [], e: [], f: [] };
				}
			}
			rectEl?.remove();
			rectEl = null;
			if (orbit) orbit.enabled = true;
			st = null;
			invalidate();
		};
		el.addEventListener('pointerdown', down, true);
		window.addEventListener('pointermove', move, true);
		window.addEventListener('pointerup', up, true);
		return () => {
			el.removeEventListener('pointerdown', down, true);
			window.removeEventListener('pointermove', move, true);
			window.removeEventListener('pointerup', up, true);
			rectEl?.remove();
			if (orbit) orbit.enabled = true;
		};
	});
	// debug / test hook: screen position of a vertex / face centroid (CSS px, page coords)
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

<T.Group bind:ref={group} position={part.pos} rotation={[part.rot[0] * D, part.rot[1] * D, part.rot[2] * D]} name="edit-overlay">
	{#if faces}
		<T.Mesh bind:ref={faceMesh} geometry={faces.geo} material={faceMatList} castShadow receiveShadow name="edit-mesh" />
	{/if}
	{#if selFaceGeo}<T.Mesh geometry={selFaceGeo} material={selMat} renderOrder={2} raycast={() => null} />{/if}
	{#if hovGeo}<T.Mesh geometry={hovGeo} material={hovMat} renderOrder={3} raycast={() => null} />{/if}
	{#if lineGeo}
		<T.LineSegments geometry={lineGeo} renderOrder={4} raycast={() => null}>
			<T.LineBasicMaterial vertexColors transparent opacity={0.95} />
		</T.LineSegments>
	{/if}
	{#if pointGeo}
		<T.Points geometry={pointGeo} renderOrder={5} raycast={() => null}>
			<T.PointsMaterial vertexColors size={9} sizeAttenuation={false} />
		</T.Points>
	{/if}
	<T.Group bind:ref={pivot} />
</T.Group>
{#if pivot && centroid}
	<TransformControls object={pivot} mode={equip.gizmo} translationSnap={equip.snap} rotationSnap={5 * D} scaleSnap={0.01} size={0.7} onmouseDown={gDown} onobjectChange={gChange} onmouseUp={gUp} />
{/if}
