<script lang="ts">
	import { CATALOG, CATALOG_BY_ID, sizeLabel } from '$lib/game/catalog';
	import { download } from '$lib/game/exporters';
	import { dimsOf, footprintOf, maxRadius } from '$lib/game/geometry';
	import {
		DECK_HEIGHT_MAX,
		DECK_HEIGHT_MIN,
		DECK_HEIGHT_STEP,
		DISCLAIMER,
		HABITABLE_VOLUME_LIMIT,
		HULL_INNER_RADIUS,
		MAX_STACK_HEIGHT
	} from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';
	import type { ModuleId, Tool } from '$lib/game/types';
	import StatsPanel from './StatsPanel.svelte';
	import ShipPanel from './ShipPanel.svelte';
	import CutPanel from './CutPanel.svelte';
	import CrewPanel from './CrewPanel.svelte';
	import CrewSimPanel from '$lib/sim/CrewSimPanel.svelte';
	import { equip } from '$lib/game/equipStore.svelte';

	interface Props {
		mobile?: boolean;
	}
	let { mobile = false }: Props = $props();
	let open = $state(false);
	let fileInput: HTMLInputElement;

	const tools: { id: Tool; icon: string; label: string; key: string }[] = [
		{ id: 'select', icon: '👆', label: 'Select', key: '1' },
		{ id: 'module', icon: '➕', label: 'Place', key: '2' },
		{ id: 'measure', icon: '📏', label: 'Measure', key: '3' },
		{ id: 'camera', icon: '🎥', label: 'Camera', key: '4' }
	];

	function setTool(t: Tool) {
		game.tool = t;
		game.pending = null;
		if (t !== 'measure') game.measureA = game.measureB = null;
		if (mobile && t === 'module') open = true;
	}
	function pickModule(id: ModuleId) {
		game.selectedModule = id;
		game.tool = 'module';
		game.pending = null;
		game.selectedUid = null;
		if (mobile) open = false;
	}
	function onFile(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const f = el.files?.[0];
		if (f) game.importFile(f);
		el.value = '';
	}
	function confirmThen(msg: string, fn: () => void) {
		if (confirm(msg)) fn();
	}
	const fname = (k: number, ph: string) => `starship-${game.deckLabel(k).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-plan-1to50-${ph}.svg`;
	const exportSVG = (k = game.current, ph = game.phase) => download(fname(k, ph), game.planSVG(k, ph), 'image/svg+xml');
	function exportAllSVG() {
		let n = 0;
		game.decks.forEach((_, k) => (['surface', 'launch'] as const).forEach((ph) => setTimeout(() => exportSVG(k, ph), n++ * 400)));
	}
	const exportCSV = () => download('starship-bom.csv', game.bom(), 'text/csv');
	const exportElevation = () => download('starship-habitat-elevation-1to200.svg', game.elevation(), 'image/svg+xml');
	const exportJSON = () => download('starship-interior.json', JSON.stringify(game.toJSON(), null, 2), 'application/json');
	async function exportGLB() {
		game.flash('Exporting GLB…');
		const n = await game.exportGLB?.();
		if (n) game.flash(`GLB exported (${(n / 1024).toFixed(0)} KB)`);
	}

	const sel = $derived(game.selected);
	const selInfo = $derived.by(() => {
		if (!sel) return null;
		const def = CATALOG_BY_ID[sel.type];
		const f = footprintOf(sel.type, sel.x, sel.z, sel.angle);
		return { def, r: Math.hypot(sel.x, sel.z), wall: (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) - maxRadius(f) };
	});
</script>

