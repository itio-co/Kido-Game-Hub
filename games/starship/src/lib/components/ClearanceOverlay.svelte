<script lang="ts">
	/**
	 * Couch / keep-out clearances on the current deck (deck-local, inside the floor group):
	 * stowed footprint (solid), deployed recline envelope (translucent ghost of the couch model),
	 * egress path to the nearest ladder / hatch (0.8 m floor band: green clear, red blocked segment),
	 * blocking items in red, keep-out zones (door swings) in amber, live drag preview + nudge hint.
	 * Shown for the selected / hovered / dragged couch, the couch whose issue was clicked, or all
	 * couches with the "Show clearances" toggle.
	 */
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { BufferGeometry, Float32BufferAttribute } from 'three';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { egressFor, keepoutFootprint, nudgeFor, type EgressResult } from '$lib/game/egress';
	import { PHASE, footprintOf, localToWorld, outline, type Footprint, type Vec2 } from '$lib/game/geometry';
	import { doorSpecOf, type DoorSpec } from '$lib/game/doors';
	import { MIN_PASSAGE_WIDTH } from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';
	import type { ModuleId, Phase, PlacedModule } from '$lib/game/types';
	import { overlayMat } from '$lib/three/materials';
	import ModuleMesh from './ModuleMesh.svelte';
	import Outline from './Outline.svelte';
	import Zone from './Zone.svelte';

	const fpIn = (type: ModuleId, x: number, z: number, a: number, ph: Phase): Footprint => {
		const k = PHASE.v;
		PHASE.v = ph;
		const f = footprintOf(type, x, z, a);
		PHASE.v = k;
		return f;
	};
	const isCouch = (m: PlacedModule | undefined) => !!m && !!CATALOG_BY_ID[m.type]?.seats;
	const mods = $derived(game.deck.modules);
	const dragM = $derived(game.drag?.moved ? mods.find((m) => m.uid === game.drag!.uid) : undefined);
	// live pose of a dragged couch
	const dragPose = $derived.by(() => {
		if (!dragM || !isCouch(dragM) || !game.drag) return null;
		const t = game.dragPose(dragM, game.drag);
		return { ...dragM, x: t.x, z: t.z, angle: t.angle } as PlacedModule;
	});
	const dragEgress = $derived.by((): EgressResult | null => {
		if (!dragPose) return null;
		const ctx = game.egressCtx(game.current, mods.map((m) => (m.uid === dragPose.uid ? dragPose : m)));
		return egressFor(ctx, dragPose, game.phase);
	});
	const dragFits = $derived(dragPose ? game.check(dragPose.type, dragPose.x, dragPose.z, dragPose.angle, dragPose.uid, game.current, dragPose.y ?? 0).ok : true);
	// nudge hint: nearest clear spot, debounced while dragging
	let nudge = $state<{ x: number; z: number; d: number } | null>(null);
	$effect(() => {
		const p = dragPose, e = dragEgress, fits = dragFits;
		nudge = null;
		if (!p || (e?.ok && fits)) return;
		const t = setTimeout(() => {
			const ctx = game.egressCtx(game.current, mods.filter((m) => m.uid !== p.uid));
			nudge = nudgeFor(ctx, p, game.phase, (x, z) => game.check(p.type, x, z, p.angle, p.uid, game.current, p.y ?? 0).ok);
		}, 180);
		return () => clearTimeout(t);
	});
	const shown = $derived.by(() => {
		const ids = new Set<number>();
		if (game.showClearances) for (const m of mods) if (isCouch(m)) ids.add(m.uid);
		for (const u of [game.selectedUid, game.hoverUid, game.focusEgress]) if (u !== null && isCouch(mods.find((m) => m.uid === u))) ids.add(u);
		if (dragPose) ids.delete(dragPose.uid);
		return [...ids];
	});
	const items = $derived.by(() => {
		const out: { m: PlacedModule; e: EgressResult | null; live: boolean }[] = shown.map((uid) => ({ m: mods.find((mm) => mm.uid === uid)!, e: game.egressOf(uid), live: false }));
		if (dragPose) out.push({ m: dragPose, e: dragEgress, live: true });
		return out.filter((o) => o.m);
	});
	const keepouts = $derived.by(() => {
		const sel = new Set([game.selectedUid, game.hoverUid, dragM?.uid ?? null]);
		return mods
			.filter((m) => game.showClearances || sel.has(m.uid))
			.map((m) => {
				const p = dragM && m.uid === dragM.uid && game.drag ? { ...m, ...game.dragPose(m, game.drag) } : m;
				const f = keepoutFootprint(p);
				const ds = doorSpecOf(m.type);
				return { uid: m.uid, f: f!, label: CATALOG_BY_ID[m.type]?.keepout?.label ?? (ds ? `${ds.label} swing` : 'keep-out'), arcs: ds ? swingArcs(p, ds) : [] };
			})
			.filter((k) => k.f);
	});
	/** door swing arcs (side-hinged leaves): pivot → closed edge → arc → open edge, world XZ */
	function swingArcs(m: PlacedModule, ds: DoorSpec): Vec2[][] {
		if (ds.kind !== 'hinge') return [];
		return ds.leaves
			.filter((l) => (l.axis ?? 'y') === 'y' && l.angle && l.w)
			.map((l) => {
				const [px, , pz] = l.pivot;
				const sx = px < 0 ? 1 : -1;
				const pts: Vec2[] = [localToWorld(m.x, m.z, m.angle, px, pz)];
				for (let i = 0; i <= 16; i++) {
					const th = (((l.angle ?? 0) * i) / 16) * (Math.PI / 180);
					const x = sx * l.w! * Math.cos(th),
						z = -sx * l.w! * Math.sin(th);
					pts.push(localToWorld(m.x, m.z, m.angle, px + x, pz + z));
				}
				pts.push(pts[0]);
				return pts;
			});
	}
	/** 0.8 m wide floor band along a polyline, split into clear / blocked quads */
	function band(path: Vec2[], blocked: boolean[], want: boolean): BufferGeometry {
		const g = new BufferGeometry();
		const v: number[] = [];
		const h = MIN_PASSAGE_WIDTH / 2;
		for (let n = 0; n + 1 < path.length; n++) {
			const seg = blocked[n] || blocked[n + 1];
			if (seg !== want) continue;
			const [x0, z0] = path[n], [x1, z1] = path[n + 1];
			const L = Math.hypot(x1 - x0, z1 - z0) || 1;
			const nx = (-(z1 - z0) / L) * h, nz = ((x1 - x0) / L) * h;
			// extend along the segment by h so consecutive quads overlap at corners
			const ex = ((x1 - x0) / L) * 0.05, ez = ((z1 - z0) / L) * 0.05;
			const a = [x0 - ex + nx, z0 - ez + nz], b = [x0 - ex - nx, z0 - ez - nz], c = [x1 + ex - nx, z1 + ez - nz], d = [x1 + ex + nx, z1 + ez + nz];
			const y = want ? 0.03 : 0.02;
			v.push(a[0], y, a[1], b[0], y, b[1], c[0], y, c[1], a[0], y, a[1], c[0], y, c[1], d[0], y, d[1]);
		}
		g.setAttribute('position', new Float32BufferAttribute(v, 3));
		return g;
	}
	const envLabel = $derived(game.phase === 'launch' ? `deployed envelope (${game.mission === 'landing' ? 'Landing' : 'Launch'})` : `stowed envelope (${game.mission === 'cruise' ? 'Cruise' : 'Surface'})`);
