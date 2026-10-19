<script lang="ts">
	/** Inspect card for the selected crew member: portrait, mood, action, queue, needs, take control. */
	import { NEEDS } from '$lib/game/affordances';
	import { crew } from './crewSim.svelte';

	interface Props {
		mobile?: boolean;
	}
	let { mobile = false }: Props = $props();
	const u = $derived(crew.selected !== null ? crew.ui.agents.find((a) => a.id === crew.selected) : undefined);
	// a tap that opens the card must not also "click" a button that appears under the finger
	let shownAt = 0;
	$effect(() => {
		void crew.selected;
		shownAt = performance.now();
	});
	const fresh = () => performance.now() - shownAt < 450;
	const compact = $derived(mobile && crew.possessed !== null);
</script>

{#if u}
	<div class="card" class:mobile class:compact data-testid="agent-card">
		<div class="head">
			<svg class="portrait" viewBox="0 0 40 40" aria-hidden="true">
				<circle cx="20" cy="20" r="19" fill="#0d1626" stroke={u.color} stroke-width="2" />
				<path d="M8 38 C9 27 31 27 32 38 Z" fill={u.color} />
				<circle cx="20" cy="16" r="7.5" fill="#e8c6a4" />
				<rect x="13.5" y="13" width="13" height="5" rx="2.5" fill="#203a5c" opacity="0.85" />
			</svg>
			<div class="id">
				<b>{u.name}</b>
				<span>{u.role} · {u.where}</span>
				<span class="mood">{u.moodLabel} mood {u.mood}%</span>
			</div>
			<button class="x" onclick={() => !fresh() && (crew.selected = null)} aria-label="Close">✕</button>
		</div>
		{#if !compact}
		<div class="act">▶ {u.action}{#if u.queue}<br /><small>⏳ {u.queue}</small>{/if}{#if u.using}<br /><small data-testid="agent-using">{u.using}</small>{/if}</div>
		<div class="needs">
			{#each NEEDS as n (n.id)}
				{@const v = u.needs[n.id]}
				<div class="need" title={`${n.label} ${Math.round(v)}`}>
					<span>{n.icon}{#if !mobile} {n.label}{/if}</span>
					<span class="bar"><span style:width="{v}%" style:background={v < 20 ? '#ff5a5a' : v < 45 ? '#ffb43a' : n.color}></span></span>
				</div>
			{/each}
		</div>
		{/if}
		{#if crew.possessed === u.id}
			{#if !compact}<button class="ctl rel" onclick={() => !fresh() && crew.possess(null)}>⏏ Release to AI</button>{/if}
		{:else}
			<button class="ctl" onclick={() => !fresh() && crew.possess(u.id)}>🎮 Take control</button>
		{/if}
	</div>
{/if}

<style>
	.card {
		position: absolute;
		left: calc(12px + env(safe-area-inset-left));
		bottom: 40px;
		width: 250px;
		z-index: 12;
		background: rgba(9, 14, 24, 0.94);
		border: 1px solid #2c4466;
		border-radius: 12px;
		padding: 10px;
		font-size: 12px;
		color: #d6e2f5;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.card.mobile {
		left: 8px;
		right: 8px;
		width: auto;
		top: auto;
		bottom: calc(186px + env(safe-area-inset-bottom));
		padding: 8px;
		gap: 5px;
	}
	.card.mobile.compact {
		top: calc(156px + env(safe-area-inset-top));
		bottom: auto;
	}
	.card.mobile .needs {
		grid-template-columns: repeat(4, 1fr);
	}
	.card.mobile .need {
		grid-template-columns: auto 1fr;
	}
	.card.mobile .portrait {
		width: 34px;
		height: 34px;
	}
	.card.mobile .ctl {
		min-height: 34px;
	}
	.head {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.portrait {
		width: 44px;
		height: 44px;
		flex-shrink: 0;
	}
	.id {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.id b {
		font-size: 14px;
	}
	.id span {
		font-size: 11px;
		opacity: 0.75;
	}
	.mood {
		opacity: 1 !important;
	}
	.act {
		background: #111b2c;
		border-radius: 7px;
		padding: 5px 7px;
	}
	.act small {
		color: #ffd27a;
	}
	.needs {
		display: grid;
		grid-template-columns: 1fr;
		gap: 3px 8px;
	}
	.need {
		display: grid;
		grid-template-columns: 1fr 70px;
		align-items: center;
		font-size: 11px;
		gap: 4px;
	}
	.bar {
		height: 7px;
		background: #1c2a40;
		border-radius: 4px;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		transition: width 0.25s;
	}
	button {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 8px;
		cursor: pointer;
		touch-action: manipulation;
	}
	.x {
		min-width: 32px;
		min-height: 32px;
		align-self: flex-start;
	}
	.ctl {
		min-height: 38px;
		font-weight: 700;
		background: linear-gradient(180deg, #1d4f80, #143a60);
		border-color: #49a6ff;
	}
	.ctl.rel {
		background: linear-gradient(180deg, #6a3d1d, #50300f);
		border-color: #e09a4a;
	}
</style>
