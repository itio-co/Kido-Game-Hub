<script lang="ts">
	/** Mission phase, crew count, pre-launch checklist (automatic) and cargo restraint checklist (manual). */
	import { game } from '$lib/game/state.svelte';

	const pf = $derived(game.preflight);
	const auto = $derived([
		{ ok: pf.seatsOk, text: `Launch couches ≥ crew (${game.seats} / ${game.crew})` },
		{ ok: pf.couchIssues.length === 0, text: pf.couchIssues.length ? `Couch egress blocked (${pf.envelope} envelope): ${pf.couchIssues.length} couch${pf.couchIssues.length > 1 ? 'es' : ''} – click to inspect` : `Every couch has front access + 0.8 m egress path (${pf.envelope} envelope)` },
		{ ok: pf.underHatch.length === 0, text: pf.underHatch.length ? `Near a hatch opening above: ${pf.underHatch.join('; ')}` : 'No couch under / next to a hatch opening' },
		{ ok: true, text: `${pf.stowables} stowable item(s) shown stowed in Launch/Landing` },
		{ ok: pf.powerOk, text: 'Electrical load within budget' }
	]);
	const cargo = [
		['nets', 'Cargo nets / straps on all racks and lockers'],
		['loose', 'Loose items stowed in lockers (no free mass > 0.5 kg)'],
		['hatches', 'Deck hatches latched; ladders clear'],
		['water', 'Water / waste tanks valved for launch attitude'],
		['suits', 'Suits on, harness 5-point checked (each crew)']
	] as const;
	const ready = $derived(auto.every((a) => a.ok) && cargo.every(([k]) => game.checklist[k]));
</script>

<div class="crew">
	<div class="seg phases" role="group" aria-label="Mission phase">
		<button class:active={game.mission === 'launch'} onclick={() => game.setMission('launch')}>🚀 Launch</button>
		<button class:active={game.mission === 'cruise'} onclick={() => game.setMission('cruise')}>🪐 Cruise (micro-g)</button>
		<button class:active={game.mission === 'landing'} onclick={() => game.setMission('landing')}>🛬 Landing</button>
		<button class:active={game.mission === 'surface'} onclick={() => game.setMission('surface')}>🌕 Surface</button>
	</div>
	<div class="phint">{game.mission === 'cruise' ? 'Weightless: crew float, push off handrails and fly through open hatches.' : game.phase === 'launch' ? 'Couches deployed, stowables folded, crew strapped in.' : `Surface gravity (${game.shipMode === 'habitat' ? game.hab.location : 'Earth'}).`}</div>
	{#if game.mission === 'cruise'}
		<div class="row">
			<label class="row"><input type="checkbox" bind:checked={game.freeCam} aria-label="Free 6-DOF camera" /> <span>Free 6-DOF camera</span></label>
			<button class="mini" onclick={() => game.resetUpTick++} disabled={!game.freeCam} aria-label="Reset up">⬆ Reset up</button>
		</div>
	{/if}
	<label class="row">
		<span>Crew</span>
		<button class="mini" onclick={() => (game.crew = Math.max(1, game.crew - 1))}>−</button>
		<input type="number" min="1" max="100" value={game.crew} onchange={(e) => (game.crew = Math.max(1, Math.min(100, Math.round(Number(e.currentTarget.value) || 1))))} />
		<button class="mini" onclick={() => (game.crew = Math.min(100, game.crew + 1))}>＋</button>
		<b class:bad={game.seats < game.crew}>💺 {game.seats}</b>
	</label>
	<div class="list">
		<div class="hd">Pre-launch checklist {ready ? '✅ GO' : '⛔ NO-GO'}</div>
		{#each auto as a, i}
			<div class="it" class:bad={!a.ok}>{a.ok ? '✓' : '✗'} {a.text}</div>
			{#if i === 1}
				{#each pf.couchBlocked as c (c.deck + ':' + c.uid)}
					<button class="it issue" data-testid="egress-issue" onclick={() => game.focusCouch(c.deck, c.uid)} title="Show this couch, its envelope and egress path">🔍 {c.text}</button>
				{/each}
			{/if}
		{/each}
		<div class="hd">Cargo restraint</div>
		{#each cargo as [k, t]}
			<label class="it"><input type="checkbox" checked={!!game.checklist[k]} onchange={(e) => (game.checklist = { ...game.checklist, [k]: e.currentTarget.checked })} /> {t}</label>
		{/each}
	</div>
	<div class="hint">
		Couches: semi-supine +Gx, thrust along the ship axis → backs to the floor (NASA-STD-3001; Soyuz/Dragon analogs). <i class="est">ESTIMATE</i> sizes. Placements are checked in both phases.
	</div>
</div>

<style>
	.crew {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
	}
	.issue {
		text-align: left;
		font: inherit;
		font-size: 11px;
		color: #ffb4b4;
		background: rgba(239, 68, 68, 0.12);
		border: 1px solid rgba(239, 68, 68, 0.45);
		border-radius: 6px;
		padding: 4px 6px;
		cursor: pointer;
		margin: 1px 0 1px 10px;
	}
	.issue:hover {
		background: rgba(239, 68, 68, 0.22);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.row input {
		width: 56px;
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 6px;
		padding: 6px 8px;
	}
	.hd {
		font-weight: 600;
		margin-top: 2px;
		color: #9fb4cc;
	}
	.it {
		font-size: 11.5px;
	}
	.bad {
		color: #ff8a96;
	}
	.hint {
		font-size: 10.5px;
		opacity: 0.75;
	}
	.est {
		font-style: normal;
		font-size: 9px;
		background: #4a3a10;
		color: #ffd27a;
		border-radius: 3px;
		padding: 0 4px;
	}
	.phases {
		display: grid !important;
		grid-template-columns: 1fr 1fr;
	}
	.phint {
		font-size: 11px;
		color: #8ea3c2;
		margin: 4px 0;
	}
</style>
