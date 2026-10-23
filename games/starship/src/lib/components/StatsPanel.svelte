<script lang="ts">
	import { ORIGINAL_CABIN_VOLUME } from '$lib/game/ship';
	import { game } from '$lib/game/state.svelte';
	interface Props {
		compact?: boolean;
	}
	let { compact = false }: Props = $props();
	const s = $derived(game.stats);
	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
	const pPct = $derived(Math.min(100, (s.power / s.powerAvail) * 100));
	const vPct = $derived(Math.min(100, (s.volume / (s.volumeLimit ?? Math.max(s.volume, 1))) * 100));
	const warnings = $derived([
		...game.unreachableDecks.map((k) => ({ uid: -1, text: `${game.deckLabel(k)} is unreachable – no ladder chain from the airlock deck` })),
		...game.invalidPlacements.map((w) => ({ uid: w.deck === game.current ? w.uid : -1, text: '⛔ ' + w.text })),
		...(game.seats < game.crew ? [{ uid: -1, text: `Only ${game.seats} launch seats for ${game.crew} crew` }] : []),
		...(game.analysis?.warnings ?? [])
	]);
</script>

{#if compact}
	<div class="chip" class:bad={!s.powerOk}>
		<span>⚡{(s.power / 1000).toFixed(1)}/{(s.powerAvail / 1000).toFixed(1)} kW</span>
		<span>▢ {s.freeArea.toFixed(1)} m²</span>
		<span>⬡ {fmt(s.volume)}{s.volumeLimit ? '/' + s.volumeLimit : ''} m³</span>
		<span>💺{game.seats}/{game.crew}</span>
		{#if warnings.length}<span class="w">⚠{warnings.length}</span>{/if}
	</div>
{:else}
	<div class="stats">
		<div class="row"><span>Free floor ({game.deckLabel(game.current)})</span><b>{s.freeArea.toFixed(1)} / {s.floorArea.toFixed(1)} m²</b></div>
		{#if s.volumeLimit}
			<div class="row"><span>Pressurized volume</span><b class:neg={s.volume > s.volumeLimit}>{s.volume.toFixed(0)} / {s.volumeLimit} m³</b></div>
			<div class="bar"><div class="fill vol" style:width="{vPct}%"></div></div>
		{:else}
			<div class="row"><span>Habitable deck volume</span><b>{s.volume.toFixed(0)} m³</b></div>
			<div class="row small"><span>Original cabin (reference)</span><b>{ORIGINAL_CABIN_VOLUME} m³</b></div>
			<div class="row small"><span>Tank volume reclaimed</span><b>{game.reclaimed.toFixed(0)} m³</b></div>
		{/if}
		<div class="decks">
			{#each game.decks as d, k}
				<span class:cur={k === game.current}>{game.deckLabel(k)}: {d.height.toFixed(1)} m{game.shielded(k) === 'full' ? ' 🛡' : ''}</span>
			{/each}
		</div>
		<div class="row"><span>Launch seats / crew</span><b class:neg={game.seats < game.crew}>{game.seats} / {game.crew}</b></div>
		<div class="row"><span>Electrical load <i>(assumed budget)</i></span><b class:neg={!s.powerOk}>{fmt(s.power)} / {fmt(s.powerAvail)} W</b></div>
		<div class="bar"><div class="fill" class:bad={!s.powerOk} style:width="{pPct}%"></div></div>
		{#if !s.powerOk}<div class="warn">⚠ Electrical load exceeds the available power budget.</div>{/if}
		<div class="row small"><span>Items</span><b>{s.count}</b></div>
		<div class="row small"><span>Mass (est.)</span><b>{fmt(s.mass)} kg</b></div>
		<div class="row small"><span>Cost (est.)</span><b>${fmt(s.cost)}</b></div>
		{#if game.clearance}
			{#if warnings.length}
				<div class="warnlist">
					{#each warnings as w}
						<button class="wl" onclick={() => { if (w.uid >= 0) { game.tool = 'select'; game.selectedUid = w.uid; } }}>⚠ {w.text}</button>
					{/each}
				</div>
			{:else if game.analysis && !game.analysis.hasEntry}
				<div class="note">No ladder/hatch on this deck – path check skipped.</div>
			{:else}
				<div class="ok">✓ Access zones clear, 0.8 m paths OK</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 12.5px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 8px;
	}
	.row.small {
		opacity: 0.75;
		font-size: 12px;
	}
	i {
		font-size: 10px;
		opacity: 0.7;
	}
	.neg {
		color: #ff6b78;
	}
	.bar {
		height: 6px;
		border-radius: 3px;
		background: #1a2335;
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, #9fd36b, #f1d36b);
		transition: width 0.2s;
	}
	.fill.vol {
		background: linear-gradient(90deg, #4aa3ff, #7fd6ff);
	}
	.fill.bad {
		background: #ff3b4e;
	}
	.decks {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		font-size: 11px;
		opacity: 0.85;
	}
	.decks span {
		padding: 1px 6px;
		border-radius: 4px;
		background: #18233a;
	}
	.decks .cur {
		background: #1f4c7a;
	}
	.warn {
		padding: 6px 8px;
		border-radius: 6px;
		background: rgba(255, 59, 78, 0.15);
		border: 1px solid rgba(255, 59, 78, 0.6);
		color: #ff9aa5;
		font-weight: 600;
	}
	.warnlist {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: 140px;
		overflow: auto;
	}
	.wl {
		all: unset;
		cursor: pointer;
		font-size: 11.5px;
		color: #ffb35c;
		padding: 3px 6px;
		border-radius: 4px;
		background: rgba(255, 154, 31, 0.1);
	}
	.ok {
		color: #8fe39b;
		font-size: 12px;
	}
	.note {
		color: #9fb6d6;
		font-size: 12px;
	}
	.chip {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 12px;
		font-weight: 600;
		padding: 6px 10px;
		border-radius: 12px;
		background: rgba(12, 18, 30, 0.85);
		border: 1px solid #23324a;
		max-width: 62vw;
	}
	.chip.bad {
		border-color: #ff3b4e;
		color: #ff8b96;
	}
	.w {
		color: #ffb35c;
	}
</style>
