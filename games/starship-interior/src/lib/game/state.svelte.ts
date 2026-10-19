import { egressFor, type EgressCtx, type EgressResult } from './egress';
import { rig } from '$lib/three/cameraRig.svelte';
import { seatSpots, groupSeats } from './groups';
import { CATALOG_BY_ID, LADDER_EXTENSION, SHAFT_MASS_PER_M, footprintArea, starterLayout } from './catalog';
import { analyzeDeck, type DeckAnalysis } from './clearance';
import { bomCSV, elevationSVG, floorPlanSVG } from './exporters';
import { equip } from './equipStore.svelte';
import { PHASE, dimsOf, footprintOf, insideDeck, normAngle, overlaps, shaftFootprint, snapTo } from './geometry';
import {
	BURIAL_MAX,
	BERM_MAX,
		MIN_DECK_RADIUS,
	OPENING_MAX_H,
	OPENING_MAX_H_SPAN,
	OPENING_MAX_W,
	RING_HEIGHT,
	RING_INSERT_MAX,
	STRINGER_COUNT,
	TUNNEL_DIAMETER,
	buildShip,
	defaultHabitat,
	hullRadiusAt,
	sectionRings,
	type DeckSection,
	type DomeId,
	type DomeState,
	type HabitatConfig,
	type LocationId,
	type Opening,
	DOME_HATCH_D
} from './ship';
import {
	AVAILABLE_POWER_W,
	DECK_FLOOR_AREA,
	DECK_HEIGHT_DEFAULT,
	DECK_HEIGHT_MAX,
	DECK_HEIGHT_MIN,
	HABITABLE_VOLUME_LIMIT,
	HULL_INNER_RADIUS,
	SLAB_THICKNESS,
	SNAP_ANGLE,
	SNAP_POS,
	MIN_HEADROOM,
	WALL_MARGIN,
	deckVolume
} from './specs';
import type { Mission, Mount, Deck, LayoutData, Mode, ModuleId, Phase, PlacedModule, Quality, SaveData, SaveDeck, Shaft, Tool } from './types';

const STORAGE_KEY = 'starship-interior:save:v5';
const V4_KEY = 'starship-interior:save:v4';
const V3_KEY = 'starship-interior:save:v3';
const SECTION_ORDER: DeckSection[] = ['lox', 'ch4', 'crew'];
const PHASES: Phase[] = ['surface', 'launch'];
export const PHASE_NAME: Record<Phase, string> = { surface: 'Surface/Cruise', launch: 'Launch/Landing' };
const OLD_KEYS = ['starship-interior:save:v1', 'starship-interior:save:v2'];
/** Magnet distance for aligning a new shaft with an existing one above/below (m). */
const SHAFT_MAGNET = 0.6;

export interface Pt {
	x: number;
	z: number;
}
export interface Check {
	ok: boolean;
	reason: string;
}
export interface ShaftPlan extends Check {
	x: number;
	z: number;
	angle: number;
	from: number;
	to: number;
	/** connection below/above this one snapped to (vertical alignment), if any */
	alignedWith: number | null;
}

/** items mounted with their base above this height do not obstruct floor paths */
export const HEAD_CLEAR = 1.9;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

class GameState {
	decks = $state<Deck[]>([]);
	/** ladder connections: ladder on deck `from` → hatch opening in deck `to` = from + 1 */
	shafts = $state<Shaft[]>([]);
	/** Hatch tool: connect the current deck to the deck below instead of above */
	connectBelow = $state(false);
	/** Vertical-alignment snap for ladder connections (ON by default, independent of position Snap) */
	alignShafts = $state(true);
	/** Alt held (desktop) temporarily disables the alignment snap */
	altHeld = $state(false);
	/** a left/right-drag camera gesture is in progress (hides hover ghost) */
	cameraDragging = $state(false);
	current = $state(0);

	// ---- surface habitat ----
	shipMode = $state<'cabin' | 'habitat'>('cabin');
	hab = $state<HabitatConfig>(defaultHabitat());
	ship = $derived(buildShip(this.hab));
	// ---- crew & mission phase ----
	phase = $state<Phase>('surface');
	/** Launch → Cruise (micro-g) → Landing → Surface */
	mission = $state<Mission>('surface');
	crew = $state(6);
	// ---- wall / ceiling mounting (placement tool) ----
	mountMode = $state<'floor' | 'wall' | 'ceiling'>('floor');
	/** height of a wall-mounted item's base above the floor, m */
	mountHeight = $state(1.0);
	/** cruise build camera: free 6-DOF trackball (roll / upside-down) */
	freeCam = $state(false);
	resetUpTick = $state(0);
	checklist = $state<Record<string, boolean>>({});
	// ---- section view cut ----
	cutFollow = $state(true);
	cutAngle = $state(0);
	cutMode = $state<'half' | 'quarter'>('half');
	cutHeightOn = $state(false);
	cutHeight = $state(30);
	/** live camera azimuth in degrees (set by Scene) for the follow-camera cut */
	camAzDeg = $state(0);
	/** effective cut azimuth (deg): the removed half/wedge faces this direction */
	cutDeg = $derived(this.cutFollow ? this.camAzDeg : this.cutAngle);
	setCutAngle(v: number) {
		this.cutFollow = false;
		this.cutAngle = ((Math.round(v) % 360) + 360) % 360;
	}
	rotateCut(d: number) {
		this.setCutAngle(this.cutDeg + d);
	}
	setCutFollow(on: boolean) {
		if (!on) this.cutAngle = ((Math.round(this.camAzDeg) % 360) + 360) % 360;
		this.cutFollow = on;
	}

	/** Equipment Design mode (workbench replaces the deck view) */
	designer = $state(false);
	tool = $state<Tool>('module');
	selectedModule = $state<ModuleId>('bunk');
	/** placement yaw in degrees */
	rotation = $state(0);
	snap = $state(false);
	mode = $state<Mode>('build');
	section = $state(false);
	clearance = $state(true);
	guides = $state(true);
	quality = $state<Quality>('high');
	/** render every deck regardless of view (used for GLB export) */
	exportAll = $state(false);

	/** pointer on the current deck plane (metres) */
	hover = $state<Pt | null>(null);
	/** touch "confirm" flow: locked ghost position */
	pending = $state<Pt | null>(null);
	confirmPlacement = $state(true);
	twoFingerMode = $state<'rotate' | 'pan'>('rotate');

	selectedUid = $state<number | null>(null);
	hoverUid = $state<number | null>(null);
	/** HUD: left panel drawer open (desktop) */
	sidebarOpen = $state(true);
	/** HUD toggle: show couch envelopes / egress paths / keep-out zones on the current deck */
	showClearances = $state(false);
	/** couch whose egress zones are shown because its issue row was clicked */
	focusEgress = $state<number | null>(null);
	/** module being dragged to a new position */
	drag = $state<{ uid: number; x: number; z: number; moved: boolean } | null>(null);

	/** tape measure: first point, second point */
	measureA = $state<Pt | null>(null);
	measureB = $state<Pt | null>(null);

	// walk mode
	walkDeck = $state(0);
	joystick = $state({ x: 0, y: 0 });
	pointerLocked = $state(false);
	/** walk mode: ladder / hatch within reach (target deck indices, −1 none) */
	hatchHere = $state<{ up: boolean; down: boolean; upTo: number; downTo: number }>({ up: false, down: false, upTo: -1, downTo: -1 });
	/** "go to a ladder" highlight ring (world deck + xz; shown until `until`, performance.now ms) */
	ladderHint = $state<{ deck: number; x: number; z: number; until: number } | null>(null);
	isTouch = $state(false);
	/** set by WalkControls while walk mode is active */
	travel: ((dir: 1 | -1) => void) | undefined = undefined;
	/** set by the crew sim: roster + settings for save files / restore */
	getCrewSim: (() => unknown) | undefined;
	onCrewSim: ((d: unknown) => void) | undefined;
	/** set by the equipment library: receives custom equipment from a save file */
	onEquipment: ((items: unknown[]) => void) | undefined = (items) => equip.merge(items);
	/** set by the equipment library: custom equipment for save files */
	getEquipment: (() => unknown[]) | undefined = () => $state.snapshot(equip.custom);
	/** set by Scene: exports all decks as GLB, returns byte size */
	exportGLB: (() => Promise<number>) | undefined = undefined;

