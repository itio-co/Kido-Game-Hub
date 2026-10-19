<script lang="ts">
	/**
	 * E = interact (walk, possessed crew, cruise). Prompt "E  Use Water Dispenser" for the best
	 * context action; tap E / Enter runs it, Shift+E or holding E 0.4 s opens the list of other
	 * actions (1–9 / click to choose, Esc / E to close). Keys match e.code.
	 */
	import { onMount } from 'svelte';
	import { game } from '$lib/game/state.svelte';
	import { interact } from '$lib/game/interact.svelte';
	import { crew } from '$lib/sim/crewSim.svelte';
	import { isTyping } from '$lib/util/keys';

	let { mobile = false }: { mobile?: boolean } = $props();
	const active = () => !game.designer && (game.mode === 'walk' || crew.possessed !== null);

	function onKeyDown(e: KeyboardEvent) {
		if (!active() || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (interact.menu) {
			const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
			if (m) {
				e.preventDefault();
				e.stopImmediatePropagation();
				interact.runMenu(+m[1] - 1);
			} else if (e.code === 'Escape' || e.code === 'KeyE') {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (!e.repeat) interact.closeMenu();
			}
			return;
		}
		if (e.code === 'KeyE') {
			e.preventDefault();
			e.stopImmediatePropagation();
			if (e.repeat) return;
			if (e.shiftKey) interact.openMenu();
			else interact.pressStart();
		} else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
			e.preventDefault();
			interact.primary();
		}
	}
	function onKeyUp(e: KeyboardEvent) {
		if (e.code !== 'KeyE' || !active()) return;
		interact.pressEnd();
	}
	onMount(() => {
		window.addEventListener('keydown', onKeyDown, true);
		window.addEventListener('keyup', onKeyUp, true);
		const t = setInterval(() => interact.refresh(), 150);
		return () => {
			window.removeEventListener('keydown', onKeyDown, true);
			window.removeEventListener('keyup', onKeyUp, true);
			clearInterval(t);
			interact.cancelHold();
			interact.closeMenu();
			interact.list = [];
		};
	});
	const top = $derived(interact.list[0]);
	const using = $derived(crew.possessed !== null && crew.ui.prompt?.startsWith('Using:') ? crew.ui.prompt.split(' · ')[0] : null);
</script>

{#if top || using}
	<div class="ixprompt" class:mobile data-testid="interact-prompt">
		{#if using}<span class="status">{using}</span>{/if}
		{#if top}
			<span class:dis={top.disabled}><kbd>{mobile ? '●' : 'E'}</kbd> {top.label}</span>
			{#if interact.list.length > 1}<small>+{interact.list.length - 1} · {mobile ? 'hold' : 'Shift+E / hold E'}</small>{/if}
		{/if}
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
