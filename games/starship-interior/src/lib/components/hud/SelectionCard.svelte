<script lang="ts">
	/** Contextual selection card: name, size, live condition, egress status, seats, and rotate / duplicate / delete actions. */
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { keepoutFootprint, nudgeFor } from '$lib/game/egress';
	import { dimsOf, footprintOf, overlaps } from '$lib/game/geometry';
	import { doorSpecOf } from '$lib/game/doors';
	import { game } from '$lib/game/state.svelte';
	import { crew } from '$lib/sim/crewSim.svelte';
	import { LIFE_ICON } from '$lib/sim/lifecycle';
	let { mobile = false }: { mobile?: boolean } = $props();
	const sel = $derived(game.tool === 'select' ? game.selected : null);
	const def = $derived(sel ? CATALOG_BY_ID[sel.type] : null);
	let tick = $state(0);
	$effect(() => {
		const t = setInterval(() => tick++, 500);
		return () => clearInterval(t);
	});
	const life = $derived.by(() => {
		void tick;
		return sel && crew.enabled ? crew.itemInfo(game.current, sel.uid) : null;
	});
	const locked = $derived.by(() => {
		void game.lockTick;
		return !!sel?.locked;
	});
	const eg = $derived(sel && def?.seats ? game.egressOf(sel.uid) : null);
	/** door: kind + whether its swing / access zone is clear of other equipment */
	const doorInfo = $derived.by(() => {
		if (!sel) return null;
		const ds = doorSpecOf(sel.type);
		if (!ds) return null;
		const f = keepoutFootprint(sel);
		const blockers = f
			? game.deck.modules.filter((o) => o.uid !== sel.uid && !o.mount && CATALOG_BY_ID[o.type] && !CATALOG_BY_ID[o.type].restraint && overlaps(f, footprintOf(o.type, o.x, o.z, o.angle))).map((o) => CATALOG_BY_ID[o.type].name)
			: [];
		return { label: ds.label, kind: ds.kind, private: ds.private, blockers };
	});
	function nudge() {
		const m = sel;
		if (!m || game.lockedGuard(m.uid, 'move')) return;
		const ctx = game.egressCtx(game.current, game.deck.modules.filter((x) => x.uid !== m.uid));
		const n = nudgeFor(ctx, m, game.phase, (x, z) => game.check(m.type, x, z, m.angle, m.uid, game.current, m.y ?? 0).ok);
		if (!n) return game.flash('No clear spot within 1.2 m – move the blocking items instead');
		m.x = n.x;
		m.z = n.z;
		game.autosave();
	}
</script>

