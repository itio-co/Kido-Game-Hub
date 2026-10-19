/**
 * Context interaction ("E = interact everywhere") shared by the walk / possessed controllers and
 * the HUD. The active controller registers `game.ctxProvider`; this module polls it for the prompt,
 * runs the best action (E / Enter / Interact button) and opens a list of the other actions
 * (Shift+E, holding E or the Interact button for 0.4 s when there is a choice).
 */
import { game, type CtxAction } from './state.svelte';

export const HOLD_MS = 400;

class InteractState {
	/** current actions, best first (refreshed ~7×/s while a controller is active) */
	list = $state<CtxAction[]>([]);
	/** open action list (snapshot, so indices stay stable while it is open) */
	menu = $state<CtxAction[] | null>(null);
	private hold: ReturnType<typeof setTimeout> | null = null;
	/** performance.now() when the list opened: the release of a long press must not pick an item under the finger */
	openedAt = 0;

	refresh() {
		const p = game.ctxProvider;
		const next = p ? p() : [];
		// avoid re-render churn when nothing changed
		const sig = (l: CtxAction[]) => l.map((c) => `${c.label}|${c.disabled ? 1 : 0}`).join('\n');
		if (sig(next) !== sig(this.list)) this.list = next;
		else this.list.forEach((c, i) => (c.run = next[i].run));
		if (!p) this.menu = null;
	}
	/** debug overlay (F9 or ?ixdebug): last key events + what E did */
	debug = $state(typeof location !== 'undefined' && /[?&]ixdebug\b/.test(location.search));
	log = $state<string[]>([]);
	note(line: string) {
		if (!this.debug) return;
		const t = (performance.now() / 1000).toFixed(2);
		this.log = [`${t} ${line}`, ...this.log].slice(0, 12);
	}
	/** run the best action right now (fresh list) */
	primary(): boolean {
		this.refresh();
		const c = this.list[0];
		if (!c) {
			game.flash(game.ctxProvider ? 'Nothing to interact with here – face equipment or a ladder within ~1.5 m' : 'Nothing to interact with');
			this.note('→ nothing in reach');
			return false;
		}
		const r = c.run();
		const ok = !c.disabled && r !== false;
		this.note(`→ ${c.label}${ok ? '' : ' (not possible)'}`);
		this.refresh();
		return ok;
	}
	openMenu() {
		this.refresh();
		if (!this.list.length) return void game.flash('Nothing to interact with here');
		this.menu = [...this.list];
		this.openedAt = performance.now();
		this.note(`menu (${this.list.length})`);
	}
	closeMenu() {
		this.menu = null;
	}
	runMenu(i: number, fromPointer = false) {
		if (fromPointer && performance.now() - this.openedAt < 450) return;
		const c = this.menu?.[i];
		this.menu = null;
		if (c) c.run();
		this.refresh();
	}
	/** a press is waiting for its release (only when there is a choice of actions) */
	private pending = false;
	/** event time of the last press start (same clock as performance.now / event.timeStamp) */
	private downAt = 0;
	get holding() {
		return this.pending;
	}
	/**
	 * Press start (E keydown / button pointerdown). With 0–1 actions there is nothing to choose, so it
	 * acts immediately (no dependence on the key-up arriving). With several actions a short press
	 * (released < 0.4 s) runs the best one and a hold opens the list.
	 */
	pressStart(t = performance.now()) {
		if (this.pending) {
			// the previous release never arrived (focus / pointer-lock change, remote desktop …): count it as a tap
			this.pressEnd(t);
			return;
		}
		this.cancelHold();
		this.refresh();
		this.downAt = t;
		if (this.list.length <= 1) {
			this.primary();
			return;
		}
		this.pending = true;
		this.hold = setTimeout(() => {
			this.hold = null;
			if (!this.pending) return;
			this.pending = false;
			this.openMenu();
		}, HOLD_MS);
	}
	/** press end: a short press runs the best action; after a hold the list is already open */
	pressEnd(t = performance.now()) {
		const short = this.downAt > 0 && t - this.downAt < HOLD_MS;
		if (this.pending) {
			this.pending = false;
			this.cancelHold();
			this.downAt = 0;
			this.primary();
			return;
		}
		// a busy frame can let the hold timer fire before a short press's key-up is handled: the
		// key-up's own timestamp says it was a tap → close the list again and act
		if (short && this.menu) {
			this.menu = null;
			this.downAt = 0;
			this.primary();
			return;
		}
		this.downAt = 0;
	}
	/** focus / pointer-lock / visibility changed mid-press: a pending press counts as a tap */
	interrupt() {
		if (this.pending) this.pressEnd(this.downAt);
	}
	cancelHold() {
		if (this.hold) clearTimeout(this.hold);
		this.hold = null;
	}
	/** abandon a press without acting (pointer cancel) */
	cancel() {
		this.pending = false;
		this.downAt = 0;
		this.cancelHold();
	}
}

export const interact = new InteractState();