{#snippet toolButtons()}
	<div class="tools">
		{#each tools as t}
			<button class="tool" class:active={game.tool === t.id} onclick={() => setTool(t.id)} title="{t.label} ({t.key})">
				<span class="ico">{t.icon}</span><span class="lbl">{t.label}</span>
			</button>
		{/each}
		<button class="tool" class:active={game.snap} onclick={() => (game.snap = !game.snap)} title="Snap 0.25 m / 15° (G)">
			<span class="ico">🧲</span><span class="lbl">Snap {game.snap ? 'on' : 'off'}</span>
		</button>
	</div>
{/snippet}

{#snippet deckControls()}
	<div class="decksel">
		{#each game.decks as d, k (d.id)}
			<button class:active={k === game.current} class="sec-{d.section}" onclick={() => game.selectDeck(k)}>{game.deckLabel(k)}{game.shielded(k) === 'full' ? ' 🛡' : ''}<small>{d.height.toFixed(1)} m</small></button>
		{/each}
		<button class="add" onclick={() => game.addDeck()} title="Add deck on top">＋</button>
	</div>
	<div class="hrow">
		<span>Height {game.deckLabel(game.current)}</span>
		<button class="mini" onclick={() => game.setDeckHeight(game.current, game.deck.height - DECK_HEIGHT_STEP)}>−</button>
		<input
			type="range"
			min={DECK_HEIGHT_MIN}
			max={DECK_HEIGHT_MAX}
			step={DECK_HEIGHT_STEP}
			value={game.deck.height}
			oninput={(e) => {
				const el = e.currentTarget;
				if (!game.setDeckHeight(game.current, Number(el.value))) el.value = String(game.deck.height);
			}}
		/>
		<button class="mini" onclick={() => game.setDeckHeight(game.current, game.deck.height + DECK_HEIGHT_STEP)}>＋</button>
		<b>{game.deck.height.toFixed(1)} m</b>
	</div>
	<div class="hint2">
		{#if game.shipMode === 'habitat'}
			{@const sp = game.ship.spans[game.deck.section]}
			{game.deck.section.toUpperCase()} span {sp.y0.toFixed(2)}–{sp.y1.toFixed(2)} m · floor +{game.floorY[game.current].toFixed(2)} m · usable R {game.maxR().toFixed(2)} m
		{:else}
			Stack {game.stackTop.toFixed(2)} m · max ≈ {MAX_STACK_HEIGHT.toFixed(2)} m for {HABITABLE_VOLUME_LIMIT} m³
		{/if}
	</div>
	<div class="seg">
		<button class:active={game.section} onclick={() => (game.section = !game.section)}>✂ Section view</button>
		<button class="danger" disabled={game.decks.length < 2} onclick={() => confirmThen(`Remove ${game.deckLabel(game.current)} and its modules?`, () => game.removeDeck())}>🗑 Remove deck</button>
	</div>
	{#if game.section && game.mode === 'build'}
		<CutPanel />
	{/if}
{/snippet}

<aside class="panel" class:mobile class:open>
	{#if mobile}
		<div class="bar">
			<button class="handle" onclick={() => (open = !open)} aria-label="Toggle panel">
				<span class="grip"></span>
				<span class="hint">{open ? '▼ Close' : '▲ Equipment · Decks · Stats · Export'}</span>
			</button>
			{@render toolButtons()}
		</div>
	{/if}

	<div class="content">
		{#if !mobile}
			<h1>Starship Interior Planner</h1>
			<p class="disc">{DISCLAIMER}</p>
			<section>
				<h2>Mode</h2>
				<div class="seg">
					<button class:active={game.mode === 'build'} onclick={() => (game.mode = 'build')}>🛠 Build</button>
					<button class:active={game.mode === 'walk'} onclick={() => (game.mode = 'walk')}>🚶 Walk (F)</button>
					<button onclick={() => (game.designer = true)}>📐 Design</button>
				</div>
			</section>
			<section>
				<h2>Tools</h2>
				{@render toolButtons()}
			</section>
		{/if}

		<section>
			<h2>Ship</h2>
			<ShipPanel />
		</section>

		<section>
			<h2>Decks</h2>
			{@render deckControls()}
		</section>

		{#if game.selectedShaft}
			{@const sh = game.selectedShaft}
			<section class="selbox">
				<h2>Selected</h2>
				<div class="selname">🪜 Ladder {game.shaftLabel(sh)}</div>
				<div class="kv">
					<span>Connects</span><b>{game.deckLabel(sh.from)} (ladder) → {game.deckLabel(sh.to)} (opening)</b>
					<span>Position</span><b>x {sh.x.toFixed(3)} · z {sh.z.toFixed(3)} m</b>
					<span>Ladder length</span><b>{game.shaftLength(sh).toFixed(2)} m</b>
					<span>Opening</span><b>Ø 0.80 m clear</b>
					<span>Rotation</span><b>{sh.angle.toFixed(1)}°</b>
				</div>
				<div class="seg">
					<button onclick={() => game.rotate(-15)}>⟲ 15°</button>
					<button onclick={() => game.rotate(15)}>⟳ 15°</button>
					<button onclick={() => game.rotate(90)}>90°</button>
					<button class="danger" onclick={() => game.deleteSelected()}>🗑</button>
				</div>
			</section>
		{/if}
		{#if selInfo && sel}
			<section class="selbox">
				<h2>Selected</h2>
				<div class="selname">{selInfo.def.icon} {selInfo.def.name}</div>
				<div class="kv">
					<span>Size</span><b>{#if selInfo.def.launch}{@const dm = dimsOf(selInfo.def, game.phase)}{dm.w.toFixed(2)} × {dm.d.toFixed(2)} × {dm.height.toFixed(2)} m ({game.phase}){:else}{sizeLabel(selInfo.def, game.deck.height)}{/if}</b>
					<span>Position</span><b>x {sel.x.toFixed(3)} · z {sel.z.toFixed(3)} m</b>
					<span>From axis</span><b>{selInfo.r.toFixed(3)} m</b>
					<span>To hull wall</span><b>{selInfo.wall.toFixed(3)} m</b>
					<span>Rotation</span><b>{sel.angle.toFixed(1)}°</b>
					<span>Mass / power</span><b>{selInfo.def.mass} kg · {selInfo.def.power} W</b>
				</div>
				<div class="seg">
					<button onclick={() => game.rotate(-15)}>⟲ 15°</button>
					<button onclick={() => game.rotate(15)}>⟳ 15°</button>
					<button onclick={() => game.rotate(90)}>90°</button>
					<button class="danger" onclick={() => game.deleteSelected()}>🗑</button>
				</div>
			</section>
		{/if}

		<section>
			<h2>Equipment <span class="rot">place rot {game.rotation.toFixed(0)}°</span></h2>
			<div class="catalog">
				{#each [...CATALOG, ...Object.values(equip.modules)] as m (m.id)}
					{@const tooTall = !m.fullHeight && Math.max(m.height, m.launch?.height ?? 0) > game.deck.height}
					<button
						class="mod"
						class:active={game.tool === 'module' && game.selectedModule === m.id}
						class:dim={tooTall}
						onclick={() => pickModule(m.id)}
						title={m.description + (m.source ? ` (${m.source})` : '')}
					>
						<span class="swatch">{m.icon}</span>
						<span class="mname">{m.name}{#if m.custom}<i class="cus">custom</i>{/if}</span>
						<span class="meta">{sizeLabel(m)} · {m.power} W{m.seats ? ` · ${m.seats} seat${m.seats > 1 ? 's' : ''}` : ''}{m.stowable ? ' · stowable' : ''}{tooTall ? ' · too tall' : ''}{#if m.estimate}<i class="est">EST</i>{/if}</span>
					</button>
				{/each}
			</div>
		</section>

		{#if game.tool === 'module' && game.selectedModule !== 'hatch' && (CATALOG_BY_ID[game.selectedModule]?.mount ?? 'floor') !== 'floor'}
			{@const mt = CATALOG_BY_ID[game.selectedModule]?.mount}
			<section class="selbox">
				<h2>Mounting</h2>
				<div class="seg" role="group" aria-label="Mount">
					<button class:active={game.mountFor(game.selectedModule) === 'floor'} disabled={mt !== 'any'} onclick={() => (game.mountMode = 'floor')}>⬇ Floor</button>
					<button class:active={game.mountFor(game.selectedModule) === 'wall'} disabled={mt !== 'any' && mt !== 'wall'} onclick={() => (game.mountMode = 'wall')}>▮ Wall</button>
					<button class:active={game.mountFor(game.selectedModule) === 'ceiling'} disabled={mt !== 'any' && mt !== 'ceiling'} onclick={() => (game.mountMode = 'ceiling')}>⬆ Ceiling</button>
				</div>
				{#if game.mountFor(game.selectedModule) === 'wall'}
					<div class="hrow">
						<span>Height</span>
						<input type="range" aria-label="Mount height" min="0" max={game.deck.height} step="0.05" bind:value={game.mountHeight} />
						<b>{game.mountHeight.toFixed(2)} m</b>
					</div>
					<div class="hint2">Snaps flush to the hull's inner wall, facing inward. Base height above the floor.</div>
				{:else if game.mountFor(game.selectedModule) === 'ceiling'}
					<div class="hint2">Hangs under the slab above ({game.deck.height.toFixed(1)} m).</div>
				{/if}
			</section>
		{/if}

		{#if game.tool === 'module' && game.selectedModule === 'hatch'}
			<section class="selbox">
				<h2>Ladder / hatch options</h2>
				<div class="checks">
					<label><input type="checkbox" bind:checked={game.alignShafts} /> Align snap to the ladder below/above (0.6 m · hold Alt to bypass)</label>
					<label><input type="checkbox" bind:checked={game.connectBelow} /> Connect to deck below (default: up)</label>
				</div>
				<div class="hint2">Places a ladder on deck {(game.connectBelow ? game.current : game.current + 1)} rising to a hatch in deck {(game.connectBelow ? game.current + 1 : game.current + 2)}.</div>
			</section>
		{/if}

		<section>
			<h2>Crew & launch seating</h2>
			<CrewPanel />
		</section>

		<section class="crewsim">
			<h2>👥 Crew simulation</h2>
			<CrewSimPanel />
		</section>

		<section>
			<h2>Ship stats</h2>
			<StatsPanel />
		</section>

		<section>
			<h2>View & checks</h2>
			<div class="checks">
				<label><input type="checkbox" bind:checked={game.clearance} /> Clearance check (access zones + 0.8 m paths)</label>
				<label><input type="checkbox" bind:checked={game.guides} /> Radial guides</label>
				<label><input type="checkbox" checked={game.quality === 'high'} onchange={(e) => (game.quality = e.currentTarget.checked ? 'high' : 'low')} /> High quality (shadows, reflections)</label>
				<label><input type="checkbox" bind:checked={game.confirmPlacement} /> Touch: tap to preview, ✓ to place</label>
				<div class="seg small">
					<span>2-finger drag:</span>
					<button class:active={game.twoFingerMode === 'rotate'} onclick={() => (game.twoFingerMode = 'rotate')}>Orbit</button>
					<button class:active={game.twoFingerMode === 'pan'} onclick={() => (game.twoFingerMode = 'pan')}>Pan</button>
				</div>
			</div>
		</section>

		<section>
			<h2>Export for building</h2>
			<div class="grid2">
				<button onclick={() => exportSVG()}>📐 Plan 1:50 ({game.phase === 'launch' ? 'launch' : 'surface'})</button>
				<button onclick={exportAllSVG}>📐 Plans (all decks, both phases)</button>
				{#if game.shipMode === 'habitat'}<button onclick={exportElevation}>🗼 Ship elevation SVG 1:200</button>{/if}
				<button onclick={exportCSV}>📋 BOM CSV</button>
				<button onclick={exportGLB}>🧊 3D model GLB</button>
			</div>
		</section>

		<section>
			<h2>Save / Load</h2>
			<div class="grid2">
				<button onclick={() => game.saveLocal()}>💾 Save</button>
				<button onclick={() => game.loadLocal()}>📂 Load</button>
				<button onclick={exportJSON}>⬇ Export JSON</button>
				<button onclick={() => fileInput.click()}>⬆ Import JSON</button>
				<button onclick={() => confirmThen('Load the starter layout? Unsaved changes are lost.', () => game.resetStarter())}>↺ Starter layout</button>
				<button class="danger" onclick={() => confirmThen('Clear everything?', () => game.clearAll())}>🗑 Clear all</button>
			</div>
			<input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={onFile} />
		</section>

		{#if !mobile}
			<section class="help">
				<h2>Controls</h2>
				<ul>
					<li><b>Place</b>: click to place · <b>Q/E</b> or <b>Shift+wheel</b> rotate 15° (Shift+Q/E 1°) · <b>R</b> 90°</li>
					<li><b>Select</b>: click a module, drag to move · <b>Del</b> delete · right-click delete</li>
					<li><b>Measure</b>: click two points · <b>Esc</b> clear · <b>G</b> snap</li>
					<li><b>Camera</b>: left-drag empty space orbit (360°) · right-drag pan · middle-drag orbit · wheel zoom · <b>←/→</b> orbit · <b>↑/↓</b> tilt · <b>+/−</b> zoom · widget top-right: ⟲⟳ 45°, Top, Iso, Reset</li>
					<li><b>PgUp/PgDn</b> switch deck · <b>F</b> walk: WASD, Shift run, E/Space up hatch, Q/C down</li>
				</ul>
			</section>
		{:else}
			<p class="disc"><b>Camera:</b> drag empty space to orbit (Select tool) · two fingers orbit/pan · pinch zoom · widget top-right: ⟲⟳ 45°, Top, Iso, Reset, ＋/－</p>
			<p class="disc">{DISCLAIMER}</p>
		{/if}
	</div>
</aside>

<style>
	.panel {
		background: rgba(9, 13, 22, 0.95);
		border-right: 1px solid #1c2a40;
		color: #d6e2f5;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.content {
		overflow-y: auto;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		overscroll-behavior: contain;
	}
	h1 {
		margin: 0;
		font-size: 17px;
		color: #cfe6ff;
	}
	.disc {
		margin: -6px 0 0;
		font-size: 10.5px;
		color: #e0a85a;
		line-height: 1.35;
	}
	h2 {
		margin: 0 0 7px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #6f86a8;
		display: flex;
		justify-content: space-between;
	}
	button {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 8px;
		padding: 7px 9px;
		cursor: pointer;
		min-height: 38px;
		touch-action: manipulation;
	}
	button:disabled {
		opacity: 0.4;
	}
	button.active {
		background: linear-gradient(180deg, #17406a, #123052);
		border-color: #49a6ff;
	}
	button.danger {
		border-color: #6b2632;
		color: #ff9aa5;
	}
	.mini {
		min-height: 30px;
		min-width: 30px;
		padding: 0 6px;
	}
	.rot {
		text-transform: none;
		letter-spacing: 0;
		color: #a9bad3;
	}
	.tools {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 5px;
	}
	.tool {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 5px 2px;
	}
	.ico {
		font-size: 17px;
		line-height: 1;
	}
	.lbl {
		font-size: 10.5px;
		white-space: nowrap;
	}
	.seg {
		display: flex;
		gap: 6px;
		align-items: center;
		margin-top: 6px;
	}
	.seg button {
		flex: 1;
	}
	.seg.small {
		font-size: 12px;
	}
	.decksel {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.decksel button.sec-lox {
		border-left: 3px solid #5fb6ff;
	}
	.decksel button.sec-ch4 {
		border-left: 3px solid #79e08a;
	}
	.est {
		font-style: normal;
		font-size: 8.5px;
		background: #4a3a10;
		color: #ffd27a;
		border-radius: 3px;
		padding: 0 3px;
		margin-left: 4px;
	}
	.decksel button {
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1.1;
		min-width: 58px;
	}
	.decksel small {
		font-size: 10px;
		opacity: 0.7;
	}
	.decksel .add {
		font-size: 18px;
	}
	.hrow {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 8px;
		font-size: 12px;
	}
	.hrow input {
		flex: 1;
		min-width: 60px;
		accent-color: #49a6ff;
		height: 28px;
	}
	.hint2 {
		font-size: 11px;
		color: #8ea3c2;
		margin-top: 4px;
	}
	.selbox {
		border: 1px solid #2a5a7f;
		border-radius: 10px;
		padding: 10px;
		background: rgba(30, 80, 120, 0.12);
	}
	.selname {
		font-weight: 700;
		margin-bottom: 6px;
	}
	.kv {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px 10px;
		font-size: 12px;
	}
	.kv span {
		opacity: 0.7;
	}
	.kv b {
		text-align: right;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.catalog {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.mod {
		display: grid;
		grid-template-columns: 30px 1fr;
		column-gap: 9px;
		text-align: left;
		padding: 5px 8px;
	}
	.mod.dim {
		opacity: 0.5;
	}
	.swatch {
		grid-row: span 2;
		font-size: 20px;
		display: grid;
		place-items: center;
	}
	.mname {
		font-weight: 600;
		font-size: 12.5px;
	}
	.meta {
		font-size: 10.5px;
		opacity: 0.72;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
		font-size: 12px;
	}
	.checks {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
	}
	.checks label {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.checks input {
		width: 18px;
		height: 18px;
		flex: none;
	}
	.help ul {
		margin: 0;
		padding-left: 16px;
		font-size: 11.5px;
		line-height: 1.55;
		color: #a9bad3;
	}

	/* ---------- mobile bottom sheet ---------- */
	.panel.mobile {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		border-right: none;
		border-top: 1px solid #23344f;
		border-radius: 16px 16px 0 0;
		z-index: 30;
		max-height: 72dvh;
		padding-bottom: env(safe-area-inset-bottom);
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.5);
	}
	.mobile .bar {
		padding: 4px 10px 8px;
	}
	.handle {
		width: 100%;
		background: none;
		border: none;
		min-height: 28px;
		padding: 2px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
	}
	.grip {
		width: 44px;
		height: 5px;
		border-radius: 3px;
		background: #3a4b66;
	}
	.hint {
		font-size: 11px;
		color: #7f97ba;
	}
	.mobile .tool {
		min-height: 54px;
	}
	.mobile .ico {
		font-size: 21px;
	}
	.mobile .content {
		display: none;
		padding-top: 4px;
		max-height: calc(72dvh - 110px);
	}
	.mobile.open .content {
		display: flex;
	}
	.mobile button {
		min-height: 46px;
	}
	.mobile .mini {
		min-height: 40px;
		min-width: 40px;
	}
	.mobile .catalog {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	.cus {
		font-style: normal;
		font-size: 9px;
		color: #9cf0b8;
		margin-left: 5px;
	}
</style>
