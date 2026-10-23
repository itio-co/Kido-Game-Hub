/**
 * Equipment library store: built-in definitions (read-only, parts extracted from the procedural
 * models on first use) + the user's custom designs (localStorage + save files).
 */
import { CATALOG, CATALOG_BY_ID, isBuiltin, setCustomLookup } from './catalog';
import { EQUIP_FORMAT, EQUIP_VERSION, fitFootprint, mirrorPart, sanitizeEquip, toModuleDef, uidPart, type EquipDef, type EquipPart } from './equipment';
import type { ModuleDef } from './types';
import { bevelEdges, cloneMesh, deleteEdges, deleteFaces, deleteVerts, edgesOf, emptySel, extrudeFaces, flipFaces, insetFaces, meshBounds, mergeVerts, primitiveToMesh, recalcNormals, selVerts, setFaceMat, vcount, type CompMode, type CompSel, type EditMesh } from './editMesh';
import type { MatName } from '$lib/three/materials';

const KEY = 'starship-equipment-v1';

class EquipStore {
	custom = $state<EquipDef[]>([]);
	/** extracted parts of built-ins (filled lazily by the designer scene) */
	builtinParts = $state<Record<string, EquipPart[]>>({});
	selectedId = $state<string>('couch');
	// ---- designer UI state ----
	partId = $state<string | null>(null);
	/** designer: preview openness of parts marked as door (0 closed … 1 open) */
	doorPreview = $state(0);
	/** designer: affordance whose use points are shown as ghost avatars, and the selected use point */
	slotSel = $state<{ aff: number; slot: number }>({ aff: 0, slot: -1 });
	/** pose shown and edited: deployed (main) or stowed */
	pose = $state<'deployed' | 'stowed'>('deployed');
	/** designer: show a seated 1.75 m occupant in couches (deployed pose) */
	occupant = $state(true);
	/** designer camera preset request (bumped id re-applies the same preset) */
	view = $state<{ name: 'iso' | 'side' | 'front' | 'top'; id: number }>({ name: 'iso', id: 0 });
	setView(name: 'iso' | 'side' | 'front' | 'top') {
		this.view = { name, id: this.view.id + 1 };
	}
	gizmo = $state<'translate' | 'rotate' | 'scale'>('translate');
	// ---- component (sub-object) editing ----
	editMode = $state<'object' | CompMode>('object');
	/** last component mode (Tab returns to it) */
	lastComp = $state<CompMode>('vertex');
	sel = $state<CompSel>(emptySel());
	/** mobile: taps toggle instead of replacing the selection */
	multi = $state(false);
	/** plain drag = box select (orbit with right / two fingers) */
	boxSelect = $state(false);
	/** component move snap (m) */
	snap = $state<0.01 | 0.05>(0.01);
	/** set by the designer scene: export the current equipment as GLB (returns bytes) */
	exportGLB: (() => Promise<number>) | null = null;
	undoStack: string[] = [];
	redoStack: string[] = [];
	undoN = $state(0);
	get selCount() {
		return this.editMode === 'vertex' ? this.sel.v.length : this.editMode === 'edge' ? this.sel.e.length : this.editMode === 'face' ? this.sel.f.length : 0;
	}
	/** the selected part's editable mesh (its primitive's mesh until the first edit) */
	get workMesh(): EditMesh | null {
		const p = this.part;
		if (!p || p.shape === 'glb') return null;
		return p.shape === 'mesh' && p.mesh ? p.mesh : primitiveToMesh(p.shape, p.size);
	}
	setEditMode(m: 'object' | CompMode) {
		const p = this.part;
		if (m !== 'object' && (!this.editable || !p || p.shape === 'glb')) return false;
		if (m !== 'object') {
			this.lastComp = m;
			this.pose = 'deployed';
		}
		if (m !== this.editMode) this.sel = emptySel();
		this.editMode = m;
		return true;
	}
	private snapshot() {
		return JSON.stringify(this.selected?.parts ?? []);
	}
	pushUndo() {
		this.undoStack.push(this.snapshot());
		if (this.undoStack.length > 60) this.undoStack.shift();
		this.redoStack = [];
		this.undoN++;
	}
	private restore(json: string) {
		this.update(this.selectedId, (e) => (e.parts = JSON.parse(json)));
		this.sel = emptySel();
		this.undoN++;
	}
	undo() {
		const s = this.undoStack.pop();
		if (!s || !this.editable) return false;
		this.redoStack.push(this.snapshot());
		this.restore(s);
		return true;
	}
	redo() {
		const s = this.redoStack.pop();
		if (!s || !this.editable) return false;
		this.undoStack.push(this.snapshot());
		this.restore(s);
		return true;
	}
	/** write a new mesh to the selected part (converts a primitive on first edit); live = no undo / persist */
	setMesh(m: EditMesh, opts: { undo?: boolean; live?: boolean } = {}) {
		const pid = this.partId;
		if (!pid || !this.editable) return;
		if (opts.undo !== false && !opts.live) this.pushUndo();
		const e = this.custom.find((x) => x.id === this.selectedId);
		const p = e?.parts.find((x) => x.id === pid);
		if (!e || !p || p.shape === 'glb') return;
		const wasSize = p.size;
		const ratio = p.stowed?.size ? [p.stowed.size[0] / wasSize[0], p.stowed.size[1] / wasSize[1], p.stowed.size[2] / wasSize[2]] : null;
		p.shape = 'mesh';
		p.mesh = m;
		p.size = meshBounds(m).size;
		if (ratio && p.stowed) p.stowed.size = [p.size[0] * ratio[0], p.size[1] * ratio[1], p.size[2] * ratio[2]];
		if (opts.live) return;
		if (e.autoFit) Object.assign(e, fitFootprint(e));
		this.persist();
	}
	/** component operation by name; returns a short message for the toast */
	op(name: 'extrude' | 'inset' | 'delete' | 'bevel' | 'merge' | 'all' | 'flip' | 'recalc' | 'shade'): string {
		const m = this.workMesh;
		const mode = this.editMode;
		if (m && name === 'recalc') {
			this.setMesh(recalcNormals(m));
			return 'Normals recalculated (consistent, pointing outwards)';
		}
		if (m && name === 'shade') {
			const out = cloneMesh(m);
			if (m.sm) delete out.sm;
			else out.sm = true;
			this.setMesh(out);
			return out.sm ? 'Smooth shading' : 'Flat shading';
		}
		if (!m || mode === 'object') return 'Enter Vertex / Edge / Face mode first (Tab)';
		if (name === 'flip') {
			if (mode !== 'face') return 'Flip works on faces (Face mode, 4)';
			if (!this.sel.f.length) return 'Select faces first';
			this.setMesh(flipFaces(m, this.sel.f));
			return `Flipped ${this.sel.f.length} face normal(s)`;
		}
		if (name === 'all') {
			const any = this.selCount > 0;
			this.sel =
				mode === 'vertex' ? { ...emptySel(), v: any ? [] : [...Array(vcount(m)).keys()] } : mode === 'edge' ? { ...emptySel(), e: any ? [] : [...edgesOf(m).keys()] } : { ...emptySel(), f: any ? [] : [...m.f.keys()] };
			return any ? 'Selection cleared' : 'All selected';
		}
		if (!this.selCount) return 'Select components first';
		if (name === 'extrude') {
			if (mode !== 'face') return 'Extrude works on faces (Face mode, 4)';
			const r = extrudeFaces(m, this.sel.f, 0.05);
			this.setMesh(r.mesh);
			this.sel = { ...emptySel(), f: r.faces };
			return `Extruded ${r.faces.length} face(s) 5 cm – move them with the gizmo`;
		}
		if (name === 'inset') {
			if (mode !== 'face') return 'Inset works on faces (Face mode, 4)';
			const r = insetFaces(m, this.sel.f);
			this.setMesh(r.mesh);
			this.sel = { ...emptySel(), f: r.faces };
			return `Inset ${r.faces.length} face(s)`;
		}
		if (name === 'bevel') {
			if (mode !== 'edge') return 'Bevel works on edges (Edge mode, 3)';
			const n = this.sel.e.length;
			this.setMesh(bevelEdges(m, this.sel.e, 0.02));
			this.sel = emptySel();
			return `Chamfered ${n} edge(s) 2 cm`;
		}
		if (name === 'merge') {
			const v = selVerts(m, mode, this.sel);
			if (v.length < 2) return 'Select 2+ vertices to merge';
			this.setMesh(mergeVerts(m, v));
			this.sel = emptySel();
			return `Merged ${v.length} vertices`;
		}
		const out = mode === 'vertex' ? deleteVerts(m, this.sel.v) : mode === 'edge' ? deleteEdges(m, this.sel.e) : deleteFaces(m, this.sel.f);
		if (!out.f.length) return 'Cannot delete every face – delete the part instead';
		this.setMesh(out);
		this.sel = emptySel();
		return 'Deleted';
	}
	/** per-face material for the selected faces (null = part material) */
	setFaceMaterial(mat: MatName | null): string {
		const m = this.workMesh;
		if (!m || this.editMode !== 'face' || !this.sel.f.length) return 'Select faces first (Face mode, 4)';
		this.setMesh(setFaceMat(m, this.sel.f, mat));
		return `${this.sel.f.length} face(s) → ${mat ?? 'part material'}`;
	}
	modules = $derived(Object.fromEntries(this.custom.map((e) => [e.id, toModuleDef(e)])) as Record<string, ModuleDef>);

