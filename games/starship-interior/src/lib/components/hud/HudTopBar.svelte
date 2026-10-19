<script lang="ts">
	/** Slim top resource bar: mission phase, crew / seats, mass, power (live bus or budget), cost, free floor, issues, clearances toggle, sim clock. */
	import { game } from '$lib/game/state.svelte';
	import { crew, fmtClock } from '$lib/sim/crewSim.svelte';
	import PowerMeter from '$lib/sim/PowerMeter.svelte';
	import type { Mission } from '$lib/game/types';
	let { mobile = false, onpower }: { mobile?: boolean; onpower?: () => void } = $props();
	const s = $derived(game.stats);
	const MISSIONS: { id: Mission; icon: string; label: string }[] = [
		{ id: 'launch', icon: '🚀', label: 'Launch' },
		{ id: 'cruise', icon: '🪐', label: 'Cruise' },
		{ id: 'landing', icon: '🛬', label: 'Landing' },
		{ id: 'surface', icon: '🌕', label: 'Surface' }
	];
	const mi = $derived(MISSIONS.find((m) => m.id === game.mission) ?? MISSIONS[3]);
	function nextMission() {
		const i = MISSIONS.findIndex((m) => m.id === game.mission);
		game.setMission(MISSIONS[(i + 1) % MISSIONS.length].id);
	}
	const issues = $derived(game.preflight.couchIssues.length + game.invalidPlacements.length + game.unreachableDecks.length + (game.analysis?.warnings.length ?? 0));
	const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)} t` : `${Math.round(n)} kg`);
	const money = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${Math.round(n)}`);
</script>

<div class="hudbar glass" class:mobile data-testid="hud-topbar">
	<button class="res mission" onclick={nextMission} title="Mission phase (click to cycle): Launch · Cruise (micro-g) · Landing · Surface" data-testid="hud-mission">{mi.icon}{#if !mobile} {mi.label}{/if}</button>
	<span class="res" class:bad={game.seats < game.crew} title="Crew / launch seats">👥 {game.crew}<small>/💺{game.seats}</small></span>
	{#if !mobile}<span class="res" title="Equipment mass (estimate)">⚖ {k(s.mass)}</span>{/if}
	{#if crew.enabled}
		<PowerMeter compact={mobile} onopen={() => onpower?.()} />
	{:else}
		<span class="res" class:bad={!s.powerOk} title="Electrical load vs assumed budget (start the crew sim for the live power bus)" data-testid="hud-power-budget">⚡ {(s.power / 1000).toFixed(1)}/{(s.powerAvail / 1000).toFixed(1)} kW</span>
	{/if}
	{#if !mobile}<span class="res" title="Cost (estimate)">💰 {money(s.cost)}</span>{/if}
	<span class="res" title="Free floor on this deck">▢ {s.freeArea.toFixed(0)} m²</span>
	{#if issues}<span class="res bad" title="Design issues (see the panel)">⚠ {issues}</span>{/if}
	<button class="res tog" class:on={game.showClearances} onclick={() => (game.showClearances = !game.showClearances)} title="Show clearances: couch envelopes, egress paths, keep-out zones" aria-label="Show clearances" data-testid="show-clearances">📐{#if !mobile} Clearances{/if}</button>
	{#if crew.enabled}
		<span class="sim">
			<button onclick={() => (crew.running = !crew.running)} aria-label={crew.running ? 'Pause sim' : 'Play sim'}>{crew.running ? '⏸' : '▶'}</button>
			<b>{fmtClock(crew.ui.clock)}</b>
			<button onclick={() => (crew.speed = crew.speed === 60 ? 1 : crew.speed === 1 ? 4 : crew.speed === 4 ? 16 : 60)} aria-label="Sim speed">{crew.speed}×</button>
		</span>
	{/if}
</div>

<style>
	.hudbar {
		position: absolute;
		top: calc(8px + env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 6px;
		z-index: 14;
		max-width: calc(100% - 520px);
		overflow-x: auto;
		scrollbar-width: none;
		white-space: nowrap;
	}
	.hudbar.mobile {
		top: calc(52px + env(safe-area-inset-top));
		max-width: calc(100% - 16px);
		gap: 3px;
		padding: 3px 4px;
	}
	.res {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font: 600 12px/1 system-ui, sans-serif;
		color: #cfe8ff;
		padding: 5px 7px;
		border-radius: 8px;
		background: rgba(120, 200, 255, 0.06);
		border: 1px solid rgba(120, 200, 255, 0.12);
	}
	.mobile .res {
		font-size: 11px;
		padding: 4px 5px;
	}
	.res small {
		opacity: 0.7;
		font-weight: 500;
	}
	.res.bad {
		color: #ffc2c2;
		border-color: rgba(255, 90, 90, 0.5);
		background: rgba(255, 60, 60, 0.12);
	}
	button.res {
		cursor: pointer;
	}
	.tog.on {
		color: #061018;
		background: linear-gradient(180deg, #6ee7ff, #22b8e0);
		border-color: #9af0ff;
	}
	.sim {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding-left: 4px;
		border-left: 1px solid rgba(120, 200, 255, 0.2);
		font-size: 12px;
	}
	.sim button {
		font: inherit;
		color: inherit;
		background: rgba(120, 200, 255, 0.08);
		border: 1px solid rgba(120, 200, 255, 0.25);
		border-radius: 7px;
		min-width: 30px;
		min-height: 26px;
		cursor: pointer;
	}
</style>
