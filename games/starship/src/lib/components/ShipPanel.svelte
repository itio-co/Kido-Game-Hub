<script lang="ts">
	/** Surface-habitat configuration: location, burial/berm, sections, domes, rings, openings. */
	import { game } from '$lib/game/state.svelte';
	import {
		BERM_MAX,
		BURIAL_MAX,
		BERM_WIDTH,
		LOCATIONS,
		OPENING_MAX_H,
		OPENING_MAX_H_SPAN,
		OPENING_MAX_W,
		ORIGINAL_CABIN_VOLUME,
		RING_HEIGHT,
		RING_INSERT_MAX,
		SHIELD_REFS,
		TUNNEL_DIAMETER,
		arealDensity,
		sectionRings,
		type DomeId,
		type DomeState
	} from '$lib/game/ship';
	import { HABITABLE_VOLUME_LIMIT } from '$lib/game/specs';

	const h = $derived(game.hab);
	const g = $derived(game.ship);
	const loc = $derived(LOCATIONS[h.location]);
	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
	const lateral = $derived(arealDensity(BERM_WIDTH, loc.rho));
	const below = $derived(arealDensity(h.burial, loc.rho));
	const refs = $derived(SHIELD_REFS.filter((r) => r.loc === h.location));
	const deckCount = (sec: string) => game.decks.filter((d) => d.section === sec).length;

	// ring insert form
	let insSec = $state<'lox' | 'ch4' | 'crew'>('crew');
	let insJoint = $state(1);
	let insCount = $state(1);
	const insMax = $derived(sectionRings(h, insSec) - 1);

	// opening form
	let op = $state({ ring: 20, angle: 90, w: 1.2, h: 1.6, spanWeld: false, tunnel: true, tunnelLen: 4 });
	const opCheck = $derived(game.checkOpening(op));
	const ringLabel = (i: number) => {
		const s = g.ringSection[i];
		const first = g.ringSection.indexOf(s);
		return `#${i + 1} ${s.toUpperCase()}-${i - first + 1} (${g.ringY[i].toFixed(1)}–${(g.ringY[i] + RING_HEIGHT).toFixed(1)} m)`;
	};
	const domeName: Record<DomeId, string> = { aft: 'Aft dome', common: 'Common dome', forward: 'Forward dome' };
	const states: { id: DomeState; label: string }[] = [
		{ id: 'intact', label: 'Keep' },
		{ id: 'hatch', label: 'Hatch Ø1' },
		{ id: 'cut', label: 'Cut' }
	];
</script>

<div class="seg">
	<button class:active={game.shipMode === 'cabin'} onclick={() => game.setShipMode('cabin')}>🚀 Cabin (≤{HABITABLE_VOLUME_LIMIT} m³)</button>
	<button class:active={game.shipMode === 'habitat'} onclick={() => game.setShipMode('habitat')}>🏕 Surface habitat</button>
</div>

