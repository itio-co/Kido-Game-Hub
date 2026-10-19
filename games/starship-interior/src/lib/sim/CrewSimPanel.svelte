<script lang="ts">
	/** Crew simulation controls: start/stop, play/pause, speed, clock, schedule, roster, log, analytics, CSV. */
	import { NEEDS } from '$lib/game/affordances';
	import { download } from '$lib/game/exporters';
	import { game } from '$lib/game/state.svelte';
	import { crew, fmtClock, ROLES, SPEEDS } from './crewSim.svelte';

	let tab = $state<'crew' | 'log' | 'analytics' | 'settings'>('crew');
	let report = $state<ReturnType<typeof crew.analytics> | null>(null);
	let edit = $state<number | null>(null);
	$effect(() => {
		// refresh analytics with the UI snapshot while the tab is open
		void crew.ui.clock;
		if (tab === 'analytics' && crew.enabled) report = crew.analytics();
	});
	function exportCSV() {
		download('crew-sim-analytics.csv', crew.csv(), 'text/csv');
		game.flash('Crew sim analytics CSV exported');
	}
	const hours = Array.from({ length: 24 }, (_, i) => i);
	const sevIcon = { high: '🔴', med: '🟠', low: '🟡' };
</script>

<div class="sim">
	{#if !crew.enabled}
		<p class="hint">Simulate {Math.min(24, game.crew)} crew living in this layout (crew count above). They walk, climb ladders, queue and use equipment by need – then report design issues.</p>
		<button class="go" onclick={() => crew.start()}>▶ Start crew sim</button>
	{:else}
		<div class="clock">
			<b>{fmtClock(crew.ui.clock)}</b>
			<span>{crew.agents.length} crew · {game.phase === 'launch' ? 'launch: strapped in' : crew.running ? `${crew.speed}×` : 'paused'}</span>
		</div>
		<div class="row">
			<button onclick={() => (crew.running = !crew.running)} aria-label={crew.running ? 'Pause' : 'Play'}>{crew.running ? '⏸' : '▶'}</button>
			{#each SPEEDS as s (s)}
				<button class:active={crew.speed === s} onclick={() => ((crew.speed = s), (crew.running = true))}>{s}×</button>
			{/each}
			<button class:active={crew.heatmap} onclick={() => (crew.heatmap = !crew.heatmap)} aria-label="Heat map" title="Congestion heat map (current deck)">🔥</button>
		</div>
		<div class="row">
			<button onclick={() => crew.reset()}>↺ Reset</button>
			<button class="danger" onclick={() => crew.stop()}>■ Stop</button>
			<button onclick={exportCSV}>⬇ CSV</button>
		</div>
		<div class="tabs">
			{#each [['crew', '👥 Crew'], ['log', '📜 Log'], ['analytics', '📊 Issues'], ['settings', '⚙']] as [k, l] (k)}
				<button class:active={tab === k} onclick={() => (tab = k as typeof tab)}>{l}</button>
			{/each}
		</div>
		{#if tab === 'crew'}
			<div class="list">
				{#each crew.ui.agents as u (u.id)}
					<div class="ag" class:sel={crew.selected === u.id}>
						<button class="who" onclick={() => (crew.selected = u.id)}>
							<span class="dot" style:background={u.color}></span>
							<span class="nm">{u.name} <small>{u.role}</small></span>
							<span class="act">{u.moodLabel} {u.action} · {u.where}</span>
						</button>
						<button class="mini" onclick={() => (edit = edit === u.id ? null : u.id)} aria-label="Edit">✎</button>
						<button class="mini" onclick={() => crew.possess(u.id)} aria-label="Take control" title="Take control">🎮</button>
					</div>
					{#if edit === u.id && crew.roster[u.id]}
						<div class="edit">
							<input aria-label="Name" maxlength="24" bind:value={crew.roster[u.id].name} />
							<select aria-label="Role" bind:value={crew.roster[u.id].role}>
								{#each ROLES as r (r)}<option>{r}</option>{/each}
							</select>
							<input aria-label="Colour" type="color" bind:value={crew.roster[u.id].color} />
						</div>
					{/if}
				{/each}
			</div>
		{:else if tab === 'log'}
			<div class="log">
				{#each crew.ui.log as e, i (i)}
					<div><time>{fmtClock(e.t).replace('Day ', 'D')}</time> {e.text}</div>
				{:else}<div class="hint">No events yet.</div>{/each}
			</div>
		{:else if tab === 'analytics' && report}
			<h3>Design issues found by crew sim <small>({report.simHours.toFixed(1)} sim h)</small></h3>
			<ul class="issues">
				{#each report.issues as i, k (k)}<li>{sevIcon[i.sev]} {i.text}</li>{:else}<li>✅ No issues yet – let the sim run (16× / 60×).</li>{/each}
			</ul>
			<h3>Equipment utilisation</h3>
			<table>
				<thead><tr><th>Item</th><th>Use</th><th>Wait</th><th>Q</th></tr></thead>
				<tbody>
					{#each report.items as i (i.uid + i.deck)}
						<tr class:bad={!i.reachable}>
							<td title={i.deck}>{i.name}<small> {i.deck}</small></td>
							<td><span class="bar"><span style:width="{Math.min(100, i.utilization)}%"></span></span>{i.utilization}%</td>
							<td>{i.avgWait.toFixed(1)}′</td>
							<td>{i.reachable ? i.maxQueue : '⛔'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<h3>Unmet needs (critical time)</h3>
			<div class="needs">
				{#each report.critical as c (c.need)}
					{@const n = NEEDS.find((x) => x.id === c.need)}
					<span>{n?.icon} {n?.label} <b>{c.pct.toFixed(1)}%</b></span>
				{/each}
			</div>
			{#if game.microG || report.micro.trips}
				<h3>Micro-g (cruise)</h3>
				<div class="needs">
					<span>🧭 {report.micro.trips} translations · avg {report.micro.avgPath.toFixed(1)} m</span>
					<span>🤚 Handrail coverage <b>{report.micro.coveragePct.toFixed(0)}%</b></span>
					<span>{report.micro.toilet ? '✅' : '⛔'} Zero-g toilet</span>
					<span>{report.micro.exercise ? '✅' : '⛔'} Micro-g exercise</span>
					{#each report.micro.hatches as h (h.label)}<span>⭕ {h.label}: {h.passes} passages · {h.congestion.toFixed(1)}′ congestion</span>{/each}
				</div>
			{/if}
			{#if report.ladders.length}
				<h3>Ladders</h3>
				<div class="needs">
					{#each report.ladders as l (l.label)}<span>🪜 {l.label}: {l.uses} climbs · {l.waitMin.toFixed(0)}′ wait</span>{/each}
				</div>
			{/if}
		{:else if tab === 'settings'}
			<div class="set">
				<label>Sleep <select bind:value={crew.settings.sleepStart}>{#each hours as h (h)}<option value={h}>{h}:00</option>{/each}</select> – <select bind:value={crew.settings.sleepEnd}>{#each hours as h (h)}<option value={h}>{h}:00</option>{/each}</select></label>
				<label>Work shift <select bind:value={crew.settings.workStart}>{#each hours as h (h)}<option value={h}>{h}:00</option>{/each}</select> – <select bind:value={crew.settings.workEnd}>{#each hours as h (h)}<option value={h}>{h}:00</option>{/each}</select></label>
				<label>Gravity (walk look)
					<select bind:value={crew.settings.gravity}>
						<option value="auto">Auto ({game.shipMode === 'habitat' ? game.hab.location : 'Earth'})</option>
						<option value="earth">Earth 1 g</option>
						<option value="mars">Mars 0.38 g</option>
						<option value="moon">Moon 0.17 g</option>
					</select>
				</label>
				<p class="hint">Roster and schedule are saved with the layout. Equipment affordances are editable in 📐 Design → metadata.</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.sim {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12.5px;
	}
	button,
	select,
	input {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 8px;
		padding: 6px 8px;
		cursor: pointer;
		min-height: 34px;
		touch-action: manipulation;
	}
	button.active {
		background: linear-gradient(180deg, #17406a, #123052);
		border-color: #49a6ff;
	}
	button.danger {
		border-color: #6b2632;
		color: #ff9aa5;
	}
	.go {
		background: linear-gradient(180deg, #1d6a3e, #14502e);
		border-color: #39c070;
		font-weight: 700;
		min-height: 42px;
	}
	.row,
	.tabs {
		display: flex;
		gap: 4px;
	}
	.row button,
	.tabs button {
		flex: 1;
		padding: 4px;
	}
	.clock {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		font-variant-numeric: tabular-nums;
	}
	.clock b {
		font-size: 16px;
		color: #cfe6ff;
	}
	.clock span {
		color: #8ea3c2;
		font-size: 11px;
	}
	.hint {
		margin: 0;
		font-size: 11px;
		color: #8ea3c2;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: 320px;
		overflow-y: auto;
	}
	.ag {
		display: flex;
		gap: 3px;
	}
	.ag.sel .who {
		border-color: #ffd34a;
	}
	.who {
		flex: 1;
		display: grid;
		grid-template-columns: 14px 1fr;
		column-gap: 6px;
		text-align: left;
		padding: 3px 7px;
		min-width: 0;
	}
	.dot {
		grid-row: span 2;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		align-self: center;
	}
	.nm {
		font-weight: 600;
	}
	.nm small {
		opacity: 0.65;
		font-weight: 400;
	}
	.act {
		font-size: 10.5px;
		opacity: 0.75;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.mini {
		min-width: 32px;
		padding: 0 4px;
	}
	.edit {
		display: grid;
		grid-template-columns: 1fr auto 40px;
		gap: 4px;
	}
	.edit input[type='color'] {
		padding: 2px;
	}
	.log {
		max-height: 260px;
		overflow-y: auto;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.log time {
		color: #6f86a8;
		font-variant-numeric: tabular-nums;
	}
	h3 {
		margin: 6px 0 2px;
		font-size: 11.5px;
		color: #a9c6ea;
	}
	h3 small {
		font-weight: 400;
		opacity: 0.7;
	}
	.issues {
		margin: 0;
		padding-left: 4px;
		list-style: none;
		font-size: 11px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 11px;
	}
	th {
		text-align: left;
		color: #6f86a8;
		font-weight: 600;
	}
	td {
		padding: 1px 2px;
		font-variant-numeric: tabular-nums;
	}
	td small {
		opacity: 0.55;
	}
	tr.bad td {
		color: #ff9aa5;
	}
	.bar {
		display: inline-block;
		width: 34px;
		height: 6px;
		background: #1c2a40;
		border-radius: 3px;
		margin-right: 4px;
		overflow: hidden;
	}
	.bar span {
		display: block;
		height: 100%;
		background: #49a6ff;
	}
	.needs {
		display: flex;
		flex-wrap: wrap;
		gap: 3px 10px;
		font-size: 11px;
	}
	.set {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.set label {
		display: flex;
		gap: 5px;
		align-items: center;
		flex-wrap: wrap;
	}
</style>
