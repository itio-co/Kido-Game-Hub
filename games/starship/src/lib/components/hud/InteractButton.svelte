<script lang="ts">
	/** Big context "Interact" button (mobile + desktop action bar): tap = best action (E), hold 0.4 s = list. */
	import { interact } from '$lib/game/interact.svelte';

	let { mobile = false }: { mobile?: boolean } = $props();
	const top = $derived(interact.list[0]);
</script>

<button
	class="ixbtn"
	class:mobile
	class:idle={!top || top.disabled}
	data-testid="interact-btn"
	aria-label="Interact"
	title="Interact (E · Shift+E / hold for more)"
	onpointerdown={(e) => {
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		interact.pressStart(e.timeStamp || performance.now());
	}}
	onpointerup={(e) => interact.pressEnd(e.timeStamp || performance.now())}
	onpointercancel={() => interact.cancel()}
	onkeydown={(e) => (e.code === 'Enter' || e.code === 'Space') && (e.preventDefault(), interact.primary())}
>
	<b>{mobile ? 'Interact' : 'E Interact'}</b>
	{#if top}<small>{top.label}</small>{/if}
</button>

<style>
	.ixbtn {
		font: inherit;
		font-weight: 600;
		color: #e4f0ff;
		background: rgba(20, 110, 60, 0.95);
		border: 1px solid #39ff88;
		border-radius: 12px;
		min-height: 48px;
		min-width: 48px;
		padding: 4px 14px;
		cursor: pointer;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
		justify-content: center;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		max-width: 190px;
		text-align: left;
		touch-action: none;
	}
	.ixbtn.mobile {
		min-height: 64px;
		min-width: 120px;
		max-width: 160px;
		font-size: 15px;
	}
	.ixbtn small {
		font-size: 11px;
		font-weight: 400;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.ixbtn.idle {
		background: rgba(14, 22, 36, 0.9);
		border-color: #2c4466;
	}
</style>
