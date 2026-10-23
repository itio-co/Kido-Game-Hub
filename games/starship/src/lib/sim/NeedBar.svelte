<script lang="ts">
	/** One crew need: icon/label, bar, trend symbol for the net rate (<< < · > >>), exact rate on hover / tap. */
	import { trend, fmtRate } from './effects';
	interface Props {
		icon: string;
		label: string;
		color: string;
		value: number;
		rate: number;
		/** icon only, narrow bar */
		compact?: boolean;
		showLabel?: boolean;
	}
	let { icon, label, color, value, rate, compact = false, showLabel = true }: Props = $props();
	const t = $derived(trend(rate));
	const tip = $derived(`${label} ${Math.round(value)} · ${fmtRate(rate)}`);
	let open = $state(false);
</script>

<div class="need" class:compact title={tip} data-testid="need-row">
	<span class="lab">{icon}{#if showLabel && !compact} {label}{/if}</span>
	<span class="bar"><span style:width="{value}%" style:background={value < 20 ? '#ff5a5a' : value < 45 ? '#ffb43a' : color}></span></span>
	<button type="button" class="tr {t.cls}" data-testid="trend" data-rate={rate} aria-label={tip} onclick={(e) => (e.stopPropagation(), (open = !open))}>{t.sym}</button>
	{#if open}<span class="rate {t.cls}">{fmtRate(rate)}</span>{/if}
</div>

<style>
	.need {
		display: grid;
		grid-template-columns: 1fr 64px 22px;
		align-items: center;
		font-size: 11px;
		gap: 4px;
		position: relative;
	}
	.need.compact {
		grid-template-columns: auto 1fr 18px;
		gap: 2px;
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
	.tr {
		font: 800 12px/1 ui-monospace, Menlo, monospace;
		letter-spacing: -1px;
		background: none;
		border: 0;
		padding: 2px 0;
		min-height: 18px;
		cursor: help;
		text-align: center;
		color: #6c7c95;
		touch-action: manipulation;
	}
	.up,
	.up2 {
		color: #4be37a;
	}
	.down,
	.down2 {
		color: #ff5c5c;
	}
	.up2,
	.down2 {
		font-size: 13px;
	}
	.rate {
		position: absolute;
		right: 0;
		top: -15px;
		background: #0b1220;
		border: 1px solid #2c4466;
		border-radius: 5px;
		padding: 0 4px;
		font-size: 10px;
		font-weight: 700;
		z-index: 2;
		white-space: nowrap;
	}
</style>
