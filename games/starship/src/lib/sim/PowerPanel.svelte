<script lang="ts">
	/** Power drawer: supply / battery settings, live per-item draw, state, editable priority, 24 h load profile. */
	import { onDestroy } from 'svelte';
	import { crew } from './crewSim.svelte';
	import { PRIORITIES, fmtW, type Priority } from './power';
	let { onclose }: { onclose?: () => void } = $props();
	let r = $state(crew.powerReport());
	const t = setInterval(() => (r = crew.powerReport()), 500);
	onDestroy(() => clearInterval(t));
	const W = 320, H = 110;
	const chart = $derived.by(() => {
		const h = r.hist.slice(-288);
		if (h.length < 2) return null;
		const max = Math.max(1000, ...h.map((p) => Math.max(p.load, p.supply))) * 1.1;
		const X = (i: number) => (i / (h.length - 1)) * W;
		const Y = (w: number) => H - (w / max) * H;
		return {
			load: h.map((p, i) => `${X(i)},${Y(p.load)}`).join(' '),
			supply: h.map((p, i) => `${X(i)},${Y(p.supply)}`).join(' '),
			soc: h.map((p, i) => `${X(i)},${H - p.soc * H}`).join(' '),
			max
		};
	});
	const stateCls = (s: string) => (s === 'Shed' || s === 'Brownout' || s === 'Broken' ? 'bad' : s === 'Active' || s === 'Peak' ? 'on' : 'idle');
	function setPrio(uid: number, deck: number, p: Priority) {
		const it = crew.items.find((i) => i.uid === uid && i.deck === deck);
		if (it) crew.setPrio(it, p);
	}
</script>

<div class="pp" data-testid="power-panel">
	<div class="hd"><b>⚡ Power bus</b><button class="x" onclick={() => onclose?.()} aria-label="Close power panel">✕</button></div>
	<div class="sum">
		<div><small>Load</small><b>{fmtW(r.load)}</b></div>
		<div><small>Supply</small><b>{fmtW(r.supply)}</b></div>
		<div><small>Battery</small><b class:low={r.socPct < 25}>{r.socPct.toFixed(0)} % · {r.soc.toFixed(1)} kWh</b></div>
		<div><small>Peak</small><b>{fmtW(r.peakLoad)}</b></div>
	</div>
	{#if r.shed.length}<div class="alert" data-testid="power-alert">Power deficit {(r.deficit / 1000).toFixed(1)} kW: {r.shed.join(', ')} unavailable</div>{/if}
	<div class="set">
		<label>Cruise kW <input type="number" min="0" step="0.5" bind:value={crew.settings.powerCruiseKW} /></label>
		<label>Surface kW <input type="number" min="0" step="0.5" bind:value={crew.settings.powerSurfaceKW} /></label>
		<label>Surface source
			<select bind:value={crew.settings.surfaceSource}><option value="solar">Solar (day/night)</option><option value="nuclear">Nuclear (constant)</option></select>
		</label>
		<label>Battery kWh <input type="number" min="0" step="1" bind:value={crew.settings.batteryKWh} /></label>
	</div>
	<div class="ch">
		<small>Load profile (last 24 h): <i style="color:#4ade80">load</i> · <i style="color:#60a5fa">supply</i> · <i style="color:#facc15">battery %</i>{chart ? ` · max ${fmtW(chart.max)}` : ''}</small>
		{#if chart}
			<svg viewBox="0 0 {W} {H}" width="100%" height={H} data-testid="power-chart">
				<rect width={W} height={H} fill="#0d1626" />
				<polyline points={chart.supply} fill="none" stroke="#60a5fa" stroke-width="1.5" />
				<polyline points={chart.soc} fill="none" stroke="#facc15" stroke-width="1" stroke-dasharray="3 2" />
				<polyline points={chart.load} fill="none" stroke="#4ade80" stroke-width="1.5" />
			</svg>
		{:else}<div class="empty">run the crew sim to record the load profile</div>{/if}
	</div>
	<table>
		<thead><tr><th>Item</th><th>State</th><th>Draw</th><th>Priority</th><th>kWh</th></tr></thead>
		<tbody>
			{#each r.items as i (i.key)}
				<tr data-testid="power-row">
					<td title={`standby ${i.standby} W · active ${i.active} W${i.peak ? ` · peak ${i.peak} W` : ''}${i.duty < 1 ? ` · duty ${Math.round(i.duty * 100)} %` : ''}`}>{i.icon} {i.name}</td>
					<td class={stateCls(i.state)}>{i.state === 'Shed' ? '⛔ no power' : i.state}</td>
					<td>{fmtW(i.draw)}</td>
					<td><select value={i.prio} onchange={(e) => setPrio(i.uid, i.deck, e.currentTarget.value as Priority)} aria-label="Priority">{#each PRIORITIES as p (p)}<option>{p}</option>{/each}</select></td>
					<td>{i.kwh.toFixed(1)}</td>
				</tr>
			{/each}
			<tr><td>💡 Lighting (all decks)</td><td class="on">Occupancy</td><td>{fmtW(r.lights)}</td><td>Essential</td><td></td></tr>
		</tbody>
	</table>
	<div class="hint">Shedding order when demand &gt; supply + battery: Deferrable → Normal → Essential (Critical never). Restored one at a time with a 15 % margin after ≥ 15 min. Values ISS/analog-based where noted, else ESTIMATE.</div>
</div>

<style>
	.pp {
		position: absolute;
		right: calc(12px + env(safe-area-inset-right));
		top: 60px;
		width: 360px;
		max-height: calc(100% - 80px);
		overflow: auto;
		z-index: 25;
		background: rgba(9, 14, 24, 0.95);
		border: 1px solid #2c4466;
		border-radius: 12px;
		padding: 10px;
		font-size: 12px;
		color: #d6e2f5;
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
	}
	.hd {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.x {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 8px;
		min-width: 30px;
		min-height: 30px;
	}
	.sum {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.sum div {
		display: flex;
		flex-direction: column;
		background: #111b2c;
		border-radius: 6px;
		padding: 4px 6px;
	}
	.sum small {
		opacity: 0.7;
		font-size: 10px;
	}
	.low {
		color: #f87171;
	}
	.alert {
		background: rgba(239, 68, 68, 0.15);
		border: 1px solid #ef4444;
		border-radius: 6px;
		padding: 4px 6px;
		color: #ffd2d2;
	}
	.set {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 8px;
	}
	.set label {
		display: flex;
		flex-direction: column;
		font-size: 11px;
		gap: 2px;
	}
	input,
	select {
		font: inherit;
		color: inherit;
		background: #0d1626;
		border: 1px solid #24344e;
		border-radius: 5px;
		padding: 2px 4px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}
	th {
		text-align: left;
		opacity: 0.7;
		font-weight: 600;
	}
	td {
		padding: 2px 3px;
		border-top: 1px solid #1c2a40;
	}
	td select {
		font-size: 10px;
		padding: 0 2px;
	}
	.on {
		color: #4ade80;
	}
	.idle {
		color: #94a3b8;
	}
	.bad {
		color: #f87171;
		font-weight: 700;
	}
	.empty,
	.hint {
		font-size: 10.5px;
		opacity: 0.7;
	}
</style>
