/**
 * Sims-like crew simulation: needs, utility-AI action selection with free will, schedules,
 * equipment reservation + queues, multi-deck navigation (ladders, one climber at a time),
 * local avoidance, launch strap-in, possession, and layout analytics.
 *
 * Hot state (positions, needs) lives in plain objects; a small $state snapshot is refreshed
 * ~4×/s for the UI. Time: at 1× one real second = one sim minute (walking stays visual-speed).
 */
import { CATALOG_BY_ID } from '$lib/game/catalog';
import { DECAY, NEEDS, NEED_IDS, SLEEP_DECAY, defaultSlots, seatOffsets, type Affordance, type NeedId, type Slot } from '$lib/game/affordances';
import { PHASE, localToWorld } from '$lib/game/geometry';
import { couchOccupant } from '$lib/game/couchModel';
import { game } from '$lib/game/state.svelte';
import type { ModuleDef, PlacedModule } from '$lib/game/types';
import { couchFrame, type AvatarState, type PoseName } from './avatarPose';
import { buildLegs, buildNav, portalCosts, travelCost, type Leg, type NavWorld } from './nav';

export type Role = 'Commander' | 'Pilot' | 'Engineer' | 'Scientist' | 'Medic' | 'Specialist';
export const ROLES: Role[] = ['Commander', 'Pilot', 'Engineer', 'Scientist', 'Medic', 'Specialist'];
const COLORS = ['#3f7fd6', '#e0703a', '#3fae6a', '#b04fc4', '#d9b632', '#38b8c4', '#d64f6f', '#7d8a2e', '#8a5a3c', '#5a63d6', '#c47a9e', '#4f9e8a'];
export interface CrewMember {
	name: string;
	role: Role;
	color: string;
}
export interface SimSettings {
	sleepStart: number;
	sleepEnd: number;
	workStart: number;
	workEnd: number;
	gravity: 'auto' | 'earth' | 'mars' | 'moon';
}
export const SPEEDS = [1, 4, 16, 60];
const DEG = Math.PI / 180;
const MAX_AGENTS = 24;
const COUCH = couchFrame(couchOccupant());

interface ItemSlot {
	x: number;
	z: number;
	y: number;
	yaw: number;
	ax: number;
	az: number;
	cell: number;
	occ: number | null;
}
interface Item {
	key: string;
	deck: number;
	uid: number;
	def: ModuleDef;
	label: string;
	affords: Affordance[];
	slots: ItemSlot[];
	queue: number[];
	seats: ItemSlot[];
	// analytics
	busy: number;
	uses: number;
	waitMin: number;
	waits: number;
	maxQueue: number;
	reachable: boolean;
}
type AgentState = 'idle' | 'move' | 'queue' | 'use' | 'ladder' | 'strapped' | 'noseat';
interface Agent {
	id: number;
	needs: Record<NeedId, number>;
	pers: Record<NeedId, number>;
	deck: number;
	x: number;
	z: number;
	y: number;
	yaw: number;
	state: AgentState;
	legs: Leg[];
	leg: number;
	pt: number;
	climb: number; // 0..1 progress (climb leg)
	climbPhase: 0 | 1 | 2; // 0 approach ladder, 1 on ladder, 2 step off
	item: Item | null;
	aff: Affordance | null;
	slot: number;
	useLeft: number;
	idleLeft: number;
	action: string;
	queuedAt: number;
	dock: number; // 0..1 docking interpolation
	dockFrom: [number, number];
	av: AvatarState;
	hidden: boolean;
	stuck: number;
	lastUnmet: Partial<Record<NeedId, number>>;
	possessed: boolean;
	waitingLadder: number;
}
export interface AgentUI {
	id: number;
	name: string;
	role: Role;
	color: string;
	needs: Record<NeedId, number>;
	action: string;
	where: string;
	mood: number;
	moodLabel: string;
	queue: string;
	state: AgentState;
	deck: number;
}
export interface LogEntry {
	t: number;
	text: string;
}

const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export function fmtClock(min: number) {
	const day = Math.floor(min / 1440) + 1;
	const m = Math.floor(min % 1440);
	return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const inWindow = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);

class CrewSim {
	enabled = $state(false);
	running = $state(true);
	speed = $state(4);
	heatmap = $state(false);
	roster = $state<CrewMember[]>([]);
	settings = $state<SimSettings>({ sleepStart: 22, sleepEnd: 6, workStart: 8, workEnd: 17, gravity: 'auto' });
	ui = $state<{ clock: number; agents: AgentUI[]; log: LogEntry[]; prompt: string | null; heatVersion: number }>({ clock: 7 * 60, agents: [], log: [], prompt: null, heatVersion: 0 });
	selected = $state<number | null>(null);
	possessed = $state<number | null>(null);
	firstPerson = $state(false);
	/** possession input (set by PossessControls / joystick) */
	input = { f: 0, s: 0, yaw: 0, run: false };

	agents: Agent[] = [];
	items: Item[] = [];
	world: NavWorld | null = null;
	navKey = '';
	clock = 7 * 60;
	elapsed = 0;
	ladderBusy = new Map<number, number>();
	ladderStats = new Map<number, { uses: number; waitMin: number }>();
	critical: Record<NeedId, number> = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
	unmet: Record<NeedId, number> = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
	heat: Float32Array[] = [];
	congestion: Float32Array[] = [];
	heatCell = 0.25;
	private uiTimer = 0;
	private navTimer = 0;
	private lastPhase = 'surface';

	get g() {
		const s = this.settings.gravity;
		const loc = s === 'auto' ? (game.shipMode === 'habitat' ? game.hab.location : 'earth') : s;
		return loc === 'moon' ? 1.62 / 9.81 : loc === 'mars' ? 3.71 / 9.81 : 1;
	}

