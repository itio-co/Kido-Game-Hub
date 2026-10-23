<script lang="ts">
	/** HUD power meter: live load / supply, battery %, 24 h sparkline; click opens the power drawer. */
	import { onDestroy } from 'svelte';
	import { crew } from './crewSim.svelte';
	import { fmtW } from './power';
	let { compact = false, onopen }: { compact?: boolean; onopen?: () => void } = $props();
	let r = $state(crew.powerReport());
	const t = setInterval(() => (r = crew.powerReport()), 500);
	onDestroy(() => clearInterval(t));
	const spark = $derived.by(() => {
		const h = r.hist.slice(-96);
		if (h.length < 2) return '';
		const max = Math.max(1, ...h.map((p) => Math.max(p.load, p.supply)));
		return h.map((p, i) => `${(i / (h.length - 1)) * 60},${16 - (p.load / max) * 15}`).join(' ');
	});
	const over = $derived(r.shed.length > 0 || r.load > r.supply);
</script>

<button class="pm" class:over class:deficit={r.shed.length > 0} class:compact onclick={() => onopen?.()} title="Power: live load / supply · battery · click for the power panel" data-testid="power-meter">
	<span>⚡ {fmtW(r.load)} / {fmtW(r.supply)}</span>
	<span class="bat" class:low={r.socPct < 25}>🔋{r.socPct.toFixed(0)}%</span>
	{#if !compact && spark}<svg viewBox="0 0 60 17" width="60" height="17" aria-hidden="true"><polyline points={spark} fill="none" stroke={over ? '#f87171' : '#4ade80'} stroke-width="1.5" /></svg>{/if}
	{#if r.shed.length}<span class="shed">⛔ {r.shed.length} shed</span>{/if}
</button>

<style>
	.pm {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 600 12px/1 system-ui, sans-serif;
		color: #d6f5e0;
		background: rgba(10, 30, 20, 0.6);
		border: 1px solid #2f7a4b;
		border-radius: 8px;
		padding: 4px 7px;
		cursor: pointer;
		white-space: nowrap;
	}
	.pm.compact {
		font-size: 11px;
		padding: 3px 5px;
	}
	.pm.over {
		border-color: #f59e0b;
		color: #ffe7b8;
	}
	.pm.deficit {
		border-color: #ef4444;
		background: rgba(60, 10, 10, 0.7);
		color: #ffd2d2;
	}
	.bat.low {
		color: #f87171;
	}
	.shed {
		color: #fca5a5;
	}
</style>
