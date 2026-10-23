/**
 * Game-style Options menu: open state, current page and persisted user settings.
 *
 * Settings live on their natural owners (`game`, `crew`) so the rest of the app keeps reading them as before;
 * this module just loads them from localStorage on start and writes them back whenever one changes.
 */
import { game } from './state.svelte';
import { crew } from '$lib/sim/crewSim.svelte';

export const OPTIONS_KEY = 'starship-interior:options';
export type OptionsTab = 'controls' | 'graphics' | 'simulation' | 'gameplay' | 'about';
export const OPTION_TABS: { id: OptionsTab; label: string; icon: string }[] = [
	{ id: 'controls', label: 'Controls', icon: '⌨' },
	{ id: 'graphics', label: 'Graphics', icon: '🖥' },
	{ id: 'simulation', label: 'Simulation', icon: '👥' },
	{ id: 'gameplay', label: 'Building', icon: '🧱' },
	{ id: 'about', label: 'About / Help', icon: 'ⓘ' }
];

interface Saved {
	quality?: 'high' | 'low';
	shadows?: boolean;
	clearance?: boolean;
	guides?: boolean;
	showClearances?: boolean;
	confirmPlacement?: boolean;
	twoFingerMode?: 'rotate' | 'pan';
	snap?: boolean;
	alignShafts?: boolean;
	badges?: boolean;
	heatmap?: boolean;
	showNav?: boolean;
	speed?: number;
	seed?: number | null;
	keepRunning?: boolean;
}

class Options {
	open = $state(false);
	tab = $state<OptionsTab>('controls');
	/** keep the crew sim running while the menu is open (default: pause) */
	keepRunning = $state(false);
	/** fixed crew-sim seed applied on Start (null = random) */
	seed = $state<number | null>(null);
	/** the menu paused the sim and must resume it on close */
	private pausedByMenu = false;
	private started = false;

	show(tab?: OptionsTab) {
		if (tab) this.tab = tab;
		if (this.open) return;
		this.open = true;
		if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock();
		if (crew.enabled && crew.running && !this.keepRunning) {
			crew.running = false;
			this.pausedByMenu = true;
		} else this.pausedByMenu = false;
	}
	close() {
		if (!this.open) return;
		this.open = false;
		if (this.pausedByMenu && crew.enabled) crew.running = true;
		this.pausedByMenu = false;
	}
	toggle(tab?: OptionsTab) {
		if (this.open) this.close();
		else this.show(tab);
	}
	/** start the crew sim from the menu; it stays paused until the menu closes (unless keep running) */
	startSim() {
		crew.start();
		if (this.open && !this.keepRunning) {
			crew.running = false;
			this.pausedByMenu = true;
		}
	}
	setKeepRunning(on: boolean) {
		this.keepRunning = on;
		if (!this.open || !crew.enabled) return;
		if (on && this.pausedByMenu) {
			crew.running = true;
			this.pausedByMenu = false;
		} else if (!on && crew.running) {
			crew.running = false;
			this.pausedByMenu = true;
		}
	}

	private snapshot(): Saved {
		return {
			quality: game.quality,
			shadows: game.shadows,
			clearance: game.clearance,
			guides: game.guides,
			showClearances: game.showClearances,
			confirmPlacement: game.confirmPlacement,
			twoFingerMode: game.twoFingerMode,
			snap: game.snap,
			alignShafts: game.alignShafts,
			badges: crew.badges,
			heatmap: crew.heatmap,
			showNav: crew.showNav,
			speed: crew.speed,
			seed: this.seed,
			keepRunning: this.keepRunning
		};
	}
	load() {
		let d: Saved = {};
		try {
			d = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') ?? {};
		} catch {
			d = {};
		}
		const bool = (v: unknown, cur: boolean) => (typeof v === 'boolean' ? v : cur);
		if (d.quality === 'high' || d.quality === 'low') game.quality = d.quality;
		game.shadows = bool(d.shadows, game.shadows);
		game.clearance = bool(d.clearance, game.clearance);
		game.guides = bool(d.guides, game.guides);
		game.showClearances = bool(d.showClearances, game.showClearances);
		game.confirmPlacement = bool(d.confirmPlacement, game.confirmPlacement);
		if (d.twoFingerMode === 'rotate' || d.twoFingerMode === 'pan') game.twoFingerMode = d.twoFingerMode;
		game.snap = bool(d.snap, game.snap);
		game.alignShafts = bool(d.alignShafts, game.alignShafts);
		crew.badges = bool(d.badges, crew.badges);
		crew.heatmap = bool(d.heatmap, crew.heatmap);
		crew.showNav = bool(d.showNav, crew.showNav);
		if (typeof d.speed === 'number' && d.speed > 0) crew.speed = d.speed;
		this.seed = typeof d.seed === 'number' && Number.isFinite(d.seed) ? Math.floor(d.seed) : null;
		this.keepRunning = bool(d.keepRunning, false);
	}
	/** load saved settings, then persist every later change (call once from onMount) */
	init() {
		if (this.started || typeof localStorage === 'undefined') return;
		this.started = true;
		this.load();
		$effect.root(() => {
			$effect(() => {
				const snap = this.snapshot();
				crew.seedOnStart = snap.seed ?? null;
				try {
					localStorage.setItem(OPTIONS_KEY, JSON.stringify(snap));
				} catch {
					/* storage full / disabled: settings just aren't remembered */
				}
			});
		});
	}
	reset() {
		try {
			localStorage.removeItem(OPTIONS_KEY);
		} catch {
			/* ignore */
		}
		game.quality = game.isTouch ? 'low' : 'high';
		game.shadows = true;
		game.clearance = true;
		game.guides = true;
		game.showClearances = false;
		game.confirmPlacement = true;
		game.twoFingerMode = 'rotate';
		game.snap = false;
		game.alignShafts = true;
		crew.badges = true;
		crew.heatmap = false;
		crew.showNav = false;
		crew.speed = 4;
		this.seed = null;
		this.setKeepRunning(false);
		game.flash('Options reset to defaults');
	}
}

export const options = new Options();
