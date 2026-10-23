<script lang="ts">
	/**
	 * E = interact (walk, possessed crew, cruise). Prompt "E  Use Water Dispenser" for the best
	 * context action; E / Enter runs it (immediately on key-down when there is only one action, on a
	 * short press otherwise), Shift+E or holding E 0.4 s opens the list of other actions (1–9 / click
	 * to choose, Esc / E to close). Keys match e.code (keyCode / Thai fallback). F9 = debug overlay.
	 */
	import { onMount } from 'svelte';
	import { game } from '$lib/game/state.svelte';
	import { interact } from '$lib/game/interact.svelte';
	import { crew } from '$lib/sim/crewSim.svelte';
	import { isTyping, keyCode, releaseFocus } from '$lib/util/keys';

	let { mobile = false }: { mobile?: boolean } = $props();
	const active = () => !game.designer && (game.mode === 'walk' || crew.possessed !== null);
	const desc = (e: KeyboardEvent) => {
		const t = e.target as HTMLElement | null;
		return `${e.type} code=${e.code || '∅'} key=${e.key} kc=${e.keyCode}${e.repeat ? ' repeat' : ''}${e.isComposing ? ' composing' : ''}${e.shiftKey ? ' shift' : ''} → ${t?.tagName ?? '?'}${t?.getAttribute?.('aria-label') ? `[${t.getAttribute('aria-label')}]` : ''}`;
	};

	function onKeyDown(e: KeyboardEvent) {
		const code = keyCode(e);
		if (code === 'F9' && !e.repeat) {
			e.preventDefault();
			interact.debug = !interact.debug;
			if (interact.debug) interact.note('debug on (F9 toggles)');
			return;
		}
		if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') interact.note(desc(e) + (active() ? '' : ' (inactive)') + (isTyping(e) ? ' (typing)' : ''));
		if (!active() || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (interact.menu) {
			const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
			if (m) {
				e.preventDefault();
				e.stopImmediatePropagation();
				interact.runMenu(+m[1] - 1);
			} else if (code === 'Escape' || code === 'KeyE') {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (!e.repeat) interact.closeMenu();
			}
			return;
		}
		if (code === 'KeyE') {
			e.preventDefault();
			e.stopImmediatePropagation();
			// a focused HUD / sidebar button must not keep eating Space / Enter afterwards
			if ((e.target as HTMLElement)?.tagName === 'BUTTON') releaseFocus();
			if (e.repeat) return;
			if (e.shiftKey) interact.openMenu();
			else interact.pressStart(e.timeStamp || performance.now());
		} else if (code === 'Enter' || code === 'NumpadEnter') {
			e.preventDefault();
			if (e.repeat) return;
			interact.primary();
		}
	}
	function onKeyUp(e: KeyboardEvent) {
		if (keyCode(e) !== 'KeyE') return;
		interact.note(desc(e));
		if (!active()) return void interact.cancel();
		interact.pressEnd(e.timeStamp || performance.now());
	}
	/** a press whose key-up gets lost (window blur, pointer-lock change, tab switch) still acts */
	const interrupted = () => interact.interrupt();
	const onVis = () => document.visibilityState === 'hidden' && interact.interrupt();
	onMount(() => {
		// entering walk / possess: drop focus from the button / slider that started it
		releaseFocus();
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', onKeyUp, true);
		window.addEventListener('blur', interrupted);
		document.addEventListener('pointerlockchange', interrupted);
		document.addEventListener('visibilitychange', onVis);
		const t = setInterval(() => interact.refresh(), 150);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', onKeyUp, true);
			window.removeEventListener('blur', interrupted);
			document.removeEventListener('pointerlockchange', interrupted);
			document.removeEventListener('visibilitychange', onVis);
			clearInterval(t);
			interact.cancel();
			interact.closeMenu();
			interact.list = [];
		};
	});
	const dbgState = $derived.by(() => {
		void interact.log;
		return {
			mode: game.mode,
			possessed: crew.possessed,
			provider: !!game.ctxProvider,
			locked: game.pointerLocked,
			focus: typeof document !== 'undefined' ? (document.activeElement?.tagName ?? '') : ''
		};
	});
	const top = $derived(interact.list[0]);
	/** what the avatar is busy with: "Walking to Water Dispenser… (move to cancel)", "Using: …", queue, climb */
	const using = $derived.by(() => {
		const p = crew.possessed !== null ? crew.ui.prompt : null;
		if (!p || !/^(Using|Walking|Floating|Waiting|Climbing|Strapped|Auto-flying)/.test(p)) return null;
		return p.startsWith('Using:') || p.startsWith('Strapped') ? p.split(' · ').slice(0, 2).join(' · ') : p;
	});
</script>

