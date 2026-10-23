<script lang="ts">
	/** Hover tooltip over a crew avatar (desktop): action, needs with trend symbols, active effects. */
	import { NEEDS } from '$lib/game/affordances';
	import { crew } from './crewSim.svelte';
	import NeedBar from './NeedBar.svelte';
	import EffectChips from './EffectChips.svelte';
	const h = $derived(crew.hover);
	const u = $derived(h ? crew.ui.agents.find((a) => a.id === h.id) : undefined);
</script>

{#if h && u}
	<div class="tip" style:left="{h.x + 14}px" style:top="{h.y - 10}px" data-testid="crew-hover">
		<b style:color={u.color}>{u.name}</b> <small>{u.role}</small>
		<div class="act">{u.action}</div>
		<EffectChips effects={u.effects} />
		<div class="grid">
			{#each NEEDS as n (n.id)}
				<NeedBar icon={n.icon} label={n.label} color={n.color} value={u.needs[n.id]} rate={u.rates[n.id]} compact />
			{/each}
		</div>
	</div>
{/if}

<style>
	.tip {
		position: fixed;
		z-index: 30;
		pointer-events: none;
		width: 210px;
		background: rgba(9, 14, 24, 0.95);
		border: 1px solid #2c4466;
		border-radius: 10px;
		padding: 7px;
		font-size: 11px;
		color: #d6e2f5;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.act {
		color: #ffd27a;
	}
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px 8px;
	}
</style>
