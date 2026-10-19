/**
 * Context interaction ("E = interact everywhere") shared by the walk / possessed controllers and
 * the HUD. The active controller registers `game.ctxProvider`; this module polls it for the prompt,
 * runs the best action (E tap / Enter / Interact button) and opens a list of the other actions
 * (Shift+E, holding E or the Interact button for 0.4 s).
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
	/** run the best action right now (fresh list) */
	primary(): boolean {
		this.refresh();
		const c = this.list[0];
		if (!c) {
			game.flash(game.ctxProvider ? 'Nothing to interact with here – face equipment or a ladder within reach' : 'Nothing to interact with');
			return false;
		}
		const r = c.run();
		const ok = !c.disabled && r !== false;
		this.refresh();
		return ok;
	}
	openMenu() {
		this.refresh();
		if (!this.list.length) return void game.flash('Nothing to interact with here');
		this.menu = [...this.list];
		this.openedAt = performance.now();
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
	/** press start (E keydown / button pointerdown): hold 0.4 s → action list */
	pressStart() {
		this.cancelHold();
		this.hold = setTimeout(() => {
			this.hold = null;
			this.openMenu();
		}, HOLD_MS);
	}
	/** press end: a short tap runs the best action; after a hold the list is already open */
	pressEnd() {
		if (!this.hold) return;
		this.cancelHold();
		this.primary();
	}
	cancelHold() {
		if (this.hold) clearTimeout(this.hold);
		this.hold = null;
	}
}

export const interact = new InteractState();