	// ---------- roster ----------
	syncRoster() {
		const n = Math.min(MAX_AGENTS, Math.max(1, game.crew));
		const r = [...this.roster];
		while (r.length < n) r.push({ name: `Crew ${r.length + 1}`, role: ROLES[r.length % ROLES.length], color: COLORS[r.length % COLORS.length] });
		if (r.length > n) r.length = n;
		this.roster = r;
	}
	toJSON() {
		return { roster: $state.snapshot(this.roster), settings: $state.snapshot(this.settings) };
	}
	load(d: unknown) {
		if (!d || typeof d !== 'object') return;
		const o = d as { roster?: unknown; settings?: unknown };
		if (Array.isArray(o.roster))
			this.roster = o.roster.slice(0, MAX_AGENTS).map((m, i) => {
				const r = (m ?? {}) as Record<string, unknown>;
				return {
					name: String(r.name ?? `Crew ${i + 1}`).slice(0, 24),
					role: ROLES.includes(r.role as Role) ? (r.role as Role) : ROLES[i % ROLES.length],
					color: typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : COLORS[i % COLORS.length]
				};
			});
		if (o.settings && typeof o.settings === 'object') {
			const s = o.settings as Record<string, unknown>;
			const h = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v < 24 ? Math.floor(v) : d);
			this.settings = {
				sleepStart: h(s.sleepStart, 22),
				sleepEnd: h(s.sleepEnd, 6),
				workStart: h(s.workStart, 8),
				workEnd: h(s.workEnd, 17),
				gravity: ['auto', 'earth', 'mars', 'moon'].includes(s.gravity as string) ? (s.gravity as SimSettings['gravity']) : 'auto'
			};
		}
		if (this.enabled) this.reset();
	}

	// ---------- lifecycle ----------
	start() {
		this.syncRoster();
		this.enabled = true;
		this.running = true;
		this.reset();
		this.log(`Crew sim started: ${this.agents.length} crew, ${game.shipMode === 'habitat' ? 'Surface Habitat' : 'Cabin'} mode`);
	}
	stop() {
		this.enabled = false;
		this.possessed = null;
		this.selected = null;
		this.agents = [];
		this.ui.agents = [];
	}
	reset() {
		this.navKey = '';
		this.rebuild(true);
		this.clock = 7 * 60;
		this.elapsed = 0;
		this.ladderBusy.clear();
		this.ladderStats.clear();
		for (const n of NEED_IDS) (this.critical[n] = 0), (this.unmet[n] = 0);
		this.agents = this.roster.map((_, i) => this.spawn(i));
		this.ui.log = [];
		this.refreshUI();
	}
	private spawn(i: number): Agent {
		const w = this.world!;
		// spread over decks (prefer the airlock deck), random free cell
		const deck = w.navs.length ? (i % w.navs.length + game.airlockDeck) % w.navs.length : 0;
		const nav = w.navs[deck];
		let x = 0, z = 0;
		for (let t = 0; t < 200; t++) {
			const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (nav.R - 0.5);
			if (nav.isFree(Math.cos(a) * r, Math.sin(a) * r)) {
				x = Math.cos(a) * r;
				z = Math.sin(a) * r;
				break;
			}
		}
		const needs = Object.fromEntries(NEED_IDS.map((n) => [n, rnd(45, 90)])) as Record<NeedId, number>;
		const pers = Object.fromEntries(NEED_IDS.map((n) => [n, rnd(0.8, 1.25)])) as Record<NeedId, number>;
		return {
			id: i, needs, pers, deck, x, z, y: 0, yaw: Math.random() * 6.28, state: 'idle', legs: [], leg: 0, pt: 0, climb: 0, climbPhase: 0,
			item: null, aff: null, slot: -1, useLeft: 0, idleLeft: rnd(0, 3), action: 'Looking around', queuedAt: 0, dock: 1, dockFrom: [x, z],
			av: { x, y: game.floorY[deck] ?? 0, z, yaw: 0, pose: 'stand', t: Math.random() * 10, visible: true, couch: COUCH, seatY: 0.46 },
			hidden: false, stuck: 0, lastUnmet: {}, possessed: false, waitingLadder: -1
		};
	}

	/** rebuild nav + equipment registry when the layout/phase changes (agents replan) */
	rebuild(force = false) {
		const key =
			game.phase + '|' + game.shipMode + '|' +
			game.decks.map((d, k) => `${game.deckRadius[k]?.toFixed(2)}:${d.modules.map((m) => `${m.type}${m.x.toFixed(2)}${m.z.toFixed(2)}${m.angle}`).join(',')}`).join('/') +
			'|' + game.shafts.map((s) => `${s.from}-${s.to}@${s.x.toFixed(2)},${s.z.toFixed(2)},${s.angle}`).join(',') +
			'|' + Object.keys(CATALOG_BY_ID).length;
		if (!force && key === this.navKey) return;
		this.navKey = key;
		const prevPhase = PHASE.v;
		PHASE.v = game.phase;
		const old = new Map(this.items.map((i) => [i.key, i]));
		this.world = buildNav(game.decks, game.shafts, (k) => game.deckRadius[k] ?? 4.5, (s) => game.shaftLength(s));
		this.items = [];
		game.decks.forEach((d, k) => {
			const nav = this.world!.navs[k];
			for (const m of d.modules) {
				const def = CATALOG_BY_ID[m.type];
				if (!def) continue;
				const affords = def.affords ?? [];
				const seats = def.seats && game.phase === 'launch' ? seatOffsets(def.seats).map((sx) => this.mkSlot(nav, m, def, [sx, 0, 0, 0], true)) : [];
				if (!affords.length && !seats.length) continue;
				const base = affords.reduce((a, b) => ((b.slots?.length ?? 0) > (a.slots?.length ?? 0) ? b : a), affords[0]);
				const raw: Slot[] = affords.length ? (base.slots ?? defaultSlots(base, def.w, def.d, def.height, def.seats ?? 1)) : [];
				const slots = raw.map((s) => this.mkSlot(nav, m, def, s, false));
				const key = `${k}:${m.uid}`;
				const o = old.get(key);
				this.items.push({
					key, deck: k, uid: m.uid, def, label: def.name, affords, slots, queue: [], seats,
					busy: o?.busy ?? 0, uses: o?.uses ?? 0, waitMin: o?.waitMin ?? 0, waits: o?.waits ?? 0, maxQueue: o?.maxQueue ?? 0,
					reachable: slots.some((s) => s.cell >= 0) || seats.some((s) => s.cell >= 0)
				});
			}
		});
		PHASE.v = prevPhase;
		// heat maps
		this.heat = game.decks.map((_, k) => {
			const M = Math.ceil((2 * (game.deckRadius[k] ?? 4.5)) / this.heatCell);
			return new Float32Array(M * M);
		});
		this.congestion = this.heat.map((h) => new Float32Array(h.length));
		// reachability from the entries (airlock deck / any portal): mark items unreachable from crew
		this.markReachability();
		// agents replan
		this.ladderBusy.clear();
		for (const a of this.agents) {
			if (a.deck >= game.decks.length || !this.world.navs[a.deck]?.isFree(a.x, a.z)) {
				const nav = this.world.navs[Math.min(a.deck, game.decks.length - 1)];
				a.deck = Math.min(a.deck, game.decks.length - 1);
				const c = nav.nearestFree(a.x, a.z, 3);
				if (c >= 0) [a.x, a.z] = nav.pt(c);
			}
			this.release(a, false);
			a.state = a.possessed ? 'idle' : 'idle';
			a.idleLeft = 0;
			a.y = 0;
		}
	}
	private mkSlot(nav: ReturnType<typeof buildNav>['navs'][number], m: PlacedModule, def: ModuleDef, s: Slot, seat: boolean): ItemSlot {
		const [x, z] = localToWorld(m.x, m.z, m.angle, s[0], s[1]);
		const d = seat && def.launch ? def.launch.d : def.d;
		const inside = Math.abs(s[1]) < d / 2 + 0.05;
		const alz = seat ? d / 2 + 0.3 : inside ? (s[1] < -0.05 ? -(d / 2 + 0.32) : d / 2 + 0.32) : s[1];
		const alx = seat ? s[0] : s[0];
		const [px, pz] = localToWorld(m.x, m.z, m.angle, alx, alz);
		let cell = nav.nearestFree(px, pz, 0.9);
		if (cell < 0) {
			const [fx, fz] = localToWorld(m.x, m.z, m.angle, 0, d / 2 + 0.35);
			cell = nav.nearestFree(fx, fz, 1.3);
		}
		const [ax, az] = cell >= 0 ? nav.pt(cell) : [px, pz];
		return { x, z, y: s[2], yaw: m.angle * DEG + s[3] * DEG, ax, az, cell, occ: null };
	}
	private markReachability() {
		const w = this.world!;
		// seeds: airlock deck centre-ish free cell + every portal end
		const seeds: { deck: number; cell: number }[] = [];
		const k0 = game.airlockDeck;
		const n0 = w.navs[k0];
		if (n0) {
			const c = n0.nearestFree(0, 0, n0.R);
			if (c >= 0) seeds.push({ deck: k0, cell: c });
		}
		for (const it of this.items) {
			if (!it.reachable) continue;
			const ok = [...it.slots, ...it.seats].some((s) => {
				if (s.cell < 0) return false;
				for (const sd of seeds) {
					const pc = portalCosts(w, sd.deck, sd.cell);
					if (isFinite(travelCost(w, pc, sd.deck, it.deck, s.cell).cost)) return true;
				}
				return false;
			});
			it.reachable = ok;
		}
	}

	// ---------- logging / UI ----------
	log(text: string) {
		const l = this.ui.log;
		l.unshift({ t: this.clock, text });
		if (l.length > 150) l.length = 150;
	}
	name(a: Agent | number) {
		const id = typeof a === 'number' ? a : a.id;
		return this.roster[id]?.name ?? `Crew ${id + 1}`;
	}
	where(deck: number) {
		return game.deckLabel(deck);
	}
	mood(a: Agent) {
		const v = NEED_IDS.reduce((s, n) => s + Math.min(a.needs[n], 100) * (n === 'bladder' || n === 'hunger' || n === 'energy' ? 1.4 : 1), 0) / (NEED_IDS.length + 1.2);
		const worst = Math.min(...NEED_IDS.map((n) => a.needs[n]));
		return clamp(v - (worst < 15 ? 15 : 0));
	}
	refreshUI() {
		this.ui.clock = this.clock;
		this.ui.agents = this.agents.map((a) => {
			const m = this.mood(a);
			const it = a.item;
			return {
				id: a.id, name: this.name(a), role: this.roster[a.id]?.role ?? 'Specialist', color: this.roster[a.id]?.color ?? '#888',
				needs: Object.fromEntries(NEED_IDS.map((n) => [n, Math.round(a.needs[n])])) as Record<NeedId, number>,
				action: a.possessed ? `🎮 ${a.action}` : a.action, where: this.where(a.deck), mood: Math.round(m),
				moodLabel: m > 70 ? '😀 Happy' : m > 50 ? '🙂 Fine' : m > 32 ? '😐 Tense' : '😣 Stressed',
				queue: a.state === 'queue' && it ? `#${it.queue.indexOf(a.id) + 1} of ${it.queue.length} for ${it.label}` : a.state === 'ladder' ? 'waiting for the ladder' : '',
				state: a.state, deck: a.deck
			};
		});
	}

	// ---------- main step ----------
	step(dtReal: number) {
		if (!this.enabled) return;
		dtReal = Math.min(dtReal, 0.1);
		this.navTimer -= dtReal;
		if (this.navTimer <= 0) {
			this.navTimer = 0.5;
			if (this.roster.length !== Math.min(MAX_AGENTS, game.crew)) {
				this.syncRoster();
				while (this.agents.length < this.roster.length) this.agents.push(this.spawn(this.agents.length));
				while (this.agents.length > this.roster.length) {
					const a = this.agents.pop()!;
					this.release(a, false);
					if (this.possessed === a.id) this.possessed = null;
				}
			}
			this.rebuild();
		}
		if (!this.world) return;
		const launch = game.phase === 'launch';
		if (launch !== (this.lastPhase === 'launch')) {
			this.lastPhase = game.phase;
			for (const a of this.agents) {
				this.release(a, false);
				a.state = 'idle';
				a.idleLeft = 0;
			}
			this.log(launch ? 'Launch/Landing: all crew to the couches and strap in' : 'Surface/Cruise: crew released from the couches');
		}
		const speed = this.running ? this.speed : 0;
		const simMin = dtReal * speed;
		if (speed > 0) {
			this.clock += simMin;
			this.elapsed += simMin;
		}
		// substeps keep fast-forward stable (walking distance per substep ≤ ~0.3 m)
		const sub = Math.max(1, Math.ceil(speed / 4));
		const h = dtReal / sub;
		for (let k = 0; k < sub; k++) for (const a of this.agents) this.updateAgent(a, h, (h * speed), launch);
		if (speed > 0 && speed <= 16) this.avoid(dtReal * Math.min(speed, 4));
		// possessed agent moves at real speed whatever the sim speed
		const p = this.possessed !== null ? this.agents[this.possessed] : null;
		if (p) this.updatePossessed(p, dtReal);
		for (const a of this.agents) this.syncAvatar(a, dtReal * Math.max(1, Math.min(speed, 4)));
		if (speed > 0) this.accumulate(simMin);
		this.uiTimer -= dtReal;
		if (this.uiTimer <= 0) {
			this.uiTimer = 0.25;
			this.refreshUI();
			this.ui.prompt = p ? this.promptFor(p) : null;
		}
	}

	private updateAgent(a: Agent, dt: number, simMin: number, launch: boolean) {
		if (simMin <= 0 && !a.possessed) return;
		// needs decay
		if (a.state !== 'strapped' && simMin > 0) {
			const sleeping = a.state === 'use' && a.aff?.pose === 'sleep';
			for (const n of NEED_IDS) {
				const d = sleeping ? (SLEEP_DECAY[n] ?? 0) : DECAY[n] * (n === 'comfort' && (a.state === 'move' || a.state === 'queue') ? 1.4 : 1);
				a.needs[n] = clamp(a.needs[n] - (d * simMin) / 60);
				if (a.needs[n] < 20) this.critical[n] += simMin;
			}
		}
		if (a.possessed) {
			if (a.state === 'use') this.updateUse(a, simMin);
			return;
		}
		switch (a.state) {
			case 'idle':
				a.idleLeft -= simMin;
				if (a.idleLeft <= 0) launch ? this.goStrapIn(a) : this.decide(a);
				break;
			case 'move':
			case 'ladder':
				this.updateMove(a, dt, simMin);
				break;
			case 'queue':
				if (a.item) a.item.waitMin += simMin;
				a.useLeft -= simMin; // re-think timer while queued
				if (a.useLeft <= 0) {
					a.useLeft = 20;
					if (a.item && a.item.queue[0] !== a.id && Math.random() < 0.3) {
						this.log(`${this.name(a)} gave up waiting for the ${a.item.label}`);
						this.release(a, false);
						a.state = 'idle';
						a.idleLeft = 0;
					}
				}
				break;
			case 'use':
				this.updateUse(a, simMin);
				break;
			case 'strapped':
				if (!launch) (a.state = 'idle'), (a.idleLeft = 0);
				break;
			case 'noseat':
				if (!launch) (a.state = 'idle'), (a.idleLeft = 0);
				break;
		}
	}

	private updateUse(a: Agent, simMin: number) {
		const it = a.item, af = a.aff;
		if (!it || !af) return (a.state = 'idle');
		if (a.dock < 1) return;
		a.useLeft -= simMin;
		let social = 0;
		if (af.social) for (const o of this.agents) if (o !== a && o.item === it && o.state === 'use' && o.aff?.social) social++;
		for (const [n, r] of Object.entries(af.needs) as [NeedId, number][]) a.needs[n] = clamp(a.needs[n] + (r * simMin) / 60);
		if (social) a.needs.fun = clamp(a.needs.fun + (22 * social * simMin) / 60);
		if (a.useLeft <= 0 || (af.until && a.needs[af.until] >= 97)) {
			this.finishUse(a);
		}
	}
	private finishUse(a: Agent) {
		this.release(a, true);
		a.state = 'idle';
		a.idleLeft = rnd(0.5, 3);
		a.action = 'Thinking';
	}

	/** free reservation / queue place; hand the slot to the next in the queue */
	release(a: Agent, finished: boolean) {
		const it = a.item;
		if (it) {
			const qi = it.queue.indexOf(a.id);
			if (qi >= 0) it.queue.splice(qi, 1);
			for (const s of [...it.slots, ...it.seats]) if (s.occ === a.id) s.occ = null;
			if (a.state === 'use' && a.slot >= 0) {
				// stand up at the approach point
				const s = (a.state === 'use' && a.aff ? it.slots : it.seats)[a.slot] ?? it.slots[a.slot];
				if (s) (a.x = s.ax), (a.z = s.az);
			}
			this.serveQueue(it);
		}
		if (a.waitingLadder >= 0) a.waitingLadder = -1;
		for (const [p, id] of this.ladderBusy) if (id === a.id) this.ladderBusy.delete(p);
		a.item = null;
		a.aff = null;
		a.slot = -1;
		a.hidden = false;
		a.y = 0;
		a.dock = 1;
		void finished;
	}
	private serveQueue(it: Item) {
		while (it.queue.length) {
			const free = it.slots.findIndex((s) => s.occ === null && s.cell >= 0);
			if (free < 0) return;
			const id = it.queue.shift()!;
			const b = this.agents[id];
			if (!b || b.item !== it) continue;
			it.waits++;
			it.slots[free].occ = b.id;
			b.slot = free;
			if (!this.routeTo(b, it.deck, it.slots[free].cell)) {
				this.release(b, false);
				b.state = 'idle';
				continue;
			}
			b.action = `Going to ${b.aff?.label ?? 'use'} (${it.label})`;
		}
	}

	// ---------- decisions ----------
	private decide(a: Agent) {
		const w = this.world!;
		const nav = w.navs[a.deck];
		const startCell = nav.nearestFree(a.x, a.z, 1.5);
		if (startCell < 0) return void (a.idleLeft = 5);
		const pc = portalCosts(w, a.deck, startCell);
		const hour = (this.clock % 1440) / 60;
		const st = this.settings;
		const sleepTime = inWindow(hour, st.sleepStart, st.sleepEnd);
		const workTime = inWindow(hour, st.workStart, st.workEnd);
		type Cand = { it: Item; af: Affordance; score: number; slot: number; via: number; cell: number };
		const cands: Cand[] = [];
		const helps: Partial<Record<NeedId, boolean>> = {};
		for (const it of this.items) {
			if (!it.reachable || !it.affords.length) continue;
			for (const af of it.affords) {
				// gain from the needs this affordance satisfies
				let gain = 0;
				for (const [n, r] of Object.entries(af.needs) as [NeedId, number][]) {
					const v = a.needs[n];
					if (r > 0) {
						const urg = Math.pow((100 - v) / 100, 2) * 3 + (v < 20 ? 5 : v < 35 ? 1.5 : 0);
						gain += a.pers[n] * urg * Math.min(100 - v, (r * af.minutes) / 60);
					} else gain += (r * af.minutes) / 60 * 0.6 * (a.needs[n] < 40 ? 2 : 0.3);
				}
				if (gain <= 0.5) continue;
				for (const n of Object.keys(af.needs) as NeedId[]) if ((af.needs[n] ?? 0) > 0) helps[n] = true;
				// schedule bias
				let bias = 1;
				if (af.pose === 'sleep') bias = sleepTime ? (a.needs.energy < 90 ? 3 : 0.6) : a.needs.energy < 25 ? 1 : 0.2;
				else if ((af.needs.work ?? 0) > 0) bias = workTime ? 1.8 : sleepTime ? 0.2 : 0.6;
				else if (sleepTime && a.needs.bladder > 25 && a.needs.hunger > 25) bias = 0.4;
				// best slot (free first; else queue)
				let bestSlot = -1, bestCost = Infinity, bestVia = -1, bestCell = -1;
				it.slots.forEach((s, i) => {
					if (s.cell < 0 || i >= (af.slots?.length ?? it.slots.length)) return;
					const tc = travelCost(w, pc, a.deck, it.deck, s.cell);
					const c = tc.cost + (s.occ === null ? 0 : 1000);
					if (c < bestCost) (bestCost = c), (bestSlot = i), (bestVia = tc.via), (bestCell = s.cell);
				});
				if (bestSlot < 0 || !isFinite(bestCost)) continue;
				let wait = 0;
				if (bestCost >= 1000) {
					bestCost -= 1000;
					const remaining = Math.min(...this.agents.filter((o) => o.item === it && o.state === 'use').map((o) => o.useLeft), af.minutes);
					wait = remaining + it.queue.length * af.minutes;
				}
				const urgent = Object.keys(af.needs).some((n) => a.needs[n as NeedId] < 20 && (af.needs[n as NeedId] ?? 0) > 0);
				const score = (gain * bias * rnd(0.85, 1.15)) / (1 + bestCost / 12 + wait / (urgent ? 60 : 12));
				cands.push({ it, af, score, slot: bestSlot, via: bestVia, cell: bestCell });
			}
		}
		// unmet critical needs (no reachable equipment helps)
		for (const n of NEED_IDS)
			if (a.needs[n] < 15 && !helps[n]) {
				this.unmet[n] += 1;
				const last = a.lastUnmet[n] ?? -1e9;
				if (this.clock - last > 240) {
					a.lastUnmet[n] = this.clock;
					this.log(`⚠ ${this.name(a)} has nowhere reachable for ${NEEDS.find((x) => x.id === n)!.label} (${this.where(a.deck)})`);
				}
			}
		cands.sort((p, q) => q.score - p.score);
		const top = cands.slice(0, 3).filter((c) => c.score > cands[0]?.score * 0.6);
		if (!top.length) return this.wander(a);
		// free will: weighted pick among the best options
		const tot = top.reduce((s, c) => s + c.score * c.score, 0);
		let r = Math.random() * tot;
		let pick = top[0];
		for (const c of top) if ((r -= c.score * c.score) <= 0) (pick = c), (r = Infinity);
		this.commit(a, pick.it, pick.af, pick.slot, startCell);
	}
	/** reserve (or queue) and route */
	commit(a: Agent, it: Item, af: Affordance, slot: number, startCell?: number) {
		a.item = it;
		a.aff = af;
		const s = it.slots[slot];
		if (s.occ === null) {
			s.occ = a.id;
			a.slot = slot;
			if (!this.routeTo(a, it.deck, s.cell, startCell)) {
				this.release(a, false);
				a.idleLeft = 5;
				return false;
			}
			a.action = `Going to ${af.label} (${it.label})`;
		} else {
			it.queue.push(a.id);
			it.maxQueue = Math.max(it.maxQueue, it.queue.length);
			a.slot = -1;
			a.queuedAt = this.clock;
			const qs = this.queueSpot(it, it.queue.length - 1);
			if (!this.routeTo(a, it.deck, qs, startCell)) {
				this.release(a, false);
				a.idleLeft = 5;
				return false;
			}
			a.action = `Waiting for the ${it.label}`;
			this.log(`${this.name(a)} is waiting for the ${it.label} (${this.where(it.deck)})`);
		}
		return true;
	}
	private queueSpot(it: Item, idx: number): number {
		const nav = this.world!.navs[it.deck];
		const s = it.slots.find((x) => x.cell >= 0)!;
		const m = game.decks[it.deck].modules.find((mm) => mm.uid === it.uid);
		const ang = (m?.angle ?? 0) * DEG;
		const dx = Math.sin(ang), dz = Math.cos(ang);
		const off = 0.75 + idx * 0.6;
		const c = nav.nearestFree(s.ax + dx * off, s.az + dz * off, 1.2);
		return c >= 0 ? c : s.cell;
	}
	private wander(a: Agent) {
		const nav = this.world!.navs[a.deck];
		for (let t = 0; t < 30; t++) {
			const ang = Math.random() * Math.PI * 2, r = rnd(0.5, 2.5);
			const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
			const c = nav.nearestFree(x, z, 0.3);
			if (c >= 0 && this.routeTo(a, a.deck, c)) {
				a.action = 'Stretching legs';
				a.item = null;
				return;
			}
		}
		a.idleLeft = rnd(5, 15);
		a.action = 'Relaxing';
	}
	private goStrapIn(a: Agent) {
		// nearest free couch seat (launch)
		const w = this.world!;
		const nav = w.navs[a.deck];
		const startCell = nav.nearestFree(a.x, a.z, 1.5);
		if (startCell < 0) return;
		const pc = portalCosts(w, a.deck, startCell);
		let best: { it: Item; i: number; cost: number } | null = null;
		for (const it of this.items)
			it.seats.forEach((s, i) => {
				if (s.occ !== null || s.cell < 0) return;
				const c = travelCost(w, pc, a.deck, it.deck, s.cell).cost;
				if (isFinite(c) && (!best || c < best.cost)) best = { it, i, cost: c };
			});
		if (!best) {
			if (a.state !== 'noseat') this.log(`⚠ ${this.name(a)} has no couch for launch/landing!`);
			a.state = 'noseat';
			a.action = '⚠ No couch available';
			return;
		}
		const b = best as { it: Item; i: number; cost: number };
		b.it.seats[b.i].occ = a.id;
		a.item = b.it;
		a.aff = null;
		a.slot = b.i;
		this.routeTo(a, b.it.deck, b.it.seats[b.i].cell, startCell);
		a.action = `To couch (${b.it.label})`;
	}

	/** compute legs to a target cell; state → move */
	private routeTo(a: Agent, deck: number, cell: number, startCell?: number): boolean {
		const w = this.world!;
		const sc = startCell ?? w.navs[a.deck].nearestFree(a.x, a.z, 1.5);
		if (sc < 0) return false;
		const pc = portalCosts(w, a.deck, sc);
		const tc = travelCost(w, pc, a.deck, deck, cell);
		if (!isFinite(tc.cost)) return false;
		const legs = buildLegs(w, pc, a.deck, sc, deck, cell, tc.via);
		if (!legs) return false;
		a.legs = legs;
		a.leg = 0;
		a.pt = 0;
		a.climb = 0;
		a.climbPhase = 0;
		a.state = 'move';
		a.stuck = 0;
		return true;
	}

	// ---------- movement ----------
	private walkSpeed() {
		return 1.25 * Math.pow(this.g, 0.12);
	}
	private updateMove(a: Agent, dt: number, simMin: number) {
		const speedMul = this.running ? this.speed : 0;
		let dist = this.walkSpeed() * dt * speedMul;
		const leg = a.legs[a.leg];
		if (!leg) return this.arrive(a);
		if (leg.kind === 'walk') {
			while (dist > 0 && a.pt < leg.pts.length) {
				const [tx, tz] = leg.pts[a.pt];
				const dx = tx - a.x, dz = tz - a.z;
				const d = Math.hypot(dx, dz);
				if (d < 1e-4) {
					a.pt++;
					continue;
				}
				a.yaw = Math.atan2(dx, dz);
				const s = Math.min(d, dist);
				a.x += (dx / d) * s;
				a.z += (dz / d) * s;
				dist -= s;
				if (s >= d - 1e-6) a.pt++;
			}
			if (a.pt >= leg.pts.length) {
				a.leg++;
				a.pt = 0;
				if (a.leg >= a.legs.length) this.arrive(a);
			}
			return;
		}
		// climb leg
		const p = this.world!.portals[leg.portal];
		if (!p) return this.arrive(a);
		const busy = this.ladderBusy.get(leg.portal);
		if (a.climbPhase === 0) {
			if (busy !== undefined && busy !== a.id) {
				if (a.state !== 'ladder') {
					a.state = 'ladder';
					a.queuedAt = this.clock;
					this.log(`${this.name(a)} is waiting for ladder ${game.shaftLabel(p.shaft)}`);
				}
				const st = this.ladderStats.get(leg.portal) ?? { uses: 0, waitMin: 0 };
				st.waitMin += simMin;
				this.ladderStats.set(leg.portal, st);
				return;
			}
			this.ladderBusy.set(leg.portal, a.id);
			const st = this.ladderStats.get(leg.portal) ?? { uses: 0, waitMin: 0 };
			st.uses++;
			this.ladderStats.set(leg.portal, st);
			a.state = 'move';
			a.climbPhase = 1;
			a.climb = 0;
			if (!leg.up) {
				// start at the top: switch to the lower deck coordinates with y = length
				a.deck = p.bottom.deck;
			}
			a.x = p.shaft.x + Math.sin(p.shaft.angle * DEG) * 0.28;
			a.z = p.shaft.z + Math.cos(p.shaft.angle * DEG) * 0.28;
			a.yaw = p.shaft.angle * DEG + Math.PI;
		}
		if (a.climbPhase === 1) {
			const v = 0.45 * Math.pow(this.g, 0.1) * dt * speedMul;
			a.climb = Math.min(1, a.climb + v / Math.max(0.5, p.length));
			a.y = (leg.up ? a.climb : 1 - a.climb) * p.length;
			if (a.climb >= 1) {
				const end = leg.up ? p.top : p.bottom;
				a.deck = end.deck;
				a.y = 0;
				a.x = end.x;
				a.z = end.z;
				this.ladderBusy.delete(leg.portal);
				a.leg++;
				a.pt = 0;
				a.climbPhase = 0;
				if (a.leg >= a.legs.length) this.arrive(a);
			}
		}
	}
	private arrive(a: Agent) {
		const it = a.item;
		if (!it) {
			a.state = 'idle';
			a.idleLeft = rnd(3, 12);
			a.action = 'Relaxing';
			return;
		}
		if (game.phase === 'launch' && !a.aff && it.seats[a.slot]?.occ === a.id) {
			a.state = 'strapped';
			a.action = `Strapped in (${it.label})`;
			a.dock = 0;
			a.dockFrom = [a.x, a.z];
			return;
		}
		if (a.slot < 0) {
			a.state = 'queue';
			a.useLeft = 20;
			a.yaw = Math.atan2((it.slots[0]?.ax ?? a.x) - a.x, (it.slots[0]?.az ?? a.z) - a.z);
			return;
		}
		const af = a.aff!;
		a.state = 'use';
		a.useLeft = af.minutes * rnd(0.85, 1.15);
		a.dock = 0;
		a.dockFrom = [a.x, a.z];
		it.uses++;
		if (a.queuedAt && it.waits) {
			/* waits counted when served */
		}
		a.action = `${af.label} (${it.label})`;
	}

	/** simple separation steering between walking agents on the same deck */
	private avoid(dt: number) {
		const w = this.world!;
		for (const a of this.agents) {
			if (a.state !== 'move' || a.climbPhase === 1 || a.possessed) continue;
			let px = 0, pz = 0, n = 0;
			for (const b of this.agents) {
				if (a === b || b.deck !== a.deck || b.hidden || b.state === 'use' || b.state === 'strapped' || b.climbPhase === 1) continue;
				const dx = a.x - b.x, dz = a.z - b.z;
				const d = Math.hypot(dx, dz);
				if (d < 0.6 && d > 1e-4) {
					px += (dx / d) * (0.6 - d);
					pz += (dz / d) * (0.6 - d);
					n++;
				}
			}
			if (!n) continue;
			const nav = w.navs[a.deck];
			const k = Math.min(1, dt * 4);
			const nx = a.x + px * k, nz = a.z + pz * k;
			if (nav.isFree(nx, nz)) (a.x = nx), (a.z = nz);
			const hc = this.heatIndex(a.deck, a.x, a.z);
			if (hc >= 0) this.congestion[a.deck][hc] += dt;
		}
	}

	// ---------- avatar sync ----------
	private syncAvatar(a: Agent, dtAnim: number) {
		const av = a.av;
		av.t += dtAnim;
		const fy = game.floorY[a.deck] ?? 0;
		let pose: PoseName = 'stand';
		let x = a.x, z = a.z, y = fy + a.y, yaw = a.yaw;
		a.hidden = false;
		const it = a.item;
		if (a.state === 'move') pose = a.climbPhase === 1 ? 'climb' : 'walk';
		else if (a.state === 'queue' || a.state === 'ladder' || a.state === 'noseat') pose = 'wait';
		else if ((a.state === 'use' || a.state === 'strapped') && it) {
			const s = a.state === 'strapped' ? it.seats[a.slot] : it.slots[a.slot];
			if (s) {
				a.dock = Math.min(1, a.dock + dtAnim * 1.8);
				const t = a.dock;
				x = a.dockFrom[0] + (s.x - a.dockFrom[0]) * t;
				z = a.dockFrom[1] + (s.z - a.dockFrom[1]) * t;
				y = fy + s.y * t;
				yaw = s.yaw;
				if (t >= 1) {
					pose = a.state === 'strapped' ? 'couch' : a.aff!.pose;
					a.hidden = a.state === 'use' && !!a.aff?.hidden;
				} else pose = 'walk';
				if (a.state === 'strapped') y = fy;
			}
		}
		if (a.possessed && a.state !== 'use' && a.state !== 'move') pose = this.input.f || this.input.s ? 'walk' : 'stand';
		av.x = x;
		av.z = z;
		av.y = y;
		av.yaw = yaw;
		av.pose = pose;
		av.seatY = 0;
		av.visible = !a.hidden && !(a.possessed && this.firstPerson);
	}

	// ---------- analytics ----------
	heatIndex(deck: number, x: number, z: number) {
		const R = game.deckRadius[deck] ?? 4.5;
		const M = Math.ceil((2 * R) / this.heatCell);
		const i = Math.floor((x + R) / this.heatCell), j = Math.floor((z + R) / this.heatCell);
		return i < 0 || j < 0 || i >= M || j >= M ? -1 : j * M + i;
	}
	private accumulate(simMin: number) {
		for (const a of this.agents) {
			if (a.hidden || a.climbPhase === 1) continue;
			const k = this.heatIndex(a.deck, a.av.x, a.av.z);
			if (k >= 0 && this.heat[a.deck]) this.heat[a.deck][k] += simMin;
		}
		for (const it of this.items) {
			const occ = it.slots.filter((s) => s.occ !== null && this.agents[s.occ]?.state === 'use').length;
			it.busy += (occ / Math.max(1, it.slots.length)) * simMin;
		}
		if (Math.floor(this.clock) % 5 === 0) this.ui.heatVersion++;
	}
	analytics() {
		const T = Math.max(1, this.elapsed);
		const items = this.items
			.filter((i) => i.affords.length)
			.map((i) => ({
				deck: this.where(i.deck), name: i.label, uid: i.uid,
				utilization: Math.round((100 * i.busy) / T), uses: i.uses,
				avgWait: i.waits ? i.waitMin / i.waits : 0, waits: i.waits, maxQueue: i.maxQueue, reachable: i.reachable, capacity: i.slots.length
			}));
		const ladders = this.world?.portals.map((p, k) => ({ label: game.shaftLabel(p.shaft), uses: this.ladderStats.get(k)?.uses ?? 0, waitMin: this.ladderStats.get(k)?.waitMin ?? 0 })) ?? [];
		const crewH = (this.agents.length * T) / 60;
		const critical = NEED_IDS.map((n) => ({ need: n, hours: this.critical[n] / 60, pct: crewH ? (100 * this.critical[n]) / 60 / crewH : 0 }));
		const issues: { sev: 'high' | 'med' | 'low'; text: string }[] = [];
		const supported = new Set<NeedId>();
		for (const i of this.items) if (i.reachable) for (const af of i.affords) for (const [n, r] of Object.entries(af.needs)) if ((r as number) > 0) supported.add(n as NeedId);
		for (const n of NEEDS) if (!supported.has(n.id)) issues.push({ sev: 'high', text: `No reachable equipment satisfies ${n.label} – add one (e.g. ${hint(n.id)})` });
		for (const i of items) {
			if (!i.reachable) issues.push({ sev: 'high', text: `${i.name} (${i.deck}) is unreachable for the crew (blocked access / no path)` });
			else if (i.avgWait > 4 && i.waits >= 2) issues.push({ sev: i.avgWait > 10 ? 'high' : 'med', text: `${i.name} (${i.deck}): average wait ${i.avgWait.toFixed(1)} min over ${i.waits} waits, max queue ${i.maxQueue} – consider a second unit` });
			if (i.utilization > 80 && T > 240) issues.push({ sev: 'med', text: `${i.name} (${i.deck}) is a bottleneck: ${i.utilization}% utilization` });
			if (i.utilization < 2 && i.uses === 0 && T > 24 * 60) issues.push({ sev: 'low', text: `${i.name} (${i.deck}) was never used in ${(T / 1440).toFixed(1)} days` });
		}
		for (const c of critical) if (c.pct > 4 && crewH > 4) issues.push({ sev: c.pct > 12 ? 'high' : 'med', text: `Crew spent ${c.hours.toFixed(1)} h (${c.pct.toFixed(0)}% of crew time) with critical ${NEEDS.find((n) => n.id === c.need)!.label}` });
		for (const l of ladders) if (l.waitMin > 10) issues.push({ sev: l.waitMin > 40 ? 'med' : 'low', text: `Ladder ${l.label}: ${l.waitMin.toFixed(0)} min of waiting in total (${l.uses} climbs) – add a second connection?` });
		// congestion hot spots
		this.congestion.forEach((g, k) => {
			let max = 0, at = -1;
			for (let i = 0; i < g.length; i++) if (g[i] > max) (max = g[i]), (at = i);
			if (max > 1.5 && at >= 0) {
				const R = game.deckRadius[k] ?? 4.5;
				const M = Math.ceil((2 * R) / this.heatCell);
				const x = -R + ((at % M) + 0.5) * this.heatCell, z = -R + (Math.floor(at / M) + 0.5) * this.heatCell;
				issues.push({ sev: max > 6 ? 'med' : 'low', text: `Congestion on ${this.where(k)} near (${x.toFixed(1)}, ${z.toFixed(1)}) m – crew had to squeeze past each other` });
			}
		});
		if (game.phase === 'launch' && game.seats < this.agents.length) issues.push({ sev: 'high', text: `Only ${game.seats} couch seats for ${this.agents.length} crew` });
		const order = { high: 0, med: 1, low: 2 };
		issues.sort((p, q) => order[p.sev] - order[q.sev]);
		return { simHours: T / 60, items, ladders, critical, issues };
	}
	csv() {
		const a = this.analytics();
		const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
		const L: string[] = [];
		L.push(`# Crew sim analytics,${q(fmtClock(this.clock))},sim hours,${a.simHours.toFixed(1)},crew,${this.agents.length},mode,${game.shipMode},phase,${game.phase}`);
		L.push('');
		L.push('EQUIPMENT');
		L.push('deck,equipment,uid,capacity,utilization_pct,uses,waits,avg_wait_min,max_queue,reachable');
		for (const i of a.items) L.push([q(i.deck), q(i.name), i.uid, i.capacity, i.utilization, i.uses, i.waits, i.avgWait.toFixed(1), i.maxQueue, i.reachable].join(','));
		L.push('');
		L.push('LADDERS');
		L.push('ladder,climbs,wait_min');
		for (const l of a.ladders) L.push([q(l.label), l.uses, l.waitMin.toFixed(1)].join(','));
		L.push('');
		L.push('UNMET NEEDS');
		L.push('need,critical_hours,pct_of_crew_time');
		for (const c of a.critical) L.push([c.need, c.hours.toFixed(2), c.pct.toFixed(1)].join(','));
		L.push('');
		L.push('DESIGN ISSUES');
		L.push('severity,issue');
		for (const i of a.issues) L.push([i.sev, q(i.text)].join(','));
		L.push('');
		L.push('CREW');
		L.push(['name', 'role', 'deck', 'action', 'mood', ...NEED_IDS].join(','));
		for (const u of this.ui.agents) L.push([q(u.name), u.role, q(u.where), q(u.action), u.mood, ...NEED_IDS.map((n) => u.needs[n])].join(','));
		return L.join('\n');
	}

	// ---------- possession ----------
	possess(id: number | null) {
		if (this.possessed !== null) {
			const old = this.agents[this.possessed];
			if (old) {
				old.possessed = false;
				if (old.state !== 'use') (old.state = 'idle'), (old.idleLeft = 1);
				this.log(`${this.name(old)} returns to autonomous mode`);
			}
		}
		this.possessed = id;
		if (id === null) return;
		const a = this.agents[id];
		if (!a) return (this.possessed = null);
		if (a.state === 'move' || a.state === 'queue' || a.state === 'ladder') {
			this.release(a, false);
			a.state = 'idle';
		}
		if (a.climbPhase === 1) {
			a.climbPhase = 0;
			a.y = 0;
		}
		a.possessed = true;
		a.action = 'Under your control';
		this.selected = id;
		this.input.yaw = a.yaw + Math.PI;
		game.section = false;
		game.selectDeck(a.deck);
		this.log(`You took control of ${this.name(a)}`);
	}
	private updatePossessed(a: Agent, dt: number) {
		const nav = this.world!.navs[a.deck];
		// climbing via E / Q
		const leg = a.legs[a.leg];
		if (a.state === 'move' && leg?.kind === 'climb') {
			const saved = this.speed, run = this.running;
			this.speed = 1;
			this.running = true;
			this.updateMove(a, dt, dt);
			this.speed = saved;
			this.running = run;
			if (a.state !== 'move') {
				a.state = 'idle';
				game.selectDeck(a.deck);
			}
			return;
		}
		const { f, s } = this.input;
		if (Math.hypot(f, s) > 0.05) {
			if (a.state === 'use') {
				this.release(a, false);
				a.state = 'idle';
			}
			// camera yaw: forward = direction the camera looks (yaw of camera)
			const yaw = this.input.yaw;
			const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
			const rx = Math.cos(yaw), rz = -Math.sin(yaw);
			let mx = fx * f + rx * s, mz = fz * f + rz * s;
			const len = Math.hypot(mx, mz);
			if (len > 1) (mx /= len), (mz /= len);
			const v = (this.input.run ? 2.4 : 1.35) * dt;
			const nx = a.x + mx * v, nz = a.z + mz * v;
			if (nav.isFree(nx, a.z)) a.x = nx;
			if (nav.isFree(a.x, nz)) a.z = nz;
			a.yaw = Math.atan2(mx, mz);
			a.action = 'Walking (you)';
			a.state = 'idle';
		}
	}
	/** nearest interaction for the possessed agent */
	private nearest(a: Agent): { kind: 'use'; it: Item; af: Affordance; slot: number } | { kind: 'climb'; portal: number; up: boolean } | null {
		let best: { d: number; r: ReturnType<CrewSim['nearest']> } = { d: 1.5, r: null };
		this.world!.portals.forEach((p, k) => {
			for (const [end, up] of [[p.bottom, true], [p.top, false]] as const) {
				if (end.deck !== a.deck) continue;
				const d = Math.hypot(end.x - a.x, end.z - a.z);
				if (d < Math.min(best.d, 1.0)) best = { d, r: { kind: 'climb', portal: k, up } };
			}
		});
		if (game.phase === 'launch') {
			for (const it of this.items) {
				if (it.deck !== a.deck) continue;
				it.seats.forEach((s, i) => {
					const d = Math.hypot(s.ax - a.x, s.az - a.z);
					if (d < best.d && (s.occ === null || s.occ === a.id)) best = { d, r: { kind: 'use', it, af: { id: 'strap', label: 'Strap in', needs: {}, minutes: 1e6, pose: 'couch' }, slot: i } };
				});
			}
			return best.r;
		}
		for (const it of this.items) {
			if (it.deck !== a.deck || !it.affords.length) continue;
			it.slots.forEach((s, i) => {
				const d = Math.hypot(s.ax - a.x, s.az - a.z);
				if (d < best.d) {
					// most useful affordance for this agent right now
					const af = [...it.affords].sort((p, q) => this.quickGain(a, q) - this.quickGain(a, p))[0];
					best = { d, r: { kind: 'use', it, af, slot: i } };
				}
			});
		}
		return best.r;
	}
	private quickGain(a: Agent, af: Affordance) {
		return Object.entries(af.needs).reduce((s, [n, r]) => s + Math.min(100 - a.needs[n as NeedId], ((r as number) * af.minutes) / 60), 0);
	}
	promptFor(a: Agent): string | null {
		if (a.state === 'use') return `Using: ${a.aff?.label ?? ''} · move to stop`;
		if (a.state === 'move') return 'Climbing…';
		const n = this.nearest(a);
		if (!n) return null;
		if (n.kind === 'climb') return n.up ? `E: Climb up (${game.shaftLabel(this.world!.portals[n.portal].shaft)})` : `Q: Climb down (${game.shaftLabel(this.world!.portals[n.portal].shaft)})`;
		const s = n.af.id === 'strap' ? n.it.seats[n.slot] : n.it.slots[n.slot];
		if (s.occ !== null && s.occ !== a.id) return `${n.it.label} is busy (${this.name(s.occ)})`;
		return `E: ${n.af.label} (${n.it.label})`;
	}
	/** E (interact / climb up) or Q (climb down) */
	interact(down = false) {
		if (this.possessed === null) return false;
		const a = this.agents[this.possessed];
		const n = this.nearest(a);
		if (!n) return false;
		if (n.kind === 'climb') {
			if (n.up === down) return false;
			const p = this.world!.portals[n.portal];
			a.legs = [{ kind: 'climb', portal: n.portal, up: n.up }];
			a.leg = 0;
			a.climbPhase = 0;
			a.state = 'move';
			void p;
			return true;
		}
		if (down) return false;
		const strap = n.af.id === 'strap';
		const s = strap ? n.it.seats[n.slot] : n.it.slots[n.slot];
		if (s.occ !== null && s.occ !== a.id) {
			game.flash(`${n.it.label} is busy`);
			return false;
		}
		this.release(a, false);
		s.occ = a.id;
		a.item = n.it;
		a.slot = n.slot;
		if (strap) {
			a.aff = null;
			a.state = 'strapped';
		} else {
			a.aff = n.af;
			a.state = 'use';
			a.useLeft = n.af.minutes;
			n.it.uses++;
		}
		a.dock = 0;
		a.dockFrom = [a.x, a.z];
		a.action = strap ? 'Strapped in' : n.af.label;
		this.log(`${this.name(a)} (you): ${a.action} – ${n.it.label}`);
		return true;
	}
	/** test/debug helpers */
	agentSnapshot(id: number) {
		const a = this.agents[id];
		return a && { deck: a.deck, x: a.x, z: a.z, y: a.y, state: a.state, action: a.action, item: a.item?.label ?? null, slot: a.slot, needs: { ...a.needs }, hidden: a.hidden, climb: a.climbPhase };
	}
	setNeed(id: number, n: NeedId, v: number) {
		const a = this.agents[id];
		if (a) a.needs[n] = v;
	}
	/** force an agent to (re)decide now */
	think(id: number) {
		const a = this.agents[id];
		if (!a || a.possessed) return;
		this.release(a, false);
		a.state = 'idle';
		a.idleLeft = 0;
	}
	teleport(id: number, deck: number, x: number, z: number) {
		const a = this.agents[id];
		if (!a) return;
		this.release(a, false);
		a.deck = deck;
		a.x = x;
		a.z = z;
		a.y = 0;
		a.state = 'idle';
		a.idleLeft = 0;
	}
	itemList() {
		return this.items.map((i) => ({ key: i.key, label: i.label, deck: i.deck, queue: [...i.queue], occ: i.slots.map((s) => s.occ), reachable: i.reachable }));
	}
}
function hint(n: NeedId) {
	return { energy: 'a bunk or crew pod', hunger: 'a galley or table', hygiene: 'a hygiene unit', bladder: 'a hygiene unit', fitness: 'a treadmill', fun: 'a table or couches', work: 'a workstation or hydroponics rack', comfort: 'seating' }[n];
}

export const crew = new CrewSim();