	constructor() {
		setCustomLookup((id) => this.modules[id]);
		if (typeof localStorage !== 'undefined') {
			try {
				const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
				if (Array.isArray(raw)) this.custom = raw.map(sanitizeEquip).filter((e): e is EquipDef => !!e);
			} catch {
				/* ignore corrupt library */
			}
		}
	}
	persist() {
		try {
			localStorage.setItem(KEY, JSON.stringify(this.custom));
		} catch {
			/* quota (large GLB parts) – keep in memory */
		}
	}
	get(id: string): EquipDef | null {
		const c = this.custom.find((e) => e.id === id);
		if (c) return c;
		const b = CATALOG.find((m) => m.id === id);
		if (!b) return null;
		return {
			id: b.id,
			name: b.name,
			icon: b.icon,
			category: b.category ?? 'Built-in',
			description: b.description,
			w: b.w,
			d: b.d,
			height: b.height,
			access: b.access,
			mass: b.mass,
			power: b.power,
			cost: b.cost,
			seats: b.seats,
			affords: b.affords ? JSON.parse(JSON.stringify(b.affords)) : undefined,
			stowable: b.stowable,
			estimate: b.estimate,
			launch: b.launch,
			stowPhase: b.id.startsWith('couch') || b.id === 'pilotcouch' ? 'surface' : 'launch',
			parts: this.builtinParts[b.id] ?? [],
			builtin: true,
			autoFit: false
		};
	}
	get selected() {
		return this.get(this.selectedId);
	}
	get editable() {
		return !!this.custom.find((e) => e.id === this.selectedId);
	}
	get part() {
		return this.selected?.parts.find((p) => p.id === this.partId) ?? null;
	}
	select(id: string) {
		this.selectedId = id;
		this.partId = null;
		this.editMode = 'object';
		this.sel = emptySel();
		this.undoStack = [];
		this.redoStack = [];
		this.undoN++;
	}
	/** write a pose change to the selected part (deployed or stowed pose) */
	setPose(partId: string, ch: { pos?: [number, number, number]; rot?: [number, number, number]; size?: [number, number, number] }) {
		this.update(this.selectedId, (e) => {
			const p = e.parts.find((x) => x.id === partId);
			if (!p) return;
			if (this.pose === 'stowed') {
				const st = p.stowed ?? { pos: [...p.pos] as [number, number, number], rot: [...p.rot] as [number, number, number] };
				if (ch.pos) st.pos = ch.pos;
				if (ch.rot) st.rot = ch.rot;
				if (ch.size) st.size = ch.size;
				p.stowed = st;
			} else {
				if (ch.pos) p.pos = ch.pos;
				if (ch.rot) p.rot = ch.rot;
				if (ch.size && p.shape === 'mesh' && p.mesh) {
					const k = [ch.size[0] / p.size[0], ch.size[1] / p.size[1], ch.size[2] / p.size[2]];
					p.mesh = { ...p.mesh, v: p.mesh.v.map((x, i) => Math.round(x * k[i % 3] * 1e5) / 1e5) };
					p.size = meshBounds(p.mesh).size;
				} else if (ch.size) p.size = ch.size;
			}
		});
	}
	addPart(shape: EquipPart['shape'], extra: Partial<EquipPart> = {}) {
		const id = uidPart();
		this.update(this.selectedId, (e) =>
			e.parts.push({ id, name: `${shape} ${e.parts.length + 1}`, shape, pos: [0, 0.25, 0], rot: [0, 0, 0], size: shape === 'plane' ? [0.4, 0.3, 1] : [0.3, 0.3, 0.3], m: 'grey', ...extra })
		);
		this.partId = id;
	}
	duplicatePart(pid: string, mirror = false) {
		const src = this.selected?.parts.find((p) => p.id === pid);
		if (!src) return;
		const copy: EquipPart = mirror ? mirrorPart(JSON.parse(JSON.stringify(src))) : { ...JSON.parse(JSON.stringify(src)), id: uidPart(), name: src.name + ' copy' };
		if (!mirror) copy.pos = [copy.pos[0] + 0.05, copy.pos[1], copy.pos[2] + 0.05];
		this.update(this.selectedId, (e) => e.parts.push(copy));
		this.partId = copy.id;
	}
	deletePart(pid: string) {
		this.update(this.selectedId, (e) => (e.parts = e.parts.filter((p) => p.id !== pid)));
		this.partId = null;
	}
	/** every definition for the library list */
	get library() {
		return [...CATALOG.map((b) => ({ id: b.id, name: b.name, icon: b.icon, builtin: true })), ...this.custom.map((c) => ({ id: c.id, name: c.name, icon: c.icon, builtin: false }))];
	}
	duplicate(id: string): string | null {
		const src = this.get(id);
		if (!src || (src.builtin && !src.parts.length)) return null;
		const copy: EquipDef = JSON.parse(JSON.stringify({ ...src, builtin: undefined }));
		copy.id = `custom:${(src.base ?? src.id).replace(/^custom:/, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 20)}-${uidPart()}`;
		copy.name = `${src.name} (copy)`;
		copy.base = src.builtin ? src.id : src.base;
		copy.autoFit = src.builtin ? false : src.autoFit;
		copy.parts = copy.parts.map((p) => ({ ...p, id: uidPart() }));
		this.custom.push(copy);
		this.selectedId = copy.id;
		this.persist();
		return copy.id;
	}
	create(): string {
		const e: EquipDef = {
			id: `custom:new-${uidPart()}`,
			name: 'New equipment',
			icon: '🧩',
			category: 'Custom',
			description: '',
			w: 0.6,
			d: 0.6,
			height: 0.8,
			access: 0.6,
			mass: 30,
			power: 0,
			cost: 1000,
			estimate: true,
			autoFit: true,
			parts: [{ id: uidPart(), name: 'body', shape: 'rbox', pos: [0, 0.4, 0], rot: [0, 0, 0], size: [0.6, 0.8, 0.6], m: 'white' }]
		};
		this.custom.push(e);
		this.selectedId = e.id;
		this.persist();
		return e.id;
	}
	/** edit a custom definition; footprint re-fitted when autoFit is on */
	update(id: string, fn: (e: EquipDef) => void) {
		const e = this.custom.find((x) => x.id === id);
		if (!e) return;
		fn(e);
		if (e.autoFit) Object.assign(e, fitFootprint(e));
		this.persist();
	}
	remove(id: string, inUse: boolean): string | null {
		if (inUse) return 'This equipment is placed on a deck – remove those instances first';
		this.custom = this.custom.filter((e) => e.id !== id);
		this.selectedId = 'couch';
		this.persist();
		return null;
	}
	exportJSON(id: string): string | null {
		const e = this.get(id);
		if (!e) return null;
		return JSON.stringify({ format: EQUIP_FORMAT, version: EQUIP_VERSION, equipment: [{ ...e, builtin: undefined }] }, null, 2);
	}
	/** import equipment JSON (single def, list, or {format, equipment: []}); returns number imported */
	importJSON(text: string): number {
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			return 0;
		}
		const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { equipment?: unknown[] }).equipment) ? (raw as { equipment: unknown[] }).equipment : [raw];
		return this.merge(list, true);
	}
	/** merge definitions from a save file / import (ids kept so placed modules resolve) */
	merge(list: unknown[], select = false): number {
		let n = 0;
		for (const r of list) {
			const e = sanitizeEquip(r);
			if (!e) continue;
			if (isBuiltin(e.id)) e.id = `custom:${e.id}-${uidPart()}`;
			const i = this.custom.findIndex((x) => x.id === e.id);
			if (i >= 0) this.custom[i] = e;
			else this.custom.push(e);
			if (select) this.selectedId = e.id;
			n++;
		}
		if (n) this.persist();
		return n;
	}
	/** custom definitions referenced by a layout (saved with it) */
	usedBy(types: string[]): EquipDef[] {
		const set = new Set(types);
		return this.custom.filter((e) => set.has(e.id));
	}
}

export const equip = new EquipStore();
void CATALOG_BY_ID;