{#if sel && def}
	{@const dm = dimsOf(def, game.phase)}
	<div class="selcard glass" class:mobile class:locked data-testid="selection-card">
		<div class="hd">
			<span class="ico">{def.icon}</span>
			<div class="t"><b>{#if locked}🔒 {/if}{def.name}</b><small>{dm.w.toFixed(2)} × {dm.d.toFixed(2)} × {dm.height.toFixed(2)} m · {def.power} W · {game.deckLabel(game.current)}</small></div>
			<button class="x" onclick={() => (game.selectedUid = null)} aria-label="Deselect">✕</button>
		</div>
		{#if life}
			<div class="row" data-testid="selcard-life">
				<span class="cond"><i style="width:{life.cond}%;background:{life.cond > 60 ? '#22c55e' : life.cond > 35 ? '#f59e0b' : '#ef4444'}"></i></span>
				<span>{LIFE_ICON[life.state]} {life.cond} % · {life.state} · {life.hours} h · next service {life.state === 'Broken' ? '—' : `${life.nextService.toFixed(0)} h`}</span>
			</div>
		{/if}
		{#if eg}
			<div class="row eg" class:bad={!eg.ok} data-testid="selcard-egress">{eg.ok ? '✓' : '✖'} {eg.ok ? `Egress clear → ${eg.target} (${eg.envelope})` : `Egress blocked by ${eg.blockers.map((b) => b.name).join(', ') || 'hull'} (${eg.envelope})`}</div>
		{/if}
		{#if doorInfo}
			<div class="row eg" class:bad={doorInfo.blockers.length > 0} data-testid="selcard-door">🚪 {doorInfo.kind === 'curtain' ? 'Curtain' : `${doorInfo.kind === 'hinge' ? 'Hinged' : 'Sliding'} ${doorInfo.label}`}{doorInfo.private ? ' · private' : ''} · {doorInfo.blockers.length ? `✖ swing blocked by ${[...new Set(doorInfo.blockers)].join(', ')}` : '✓ swing clear'}</div>
		{/if}
		{#if def.group}<div class="row">🪑 {game.seatsOf(sel.uid).length + (def.restraint ? 2 : 0)} seats</div>{/if}
		<div class="acts">
			<button class="lock" class:on={locked} onclick={() => game.toggleLock(sel.uid)} aria-label={locked ? 'Unlock' : 'Lock'} aria-pressed={locked} title={locked ? 'Unlock – allow moving / rotating / deleting (L)' : 'Lock – prevent moving / rotating / deleting (L)'} data-testid="selcard-lock">{locked ? '🔒' : '🔓'}</button>
			<button class:dim={locked} onclick={() => game.rotate(-15)} aria-label="Rotate left 15°" title="Rotate −15° (Q)">⟲</button>
			<button class:dim={locked} onclick={() => game.rotate(15)} aria-label="Rotate right 15°" title="Rotate +15° (E)">⟳</button>
			<button class:dim={locked} onclick={() => game.rotate(90)} aria-label="Rotate 90°" title="Rotate 90° (R)">90°</button>
			<button onclick={() => game.duplicateSelected()} aria-label="Duplicate" title="Duplicate next to it" data-testid="selcard-duplicate">📋</button>
			{#if def.group}<button onclick={() => game.addSeats(sel.uid)} aria-label="Add seats" title="Add chairs around the table">🪑＋</button>{/if}
			{#if eg && !eg.ok}<button onclick={nudge} aria-label="Move to clear spot" title="Move to the nearest spot with clear egress">🧭</button>{/if}
			<button class="del" class:dim={locked} onclick={() => game.deleteSelected()} aria-label="Delete" title="Delete (Del)" data-testid="selcard-delete">🗑</button>
		</div>
	</div>
{/if}

<style>
	.selcard.locked {
		border-color: rgba(255, 200, 87, 0.55);
	}
	.acts .lock.on {
		border-color: #ffc857;
		background: rgba(255, 200, 87, 0.18);
	}
	.acts .dim {
		opacity: 0.4;
	}
	.selcard {
		position: absolute;
		right: calc(12px + env(safe-area-inset-right));
		bottom: 176px;
		width: 290px;
		z-index: 15;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 12px;
		color: #dbeafe;
	}
	.selcard.mobile {
		left: 8px;
		right: 8px;
		width: auto;
		bottom: calc(124px + env(safe-area-inset-bottom));
	}
	.hd {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ico {
		font-size: 26px;
	}
	.t {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 0;
	}
	.t small {
		opacity: 0.7;
		font-size: 10.5px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}
	.cond {
		width: 46px;
		height: 6px;
		border-radius: 3px;
		background: #1c2a40;
		overflow: hidden;
		flex-shrink: 0;
	}
	.cond i {
		display: block;
		height: 100%;
	}
	.eg {
		color: #bbf7d0;
	}
	.eg.bad {
		color: #fecaca;
	}
	.acts {
		display: flex;
		gap: 4px;
	}
	.acts button,
	.x {
		font: 600 14px/1 system-ui, sans-serif;
		color: inherit;
		background: rgba(120, 200, 255, 0.08);
		border: 1px solid rgba(120, 200, 255, 0.25);
		border-radius: 8px;
		min-width: 40px;
		min-height: 36px;
		cursor: pointer;
		touch-action: manipulation;
	}
	.acts .del {
		margin-left: auto;
		border-color: rgba(255, 90, 90, 0.5);
		background: rgba(255, 60, 60, 0.12);
	}
	.x {
		min-width: 30px;
		min-height: 30px;
		font-size: 12px;
	}
</style>