{#if game.shipMode === 'habitat'}
	<div class="blk">
		<div class="seg">
			{#each Object.entries(LOCATIONS) as [id, l]}
				<button class:active={h.location === id} onclick={() => game.setLocation(id as 'moon' | 'mars')}>{id === 'moon' ? '🌕' : '🔴'} {l.name} · {l.g} m/s²</button>
			{/each}
		</div>
		<label class="sl">
			<span>Burial depth <i class="est">ESTIMATE</i></span>
			<input type="range" min="0" max={BURIAL_MAX} step="0.1" value={h.burial} oninput={(e) => game.setBurial(Number(e.currentTarget.value))} />
			<b>{h.burial.toFixed(1)} m</b>
		</label>
		<label class="sl">
			<span>Berm above grade <i class="est">ESTIMATE</i></span>
			<input type="range" min="0" max={BERM_MAX} step="0.1" value={h.berm} oninput={(e) => game.setBerm(Number(e.currentTarget.value))} />
			<b>{h.berm.toFixed(1)} m</b>
		</label>
		<div class="note">
			🛡 Soil line on the hull at <b>+{game.soilTop.toFixed(1)} m</b> (ship base = pit floor).<br />
			Below grade: {h.burial.toFixed(1)} m × {loc.rho} g/cm³ = <b>{below.toFixed(0)} g/cm²</b> · lateral through the {BERM_WIDTH} m berm crest:
			{BERM_WIDTH} m × {loc.rho} = <b>{lateral.toFixed(0)} g/cm²</b>.
			{#each refs as r}<br />· ref {r.gcm2} g/cm² – {r.text}{/each}
			<br /><small>{loc.rhoNote}. Lateral only: overhead the decks see the ship structure and sky. Gravity {loc.g} m/s² (Moon 1.62 / Mars 3.71).</small>
		</div>
	</div>

	<h3>Sections <i class="est">ESTIMATE ring model</i></h3>
	<div class="secs">
		{#each [...g.sections].reverse() as s}
			<div class="sec" class:tank={s.kind === 'tank'}>
				<div class="row">
					<b>{s.short}</b><span>{s.name}</span>
					<small>{s.y0.toFixed(1)}–{s.y1.toFixed(1)} m{s.rings ? ` · ${s.rings}×${RING_HEIGHT} m` : ''} · {fmt(s.volume)} m³</small>
				</div>
				{#if s.id === 'lox' || s.id === 'ch4'}
					<div class="row act">
						<span class="pill" class:ok={h.converted[s.id]}>{h.converted[s.id] ? 'HABITAT' : 'SEALED'}</span>
						{#if h.converted[s.id]}
							<button onclick={() => game.addDeck(s.id as 'lox' | 'ch4')}>＋ deck ({deckCount(s.id)})</button>
							<button class="ghost" onclick={() => game.convertTank(s.id as 'lox' | 'ch4', false)}>Seal</button>
						{:else}
							<button onclick={() => game.convertTank(s.id as 'lox' | 'ch4')}>Convert to habitat</button>
						{/if}
					</div>
				{:else if s.id === 'crew'}
					<div class="row act">
						<span class="pill ok">CREW</span>
						<button onclick={() => game.addDeck('crew')}>＋ deck ({deckCount('crew')})</button>
						<small>nose decks: usable radius at head height, ≥1.2 m</small>
					</div>
				{/if}
			</div>
			{#each g.domes.filter((d) => d.below === s.id && d.id !== 'aft') as d}
				<div class="dome">
					<span>⌓ {domeName[d.id]}</span>
					<div class="seg tiny">
						{#each states as st}
							<button class:active={d.state === st.id} onclick={() => game.setDome(d.id, st.id)}>{st.label}</button>
						{/each}
					</div>
				</div>
			{/each}
		{/each}
	</div>
	<div class="note">
		Habitable deck volume <b>{fmt(game.volume)} m³</b> (no cap; original cabin {ORIGINAL_CABIN_VOLUME} m³ / planner cap {HABITABLE_VOLUME_LIMIT} m³ for reference) ·
		reclaimed tank volume <b>{fmt(game.reclaimed)} m³</b>
	</div>

	<h3>Insert rings <i class="est">ESTIMATE</i></h3>
	<div class="form">
		<select bind:value={insSec}>
			<option value="crew">Crew bay</option>
			<option value="ch4">CH4 tank</option>
			<option value="lox">LOX tank</option>
		</select>
		<label>joint <input type="number" min="1" max={insMax} bind:value={insJoint} /></label>
		<label>× <input type="number" min="1" max={RING_INSERT_MAX} bind:value={insCount} /></label>
		<button onclick={() => game.insertRings(insSec, insJoint, insCount)}>✂ Insert</button>
	</div>
	<div class="hint">+{(insCount * RING_HEIGHT).toFixed(2)} m · cut at the weld, add rings, two new circumferential welds → structural requalification required.</div>
	{#each h.inserts as ins, i}
		<div class="li">✂ {ins.count} ring(s) at {ins.section.toUpperCase()} joint {ins.joint} <button class="x" onclick={() => game.removeInsert(i)}>✕</button></div>
	{/each}

	<h3>Side openings <i class="est">ESTIMATE rules</i></h3>
	<div class="form">
		<select bind:value={op.ring}>
			{#each g.ringY as _, i}
				<option value={i}>{ringLabel(i)}</option>
			{/each}
		</select>
		<label>az° <input type="number" min="0" max="359" step="5" bind:value={op.angle} /></label>
		<label>w <input type="number" min="0.6" max={OPENING_MAX_W} step="0.1" bind:value={op.w} /></label>
		<label>h <input type="number" min="0.6" max={op.spanWeld ? OPENING_MAX_H_SPAN : OPENING_MAX_H} step="0.05" bind:value={op.h} /></label>
	</div>
	<div class="form">
		<label><input type="checkbox" bind:checked={op.spanWeld} /> span weld (frame)</label>
		<label><input type="checkbox" bind:checked={op.tunnel} /> Ø{TUNNEL_DIAMETER} m tunnel</label>
		{#if op.tunnel}<label>len <input type="number" min="2" max="12" step="0.5" bind:value={op.tunnelLen} /></label>{/if}
		<button disabled={!opCheck.ok} onclick={() => game.addOpening({ ...op })}>Cut opening</button>
	</div>
	<div class="hint" class:bad={!opCheck.ok}>
		{opCheck.ok ? '✓ allowed' : '✗ ' + opCheck.reason}{#each opCheck.warnings as w}<br />⚠ {w}{/each}
		<br /><small>Max width {OPENING_MAX_W} m; inside one ring ≤ {OPENING_MAX_H.toFixed(2)} m (clear of welds) or two rings ≤ {OPENING_MAX_H_SPAN.toFixed(2)} m with a frame; no openings in dome rings or the nose.</small>
	</div>
	{#each h.openings as o}
		{@const r = game.openingRange(o)}
		<div class="li">
			P{o.uid}: {o.w}×{o.h} m @ {o.angle}° · {r.y0.toFixed(1)}–{r.y1.toFixed(1)} m{o.tunnel ? ` · T${o.uid} ${o.tunnelLen} m${r.yc < game.soilTop ? ' (buried)' : ''}` : ''}
			<button class="x" onclick={() => game.removeOpening(o.uid)}>✕</button>
		</div>
	{/each}
{/if}

<style>
	.blk {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 6px;
	}
	h3 {
		font-size: 12px;
		margin: 10px 0 4px;
		color: #9fb4cc;
	}
	.est {
		font-style: normal;
		font-size: 9px;
		background: #4a3a10;
		color: #ffd27a;
		border-radius: 3px;
		padding: 0 4px;
		margin-left: 4px;
		vertical-align: middle;
	}
	.sl {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 8px;
		font-size: 12px;
		align-items: center;
	}
	.sl span {
		grid-column: 1 / 3;
	}
	.sl input {
		width: 100%;
	}
	.note,
	.hint {
		font-size: 11px;
		line-height: 1.4;
		opacity: 0.9;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 6px;
		padding: 6px 8px;
		margin-top: 4px;
	}
	.hint.bad {
		color: #ff9aa4;
	}
	small {
		opacity: 0.75;
		font-size: 10px;
	}
	.secs {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.sec {
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		padding: 4px 6px;
		font-size: 12px;
	}
	.sec.tank {
		border-color: rgba(255, 200, 100, 0.25);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
	}
	.row.act {
		margin-top: 3px;
		align-items: center;
	}
	.pill {
		font-size: 10px;
		padding: 1px 6px;
		border-radius: 8px;
		background: #4a2a2a;
		color: #ffb0b0;
	}
	.pill.ok {
		background: #1f4a2c;
		color: #9cf0b8;
	}
	.dome {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 11.5px;
		padding: 0 4px;
		color: #ffb15a;
	}
	.form {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		font-size: 12px;
		margin-top: 4px;
	}
	.form input[type='number'] {
		width: 56px;
	}
	.form select {
		max-width: 100%;
	}
	.li {
		font-size: 11.5px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 2px 4px;
	}
	.x {
		padding: 0 6px;
	}
	.seg.tiny button {
		padding: 2px 6px;
		font-size: 11px;
	}
	button.ghost {
		opacity: 0.7;
	}
</style>