	toast = $state<string | null>(null);
	private toastTimer: ReturnType<typeof setTimeout> | undefined;
	private nextUid = 1;
	private nextDeckId = 1;

	constructor() {
		this.loadLayout(starterLayout());
	}

	// ---------------- derived ----------------
	get deck(): Deck {
		return this.decks[this.current];
	}
	get modules(): PlacedModule[] {
		return this.decks[this.current]?.modules ?? [];
	}

	floorY = $derived.by(() => {
		const ys: number[] = [];
		if (this.shipMode === 'cabin') {
			let y = 0;
			for (const d of this.decks) {
				ys.push(y);
				y += d.height + SLAB_THICKNESS;
			}
			return ys;
		}
		const next: Record<DeckSection, number> = {
			lox: this.ship.spans.lox.y0 + SLAB_THICKNESS,
			ch4: this.ship.spans.ch4.y0 + SLAB_THICKNESS,
			crew: this.ship.spans.crew.y0 + SLAB_THICKNESS
		};
		for (const d of this.decks) {
			ys.push(next[d.section]);
			next[d.section] += d.height + SLAB_THICKNESS;
		}
		return ys;
	});
	/** inner hull radius at standing head height of each deck (nose decks shrink) */
	deckRadius = $derived(
		this.decks.map((d, k) =>
			this.shipMode === 'cabin' ? HULL_INNER_RADIUS : hullRadiusAt(this.ship, this.floorY[k] + Math.min(d.height, MIN_HEADROOM))
		)
	);
	/** hull radius at the floor itself (used to draw the floor disc) */
	floorRadius = $derived(
		this.decks.map((_, k) => (this.shipMode === 'cabin' ? HULL_INNER_RADIUS : hullRadiusAt(this.ship, this.floorY[k])))
	);
	maxR(k = this.current) {
		return (this.deckRadius[k] ?? HULL_INNER_RADIUS) - WALL_MARGIN;
	}
	deckArea(k = this.current) {
		return Math.PI * (this.deckRadius[k] ?? HULL_INNER_RADIUS) ** 2;
	}
	/** first crew deck: the fixed hull airlock is on it */
	airlockDeck = $derived(Math.max(0, this.decks.findIndex((d) => d.section === 'crew')));
	deckLabel(k: number): string {
		const d = this.decks[k];
		if (!d) return '?';
		if (this.shipMode === 'cabin') return `Deck ${k + 1}`;
		if (d.section === 'crew') {
			const isNose = (i: number) => this.floorY[i] >= this.ship.noseBase;
			const nose = isNose(k);
			const n = this.decks.filter((o, i) => o.section === 'crew' && i <= k && isNose(i) === nose).length;
			return `${nose ? 'Nose' : 'Cabin'}-${n}`;
		}
		const same = this.decks.filter((o, i) => o.section === d.section && i <= k).length;
		return `${d.section.toUpperCase()}-${same}`;
	}
	/** decks fully below ground (habitat mode) */
	shielded(k: number): 'full' | 'partial' | 'none' {
		if (this.shipMode !== 'habitat') return 'none';
		const g = this.soilTop;
		const top = this.floorY[k] + this.decks[k].height;
		return top <= g ? 'full' : this.floorY[k] < g ? 'partial' : 'none';
	}
	stackTop = $derived(
		this.decks.length ? this.floorY[this.decks.length - 1] + this.decks[this.decks.length - 1].height : 0
	);
	volume = $derived(
		this.shipMode === 'cabin'
			? this.decks.reduce((s, d) => s + deckVolume(d.height), 0)
			: this.decks.reduce((s, d, k) => s + Math.PI * (this.deckRadius[k] ?? HULL_INNER_RADIUS) ** 2 * (d.height + SLAB_THICKNESS), 0)
	);
	/** geometric volume of converted tanks (habitat mode) */
	reclaimed = $derived(
		this.ship.sections.filter((s) => (s.id === 'lox' || s.id === 'ch4') && this.hab.converted[s.id]).reduce((a, s) => a + s.volume, 0)
	);

	stats = $derived.by(() => {
		let cost = 0;
		let power = 0;
		let mass = 0;
		let count = 0;
		for (const d of this.decks)
			for (const m of d.modules) {
				const def = CATALOG_BY_ID[m.type];
				cost += def.cost;
				power += def.power;
				mass += def.mass;
				count++;
			}
		for (const sh of this.shafts) {
			cost += CATALOG_BY_ID.hatch.cost;
			power += CATALOG_BY_ID.hatch.power;
			mass += CATALOG_BY_ID.hatch.mass + SHAFT_MASS_PER_M * this.shaftLength(sh);
			count++;
		}
		const used =
			this.modules.reduce((s, m) => s + footprintArea(CATALOG_BY_ID[m.type]), 0) +
			this.shaftsOn(this.current).length * footprintArea(CATALOG_BY_ID.hatch);
		return {
			cost,
			power,
			powerAvail: AVAILABLE_POWER_W,
			powerOk: power <= AVAILABLE_POWER_W,
			mass,
			count,
			freeArea: (this.shipMode === 'cabin' ? DECK_FLOOR_AREA : this.deckArea()) - used,
			floorArea: this.shipMode === 'cabin' ? DECK_FLOOR_AREA : this.deckArea(),
			volume: this.volume,
			volumeLimit: this.shipMode === 'cabin' ? HABITABLE_VOLUME_LIMIT : null,
			seats: this.seats
		};
	});

	analysis = $derived.by((): DeckAnalysis | null => (this.clearance && this.deck ? this.analyze(this.current) : null));
	analyze(k: number, phase: Phase = this.phase): DeckAnalysis {
		PHASE.v = phase;
		const r = analyzeDeck(this.decks[k].modules.filter((m) => (m.y ?? 0) < HEAD_CLEAR), k === this.airlockDeck, this.shaftsOn(k), (sh) => this.shaftLabel(sh), this.deckRadius[k] ?? HULL_INNER_RADIUS);
		PHASE.v = this.phase;
		return r;
	}
	seats = $derived(this.decks.reduce((s, d) => s + d.modules.reduce((a, m) => a + (CATALOG_BY_ID[m.type]?.seats ?? 0), 0), 0));
	egressCtx(k: number, modules = this.decks[k].modules): EgressCtx {
		return {
			modules: modules.filter((m) => (m.y ?? 0) < HEAD_CLEAR),
			shafts: this.shaftsOn(k),
			label: (sh) => this.shaftLabel(sh),
			R: this.deckRadius[k] ?? HULL_INNER_RADIUS,
			hasAirlock: k === this.airlockDeck,
			deckLabel: this.deckLabel(k)
		};
	}
	/** couch egress per deck in the envelope of the current phase (deployed in Launch/Landing, stowed otherwise) */
	egress = $derived.by(() =>
		this.decks.map((d, k) => {
			const couches = d.modules.filter((m) => CATALOG_BY_ID[m.type]?.seats);
			if (!couches.length) return [] as EgressResult[];
			const ctx = this.egressCtx(k);
			return couches.map((m) => egressFor(ctx, m, this.phase));
		})
	);
	egressOf(uid: number, k = this.current) {
		return this.egress[k]?.find((e) => e.uid === uid) ?? null;
	}
	/** issue row clicked: go to the couch's deck, select it, frame it and show its zones */
	focusCouch(k: number, uid: number) {
		this.selectDeck(k);
		this.tool = 'select';
		this.selectedUid = uid;
		this.focusEgress = uid;
		const m = this.decks[k].modules.find((mm) => mm.uid === uid);
		if (m) rig.animateTo({ polar: 0.75, dist: 6.5 }, [m.x * 0.7, this.floorY[k] ?? 0, m.z * 0.7], 500);
	}
	/** launch/landing readiness (couch egress in the current phase's envelope) */
	preflight = $derived.by(() => {
		const couchIssues: string[] = [];
		const couchBlocked: { deck: number; uid: number; text: string }[] = [];
		const underHatch: string[] = [];
		this.decks.forEach((d, k) => {
			if (!d.modules.some((m) => CATALOG_BY_ID[m.type]?.seats)) return;
			const a = this.analyze(k, 'launch');
			for (const m of d.modules) {
				const def = CATALOG_BY_ID[m.type];
				if (!def?.seats) continue;
				const e = this.egress[k]?.find((x) => x.uid === m.uid);
				if (e && !e.ok) {
					couchIssues.push(e.text);
					couchBlocked.push({ deck: k, uid: m.uid, text: e.text });
				}
				// falling-object risk: within 1.0 m of the opening above (ladder rising from this deck)
				for (const sh of this.shafts)
					if (sh.from === k && Math.hypot(sh.x - m.x, sh.z - m.z) < 1.0 + Math.max(dimsOf(def, 'launch').d, dimsOf(def, 'launch').w) / 2)
						underHatch.push(`${this.deckLabel(k)}: ${def.name} next to hatch ${this.shaftLabel(sh)} above`);
			}
		});
		const stowables = this.decks.reduce((s, d) => s + d.modules.filter((m) => CATALOG_BY_ID[m.type]?.stowable).length, 0);
		return {
			seatsOk: this.seats >= this.crew,
			couchIssues,
			couchBlocked,
			envelope: this.phase === 'launch' ? 'deployed' : 'stowed',
			underHatch,
			stowables,
			powerOk: this.stats.powerOk
		};
	});