</script>

{#each keepouts as k (k.uid)}
	<Zone f={k.f} color="#f59e0b" opacity={0.18} y={0.016} />
	<Outline points={outline(k.f)} y={0.026} color="#f59e0b" opacity={0.8} />
	{#each k.arcs as a, i (i)}
		<Outline points={a} y={0.03} color="#fbbf24" opacity={0.95} />
	{/each}
{/each}

{#each items as o (o.m.uid + (o.live ? '-live' : ''))}
	{@const m = o.m}
	{@const def = CATALOG_BY_ID[m.type]}
	{@const stow = fpIn(m.type, m.x, m.z, m.angle, 'surface')}
	{@const dep = fpIn(m.type, m.x, m.z, m.angle, 'launch')}
	{@const e = o.e}
	{@const bad = !!e && !e.ok}
	{@const okC = o.live && !dragFits ? '#ef4444' : bad ? '#ef4444' : '#22c55e'}
	<!-- stowed footprint (solid) -->
	<Zone f={stow} color="#60a5fa" opacity={0.42} y={0.018} />
	<Outline points={outline(stow)} y={0.03} color="#93c5fd" />
	<!-- deployed / reclined envelope -->
	{#if def.launch}
		<Outline points={outline(dep)} y={0.03} color={game.phase === 'launch' ? okC : '#a78bfa'} opacity={0.9} />
		{#if game.phase !== 'launch' || o.live}
			<T.Group position={[m.x, 0, m.z]} rotation.y={(m.angle * Math.PI) / 180}>
				<ModuleMesh type={m.type} phase="launch" ghost={bad ? '#ff6b6b' : '#a78bfa'} deckHeight={game.deck.height} />
			</T.Group>
		{/if}
	{/if}
	<!-- egress band -->
	{#if e && e.path.length > 1}
		<T.Mesh geometry={band(e.path, e.blocked, false)} material={overlayMat(o.live ? okC : '#22c55e', 0.32)} renderOrder={6} />
		<T.Mesh geometry={band(e.path, e.blocked, true)} material={overlayMat('#ef4444', 0.55)} renderOrder={7} />
	{/if}
	<!-- blockers -->
	{#if e}
		{#each e.blockers as b (b.uid)}
			{@const bm = mods.find((x) => x.uid === b.uid)}
			{#if bm}
				{@const bf = fpIn(bm.type, bm.x, bm.z, bm.angle, game.phase)}
				<Zone f={bf} color="#ef4444" opacity={0.35} y={0.022} />
				<Outline points={outline(bf)} y={0.035} color="#ef4444" />
				<HTML position={[bm.x, Math.min(CATALOG_BY_ID[bm.type].height, game.deck.height - 0.3) + 0.15, bm.z]} center pointerEvents="none" zIndexRange={[8, 0]}>
					<div class="blk" data-testid="egress-blocker">⛔ blocks egress</div>
				</HTML>
			{/if}
		{/each}
	{/if}
	<HTML position={[m.x, 1.25, m.z]} center pointerEvents="none" zIndexRange={[9, 0]}>
		<div class="lab" class:bad={bad || (o.live && !dragFits)} data-testid="egress-label" data-ok={e?.ok ? '1' : '0'}>
			{#if e}{e.ok ? '✓ egress' : '✖ egress blocked'}{#if e.target} → {e.target}{/if}{#if e.ok} · {e.length.toFixed(1)} m{/if}{:else}…{/if}
			<small>{envLabel}</small>
		</div>
	</HTML>
{/each}

{#if dragPose && nudge}
	{@const nf = fpIn(dragPose.type, nudge.x, nudge.z, dragPose.angle, game.phase)}
	<Outline points={outline(nf)} y={0.04} color="#22d3ee" />
	<Zone f={nf} color="#22d3ee" opacity={0.15} y={0.024} />
	<HTML position={[nudge.x, 0.5, nudge.z]} center pointerEvents="none" zIndexRange={[9, 0]}>
		<div class="nudge" data-testid="egress-nudge">↦ clear spot {(nudge.d * 100).toFixed(0)} cm away</div>
	</HTML>
{/if}

<style>
	.lab,
	.blk,
	.nudge {
		font: 600 11px/1.2 system-ui, sans-serif;
		color: #eafff0;
		background: rgba(6, 40, 22, 0.88);
		border: 1px solid #22c55e;
		border-radius: 6px;
		padding: 2px 6px;
		white-space: nowrap;
		text-align: center;
	}
	.lab small {
		display: block;
		font-weight: 500;
		opacity: 0.8;
		font-size: 10px;
	}
	.lab.bad,
	.blk {
		background: rgba(60, 8, 8, 0.9);
		border-color: #ef4444;
		color: #ffe4e4;
	}
	.nudge {
		background: rgba(4, 40, 48, 0.9);
		border-color: #22d3ee;
		color: #dffbff;
	}
</style>
