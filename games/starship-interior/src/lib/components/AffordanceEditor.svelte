<script lang="ts">
	/** Crew-sim affordances of an equipment design: what crew can do with it and which needs it restores. */
	import { NEEDS, NEED_IDS, POSES, defaultSlots, type Affordance, type NeedId } from '$lib/game/affordances';
	import { equip } from '$lib/game/equipStore.svelte';
	import type { PoseName } from '$lib/sim/avatarPose';
	import { EFFECTS, EFFECT_IDS } from '$lib/sim/effects';

	const def = $derived(equip.selected);
	const editable = $derived(equip.editable);
	const list = $derived(def?.affords ?? []);

	function edit(fn: (a: Affordance[]) => void) {
		equip.update(equip.selectedId, (e) => {
			e.affords = e.affords ? [...e.affords] : [];
			fn(e.affords);
		});
	}
	function set<K extends keyof Affordance>(i: number, k: K, v: Affordance[K]) {
		edit((a) => (a[i] = { ...a[i], [k]: v }));
	}
	function setNeed(i: number, n: NeedId, v: number) {
		edit((a) => {
			const needs = { ...a[i].needs };
			if (!isFinite(v) || v === 0) delete needs[n];
			else needs[n] = Math.max(-200, Math.min(2000, v));
			a[i] = { ...a[i], needs };
		});
	}
	function setCap(i: number, n: NeedId, v: number) {
		edit((a) => {
			const cap = { ...(a[i].cap ?? {}) };
			if (!isFinite(v) || v <= 0) delete cap[n];
			else cap[n] = Math.min(100, v);
			a[i] = { ...a[i], cap: Object.keys(cap).length ? cap : undefined };
		});
	}
	function toggleAfter(i: number, id: string, on: boolean) {
		edit((a) => {
			const list = (a[i].after ?? []).filter((x) => x.id !== id);
			if (on) list.push({ id });
			a[i] = { ...a[i], after: list.length ? list : undefined };
		});
	}
	function setCapacity(i: number, n: number) {
		if (!def) return;
		const c = Math.max(1, Math.min(8, Math.round(n) || 1));
		edit((a) => (a[i] = { ...a[i], slots: defaultSlots(a[i], def.w, def.d, def.height, c) }));
	}
	function add() {
		edit((a) => a.length < 6 && a.push({ id: `a${Date.now().toString(36)}`, label: 'Use', needs: { work: 20 }, minutes: 30, pose: 'work' }));
	}
	const remove = (i: number) => edit((a) => a.splice(i, 1));
</script>

{#if def}
	<section class="aff">
		<h2>🧑‍🚀 Crew sim affordances</h2>
		{#if !list.length}<div class="hint">No crew actions – the crew sim ignores this item.</div>{/if}
		{#each list as a, i (a.id + i)}
			<div class="card">
				<div class="r">
					<input class="lbl" aria-label="Action label" value={a.label} disabled={!editable} onchange={(e) => set(i, 'label', e.currentTarget.value.slice(0, 40))} />
					{#if editable}<button class="x" onclick={() => remove(i)} aria-label="Remove action">✕</button>{/if}
				</div>
				<div class="r small">
					<label>Min <input type="number" min="1" max="720" value={a.minutes} disabled={!editable} onchange={(e) => set(i, 'minutes', Math.max(1, Math.min(720, Number(e.currentTarget.value) || 15)))} /></label>
					<label>Pose
						<select value={a.pose} disabled={!editable} onchange={(e) => set(i, 'pose', e.currentTarget.value as PoseName)}>
							{#each POSES as p (p)}<option>{p}</option>{/each}
						</select>
					</label>
					<label>Cap. <input type="number" min="1" max="8" value={a.slots?.length ?? def.seats ?? 1} disabled={!editable} onchange={(e) => setCapacity(i, Number(e.currentTarget.value))} /></label>
				</div>
				<div class="needs">
					{#each NEEDS as n (n.id)}
						<label title={`${n.label}: points per sim hour`}>{n.icon}<input type="number" step="5" value={a.needs[n.id] ?? 0} disabled={!editable} onchange={(e) => setNeed(i, n.id, Number(e.currentTarget.value))} /></label>
					{/each}
				</div>
				<div class="needs caps" title="Max gain per session (cap); empty = no cap">
					<small>cap</small>
					{#each NEEDS as n (n.id)}
						{#if (a.needs[n.id] ?? 0) > 0}<label title={`${n.label}: max gain per session`}>{n.icon}<input type="number" step="5" min="0" max="100" value={a.cap?.[n.id] ?? ''} disabled={!editable} onchange={(e) => setCap(i, n.id, Number(e.currentTarget.value))} /></label>{/if}
					{/each}
				</div>
				<div class="r small after" data-testid="after-effects">
					<small>after:</small>
					{#each EFFECT_IDS as id (id)}
						<label class="chk" title={EFFECTS[id].label}><input type="checkbox" checked={!!a.after?.some((x) => x.id === id)} disabled={!editable} onchange={(e) => toggleAfter(i, id, e.currentTarget.checked)} />{EFFECTS[id].icon}</label>
					{/each}
				</div>
				<div class="r small">
					<label class="chk"><input type="checkbox" checked={!!a.social} disabled={!editable} onchange={(e) => set(i, 'social', e.currentTarget.checked)} /> social</label>
					<label class="chk"><input type="checkbox" checked={!!a.hidden} disabled={!editable} onchange={(e) => set(i, 'hidden', e.currentTarget.checked)} /> enclosed</label>
					<label>until
						<select value={a.until ?? ''} disabled={!editable} onchange={(e) => set(i, 'until', (e.currentTarget.value || undefined) as NeedId | undefined)}>
							<option value="">—</option>
							{#each NEED_IDS as n (n)}<option value={n}>{n}</option>{/each}
						</select>
					</label>
				</div>
			</div>
		{/each}
		{#if editable && list.length < 6}<button onclick={add}>＋ Add action</button>{/if}
		<div class="hint">Rates are need points per sim hour, scaled by condition and tapering near 100; cap = max gain per session; after = status effects granted when done (digesting, rested, sweaty, coffee → crash…). Capacity = simultaneous users (slots).</div>
	</section>
{/if}

<style>
	.aff {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	h2 {
		margin: 0 0 2px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: #6f86a8;
	}
	.card {
		border: 1px solid #24344e;
		border-radius: 8px;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.r {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.small {
		font-size: 11px;
		flex-wrap: wrap;
	}
	.small label {
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.small input[type='number'] {
		width: 46px;
	}
	.lbl {
		flex: 1;
	}
	.needs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 3px;
		font-size: 12px;
	}
	.needs label {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.needs input {
		width: 100%;
		min-width: 0;
		padding: 3px;
	}
	input,
	select,
	button {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 6px;
		padding: 4px 6px;
		min-height: 28px;
		box-sizing: border-box;
	}
	button {
		cursor: pointer;
	}
	.x {
		min-width: 28px;
	}
	.chk input {
		min-height: 0;
	}
	.hint {
		font-size: 10.5px;
		color: #8ea3c2;
	}
</style>