	/** equipment whose crew use points are unreachable (set by the crew sim's nav rebuild) */
	unreachable = $state<{ deck: number; uid: number; text: string }[]>([]);
	/** placed modules that no longer fit (e.g. after editing a custom design): flagged, never deleted */
	invalidPlacements = $derived.by(() => {
		const out: { deck: number; uid: number; text: string }[] = [];
		this.decks.forEach((d, k) => {
			for (const m of d.modules) {
				if (!CATALOG_BY_ID[m.type]) {
					out.push({ deck: k, uid: m.uid, text: `${this.deckLabel(k)}: missing equipment definition ${m.type}` });
					continue;
				}
				const c = this.check(m.type, m.x, m.z, m.angle, m.uid, k);
				if (!c.ok) out.push({ deck: k, uid: m.uid, text: `${this.deckLabel(k)}: ${CATALOG_BY_ID[m.type].name} no longer fits – ${c.reason}` });
			}
		});
		return out;
	});

	/** Decks not reachable from deck 1 (airlock) through shafts. */
	unreachableDecks = $derived.by(() => {
		const n = this.decks.length;
		const seen = new Array<boolean>(n).fill(false);
		seen[this.airlockDeck] = true;
		// decks with a side opening (tunnel / portal) are reachable from outside
		if (this.shipMode === 'habitat')
			for (const o of this.hab.openings) {
				const r = this.openingRange(o);
				this.decks.forEach((d, k) => {
					if (this.floorY[k] < r.y1 && this.floorY[k] + d.height > r.y0) seen[k] = true;
				});
			}
		let changed = true;
		while (changed) {
			changed = false;
			for (const sh of this.shafts)
				if (sh.to < n && seen[sh.from] !== seen[sh.to]) {
					seen[sh.from] = seen[sh.to] = changed = true;
				}
		}
		return seen.map((v, k) => (v ? -1 : k)).filter((k) => k >= 0);
	});

	selected = $derived(this.modules.find((m) => m.uid === this.selectedUid) ?? null);
	selectedShaft = $derived(this.shaftsOn(this.current).find((sh) => sh.uid === this.selectedUid) ?? null);

	// ---------------- shafts ----------------
	shaftsOn(k: number): Shaft[] {
		return this.shafts.filter((sh) => sh.from <= k && k <= sh.to);
	}
	/** Label like "L1-2" (deck pair); a/b suffix when several connect the same pair. */
	shaftLabel(sh: Shaft | number): string {
		const uid = typeof sh === 'number' ? sh : sh.uid;
		const me = this.shafts.find((s) => s.uid === uid);
		if (!me) return 'L?';
		const same = this.shafts.filter((s) => s.from === me.from);
		// habitat: name by deck labels, e.g. "L LOX-2/CH4-1"; cabin: "L1-2"
		const base = this.shipMode === 'habitat' ? `L ${this.deckLabel(me.from)}/${this.deckLabel(me.to)}` : `L${me.from + 1}-${me.to + 1}`;
		return same.length > 1 ? base + String.fromCharCode(97 + same.findIndex((s) => s.uid === uid)) : base;
	}
	/** Ladder length: lower deck floor → upper deck floor + grab-rail extension. */
	shaftLength(sh: Shaft): number {
		return (this.floorY[sh.to] ?? 0) - (this.floorY[sh.from] ?? 0) + LADDER_EXTENSION;
	}

	/**
	 * A connection is valid only if it fits on BOTH decks: ladder + climbing zone on the lower deck,
	 * opening + guard rail on the upper deck. An arriving hatch and a departing ladder on the same
	 * deck may coincide only if exactly aligned (a straight stacked ladder).
	 */
	checkShaft(x: number, z: number, angle: number, from: number, ignoreUid: number | null = null): Check {
		const to = from + 1;
		if (from < 0) return { ok: false, reason: 'No deck below' };
		if (to >= this.decks.length) return { ok: false, reason: 'Add a deck above first' };
		const f = shaftFootprint(x, z, angle);
		const sa = this.decks[from].section;
		const sb = this.decks[to].section;
		if (sa !== sb) {
			const dome = sa === 'lox' ? 'common' : 'forward';
			if (this.hab.domes[dome] === 'intact')
				return { ok: false, reason: `${dome === 'common' ? 'Common' : 'Forward'} dome is intact between ${this.deckLabel(from)} and ${this.deckLabel(to)} – cut it or add a dome hatch` };
			if (this.hab.domes[dome] === 'hatch' && Math.hypot(x, z) > DOME_HATCH_D / 2 - 0.35 + 1e-6)
				return { ok: false, reason: `Must pass through the Ø${DOME_HATCH_D} m ${dome} dome hatch on the axis (≤ ${(DOME_HATCH_D / 2 - 0.35).toFixed(2)} m from centre)` };
		}
		for (const k of [from, to]) {
			const D = `${this.deckLabel(k)} (${k === from ? 'ladder' : 'opening'}): `;
			if (!insideDeck(f, this.maxR(k))) return { ok: false, reason: D + `outside the ${this.maxR(k).toFixed(2)} m usable radius` };
			for (const ph of PHASES) {
				PHASE.v = ph;
				const hit = this.decks[k].modules.find((m) => overlaps(f, footprintOf(m.type, m.x, m.z, m.angle)));
				PHASE.v = this.phase;
				if (hit) return { ok: false, reason: D + `overlaps ${CATALOG_BY_ID[hit.type].name}` + (ph === 'launch' && this.phase !== 'launch' ? ' (in Launch/Landing phase)' : '') };
			}
			for (const o of this.shaftsOn(k)) {
				if (o.uid === ignoreUid || !overlaps(f, shaftFootprint(o.x, o.z, o.angle))) continue;
				const stacked = o.from !== from && Math.hypot(o.x - x, o.z - z) < 0.01;
				if (!stacked) return { ok: false, reason: D + `overlaps ladder ${this.shaftLabel(o)}` };
			}
		}
		return { ok: true, reason: '' };
	}

	get alignActive() {
		return this.alignShafts && !this.altHeld;
	}

	/** Vertical-alignment snap: the connection arriving at deck `from` (from−1→from) or leaving deck `from+1`. */
	alignTarget(x: number, z: number, from: number, ignoreUid: number | null = null): Shaft | null {
		if (!this.alignActive) return null;
		let best: Shaft | null = null;
		let bd = SHAFT_MAGNET;
		for (const sh of this.shafts) {
			if (sh.uid === ignoreUid || (sh.to !== from && sh.from !== from + 1)) continue;
			const d = Math.hypot(sh.x - x, sh.z - z);
			if (d <= bd) {
				bd = d;
				best = sh;
			}
		}
		return best;
	}

	/** Plan a connection from the current deck up (default) or down (toggle). */
	planShaft(p: Pt): ShaftPlan {
		const q = this.snapPt(p);
		let angle = this.snap ? snapTo(this.rotation, SNAP_ANGLE) : this.rotation;
		const from = this.connectBelow ? this.current - 1 : this.current;
		const base = { x: q.x, z: q.z, angle, from, to: from + 1, alignedWith: null };
		if (from < 0) return { ...base, ok: false, reason: 'No deck below' };
		if (from + 1 >= this.decks.length) return { ...base, ok: false, reason: 'Add a deck above first' };
		let { x, z } = q;
		const m = this.alignTarget(x, z, from);
		if (m) {
			x = m.x;
			z = m.z;
			angle = m.angle;
		} else if (this.alignActive && this.decks[from].section !== this.decks[from + 1].section && Math.hypot(x, z) < SHAFT_MAGNET) {
			// through a dome hatch: snap onto the ship axis
			x = 0;
			z = 0;
		}
		return { x, z, angle, from, to: from + 1, alignedWith: m?.uid ?? null, ...this.checkShaft(x, z, angle, from) };
	}

