<script lang="ts">
	/**
	 * Game-style Options menu (⚙ in the top bar, F10 / O anywhere, Esc in build mode when idle).
	 * Pages: Controls (searchable key bindings), Graphics, Simulation, Building, About / Help.
	 * Desktop: centred glass modal with left tabs. Mobile: full screen with a top segmented tab row.
	 * The crew sim pauses while it is open unless "Keep running" is on. Settings persist (options.svelte.ts).
	 */
	import { onMount, tick } from 'svelte';
	import { game } from '$lib/game/state.svelte';
	import { crew, SPEEDS } from '$lib/sim/crewSim.svelte';
	import { options, OPTION_TABS, type OptionsTab } from '$lib/game/options.svelte';
	import { filterBindings } from '$lib/game/controls';
	import { DISCLAIMER } from '$lib/game/specs';
	import { isTyping } from '$lib/util/keys';

	let { mobile = false }: { mobile?: boolean } = $props();
	let query = $state('');
	let dialog: HTMLDivElement | undefined = $state();
	const touchFirst = $derived(mobile || game.isTouch);
	const groups = $derived(filterBindings(query, touchFirst));
	const total = $derived(groups.reduce((n, g) => n + g.bindings.length, 0));
	const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
	const commit = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : 'unknown';

	/** split "Ctrl+Shift+Z" into chips (a lone "+" stays a key) */
	const chord = (k: string) => (k === '+' || !k.includes('+') ? [k] : k.split('+'));

	function pick(t: OptionsTab) {
		options.tab = t;
		const el = dialog?.querySelector('.page');
		if (el) el.scrollTop = 0;
	}
	function setTone(t: 'warm' | 'cool') {
		if (game.interiorTone !== t) game.toggleTone();
	}
	let seedText = $state('');
	$effect(() => {
		if (options.seed !== null) seedText = String(options.seed);
	});
	function setSeedMode(fixed: boolean) {
		if (!fixed) options.seed = null;
		else options.seed = Number.isFinite(Number(seedText)) && seedText !== '' ? Math.floor(Number(seedText)) : 42;
	}

	// keyboard: open / close, and swallow game keys while the menu is open
	onMount(() => {
		const onKey = (e: KeyboardEvent) => {
			const code = e.code;
			const toggleKey = code === 'F10' || (code === 'KeyO' && !e.ctrlKey && !e.metaKey && !e.altKey);
			if (!options.open) {
				if (!toggleKey || e.repeat || (code === 'KeyO' && isTyping(e))) return;
				e.preventDefault();
				e.stopImmediatePropagation();
				options.show();
				return;
			}
			const inMenu = !!dialog && e.target instanceof Node && dialog.contains(e.target);
			if (code === 'Escape') {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (inMenu && isTyping(e) && query) query = '';
				else options.close();
				return;
			}
			if (toggleKey && !(code === 'KeyO' && isTyping(e))) {
				e.preventDefault();
				e.stopImmediatePropagation();
				options.close();
				return;
			}
			// typing in the search box etc.: let it through (game handlers ignore text fields)
			if (inMenu && isTyping(e)) return;
			// everything else (WASD, E, Q, Del…) must not reach the game underneath
			e.stopImmediatePropagation();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});
	$effect(() => {
		if (!options.open) return;
		void tick().then(() => (dialog?.querySelector('[role=tab][aria-selected=true]') as HTMLElement | null)?.focus({ preventScroll: true }));
	});
</script>

{#snippet toggle(label: string, desc: string, checked: boolean, set: (v: boolean) => void, testid: string, disabled = false)}
	<label class="row" class:disabled>
		<span class="lbl">{label}<small>{desc}</small></span>
		<input type="checkbox" class="sw" {checked} {disabled} onchange={(e) => set(e.currentTarget.checked)} data-testid={testid} />
	</label>
{/snippet}

{#if options.open}
	<div class="backdrop" class:mobile onpointerdown={(e) => e.target === e.currentTarget && options.close()} role="presentation">
		<div class="menu glass" class:mobile bind:this={dialog} role="dialog" aria-modal="true" aria-label="Options" data-testid="options-menu">
			<header>
				<h2>⚙ Options</h2>
				{#if crew.enabled}<span class="simstate" data-testid="options-simstate">{crew.running ? '▶ sim running' : '⏸ sim paused'}</span>{/if}
				<button class="close" onclick={() => options.close()} aria-label="Close options" data-testid="options-close">✕{#if !mobile}<small>Esc</small>{/if}</button>
			</header>
			<div class="body">
				<div class="tabs" role="tablist" aria-label="Options pages">
					{#each OPTION_TABS as t (t.id)}
						<button role="tab" aria-selected={options.tab === t.id} class:active={options.tab === t.id} onclick={() => pick(t.id)} data-testid="opt-tab-{t.id}"><span class="ti">{t.icon}</span>{t.label}</button>
					{/each}
				</div>
				<section class="page" data-testid="opt-page-{options.tab}">
					{#if options.tab === 'controls'}
						<div class="search">
							<input type="search" placeholder="Filter: key or action (e.g. E, climb, rotate)…" bind:value={query} aria-label="Filter controls" data-testid="options-search" />
							<span class="count">{total} bindings</span>
						</div>
						<p class="note">Shortcuts use the physical key position, so they work on Thai, AZERTY and other layouts.</p>
						{#each groups as g (g.id)}
							<div class="group" data-testid="ctl-group-{g.id}">
								<h3><span>{g.icon}</span>{g.title}</h3>
								<ul>
									{#each g.bindings as b, i (i)}
										<li data-testid="binding">
											<span class="keys">
												{#each b.keys as k, j (j)}
													{#if j > 0}<span class="or">/</span>{/if}
													{#each chord(k) as c, n (n)}{#if n > 0}<span class="plus">+</span>{/if}<kbd class:touch={g.touch}>{c}</kbd>{/each}
												{/each}
											</span>
											<span class="act">{b.action}{#if b.note}<small>{b.note}</small>{/if}</span>
										</li>
									{/each}
								</ul>
							</div>
						{:else}
							<p class="empty">No binding matches “{query}”.</p>
						{/each}
					{:else if options.tab === 'graphics'}
						<h3>Rendering</h3>
						<div class="row">
							<span class="lbl">Quality<small>High: shadows, reflections, 2× pixel ratio. Low: faster on phones.</small></span>
							<span class="seg">
								<button class:active={game.quality === 'high'} onclick={() => (game.quality = 'high')} data-testid="opt-quality-high">High</button>
								<button class:active={game.quality === 'low'} onclick={() => (game.quality = 'low')} data-testid="opt-quality-low">Low</button>
							</span>
						</div>
						{@render toggle('Shadows', game.quality === 'high' ? 'Real-time shadows from the deck lights' : 'Needs High quality', game.shadows, (v) => (game.shadows = v), 'opt-shadows', game.quality !== 'high')}
						<div class="row">
							<span class="lbl">Interior lights<small>Walk / crew view colour temperature</small></span>
							<span class="seg">
								<button class:active={game.interiorTone === 'warm'} onclick={() => setTone('warm')} data-testid="opt-tone-warm">Warm 3000 K</button>
								<button class:active={game.interiorTone === 'cool'} onclick={() => setTone('cool')} data-testid="opt-tone-cool">Cool 5000 K</button>
							</span>
						</div>
						<h3>Overlays</h3>
						{@render toggle('Show clearances', 'Couch envelopes, egress paths, keep-out zones (📐 in the top bar)', game.showClearances, (v) => (game.showClearances = v), 'opt-show-clearances')}
						{@render toggle('Occupancy badges', 'Floating users / queue / condition badges over equipment (crew sim)', crew.badges, (v) => (crew.badges = v), 'opt-badges')}
						{@render toggle('Walkable overlay', 'Navigation grid the crew can walk on (crew sim)', crew.showNav, (v) => (crew.showNav = v), 'opt-walkable')}
						{@render toggle('Radial guides', 'Hull rings and radial lines on the deck', game.guides, (v) => (game.guides = v), 'opt-guides')}
					{:else if options.tab === 'simulation'}
						<h3>While this menu is open</h3>
						{@render toggle('Keep running', 'Off: the crew sim pauses while Options is open and resumes on close', options.keepRunning, (v) => options.setKeepRunning(v), 'opt-keep-running')}
						<h3>Crew sim</h3>
						<div class="row">
							<span class="lbl">Status<small>{crew.enabled ? `${crew.agents.length} crew · ${crew.running ? 'running' : 'paused'}` : 'Not started (👥 Crew simulation in the side panel)'}</small></span>
							{#if crew.enabled}
								<span class="seg"><button onclick={() => (crew.running = !crew.running)} data-testid="opt-sim-play">{crew.running ? '⏸ Pause' : '▶ Play'}</button></span>
							{:else}
								<span class="seg"><button onclick={() => options.startSim()} data-testid="opt-sim-start">▶ Start</button></span>
							{/if}
						</div>
						<div class="row">
							<span class="lbl">Sim speed<small>Game minutes per real second ×; remembered between sessions</small></span>
							<span class="seg">
								{#each SPEEDS as sp (sp)}<button class:active={crew.speed === sp} onclick={() => (crew.speed = sp)} data-testid="opt-speed-{sp}">{sp}×</button>{/each}
							</span>
						</div>
						<div class="row">
							<span class="lbl">Random seed<small>Fixed: every Start / reset replays the same wear, failures and choices</small></span>
							<span class="seg">
								<button class:active={options.seed === null} onclick={() => setSeedMode(false)} data-testid="opt-seed-random">Random</button>
								<button class:active={options.seed !== null} onclick={() => setSeedMode(true)} data-testid="opt-seed-fixed">Fixed</button>
								{#if options.seed !== null}
									<input class="num" type="number" step="1" bind:value={seedText} oninput={() => setSeedMode(true)} aria-label="Seed" data-testid="opt-seed" />
								{/if}
							</span>
						</div>
						{@render toggle('Heat map', 'Where the crew spends time on each deck', crew.heatmap, (v) => (crew.heatmap = v), 'opt-heatmap')}
						{@render toggle('First person when possessing', 'Off: third-person camera (V toggles in game)', crew.firstPerson, (v) => (crew.firstPerson = v), 'opt-first-person')}
						<p class="note">Schedules, gravity, mission length and power settings are in the side panel: 👥 Crew simulation → ⚙ Settings.</p>
					{:else if options.tab === 'gameplay'}
						<h3>Placement</h3>
						{@render toggle('Snap', '0.25 m grid / 15° steps (G)', game.snap, (v) => (game.snap = v), 'opt-snap')}
						{@render toggle('Align ladders', 'Snap a new ladder to the one below / above (0.6 m · hold Alt to bypass)', game.alignShafts, (v) => (game.alignShafts = v), 'opt-align')}
						{@render toggle('Lock ladders / hatches by default', 'New ladders start locked; turning it on also locks the existing ones (saved with the layout)', game.lockStructural, (v) => game.setLockStructural(v), 'opt-lock-structural')}
						{@render toggle('Clearance check', 'Access zones in front of equipment + 0.8 m walkways', game.clearance, (v) => (game.clearance = v), 'opt-clearance')}
						<h3>Touch</h3>
						{@render toggle('Tap to preview, ✓ to place', 'Off: a single tap places immediately', game.confirmPlacement, (v) => (game.confirmPlacement = v), 'opt-confirm')}
						<div class="row">
							<span class="lbl">Two-finger drag<small>Pinch always zooms</small></span>
							<span class="seg">
								<button class:active={game.twoFingerMode === 'rotate'} onclick={() => (game.twoFingerMode = 'rotate')} data-testid="opt-2f-rotate">Orbit</button>
								<button class:active={game.twoFingerMode === 'pan'} onclick={() => (game.twoFingerMode = 'pan')} data-testid="opt-2f-pan">Pan</button>
							</span>
						</div>
						<h3>Units</h3>
						<div class="row">
							<span class="lbl">Units<small>All specs and sources are metric: metres, m², m³, kg, kW. Plans export at 1:50.</small></span>
							<span class="seg"><button class="active" disabled>Metric (SI)</button></span>
						</div>
					{:else}
						<div class="about">
							<h3>Starship Interior Planner</h3>
							<p class="ver" data-testid="opt-version">Version {version} · commit <code>{commit}</code></p>
							<p class="warn">⚠ {DISCLAIMER}</p>
							<h3>Sources</h3>
							<ul>
								<li>Model: V3-class ship (2026), 52 m tall, 9 m diameter, 1.83 m hull rings, ~4 mm stainless wall.</li>
								<li>Every number carries a confidence tag: <b>OFFICIAL</b> (SpaceX / NASA), <b>REPORTED</b> (Wikipedia, NSF, papers), <b>DERIVED</b> (formula given) or <b>ESTIMATE</b> (badge in the UI).</li>
								<li>Cabin and human-factors values (headroom, translation paths, hatches, crew quarters) cite NASA-STD-3000 / 3001 and NASA technical reports; each one is marked verified or not in <code>specs.ts</code>.</li>
								<li>Full table with links: <code>docs/starship-reference.md</code>; values in code: <code>src/lib/game/ship.ts</code>, <code>src/lib/game/specs.ts</code>. Researched 2026-10-18.</li>
							</ul>
							<h3>Tips</h3>
							<ul>
								<li><b>HUD:</b> bottom build bar = tabs + cards to place · selection card = ⟲⟳ 90°, 📋 duplicate, 🗑 delete · ☰ hides the side panel · 📐 shows clearances.</li>
								<li><b>Crew sim:</b> need trends <b>&gt;&gt; &gt; · &lt; &lt;&lt;</b> (hover for the rate) · the ⚡ meter opens the power panel · issues are clickable.</li>
								<li><b>Walk:</b> F, then E on anything in reach; the prompt names the action. F9 shows the interact debug overlay.</li>
							</ul>
							<div class="seg"><button class="danger" onclick={() => options.reset()} data-testid="opt-reset">↺ Reset options to defaults</button></div>
						</div>
					{/if}
				</section>
			</div>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(2, 5, 10, 0.55);
		backdrop-filter: blur(3px);
		-webkit-backdrop-filter: blur(3px);
	}
	.menu {
		width: min(920px, calc(100vw - 48px));
		height: min(640px, calc(100dvh - 48px));
		display: flex;
		flex-direction: column;
		overflow: hidden;
		color: #d6e2f5;
		font: 13px/1.4 system-ui, sans-serif;
	}
	.menu.mobile {
		width: 100vw;
		height: 100dvh;
		border-radius: 0;
		padding-top: env(safe-area-inset-top);
		padding-bottom: env(safe-area-inset-bottom);
		box-sizing: border-box;
	}
	header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(120, 200, 255, 0.18);
	}
	header h2 {
		margin: 0;
		font-size: 17px;
		letter-spacing: 0.04em;
		color: #cfe8ff;
		flex: 1;
	}
	.simstate {
		font-size: 11px;
		color: #9fc4e8;
		padding: 3px 8px;
		border-radius: 10px;
		background: rgba(120, 200, 255, 0.08);
	}
	.close {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font: 600 15px system-ui;
		color: #cfe8ff;
		background: rgba(120, 200, 255, 0.08);
		border: 1px solid rgba(120, 200, 255, 0.3);
		border-radius: 9px;
		padding: 6px 10px;
		cursor: pointer;
		min-height: 36px;
	}
	.close small {
		font-size: 10px;
		opacity: 0.7;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.mobile .body {
		flex-direction: column;
	}
	.tabs {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px 10px;
		width: 190px;
		flex: none;
		border-right: 1px solid rgba(120, 200, 255, 0.14);
		background: rgba(4, 10, 20, 0.35);
	}
	.mobile .tabs {
		flex-direction: row;
		width: auto;
		padding: 8px;
		gap: 4px;
		border-right: none;
		border-bottom: 1px solid rgba(120, 200, 255, 0.14);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs button {
		display: flex;
		align-items: center;
		gap: 9px;
		text-align: left;
		font: 600 13px system-ui;
		color: #a9c3e2;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 10px;
		padding: 10px 12px;
		cursor: pointer;
	}
	.mobile .tabs button {
		flex: 1 0 auto;
		justify-content: center;
		padding: 8px 10px;
		font-size: 12px;
		gap: 5px;
		border-color: rgba(120, 200, 255, 0.16);
		white-space: nowrap;
	}
	.tabs button:hover {
		background: rgba(120, 200, 255, 0.07);
	}
	.tabs button.active {
		color: #061018;
		background: linear-gradient(180deg, #6ee7ff, #22b8e0);
		border-color: #9af0ff;
	}
	.ti {
		width: 18px;
		text-align: center;
	}
	.page {
		flex: 1;
		overflow-y: auto;
		padding: 14px 18px 22px;
		overscroll-behavior: contain;
	}
	.mobile .page {
		padding: 12px 12px 28px;
	}
	h3 {
		margin: 14px 0 6px;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #7fb6e6;
		display: flex;
		gap: 7px;
		align-items: center;
	}
	.page > h3:first-child,
	.about > h3:first-child {
		margin-top: 2px;
	}
	.search {
		position: sticky;
		top: -14px;
		z-index: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0 8px;
		background: linear-gradient(180deg, rgba(10, 20, 36, 0.98) 70%, rgba(10, 20, 36, 0));
	}
	.search input {
		flex: 1;
		font: 14px system-ui;
		color: #e6f1ff;
		background: rgba(4, 10, 20, 0.7);
		border: 1px solid rgba(120, 200, 255, 0.3);
		border-radius: 10px;
		padding: 9px 12px;
		min-width: 0;
	}
	.count {
		font-size: 11px;
		color: #7f97b5;
		white-space: nowrap;
	}
	.note {
		margin: 2px 0 6px;
		font-size: 11px;
		color: #8aa2c0;
	}
	.group {
		margin-bottom: 6px;
	}
	.group ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 14px;
	}
	.mobile .group ul {
		grid-template-columns: 1fr;
	}
	.group li {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 8px;
		border-radius: 8px;
		background: rgba(120, 200, 255, 0.04);
		border: 1px solid rgba(120, 200, 255, 0.07);
	}
	.keys {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 3px;
		flex: 0 0 auto;
		max-width: 52%;
	}
	kbd {
		display: inline-block;
		min-width: 14px;
		text-align: center;
		font: 600 11.5px/1 ui-monospace, 'SFMono-Regular', Menlo, monospace;
		color: #eaf6ff;
		padding: 4px 6px 5px;
		border-radius: 6px;
		background: linear-gradient(180deg, #2a3d58, #17243a);
		border: 1px solid #4a6a92;
		border-bottom-width: 3px;
		box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4);
		white-space: nowrap;
	}
	kbd.touch {
		font-family: system-ui, sans-serif;
		background: linear-gradient(180deg, #24484f, #142c33);
		border-color: #3f8a96;
	}
	.or,
	.plus {
		font-size: 10px;
		color: #6f87a6;
	}
	.act {
		font-size: 12.5px;
		color: #d6e4f7;
		display: flex;
		flex-direction: column;
	}
	.act small,
	.lbl small {
		font-size: 10.5px;
		color: #8299b8;
	}
	.empty {
		color: #8aa2c0;
		padding: 20px 0;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 9px 10px;
		border-radius: 10px;
		background: rgba(120, 200, 255, 0.04);
		border: 1px solid rgba(120, 200, 255, 0.08);
		margin-bottom: 5px;
		cursor: default;
	}
	label.row {
		cursor: pointer;
	}
	.row.disabled {
		opacity: 0.5;
	}
	.lbl {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-weight: 600;
		font-size: 13px;
	}
	.mobile .row {
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	.seg button {
		font: 600 12px system-ui;
		color: #cfe8ff;
		background: rgba(120, 200, 255, 0.08);
		border: 1px solid rgba(120, 200, 255, 0.25);
		border-radius: 8px;
		padding: 7px 10px;
		cursor: pointer;
		min-height: 32px;
	}
	.seg button.active {
		color: #061018;
		background: linear-gradient(180deg, #6ee7ff, #22b8e0);
		border-color: #9af0ff;
	}
	.seg button:disabled {
		cursor: default;
	}
	.seg button.danger {
		color: #ffd0d0;
		border-color: rgba(255, 90, 90, 0.5);
		background: rgba(255, 60, 60, 0.1);
	}
	.num {
		width: 90px;
		font: 13px system-ui;
		color: #e6f1ff;
		background: rgba(4, 10, 20, 0.7);
		border: 1px solid rgba(120, 200, 255, 0.3);
		border-radius: 8px;
		padding: 6px 8px;
	}
	/* toggle switch */
	.sw {
		appearance: none;
		-webkit-appearance: none;
		flex: none;
		width: 44px;
		height: 24px;
		border-radius: 12px;
		background: #263750;
		border: 1px solid #3c5677;
		position: relative;
		cursor: pointer;
		transition: background 0.15s;
		margin: 0;
	}
	.sw::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: #b9cbe3;
		transition: transform 0.15s;
	}
	.sw:checked {
		background: linear-gradient(180deg, #4fd6f5, #1ea7cf);
		border-color: #9af0ff;
	}
	.sw:checked::after {
		transform: translateX(20px);
		background: #fff;
	}
	.sw:disabled {
		cursor: default;
	}
	.about p,
	.about li {
		font-size: 12.5px;
		color: #c3d3ea;
	}
	.about ul {
		margin: 0 0 6px;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ver {
		margin: 0 0 8px;
	}
	.warn {
		color: #f0c27a !important;
		background: rgba(224, 168, 90, 0.08);
		border: 1px solid rgba(224, 168, 90, 0.3);
		border-radius: 10px;
		padding: 9px 11px;
	}
	code {
		font-size: 11.5px;
		color: #9fe3ff;
	}
</style>
