<script lang="ts">
	/** Active status effects of a crew member: icon + remaining time (tooltip: name, source). */
	import type { AgentUI } from './crewSim.svelte';
	let { effects }: { effects: AgentUI['effects'] } = $props();
	const fmt = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}m`);
</script>

{#if effects.length}
	<div class="fx" data-testid="effects">
		{#each effects as e, i (e.id + i)}
			<span class="chip" class:bad={!e.good} title={`${e.label}${e.src ? ` (from ${e.src})` : ''} · ${fmt(e.left)} left`}>{e.icon}<small>{fmt(e.left)}</small></span>
		{/each}
	</div>
{/if}

<style>
	.fx {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 12px;
		background: #12301f;
		border: 1px solid #2f7a4b;
		border-radius: 10px;
		padding: 0 5px;
	}
	.chip.bad {
		background: #351616;
		border-color: #8a3a3a;
	}
	small {
		font-size: 10px;
		opacity: 0.85;
	}
</style>