	placeShaft(p: Pt): boolean {
		const plan = this.planShaft(p);
		if (!plan.ok) {
			this.flash(plan.reason);
			return false;
		}
		this.shafts.push({ uid: this.nextUid++, x: plan.x, z: plan.z, angle: normAngle(plan.angle), from: plan.from, to: plan.to });
		const lbl = this.shaftLabel(this.shafts[this.shafts.length - 1]);
		this.flash(`Ladder ${lbl} placed (${this.deckLabel(plan.from)} → ${this.deckLabel(plan.to)})` + (plan.alignedWith !== null ? ` · aligned with ${this.shaftLabel(plan.alignedWith)}` : ''));
		this.autosave();
		return true;
	}

	/** Drop target for a dragged connection (alignment snap applies). */
	shaftDragTarget(uid: number, p: Pt): Pt & { angle: number; alignedWith: number | null } {
		const sh = this.shafts.find((s) => s.uid === uid)!;
		const m = this.alignTarget(p.x, p.z, sh.from, uid);
		return m ? { x: m.x, z: m.z, angle: m.angle, alignedWith: m.uid } : { ...p, angle: sh.angle, alignedWith: null };
	}

	// ---------------- placement rules ----------------
	/** Valid only if valid in BOTH mission phases (current phase checked first). */
	check(type: ModuleId, x: number, z: number, angle: number, ignoreUid: number | null = null, deckIdx = this.current, y = 0): Check {
		const order: Phase[] = this.phase === 'launch' ? ['launch', 'surface'] : ['surface', 'launch'];
		for (const ph of order) {
			PHASE.v = ph;
			const c = this.checkPhase(type, x, z, angle, ignoreUid, deckIdx, y);
			PHASE.v = this.phase;
			if (!c.ok) {
				const def = CATALOG_BY_ID[type];
				const differs = !!def?.launch || this.decks[deckIdx].modules.some((m) => CATALOG_BY_ID[m.type]?.launch);
				return { ok: false, reason: differs ? `${PHASE_NAME[ph]}: ${c.reason}` : c.reason };
			}
		}
		return { ok: true, reason: '' };
	}
	/** vertical extent [y0, y1] of a module above its deck floor */
	vRange(type: ModuleId, y: number, deckIdx: number): [number, number] {
		const def = CATALOG_BY_ID[type];
		if (def.fullHeight) return [0, this.decks[deckIdx]?.height ?? 2.4];
		return [y, y + dimsOf(def).height];
	}
	private checkPhase(type: ModuleId, x: number, z: number, angle: number, ignoreUid: number | null, deckIdx: number, y = 0): Check {
		const def = CATALOG_BY_ID[type];
		const deck = this.decks[deckIdx];
		const h = dimsOf(def).height;
		if (!def.fullHeight && y + h > deck.height + 1e-6)
			return { ok: false, reason: y > 0 ? `Too high: top at ${(y + h).toFixed(2)} m > deck ${deck.height.toFixed(1)} m` : `Too tall: ${h.toFixed(2)} m > deck ${deck.height.toFixed(1)} m` };
		const f = footprintOf(type, x, z, angle);
		const R = this.maxR(deckIdx);
		if (!insideDeck(f, R)) return { ok: false, reason: `Outside the ${(R + WALL_MARGIN).toFixed(2)} m usable radius` };
		const [a0, a1] = this.vRange(type, y, deckIdx);
		for (const m of deck.modules) {
			if (m.uid === ignoreUid) continue;
			const [b0, b1] = this.vRange(m.type, m.y ?? 0, deckIdx);
			if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) continue; // stacked above/below (wall / ceiling mounts)
			if (overlaps(f, footprintOf(m.type, m.x, m.z, m.angle))) return { ok: false, reason: `Overlaps ${CATALOG_BY_ID[m.type].name}` };
		}
		for (const sh of this.shaftsOn(deckIdx))
			if (overlaps(f, shaftFootprint(sh.x, sh.z, sh.angle)))
				return { ok: false, reason: this.shipMode === 'habitat' ? `Overlaps ladder ${this.shaftLabel(sh)}` : `Overlaps ladder ${this.shaftLabel(sh)} (deck ${sh.from + 1}→${sh.to + 1})` };
		return { ok: true, reason: '' };
	}

	snapPt(p: Pt): Pt {
		return this.snap ? { x: snapTo(p.x, SNAP_POS), z: snapTo(p.z, SNAP_POS) } : { x: round(p.x, 3), z: round(p.z, 3) };
	}

	/** effective mounting of an item for the placement tool */
	mountFor(type: ModuleId): 'floor' | 'wall' | 'ceiling' {
		const m: Mount = CATALOG_BY_ID[type]?.mount ?? 'floor';
		return m === 'any' ? this.mountMode : m;
	}
	/**
	 * Placement pose for the pointer position: floor (snap grid), wall (snapped flush to the hull's inner
	 * surface, facing inward, base at mountHeight) or ceiling (under the slab above).
	 */
	placementFor(type: ModuleId, p: Pt, deckIdx = this.current): { x: number; z: number; angle: number; y: number; mount?: 'wall' | 'ceiling' } {
		const mode = this.mountFor(type);
		const def = CATALOG_BY_ID[type];
		const { w, d, height } = dimsOf(def);
		const H = this.decks[deckIdx]?.height ?? 2.4;
		if (mode === 'wall') {
			const R = this.maxR(deckIdx);
			const ang = Math.atan2(p.x, p.z);
			const r = Math.max(0, Math.sqrt(Math.max(0, R * R - (w / 2) ** 2)) - d / 2 - 0.002);
			const y = round(Math.max(0, Math.min(H - height, this.mountHeight)), 3);
			return { x: round(Math.sin(ang) * r, 3), z: round(Math.cos(ang) * r, 3), angle: normAngle(round((ang * 180) / Math.PI + 180, 2)), y, mount: 'wall' };
		}
		if (def?.seat && !this.altHeld) {
			// chairs snap to free table-side spots facing the table (Alt places freely)
			let best: { x: number; z: number; angle: number } | null = null, bd = 0.7;
			for (const t of this.decks[deckIdx]?.modules ?? [])
				for (const sp of seatSpots(t)) {
					const d = Math.hypot(sp.x - p.x, sp.z - p.z);
					if (d < bd) (bd = d), (best = sp);
				}
			if (best) return { x: round(best.x, 3), z: round(best.z, 3), angle: round(best.angle, 2), y: 0 };
		}
		const q = this.snapPt(p);
		const angle = this.snap ? snapTo(this.rotation, SNAP_ANGLE) : this.rotation;
		if (mode === 'ceiling') return { x: q.x, z: q.z, angle, y: round(Math.max(0, H - height), 3), mount: 'ceiling' };
		return { x: q.x, z: q.z, angle, y: 0 };
	}

	/** seat objects of every group table on a deck (micro-g counts foot restraints) */
	seatsOf(tableUid: number, deckIdx = this.current) {
		return groupSeats(this.decks[deckIdx]?.modules ?? [], this.microG).get(tableUid) ?? [];
	}
	/** auto-place chairs on free, valid table-side spots; returns how many were added */
	addSeats(tableUid: number, max = 8, deckIdx = this.current): number {
		const deck = this.decks[deckIdx];
		const t = deck?.modules.find((m) => m.uid === tableUid);
		if (!t || !CATALOG_BY_ID[t.type]?.group) return 0;
		let n = 0;
		for (const sp of seatSpots(t)) {
			if (n >= max) break;
			const x = round(sp.x, 3), z = round(sp.z, 3), angle = round(sp.angle, 2);
			if (!this.check('chair', x, z, angle, null, deckIdx, 0).ok) continue;
			deck.modules.push({ uid: this.nextUid++, type: 'chair', x, z, angle });
			n++;
		}
		if (n) this.autosave();
		this.flash(n ? `Added ${n} chair${n > 1 ? 's' : ''} – table seats ${this.seatsOf(tableUid, deckIdx).length}` : 'No free valid seat spot at this table');
		return n;
	}

	placeAt(p: Pt): boolean {
		if (this.selectedModule === 'hatch') return this.placeShaft(p);
		const q = this.placementFor(this.selectedModule, p);
		const c = this.check(this.selectedModule, q.x, q.z, q.angle, null, this.current, q.y);
		if (!c.ok) {
			this.flash(c.reason);
			return false;
		}
		const m: PlacedModule = { uid: this.nextUid++, type: this.selectedModule, x: q.x, z: q.z, angle: normAngle(q.angle) };
		if (q.mount) (m.mount = q.mount), (m.y = q.y);
		this.deck.modules.push(m);
		this.autosave();
		return true;
	}

	removeModule(uid: number) {
		const si = this.shafts.findIndex((s) => s.uid === uid);
		if (si >= 0) {
			this.shafts.splice(si, 1); // removed from every deck it touched
			if (this.selectedUid === uid) this.selectedUid = null;
			this.autosave();
			return;
		}
		const mods = this.deck.modules;
		const i = mods.findIndex((m) => m.uid === uid);
		if (i >= 0) mods.splice(i, 1);
		if (this.selectedUid === uid) this.selectedUid = null;
		this.autosave();
	}

	deleteSelected() {
		if (this.selectedUid !== null) this.removeModule(this.selectedUid);
	}
	/** copy the selected item next to it (first free spot within 0.6–2 m, same rotation) */
	duplicateSelected(): boolean {
		const m = this.selected;
		if (!m) return false;
		const def = CATALOG_BY_ID[m.type];
		const step = Math.max(def.w, def.d, 0.4) + 0.1;
		for (const r of [step, step * 1.5, step * 2])
			for (let k = 0; k < 12; k++) {
				const a = (k / 12) * Math.PI * 2;
				const x = +(m.x + Math.cos(a) * r).toFixed(3), z = +(m.z + Math.sin(a) * r).toFixed(3);
				if (!this.check(m.type, x, z, m.angle, null, this.current, m.y ?? 0).ok) continue;
				const uid = this.nextUid++;
				this.modules.push({ ...m, uid, x, z });
				this.selectedUid = uid;
				this.autosave();
				this.flash(`Duplicated ${def.name}`);
				return true;
			}
		this.flash('No free spot next to it for a copy');
		return false;
	}

	/** Rotate placement ghost, or the selected module (if it still fits). */
	rotate(delta: number) {
		const sel = this.tool === 'select' ? this.selected : null;
		const sh = this.tool === 'select' ? this.selectedShaft : null;
		if (sh) {
			const a = normAngle(this.snap ? snapTo(sh.angle + delta, SNAP_ANGLE) : sh.angle + delta);
			const c = this.checkShaft(sh.x, sh.z, a, sh.from, sh.uid);
			if (!c.ok) return this.flash('Cannot rotate: ' + c.reason);
			sh.angle = a; // rotates on all decks together
			this.autosave();
		} else if (sel) {
			const a = normAngle(this.snap ? snapTo(sel.angle + delta, SNAP_ANGLE) : sel.angle + delta);
			if (sel.mount === 'wall') return this.flash('Wall-mounted items face the hull centre – move them instead');
			const c = this.check(sel.type, sel.x, sel.z, a, sel.uid, this.current, sel.y ?? 0);
			if (!c.ok) return this.flash('Cannot rotate: ' + c.reason);
			sel.angle = a;
			this.autosave();
		} else {
			this.rotation = normAngle(this.snap ? snapTo(this.rotation + delta, SNAP_ANGLE) : this.rotation + delta);
		}
	}

	commitDrag(): boolean {
		const d = this.drag;
		this.drag = null;
		if (!d || !d.moved) return false;
		const sh = this.shafts.find((s) => s.uid === d.uid);
		if (sh) {
			const t = this.shaftDragTarget(sh.uid, d);
			const c = this.checkShaft(t.x, t.z, t.angle, sh.from, sh.uid);
			if (!c.ok) {
				this.flash('Move cancelled: ' + c.reason);
				return false;
			}
			sh.x = t.x; // moves on all decks together
			sh.z = t.z;
			sh.angle = t.angle;
			this.autosave();
			return true;
		}
		const m = this.modules.find((mm) => mm.uid === d.uid);
		if (!m) return false;
		const t = this.dragPose(m, d);
		const c = this.check(m.type, t.x, t.z, t.angle, m.uid, this.current, t.y);
		if (!c.ok) {
			this.flash('Move cancelled: ' + c.reason);
			return false;
		}
		m.x = t.x;
		m.z = t.z;
		m.angle = t.angle;
		this.autosave();
		return true;
	}

	/** where a dragged module ends up (wall mounts slide along the hull and keep facing inward) */
	dragPose(m: PlacedModule, p: Pt): { x: number; z: number; angle: number; y: number } {
		if (m.mount !== 'wall') return { x: p.x, z: p.z, angle: m.angle, y: m.y ?? 0 };
		const keep = this.mountHeight;
		this.mountHeight = m.y ?? 0;
		const t = this.placementFor(m.type, p);
		this.mountHeight = keep;
		return { x: t.x, z: t.z, angle: t.angle, y: m.y ?? 0 };
	}

	// ---------------- decks ----------------
	selectDeck(k: number) {
		if (k < 0 || k >= this.decks.length) return;
		this.current = k;
		this.selectedUid = null;
		this.pending = null;
		this.drag = null;
		this.measureA = this.measureB = null;
	}

	/** heights of the decks in one section (bottom → top) fit its span and usable radius? */
	sectionFits(section: DeckSection, heights: number[]): Check {
		const span = this.ship.spans[section];
		let y = span.y0 + SLAB_THICKNESS;
		for (const h of heights) {
			if (y + h > span.y1 + 1e-6)
				return { ok: false, reason: `No room in ${section.toUpperCase()} section (deck would reach ${(y + h).toFixed(2)} m > ${span.y1.toFixed(2)} m)` };
			const r = hullRadiusAt(this.ship, y + Math.min(h, MIN_HEADROOM));
			if (r < MIN_DECK_RADIUS) return { ok: false, reason: `Nose too narrow: usable radius ${r.toFixed(2)} m < ${MIN_DECK_RADIUS} m` };
			y += h + SLAB_THICKNESS;
		}
		return { ok: true, reason: '' };
	}
	sectionHabitable(sec: DeckSection) {
		return sec === 'crew' || this.hab.converted[sec];
	}
	addDeck(section?: DeckSection) {
		if (this.shipMode === 'habitat') return this.addHabDeck(section ?? this.deck?.section ?? 'crew');
		let h = DECK_HEIGHT_DEFAULT;
		if (this.volume + deckVolume(h) > HABITABLE_VOLUME_LIMIT + 1e-6) h = DECK_HEIGHT_MIN;
		if (this.volume + deckVolume(h) > HABITABLE_VOLUME_LIMIT + 1e-6) {
			this.flash(`Volume limit ${HABITABLE_VOLUME_LIMIT} m³ reached – cannot add a deck`);
			return;
		}
		this.decks.push({ id: this.nextDeckId++, height: h, modules: [], section: 'crew' });
		this.selectDeck(this.decks.length - 1);
		this.flash(`Added deck ${this.decks.length} (${h.toFixed(1)} m)`);
		this.autosave();
	}
	private addHabDeck(section: DeckSection) {
		if (!this.sectionHabitable(section)) return this.flash(`${section.toUpperCase()} tank is sealed – convert it to habitat first`);
		const hs = this.decks.filter((d) => d.section === section).map((d) => d.height);
		let h = DECK_HEIGHT_DEFAULT;
		let c = this.sectionFits(section, [...hs, h]);
		if (!c.ok) {
			h = DECK_HEIGHT_MIN;
			c = this.sectionFits(section, [...hs, h]);
		}
		if (!c.ok) return this.flash(c.reason);
		// insert after the last deck of this section (decks stay ordered bottom → top)
		let at = 0;
		this.decks.forEach((d, i) => {
			if (SECTION_ORDER.indexOf(d.section) <= SECTION_ORDER.indexOf(section)) at = i + 1;
		});
		this.insertDeckAt(at, { id: this.nextDeckId++, height: h, modules: [], section });
		this.selectDeck(at);
		this.flash(`Added ${this.deckLabel(at)} (${h.toFixed(1)} m)`);
		this.autosave();
	}
	/** insert a deck at index i, re-indexing ladders (a ladder spanning the gap is removed) */
	private insertDeckAt(i: number, d: Deck) {
		const lost = this.shafts.filter((sh) => sh.from < i && sh.to >= i).length;
		this.shafts = this.shafts
			.filter((sh) => !(sh.from < i && sh.to >= i))
			.map((sh) => (sh.from >= i ? { ...sh, from: sh.from + 1, to: sh.to + 1 } : sh));
		this.decks.splice(i, 0, d);
		if (lost) this.flash(`${lost} ladder connection(s) across the new deck removed`);
	}

	removeDeck(k = this.current) {
		if (this.decks.length <= 1) return this.flash('At least one deck is required');
		this.decks.splice(k, 1);
		// connections touching deck k are removed; the others above shift down
		const kept = this.shafts
			.filter((sh) => sh.from !== k && sh.to !== k)
			.map((sh) => (sh.from > k ? { ...sh, from: sh.from - 1, to: sh.to - 1 } : sh));
		const lost = this.shafts.length - kept.length;
		this.shafts = kept;
		if (lost) this.flash(`Removed ${lost} ladder connection(s) that touched that deck`);
		this.selectDeck(Math.min(k, this.decks.length - 1));
		this.walkDeck = Math.min(this.walkDeck, this.decks.length - 1);
		this.autosave();
	}

	setDeckHeight(k: number, h: number): boolean {
		h = Math.round(Math.min(DECK_HEIGHT_MAX, Math.max(DECK_HEIGHT_MIN, h)) * 10) / 10;
		const d = this.decks[k];
		if (this.shipMode === 'habitat') {
			const hs = this.decks.filter((o) => o.section === d.section).map((o) => (o === d ? h : o.height));
			const c = this.sectionFits(d.section, hs);
			if (!c.ok) {
				this.flash(c.reason);
				return false;
			}
		}
		const vol = this.volume - deckVolume(d.height) + deckVolume(h);
		if (this.shipMode === 'cabin' && vol > HABITABLE_VOLUME_LIMIT + 1e-6) {
			this.flash(`Would exceed ${HABITABLE_VOLUME_LIMIT} m³ (${vol.toFixed(0)} m³)`);
			return false;
		}
		const tall = d.modules.find((m) => {
			const def = CATALOG_BY_ID[m.type];
			return !def.fullHeight && Math.max(def.height, def.launch?.height ?? 0) > h + 1e-6;
		});
		if (tall) {
			this.flash(`${CATALOG_BY_ID[tall.type].name} is too tall for ${h.toFixed(1)} m`);
			return false;
		}
		d.height = h;
		this.autosave();
		return true;
	}

	// ---------------- surface habitat ----------------
	setShipMode(m: 'cabin' | 'habitat') {
		if (m === this.shipMode) return;
		if (m === 'cabin' && this.decks.some((d) => d.section !== 'crew'))
			return this.flash('Remove the tank decks first (cabin mode has the payload bay only)');
		if (m === 'cabin' && this.volume > HABITABLE_VOLUME_LIMIT + 1e-6) return this.flash(`Cabin mode is capped at ${HABITABLE_VOLUME_LIMIT} m³`);
		if (m === 'habitat') {
			const c = this.sectionFitsIn(m);
			if (!c.ok) return this.flash(c.reason);
		}
		this.shipMode = m;
		this.section = m === 'habitat';
		this.autosave();
	}
	private sectionFitsIn(_m: 'habitat'): Check {
		void _m;
		return this.sectionFits('crew', this.decks.filter((d) => d.section === 'crew').map((d) => d.height));
	}
	setLocation(l: LocationId) {
		this.hab.location = l;
		this.autosave();
	}
	setBerm(v: number) {
		this.hab.berm = Math.round(Math.min(BERM_MAX, Math.max(0, v)) * 10) / 10;
		this.autosave();
	}
	/** soil level against the hull (grade + berm) */
	soilTop = $derived(this.hab.burial + this.hab.berm);
	setBurial(v: number) {
		this.hab.burial = Math.round(Math.min(BURIAL_MAX, Math.max(0, v)) * 10) / 10;
		this.autosave();
	}
	/** decks must still fit after a hull change; otherwise revert */
	private tryHab(mutate: (h: HabitatConfig) => void, ok: string): boolean {
		const prev = JSON.parse(JSON.stringify(this.hab)) as HabitatConfig;
		mutate(this.hab);
		for (const sec of SECTION_ORDER) {
			const c = this.sectionFits(sec, this.decks.filter((d) => d.section === sec).map((d) => d.height));
			if (!c.ok) {
				this.hab = prev;
				this.flash('Not possible: ' + c.reason);
				return false;
			}
		}
		// ladders that now cross an intact dome are removed
		const bad = this.shafts.filter((sh) => !this.checkShaft(sh.x, sh.z, sh.angle, sh.from, sh.uid).ok);
		if (bad.length) {
			this.hab = prev;
			this.flash(`Not possible: ${bad.map((b) => this.shaftLabel(b)).join(', ')} would become invalid`);
			return false;
		}
		this.flash(ok);
		this.autosave();
		return true;
	}
	setDome(id: DomeId, st: DomeState) {
		if (id === 'aft') return this.flash('The aft dome carries the thrust puck – kept');
		if (st === 'intact') {
			const dep = id === 'forward' ? this.hab.converted.ch4 : this.hab.converted.lox;
			if (dep) return this.flash(`Restore not possible: the ${id === 'forward' ? 'CH4' : 'LOX'} tank habitat depends on this opening`);
		}
		const label = { intact: 'kept (intact)', hatch: 'given a Ø1.0 m manway hatch', cut: 'cut out (flat ring flange)' }[st];
		this.tryHab((h) => (h.domes[id] = st), `${id === 'common' ? 'Common' : 'Forward'} dome ${label}`);
	}
	convertTank(sec: 'lox' | 'ch4', on = true) {
		if (on) {
			if (sec === 'ch4' && this.hab.domes.forward === 'intact') return this.flash('Cut the forward dome or add a dome hatch first (access from the crew bay)');
			if (sec === 'lox' && !this.hab.converted.ch4) return this.flash('Convert the CH4 tank first (LOX is reached through it)');
			if (sec === 'lox' && this.hab.domes.common === 'intact') return this.flash('Cut the common dome or add a dome hatch first');
			this.hab.converted[sec] = true;
			this.flash(`${sec.toUpperCase()} tank converted to habitat – add decks inside it`);
		} else {
			if (this.decks.some((d) => d.section === sec)) return this.flash('Remove the decks in that tank first');
			if (sec === 'ch4' && this.hab.converted.lox) return this.flash('Revert the LOX tank first');
			this.hab.converted[sec] = false;
			this.flash(`${sec.toUpperCase()} tank set back to sealed`);
		}
		this.autosave();
	}
	insertRings(section: 'lox' | 'ch4' | 'crew', joint: number, count: number) {
		count = Math.max(1, Math.min(RING_INSERT_MAX, Math.round(count)));
		const n = sectionRings(this.hab, section);
		joint = Math.max(1, Math.min(n - 1, Math.round(joint)));
		this.tryHab(
			(h) => h.inserts.push({ section, joint, count }),
			`Inserted ${count} ring(s) (${(count * RING_HEIGHT).toFixed(2)} m) at ${section.toUpperCase()} joint ${joint} – structural requalification required`
		);
	}
	removeInsert(i: number) {
		this.tryHab((h) => h.inserts.splice(i, 1), 'Ring insert removed');
	}
	private nextOpening = 1;
	openingRange(o: Opening) {
		const y = this.ship.ringY[o.ring] ?? 0;
		const yc = o.spanWeld ? y + RING_HEIGHT : y + RING_HEIGHT / 2;
		return { y0: yc - o.h / 2, y1: yc + o.h / 2, yc };
	}
	checkOpening(o: Omit<Opening, 'uid'>, ignore: number | null = null): Check & { warnings: string[] } {
		const g = this.ship;
		const warnings: string[] = [];
		if (o.ring < 0 || o.ring >= g.ringY.length) return { ok: false, reason: 'No such ring (nose cone openings are not allowed)', warnings };
		if (o.spanWeld && o.ring + 1 >= g.ringY.length) return { ok: false, reason: 'A weld-spanning opening needs a ring above', warnings };
		if (o.w > OPENING_MAX_W + 1e-6) return { ok: false, reason: `Width ${o.w} m > max ${OPENING_MAX_W} m`, warnings };
		const maxH = o.spanWeld ? OPENING_MAX_H_SPAN : OPENING_MAX_H;
		if (o.h > maxH + 1e-6) return { ok: false, reason: `Height ${o.h} m > max ${maxH.toFixed(2)} m (${o.spanWeld ? 'two rings' : 'must not touch a ring weld'})`, warnings };
		const r = this.openingRange({ ...o, uid: -1 });
		for (const d of g.domes)
			if (d.y > r.y0 - 0.3 && d.y < r.y1 + 0.3) return { ok: false, reason: `Too close to the ${d.name.toLowerCase()} attachment ring`, warnings };
		const sec = g.ringSection[o.ring];
		if (sec === 'aft') warnings.push('Engine bay is unpressurized – needs a pressure bulkhead');
		if ((sec === 'lox' || sec === 'ch4') && !this.hab.converted[sec]) warnings.push(`${sec.toUpperCase()} tank still sealed – purge and convert first`);
		const pitch = 360 / STRINGER_COUNT;
		const half = ((o.w / 2 / 4.5) * 180) / Math.PI;
		const cut = Math.floor((o.angle + half) / pitch) - Math.floor((o.angle - half) / pitch);
		if (cut > 0) warnings.push(`Cuts ${cut} stringer(s) – needs a doubler frame`);
		if (o.spanWeld) warnings.push('Crosses a circumferential weld – needs a reinforcing frame');
		if (o.tunnel && o.h < TUNNEL_DIAMETER - 0.4) warnings.push(`Tunnel Ø${TUNNEL_DIAMETER} m is larger than the ${o.h} m opening (transition collar)`);
		for (const p of this.hab.openings) {
			if (p.uid === ignore) continue;
			const q = this.openingRange(p);
			const da = Math.abs(((p.angle - o.angle + 540) % 360) - 180);
			const need = (((p.w + o.w) / 2 + 0.3) / 4.5) * (180 / Math.PI);
			if (da < need && q.y0 < r.y1 + 0.3 && q.y1 > r.y0 - 0.3) return { ok: false, reason: `Too close to opening P${p.uid}`, warnings };
		}
		return { ok: true, reason: '', warnings };
	}
	addOpening(o: Omit<Opening, 'uid'>): boolean {
		const c = this.checkOpening(o);
		if (!c.ok) {
			this.flash(c.reason);
			return false;
		}
		this.hab.openings.push({ ...o, uid: this.nextOpening++ });
		this.flash(`Side opening P${this.nextOpening - 1} cut${c.warnings.length ? ' · ' + c.warnings[0] : ''}`);
		this.autosave();
		return true;
	}
	removeOpening(uid: number) {
		this.hab.openings = this.hab.openings.filter((o) => o.uid !== uid);
		this.autosave();
	}
	setPhase(p: Phase) {
		this.phase = p;
		PHASE.v = p;
		this.pending = null;
		this.drag = null;
		if (p === 'launch' && this.mission !== 'launch' && this.mission !== 'landing') this.mission = 'launch';
		if (p === 'surface' && (this.mission === 'launch' || this.mission === 'landing')) this.mission = 'surface';
	}
	/** mission phase: Launch/Landing use the deployed-couch geometry; Cruise is weightless */
	setMission(m: Mission) {
		this.setPhase(m === 'launch' || m === 'landing' ? 'launch' : 'surface');
		this.mission = m;
	}
	get microG() {
		return this.mission === 'cruise';
	}

	// ---------------- exports ----------------
	planSVG(k = this.current, phase: Phase = this.phase) {
		return floorPlanSVG(this.decks, this.shafts, k, this.floorY, (s) => this.shaftLabel(s), {
			R: this.deckRadius[k],
			deckLabel: (i) => this.deckLabel(i),
			phase,
			airlock: k === this.airlockDeck
		});
	}
	bom() {
		return bomCSV(this.decks, this.shafts, this.floorY, (s) => this.shaftLabel(s), {
			deckLabel: (i) => this.deckLabel(i),
			crew: this.crew,
			...(this.shipMode === 'habitat' ? { ship: this.ship, hab: this.hab } : {})
		});
	}
	elevation() {
		return elevationSVG(this.ship, this.hab, this.decks, this.floorY, (i) => this.deckLabel(i), this.soilTop);
	}

	// ---------------- misc ----------------
	flash(msg: string) {
		this.toast = msg;
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => (this.toast = null), 2200);
	}

	// ---------------- persistence ----------------
	toJSON(): SaveData {
		return {
			version: 5,
			specs: { innerRadius: HULL_INNER_RADIUS, volumeLimit: HABITABLE_VOLUME_LIMIT, slab: SLAB_THICKNESS },
			shipMode: this.shipMode,
			habitat: JSON.parse(JSON.stringify(this.hab)),
			crew: this.crew,
			phase: this.phase,
			mission: this.mission,
			decks: this.decks.map((d) => ({
				height: d.height,
				section: d.section,
				modules: d.modules.map(({ type, x, z, angle, y, mount }) => (mount ? { type, x, z, angle, y, mount } : { type, x, z, angle }))
			})),
			shafts: this.shafts.map(({ x, z, angle, from, to }) => ({ x, z, angle, from, to })),
			equipment: this.getEquipment?.() ?? [],
			crewSim: this.getCrewSim?.()
		};
	}

	/** Load decks; modules that break the rules are skipped (returns count skipped). */
	loadLayout(layout: LayoutData): number {
		const { shafts } = layout;
		let skipped = 0;
		this.nextUid = 1;
		this.decks = [];
		this.shafts = [];
		// decks ordered bottom → top by section (stable)
		const decks: SaveDeck[] = layout.decks
			.map((d, i) => ({ d, i, s: this.shipMode === 'habitat' && d.section && SECTION_ORDER.includes(d.section) ? d.section : 'crew' }))
			.sort((a, b) => SECTION_ORDER.indexOf(a.s) - SECTION_ORDER.indexOf(b.s) || a.i - b.i)
			.map(({ d, s }) => ({ ...d, section: s }));
		for (const raw of decks) {
			const height = Math.min(DECK_HEIGHT_MAX, Math.max(DECK_HEIGHT_MIN, Number(raw.height) || DECK_HEIGHT_DEFAULT));
			const section = raw.section ?? 'crew';
			if (this.shipMode === 'cabin' && this.volume + deckVolume(height) > HABITABLE_VOLUME_LIMIT + 1e-6) {
				skipped += raw.modules?.length ?? 0;
				continue;
			}
			if (this.shipMode === 'habitat') {
				const hs = this.decks.filter((d) => d.section === section).map((d) => d.height);
				if (!this.sectionHabitable(section) || !this.sectionFits(section, [...hs, height]).ok) {
					skipped += raw.modules?.length ?? 0;
					continue;
				}
			}
			this.decks.push({ id: this.nextDeckId++, height, modules: [], section });
			const k = this.decks.length - 1;
			for (const m of raw.modules ?? []) {
				if (!m || !(m.type in CATALOG_BY_ID) || m.type === 'hatch') {
					skipped++;
					continue;
				}
				const x = Number(m.x) || 0;
				const z = Number(m.z) || 0;
				const angle = normAngle(Number(m.angle) || 0);
				const mount = m.mount === 'wall' || m.mount === 'ceiling' ? m.mount : undefined;
				const y = mount ? Math.max(0, Math.min(height, Number(m.y) || 0)) : 0;
				if (this.check(m.type, x, z, angle, null, k, y).ok)
					this.decks[k].modules.push(mount ? { uid: this.nextUid++, type: m.type, x, z, angle, y, mount } : { uid: this.nextUid++, type: m.type, x, z, angle });
				else skipped++;
			}
		}
		if (!this.decks.length) this.decks.push({ id: this.nextDeckId++, height: DECK_HEIGHT_DEFAULT, modules: [], section: 'crew' });
		for (const s of shafts ?? []) {
			const x = Number(s.x) || 0;
			const z = Number(s.z) || 0;
			const angle = normAngle(Number(s.angle) || 0);
			const from = Math.max(0, Math.floor(Number(s.from)));
			const c = this.checkShaft(x, z, angle, from);
			if (c.ok) this.shafts.push({ uid: this.nextUid++, x, z, angle, from, to: from + 1 });
			else {
				skipped++;
				console.info(`[starship] ladder connection at (${x}, ${z}) deck ${from + 1}→${from + 2} dropped: ${c.reason}`);
			}
		}
		this.current = 0;
		this.walkDeck = 0;
		this.selectedUid = null;
		this.pending = null;
		this.drag = null;
		return skipped;
	}

	load(data: unknown): boolean {
		const d = data as Omit<Partial<SaveData>, 'version'> & { version?: number; decks?: LayoutData['decks']; shafts?: LayoutData['shafts'] };
		if (!d || !Array.isArray(d.decks) || (d.version !== 3 && d.version !== 4 && d.version !== 5)) {
			this.flash(d && typeof d.version === 'number' && d.version < 3 ? 'Old grid-based save ignored (format changed)' : 'Invalid save data');
			return false;
		}
		const layout: LayoutData = d.version === 3 ? migrateV3(d.decks) : { decks: d.decks, shafts: Array.isArray(d.shafts) ? d.shafts : [] };
		if (d.version === 3) this.flash(`Migrated v3 save: ${layout.shafts.length} ladder connection(s)`);
		// v5 adds the habitat; v3/v4 layouts become the decks in the payload/crew section (cabin mode)
		if (d.version === 5) {
			this.shipMode = d.shipMode === 'habitat' ? 'habitat' : 'cabin';
			this.hab = sanitizeHabitat(d.habitat);
			this.nextOpening = Math.max(0, ...this.hab.openings.map((o) => o.uid)) + 1;
			this.crew = Math.max(1, Math.min(100, Math.round(Number(d.crew) || 6)));
			this.setPhase(d.phase === 'launch' ? 'launch' : 'surface');
			if (d.mission === 'launch' || d.mission === 'cruise' || d.mission === 'landing' || d.mission === 'surface') this.setMission(d.mission);
			if (Array.isArray(d.equipment)) this.onEquipment?.(d.equipment);
			if (d.crewSim) this.onCrewSim?.(d.crewSim);
		} else {
			this.shipMode = 'cabin';
			this.hab = defaultHabitat();
			layout.decks = layout.decks.map((x) => ({ ...x, section: 'crew' }));
			if (d.version === 4) this.flash('Migrated v4 save: decks placed in the payload/crew section');
		}
		this.section = this.shipMode === 'habitat' && this.section;
		const skipped = this.loadLayout(layout);
		if (skipped) this.flash(`${skipped} module(s) skipped (violate limits)`);
		return true;
	}

	private saveTimer: ReturnType<typeof setTimeout> | undefined;
	autosave() {
		clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => this.saveLocal(true), 400);
	}

	saveLocal(silent = false) {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
			if (!silent) this.flash('Saved to browser storage');
		} catch {
			this.flash('Save failed');
		}
	}

	loadLocal(silent = false): boolean {
		try {
			for (const k of OLD_KEYS) localStorage.removeItem(k); // old grid saves are incompatible
			let raw = localStorage.getItem(STORAGE_KEY);
			if (!raw && (raw = localStorage.getItem(V4_KEY))) localStorage.removeItem(V4_KEY); // migrate once
			if (!raw && (raw = localStorage.getItem(V3_KEY))) localStorage.removeItem(V3_KEY);
			if (!raw) {
				if (!silent) this.flash('No save found');
				return false;
			}
			const ok = this.load(JSON.parse(raw));
			if (ok && !silent) this.flash('Loaded save');
			return ok;
		} catch {
			if (!silent) this.flash('Load failed');
			return false;
		}
	}

	async importFile(file: File) {
		try {
			if (this.load(JSON.parse(await file.text()))) {
				this.flash('Imported ' + file.name);
				this.autosave();
			}
		} catch {
			this.flash('Could not parse JSON');
		}
	}

	resetStarter() {
		this.loadLayout(starterLayout());
		this.autosave();
		this.flash('Loaded starter layout');
	}

	clearAll() {
		this.loadLayout({ decks: [{ height: DECK_HEIGHT_DEFAULT, modules: [], section: 'crew' }], shafts: [] });
		this.autosave();
		this.flash('Cleared: one empty deck');
	}
}

