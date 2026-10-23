/**
 * Sims-like crew simulation: needs, utility-AI action selection with free will, schedules,
 * equipment reservation + queues, multi-deck navigation (ladders, one climber at a time),
 * local avoidance, launch strap-in, possession, and layout analytics.
 *
 * Hot state (positions, needs) lives in plain objects; a small $state snapshot is refreshed
 * ~4×/s for the UI. Time: at 1× one real second = one sim minute (walking stays visual-speed).
 */
import { CATALOG_BY_ID } from '$lib/game/catalog';
import { groupSeats } from '$lib/game/groups';
import { EFFECTS, NOISE, condFactor, diminish, strength, type ActiveEffect } from './effects';
import { LIGHT_W, PRIORITIES, PRIO_RANK, fmtW, powerOf, type PowerSpec, type PowerState, type Priority } from './power';
import { AGING_PER_DAY, SPARES_PER_LOCKER, afterRepair, afterService, hazard, lifeOf, lifeState, wearPerHour, type LifeSpec, type LifeState } from './lifecycle';
import {
	DECAY,
	HOUSEKEEPING_AF,
	NEEDS,
	NEED_IDS,
	REPAIR_AF,
	SERVICE_AF,
	SLEEP_DECAY,
	STEP_LABEL,
	defaultSlots,
	seatOffsets,
	type Affordance,
	type MealStep,
	type NeedId,
	type Slot
} from '$lib/game/affordances';
import { PHASE, containsPoint, localToWorld, shaftAccess, worldToLocal } from '$lib/game/geometry';
import { couchOccupant } from '$lib/game/couchModel';
import { game, type CtxAction } from '$lib/game/state.svelte';
import type { ModuleDef, PlacedModule } from '$lib/game/types';
import { couchFrame, type AvatarState, type PoseName } from './avatarPose';
import { buildLegs, buildNav, portalCosts, travelCost, type Leg, type NavWorld } from './nav';
import { VoxNav, type V3 } from './nav3d';
import { Quaternion, Vector3 } from 'three';
import { BODY, frameFor } from './avatarPose';
import { doorSpecOf, type DoorSpec } from '$lib/game/doors';
import { keepoutFootprint } from '$lib/game/egress';
import { doorOpen } from './doorState';

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
	/** mission planning (food-days, spares) */
	cruiseDays: number;
	surfaceDays: number;
	/** power bus: cruise supply kW, surface source + kW, battery kWh, per-item priority overrides */
	powerCruiseKW: number;
	powerSurfaceKW: number;
	surfaceSource: 'solar' | 'nuclear';
	batteryKWh: number;
	powerPrio: Record<string, Priority>;
}
export const SPEEDS = [1, 4, 16, 60];
/** E / climb: a ladder base or hatch opening within this distance is in reach (the avatar walks the rest) */
const LADDER_REACH = 1.5;
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
	/** micro-g: voxel of the approach point (−1 none) */
	vc: number;
	/** group tables: uid of the chair / foot restraint this place belongs to (−1 built-in place) */
	seat?: number;
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
	/** micro-g: a handrail / foot restraint is within reach of this item */
	restrained: boolean;
	mount: 'wall' | 'ceiling' | undefined;
	/** affordances from the equipment data (affords = base + dynamic service task) */
	base: Affordance[];
	/** life cycle */
	life: LifeSpec;
	cond: number;
	/** hours of use (crew-hours; calendar hours for always-on systems) */
	hours: number;
	sinceService: number;
	broken: boolean;
	failures: number;
	repairs: number;
	/** maintenance sessions done */
	serviced: number;
	/** minutes broken (downtime) */
	downtime: number;
	needsService: boolean;
	serviceWait: number;
	lstate: LifeState;
	/** electrical load profile */
	pspec: PowerSpec | null;
	pstate: PowerState;
	/** live draw, W */
	draw: number;
	peakLeft: number;
	wasActive: boolean;
	/** load-shed (no power) */
	shed: boolean;
	shedAt: number;
	/** cannot start: its start-up peak exceeds the available power */
	brown: boolean;
	kwh: number;
	unavailMin: number;
	/** virtual item (housekeeping spots), not a placed module */
	virtual?: boolean;
	/** group equipment: places come from seat objects at its edge */
	group?: boolean;
	/** placement (module space → world) for the affordances' own use transforms */
	at?: { x: number; z: number; angle: number; y: number };
	/** the item's places came straight from its affordance slots (so each affordance's own transforms apply) */
	ownSlots?: boolean;
	/** door / curtain of the item (null = none) and its openness 0..1 */
	door: DoorSpec | null;
	dOpen: number;
	/** the door is moving this frame (swing arc reserved) */
	dMoving?: boolean;
}
/**
 * door sequence of an agent using an item with a door:
 * open (reach, door opens) → enter (moves to the use point) → close (private) → in (use) →
 * exit (door opens) → out (steps back to the approach point) → released, door closes
 */
type DoorPhase = '' | 'open' | 'enter' | 'close' | 'in' | 'exit' | 'out';
/** exact use transform (world): body origin, facing and pose at the reserved place */
interface UseXf {
	x: number;
	z: number;
	y: number;
	yaw: number;
	pose: PoseName;
}
/** docking blend time (approach point → exact use transform, and back on exit), s */
export const DOCK_TIME = 0.7;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** shortest-arc angle interpolation */
const lerpAngle = (a: number, b: number, t: number) => {
	let d = (b - a) % (2 * Math.PI);
	if (d > Math.PI) d -= 2 * Math.PI;
	if (d < -Math.PI) d += 2 * Math.PI;
	return a + d * t;
};
/** multi-step meal: prep steps, then the meal at a table / food station, then trash */
interface MealPlan {
	tags: MealStep[];
	it: Item;
	af: Affordance;
	phase: 'prep' | 'eat' | 'trash';
	trash: boolean;
}
/** weightless body state (cruise) */
interface Micro {
	p: Vector3;
	v: Vector3;
	q: Quaternion;
	w: Vector3;
	path: V3[];
	pi: number;
	stuck: number;
	trip: number;
	tripN: number;
	tripCov: number;
	sample: number;
	dockP: Vector3;
	dockQ: Quaternion;
	reorient: boolean;
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
	m: Micro | null;
	plan: MealPlan | null;
	/** active status effects (buffs / debuffs) */
	effects: ActiveEffect[];
	/** gain so far this session per need (caps) */
	gained: Partial<Record<NeedId, number>>;
	/** points gained from the item in use since the last rate sample */
	direct: Partial<Record<NeedId, number>>;
	/** net rate of change per need (points/h), smoothed – trend arrows */
	rate: Record<NeedId, number>;
	useTotal: number;
	door: DoorPhase;
	/** leaving through the door was a stop / cancel (not a completed session) */
	doorAbort: boolean;
	/** exact use transform of the place in use (null = none) */
	use: UseXf | null;
	/** facing when the docking blend started (reversed on exit) */
	dockYaw: number;
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
	/** item in use / heading to, with its occupancy */
	using: string;
	/** net rate of change per need, points per sim hour (trend arrows) */
	rates: Record<NeedId, number>;
	/** active status effects */
	effects: { id: string; icon: string; label: string; src: string; left: number; good: boolean }[];
}
export interface LogEntry {
	t: number;
	text: string;
}

