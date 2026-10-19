<script lang="ts">
	/** Equipment Designer: library, parts, transforms (numeric + nudge), metadata, import/export. */
	import { equip } from '$lib/game/equipStore.svelte';
	import { MATERIALS, SHAPES, fitFootprint, poseOf, type EquipShape } from '$lib/game/equipment';
	import { download } from '$lib/game/exporters';
	import { game } from '$lib/game/state.svelte';
	import { glbAspect } from '$lib/three/glbPart';
	import type { ModuleId } from '$lib/game/types';
	import AffordanceEditor from './AffordanceEditor.svelte';

	interface Props {
		mobile?: boolean;
	}
	let { mobile = false }: Props = $props();
	let open = $state(false);
	let jsonInput: HTMLInputElement;
	let glbInput: HTMLInputElement;
	let newShape = $state<EquipShape>('box');

	const def = $derived(equip.selected);
	const editable = $derived(equip.editable);
	const part = $derived(equip.part);
	const pose = $derived(part ? poseOf(part, equip.pose === 'stowed') : null);
	const placed = $derived(game.decks.reduce((n, d) => n + d.modules.filter((m) => m.type === equip.selectedId).length, 0));
	const flagged = $derived(game.invalidPlacements.filter((w) => game.decks[w.deck]?.modules.find((m) => m.uid === w.uid)?.type === equip.selectedId).length);
	const lib = $derived(equip.library);
	/** parts sticking out of a manually set footprint (auto-fit off) */
	const overhang = $derived.by(() => {
		if (!def || def.autoFit !== false || !def.parts.length) return '';
		const f = fitFootprint(def);
		const out: string[] = [];
		if (f.w > def.w + 0.005 || f.d > def.d + 0.005 || f.height > def.height + 0.005) out.push('surface');
		if (f.launch && def.launch && (f.launch.w > def.launch.w + 0.005 || f.launch.d > def.launch.d + 0.005 || f.launch.height > def.launch.height + 0.005)) out.push('launch');
		return out.join(' + ');
	});

	const cm = (m: number) => Math.round(m * 1000) / 10;
	function setVec(kind: 'pos' | 'rot' | 'size', i: number, v: number) {
		if (!part || !pose || !isFinite(v)) return;
		const cur = [...pose[kind]] as [number, number, number];
		cur[i] = kind === 'rot' ? v : kind === 'size' ? Math.max(0.005, v / 100) : v / 100;
		equip.setPose(part.id, { [kind]: cur });
	}
	function nudge(kind: 'pos' | 'rot', i: number, d: number) {
		if (!part || !pose) return;
		const cur = [...pose[kind]] as [number, number, number];
		cur[i] = Math.round((cur[i] + d) * 1000) / 1000;
		equip.setPose(part.id, { [kind]: cur });
	}
	function meta<K extends keyof NonNullable<typeof def>>(k: K, v: NonNullable<typeof def>[K]) {
		equip.update(equip.selectedId, (e) => ((e as unknown as Record<string, unknown>)[k as string] = v));
	}
	function partField(k: 'name' | 'shape' | 'm', v: string) {
		if (!part) return;
		equip.update(equip.selectedId, (e) => {
			const p = e.parts.find((x) => x.id === part.id);
			if (p) (p as unknown as Record<string, unknown>)[k] = v;
		});
	}
	function dup() {
		const id = equip.duplicate(equip.selectedId);
		game.flash(id ? `Duplicated → ${equip.selected?.name}` : 'Model still loading – try again');
	}
	function del() {
		if (!confirm(`Delete "${def?.name}"?`)) return;
		const err = equip.remove(equip.selectedId, placed > 0);
		if (err) game.flash(err);
	}
	function exportJSON() {
		const j = equip.exportJSON(equip.selectedId);
		if (j) download(`${(def?.name ?? 'equipment').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.equipment.json`, j, 'application/json');
	}
	async function onJSON(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!f) return;
		const n = equip.importJSON(await f.text());
		game.flash(n ? `Imported ${n} equipment definition(s)` : 'Not an equipment JSON file');
	}
	async function onGLB(e: Event) {
		const f = (e.currentTarget as HTMLInputElement).files?.[0];
		(e.currentTarget as HTMLInputElement).value = '';
		if (!f || !editable) return;
		if (f.size > 1.5e6) return game.flash('GLB too large for the library (max 1.5 MB)');
		const url: string = await new Promise((res) => {
			const r = new FileReader();
			r.onload = () => res(String(r.result));
			r.readAsDataURL(f);
		});
		try {
			const a = await glbAspect(url);
			const k = 0.5 / Math.max(a[0], a[1], a[2], 1e-6);
			equip.addPart('glb', { name: f.name.replace(/\.glb$/i, ''), glb: url, size: [a[0] * k, a[1] * k, a[2] * k], pos: [0, (a[1] * k) / 2, 0] });
		} catch {
			game.flash('Could not read that GLB');
		}
	}
	function placeOnDeck() {
		game.designer = false;
		game.selectedModule = equip.selectedId as ModuleId;
		game.tool = 'module';
		game.flash(`Place ${def?.name} on ${game.deckLabel(game.current)}`);
	}
	function onKey(e: KeyboardEvent) {
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
		if (e.code === 'KeyT') equip.gizmo = 'translate';
		else if (e.code === 'KeyR') equip.gizmo = 'rotate';
		else if (e.code === 'KeyS') equip.gizmo = 'scale';
		else if ((e.code === 'Delete' || e.code === 'Backspace') && part && editable) equip.deletePart(part.id);
		else if (e.code === 'KeyD' && part && editable) equip.duplicatePart(part.id);
		else if (e.code === 'KeyM' && part && editable) equip.duplicatePart(part.id, true);
		else if (e.code === 'Escape') equip.partId = null;
	}