/**
 * v3 → v4 migration: per-deck 'hatch' modules become ladder connections (deck N → N+1).
 *  - A hatch on deck N with a hatch on deck N+1 within PAIR_DIST becomes one connection at the
 *    lower hatch's XY (the upper hatch adopts that XY, so a further connection from it stays aligned).
 *  - A lone hatch (paired neither up nor down) becomes a connection to the deck above; validity is
 *    checked on load. Lone hatches on the top deck are dropped. Notes go to the console.
 */
export function migrateV3(decks: { height: number; modules: Omit<PlacedModule, 'uid'>[] }[]): LayoutData {
	const PAIR_DIST = 1.0;
	const hatches = decks.map((d) =>
		(d.modules ?? []).filter((m) => m.type === 'hatch').map((m) => ({ x: m.x, z: m.z, angle: m.angle, up: false, down: false }))
	);
	const shafts: LayoutData['shafts'] = [];
	for (let k = 0; k + 1 < decks.length; k++)
		for (const h of hatches[k]) {
			const partner = hatches[k + 1]
				.filter((o) => !o.down && Math.hypot(o.x - h.x, o.z - h.z) <= PAIR_DIST)
				.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
			if (!partner) continue;
			h.up = true;
			partner.down = true;
			partner.x = h.x;
			partner.z = h.z;
			partner.angle = h.angle;
			shafts.push({ x: h.x, z: h.z, angle: h.angle, from: k, to: k + 1 });
		}
	hatches.forEach((list, k) =>
		list.forEach((h) => {
			if (h.up || h.down) return;
			if (k + 1 < decks.length) {
				shafts.push({ x: h.x, z: h.z, angle: h.angle, from: k, to: k + 1 });
				console.info(`[starship] migration: lone hatch on deck ${k + 1} → ladder to deck ${k + 2}`);
			} else console.info(`[starship] migration: lone hatch on top deck ${k + 1} at (${h.x}, ${h.z}) dropped`);
		})
	);
	return {
		decks: decks.map((d) => ({ height: d.height, modules: (d.modules ?? []).filter((m) => m.type !== 'hatch') })),
		shafts
	};
}