/** "A, B ×2" */
const uniq = (names: string[]) => [...names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>())].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ');
const clamp = (v: number, a = 0, b = 100) => Math.max(a, Math.min(b, v));
/** seedable PRNG (mulberry32); crew.seed(n) makes a run reproducible */
let _seed = (Math.random() * 2 ** 32) >>> 0;
export function setSeed(n: number) {
	_seed = n >>> 0;
}
export function rand() {
	_seed = (_seed + 0x6d2b79f5) >>> 0;
	let t = _seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rnd = (a: number, b: number) => a + rand() * (b - a);
export function fmtClock(min: number) {
	const day = Math.floor(min / 1440) + 1;
	const m = Math.floor(min % 1440);
	return `Day ${day} · ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const _v = new Vector3(),
	_v2 = new Vector3(),
	_q = new Quaternion(),
	_q2 = new Quaternion();
const AX = {
	x: new Vector3(1, 0, 0),
	y: new Vector3(0, 1, 0),
	z: new Vector3(0, 0, 1)
};
/** micro-g translation speeds (m/s) */
export const MICRO_V = 0.6,
	MICRO_V_FAST = 1.0;
const inWindow = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);

class CrewSim {
	enabled = $state(false);
	running = $state(true);
	speed = $state(4);
	heatmap = $state(false);
	/** floating occupancy / condition badges over equipment */
	badges = $state(true);
	roster = $state<CrewMember[]>([]);
	settings = $state<SimSettings>({
		sleepStart: 22,
		sleepEnd: 6,
		workStart: 8,
		workEnd: 17,
		gravity: 'auto',
		cruiseDays: 180,
		surfaceDays: 500,
		powerCruiseKW: 6,
		powerSurfaceKW: 12,
		surfaceSource: 'solar',
		batteryKWh: 60,
		powerPrio: {}
	});
	ui = $state<{
		clock: number;
		agents: AgentUI[];
		log: LogEntry[];
		prompt: string | null;
		heatVersion: number;
	}>({ clock: 7 * 60, agents: [], log: [], prompt: null, heatVersion: 0 });
	selected = $state<number | null>(null);
	possessed = $state<number | null>(null);
	firstPerson = $state(false);
	/** possession input (set by PossessControls / joystick) */
	input = {
		f: 0,
		s: 0,
		yaw: 0,
		run: false,
		u: 0,
		roll: 0,
		lookX: 0,
		lookY: 0,
		/** gravity: camera look pitch (rad, + = looking up) → ladder direction for E */
		look: 0,
		grab: false
	};
	/** on-screen micro-g buttons (mobile): held up/down and roll */
	touch = { u: 0, roll: 0 };
	/** micro-g volumetric nav (cruise only) */
	vox: VoxNav | null = null;
	/** handrail-like grab points (handrails, foot restraints, ladders) for coverage analytics */
	rails: V3[] = [];
	hatchStats = new Map<number, { passes: number; congestion: number }>();
	/** containment watchdog: snaps out of invalid space ('unstuck'), stalled trips re-planned */
	safety = {
		unstuck: 0,
		stalls: 0,
		events: [] as { t: number; who: string; why: string; deck: number }[],
		/** incremental layout changes: crew nudged out of new equipment / re-routed (everyone else untouched) */
		nudged: 0,
		replanned: 0,
		layoutChanges: 0
	};
	/** structure (phase / gravity / decks) and ladder signatures of the last nav build */
	private structKey = '';
	private shaftKey = '';
	/** last layout change: affected crew (test hook) */
	lastLayout: { nudged: { id: number; d: number }[]; replanned: number[]; dropped: number[] } = { nudged: [], replanned: [], dropped: [] };
	/** debug overlay: walkable (gravity) / flyable (micro-g) mask of the viewed deck */
	showNav = $state(false);
	/** avatar under the mouse (hover tooltip): crew id + screen position */
	hover = $state<{ id: number; x: number; y: number } | null>(null);
	/** bumped whenever the nav masks are rebuilt (overlay refresh) */
	navVersion = $state(0);
	trips = { n: 0, len: 0, covered: 0, pushes: 0 };

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
	private lastMicro = false;
	get micro() {
		return game.microG && !!this.vox;
	}

	get g() {
		const s = this.settings.gravity;
		const loc = s === 'auto' ? (game.shipMode === 'habitat' ? game.hab.location : 'earth') : s;
		return loc === 'moon' ? 1.62 / 9.81 : loc === 'mars' ? 3.71 / 9.81 : 1;
	}

	// ---------- roster ----------
	syncRoster() {
		const n = Math.min(MAX_AGENTS, Math.max(1, game.crew));
		const r = [...this.roster];
		while (r.length < n)
			r.push({
				name: `Crew ${r.length + 1}`,
				role: ROLES[r.length % ROLES.length],
				color: COLORS[r.length % COLORS.length]
			});
		if (r.length > n) r.length = n;
		this.roster = r;
	}
	toJSON() {
		return {
			roster: $state.snapshot(this.roster),
			settings: $state.snapshot(this.settings)
		};
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
				gravity: ['auto', 'earth', 'mars', 'moon'].includes(s.gravity as string) ? (s.gravity as SimSettings['gravity']) : 'auto',
				cruiseDays: typeof s.cruiseDays === 'number' && s.cruiseDays >= 0 ? Math.min(2000, Math.round(s.cruiseDays)) : 180,
				surfaceDays: typeof s.surfaceDays === 'number' && s.surfaceDays >= 0 ? Math.min(5000, Math.round(s.surfaceDays)) : 500,
				powerCruiseKW: typeof s.powerCruiseKW === 'number' && s.powerCruiseKW >= 0 ? Math.min(500, s.powerCruiseKW) : 6,
				powerSurfaceKW: typeof s.powerSurfaceKW === 'number' && s.powerSurfaceKW >= 0 ? Math.min(500, s.powerSurfaceKW) : 12,
				surfaceSource: s.surfaceSource === 'nuclear' ? 'nuclear' : 'solar',
				batteryKWh: typeof s.batteryKWh === 'number' && s.batteryKWh >= 0 ? Math.min(5000, s.batteryKWh) : 60,
				powerPrio:
					s.powerPrio && typeof s.powerPrio === 'object'
						? (Object.fromEntries(Object.entries(s.powerPrio as Record<string, unknown>).filter(([, v]) => (PRIORITIES as string[]).includes(v as string))) as Record<string, Priority>)
						: {}
			};
		}
		if (this.enabled) this.reset();
	}

	// ---------- lifecycle ----------
	private lastStepAt = 0;
	/** fixed seed applied on every start() (Options → Simulation); null = random */
	seedOnStart: number | null = null;
	start() {
		if (this.seedOnStart !== null) setSeed(this.seedOnStart);
		this.lastStepAt = 0;
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
		this.items = []; // fresh equipment (life cycle restarts)
		this.sparesUsed = 0;
		this.bus = this.freshBus();
		this.rebuild(true);
		this.clock = 7 * 60;
		this.elapsed = 0;
		this.ladderBusy.clear();
		this.ladderStats.clear();
		this.hatchStats.clear();
		this.safety = { unstuck: 0, stalls: 0, events: [], nudged: 0, replanned: 0, layoutChanges: 0 };
		this.trips = { n: 0, len: 0, covered: 0, pushes: 0 };
		for (const n of NEED_IDS) ((this.critical[n] = 0), (this.unmet[n] = 0));
		this.agents = this.roster.map((_, i) => this.spawn(i));
		this.ui.log = [];
		this.refreshUI();
	}
	private spawn(i: number): Agent {
		const w = this.world!;
		// spread over decks (prefer the airlock deck), random free cell
		const deck = w.navs.length ? ((i % w.navs.length) + game.airlockDeck) % w.navs.length : 0;
		const nav = w.navs[deck];
		let x = 0,
			z = 0;
		const main = nav.mainCell();
		if (main >= 0) [x, z] = nav.pt(main);
		const big = main >= 0 ? nav.comp[main] : -1;
		for (let t = 0; t < 200; t++) {
			const a = rand() * Math.PI * 2,
				r = Math.sqrt(rand()) * (nav.R - 0.5);
			const c = nav.cell(Math.cos(a) * r, Math.sin(a) * r);
			if (c >= 0 && nav.free[c] && (big < 0 || nav.comp[c] === big)) {
				x = Math.cos(a) * r;
				z = Math.sin(a) * r;
				break;
			}
		}
		const needs = Object.fromEntries(NEED_IDS.map((n) => [n, rnd(45, 90)])) as Record<NeedId, number>;
		const pers = Object.fromEntries(NEED_IDS.map((n) => [n, rnd(0.8, 1.25)])) as Record<NeedId, number>;
		return {
			id: i,
			needs,
			pers,
			deck,
			x,
			z,
			y: 0,
			yaw: rand() * 6.28,
			state: 'idle',
			legs: [],
			leg: 0,
			pt: 0,
			climb: 0,
			climbPhase: 0,
			item: null,
			aff: null,
			slot: -1,
			useLeft: 0,
			idleLeft: rnd(0, 3),
			action: 'Looking around',
			queuedAt: 0,
			dock: 1,
			dockFrom: [x, z],
			av: {
				x,
				y: game.floorY[deck] ?? 0,
				z,
				yaw: 0,
				pose: 'stand',
				t: rand() * 10,
				visible: true,
				couch: COUCH,
				seatY: 0.46
			},
			hidden: false,
			stuck: 0,
			lastUnmet: {},
			possessed: false,
			waitingLadder: -1,
			m: null,
			plan: null,
			effects: [],
			gained: {},
			direct: {},
			rate: Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>,
			useTotal: 1,
			door: '',
			doorAbort: false,
			use: null,
			dockYaw: 0
		};
	}

	/** rebuild nav + equipment registry when the layout/phase changes (agents replan) */
	rebuild(force = false) {
		const key =
			game.phase +
			'|' +
			game.microG +
			'|' +
			game.shipMode +
			'|' +
			game.decks.map((d, k) => `${game.deckRadius[k]?.toFixed(2)}:${d.height}:${d.modules.map((m) => `${m.type}${m.x.toFixed(2)}${m.z.toFixed(2)}${m.angle}${m.y ?? 0}`).join(',')}`).join('/') +
			'|' +
			game.shafts.map((s) => `${s.from}-${s.to}@${s.x.toFixed(2)},${s.z.toFixed(2)},${s.angle}`).join(',') +
			'|' +
			Object.keys(CATALOG_BY_ID).length +
			'|' +
			[...new Set(game.decks.flatMap((d) => d.modules.map((m) => m.type)))]
				.filter((t) => t.startsWith('custom:'))
				.map((t) => JSON.stringify(CATALOG_BY_ID[t]?.affords ?? null))
				.join(';');
		if (!force && key === this.navKey) return;
		this.navKey = key;
		const structKey = `${game.phase}|${game.microG}|${game.shipMode}|${game.decks.map((d, k) => `${game.deckRadius[k]?.toFixed(2)}:${d.height}`).join('/')}`;
		const shaftKey = game.shafts.map((s) => `${s.from}-${s.to}@${s.x.toFixed(2)},${s.z.toFixed(2)},${s.angle}`).join(',');
		// equipment-only change while the sim has a world: keep every crew member as is, repair only the affected ones
		const incremental = !force && !!this.world && structKey === this.structKey;
		const shaftsChanged = shaftKey !== this.shaftKey;
		this.structKey = structKey;
		this.shaftKey = shaftKey;
		const prevPhase = PHASE.v;
		PHASE.v = game.phase;
		const old = new Map(this.items.map((i) => [i.key, i]));
		this.world = buildNav(
			game.decks,
			game.shafts,
			(k) => game.deckRadius[k] ?? 4.5,
			(s) => game.shaftLength(s),
			game.airlockDeck
		);
		this.items = [];
		game.decks.forEach((d, k) => {
			const nav = this.world!.navs[k];
			const groups = groupSeats(d.modules, game.microG);
			for (const m of d.modules) {
				const def = CATALOG_BY_ID[m.type];
				if (!def) continue;
				const affords = def.affords ?? [];
				const seats = def.seats && game.phase === 'launch' ? seatOffsets(def.seats).map((sx) => this.mkSlot(nav, m, def, [sx, 0, 0, 0], true)) : [];
				if (!affords.length && !seats.length) continue;
				const base = affords.reduce((a, b) => ((b.slots?.length ?? 0) > (a.slots?.length ?? 0) ? b : a), affords[0]);
				let raw: Slot[] = affords.length ? (base.slots ?? defaultSlots(base, def.w, def.d, def.height, def.capacity ?? def.seats ?? 1)) : [];
				let ownSlots = !!base?.slots;
				if (def.capacity && raw.length > def.capacity) raw = raw.slice(0, def.capacity);
				else if (def.capacity && raw.length < def.capacity && affords.length) ((raw = defaultSlots(base, def.w, def.d, def.height, def.capacity)), (ownSlots = false));
				const slots = def.group ? (def.restraint ? raw : []).map((s) => this.mkSlot(nav, m, def, s, false)) : raw.map((s) => this.mkSlot(nav, m, def, s, false));
				if (def.group) for (const st of groups.get(m.uid) ?? []) slots.push(this.seatSlot(nav, m, st));
				const key = `${k}:${m.uid}`;
				const o = old.get(key);
				const life = lifeOf(def);
				const lf = o && o.def.id === def.id ? o : null;
				this.items.push({
					key,
					deck: k,
					uid: m.uid,
					def,
					label: def.name,
					affords,
					slots,
					queue: [],
					seats,
					base: affords,
					life,
					cond: lf?.cond ?? 100,
					hours: lf?.hours ?? 0,
					sinceService: lf?.sinceService ?? 0,
					broken: lf?.broken ?? false,
					failures: lf?.failures ?? 0,
					repairs: lf?.repairs ?? 0,
					serviced: lf?.serviced ?? 0,
					downtime: lf?.downtime ?? 0,
					needsService: false,
					serviceWait: lf?.serviceWait ?? 0,
					lstate: 'New',
					pspec: powerOf(def),
					pstate: 'Off',
					draw: 0,
					peakLeft: 0,
					wasActive: lf?.wasActive ?? false,
					shed: lf?.shed ?? false,
					shedAt: lf?.shedAt ?? 0,
					brown: false,
					kwh: lf?.kwh ?? 0,
					unavailMin: lf?.unavailMin ?? 0,
					busy: o?.busy ?? 0,
					uses: o?.uses ?? 0,
					waitMin: o?.waitMin ?? 0,
					waits: o?.waits ?? 0,
					maxQueue: o?.maxQueue ?? 0,
					reachable: slots.some((s) => s.cell >= 0) || seats.some((s) => s.cell >= 0),
					restrained: !!def.restraint || d.modules.some((o2) => o2 !== m && CATALOG_BY_ID[o2.type]?.restraint && Math.hypot(o2.x - m.x, o2.z - m.z) <= 1.5),
					mount: m.mount,
					group: !!def.group || !!def.capacity,
					at: { x: m.x, z: m.z, angle: m.angle, y: m.y ?? 0 },
					ownSlots: ownSlots && !def.group,
					door: doorSpecOf(m.type),
					dOpen: o?.dOpen ?? (doorSpecOf(m.type)?.restOpen ? 1 : 0)
				});
			}
		});
		// housekeeping: three "clean & organise" spots per deck (work anywhere, specialists prefer it)
		game.decks.forEach((_, k) => {
			const nav = this.world!.navs[k];
			const big = nav.mainCell() >= 0 ? nav.comp[nav.mainCell()] : -1;
			const slots: ItemSlot[] = [];
			for (let t = 0; t < 300 && slots.length < 3; t++) {
				const a = (t * 2.399) % (Math.PI * 2),
					r = (nav.R - 0.7) * Math.sqrt(((t * 0.618) % 1) * 0.8 + 0.2);
				const c = nav.cell(Math.cos(a) * r, Math.sin(a) * r);
				if (c < 0 || !nav.free[c] || (big >= 0 && nav.comp[c] !== big)) continue;
				const [x, z] = nav.pt(c);
				if (slots.some((q) => Math.hypot(q.x - x, q.z - z) < 1.5)) continue;
				slots.push({
					x,
					z,
					y: 0,
					yaw: a,
					ax: x,
					az: z,
					cell: c,
					occ: null,
					vc: -1
				});
			}
			if (!slots.length) return;
			const key = `${k}:hk`;
			const o = old.get(key);
			this.items.push({
				key,
				deck: k,
				uid: -1 - k,
				def: HK_DEF,
				label: 'Housekeeping',
				affords: [HOUSEKEEPING_AF],
				base: [HOUSEKEEPING_AF],
				slots,
				queue: [],
				seats: [],
				busy: o?.busy ?? 0,
				uses: o?.uses ?? 0,
				waitMin: o?.waitMin ?? 0,
				waits: o?.waits ?? 0,
				maxQueue: o?.maxQueue ?? 0,
				reachable: true,
				restrained: true,
				mount: undefined,
				life: lifeOf(undefined),
				cond: 100,
				hours: 0,
				sinceService: 0,
				broken: false,
				failures: 0,
				repairs: 0,
				serviced: 0,
				downtime: 0,
				needsService: false,
				serviceWait: 0,
				lstate: 'Operational',
				pspec: null,
				pstate: 'Off',
				draw: 0,
				peakLeft: 0,
				wasActive: false,
				shed: false,
				shedAt: 0,
				brown: false,
				kwh: 0,
				unavailMin: 0,
				virtual: true,
				door: null,
				dOpen: 0
			});
		});
		PHASE.v = prevPhase;
		// heat maps (kept across equipment-only changes)
		if (!incremental || this.heat.length !== game.decks.length) this.heat = game.decks.map((_, k) => {
			const M = Math.ceil((2 * (game.deckRadius[k] ?? 4.5)) / this.heatCell);
			return new Float32Array(M * M);
		});
		if (!incremental || this.congestion.length !== this.heat.length) this.congestion = this.heat.map((h) => new Float32Array(h.length));
		// reachability from the entries (airlock deck / any portal): mark items unreachable from crew
		this.markReachability();
		this.buildMicro();
		for (const it of this.items) this.refreshLife(it);
		// use points that cannot be reached → issues + red in the editor; AI never targets them (cell / voxel −1)
		const un: { deck: number; uid: number; text: string }[] = [];
		for (const it of this.items) {
			if (it.virtual || !it.slots.length) continue;
			const bad = it.slots.filter((s) => (this.vox ? s.vc < 0 : s.cell < 0)).length;
			if (!it.reachable)
				un.push({
					deck: it.deck,
					uid: it.uid,
					text: `${it.label} (${this.where(it.deck)}): use point unreachable`
				});
			else if (bad)
				un.push({
					deck: it.deck,
					uid: it.uid,
					text: `${it.label} (${this.where(it.deck)}): ${bad} of ${it.slots.length} use points unreachable`
				});
		}
		game.unreachable = un;
		this.navVersion++;
		if (incremental) return this.repairAfterLayout(old, shaftsChanged);
		// structural change (phase, gravity, decks): every agent replans
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
			this.enterMicro(a);
		}
	}
	/**
	 * Equipment moved / added / rotated / deleted: leave every crew member exactly as they are (position,
	 * action, needs, effects, reservations) and repair only those with a problem:
	 * reservations move to the rebuilt items; using a moved item → move with it; heading to a moved item →
	 * re-route; target deleted / unreachable → release and choose again; body inside new equipment → nudged
	 * to the nearest valid spot (same deck); path blocked → re-planned from where they are; on a moved ladder →
	 * step off at the nearest valid point.
	 */
	private repairAfterLayout(old: Map<string, Item>, shaftsChanged: boolean) {
		const w = this.world!;
		const byKey = new Map(this.items.map((i) => [i.key, i]));
		const res = { nudged: [] as { id: number; d: number }[], replanned: [] as number[], dropped: [] as number[] };
		const moved = (a?: ItemSlot, b?: ItemSlot) => !a || !b || Math.hypot(a.x - b.x, a.z - b.z) > 0.005 || Math.hypot(a.ax - b.ax, a.az - b.az) > 0.005 || Math.abs(a.yaw - b.yaw) > 1e-3;
		const slotOk = (s?: ItemSlot) => !!s && (this.vox ? s.vc >= 0 : s.cell >= 0);
		const drop = (a: Agent) => {
			const oi = a.item;
			if (oi && a.state === 'use' && a.slot >= 0) {
				const sl = oi.slots[a.slot] ?? oi.seats[a.slot];
				if (sl) ((a.x = sl.ax), (a.z = sl.az));
			}
			if (a.climbPhase === 1) ((a.climbPhase = 0), (a.climb = 0));
			for (const [k, id] of this.ladderBusy) if (id === a.id) this.ladderBusy.delete(k);
			a.waitingLadder = -1;
			a.item = null;
			a.aff = null;
			a.slot = -1;
			a.plan = null;
			a.hidden = false;
			a.y = 0;
			a.dock = 1;
			a.door = '';
			a.use = null;
			a.legs = [];
			if (a.m) (a.m.path = []), (a.m.pi = 0), a.m.v.set(0, 0, 0);
			if (!a.possessed) {
				a.state = 'idle';
				a.idleLeft = 0;
			}
			res.dropped.push(a.id);
		};
		// ladders that moved: climbers step off at the nearest valid point of their deck
		if (shaftsChanged) {
			this.ladderBusy.clear();
			for (const a of this.agents) {
				const onLadder = a.climbPhase === 1 || a.legs.slice(a.leg).some((l) => l.kind === 'climb');
				if (!onLadder) continue;
				if (a.climbPhase === 1) {
					a.climbPhase = 0;
					a.climb = 0;
					a.y = 0;
				}
				a.legs = [];
				res.replanned.push(a.id);
			}
		}
		// 1) carry reservations over to the rebuilt items (queues keep their order)
		for (const [key, oi] of old) {
			const ni = byKey.get(key);
			if (!ni || ni.def.id !== oi.def.id) continue;
			oi.slots.forEach((s, i) => s.occ !== null && ni.slots[i] && (ni.slots[i].occ = s.occ));
			oi.seats.forEach((s, i) => s.occ !== null && ni.seats[i] && (ni.seats[i].occ = s.occ));
			ni.queue = oi.queue.slice();
		}
		const relink: Agent[] = [];
		for (const a of this.agents) {
			if (a.plan) {
				const pi = byKey.get(a.plan.it.key);
				if (pi && pi.def.id === a.plan.it.def.id) a.plan.it = pi;
				else a.plan = null;
			}
			const oi = a.item;
			if (!oi) continue;
			const ni = byKey.get(oi.key);
			const seat = a.slot >= 0 && oi.seats[a.slot]?.occ === a.id && !(oi.slots[a.slot]?.occ === a.id);
			const os = a.slot >= 0 ? (seat ? oi.seats : oi.slots)[a.slot] : undefined;
			const ns = ni && a.slot >= 0 ? (seat ? ni.seats : ni.slots)[a.slot] : undefined;
			const valid = !!ni && ni.def.id === oi.def.id && ni.reachable && (a.slot < 0 ? ni.slots.some(slotOk) : slotOk(ns));
			if (!valid) {
				// target deleted / unreachable: release the reservation, choose a new action
				if (ni) {
					for (const s of [...ni.slots, ...ni.seats]) if (s.occ === a.id) s.occ = null;
					const qi = ni.queue.indexOf(a.id);
					if (qi >= 0) ni.queue.splice(qi, 1);
				}
				drop(a);
				continue;
			}
			a.item = ni!;
			const mv = a.slot >= 0 ? moved(os, ns) : moved(oi.slots[0], ni!.slots[0]);
			if (!mv) continue;
			if (a.state === 'use' || a.state === 'strapped') {
				// keep using: move with the item to its new use point
				a.x = ns!.ax;
				a.z = ns!.az;
				a.dockFrom = [ns!.ax, ns!.az];
				if (a.m) {
					const fy = game.floorY[ni!.deck] ?? 0;
					a.m.p.set(ns!.ax, fy + 1.05, ns!.az);
					a.m.dockP.copy(a.m.p);
				}
				res.replanned.push(a.id);
			} else relink.push(a);
		}
		for (const it of this.items) if (it.queue.length) it.queue = it.queue.filter((id) => this.agents[id]?.item === it);
		// 2) bodies inside new equipment → minimal nudge (same deck, never back to spawn)
		for (const a of this.agents) {
			if (a.state === 'use' || a.state === 'strapped' || a.climbPhase === 1) continue;
			if (a.m && this.vox) {
				const vox = this.vox;
				if (vox.isFree(a.m.p.x, a.m.p.y, a.m.p.z)) continue;
				const c = vox.nearestFree(a.m.p.x, a.m.p.y, a.m.p.z, 1.5);
				if (c < 0) continue;
				const from = a.m.p.clone();
				a.m.p.fromArray(vox.pt(c));
				a.m.v.set(0, 0, 0);
				a.x = a.m.p.x;
				a.z = a.m.p.z;
				res.nudged.push({ id: a.id, d: +from.distanceTo(a.m.p).toFixed(2) });
				continue;
			}
			const nav = w.navs[a.deck];
			if (!nav || nav.isFree(a.x, a.z)) continue;
			let c = nav.nearestFree(a.x, a.z, 1.2);
			if (c < 0) c = nav.nearestFree(a.x, a.z, 3);
			if (c < 0) continue;
			const [x, z] = nav.pt(c);
			res.nudged.push({ id: a.id, d: +Math.hypot(x - a.x, z - a.z).toFixed(2) });
			a.x = x;
			a.z = z;
		}
		// 3) heading to a moved item, path now blocked, or ladder legs gone → re-plan from the current position
		const blocked = (a: Agent) => {
			if (a.m && this.vox) return a.m.path.slice(a.m.pi).some((p) => !this.vox!.isFree(p[0], p[1], p[2]));
			let px = a.x, pz = a.z;
			for (let l = a.leg; l < a.legs.length; l++) {
				const leg = a.legs[l];
				if (leg.kind !== 'walk') continue;
				const nav = w.navs[leg.deck];
				if (!nav) return true;
				for (let i = l === a.leg ? a.pt : 0; i < leg.pts.length; i++) {
					const [x, z] = leg.pts[i];
					if (leg.deck === a.deck || i > 0) {
						const n = Math.ceil(Math.hypot(x - px, z - pz) / 0.1);
						for (let k = 1; k <= n; k++) if (!nav.isFree(px + ((x - px) * k) / n, pz + ((z - pz) * k) / n)) return true;
					}
					px = x;
					pz = z;
				}
			}
			return false;
		};
		const dest = (a: Agent): { deck: number; cell: number } | null => {
			const it = a.item;
			if (it && a.slot >= 0) {
				const s = (it.seats[a.slot]?.occ === a.id && !a.aff ? it.seats : it.slots)[a.slot];
				return s && s.cell >= 0 ? { deck: it.deck, cell: s.cell } : null;
			}
			if (it) return { deck: it.deck, cell: this.queueSpot(it, Math.max(0, it.queue.indexOf(a.id))) };
			const last = [...a.legs].reverse().find((l) => l.kind === 'walk') as Extract<Leg, { kind: 'walk' }> | undefined;
			const p = last?.pts[last.pts.length - 1];
			if (!last || !p) return null;
			const c = w.navs[last.deck]?.nearestFree(p[0], p[1], 0.6) ?? -1;
			return c >= 0 ? { deck: last.deck, cell: c } : null;
		};
		for (const a of this.agents) {
			if (a.possessed || a.state === 'use' || a.state === 'strapped' || a.state === 'idle' || a.state === 'noseat') continue;
			const need = relink.includes(a) || res.replanned.includes(a.id) || blocked(a);
			if (!need) continue;
			const d = dest(a);
			if (d && this.routeTo(a, d.deck, d.cell)) {
				if (!res.replanned.includes(a.id)) res.replanned.push(a.id);
				if (a.slot < 0 && a.item) a.state = 'move';
			} else {
				const it = a.item;
				if (it) {
					for (const s of [...it.slots, ...it.seats]) if (s.occ === a.id) s.occ = null;
					const qi = it.queue.indexOf(a.id);
					if (qi >= 0) it.queue.splice(qi, 1);
				}
				drop(a);
			}
		}
		this.lastLayout = res;
		this.safety.layoutChanges++;
		const affected = new Set([...res.nudged.map((n) => n.id), ...res.replanned, ...res.dropped]);
		this.safety.nudged += res.nudged.length;
		this.safety.replanned += new Set([...res.replanned, ...res.dropped]).size;
		for (const n of res.nudged) this.log(`🧭 ${this.name(this.agents[n.id])} nudged ${n.d.toFixed(2)} m out of new equipment (${this.where(this.agents[n.id].deck)})`);
		for (const id of new Set([...res.replanned, ...res.dropped])) this.log(`↪ ${this.name(this.agents[id])} re-routed after a layout change`);
		if (affected.size) game.flash(`Layout changed: ${affected.size} crew re-routed`);
	}
	/** voxel nav, slot voxels, grab points and micro-g reachability (cruise only) */
	private buildMicro() {
		if (!game.microG || !game.decks.length) {
			this.vox = null;
			return;
		}
		const fy = game.floorY;
		const vox = new VoxNav(
			game.decks,
			game.shafts,
			fy,
			(k) => game.deckRadius[k] ?? 4.5,
			(t) => CATALOG_BY_ID[t as ModuleDef['id']]?.height ?? 1
		);
		this.vox = vox;
		{
			// keep only the volume connected to the crew spawn (airlock deck main area)
			const k0 = Math.min(game.airlockDeck, game.decks.length - 1);
			const n0 = this.world!.navs[k0];
			const mc = n0?.mainCell() ?? -1;
			const [sx, sz] = mc >= 0 ? n0.pt(mc) : [0, 0];
			vox.prune(vox.nearestFree(sx, (fy[k0] ?? 0) + 1.05, sz, 2));
		}
		for (const it of this.items) for (const s of it.slots) s.vc = vox.nearestFree(s.ax, (fy[it.deck] ?? 0) + 1.05, s.az, 1.2);
		// grab points: handrails / foot restraints (sampled along their length) + ladders (along the shaft)
		const rails: V3[] = [];
		game.decks.forEach((d, k) => {
			for (const m of d.modules) {
				const def = CATALOG_BY_ID[m.type];
				if (!def?.restraint) continue;
				for (const t of [-0.5, 0, 0.5]) {
					const [x, z] = localToWorld(m.x, m.z, m.angle, t * def.w, 0);
					rails.push([x, fy[k] + (m.y ?? 0) + def.height / 2, z]);
				}
			}
		});
		for (const s of game.shafts) {
			const y0 = fy[s.from] ?? 0,
				y1 = (fy[s.to] ?? 0) + 1.2;
			for (let y = y0 + 0.3; y <= y1; y += 0.5) rails.push([s.x, y, s.z]);
		}
		this.rails = rails;
		// reachability from the airlock deck
		const k0 = Math.min(game.airlockDeck, game.decks.length - 1);
		const n0 = this.world!.navs[k0];
		const mc = n0?.mainCell() ?? -1;
		const [sx, sz] = mc >= 0 ? n0.pt(mc) : [0, 0];
		const seed = vox.nearestFree(sx, (fy[k0] ?? 0) + 1.05, sz, 2);
		if (seed >= 0) {
			const f = vox.field(seed);
			for (const it of this.items) it.reachable = it.slots.some((s) => s.vc >= 0 && isFinite(f[s.vc]));
		}
	}
	/** start / stop floating for one agent when the mission enters / leaves cruise */
	private enterMicro(a: Agent) {
		const vox = this.vox;
		if (!game.microG || !vox) {
			if (a.m) {
				// gravity returns: drop to the deck under the body
				const nav = this.world!.navs[a.deck];
				const c = nav?.nearestFree(a.x, a.z, 3) ?? -1;
				if (c >= 0) [a.x, a.z] = nav.pt(c);
				a.y = 0;
				a.m = null;
				a.av.q = null;
			}
			return;
		}
		if (!a.m) {
			const fy = game.floorY[a.deck] ?? 0;
			const p = new Vector3(a.x, fy + 0.9 + rand() * 0.4, a.z);
			const q = new Quaternion().setFromAxisAngle(AX.y, a.yaw);
			a.m = {
				p,
				v: new Vector3(),
				q,
				w: new Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.06, 0.16)),
				path: [],
				pi: 0,
				stuck: 0,
				trip: 0,
				tripN: 0,
				tripCov: 0,
				sample: 0,
				dockP: p.clone(),
				dockQ: q.clone(),
				reorient: false
			};
		}
		const m = a.m;
		if (!vox.isFree(m.p.x, m.p.y, m.p.z)) {
			const c = vox.nearestFree(m.p.x, m.p.y, m.p.z, 1.5);
			if (c >= 0) m.p.fromArray(vox.pt(c));
		}
		m.v.set(0, 0, 0);
		m.path = [];
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
		return {
			x,
			z,
			y: s[2] + (m.y ?? 0),
			yaw: m.angle * DEG + s[3] * DEG,
			ax,
			az,
			cell,
			occ: null,
			vc: -1
		};
	}
	/** a place at a group table from a seat object (chair: sit on it; foot restraint: float/stand at it) */
	private seatSlot(nav: ReturnType<typeof buildNav>['navs'][number], t: PlacedModule, st: PlacedModule): ItemSlot {
		const chair = !!CATALOG_BY_ID[st.type]?.seat;
		const yaw = chair ? st.angle * DEG : Math.atan2(t.x - st.x, t.z - st.z);
		const fx = Math.sin(yaw),
			fz = Math.cos(yaw);
		const c0 = nav.nearestFree(st.x - fx * 0.45, st.z - fz * 0.45, 0.9);
		const cell = c0 >= 0 ? c0 : nav.nearestFree(st.x, st.z, 1.2);
		const [ax, az] = cell >= 0 ? nav.pt(cell) : [st.x, st.z];
		return {
			x: st.x,
			z: st.z,
			y: 0,
			yaw,
			ax,
			az,
			cell,
			occ: null,
			vc: -1,
			seat: st.uid
		};
	}
	private markReachability() {
		const w = this.world!;
		// seeds: airlock deck centre-ish free cell + every portal end
		const seeds: { deck: number; cell: number }[] = [];
		const k0 = game.airlockDeck;
		const n0 = w.navs[k0];
		if (n0) {
			const c = n0.mainCell();
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
				id: a.id,
				name: this.name(a),
				role: this.roster[a.id]?.role ?? 'Specialist',
				color: this.roster[a.id]?.color ?? '#888',
				needs: Object.fromEntries(NEED_IDS.map((n) => [n, Math.round(a.needs[n])])) as Record<NeedId, number>,
				action: a.possessed ? `🎮 ${a.action}` : a.action,
				where: this.where(a.deck),
				mood: Math.round(m),
				moodLabel: m > 70 ? '😀 Happy' : m > 50 ? '🙂 Fine' : m > 32 ? '😐 Tense' : '😣 Stressed',
				queue: a.state === 'queue' && it ? `#${it.queue.indexOf(a.id) + 1} of ${it.queue.length} for ${it.label}` : a.state === 'ladder' ? 'waiting for the ladder' : '',
				state: a.state,
				deck: a.deck,
				using:
					it && !it.virtual
						? `${it.def.icon} ${it.label} · ${this.occCount(it)}/${it.slots.length}${it.group ? ' seated' : ''}${it.queue.length ? ` · ${it.queue.length} queued` : ''}${a.plan ? ` · meal: ${a.plan.phase === 'prep' ? a.plan.tags.map((t) => STEP_LABEL[t]).join(' → ') || 'to table' : a.plan.phase}` : ''}`
						: '',
				rates: Object.fromEntries(NEED_IDS.map((n) => [n, Math.round(a.rate[n] * 10) / 10])) as Record<NeedId, number>,
				effects: a.effects.map((e) => {
					const d = EFFECTS[e.id];
					return { id: e.id, icon: d?.icon ?? '•', label: d?.label ?? e.id, src: e.src, left: Math.max(0, Math.round(e.minutes - (this.clock - e.t0))), good: !d || Object.values(d.rates ?? {}).reduce((s2, v) => s2 + (v as number), 0) >= 0 };
				})
			};
		});
	}

	// ---------- main step ----------
	step(dtReal: number) {
		if (!this.enabled) return;
		// the player's avatar keeps real-time speed on slow frames: wall-clock delta (the render loop's
		// delta is capped), ≤ 1 s per frame, 0.1 s sub-steps
		const now = typeof performance !== 'undefined' ? performance.now() : 0;
		const wall = this.lastStepAt > 0 ? (now - this.lastStepAt) / 1000 : dtReal;
		this.lastStepAt = now;
		const dtPlayer = Math.min(Math.max(dtReal, wall), 1);
		dtReal = Math.min(dtReal, 0.25);
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
		for (let k = 0; k < sub; k++) for (const a of this.agents) this.updateAgent(a, h, h * speed, launch);
		if (speed > 0 && this.micro) this.avoid3(dtReal * Math.min(speed, 16));
		else if (speed > 0 && speed <= 16) this.avoid(dtReal * Math.min(speed, 4));
		// possessed agent moves at real speed whatever the sim speed
		const p = this.possessed !== null ? this.agents[this.possessed] : null;
		if (p) for (let t = dtPlayer; t > 1e-6; t -= 0.1) this.updatePossessed(p, Math.min(t, 0.1));
		for (const a of this.agents) this.guard(a);
		this.doorStep(dtReal * Math.max(1, Math.min(speed, 4)));
		for (const a of this.agents) this.syncAvatar(a, dtReal * Math.max(1, Math.min(speed, 4)));
		if (speed > 0) {
			this.accumulate(simMin);
			this.powerStep(simMin);
		}
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
			const fx = this.effectRates(a);
			for (const n of NEED_IDS) {
				const d = (sleeping ? (SLEEP_DECAY[n] ?? 0) : DECAY[n] * (n === 'comfort' && (a.state === 'move' || a.state === 'queue') ? 1.4 : 1)) * fx.mul[n];
				a.needs[n] = clamp(a.needs[n] + ((fx.add[n] - d) * simMin) / 60);
				if (a.needs[n] < 20) this.critical[n] += simMin;
			}
			this.expireEffects(a);
		}
		if (a.possessed) {
			if (a.state === 'use') this.updateUse(a, simMin);
			return;
		}
		if (this.micro) {
			if (!a.m) this.enterMicro(a);
			return this.updateMicro(a, dt * (this.running ? this.speed : 0), simMin);
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
					if (a.item && a.item.queue[0] !== a.id && rand() < 0.3) {
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
				if (!launch) ((a.state = 'idle'), (a.idleLeft = 0));
				break;
			case 'noseat':
				if (!launch) ((a.state = 'idle'), (a.idleLeft = 0));
				break;
		}
	}

	private updateUse(a: Agent, simMin: number) {
		const it = a.item,
			af = a.aff;
		if (!it || !af) return (a.state = 'idle');
		if (a.dock < 1) return;
		// door sequence: the session runs only once inside with the door settled
		if (a.door && a.door !== 'in') return;
		a.useLeft -= simMin;
		let social = 0;
		if (af.social) for (const o of this.agents) if (o !== a && o.item === it && o.state === 'use' && o.aff?.social) social++;
		const cf = it.virtual ? 1 : condFactor(it.cond);
		let capped = 0,
			pos = 0;
		for (const [n, r] of Object.entries(af.needs) as [NeedId, number][]) {
			// working rate: scaled by condition, diminishing near 100, capped per session
			const rate = r > 0 ? r * cf * diminish(a.needs[n]) : r;
			let d = (rate * simMin) / 60;
			if (r > 0) {
				pos++;
				const cap = af.cap?.[n];
				const got = a.gained[n] ?? 0;
				if (cap !== undefined) {
					d = Math.max(0, Math.min(d, cap - got));
					if (got + d >= cap - 1e-6) capped++;
				}
				a.gained[n] = got + d;
				if (d > 0) a.effects = a.effects.filter((e) => EFFECTS[e.id]?.clearOn !== n);
			}
			a.needs[n] = clamp(a.needs[n] + d);
			a.direct[n] = (a.direct[n] ?? 0) + d;
		}
		if (social) a.needs.fun = clamp(a.needs.fun + (22 * social * simMin) / 60);
		if (a.useLeft <= 0 || (af.until && a.needs[af.until] >= 97) || (pos > 0 && capped === pos && !af.step)) {
			this.finishUse(a);
		}
	}
	private finishUse(a: Agent) {
		const it = a.item;
		if (it && a.aff?.id === 'service' && it.needsService && !it.broken) {
			it.cond = afterService(it.life, it.hours);
			it.sinceService = 0;
			it.serviceWait = 0;
			it.serviced++;
			this.refreshLife(it);
			this.log(`🔧 ${this.name(a)} maintained the ${it.label} (${this.where(it.deck)}) → ${Math.round(it.cond)} %`);
		}
		if (it && a.aff?.id === 'repair' && it.broken) {
			const replace = it.hours > it.life.life;
			const need = it.life.spares * (replace ? 3 : 1);
			if (this.sparesLeft() >= need) {
				this.sparesUsed += need;
				it.broken = false;
				it.repairs++;
				it.serviceWait = 0;
				if (replace) (it.cond = 100), (it.hours = 0);
				else it.cond = afterRepair(it.life, it.hours);
				it.sinceService = 0;
				this.refreshLife(it);
				this.log(`🛠 ${this.name(a)} ${replace ? 'replaced' : 'repaired'} the ${it.label} (${this.where(it.deck)}) – ${need} spare kit${need > 1 ? 's' : ''} used, ${this.sparesLeft()} left`);
			}
		}
		if (a.aff?.after?.length) {
			const frac = Math.max(0.25, Math.min(1, 1 - Math.max(0, a.useLeft) / Math.max(1, a.useTotal)));
			for (const ae of a.aff.after) this.addEffect(a, ae.id, it?.label ?? '', ae.minutes, (ae.k ?? 1) * frac);
		}
		// door: open, step out, close – the release happens once outside (doorStep → endUse)
		if (it?.door && a.door) {
			a.door = 'exit';
			a.doorAbort = false;
			a.useLeft = 0;
			return;
		}
		// no door: blend back out of the use pose to the approach point first (reverse of docking)
		if (it && a.dock > 0 && a.use && a.state === 'use') {
			a.door = 'out';
			a.doorAbort = false;
			a.useLeft = 0;
			return;
		}
		this.endUse(a);
	}
	/** session over and outside: free the place, plan the next step */
	private endUse(a: Agent) {
		const plan = a.plan,
			af = a.aff;
		this.release(a, true);
		a.state = 'idle';
		a.idleLeft = rnd(0.5, 3);
		a.action = 'Thinking';
		if (plan && af) {
			a.plan = plan;
			if (af.step) plan.tags = plan.tags.filter((t) => !af.step!.includes(t));
			else if (plan.phase === 'eat') {
				plan.phase = 'trash';
				plan.tags = plan.trash ? ['trash'] : [];
			}
			this.nextStep(a);
		}
	}
	/** providers of each meal step that are reachable and usable now */
	stepProviders(tag: MealStep) {
		const out: { it: Item; af: Affordance }[] = [];
		for (const it of this.items) {
			if (!it.reachable) continue;
			for (const af of it.affords) if (af.step?.includes(tag) && this.usable(it, af)) out.push({ it, af });
		}
		return out;
	}
	/** travel cost from the agent to an item slot (m) */
	private costFn(a: Agent): (it: Item, s: ItemSlot) => number {
		if (this.micro && a.m) {
			const vox = this.vox!;
			const sc = vox.nearestFree(a.m.p.x, a.m.p.y, a.m.p.z, 1.2);
			const f = sc >= 0 ? vox.field(sc) : null;
			return (_it, s) => (f && s.vc >= 0 ? f[s.vc] : Infinity);
		}
		const w = this.world!;
		const sc = w.navs[a.deck]?.nearestFree(a.x, a.z, 1.5) ?? -1;
		if (sc < 0) return () => Infinity;
		const pc = portalCosts(w, a.deck, sc);
		return (it, s) => (s.cell >= 0 ? travelCost(w, pc, a.deck, it.deck, s.cell).cost : Infinity);
	}
	/** advance a meal plan: next prep step → meal (reserve a free place) → trash */
	private nextStep(a: Agent): boolean {
		const plan = a.plan;
		if (!plan) return false;
		const cost = this.costFn(a);
		while (plan.tags.length) {
			const tag = plan.tags[0];
			let best: { it: Item; af: Affordance; slot: number; c: number } | null = null;
			for (const p of this.stepProviders(tag))
				p.it.slots.forEach((s, i) => {
					if (p.af.slots && i >= p.af.slots.length) return;
					const c = cost(p.it, s) + (s.occ === null ? 0 : 6 + p.it.queue.length * 4);
					if (isFinite(c) && (!best || c < best.c)) best = { it: p.it, af: p.af, slot: i, c };
				});
			if (best) {
				const b = best as { it: Item; af: Affordance; slot: number };
				const ok = this.commit(a, b.it, b.af, b.slot);
				if (ok) a.plan = plan;
				return ok;
			}
			plan.tags.shift(); // optional step without a provider (heat / trash)
		}
		if (plan.phase === 'prep') {
			plan.phase = 'eat';
			let slot = -1,
				bc = Infinity;
			plan.it.slots.forEach((s, i) => {
				if (!plan.it.group && plan.af.slots && i >= plan.af.slots.length) return;
				const c = cost(plan.it, s) + (s.occ === null ? 0 : 1000);
				if (c < bc) ((bc = c), (slot = i));
			});
			if (slot < 0 || !isFinite(bc)) {
				a.plan = null;
				return false;
			}
			const ok = this.commit(a, plan.it, plan.af, slot);
			if (ok) a.plan = plan;
			return ok;
		}
		a.plan = null;
		return false;
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
				if (s) ((a.x = s.ax), (a.z = s.az));
			}
			if (a.m && a.state === 'use') {
				// float off from where the body is (hip), upright
				const av = a.av;
				if (av.q) a.m.p.set(av.x, av.y, av.z);
				else a.m.p.set(av.x, av.y + BODY.hipY, av.z);
				// undock into free, reachable space right away (never left inside the item's volume)
				const vox = this.vox;
				if (vox && !vox.isFree(a.m.p.x, a.m.p.y, a.m.p.z)) {
					let c = vox.nearestFree(a.m.p.x, a.m.p.y, a.m.p.z, 1.2);
					const sl = it.slots[a.slot];
					if (c < 0 && sl && sl.vc >= 0) c = sl.vc;
					if (c >= 0) a.m.p.fromArray(vox.pt(c));
				}
				a.m.q.setFromAxisAngle(AX.y, av.yaw);
				a.m.v.set(0, 0, 0);
			}
			this.serveQueue(it);
		}
		this.stepOffLadder(a);
		if (a.waitingLadder >= 0) a.waitingLadder = -1;
		for (const [p, id] of this.ladderBusy) if (id === a.id) this.ladderBusy.delete(p);
		a.item = null;
		a.aff = null;
		a.slot = -1;
		a.plan = null;
		a.hidden = false;
		a.y = 0;
		a.dock = 1;
		a.door = '';
		a.doorAbort = false;
		a.use = null;
		void finished;
	}
	private stepOffLadder(a: Agent) {
		if (a.climbPhase !== 1) return;
		{
			// climb aborted half-way: step off at the nearer ladder end (never left inside the hatch opening)
			const leg = a.legs[a.leg];
			const p = leg?.kind === 'climb' ? this.world?.portals[leg.portal] : undefined;
			if (p) {
				const top = (leg!.kind === 'climb' && leg!.up ? a.climb : 1 - a.climb) > 0.5;
				const end = top ? p.top : p.bottom;
				a.deck = end.deck;
				a.x = end.x;
				a.z = end.z;
			}
			a.climbPhase = 0;
			a.climb = 0;
			a.y = 0;
			for (const [k, id] of this.ladderBusy) if (id === a.id) this.ladderBusy.delete(k);
		}
	}
	private serveQueue(it: Item) {
		while (it.queue.length) {
			const free = it.slots.findIndex((s) => s.occ === null && s.cell >= 0);
			if (free < 0) return;
			const id = it.queue.shift()!;
			const b = this.agents[id];
			if (!b || b.item !== it) continue;
			if (it.broken && b.aff?.id !== 'repair') {
				// broken while waiting: pick something else
				this.release(b, false);
				b.state = 'idle';
				b.idleLeft = 0.3;
				continue;
			}
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
		const micro = this.micro && a.m ? this.vox! : null;
		const startCell = micro ? 0 : nav.nearestFree(a.x, a.z, 1.5);
		if (startCell < 0) return void (a.idleLeft = 5);
		const pc = micro ? null : portalCosts(w, a.deck, startCell);
		let vf: Float32Array | null = null;
		if (micro) {
			const sc = micro.nearestFree(a.m!.p.x, a.m!.p.y, a.m!.p.z, 1.2);
			if (sc < 0) return void (a.idleLeft = 5);
			vf = micro.field(sc);
		}
		const hour = (this.clock % 1440) / 60;
		const st = this.settings;
		const sleepTime = inWindow(hour, st.sleepStart, st.sleepEnd);
		const workTime = inWindow(hour, st.workStart, st.workEnd);
		const role = this.roster[a.id]?.role ?? 'Specialist';
		const proj = this.projected(a);
		const stepOk = {
			food: this.stepProviders('food').length > 0,
			water: this.stepProviders('water').length > 0
		};
		type Cand = {
			it: Item;
			af: Affordance;
			score: number;
			slot: number;
			via: number;
			cell: number;
		};
		const cands: Cand[] = [];
		const helps: Partial<Record<NeedId, boolean>> = {};
		for (const it of this.items) {
			if (!it.reachable || !it.affords.length) continue;
			for (const af of it.affords) {
				if (!this.usable(it, af)) continue;
				if (af.id === 'repair' && this.sparesLeft() < it.life.spares * (it.hours > it.life.life ? 3 : 1)) continue;
				if (af.roleOnly && !af.roles?.includes(role)) continue;
				if (af.requires && ((af.requires.includes('food') && !stepOk.food) || (af.requires.includes('water') && !stepOk.water))) continue;
				// gain from the needs this affordance satisfies
				let gain = 0;
				const cf = it.virtual ? 1 : condFactor(it.cond);
				for (const [n, r] of Object.entries(af.needs) as [NeedId, number][]) {
					// projected need: active effects (e.g. digesting → not hungry again soon) count as already met
					const v = Math.min(100, a.needs[n] + proj[n]);
					if (r > 0) {
						const urg = Math.pow((100 - v) / 100, 2) * 3 + (v < 20 ? 5 : v < 35 ? 1.5 : 0);
						gain += a.pers[n] * urg * Math.min(100 - v, af.cap?.[n] ?? 100, (r * cf * af.minutes) / 60);
					} else gain += ((r * af.minutes) / 60) * 0.6 * (a.needs[n] < 40 ? 2 : 0.3);
				}
				// after-effects with lasting benefit add a little value (rested, digesting…)
				gain *= 1 + 0.1 * (af.after?.length ?? 0);
				if (gain <= 0.5) continue;
				for (const n of Object.keys(af.needs) as NeedId[]) if ((af.needs[n] ?? 0) > 0) helps[n] = true;
				// schedule bias
				let bias = 1;
				if (af.pose === 'sleep') bias = sleepTime ? (a.needs.energy < 90 ? 3 : 0.6) : a.needs.energy < 25 ? 1 : 0.2;
				else if ((af.needs.work ?? 0) > 0) bias = workTime ? 1.8 : sleepTime ? 0.2 : 0.6;
				else if (sleepTime && a.needs.bladder > 25 && a.needs.hunger > 25) bias = 0.4;
				// role-based work: crew prefer the tasks of their role (engineers fix things, scientists garden…)
				if (af.roles) bias *= af.roles.includes(role) ? 1.6 : 0.55;
				if (af.id === 'service') bias *= 1.5 + it.serviceWait / 180; // overdue maintenance gets urgent
				if (af.id === 'repair') bias *= 2.5 + it.serviceWait / 120; // broken equipment: repair first
				// best slot (free first; else queue)
				let bestSlot = -1,
					bestCost = Infinity,
					bestVia = -1,
					bestCell = -1;
				it.slots.forEach((s, i) => {
					if (s.cell < 0 || (!it.group && i >= (af.slots?.length ?? it.slots.length))) return;
					const tc = vf ? { cost: s.vc >= 0 ? vf[s.vc] : Infinity, via: -1 } : travelCost(w, pc!, a.deck, it.deck, s.cell);
					const c = tc.cost + (s.occ === null ? 0 : 1000);
					if (c < bestCost) ((bestCost = c), (bestSlot = i), (bestVia = tc.via), (bestCell = s.cell));
				});
				if (bestSlot < 0 || !isFinite(bestCost)) continue;
				let wait = 0;
				if (bestCost >= 1000) {
					bestCost -= 1000;
					const remaining = Math.min(...this.agents.filter((o) => o.item === it && o.state === 'use').map((o) => o.useLeft), af.minutes);
					wait = remaining + it.queue.length * af.minutes;
				}
				const urgent = Object.keys(af.needs).some((n) => a.needs[n as NeedId] < 20 && (af.needs[n as NeedId] ?? 0) > 0);
				// faster / better items preferred: the same gain in less time scores higher
				const score = (gain * bias * rnd(0.85, 1.15)) / (1 + bestCost / 12 + wait / (urgent ? 60 : 12)) / (1 + af.minutes / 600);
				cands.push({
					it,
					af,
					score,
					slot: bestSlot,
					via: bestVia,
					cell: bestCell
				});
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
		let r = rand() * tot;
		let pick = top[0];
		for (const c of top) if ((r -= c.score * c.score) <= 0) ((pick = c), (r = Infinity));
		if (pick.af.requires) {
			// multi-step meal: collect food → rehydrate → heat, then eat, then trash
			const req = pick.af.requires;
			a.plan = {
				tags: req.filter((t) => t !== 'trash'),
				it: pick.it,
				af: pick.af,
				phase: 'prep',
				trash: req.includes('trash') && this.stepProviders('trash').length > 0
			};
			if (!this.nextStep(a)) ((a.idleLeft = 3), (a.plan = null));
			return;
		}
		this.commit(a, pick.it, pick.af, pick.slot, micro ? undefined : startCell);
	}
	/** can this affordance be used in the current mission (micro-g restraints / gravity-only items)? */
	usable(it: Item, af: Affordance) {
		if (it.broken && af.id !== 'repair') return false;
		if ((it.shed || it.brown) && af.id !== 'repair' && af.id !== 'service') return false;
		if (!game.microG) return af.gravity !== false;
		const m = af.micro ?? 'restraint';
		return m === 'ok' || (m === 'restraint' && it.restrained);
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
		const dx = Math.sin(ang),
			dz = Math.cos(ang);
		const off = 0.75 + idx * 0.6;
		const c = nav.nearestFree(s.ax + dx * off, s.az + dz * off, 1.2);
		return c >= 0 ? c : s.cell;
	}
	private wander(a: Agent) {
		if (this.micro && a.m) {
			const vox = this.vox!;
			for (let t = 0; t < 30; t++) {
				const d = new Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.8, 2.5)).add(a.m.p);
				const c = vox.cell(d.x, d.y, d.z);
				if (c >= 0 && vox.free[c] && vox.deckOf[c] === a.deck && this.route3(a, d.x, d.y, d.z)) {
					a.action = 'Floating around';
					a.item = null;
					return;
				}
			}
			a.idleLeft = rnd(5, 15);
			a.action = 'Drifting';
			return;
		}
		const nav = this.world!.navs[a.deck];
		for (let t = 0; t < 30; t++) {
			const ang = rand() * Math.PI * 2,
				r = rnd(0.5, 2.5);
			const x = a.x + Math.cos(ang) * r,
				z = a.z + Math.sin(ang) * r;
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
		this.stepOffLadder(a); // re-routed mid-climb: step off at the nearer end first
		const w = this.world!;
		if (this.micro && a.m) {
			const [x, z] = w.navs[deck].pt(cell);
			return this.route3(a, x, (game.floorY[deck] ?? 0) + 1.05, z);
		}
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
	/** follow the legs; `mul` overrides the sim-speed multiplier (the player's avatar moves in real time) */
	private updateMove(a: Agent, dt: number, simMin: number, mul?: number) {
		const speedMul = mul ?? (this.running ? this.speed : 0);
		let dist = this.walkSpeed() * dt * speedMul;
		const leg = a.legs[a.leg];
		if (!leg) return this.arrive(a);
		if (leg.kind === 'walk') {
			while (dist > 0 && a.pt < leg.pts.length) {
				const [tx, tz] = leg.pts[a.pt];
				const dx = tx - a.x,
					dz = tz - a.z;
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
			// the player's avatar waits its turn only while the sim runs (a paused crew member would block it forever)
			if (busy !== undefined && busy !== a.id && !(a.possessed && !(this.running && this.speed > 0))) {
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
			if (busy === undefined || busy === a.id) this.ladderBusy.set(leg.portal, a.id);
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
				if (this.ladderBusy.get(leg.portal) === a.id) this.ladderBusy.delete(leg.portal);
				a.leg++;
				a.pt = 0;
				a.climbPhase = 0;
				if (a.leg >= a.legs.length) this.arrive(a);
			}
		}
	}
	private arrive(a: Agent) {
		const it = a.item;
		if (a.m) {
			a.m.dockP.copy(a.m.p);
			a.m.dockQ.copy(a.m.q);
			this.endTrip(a);
		}
		if (!it) {
			a.state = 'idle';
			a.idleLeft = rnd(3, 12);
			a.action = a.possessed ? 'Under your control' : 'Relaxing';
			return;
		}
		if (game.phase === 'launch' && !a.aff && it.seats[a.slot]?.occ === a.id) {
			a.state = 'strapped';
			a.action = `Strapped in (${it.label})`;
			a.dock = 0;
			a.dockFrom = [a.x, a.z];
			this.beginUse(a, it);
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
		a.useTotal = a.useLeft;
		a.gained = {};
		a.dock = 0;
		a.dockFrom = [a.x, a.z];
		this.beginUse(a, it);
		it.uses++;
		if (a.queuedAt && it.waits) {
			/* waits counted when served */
		}
		a.action = `${af.label} (${it.label})`;
	}

	// ---------- doors ----------
	/** why the door of an item won't open for this use (null = it opens); repair / service crews open it by hand */
	doorBlocked(it: Item, af: Affordance | null): string | null {
		const d = it.door;
		if (!d) return null;
		const fix = af?.id === 'repair' || af?.id === 'service';
		if (it.broken && !fix) return `${d.label} jammed (broken)`;
		if (d.powered && (it.shed || it.brown) && !fix) return `${d.label} won't open (no power)`;
		return null;
	}
	/**
	 * Exact use transform of a place: the affordance's own slot (position, facing, pose) when the item's
	 * places come from it, else the reserved place (group chairs, generated places, launch seats).
	 */
	useXf(it: Item, af: Affordance | null, slot: number, strapped = false): UseXf | null {
		const s = strapped ? it.seats[slot] : it.slots[slot];
		if (!s) return null;
		const own = !strapped && af && it.ownSlots && s.seat === undefined ? af.slots?.[slot] : undefined;
		if (own && it.at) {
			const [x, z] = localToWorld(it.at.x, it.at.z, it.at.angle, own[0], own[1]);
			return { x, z, y: own[2] + it.at.y, yaw: it.at.angle * DEG + own[3] * DEG, pose: own[4] ?? af!.pose };
		}
		return { x: s.x, z: s.z, y: strapped ? 0 : s.y, yaw: s.yaw, pose: strapped ? 'couch' : (af?.pose ?? 'stand') };
	}
	/** start the docking blend (and the door sequence) towards the exact use transform */
	private beginUse(a: Agent, it: Item) {
		a.use = this.useXf(it, a.aff, a.slot, a.state === 'strapped');
		a.dockYaw = a.yaw;
		a.doorAbort = false;
		a.door = it.door && a.state === 'use' ? 'open' : '';
	}
	/** the door would not open: give up (AI picks something else, the player gets told why) */
	private doorFail(a: Agent, it: Item, why: string) {
		const msg = `${it.label}: ${why}`;
		if (a.possessed) game.flash(msg);
		this.log(`${this.name(a)}${a.possessed ? ' (you)' : ''}: ${msg}`);
		this.release(a, false);
		a.state = 'idle';
		a.idleLeft = a.possessed ? 0 : rnd(0.5, 2);
		a.action = a.possessed ? 'Under your control' : 'Thinking';
	}
	/** stepped out after the door opened: the session ends (completed or stopped) */
	private doorOut(a: Agent) {
		if (a.doorAbort) {
			this.release(a, false);
			a.state = 'idle';
			a.idleLeft = a.possessed ? 0 : rnd(0.5, 2);
			a.action = a.possessed ? 'Under your control' : 'Thinking';
			return;
		}
		this.endUse(a);
		if (a.possessed) a.action = 'Under your control';
	}
	/** stop using: through the door (open, step out, close) when inside; true = deferred to the door sequence */
	private leaveUse(a: Agent): boolean {
		if (a.state !== 'use' || !a.item) return false;
		if (a.door === 'exit' || a.door === 'out') return true;
		if (!a.item.door) {
			// stand up: reverse blend to the approach point
			if (a.dock <= 0 || !a.use) return false;
			a.door = 'out';
			a.doorAbort = true;
			return true;
		}
		if (!a.door || a.door === 'open') return false;
		a.door = 'exit';
		a.doorAbort = true;
		return true;
	}
	/** advance every agent's door sequence, then move the doors towards what their users need */
	private doorStep(dt: number) {
		const want = new Map<Item, number>();
		for (const a of this.agents) {
			const it = a.item;
			if (!it || a.state !== 'use' || !a.door) continue;
			if (!it.door) {
				if (a.door === 'out' && a.dock <= 0) this.doorOut(a);
				continue;
			}
			const d = it.door;
			let w = 1;
			switch (a.door) {
				case 'open': {
					const why = this.doorBlocked(it, a.aff);
					if (why) {
						this.doorFail(a, it, why);
						continue;
					}
					if (it.dOpen >= 0.999) a.door = 'enter';
					break;
				}
				case 'enter':
					if (a.dock >= 1) a.door = d.private ? 'close' : 'in';
					break;
				case 'close':
					w = 0;
					if (it.dOpen <= 0.001) a.door = 'in';
					break;
				case 'in':
					w = d.private ? 0 : 1;
					break;
				case 'exit':
					if (it.dOpen >= 0.999) a.door = 'out';
					break;
				case 'out':
					if (a.dock <= 0) {
						this.doorOut(a);
						continue;
					}
					break;
			}
			want.set(it, Math.max(want.get(it) ?? 0, w));
		}
		for (const it of this.items) {
			if (!it.door) continue;
			const target = want.get(it) ?? (it.door.restOpen ? 1 : 0);
			const prev = it.dOpen;
			const st = dt / it.door.dur;
			it.dOpen = target > it.dOpen ? Math.min(target, it.dOpen + st) : Math.max(target, it.dOpen - st);
			it.dMoving = it.dOpen !== prev;
			doorOpen.set(it.key, it.dOpen);
		}
		this.reserveSwings();
	}
	/** a swinging door's arc is reserved: anyone standing in it (other than its user) steps aside */
	private reserveSwings() {
		if (this.micro || !this.world) return;
		for (const it of this.items) {
			if (!it.dMoving || !it.door || it.door.kind !== 'hinge') continue;
			const m = game.decks[it.deck]?.modules.find((mm) => mm.uid === it.uid);
			const f = m && keepoutFootprint(m);
			if (!m || !f || f.kind !== 'rect') continue;
			const nav = this.world.navs[it.deck];
			for (const a of this.agents) {
				if (a.item === it || a.deck !== it.deck || a.climbPhase === 1 || (a.state !== 'idle' && a.state !== 'move' && a.state !== 'queue')) continue;
				if (!containsPoint(f, a.x, a.z)) continue;
				const [lx, lz] = worldToLocal(f.cx, f.cz, f.angle, a.x, a.z);
				const opts: [number, number][] = [
					[lx, f.hd + 0.06],
					[-f.hw - 0.06, lz],
					[f.hw + 0.06, lz]
				];
				opts.sort((p, q) => Math.hypot(p[0] - lx, p[1] - lz) - Math.hypot(q[0] - lx, q[1] - lz));
				for (const [ox, oz] of opts) {
					const [wx, wz] = localToWorld(f.cx, f.cz, f.angle, ox, oz);
					if (nav && !nav.isFree(wx, wz)) continue;
					a.x = wx;
					a.z = wz;
					break;
				}
			}
		}
	}

	/** simple separation steering between walking agents on the same deck */
	private avoid(dt: number) {
		const w = this.world!;
		for (const a of this.agents) {
			if (a.state !== 'move' || a.climbPhase === 1 || a.possessed) continue;
			let px = 0,
				pz = 0,
				n = 0;
			for (const b of this.agents) {
				if (a === b || b.deck !== a.deck || b.hidden || b.state === 'use' || b.state === 'strapped' || b.climbPhase === 1) continue;
				const dx = a.x - b.x,
					dz = a.z - b.z;
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
			const nx = a.x + px * k,
				nz = a.z + pz * k;
			if (nav.isFree(nx, nz)) ((a.x = nx), (a.z = nz));
			const hc = this.heatIndex(a.deck, a.x, a.z);
			if (hc >= 0) this.congestion[a.deck][hc] += dt;
		}
	}

	// ---------- avatar sync ----------
	private syncAvatar(a: Agent, dtAnim: number) {
		const av = a.av;
		av.t += dtAnim;
		if (this.micro && a.m) return this.syncMicro(a, dtAnim);
		av.q = null;
		const fy = game.floorY[a.deck] ?? 0;
		let pose: PoseName = 'stand';
		let x = a.x,
			z = a.z,
			y = fy + a.y,
			yaw = a.yaw;
		a.hidden = false;
		av.from = undefined;
		av.mix = 1;
		const it = a.item;
		if (a.state === 'move') pose = a.climbPhase === 1 ? 'climb' : 'walk';
		else if (a.state === 'queue' || a.state === 'ladder' || a.state === 'noseat') pose = 'wait';
		else if ((a.state === 'use' || a.state === 'strapped') && it) {
			const u = a.use ?? this.useXf(it, a.aff, a.slot, a.state === 'strapped');
			if (u) {
				a.use = u;
				const dph = a.state === 'use' ? a.door : '';
				// docking blend (≈ DOCK_TIME): hold at the approach point while a door opens, reverse on exit
				const rate = dtAnim / DOCK_TIME;
				if (dph === 'out') a.dock = Math.max(0, a.dock - rate);
				else if (dph !== 'open' && dph !== 'exit') a.dock = Math.min(1, a.dock + rate);
				const t = a.dock;
				const e = smooth(t);
				const [fx, fz] = a.dockFrom;
				if (t >= 1) {
					// snapped exactly onto the use transform
					x = u.x;
					z = u.z;
					y = fy + u.y;
					yaw = u.yaw;
				} else {
					x = fx + (u.x - fx) * e;
					z = fz + (u.z - fz) * e;
					y = fy + u.y * e;
					yaw = lerpAngle(a.dockYaw, u.yaw, e);
				}
				pose = u.pose;
				av.from = 'stand';
				av.mix = e;
				if (dph === 'open' || dph === 'exit') {
					// reaching for the door handle, facing the item
					pose = 'work';
					av.mix = 1;
					if (dph === 'open') yaw = Math.hypot(u.x - fx, u.z - fz) > 0.05 ? Math.atan2(u.x - fx, u.z - fz) : u.yaw;
				}
				if (t >= 1 && dph !== 'exit') a.hidden = a.state === 'use' && !!a.aff?.hidden && (!it.door || (dph === 'in' && it.dOpen < 0.05));
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

	// ---------- micro-g (cruise) ----------
	/** 3D separation between floating crew + hatch congestion bookkeeping */
	private avoid3(dt: number) {
		const vox = this.vox!;
		const free = (a: Agent) => a.m && !a.hidden && a.state !== 'use';
		for (const a of this.agents) {
			if (!free(a) || a.possessed) continue;
			const m = a.m!;
			_v.set(0, 0, 0);
			let n = 0;
			for (const b of this.agents) {
				if (a === b || !free(b)) continue;
				const d = m.p.distanceTo(b.m!.p);
				if (d < 0.6 && d > 1e-4) {
					_v.addScaledVector(_v2.copy(m.p).sub(b.m!.p), (0.6 - d) / d);
					n++;
				}
				if (d < 1.0 && b.id > a.id)
					game.shafts.forEach((s, i) => {
						const top = game.floorY[s.to] ?? 0;
						if (Math.hypot(m.p.x - s.x, m.p.z - s.z) < 0.9 && Math.abs(m.p.y - top) < 1.0) {
							const st = this.hatchStats.get(i) ?? { passes: 0, congestion: 0 };
							st.congestion += dt;
							this.hatchStats.set(i, st);
						}
					});
			}
			if (!n) continue;
			const k = Math.min(1, dt * 3);
			const nx = m.p.x + _v.x * k,
				ny = m.p.y + _v.y * k,
				nz = m.p.z + _v.z * k;
			if (vox.isFree(nx, ny, nz)) m.p.set(nx, ny, nz);
		}
	}
	private updateMicro(a: Agent, T: number, simMin: number) {
		const m = a.m!;
		switch (a.state) {
			case 'idle':
				a.idleLeft -= simMin;
				this.drift(a, T);
				if (a.idleLeft <= 0) this.decide(a);
				break;
			case 'move': {
				let rem = T;
				while (rem > 1e-6 && a.state === 'move') {
					const h = Math.min(rem, 0.1);
					rem -= h;
					this.flyStep(a, h);
				}
				break;
			}
			case 'queue':
				this.drift(a, T, true);
				if (a.item) a.item.waitMin += simMin;
				a.useLeft -= simMin;
				if (a.useLeft <= 0) {
					a.useLeft = 20;
					if (a.item && a.item.queue[0] !== a.id && rand() < 0.3) {
						this.log(`${this.name(a)} gave up waiting for the ${a.item.label}`);
						this.release(a, false);
						a.state = 'idle';
						a.idleLeft = 0;
					}
				}
				break;
			case 'use':
				m.v.set(0, 0, 0);
				this.updateUse(a, simMin);
				break;
			default:
				a.state = 'idle';
				a.idleLeft = 0;
		}
	}
	/** plan a 3D path to a point (voxel Dijkstra field, A*-style descent + smoothing); state → move */
	private route3(a: Agent, x: number, y: number, z: number): boolean {
		const vox = this.vox,
			m = a.m;
		if (!vox || !m) return false;
		const tc = vox.nearestFree(x, y, z, 1.2);
		const sc = vox.nearestFree(m.p.x, m.p.y, m.p.z, 1.2);
		if (tc < 0 || sc < 0) return false;
		const path = vox.path(tc, vox.field(sc));
		if (!path) return false;
		path.reverse();
		m.path = path;
		m.pi = path.length > 1 ? 1 : 0;
		m.stuck = 0;
		m.trip = 0;
		m.tripN = 0;
		m.tripCov = 0;
		a.legs = [];
		a.state = 'move';
		a.stuck = 0;
		return true;
	}
	/** surfaces / handrails within reach → the body can push off or grab */
	private canGrab(p: Vector3, reach = 0.7) {
		return this.vox!.isNear(p.x, p.y, p.z) || this.nearRail(p, reach);
	}
	nearRail(p: Vector3 | V3, r: number) {
		const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
		for (const q of this.rails) if ((q[0] - x) ** 2 + (q[1] - y) ** 2 + (q[2] - z) ** 2 <= r * r) return true;
		return false;
	}
	deckAtY(y: number) {
		let k = 0;
		for (let i = 0; i < game.decks.length; i++) if (y >= (game.floorY[i] ?? 0) - 0.05) k = i;
		return k;
	}
	/** move with collision; returns false when blocked (the body stops, i.e. grabs the surface) */
	private moveBody(a: Agent, h: number): boolean {
		// sub-step so one step never exceeds ¼ voxel (no tunnelling through thin walls / slabs)
		const m = a.m!;
		const n = Math.min(40, Math.max(1, Math.ceil((m.v.length() * h) / (this.vox!.C * 0.25))));
		let ok = true;
		for (let i = 0; i < n; i++) ok = this.moveBody1(a, h / n) && ok;
		return ok;
	}
	private moveBody1(a: Agent, h: number) {
		const m = a.m!,
			vox = this.vox!;
		const nx = m.p.x + m.v.x * h,
			ny = m.p.y + m.v.y * h,
			nz = m.p.z + m.v.z * h;
		let ok = true;
		if (vox.isFree(nx, ny, nz)) m.p.set(nx, ny, nz);
		else if (!vox.isFree(m.p.x, m.p.y, m.p.z)) {
			// in invalid space: never move further; the watchdog (guard) snaps the body back and logs it
			m.v.set(0, 0, 0);
			ok = false;
		} else {
			// slide along the blocked axis, otherwise stop (grab)
			if (vox.isFree(nx, m.p.y, m.p.z)) m.p.x = nx;
			else m.v.x *= -0.15;
			if (vox.isFree(m.p.x, ny, m.p.z)) m.p.y = ny;
			else m.v.y *= -0.15;
			if (vox.isFree(m.p.x, m.p.y, nz)) m.p.z = nz;
			else m.v.z *= -0.15;
			ok = false;
		}
		const nd = this.deckAtY(m.p.y);
		if (nd !== a.deck) {
			// passed a hatch: count traffic at the nearest connection
			let best = -1,
				bd = 1.5;
			game.shafts.forEach((s, i) => {
				const d = Math.hypot(s.x - m.p.x, s.z - m.p.z);
				if (d < bd && ((s.from === a.deck && s.to === nd) || (s.from === nd && s.to === a.deck))) ((bd = d), (best = i));
			});
			if (best >= 0) {
				const st = this.hatchStats.get(best) ?? { passes: 0, congestion: 0 };
				st.passes++;
				this.hatchStats.set(best, st);
			}
			a.deck = nd;
		}
		a.x = m.p.x;
		a.z = m.p.z;
		a.y = m.p.y - (game.floorY[a.deck] ?? 0);
		return ok;
	}
	private flyStep(a: Agent, h: number) {
		const m = a.m!;
		let tgt = m.path[m.pi];
		while (tgt) {
			const last = m.pi >= m.path.length - 1;
			const d = Math.hypot(tgt[0] - m.p.x, tgt[1] - m.p.y, tgt[2] - m.p.z);
			if (d > (last ? 0.1 : 0.3)) break;
			m.pi++;
			tgt = m.path[m.pi];
		}
		if (!tgt) {
			m.v.set(0, 0, 0); // grab at the destination
			this.arrive(a);
			return;
		}
		_v.set(tgt[0] - m.p.x, tgt[1] - m.p.y, tgt[2] - m.p.z);
		let remaining = _v.length();
		for (let k = m.pi; k < m.path.length - 1; k++) remaining += Math.hypot(m.path[k + 1][0] - m.path[k][0], m.path[k + 1][1] - m.path[k][1], m.path[k + 1][2] - m.path[k][2]);
		const want = Math.min(MICRO_V, Math.sqrt(2 * 0.3 * remaining) + 0.04);
		_v.normalize().multiplyScalar(want);
		const contact = this.canGrab(m.p);
		const before = m.v.length();
		// push off / grab only with something in reach; otherwise coast (tiny correction = hand-over-hand drift)
		m.v.lerp(_v, contact ? Math.min(1, h * 5) : Math.min(1, h * 0.25));
		if (contact && before < 0.12 && m.v.length() >= 0.12) this.trips.pushes++;
		const p0x = m.p.x,
			p0y = m.p.y,
			p0z = m.p.z;
		const wantV = _v2.copy(_v);
		if (!this.moveBody(a, h)) {
			// bumped into something: that surface is a push-off point → re-aim at the waypoint, or re-plan
			// from here when the waypoint is no longer in line of sight (momentum carried the body off the path)
			if (this.vox!.los([m.p.x, m.p.y, m.p.z], tgt)) m.v.copy(wantV).multiplyScalar(0.6);
			else {
				const end = m.path[m.path.length - 1];
				if (end && this.route3(a, end[0], end[1], end[2])) return;
			}
		}
		const moved = Math.hypot(m.p.x - p0x, m.p.y - p0y, m.p.z - p0z);
		m.trip += moved;
		m.sample += moved;
		if (m.sample >= 0.25) {
			m.sample = 0;
			m.tripN++;
			if (this.nearRail(m.p, 1.0)) m.tripCov++;
		}
		if (moved < 0.01 * h) {
			m.stuck += h;
			if (m.stuck > 4) {
				m.stuck = 0;
				this.safety.stalls++;
				const end = m.path[m.path.length - 1];
				if (!end || !this.route3(a, end[0], end[1], end[2])) {
					this.release(a, false);
					a.state = 'idle';
					a.idleLeft = rnd(1, 4);
				}
			}
		} else m.stuck = Math.max(0, m.stuck - h);
	}
	/** idle / queued: gentle drift, slow tumble; grab a surface now and then */
	private drift(a: Agent, T: number, hold = false) {
		const m = a.m!;
		if (T <= 0) return;
		let rem = Math.min(T, 30);
		while (rem > 1e-6) {
			const h = Math.min(rem, 0.2);
			rem -= h;
			const sp = m.v.length();
			if (hold || (sp > 0.05 && this.canGrab(m.p))) m.v.multiplyScalar(Math.max(0, 1 - h * 1.5));
			if (!hold && m.v.length() < 0.012) m.v.set(rnd(-1, 1), rnd(-0.5, 0.5), rnd(-1, 1)).normalize().multiplyScalar(0.02);
			this.moveBody(a, h);
		}
	}
	private endTrip(a: Agent) {
		const m = a.m!;
		if (m.trip > 0.5) {
			this.trips.n++;
			this.trips.len += m.trip;
			if (m.tripN && m.tripCov / m.tripN >= 0.8) this.trips.covered++;
		}
		m.trip = m.tripN = m.tripCov = 0;
	}
	/** final posture for an affordance in micro-g */
	private microPose(it: Item, af: Affordance): PoseName {
		if (af.pose === 'sleep') return it.mount === 'wall' ? 'fsleep' : 'sleep';
		if (af.pose === 'sit' || af.pose === 'sitwork' || af.pose === 'eat' || af.pose === 'work' || af.pose === 'wash') return 'fwork';
		return af.pose;
	}
	private syncMicro(a: Agent, dtAnim: number) {
		const m = a.m!,
			av = a.av,
			it = a.item;
		a.hidden = false;
		const fy = game.floorY[a.deck] ?? 0;
		av.from = undefined;
		av.mix = 1;
		if (a.state === 'use' && it && a.aff && it.slots[a.slot]) {
			const s = a.use ?? this.useXf(it, a.aff, a.slot) ?? it.slots[a.slot];
			const pose = this.microPose(it, a.aff);
			const oy = (game.floorY[it.deck] ?? 0) + (pose === 'fwork' ? (it.mount ? 0 : 0) : s.y);
			const dph = a.door;
			if (dph === 'out') a.dock = Math.max(0, a.dock - dtAnim * 1.2);
			else if (dph !== 'open' && dph !== 'exit') a.dock = Math.min(1, a.dock + dtAnim * 1.2);
			if (a.dock >= 1 && dph !== 'exit') {
				av.q = null;
				av.x = s.x;
				av.y = oy;
				av.z = s.z;
				av.yaw = s.yaw;
				av.pose = pose;
				a.hidden = !!a.aff.hidden && (!it.door || (dph === 'in' && it.dOpen < 0.05));
			} else {
				// glide into the restraint: hip → slot hip, orientation → upright facing the item
				const f = frameFor(pose, av.t, 1);
				_q.setFromAxisAngle(AX.y, s.yaw);
				_v.set(0, f.hipY, f.hipZ)
					.applyQuaternion(_q)
					.add(_v2.set(s.x, oy, s.z));
				const t = a.dock * a.dock * (3 - 2 * a.dock);
				const p = _v2.copy(m.dockP).lerp(_v, t);
				_q2.copy(m.dockQ).slerp(_q, t);
				av.q = [_q2.x, _q2.y, _q2.z, _q2.w];
				av.x = p.x;
				av.y = p.y;
				av.z = p.z;
				av.pose = pose;
				// keep the body state in sync so undocking starts from here
				m.q.copy(_q2);
			}
			av.visible = !a.hidden && !(a.possessed && this.firstPerson);
			return;
		}
		const sp = m.v.length();
		const moving = (a.state === 'move' || a.possessed) && sp > 0.08;
		if (moving && !a.possessed) {
			// head-first along the velocity (shortest-arc turn keeps the roll continuous)
			_v.set(0, 1, 0).applyQuaternion(m.q);
			_v2.copy(m.v).normalize();
			_q.setFromUnitVectors(_v, _v2).multiply(m.q);
			m.q.slerp(_q, Math.min(1, dtAnim * 2.2));
		} else if (!a.possessed) {
			// slow tumble
			const w = m.w.length();
			if (w > 1e-5) {
				_q.setFromAxisAngle(_v.copy(m.w).divideScalar(w), w * dtAnim);
				m.q.multiply(_q);
			}
		}
		m.q.normalize();
		av.q = [m.q.x, m.q.y, m.q.z, m.q.w];
		av.x = m.p.x;
		av.y = m.p.y;
		av.z = m.p.z;
		av.pose = moving && sp > 0.15 ? 'fly' : 'float';
		av.visible = !(a.possessed && this.firstPerson);
		void fy;
	}
	/** possessed body in micro-g: 6-DOF look/roll, push-off translation with momentum, grab */
	private possess6(a: Agent, dt: number) {
		const m = a.m!,
			inp = this.input;
		if (inp.lookX || inp.lookY) {
			m.q.multiply(_q.setFromAxisAngle(AX.y, -inp.lookX)).multiply(_q2.setFromAxisAngle(AX.x, inp.lookY));
			inp.lookX = inp.lookY = 0;
			m.reorient = false;
		}
		if (inp.roll) {
			m.q.multiply(_q.setFromAxisAngle(AX.z, inp.roll * 1.3 * dt));
			m.reorient = false;
		}
		if (m.reorient) {
			// back to "deck up": keep the heading, level the body
			_v.set(0, 0, 1).applyQuaternion(m.q);
			const yaw = Math.abs(_v.y) > 0.98 ? Math.atan2(_v2.set(0, 1, 0).applyQuaternion(m.q).x * -Math.sign(_v.y), _v2.z * -Math.sign(_v.y)) : Math.atan2(_v.x, _v.z);
			_q.setFromAxisAngle(AX.y, yaw);
			m.q.slerp(_q, Math.min(1, dt * 3));
			if (m.q.angleTo(_q) < 0.01) (m.q.copy(_q), (m.reorient = false));
		}
		m.q.normalize();
		const fwd = new Vector3(0, 0, 1).applyQuaternion(m.q);
		const right = new Vector3(-1, 0, 0).applyQuaternion(m.q);
		const up = new Vector3(0, 1, 0).applyQuaternion(m.q);
		const dir = fwd.multiplyScalar(inp.f).addScaledVector(right, inp.s).addScaledVector(up, inp.u);
		if (dir.length() > 1) dir.normalize();
		const active = dir.length() > 0.05;
		if (a.state === 'move') {
			if (active) {
				this.cancelTrip(a);
			} else {
				let rem = dt;
				while (rem > 1e-6 && a.state === 'move') {
					const h = Math.min(rem, 0.1);
					rem -= h;
					this.flyStep(a, h);
				}
				if ((a.state as string) === 'idle' && !a.item) a.action = `Arrived on ${this.where(a.deck)}`;
				return;
			}
		}
		if (a.state === 'queue') {
			if (active) this.cancelTrip(a);
			else {
				this.drift(a, dt, true);
				return;
			}
		}
		if (active && (a.state === 'use' || a.state === 'strapped')) {
			if (this.leaveUse(a)) return;
			this.release(a, false);
			a.state = 'idle';
		}
		if (a.state === 'use' || a.state === 'strapped') return;
		const contact = this.canGrab(m.p, 0.8);
		if (active) {
			if (contact) m.v.lerp(dir.multiplyScalar(inp.run ? MICRO_V_FAST : MICRO_V), Math.min(1, dt * 6));
			else m.v.addScaledVector(dir, 0.1 * dt); // nothing to push on: only a feeble wriggle
		}
		if (inp.grab) {
			inp.grab = false;
			if (contact) {
				m.v.set(0, 0, 0);
				game.flash('Grabbed a handhold');
			} else game.flash('Nothing within reach to grab');
		}
		if (m.v.length() > MICRO_V_FAST) m.v.setLength(MICRO_V_FAST);
		this.moveBody(a, dt);
		a.action = m.v.length() > 0.05 ? 'Floating (you)' : 'Holding position (you)';
		a.state = 'idle';
	}
	/** camera frame for the possessed body (first person) */
	povOf(id: number) {
		const a = this.agents[id];
		if (!a?.m) return null;
		return { p: a.m.p, q: a.m.q };
	}
	reorient() {
		const a = this.possessed !== null ? this.agents[this.possessed] : null;
		if (a?.m) a.m.reorient = true;
	}

	// ---------- analytics ----------
	heatIndex(deck: number, x: number, z: number) {
		const R = game.deckRadius[deck] ?? 4.5;
		const M = Math.ceil((2 * R) / this.heatCell);
		const i = Math.floor((x + R) / this.heatCell),
			j = Math.floor((z + R) / this.heatCell);
		return i < 0 || j < 0 || i >= M || j >= M ? -1 : j * M + i;
	}
	private accumulate(simMin: number) {
		for (const a of this.agents) {
			if (a.hidden || a.climbPhase === 1) continue;
			const k = this.heatIndex(a.deck, a.av.x, a.av.z);
			if (k >= 0 && this.heat[a.deck]) this.heat[a.deck][k] += simMin;
		}
		for (const it of this.items) {
			const users = this.agents.filter((a) => a.item === it && a.state === 'use' && a.dock >= 1 && a.aff?.id !== 'repair' && a.aff?.id !== 'service');
			const occ = users.length;
			it.busy += (occ / Math.max(1, it.slots.length)) * simMin;
			if (it.virtual) continue;
			// ---- life cycle: wear by use, calendar aging, MTBF-based failure ----
			if (it.broken) {
				it.downtime += simMin;
				it.serviceWait += simMin;
			} else {
				const dh = ((occ ? occ : 0) + (it.life.alwaysOn ? 1 : 0)) * (simMin / 60);
				it.hours += dh;
				it.sinceService += dh;
				it.cond = Math.max(0, it.cond - wearPerHour(it.life) * dh - (AGING_PER_DAY * simMin) / 1440);
				if (it.needsService) it.serviceWait += simMin;
				if (dh > 0 && rand() < hazard(it.life, it.cond, it.hours) * dh) {
					it.broken = true;
					it.failures++;
					it.serviceWait = 0;
					for (const u of this.agents.filter((x) => x.item === it && x.aff?.id !== 'repair')) {
						this.release(u, false);
						u.state = 'idle';
						u.idleLeft = 0.5;
					}
					this.log(`💥 ${it.label} (${this.where(it.deck)}) broke down – ${this.sparesLeft()} spare kit${this.sparesLeft() === 1 ? '' : 's'} left`);
				}
			}
			this.refreshLife(it);
			// noisy equipment: Comfort debuff for crew nearby while it runs
			const nz = it.def.noise ?? NOISE[it.def.id];
			if (nz && !it.broken && (occ > 0 || nz.always)) {
				const m = game.decks[it.deck]?.modules.find((mm) => mm.uid === it.uid);
				if (m)
					for (const a of this.agents) {
						if (a.deck !== it.deck || a.hidden || users.includes(a) || Math.hypot(a.x - m.x, a.z - m.z) > nz.r) continue;
						this.addEffect(a, 'noise', it.label);
					}
			}
		}
		// net rate of change per need (trend arrows), smoothed over ~10 sim minutes
		const k = Math.min(1, simMin / 10);
		for (const a of this.agents) {
			const prev = (a as Agent & { _prev?: Record<NeedId, number> })._prev;
			if (prev) for (const n of NEED_IDS) a.rate[n] += (((a.needs[n] - prev[n]) * 60) / simMin - a.rate[n]) * k;
			(a as Agent & { _prev?: Record<NeedId, number> })._prev = { ...a.needs };
			a.direct = {};
		}
		if (Math.floor(this.clock) % 5 === 0) this.ui.heatVersion++;
	}
	analytics() {
		const T = Math.max(1, this.elapsed);
		const items = this.items
			.filter((i) => i.affords.length && !i.virtual)
			.map((i) => ({
				deck: this.where(i.deck),
				name: i.label,
				uid: i.uid,
				utilization: Math.round((100 * i.busy) / T),
				uses: i.uses,
				avgWait: i.waits ? i.waitMin / i.waits : 0,
				waits: i.waits,
				maxQueue: i.maxQueue,
				reachable: i.reachable,
				capacity: i.slots.length,
				cond: Math.round(i.cond),
				state: i.lstate,
				hours: i.hours,
				failures: i.failures,
				repairs: i.repairs,
				serviced: i.serviced,
				downtimeMin: i.downtime
			}));
		const ladders =
			this.world?.portals.map((p, k) => ({
				label: game.shaftLabel(p.shaft),
				uses: this.ladderStats.get(k)?.uses ?? 0,
				waitMin: this.ladderStats.get(k)?.waitMin ?? 0
			})) ?? [];
		const crewH = (this.agents.length * T) / 60;
		const critical = NEED_IDS.map((n) => ({
			need: n,
			hours: this.critical[n] / 60,
			pct: crewH ? (100 * this.critical[n]) / 60 / crewH : 0
		}));
		const issues: { sev: 'high' | 'med' | 'low'; text: string }[] = [];
		const supported = new Set<NeedId>();
		for (const i of this.items) if (i.reachable) for (const af of i.affords) for (const [n, r] of Object.entries(af.needs)) if ((r as number) > 0) supported.add(n as NeedId);
		for (const n of NEEDS)
			if (!supported.has(n.id))
				issues.push({
					sev: 'high',
					text: `No reachable equipment satisfies ${n.label} – add one (e.g. ${hint(n.id)})`
				});
		for (const i of items) {
			if (!i.reachable)
				issues.push({
					sev: 'high',
					text: `${i.name} (${i.deck}) use point unreachable for the crew (blocked access / no path)`
				});
			else if (i.avgWait > 4 && i.waits >= 2)
				issues.push({
					sev: i.avgWait > 10 ? 'high' : 'med',
					text: `Bottleneck: ${i.name} (${i.deck}) queue avg ${i.avgWait.toFixed(1)} min over ${i.waits} waits, max queue ${i.maxQueue} – add another unit`
				});
			if (i.utilization > 80 && T > 240)
				issues.push({
					sev: 'med',
					text: `${i.name} (${i.deck}) is a bottleneck: ${i.utilization}% utilization`
				});
			if (i.utilization < 2 && i.uses === 0 && T > 24 * 60)
				issues.push({
					sev: 'low',
					text: `${i.name} (${i.deck}) was never used in ${(T / 1440).toFixed(1)} days`
				});
		}
		for (const c of critical)
			if (c.pct > 4 && crewH > 4)
				issues.push({
					sev: c.pct > 12 ? 'high' : 'med',
					text: `Crew spent ${c.hours.toFixed(1)} h (${c.pct.toFixed(0)}% of crew time) with critical ${NEEDS.find((n) => n.id === c.need)!.label}`
				});
		for (const l of ladders)
			if (l.waitMin > 10)
				issues.push({
					sev: l.waitMin > 40 ? 'med' : 'low',
					text: `Ladder ${l.label}: ${l.waitMin.toFixed(0)} min of waiting in total (${l.uses} climbs) – add a second connection?`
				});
		// congestion hot spots
		this.congestion.forEach((g, k) => {
			let max = 0,
				at = -1;
			for (let i = 0; i < g.length; i++) if (g[i] > max) ((max = g[i]), (at = i));
			if (max > 1.5 && at >= 0) {
				const R = game.deckRadius[k] ?? 4.5;
				const M = Math.ceil((2 * R) / this.heatCell);
				const x = -R + ((at % M) + 0.5) * this.heatCell,
					z = -R + (Math.floor(at / M) + 0.5) * this.heatCell;
				issues.push({
					sev: max > 6 ? 'med' : 'low',
					text: `Congestion on ${this.where(k)} near (${x.toFixed(1)}, ${z.toFixed(1)}) m – crew had to squeeze past each other`
				});
			}
		});
		if (game.phase === 'launch' && game.seats < this.agents.length)
			issues.push({
				sev: 'high',
				text: `Only ${game.seats} couch seats for ${this.agents.length} crew`
			});
		const micro = this.microReport();
		// work capacity: seats at equipment offering real work (≥ 25 Work/h) that is reachable and usable now
		const workSeats = this.items
			.filter((i) => !i.virtual && i.reachable)
			.reduce(
				(sum, i) =>
					sum + Math.max(0, ...i.base.filter((af) => (af.needs.work ?? 0) >= 12 && !af.roleOnly && this.usable(i, af)).map((af) => Math.min(af.slots?.length ?? i.slots.length, i.slots.length))),
				0
			);
		const N = this.agents.length;
		const beds = this.items
			.filter((i) => !i.virtual && i.reachable && !i.broken)
			.reduce((sum, i) => sum + Math.max(0, ...i.base.filter((af) => af.pose === 'sleep' && this.usable(i, af)).map((af) => af.slots?.length ?? 1)), 0);
		if (beds < N)
			issues.push({
				sev: beds < N / 2 ? 'high' : 'med',
				text: `Only ${beds} usable sleep place${beds === 1 ? '' : 's'} for ${N} crew${game.microG ? ' in micro-g (bunks need a restraint / handrail within 1.5 m; crew pods and sleeping bags work as-is)' : ''} – crew queue ~7.5 h for a bed`
			});
		if (workSeats < N)
			issues.push({
				sev: workSeats < N / 2 ? 'high' : 'med',
				text: `Not enough work stations for crew of ${N} (have ${workSeats} seats) – add a Dual Workstation, a Hydroponics rack (2 gardeners) or lockers for inventory work${game.microG ? ', and foot restraints next to them for micro-g' : ''}`
			});
		if (game.microG)
			for (const i of this.items)
				if (!i.virtual && !i.restrained && i.base.some((af) => (af.needs.work ?? 0) >= 12 && (af.micro ?? 'restraint') === 'restraint'))
					issues.push({
						sev: 'med',
						text: `${i.label} (${this.where(i.deck)}): add a foot restraint (or handrail) within 1.5 m so crew can work here in micro-g`
					});
		const spares = this.sparesLeft();
		for (const i of this.items) {
			if (i.virtual) continue;
			if (i.broken) {
				const need = i.life.spares * (i.hours > i.life.life ? 3 : 1);
				issues.push({
					sev: 'high',
					text: `${i.label} broken (${this.where(i.deck)}), ${spares} spare${spares === 1 ? '' : 's'} left${spares < need ? ` – repair needs ${need}: add Storage Lockers (spares)` : ''}`
				});
			} else if (i.needsService && i.serviceWait > 12 * 60)
				issues.push({
					sev: 'med',
					text: `${i.label} (${this.where(i.deck)}) has waited ${(i.serviceWait / 60).toFixed(0)} h for maintenance – no engineer free?`
				});
		}
		const pw = this.powerReport();
		if (pw.shed.length)
			issues.push({ sev: 'high', text: `Power deficit ${(pw.deficit / 1000).toFixed(1)} kW: ${uniq(pw.shed)} unavailable (load shed) – raise supply / battery or lower loads` });
		if (pw.brown.length) issues.push({ sev: 'med', text: `Brownout: ${uniq(pw.brown)} cannot start – start-up peak exceeds the available ${fmtW(pw.avail - pw.load)}` });
		const lost = pw.items.filter((i) => i.unavailMin > 0 && i.state !== 'Shed');
		if (lost.length && !pw.shed.length)
			issues.push({ sev: 'low', text: `Power was short earlier: ${lost.slice(0, 4).map((i) => `${i.name} ${i.unavailMin} min`).join(', ')} unavailable` });
		const plan = this.sparesPlan();
		if (plan.short > 0)
			issues.push({
				sev: plan.short > plan.pool ? 'high' : 'med',
				text: `Spares shortfall: mission (${this.settings.cruiseDays} d cruise + ${this.settings.surfaceDays} d surface) needs ≈${plan.need} spare kits, lockers hold ${plan.pool} – short ${plan.short} (worst: ${plan.rows
					.filter((r) => r.spares > 0)
					.slice(0, 3)
					.map((r) => `${r.name} ${r.spares}`)
					.join(', ')})`
			});
		for (const u of game.unreachable) if (/ of \d+ use points/.test(u.text)) issues.push({ sev: 'med', text: u.text + ' – free the access side' });
		if (this.safety.unstuck)
			issues.push({
				sev: 'low',
				text: `Crew had to be un-stuck ${this.safety.unstuck}× (body left valid space) – report this layout`
			});
		// galley: meal flow steps, seats at group tables, food storage vs mission
		const galley = this.galleyReport();
		issues.push(...galley.issues);
		if (game.microG) {
			for (const u of micro.unusable) issues.push({ sev: 'low', text: `${u.name} (${u.deck}): ${u.why}` });
			if (!micro.toilet)
				issues.push({
					sev: 'high',
					text: 'No zero-g toilet: hygiene / bladder needs cannot be met in cruise – add a Zero-g Toilet'
				});
			if (!micro.exercise)
				issues.push({
					sev: 'high',
					text: 'No micro-g exercise: add a Resistive Exercise Device (ARED) or a harnessed treadmill'
				});
			if (micro.trips >= 3 && micro.coveragePct < 50)
				issues.push({
					sev: 'med',
					text: `Only ${micro.coveragePct.toFixed(0)}% of crew translation paths have a handrail within 1 m – add handrails along the main routes / at hatches`
				});
			for (const h of micro.hatches)
				if (h.congestion > 1)
					issues.push({
						sev: h.congestion > 5 ? 'med' : 'low',
						text: `Hatch ${h.label}: crew met in the opening for ${h.congestion.toFixed(1)} min (${h.passes} passages) – congestion`
					});
		}
		const order = { high: 0, med: 1, low: 2 };
		issues.sort((p, q) => order[p.sev] - order[q.sev]);
		return {
			simHours: T / 60,
			items,
			spares: { left: spares, used: this.sparesUsed, plan },
			ladders,
			critical,
			issues,
			micro,
			galley,
			safety: { unstuck: this.safety.unstuck, stalls: this.safety.stalls }
		};
	}
	/** meal-flow coverage, group-table seats and food-days estimate */
	galleyReport() {
		const issues: { sev: 'high' | 'med' | 'low'; text: string }[] = [];
		const meals = this.items.filter((i) => !i.virtual && i.reachable && i.base.some((af) => af.requires && this.usable(i, af)));
		const have = Object.fromEntries((['food', 'water', 'heat', 'trash'] as MealStep[]).map((t) => [t, this.stepProviders(t).length])) as Record<MealStep, number>;
		if (meals.length) {
			if (!have.food)
				issues.push({
					sev: 'high',
					text: "No food storage / fridge: crew can't collect meals – add Food Storage Lockers or a Galley Refrigerator"
				});
			if (!have.water)
				issues.push({
					sev: 'high',
					text: "No water dispenser: crew can't rehydrate food – add a Water Dispenser"
				});
			if (!have.heat)
				issues.push({
					sev: 'low',
					text: 'No food warmer: meals are eaten cold – add a Food Warmer / Oven'
				});
			if (!have.trash)
				issues.push({
					sev: 'low',
					text: 'No trash station: packaging piles up at the table – add a Trash Compactor'
				});
		}
		for (const i of this.items)
			if (i.group && !i.slots.length)
				issues.push({
					sev: 'med',
					text: `${i.label} (${this.where(i.deck)}) has no seats – place chairs at its edge (select it → "Add seats")${game.microG ? ' or foot restraints' : ''}`
				});
		const N = Math.max(1, this.agents.length || game.crew);
		const crewDays = game.decks.reduce((s2, d) => s2 + d.modules.reduce((t, m) => t + (CATALOG_BY_ID[m.type]?.foodDays ?? 0), 0), 0);
		const days = crewDays / N;
		const mission = game.microG ? this.settings.cruiseDays : this.settings.surfaceDays;
		if (crewDays > 0 && days < mission)
			issues.push({
				sev: days < 30 ? 'med' : 'low',
				text: `Galley storage holds ${crewDays} crew-days = ${days.toFixed(0)} days for ${N} crew (mission ${mission} d) – the rest must come from cargo / resupply`
			});
		const seats = this.items
			.filter((i) => i.group)
			.map((i) => ({
				name: i.label,
				deck: this.where(i.deck),
				seats: i.slots.filter((s) => s.seat !== undefined).length,
				places: i.slots.length
			}));
		return { issues, steps: have, crewDays, days, seats };
	}
	/**
	 * Mission spares estimate per item: expected failures over cruise + surface days =
	 * use-hours/day (measured in the sim, else typical) × days / MTBF, ×spares per repair,
	 * + replacements where the hours exceed the rated life.
	 */
	sparesPlan() {
		const days = this.settings.cruiseDays + this.settings.surfaceDays;
		const simDays = Math.max(0.25, this.elapsed / 1440);
		const byType = new Map<string, { name: string; n: number; hpd: number; failures: number; spares: number; life: LifeSpec }>();
		for (const i of this.items) {
			if (i.virtual) continue;
			const L = i.life;
			const measured = this.elapsed > 360 ? i.hours / simDays : NaN;
			const hpd = L.alwaysOn ? 24 : Number.isFinite(measured) ? measured : (L.typical ?? 1);
			const hrs = hpd * days;
			const fails = hrs / L.mtbf;
			const repl = Math.max(0, Math.floor(hrs / L.life));
			const sp = fails * L.spares + repl * L.spares * 3;
			const r = byType.get(i.def.id) ?? { name: i.def.name, n: 0, hpd: 0, failures: 0, spares: 0, life: L };
			r.n++;
			r.hpd += hpd;
			r.failures += fails;
			r.spares += sp;
			byType.set(i.def.id, r);
		}
		const rows = [...byType.values()]
			.map((r) => ({ name: r.name, units: r.n, hoursPerDay: +r.hpd.toFixed(1), failures: +r.failures.toFixed(1), spares: Math.ceil(r.spares - 1e-9), mtbf: r.life.mtbf }))
			.sort((a, b) => b.spares - a.spares);
		const need = rows.reduce((s2, r) => s2 + r.spares, 0);
		const pool = this.sparesTotal();
		return { days, rows, need, pool, short: Math.max(0, need - pool) };
	}
	/** cruise analytics: hatch traffic, path lengths, handrail coverage, items unusable in micro-g */
	microReport() {
		const hatches = game.shafts.map((s, i) => ({
			label: game.shaftLabel(s),
			passes: this.hatchStats.get(i)?.passes ?? 0,
			congestion: this.hatchStats.get(i)?.congestion ?? 0
		}));
		const unusable: { deck: string; name: string; why: string }[] = [];
		let toilet = false,
			exercise = false;
		for (const it of this.items) {
			const bad: string[] = [];
			for (const af of it.affords) {
				const m = af.micro ?? 'restraint';
				const ok = m === 'ok' || (m === 'restraint' && it.restrained);
				if (ok && it.reachable) {
					if ((af.needs.bladder ?? 0) > 0) toilet = true;
					if ((af.needs.fitness ?? 0) > 0) exercise = true;
				}
				if (m === 'no') bad.push(`${af.label} unusable in micro-g`);
				else if (!ok) bad.push(`${af.label} without restraints`);
			}
			if (bad.length)
				unusable.push({
					deck: this.where(it.deck),
					name: it.label,
					why: bad.length === it.affords.length ? `${it.label} without restraints / unusable in micro-g (${bad.join(', ')}) – add a handrail or foot restraint within 1.5 m` : bad.join(', ')
				});
		}
		const t = this.trips;
		return {
			hatches,
			unusable,
			toilet,
			exercise,
			trips: t.n,
			pushes: t.pushes,
			avgPath: t.n ? t.len / t.n : 0,
			totalPath: t.len,
			coveragePct: t.n ? (100 * t.covered) / t.n : 0
		};
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
		L.push('MICRO-G (CRUISE)');
		L.push(
			`trips,${a.micro.trips},avg_path_m,${a.micro.avgPath.toFixed(2)},total_path_m,${a.micro.totalPath.toFixed(1)},handrail_coverage_pct,${a.micro.coveragePct.toFixed(1)},zero_g_toilet,${a.micro.toilet},micro_g_exercise,${a.micro.exercise}`
		);
		L.push('hatch,passages,congestion_min');
		for (const h of a.micro.hatches) L.push([q(h.label), h.passes, h.congestion.toFixed(2)].join(','));
		L.push('unusable_equipment,deck,reason');
		for (const u of a.micro.unusable) L.push([q(u.name), q(u.deck), q(u.why)].join(','));
		L.push('');
		L.push('LIFE CYCLE');
		L.push('deck,equipment,uid,state,condition_pct,hours_used,failures,repairs,maintenance,downtime_h');
		for (const i of a.items) L.push([q(i.deck), q(i.name), i.uid, q(i.state), i.cond, i.hours.toFixed(2), i.failures, i.repairs, i.serviced, (i.downtimeMin / 60).toFixed(2)].join(','));
		L.push(`spares_left,${a.spares.left},spares_used,${a.spares.used},mission_days,${a.spares.plan.days},mission_spares_needed,${a.spares.plan.need},locker_pool,${a.spares.plan.pool},shortfall,${a.spares.plan.short}`);
		L.push('item_type,units,use_h_per_day,mtbf_h,expected_failures,spares_needed');
		for (const r of a.spares.plan.rows) L.push([q(r.name), r.units, r.hoursPerDay, r.mtbf, r.failures, r.spares].join(','));
		L.push('');
		const pw = this.powerReport();
		L.push('POWER');
		L.push(`supply_w,${Math.round(pw.supply)},load_w,${Math.round(pw.load)},peak_load_w,${Math.round(pw.peakLoad)},battery_kwh,${pw.soc.toFixed(2)},battery_pct,${pw.socPct.toFixed(0)},shed_events,${this.bus.shedEvents},brownouts,${this.bus.brownEvents}`);
		L.push('deck,equipment,uid,priority,state,draw_w,energy_kwh,unavailable_min,standby_w,active_w,peak_w,duty');
		for (const i of pw.items) L.push([q(this.where(i.deck)), q(i.name), i.uid, i.prio, i.state, i.draw, i.kwh.toFixed(3), i.unavailMin, i.standby, i.active, i.peak, i.duty].join(','));
		L.push('');
		L.push(`SAFETY,unstuck,${a.safety.unstuck},stalled_trips_replanned,${a.safety.stalls},layout_changes,${this.safety.layoutChanges},layout_nudged,${this.safety.nudged},layout_replanned,${this.safety.replanned}`);
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

	// ---------- walk mode: the player's avatar ----------
	/** Walk mode (F) embodies a crew member: possession with the walk HUD, 3rd person by default */
	embodied = $state(false);
	/** the crew sim was started only for walk mode (stopped again on leaving it) */
	private autoStarted = false;
	/** pick the selected crew member, else the nearest one on the viewed deck; starts the sim if needed */
	embody(deck = game.current, x = 0, z = 0): boolean {
		if (game.crew < 1) return false;
		if (!this.enabled) {
			this.start();
			this.autoStarted = true;
		}
		if (!this.agents.length) return false;
		let id = this.selected !== null && this.agents[this.selected] ? this.selected : -1;
		if (id < 0) {
			const pos = (a: Agent) => (a.m ? [a.m.p.x, a.m.p.z] : [a.x, a.z]);
			const sorted = [...this.agents].sort((p, q) => (p.deck === deck ? 0 : 100) + Math.hypot(pos(p)[0] - x, pos(p)[1] - z) - ((q.deck === deck ? 0 : 100) + Math.hypot(pos(q)[0] - x, pos(q)[1] - z)));
			id = sorted[0].id;
		}
		this.possess(id);
		this.firstPerson = false;
		this.embodied = true;
		this.log(`Walk mode: you are ${this.name(this.agents[id])}`);
		return true;
	}
	/** leave walk mode: release the avatar (and stop the sim if walk mode started it) */
	disembody() {
		this.embodied = false;
		if (this.possessed !== null) this.possess(null);
		if (this.autoStarted) {
			this.autoStarted = false;
			this.stop();
		}
	}

	// ---------- possession ----------
	possess(id: number | null) {
		if (this.possessed !== null) {
			const old = this.agents[this.possessed];
			if (old) {
				old.possessed = false;
				if (old.state !== 'use') ((old.state = 'idle'), (old.idleLeft = 1));
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
		if (this.micro) this.firstPerson = true;
		game.section = false;
		game.selectDeck(a.deck);
		this.log(`You took control of ${this.name(a)}`);
	}
	private updatePossessed(a: Agent, dt: number) {
		if (this.micro && a.m) return this.possess6(a, dt);
		const nav = this.world!.navs[a.deck];
		const { f, s } = this.input;
		const steering = Math.hypot(f, s) > 0.05;
		// E on equipment / a ladder: the avatar walks there itself (nav path, ladder reservation, queue);
		// any movement input cancels (except half-way up a ladder)
		if (a.state === 'move' || a.state === 'ladder' || a.state === 'queue') {
			if (steering && a.climbPhase !== 1) {
				this.cancelTrip(a);
			} else if (a.state === 'queue') {
				return;
			} else {
				const leg = a.legs[a.leg];
				// the player walks at 1.35 m/s (2.4 running) and climbs at ~0.9 m/s, whatever the sim speed
				const mul = leg?.kind === 'climb' ? 2 : (this.input.run ? 2.4 : 1.35) / this.walkSpeed();
				this.updateMove(a, dt, dt, mul);
				if (a.state === 'move' || a.state === 'ladder') return;
				if (a.state === 'idle') a.action = 'Under your control';
				if (game.current !== a.deck) game.selectDeck(a.deck);
				return;
			}
		}
		if (steering && a.state !== 'use' && !nav.isFree(a.x, a.z)) {
			// standing inside an inflated obstacle (e.g. just left an enclosed unit): step out first
			const c = nav.nearestFree(a.x, a.z, 1.5);
			if (c >= 0) [a.x, a.z] = nav.pt(c);
		}
		if (steering) {
			if (a.state === 'use' || a.state === 'strapped') {
				// inside something with a door: open it and step out first (input ignored meanwhile)
				if (this.leaveUse(a)) return;
				this.release(a, false);
				a.state = 'idle';
			}
			// camera yaw: forward = direction the camera looks (yaw of camera)
			const yaw = this.input.yaw;
			const fx = -Math.sin(yaw),
				fz = -Math.cos(yaw);
			const rx = Math.cos(yaw),
				rz = -Math.sin(yaw);
			let mx = fx * f + rx * s,
				mz = fz * f + rz * s;
			const len = Math.hypot(mx, mz);
			if (len > 1) ((mx /= len), (mz /= len));
			const v = (this.input.run ? 2.4 : 1.35) * dt;
			// swept: sub-steps of ≤ 5 cm against the same walkable mask the AI uses
			const n = Math.max(1, Math.ceil(v / 0.05));
			for (let i = 0; i < n; i++) {
				const nx = a.x + (mx * v) / n,
					nz = a.z + (mz * v) / n;
				if (nav.isFree(nx, a.z)) a.x = nx;
				if (nav.isFree(a.x, nz)) a.z = nz;
			}
			a.yaw = Math.atan2(mx, mz);
			a.action = 'Walking (you)';
			a.state = 'idle';
		}
	}
	/** the avatar was walking / flying / queueing to something: stop there, free the reservation */
	cancelTrip(a: Agent, why = 'move to cancel') {
		const what = a.item?.label;
		const wasQueue = a.state === 'queue';
		this.release(a, false);
		a.legs = [];
		a.leg = 0;
		if (a.m) a.m.path = [];
		a.state = 'idle';
		a.action = 'Under your control';
		if (what) this.log(`${this.name(a)} (you): ${wasQueue ? 'left the queue for' : 'stopped going to'} the ${what} (${why})`);
	}
	private quickGain(a: Agent, af: Affordance) {
		return Object.entries(af.needs).reduce((s, [n, r]) => s + Math.min(100 - a.needs[n as NeedId], ((r as number) * af.minutes) / 60), 0);
	}
	/** ladder (gravity) whose lower end (up) / opening (down) is within 1 m of the agent; −1 none */
	ladderNear(a: Agent, up: boolean, reach = 1.0): number {
		if (!this.world) return -1;
		let best = -1,
			bd = reach;
		this.world.portals.forEach((p, k) => {
			const end = up ? p.bottom : p.top;
			if (end.deck !== a.deck) return;
			const d = Math.min(Math.hypot(end.x - a.x, end.z - a.z), Math.hypot(p.shaft.x - a.x, p.shaft.z - a.z));
			if (d <= bd) ((bd = d), (best = k));
		});
		return best;
	}
	/** micro-g: hatch column touching the agent's deck within reach (horizontal 1.2 m) */
	private hatchNear(a: Agent): { s: (typeof game.shafts)[number]; to: number } | null {
		if (!a.m) return null;
		let best: { s: (typeof game.shafts)[number]; to: number } | null = null,
			bd = 1.2;
		for (const s of game.shafts) {
			if (s.from !== a.deck && s.to !== a.deck) continue;
			const d = Math.hypot(s.x - a.m.p.x, s.z - a.m.p.z);
			if (d <= bd) ((bd = d), (best = { s, to: s.from === a.deck ? s.to : s.from }));
		}
		return best;
	}
	/** what the avatar is doing on its own right now (walking to / queueing for / using / climbing) */
	statusOf(a: Agent): string | null {
		const it = a.item;
		if (a.state === 'move' || a.state === 'ladder') {
			if (a.climbPhase === 1) return 'Climbing…';
			if (a.state === 'ladder') return 'Waiting for the ladder… (move to cancel)';
			if (it) return `${this.micro ? 'Floating' : 'Walking'} to ${it.label}… (move to cancel)`;
			const leg = a.legs[a.leg];
			if (leg?.kind === 'climb') return 'Walking to the ladder… (move to cancel)';
			return this.micro ? 'Auto-flying to the next deck… (move to take over)' : 'Walking… (move to cancel)';
		}
		if (a.state === 'queue' && it) return `Waiting for the ${it.label} (${it.queue.indexOf(a.id) + 1} in queue) · move to cancel`;
		if (a.state === 'use' && it?.door && a.door && a.door !== 'in') {
			const dl = it.door.label;
			return a.door === 'open' || a.door === 'exit'
				? `Opening the ${it.label} ${dl}…`
				: a.door === 'enter'
					? it.door.enter
						? `Stepping into the ${it.label}…`
						: `Using: ${a.aff?.label ?? ''} (${it.label})`
					: a.door === 'close'
						? `Closing the ${dl} behind you…`
						: 'Stepping out…';
		}
		if (a.state === 'use') return `Using: ${a.aff?.label ?? ''}${it ? ` (${it.label})` : ''} · move, E or X to stop`;
		if (a.state === 'strapped') return 'Strapped in · move, E or X to unstrap';
		return null;
	}
	promptFor(a: Agent): string | null {
		if (a.state === 'move' || a.state === 'ladder' || a.state === 'queue') return this.statusOf(a);
		const list = this.actionsFor(a);
		const parts: string[] = [];
		if (a.state === 'use') parts.push(this.statusOf(a)!);
		if (list[0]) parts.push(`E  ${list[0].label}${list.length > 1 ? `  (+${list.length - 1} · Shift+E)` : ''}`);
		return parts.length ? parts.join(' · ') : null;
	}
	/** can the possessed crew member climb (gravity) right now? */
	canClimb(up: boolean) {
		const a = this.possessed !== null ? this.agents[this.possessed] : null;
		return !!a && !this.micro && a.state !== 'move' && this.ladderNear(a, up) >= 0;
	}
	/**
	 * Deck change for the possessed crew member: gravity → climb the ladder within reach (else a hint
	 * names the nearest ladder and rings it); micro-g → auto-fly through the nearest hatch.
	 */
	climb(up: boolean): boolean {
		if (this.possessed === null) return false;
		const a = this.agents[this.possessed];
		if (!a || a.state === 'move') return false;
		if (this.micro && a.m) return this.autoFly(a, up);
		const k = this.ladderNear(a, up, LADDER_REACH);
		if (k < 0) {
			const other = this.ladderNear(a, !up, LADDER_REACH);
			if (other >= 0) {
				game.flash(up ? `This hatch only goes down – look down + E (or PgDn) to Deck ${this.world!.portals[other].bottom.deck + 1}` : `This ladder only goes up – E (or PgUp) to Deck ${this.world!.portals[other].top.deck + 1}`);
				return false;
			}
			this.hintLadder(a, up);
			return false;
		}
		if (a.state === 'use' || a.state === 'strapped' || a.state === 'queue') this.release(a, false);
		const p = this.world!.portals[k];
		const end = up ? p.bottom : p.top;
		// walk to the ladder base (up) / the hatch edge (down) first, then the climb animation
		const walk = Math.hypot(end.x - a.x, end.z - a.z) > 0.25 ? [{ kind: 'walk' as const, deck: a.deck, pts: [[end.x, end.z] as [number, number]] }] : [];
		a.legs = [...walk, { kind: 'climb', portal: k, up }] as Agent['legs'];
		a.leg = 0;
		a.pt = 0;
		a.climbPhase = 0;
		a.state = 'move';
		a.action = `Climbing ${up ? 'up' : 'down'} to Deck ${(up ? p.top.deck : p.bottom.deck) + 1}`;
		return true;
	}
	private hintLadder(a: Agent, up: boolean) {
		const ps = (this.world?.portals ?? []).map((p) => ({ p, end: up ? p.bottom : p.top })).filter((o) => o.end.deck === a.deck);
		const any = ps.length
			? ps
			: (this.world?.portals ?? [])
					.flatMap((p) => [
						{ p, end: p.bottom },
						{ p, end: p.top }
					])
					.filter((o) => o.end.deck === a.deck);
		if (!any.length) return game.flash(up ? 'No ladder up from this deck' : 'No hatch down from this deck');
		const o = any.sort((x, y) => Math.hypot(x.p.shaft.x - a.x, x.p.shaft.z - a.z) - Math.hypot(y.p.shaft.x - a.x, y.p.shaft.z - a.z))[0];
		game.ladderHint = {
			deck: a.deck,
			x: o.p.shaft.x,
			z: o.p.shaft.z,
			until: performance.now() + 4000
		};
		game.flash(`Go to a ladder to change deck – ${game.shaftLabel(o.p.shaft)} is ${Math.hypot(o.p.shaft.x - a.x, o.p.shaft.z - a.z).toFixed(1)} m away (ringed)`);
	}
	/** micro-g autopilot: fly through the nearest hatch to the next / previous deck */
	private autoFly(a: Agent, up: boolean): boolean {
		const to = a.deck + (up ? 1 : -1);
		const cands = game.shafts.filter((s) => (s.from === a.deck && s.to === to) || (s.to === a.deck && s.from === to));
		if (!cands.length) {
			game.flash(up ? 'No hatch up from this deck' : 'No hatch down from this deck');
			return false;
		}
		const m = a.m!;
		const s = cands.sort((p, q) => Math.hypot(p.x - m.p.x, p.z - m.p.z) - Math.hypot(q.x - m.p.x, q.z - m.p.z))[0];
		const acc = shaftAccess(s.x, s.z, s.angle);
		const [x, z] = acc.kind === 'rect' ? [acc.cx, acc.cz] : localToWorld(s.x, s.z, s.angle, 0, 0.85);
		if (a.state === 'use') this.release(a, false);
		if (!this.route3(a, x, (game.floorY[to] ?? 0) + 1.05, z)) {
			game.flash('No free flight path to that hatch');
			return false;
		}
		a.action = `Flying to Deck ${to + 1} (${game.shaftLabel(s)})`;
		return true;
	}
	/** the possessed crew member's facing (crosshair direction) in the xz plane */
	private facing(a: Agent): [number, number] {
		if (a.m) {
			_v.set(0, 0, 1).applyQuaternion(a.m.q);
			const l = Math.hypot(_v.x, _v.z) || 1;
			return [_v.x / l, _v.z / l];
		}
		return [-Math.sin(this.input.yaw), -Math.cos(this.input.yaw)];
	}
	/**
	 * Context actions for E / the Interact button, best first: stop the current activity; ladders
	 * (look up = climb up, look down = climb down); hatches / handholds in micro-g; equipment within
	 * ~1.2 m in front (the one under the crosshair wins), one entry per affordance.
	 */
	actionsFor(a: Agent): CtxAction[] {
		type Sc = CtxAction & { score: number };
		const out: Sc[] = [];
		const micro = this.micro && !!a.m;
		if (a.state === 'use' || a.state === 'strapped') {
			const what = a.state === 'strapped' ? 'Unstrap' : `Stop: ${a.aff?.label ?? 'activity'}${a.item ? ` (${a.item.label})` : ''}`;
			out.push({ label: what, kind: 'stop', score: -100, run: () => this.stopAction() });
		}
		if (a.state === 'move' || a.state === 'ladder' || a.state === 'queue') {
			// on the ladder: E can't do anything until you step off – say so instead of silently ignoring it
			if (a.climbPhase === 1)
				return [
					{
						label: 'Climbing… (E works again once you are off the ladder)',
						kind: 'stop',
						disabled: true,
						run: () => (game.flash('Climbing – wait until you are off the ladder, then press E again'), false)
					}
				];
			const what = a.state === 'queue' ? `Leave the queue (${a.item?.label ?? ''})` : a.item ? `Cancel: walking to ${a.item.label}` : 'Cancel: stop here';
			return [{ label: what, kind: 'stop', run: () => this.stopAction() }];
		}
		const [fx, fz] = this.facing(a);
		const px = a.m ? a.m.p.x : a.x,
			pz = a.m ? a.m.p.z : a.z;
		const angTo = (x: number, z: number) => {
			const dx = x - px,
				dz = z - pz,
				l = Math.hypot(dx, dz);
			if (l < 0.25) return 0;
			return Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / l)));
		};
		if (!micro && this.world) {
			const lookUp = this.input.look > -0.12;
			for (const up of [true, false]) {
				const k = this.ladderNear(a, up, LADDER_REACH);
				if (k < 0) continue;
				const p = this.world.portals[k];
				const to = up ? p.top.deck : p.bottom.deck;
				const d = Math.hypot(p.shaft.x - px, p.shaft.z - pz);
				const cross = angTo(p.shaft.x, p.shaft.z) < 0.35 ? 0.8 : 0;
				out.push({ label: `Climb ${up ? 'up' : 'down'} to Deck ${to + 1}`, kind: 'climb', score: d - 0.4 - cross - (up === lookUp ? 0.6 : 0), run: () => this.climb(up) });
			}
		}
		if (micro) {
			const h = this.hatchNear(a);
			if (h) out.push({ label: `Fly through hatch to Deck ${h.to + 1}`, kind: 'fly', score: Math.hypot(h.s.x - px, h.s.z - pz) + 0.3, run: () => this.climb(h.to > a.deck) });
			if (a.state !== 'use' && a.m!.v.length() > 0.03 && this.canGrab(a.m!.p, 0.8)) out.push({ label: 'Grab handhold', kind: 'grab', score: 1.6, run: () => ((this.input.grab = true), true) });
		}
		const REACH = 1.5,
			FAR_REACH = 4;
		for (const it of this.items) {
			if (it.deck !== a.deck || it.virtual) continue;
			const launch = game.phase === 'launch';
			const slots = launch ? it.seats : it.slots;
			if (!slots.length) continue;
			let afs = launch ? [] : it.affords.filter((af) => this.usable(it, af));
			const unpowered = !afs.length && (it.shed || it.brown) && it.base.length > 0;
			if (!launch && !afs.length && !unpowered && !it.broken) continue;
			// best slot of this item: near, in front, preferably free
			let best = { score: Infinity, i: -1, d: 0, cross: false };
			slots.forEach((s, i) => {
				if (s === undefined) return;
				const d = Math.hypot(s.ax - px, s.az - pz) + (a.m ? Math.max(0, Math.abs(a.m.p.y - (game.floorY[it.deck] ?? 0) - 1.05) - 0.6) : 0);
				const dc = Math.min(d, Math.hypot(s.x - px, s.z - pz));
				if (dc > FAR_REACH) return;
				const ang = Math.min(angTo(s.x, s.z), angTo(s.ax + (s.x - s.ax) * 2, s.az + (s.z - s.az) * 2));
				// beyond arm's reach only what is right under the crosshair (the avatar walks there)
				if (dc > REACH && (ang > 0.22 || a.state === 'use' || a.state === 'strapped')) return;
				if (ang > 1.75 && dc > 0.8) return; // behind you
				const cross = ang < 0.35;
				const sc = dc + ang * 0.5 - (cross ? 0.8 : 0) + (s.occ !== null && s.occ !== a.id ? 0.5 : 0);
				if (sc < best.score) best = { score: sc, i, d: dc, cross };
			});
			if (best.i < 0) continue;
			const slot = best.i,
				s = slots[slot];
			const n = slots.length;
			const seatTag = s.seat !== undefined || (n > 1 && it.group) ? ` (Chair ${slot + 1}/${n})` : '';
			if (launch) {
				out.push({ label: `Strap in (${it.label}${n > 1 ? ` ${slot + 1}/${n}` : ''})`, kind: 'sit', score: best.score, run: () => this.useSlot(a, it, null, slot) });
				continue;
			}
			if (unpowered) {
				out.push({ label: it.door?.powered ? `${it.label}: ${it.door.label} won't open (no power)` : `${it.label}: Unavailable (no power)`, kind: 'use', disabled: true, score: best.score + 0.5, run: () => game.flash(`${it.label}: Unavailable (no power${it.brown ? ` – start-up peak ${fmtW(it.pspec?.peak?.w ?? 0)} exceeds available` : ' – load shed'})`) });
				continue;
			}
			if (it.broken && !afs.length) {
				out.push({ label: `${it.label} broken – no spares`, kind: 'repair', disabled: true, score: best.score + 0.5, run: () => game.flash(`${it.label} is broken and there are no spares left`) });
				continue;
			}
			const full = s.occ !== null && s.occ !== a.id;
			const sorted = [...afs].sort((p, q) => this.quickGain(a, q) - this.quickGain(a, p));
			sorted.forEach((af, j) => {
				const sit = af.pose === 'sit' || af.pose === 'sitwork' || af.pose === 'eat';
				const label = af.id === 'repair' ? `Repair ${it.label}` : sit && seatTag.startsWith(' (Chair') ? `Sit – ${af.label}${seatTag}` : sorted.length === 1 && /^(Rehydrate|Get|Dispose|Heat)/.test(af.label) ? `Use ${it.label} – ${af.label}` : `${af.label} – ${it.label}${seatTag}`;
				out.push({
					label: full ? `Queue for ${it.label} – ${it.door?.private && it.dOpen < 0.05 ? 'occupied' : `full (${this.occCount(it)}/${n})`}${it.queue.length ? ` · ${it.queue.length} waiting` : ''}` : label,
					kind: af.id === 'repair' ? 'repair' : sit ? 'sit' : 'use',
					score: best.score + j * 0.05 + (full ? 1.2 : 0),
					run: () => (full ? this.queueFor(a, it, af) : this.useSlot(a, it, af, slot))
				});
			});
		}
		out.sort((p, q) => p.score - q.score);
		// drop duplicate "full" lines
		const seen = new Set<string>();
		return out.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true))).slice(0, 9).map(({ score: _s, ...o }) => o);
	}
	/** actions for the possessed crew member (the ctx provider while possessing) */
	actions(): CtxAction[] {
		const a = this.possessed !== null ? this.agents[this.possessed] : null;
		return a ? this.actionsFor(a) : [];
	}
	/** E / Enter / Interact button: run the best (or the i-th) context action */
	act(i = 0): boolean {
		const list = this.actions();
		const c = list[i];
		if (!c) {
			game.flash(this.micro ? 'Nothing to interact with within reach' : 'Nothing to interact with here – face equipment or a ladder (within ~1.5 m)');
			return false;
		}
		const r = c.run();
		return !c.disabled && r !== false;
	}
	/** backwards-compatible name: E / Enter / Interact */
	interact(): boolean {
		return this.act(0);
	}
	/** X: stop the current activity (stand up / unstrap / leave the queue) */
	stopAction(): boolean {
		const a = this.possessed !== null ? this.agents[this.possessed] : null;
		if (!a) return false;
		if ((a.state === 'move' || a.state === 'ladder') && a.climbPhase !== 1) {
			this.cancelTrip(a, 'X / E');
			return true;
		}
		if (a.state !== 'use' && a.state !== 'strapped' && a.state !== 'queue') return false;
		const what = a.aff?.label ?? (a.state === 'strapped' ? 'Strapped in' : 'queue');
		if (this.leaveUse(a)) {
			this.log(`${this.name(a)} (you): stopped ${what} – stepping out`);
			return true;
		}
		this.release(a, false);
		a.state = 'idle';
		a.action = 'Under your control';
		this.log(`${this.name(a)} (you): stopped ${what}`);
		return true;
	}
	/** E on a full item: join its queue (walk to the queue spot; served in turn like the crew) */
	private queueFor(a: Agent, it: Item, af: Affordance): boolean {
		if (it.shed || it.brown) return (game.flash(`${it.label}: Unavailable (no power)`), false);
		this.release(a, false);
		const ok = this.commit(a, it, af, it.slots.findIndex((x) => x.occ === null && x.cell >= 0) >= 0 ? it.slots.findIndex((x) => x.occ === null && x.cell >= 0) : 0);
		if (!ok) {
			a.state = 'idle';
			game.flash(`Can't reach the ${it.label}`);
			return false;
		}
		a.action = a.slot >= 0 ? `Walking to ${it.label}` : `Waiting for the ${it.label}`;
		game.flash(a.slot >= 0 ? `A place came free – walking to the ${it.label}` : `${it.label} is full – you're in the queue (${it.queue.length})`);
		return true;
	}
	/** start using an item slot (af null = strap into a launch seat) */
	private useSlot(a: Agent, it: Item, af: Affordance | null, slot: number): boolean {
		if (it.shed || it.brown) {
			game.flash(`${it.label}: Unavailable (no power)`);
			return false;
		}
		const strap = af === null;
		const s = strap ? it.seats[slot] : it.slots[slot];
		if (!s) return false;
		if (s.occ !== null && s.occ !== a.id) {
			game.flash(`${it.label} is full (${this.occCount(it)}/${it.slots.length})`);
			return false;
		}
		this.release(a, false);
		// not at the use point yet: reserve the place and walk / float there (arrive() starts the use)
		const far = a.m ? Math.hypot(s.ax - a.m.p.x, s.az - a.m.p.z) > 0.6 || Math.abs(a.m.p.y - (game.floorY[it.deck] ?? 0) - 1.05) > 0.7 : Math.hypot(s.ax - a.x, s.az - a.z) > 0.3 || a.deck !== it.deck;
		if (far && s.cell >= 0) {
			s.occ = a.id;
			a.item = it;
			a.slot = slot;
			a.aff = af;
			if (!this.routeTo(a, it.deck, s.cell)) {
				this.release(a, false);
				a.state = 'idle';
				game.flash(`Can't find a way to the ${it.label}`);
				return false;
			}
			a.action = `${a.m ? 'Floating' : 'Walking'} to ${it.label}`;
			this.log(`${this.name(a)} (you): going to ${strap ? 'strap in at' : (af?.label ?? 'use')} – ${it.label}`);
			return true;
		}
		s.occ = a.id;
		a.item = it;
		a.slot = slot;
		if (strap) {
			a.aff = null;
			a.state = 'strapped';
		} else {
			a.aff = af;
			a.state = 'use';
			a.useLeft = af.minutes;
			a.useTotal = a.useLeft;
			a.gained = {};
			it.uses++;
		}
		a.dock = 0;
		a.dockFrom = [a.x, a.z];
		this.beginUse(a, it);
		if (a.m) (a.m.dockP.copy(a.m.p), a.m.dockQ.copy(a.m.q), a.m.v.set(0, 0, 0));
		a.action = strap ? 'Strapped in' : af.label;
		this.log(`${this.name(a)} (you): ${a.action} – ${it.label}`);
		return true;
	}
	/** is the agent's body in valid (walkable / flyable, reachable) space? docked / climbing bodies are exempt */
	posValid(a: Agent): boolean {
		if (a.state === 'use' || a.state === 'strapped' || a.climbPhase === 1) return true;
		if (this.micro && a.m) return this.vox!.isFree(a.m.p.x, a.m.p.y, a.m.p.z);
		const nav = this.world?.navs[a.deck];
		return !nav || nav.isFree(a.x, a.z);
	}
	/** watchdog: an agent found in invalid space is snapped to the nearest valid cell and re-plans */
	private guard(a: Agent) {
		if (!this.world || this.posValid(a)) return;
		let ok = false;
		const at =
			this.micro && a.m
				? `${a.m.p.x.toFixed(2)},${a.m.p.y.toFixed(2)},${a.m.p.z.toFixed(2)}`
				: `${a.x.toFixed(2)},${a.z.toFixed(2)} leg ${a.leg}/${a.legs.length} ${a.legs[a.leg]?.kind ?? ''} cp${a.climbPhase}`;
		if (this.micro && a.m) {
			const vox = this.vox!;
			let c = vox.nearestFree(a.m.p.x, a.m.p.y, a.m.p.z, 2);
			if (c < 0) {
				const n0 = this.world.navs[a.deck];
				const mc = n0?.mainCell() ?? -1;
				if (mc >= 0) {
					const [x, z] = n0.pt(mc);
					c = vox.nearestFree(x, (game.floorY[a.deck] ?? 0) + 1.05, z, 2);
				}
			}
			if (c >= 0) (a.m.p.fromArray(vox.pt(c)), a.m.v.set(0, 0, 0), (ok = true));
			a.x = a.m.p.x;
			a.z = a.m.p.z;
			a.y = a.m.p.y - (game.floorY[a.deck] ?? 0);
		} else {
			const nav = this.world.navs[a.deck];
			let c = nav.nearestFree(a.x, a.z, 3);
			if (c < 0) c = nav.mainCell();
			if (c >= 0) (([a.x, a.z] = nav.pt(c)), (ok = true));
		}
		this.safety.unstuck++;
		const ev = {
			t: this.clock,
			who: this.name(a),
			why: `${a.state} @${at}${ok ? '' : ' (no valid cell found)'}`,
			deck: a.deck
		};
		this.safety.events.push(ev);
		if (this.safety.events.length > 50) this.safety.events.shift();
		this.log(`🛟 ${ev.who} unstuck (${this.where(a.deck)}, was ${ev.why})`);
		if (!a.possessed && (a.state === 'move' || a.state === 'queue')) {
			this.release(a, false);
			a.state = 'idle';
			a.idleLeft = 0.5;
		}
	}
	/** test helper: agents currently in invalid space */
	invalidAgents() {
		return this.agents
			.filter((a) => !this.posValid(a))
			.map((a) => ({
				id: a.id,
				state: a.state,
				deck: a.deck,
				x: +a.x.toFixed(2),
				z: +a.z.toFixed(2),
				y: +(a.m?.p.y ?? a.y).toFixed(2)
			}));
	}
	/** seeded randomness for reproducible runs (wear / failures / choices) */
	seed(n: number) {
		setSeed(n);
	}
	// ---------- power bus ----------
	freshBus() {
		return {
			supply: 0,
			load: 0,
			avail: 0,
			/** battery state of charge, kWh */
			soc: this.settings.batteryKWh * 0.8,
			deficit: 0,
			peakLoad: 0,
			lights: 0,
			hist: [] as { t: number; load: number; supply: number; soc: number }[],
			histT: 0,
			shedEvents: 0,
			brownEvents: 0
		};
	}
	bus = this.freshBus();
	prioOf(it: Item): Priority {
		return this.settings.powerPrio[it.def.id + '@' + it.uid] ?? it.pspec?.priority ?? 'Normal';
	}
	setPrio(it: Item, p: Priority) {
		this.settings.powerPrio = { ...this.settings.powerPrio, [it.def.id + '@' + it.uid]: p };
	}
	/** supply now (W): cruise = fixed array output; surface = solar (day curve) or nuclear (constant) */
	supplyW() {
		const S = this.settings;
		if (game.microG || game.phase === 'launch') return S.powerCruiseKW * 1000;
		if (S.surfaceSource === 'nuclear') return S.powerSurfaceKW * 1000;
		const h = (this.clock % 1440) / 60;
		return S.powerSurfaceKW * 1000 * Math.max(0, Math.sin((Math.PI * (h - 6)) / 12));
	}
	/** draw an item would have if switched on now (restore checks) */
	private wouldDraw(it: Item) {
		const p = it.pspec!;
		return p.alwaysOn ? p.active * (p.duty ?? 1) + p.standby * (1 - (p.duty ?? 1)) : p.standby;
	}
	private powerStep(simMin: number) {
		const b = this.bus;
		const dtH = simMin / 60;
		const capKWh = this.settings.batteryKWh;
		b.soc = Math.min(b.soc, capKWh);
		const supply = this.supplyW();
		const maxDis = capKWh > 0 && b.soc > 0.02 * capKWh ? Math.min(5000, capKWh * 250) : 0; // ~C/4 discharge, max 5 kW
		const avail = supply + maxDis;
		let load = 0;
		const powered = this.items.filter((i) => !i.virtual && i.pspec);
		for (const it of powered) {
			const p = it.pspec!;
			const users = this.agents.filter((a) => a.item === it && a.state === 'use').length;
			const active = !it.broken && !it.shed && (!!p.alwaysOn || users > 0);
			let w = 0;
			if (it.broken) it.pstate = 'Broken';
			else if (it.shed) it.pstate = 'Shed';
			else if (active) {
				if (!it.wasActive && p.peak) it.peakLeft = p.peak.s / 60;
				const duty = p.duty ?? 1;
				const avg = p.active * duty + p.standby * (1 - duty);
				if (it.peakLeft > 0 && p.peak) {
					const f = Math.min(1, it.peakLeft / simMin);
					w = p.peak.w * f + avg * (1 - f);
					it.peakLeft -= simMin;
					it.pstate = 'Peak';
				} else {
					w = avg;
					it.pstate = 'Active';
				}
			} else {
				w = p.standby;
				it.pstate = p.standby > 0 ? 'Standby' : 'Off';
			}
			it.wasActive = active;
			it.draw = w;
			load += w;
		}
		// lighting: per deck, on while someone awake is there (ESTIMATE)
		let lights = 0;
		for (let k = 0; k < game.decks.length; k++) lights += this.agents.some((a) => a.deck === k && !(a.state === 'use' && a.aff?.pose === 'sleep')) ? LIGHT_W.on : LIGHT_W.dim;
		load += lights;
		b.lights = lights;
		// load shedding by priority (deferrable first, largest first); critical loads are never shed
		if (load > avail) {
			const cand = powered.filter((i) => !i.shed && !i.broken && i.draw > 0.5 && PRIO_RANK[this.prioOf(i)] > 0).sort((x, y) => PRIO_RANK[this.prioOf(y)] - PRIO_RANK[this.prioOf(x)] || y.draw - x.draw);
			for (const it of cand) {
				if (load <= avail) break;
				load -= it.draw;
				it.shed = true;
				it.shedAt = this.clock;
				it.draw = 0;
				it.pstate = 'Shed';
				it.wasActive = false;
				b.shedEvents++;
				for (const u of this.agents.filter((a) => a.item === it && a.aff?.id !== 'repair' && a.aff?.id !== 'service')) {
					this.release(u, false);
					u.state = 'idle';
					u.idleLeft = 0.3;
				}
				this.log(`⚡ Load shed: ${it.label} (${this.prioOf(it)}) – power deficit`);
			}
		} else {
			// restore with hysteresis: one item at a time, highest priority first, after ≥ 15 min, with 15 % margin
			const shed = powered.filter((i) => i.shed && this.clock - i.shedAt >= 15).sort((x, y) => PRIO_RANK[this.prioOf(x)] - PRIO_RANK[this.prioOf(y)]);
			const it = shed[0];
			if (it) {
				const need = Math.max(this.wouldDraw(it), it.pspec!.peak && it.pspec!.alwaysOn ? it.pspec!.peak.w : 0);
				if (load + need < 0.85 * avail) {
					it.shed = false;
					this.log(`⚡ Power restored: ${it.label}`);
				}
			}
		}
		// brownout: an idle item whose start-up peak (or active draw) would not fit right now
		for (const it of powered) {
			const p = it.pspec!;
			const start = p.peak ? p.peak.w : p.active;
			const was = it.brown;
			it.brown = !it.shed && !it.broken && !it.wasActive && !p.alwaysOn && load - it.draw + start > avail;
			if (it.brown) it.pstate = 'Brownout';
			if (it.brown && !was) b.brownEvents++;
			it.kwh += (it.draw * dtH) / 1000;
			if (it.shed || it.brown) it.unavailMin += simMin;
		}
		// battery
		const net = supply - load;
		if (net >= 0) b.soc = Math.min(capKWh, b.soc + (net * dtH * 0.92) / 1000);
		else b.soc = Math.max(0, b.soc - (-net * dtH) / 0.95 / 1000);
		b.supply = supply;
		b.load = load;
		b.avail = avail;
		const demand = load + powered.filter((i) => i.shed).reduce((s2, i) => s2 + this.wouldDraw(i) + (i.pspec!.alwaysOn ? 0 : i.pspec!.active * 0.5), 0);
		b.deficit = Math.max(0, demand - avail);
		b.peakLoad = Math.max(b.peakLoad, load);
		b.histT += simMin;
		if (b.histT >= 5 || !b.hist.length) {
			b.histT = 0;
			b.hist.push({ t: this.clock, load, supply, soc: capKWh ? b.soc / capKWh : 0 });
			if (b.hist.length > 576) b.hist.shift();
		}
	}
	/** live power state for the HUD meter / drawer */
	powerReport() {
		const b = this.bus;
		const items = this.items
			.filter((i) => !i.virtual && i.pspec)
			.map((i) => ({ key: i.key, deck: i.deck, uid: i.uid, name: i.label, icon: i.def.icon, state: i.pstate, draw: Math.round(i.draw), prio: this.prioOf(i), kwh: +i.kwh.toFixed(2), unavailMin: Math.round(i.unavailMin), standby: i.pspec!.standby, active: i.pspec!.active, peak: i.pspec!.peak?.w ?? 0, duty: i.pspec!.duty ?? 1 }))
			.sort((x, y) => y.draw - x.draw);
		return { supply: b.supply, load: b.load, avail: b.avail, soc: b.soc, socPct: this.settings.batteryKWh ? (100 * b.soc) / this.settings.batteryKWh : 0, deficit: b.deficit, peakLoad: b.peakLoad, lights: b.lights, hist: b.hist, items, shed: items.filter((i) => i.state === 'Shed').map((i) => i.name), brown: items.filter((i) => i.state === 'Brownout').map((i) => i.name) };
	}
	/** spare kits in the lockers (6 per Storage Locker) minus those used */
	sparesUsed = 0;
	sparesTotal() {
		return game.decks.reduce((n, d) => n + d.modules.filter((m) => m.type === 'locker').length, 0) * SPARES_PER_LOCKER;
	}
	sparesLeft() {
		return Math.max(0, this.sparesTotal() - this.sparesUsed);
	}
	/** life state → available tasks (maintenance / repair) */
	private refreshLife(it: Item) {
		if (it.virtual) return;
		it.lstate = lifeState(it.life, it.cond, it.hours, it.sinceService, it.broken);
		const svc = it.lstate === 'Needs maintenance';
		if (svc && !it.needsService) this.log(`⚙ ${it.label} (${this.where(it.deck)}) needs maintenance (${Math.round(it.cond)} %)`);
		it.needsService = svc;
		it.affords = it.broken ? [REPAIR_AF] : svc ? [...it.base, SERVICE_AF] : it.base;
	}
	/** add / refresh a status effect (non-stackable effects restart instead of stacking) */
	addEffect(a: Agent, id: string, src: string, minutes?: number, k = 1) {
		const def = EFFECTS[id];
		if (!def) return;
		const e = { id, src, t0: this.clock, minutes: minutes ?? def.minutes, k };
		const i = def.stack ? -1 : a.effects.findIndex((x) => x.id === id);
		if (i >= 0) a.effects[i] = { ...e, k: Math.max(k, strength(a.effects[i], this.clock)) };
		else a.effects.push(e);
	}
	/** summed effect rates (points/h) and decay multipliers right now */
	effectRates(a: Agent) {
		const add = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
		const mul = Object.fromEntries(NEED_IDS.map((n) => [n, 1])) as Record<NeedId, number>;
		for (const e of a.effects) {
			const def = EFFECTS[e.id];
			const st = strength(e, this.clock);
			if (!def || st <= 0) continue;
			for (const [n, r] of Object.entries(def.rates ?? {}) as [NeedId, number][]) add[n] += r * st;
			for (const [n, m] of Object.entries(def.decayMul ?? {}) as [NeedId, number][]) mul[n] *= 1 - (1 - m) * Math.min(1, st);
		}
		return { add, mul };
	}
	private expireEffects(a: Agent) {
		if (!a.effects.length) return;
		const keep: ActiveEffect[] = [];
		for (const e of a.effects) {
			if (this.clock - e.t0 < e.minutes) keep.push(e);
			else if (EFFECTS[e.id]?.then) {
				const nx = EFFECTS[EFFECTS[e.id].then!];
				if (nx) keep.push({ id: nx.id, src: e.src, t0: this.clock, minutes: nx.minutes, k: e.k });
			}
		}
		a.effects = keep;
	}
	/** expected change of each need over the next ~2 h from active effects (utility AI look-ahead) */
	private projected(a: Agent): Record<NeedId, number> {
		const out = Object.fromEntries(NEED_IDS.map((n) => [n, 0])) as Record<NeedId, number>;
		for (const e of a.effects) {
			const def = EFFECTS[e.id];
			const st = strength(e, this.clock);
			if (!def || st <= 0) continue;
			const rem = Math.min(120, e.minutes - (this.clock - e.t0)) / 60;
			for (const [n, r] of Object.entries(def.rates ?? {}) as [NeedId, number][]) out[n] += r * st * rem * 0.6;
			for (const [n, m] of Object.entries(def.decayMul ?? {}) as [NeedId, number][]) out[n] += DECAY[n] * (1 - m) * st * rem * 0.6;
		}
		return out;
	}
	/** life-cycle info for the selection card */
	itemInfo(deck: number, uid: number) {
		const it = this.items.find((i) => i.deck === deck && i.uid === uid);
		if (!it || it.virtual) return null;
		const s = it.life;
		return {
			cond: Math.round(it.cond), state: it.lstate, hours: +it.hours.toFixed(1), nextService: Math.max(0, s.service - it.sinceService), mtbf: s.mtbf, life: s.life,
			failures: it.failures, repairs: it.repairs, serviced: it.serviced, downtimeH: +(it.downtime / 60).toFixed(1), spares: this.sparesLeft(),
			users: this.agents.filter((a) => a.item === it && a.state === 'use').map((a) => this.name(a)), queued: it.queue.map((q) => this.name(q)), cap: it.slots.length
		};
	}
	occCount(it: Item) {
		return it.slots.filter((s) => s.occ !== null).length;
	}
	/** occupancy of every placed item (badges): users, places, queue, seat objects' state */
	occupancy() {
		const out: {
			key: string;
			deck: number;
			uid: number;
			n: number;
			cap: number;
			q: number;
			seats: { uid: number; occ: boolean }[];
			cond?: number;
			state?: string;
			power?: 'shed' | 'brownout';
			/** private door closed with someone inside */
			door?: 'occupied' | 'open';
		}[] = [];
		for (const it of this.items) {
			if (it.virtual) continue;
			const n = it.slots.filter((s) => s.occ !== null && this.agents[s.occ]?.state === 'use').length;
			out.push({
				key: it.key,
				deck: it.deck,
				uid: it.uid,
				n,
				cap: it.slots.length,
				q: it.queue.length,
				seats: it.slots
					.filter((s) => s.seat !== undefined)
					.map((s) => ({
						uid: s.seat!,
						occ: s.occ !== null && this.agents[s.occ]?.state === 'use'
					})),
				cond: it.broken ? 0 : Math.round(it.cond),
				state: it.lstate,
				power: it.shed ? 'shed' : it.brown ? 'brownout' : undefined,
				door: it.door ? (it.door.private && n > 0 && it.dOpen < 0.05 ? 'occupied' : it.dOpen > 0.05 && !it.door.restOpen ? 'open' : undefined) : undefined
			});
		}
		return out;
	}
	/** test helper: max simultaneous users per item never exceeding places */
	overCapacity() {
		let worst = 0;
		for (const it of this.items) {
			const users = this.agents.filter((a) => a.item === it && a.state === 'use').length;
			worst = Math.max(worst, users - it.slots.length);
			const ids = it.slots.map((s) => s.occ).filter((x) => x !== null);
			if (new Set(ids).size !== ids.length) worst = Math.max(worst, 1);
		}
		return worst;
	}
	/** test/debug helpers */
	agentSnapshot(id: number) {
		const a = this.agents[id];
		return (
			a && {
				deck: a.deck,
				x: a.x,
				z: a.z,
				y: a.y,
				state: a.state,
				action: a.action,
				item: a.item?.label ?? null,
				slot: a.slot,
				needs: { ...a.needs },
				hidden: a.hidden,
				climb: a.climbPhase
			}
		);
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
		if (a.m && this.vox) {
			const c = this.vox.nearestFree(x, (game.floorY[deck] ?? 0) + 1.05, z, 1.5);
			if (c >= 0) a.m.p.fromArray(this.vox.pt(c));
			a.m.v.set(0, 0, 0);
			a.y = a.m.p.y - (game.floorY[deck] ?? 0);
		}
	}
	/** test / debug: door openness + its users' door phases and body positions in item-local coords */
	doorInfo(key: string) {
		const it = this.items.find((i) => i.key === key);
		if (!it?.door) return null;
		const m = game.decks[it.deck]?.modules.find((mm) => mm.uid === it.uid);
		const users = this.agents
			.filter((a) => a.item === it)
			.map((a) => {
				const [lx, lz] = m ? worldToLocal(m.x, m.z, m.angle, a.av.x, a.av.z) : [0, 0];
				return { id: a.id, state: a.state, phase: a.door, dock: +a.dock.toFixed(3), lx: +lx.toFixed(3), lz: +lz.toFixed(3), hidden: a.hidden, pose: a.av.pose };
			});
		return { open: +it.dOpen.toFixed(3), kind: it.door.kind, private: it.door.private, enter: it.door.enter, queue: it.queue.length, w: it.def.w, d: it.def.d, users };
	}
	/** test helper: fly an agent to a point (micro-g) */
	flyTo(id: number, x: number, y: number, z: number) {
		const a = this.agents[id];
		return !!a && this.route3(a, x, y, z);
	}
	itemList() {
		return this.items.map((i) => ({
			key: i.key,
			label: i.label,
			deck: i.deck,
			queue: [...i.queue],
			occ: i.slots.map((s) => s.occ),
			reachable: i.reachable
		}));
	}
}
const HK_DEF = {
	id: 'housekeeping',
	name: 'Housekeeping',
	icon: '🧹',
	shape: 'rect',
	w: 0.5,
	d: 0.5,
	height: 0,
	access: 0,
	mass: 0,
	power: 0,
	cost: 0,
	description: 'virtual'
} as unknown as ModuleDef;
function hint(n: NeedId) {
	return {
		energy: 'a bunk or crew pod',
		hunger: 'a galley or table',
		hygiene: 'a hygiene unit',
		bladder: 'a hygiene unit',
		fitness: 'a treadmill',
		fun: 'a table or couches',
		work: 'a workstation or hydroponics rack',
		comfort: 'seating'
	}[n];
}

export const crew = new CrewSim();
game.getCrewSim = () => (crew.roster.length ? crew.toJSON() : undefined);
game.onCrewSim = (d) => crew.load(d);