{#if !top && !using && !interact.menu && game.ctxProvider}
	<div class="ixprompt idle" class:mobile data-testid="interact-idle"><span><kbd>{mobile ? '●' : 'E'}</kbd> nothing in reach – face equipment or a ladder (≤ 1.5 m)</span></div>
{/if}
{#if top || using}
	<div class="ixprompt" class:mobile data-testid="interact-prompt">
		{#if using}<span class="status" data-testid="interact-status">{using}</span>{/if}
		{#if top}
			<span class:dis={top.disabled}><kbd>{mobile ? '●' : 'E'}</kbd> {top.label}</span>
			{#if interact.list.length > 1}<small>+{interact.list.length - 1} · {mobile ? 'hold' : 'Shift+E / hold E'}</small>{/if}
		{/if}
	</div>
{/if}
{#if interact.debug}
	<div class="ixdebug" data-testid="interact-debug">
		<b>Interact debug (F9)</b>
		<div>mode {dbgState.mode} · possessed {dbgState.possessed ?? '–'} · provider {dbgState.provider ? 'yes' : 'NO'} · pointer lock {dbgState.locked ? 'on' : 'off'} · focus {dbgState.focus}</div>
		<div>actions: {interact.list.length ? interact.list.map((c) => c.label).join(' | ') : '(none in reach)'}</div>
		{#each interact.log as l, i (i)}<div class="l">{l}</div>{/each}
	</div>
{/if}
{#if interact.menu}
	<div class="ixmenu" class:mobile role="menu" data-testid="interact-menu">
		<div class="head">Actions <button class="x" onclick={() => interact.closeMenu()} aria-label="Close actions">✕</button></div>
		{#each interact.menu as c, i (i)}
			<button role="menuitem" class:dis={c.disabled} onclick={(e) => interact.runMenu(i, e.detail > 0)}><kbd>{i + 1}</kbd> {c.label}</button>
		{/each}
	</div>
{/if}

<style>
	.ixdebug {
		position: absolute;
		left: 50%;
		top: 60px;
		transform: translateX(-50%);
		z-index: 40;
		max-width: min(720px, 94vw);
		background: rgba(0, 0, 0, 0.82);
		border: 1px solid #ffb35c;
		border-radius: 8px;
		padding: 6px 10px;
		font: 11px/1.4 ui-monospace, Consolas, monospace;
		color: #ffe2bd;
		pointer-events: none;
		white-space: pre-wrap;
	}
	.ixdebug .l {
		color: #cfe3ff;
	}
	.ixprompt {
		position: absolute;
		left: 50%;
		bottom: 140px;
		transform: translateX(-50%);
		z-index: 11;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		background: rgba(10, 18, 30, 0.9);
		border: 1px solid #49a6ff;
		border-radius: 10px;
		padding: 7px 14px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
	}
	.ixprompt.mobile {
		left: calc(12px + env(safe-area-inset-left));
		transform: none;
		align-items: flex-start;
		bottom: calc(232px + env(safe-area-inset-bottom));
		max-width: 58%;
		white-space: normal;
		font-size: 13px;
	}
	.ixprompt.idle {
		opacity: 0.55;
		font-weight: 400;
		font-size: 12px;
		border-color: #2c4a6e;
	}
	.ixprompt small {
		font-weight: 400;
		color: #9fb6d6;
		font-size: 11px;
	}
	.status {
		font-weight: 400;
		color: #ffd27a;
		font-size: 12px;
	}
	kbd {
		display: inline-block;
		min-width: 18px;
		padding: 0 5px;
		margin-right: 4px;
		border-radius: 4px;
		background: #49a6ff;
		color: #04101d;
		font-family: inherit;
		font-size: 12px;
		text-align: center;
	}
	.dis {
		opacity: 0.55;
	}
	.ixmenu {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(24px, -50%);
		z-index: 30;
		min-width: 230px;
		max-width: 360px;
		background: rgba(10, 18, 30, 0.95);
		border: 1px solid #49a6ff;
		border-radius: 12px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
	}
	.ixmenu.mobile {
		left: 12px;
		right: 12px;
		top: calc(64px + env(safe-area-inset-top));
		transform: none;
		max-width: none;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 12px;
		color: #9fb6d6;
		padding: 2px 6px;
	}
	.ixmenu button {
		text-align: left;
		background: rgba(73, 166, 255, 0.08);
		border: 1px solid transparent;
		color: #e6f0ff;
		border-radius: 8px;
		padding: 8px 10px;
		font: inherit;
		font-size: 13px;
		cursor: pointer;
		min-height: 40px;
	}
	.ixmenu button:hover {
		border-color: #49a6ff;
	}
	.ixmenu .x {
		min-height: 0;
		padding: 2px 8px;
	}
</style>