/** Accept a habitat config from a save file, falling back to defaults field by field. */
function sanitizeHabitat(raw: unknown): HabitatConfig {
	const h = defaultHabitat();
	const r = (raw ?? {}) as Partial<HabitatConfig>;
	if (r.location === 'moon' || r.location === 'mars') h.location = r.location;
	if (typeof r.burial === 'number') h.burial = Math.min(BURIAL_MAX, Math.max(0, r.burial));
	if (typeof r.berm === 'number') h.berm = Math.min(BERM_MAX, Math.max(0, r.berm));
	const ds: DomeState[] = ['intact', 'hatch', 'cut'];
	if (r.domes) for (const k of ['common', 'forward'] as DomeId[]) if (ds.includes(r.domes[k])) h.domes[k] = r.domes[k];
	if (r.converted) h.converted = { lox: !!r.converted.lox, ch4: !!r.converted.ch4 };
	if (Array.isArray(r.inserts))
		h.inserts = r.inserts
			.filter((i) => i && ['lox', 'ch4', 'crew'].includes(i.section))
			.map((i) => ({ section: i.section, joint: Math.max(1, Math.round(i.joint)), count: Math.max(1, Math.min(RING_INSERT_MAX, Math.round(i.count))) }));
	if (Array.isArray(r.openings))
		h.openings = r.openings.map((o, n) => ({
			uid: Number(o.uid) || n + 1,
			ring: Math.round(Number(o.ring) || 0),
			angle: Number(o.angle) || 0,
			w: Number(o.w) || 1.2,
			h: Number(o.h) || 1.5,
			spanWeld: !!o.spanWeld,
			tunnel: !!o.tunnel,
			tunnelLen: Number(o.tunnelLen) || 4
		}));
	return h;
}

export const game = new GameState();
