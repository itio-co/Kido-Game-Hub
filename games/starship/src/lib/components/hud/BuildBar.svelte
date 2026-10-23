<script lang="ts">
	/** Bottom build bar: category tabs + item cards (click a card to place it). Collapsible; mobile = bottom sheet strip. */
	import { CATALOG, sizeLabel } from '$lib/game/catalog';
	import { equip } from '$lib/game/equipStore.svelte';
	import { game } from '$lib/game/state.svelte';
	import type { ModuleId, Tool } from '$lib/game/types';
	import { HUD_CATS, catOf, type HudCat } from './categories';
	let { mobile = false }: { mobile?: boolean } = $props();
	let cat = $state<HudCat>('crew');
	let open = $state(true);
	const all = $derived([...CATALOG, ...Object.values(equip.modules)]);
	const cats = $derived(HUD_CATS.filter((c) => all.some((d) => catOf(d) === c.id)));
	const items = $derived(all.filter((d) => catOf(d) === cat));
	function pick(id: ModuleId) {
		game.selectedModule = id;
		game.tool = 'module';
		game.pending = null;
		game.selectedUid = null;
	}
	const TOOLS = [
		{ id: 'select', icon: '🖐', label: 'Select' },
		{ id: 'module', icon: '➕', label: 'Place' },
		{ id: 'measure', icon: '📏', label: 'Measure' },
		{ id: 'camera', icon: '🎥', label: 'Camera' }
	] as const;
	function setTool(t: Tool) {
		game.tool = t;
		game.pending = null;
		if (t !== 'select') game.selectedUid = null;
		if (t !== 'measure') game.measureA = game.measureB = null;
	}
</script>

<div class="buildbar glass" class:mobile class:closed={!open} data-testid="build-bar">
	<div class="tabs" role="tablist">
		{#if !mobile}<span class="tools" role="group" aria-label="Tools">
			{#each TOOLS as t (t.id)}
				<button class="tool" class:active={game.tool === t.id} onclick={() => setTool(t.id)} aria-label="{t.label} tool" title={t.label} data-testid="hud-tool">{t.icon}</button>
			{/each}
		</span>{/if}
		{#each cats as c (c.id)}
			<button role="tab" class:active={cat === c.id} aria-selected={cat === c.id} onclick={() => ((cat = c.id), (open = true))} data-testid="build-tab" title={c.label}>{c.icon}<span>{c.label}</span></button>
		{/each}
		<button class="fold" onclick={() => (open = !open)} aria-label={open ? 'Collapse build bar' : 'Expand build bar'}>{open ? '▾' : '▴'}</button>
	</div>
	{#if open}
		<div class="cards">
			{#each items as d (d.id)}
				<button class="card" class:active={game.tool === 'module' && game.selectedModule === d.id} onclick={() => pick(d.id)} data-testid="build-card" data-id={d.id} title={d.description ?? d.name}>
					<span class="ico">{d.icon}</span>
					<span class="nm">{d.name}</span>
					<span class="meta">{sizeLabel(d)} · {d.power ? `${d.power} W` : 'passive'}{d.seats ? ` · 💺${d.seats}` : ''}{d.estimate ? ' · est' : ''}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.buildbar {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		bottom: 26px;
		width: min(940px, calc(100% - 330px));
		z-index: 13;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.buildbar.mobile {
		left: 0;
		right: 0;
		transform: none;
		width: auto;
		bottom: calc(118px + env(safe-area-inset-bottom));
		border-radius: 14px 14px 0 0;
		padding: 4px;
	}
	.tabs {
		display: flex;
		gap: 3px;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs button {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font: 600 12px/1 system-ui, sans-serif;
		color: #b9d4f2;
		background: rgba(120, 200, 255, 0.05);
		border: 1px solid rgba(120, 200, 255, 0.14);
		border-radius: 8px;
		padding: 6px 9px;
		cursor: pointer;
		white-space: nowrap;
		min-height: 32px;
	}
	.mobile .tabs button span {
		display: none;
	}
	.mobile .tabs button {
		font-size: 17px;
		min-width: 42px;
		justify-content: center;
	}
	.tabs button.active {
		color: #061018;
		background: linear-gradient(180deg, #7dd3fc, #38bdf8);
		border-color: #bae6fd;
	}
	.tools {
		display: inline-flex;
		gap: 3px;
		padding-right: 5px;
		margin-right: 2px;
		border-right: 1px solid rgba(120, 200, 255, 0.2);
	}
	.tabs .tool {
		font-size: 17px;
		min-width: 40px;
		justify-content: center;
	}
	.tabs .tool.active {
		background: linear-gradient(180deg, #fde68a, #f59e0b);
		border-color: #fef3c7;
	}
	.tabs .fold {
		margin-left: auto;
	}
	.cards {
		display: flex;
		gap: 6px;
		overflow-x: auto;
		padding-bottom: 2px;
		scrollbar-width: thin;
	}
	.card {
		flex: 0 0 auto;
		width: 116px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		text-align: left;
		color: #dbeafe;
		background: linear-gradient(180deg, rgba(30, 50, 80, 0.75), rgba(12, 22, 38, 0.85));
		border: 1px solid rgba(120, 200, 255, 0.18);
		border-radius: 10px;
		padding: 6px 7px;
		cursor: pointer;
		touch-action: manipulation;
	}
	.mobile .card {
		width: 98px;
		padding: 5px 6px;
	}
	.card:hover {
		border-color: rgba(125, 211, 252, 0.6);
		box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
	}
	.card.active {
		border-color: #7dd3fc;
		box-shadow: 0 0 0 1px #7dd3fc inset, 0 0 14px rgba(56, 189, 248, 0.4);
	}
	.ico {
		font-size: 22px;
	}
	.nm {
		font: 600 11.5px/1.15 system-ui, sans-serif;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		min-height: 26px;
	}
	.meta {
		font-size: 10px;
		opacity: 0.65;
	}
</style>
