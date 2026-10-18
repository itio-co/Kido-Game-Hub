/**
 * Equipment library store: built-in definitions (read-only, parts extracted from the procedural
 * models on first use) + the user's custom designs (localStorage + save files).
 */
import { CATALOG, CATALOG_BY_ID, isBuiltin, setCustomLookup } from './catalog';
import { EQUIP_FORMAT, EQUIP_VERSION, fitFootprint, mirrorPart, sanitizeEquip, toModuleDef, uidPart, type EquipDef, type EquipPart } from './equipment';
import type { ModuleDef } from './types';

const KEY = 'starship-equipment-v1';

class EquipStore {
	custom = $state<EquipDef[]>([]);
	/** extracted parts of built-ins (filled lazily by the designer scene) */
	builtinParts = $state<Record<string, EquipPart[]>>({});
	selectedId = $state<string>('couch');
	// ---- designer UI state ----
	partId = $state<string | null>(null);
	/** pose shown and edited: deployed (main) or stowed */
	pose = $state<'deployed' | 'stowed'>('deployed');
	gizmo = $state<'translate' | 'rotate' | 'scale'>('translate');
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
				if (ch.size) p.size = ch.size;
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