</script>

<svelte:window onkeydown={onKey} />

<aside class="panel" class:mobile class:open>
	{#if mobile}
		<button class="handle" onclick={() => (open = !open)} aria-label="Toggle designer panel">
			<span class="grip"></span><span>{open ? '▼ Close' : '▲ Designer: library · parts · metadata'}</span>
		</button>
	{/if}
	<div class="content">
		<div class="hdr">
			<h1>🛠 Equipment Designer</h1>
			<button onclick={() => (game.designer = false)}>◀ Planner</button>
		</div>

		<section>
			<h2>Library</h2>
			<div class="lib">
				{#each lib as l (l.id)}
					<button class:active={l.id === equip.selectedId} onclick={() => equip.select(l.id)} title={l.id}>
						<span>{l.icon}</span><span class="nm">{l.name}</span>{#if l.builtin}<i class="ro">🔒</i>{:else}<i class="cu">custom</i>{/if}
					</button>
				{/each}
			</div>
			<div class="grid2">
				<button onclick={() => equip.create()}>＋ New</button>
				<button class="prim" onclick={dup}>⎘ Duplicate{def?.builtin ? ' to edit' : ''}</button>
				<button onclick={exportJSON}>⬇ Export JSON</button>
				<button onclick={() => jsonInput.click()}>⬆ Import JSON</button>
				<button disabled={!editable} onclick={() => glbInput.click()}>📦 Import GLB part</button>
				<button class="danger" disabled={!editable} onclick={del}>🗑 Delete</button>
			</div>
			<input bind:this={jsonInput} type="file" accept=".json,application/json" hidden onchange={onJSON} />
			<input bind:this={glbInput} type="file" accept=".glb,model/gltf-binary" hidden onchange={onGLB} />
			{#if def?.builtin}<div class="note">Built-in designs are read-only – use <b>Duplicate to edit</b>.</div>{/if}
		</section>

		{#if def}
			<section>
				<h2>View, pose & gizmo</h2>
				<div class="seg">
					{#each [['iso', 'Iso'], ['side', 'Side'], ['front', 'Front'], ['top', 'Top']] as [v, l]}
						<button onclick={() => equip.setView(v as 'iso' | 'side' | 'front' | 'top')}>{l}</button>
					{/each}
				</div>
				<div class="seg">
					<button class:active={equip.pose === 'deployed'} onclick={() => (equip.pose = 'deployed')}>Deployed</button>
					<button class:active={equip.pose === 'stowed'} onclick={() => (equip.pose = 'stowed')}>Stowed</button>
					{#if def.seats}<label class="chk"><input type="checkbox" bind:checked={equip.occupant} /> 🧑‍🚀 Occupant</label>{/if}
				</div>
				{#if editable}
					<div class="seg">
						<button class:active={equip.gizmo === 'translate'} onclick={() => (equip.gizmo = 'translate')}>✥ Move (T)</button>
						<button class:active={equip.gizmo === 'rotate'} onclick={() => (equip.gizmo = 'rotate')}>⟳ Rotate (R)</button>
						<button class:active={equip.gizmo === 'scale'} onclick={() => (equip.gizmo = 'scale')}>⤢ Size (S)</button>
					</div>
					<div class="hint">Snap 1 cm / 5°. Editing the <b>{equip.pose}</b> pose{equip.pose === 'stowed' ? ' (stowed in ' + (def.stowPhase === 'surface' ? 'Surface/Cruise' : 'Launch/Landing') + ')' : ''}.</div>
				{/if}
			</section>

			<section>
				<h2>Parts ({def.parts.length})</h2>
				<div class="parts">
					{#each def.parts as p (p.id)}
						<button class:active={p.id === equip.partId} onclick={() => (equip.partId = p.id)}>{p.name}<small>{p.shape} · {p.m}{p.stowed ? ' · ⇄' : ''}</small></button>
					{/each}
				</div>
				{#if editable}
					<div class="row">
						<select bind:value={newShape}>
							{#each SHAPES as s}<option value={s}>{s}</option>{/each}
						</select>
						<button onclick={() => equip.addPart(newShape)}>＋ Add</button>
						<button disabled={!part} onclick={() => part && equip.duplicatePart(part.id)}>⎘</button>
						<button disabled={!part} onclick={() => part && equip.duplicatePart(part.id, true)} title="Mirror across X">⇋ Mirror</button>
						<button class="danger" disabled={!part} onclick={() => part && equip.deletePart(part.id)}>🗑</button>
					</div>
				{/if}
				{#if part && pose}
					<div class="sel">
						<div class="row">
							<input class="nm" value={part.name} disabled={!editable} onchange={(e) => partField('name', e.currentTarget.value)} />
							<select value={part.shape} disabled={!editable || part.shape === 'glb'} onchange={(e) => partField('shape', e.currentTarget.value)}>
								{#each SHAPES as s}<option value={s}>{s}</option>{/each}
								{#if part.shape === 'glb'}<option value="glb">glb</option>{/if}
							</select>
							<select value={part.m} disabled={!editable} onchange={(e) => partField('m', e.currentTarget.value)}>
								{#each MATERIALS as m}<option value={m}>{m}</option>{/each}
							</select>
						</div>
						{#each [['pos', 'Position cm'], ['rot', 'Rotation °'], ['size', 'Size cm']] as [k, label]}
							{@const kind = k as 'pos' | 'rot' | 'size'}
							<div class="vec">
								<span>{label}</span>
								{#each ['X', 'Y', 'Z'] as ax, i}
									<label>
										{ax}<input
											type="number"
											step={kind === 'rot' ? 5 : 1}
											disabled={!editable}
											value={kind === 'rot' ? Math.round(pose.rot[i] * 10) / 10 : cm(pose[kind][i])}
											onchange={(e) => setVec(kind, i, Number(e.currentTarget.value))}
										/>
									</label>
								{/each}
							</div>
						{/each}
						{#if editable}
							<div class="nudge">
								{#each ['X', 'Y', 'Z'] as ax, i}
									<span>{ax}</span>
									<button onclick={() => nudge('pos', i, -0.01)} aria-label="Nudge {ax} −1 cm">−1</button>
									<button onclick={() => nudge('pos', i, 0.01)} aria-label="Nudge {ax} +1 cm">+1</button>
								{/each}
								<span>⟳</span>
								<button onclick={() => nudge('rot', 1, -5)} aria-label="Yaw −5°">−5°</button>
								<button onclick={() => nudge('rot', 1, 5)} aria-label="Yaw +5°">+5°</button>
							</div>
						{/if}
					</div>
				{/if}
			</section>

			<section>
				<h2>Metadata {#if def.estimate}<i class="est">ESTIMATE</i>{/if}</h2>
				<div class="form">
					<label class="w2">Name <input value={def.name} disabled={!editable} onchange={(e) => meta('name', e.currentTarget.value)} /></label>
					<label>Icon <input value={def.icon} disabled={!editable} maxlength="4" onchange={(e) => meta('icon', e.currentTarget.value)} /></label>
					<label>Category <input value={def.category} disabled={!editable} onchange={(e) => meta('category', e.currentTarget.value)} /></label>
					<label>Mass kg <input type="number" value={def.mass} disabled={!editable} onchange={(e) => meta('mass', Number(e.currentTarget.value))} /></label>
					<label>Power W <input type="number" value={def.power} disabled={!editable} onchange={(e) => meta('power', Number(e.currentTarget.value))} /></label>
					<label>Cost $ <input type="number" value={def.cost} disabled={!editable} onchange={(e) => meta('cost', Number(e.currentTarget.value))} /></label>
					<label>Access m <input type="number" step="0.05" value={def.access} disabled={!editable} onchange={(e) => meta('access', Number(e.currentTarget.value))} /></label>
					<label>Seats <input type="number" min="0" value={def.seats ?? 0} disabled={!editable} onchange={(e) => meta('seats', Number(e.currentTarget.value) || undefined)} /></label>
					<label title="How many crew can use it at the same moment (strictly enforced by the crew sim)">Capacity <input type="number" min="1" max="24" data-testid="designer-capacity" value={def.capacity ?? (def.affords?.reduce((m, af) => Math.max(m, af.slots?.length ?? 0), 0) || def.seats || 1)} disabled={!editable} onchange={(e) => meta('capacity', Math.max(1, Math.round(Number(e.currentTarget.value) || 1)))} /></label>
					<label>Stowed in
						<select value={def.stowPhase ?? 'launch'} disabled={!editable} onchange={(e) => meta('stowPhase', e.currentTarget.value as 'launch' | 'surface')}>
							<option value="launch">Launch/Landing</option>
							<option value="surface">Surface/Cruise</option>
						</select>
					</label>
					<label class="chk"><input type="checkbox" checked={!!def.stowable} disabled={!editable} onchange={(e) => meta('stowable', e.currentTarget.checked)} /> stowable</label>
					<label class="chk"><input type="checkbox" checked={!!def.estimate} disabled={!editable} onchange={(e) => meta('estimate', e.currentTarget.checked)} /> ESTIMATE</label>
					<label class="w2">Description <textarea rows="2" disabled={!editable} onchange={(e) => meta('description', e.currentTarget.value)}>{def.description}</textarea></label>
				</div>
				<div class="fp">
					<b>Footprint</b> {def.w.toFixed(2)} × {def.d.toFixed(2)} × {def.height.toFixed(2)} m (surface)
					{#if def.launch} · {def.launch.w.toFixed(2)} × {def.launch.d.toFixed(2)} × {def.launch.height.toFixed(2)} m (launch){/if}
				</div>
				{#if overhang}<div class="warn">⚠ Parts extend beyond the {overhang} footprint – enable Auto-fit or press Fit now.</div>{/if}
				{#if editable}
					<div class="row">
						<label class="chk"><input type="checkbox" aria-label="Auto-fit footprint" checked={def.autoFit !== false} onchange={(e) => meta('autoFit', e.currentTarget.checked)} /> Auto-fit footprint</label>
						<button onclick={() => equip.update(equip.selectedId, (e) => Object.assign(e, fitFootprint(e)))}>Fit now</button>
					</div>
				{/if}
				<div class="row">
					<button class="prim" onclick={placeOnDeck}>➕ Place on {game.deckLabel(game.current)}</button>
					<span class="hint">{placed} placed{flagged ? ` · ⛔ ${flagged} no longer fit (flagged)` : ''}</span>
				</div>
			</section>
			<AffordanceEditor />
		{/if}
	</div>
</aside>

<style>
	.panel {
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		height: 100%;
		background: rgba(9, 13, 22, 0.96);
		color: #e4f0ff;
		border-right: 1px solid #1f2c40;
		overflow: hidden;
		display: flex;
		flex-direction: column;
		font: 13px/1.35 system-ui, sans-serif;
	}
	.content {
		overflow-y: auto;
		overflow-x: hidden;
		padding: 10px 12px 40px;
		flex: 1;
	}
	.hdr {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h1 {
		font-size: 16px;
		margin: 4px 0 8px;
	}
	h2 {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #8fa6c2;
		margin: 12px 0 6px;
	}
	button,
	select,
	input,
	textarea {
		font: inherit;
		color: #e4f0ff;
		background: #142033;
		border: 1px solid #2c4466;
		border-radius: 7px;
		padding: 5px 8px;
		box-sizing: border-box;
		min-width: 0;
	}
	.form input,
	.form select,
	.form textarea {
		width: 100%;
	}
	.form label.chk input,
	.row label.chk input {
		width: auto;
	}
	button {
		cursor: pointer;
	}
	button:disabled,
	input:disabled,
	select:disabled,
	textarea:disabled {
		opacity: 0.55;
		cursor: default;
	}
	button.active {
		border-color: #49a6ff;
		background: #17406a;
	}
	button.prim {
		border-color: #49a6ff;
		background: #1d4f86;
	}
	button.danger {
		border-color: #7a2a35;
	}
	.lib {
		display: flex;
		flex-direction: column;
		gap: 3px;
		max-height: 230px;
		overflow-y: auto;
		margin-bottom: 6px;
	}
	.lib button {
		display: flex;
		gap: 6px;
		align-items: center;
		text-align: left;
	}
	.lib .nm {
		flex: 1;
	}
	.ro,
	.cu {
		font-style: normal;
		font-size: 10px;
		opacity: 0.8;
	}
	.cu {
		color: #9cf0b8;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
	}
	.seg,
	.row {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
		align-items: center;
		margin-bottom: 5px;
	}
	.parts {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-height: 190px;
		overflow-y: auto;
		margin-bottom: 6px;
	}
	.parts button {
		display: flex;
		justify-content: space-between;
		text-align: left;
		padding: 3px 8px;
		font-size: 12px;
	}
	.parts small {
		opacity: 0.6;
	}
	.sel {
		background: rgba(255, 255, 255, 0.04);
		border-radius: 8px;
		padding: 6px;
	}
	.sel .nm {
		flex: 1 1 100%;
	}
	.sel .row select {
		flex: 1;
	}
	.vec {
		display: grid;
		grid-template-columns: 76px repeat(3, 1fr);
		gap: 4px;
		align-items: center;
		font-size: 11.5px;
		margin: 3px 0;
	}
	.vec label {
		display: flex;
		align-items: center;
		gap: 2px;
		opacity: 0.9;
	}
	.vec input {
		width: 100%;
		min-width: 0;
		padding: 3px 4px;
	}
	.nudge {
		display: grid;
		grid-template-columns: 18px 1fr 1fr 18px 1fr 1fr;
		gap: 4px;
		align-items: center;
		margin-top: 6px;
	}
	.nudge button {
		padding: 6px 0;
	}
	.form {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 5px;
	}
	.form label {
		display: flex;
		flex-direction: column;
		font-size: 11px;
		gap: 2px;
		color: #9fb4cc;
	}
	.form label.chk {
		flex-direction: row;
		align-items: center;
		gap: 5px;
	}
	.form .w2 {
		grid-column: 1 / 3;
	}
	.fp,
	.note,
	.hint {
		font-size: 11.5px;
		opacity: 0.85;
		margin: 6px 0;
	}
	.warn {
		font-size: 11.5px;
		color: #ffcf7a;
		margin: 4px 0;
	}
	.est {
		font-style: normal;
		font-size: 9px;
		background: #4a3a10;
		color: #ffd27a;
		border-radius: 3px;
		padding: 0 4px;
		letter-spacing: 0;
	}
	/* mobile bottom sheet */
	.panel.mobile {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		max-width: none;
		height: auto;
		max-height: 72vh;
		border-right: none;
		border-top: 1px solid #1f2c40;
		border-radius: 14px 14px 0 0;
		z-index: 20;
	}
	.mobile .content {
		display: none;
		max-height: 62vh;
	}
	.mobile.open .content {
		display: block;
	}
	.handle {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		padding: 8px;
		font-size: 12px;
	}
	.grip {
		width: 40px;
		height: 4px;
		border-radius: 2px;
		background: #4a6283;
	}
	.mobile button {
		min-height: 36px;
	}
</style>
