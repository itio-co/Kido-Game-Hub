<script lang="ts">
	/** Build-mode overlays on the current deck: guides, access zones, selection, ghost, tape measure. */
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { BufferGeometry, LineBasicMaterial, LineDashedMaterial, Vector3 } from 'three';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { accessFootprint, footprintOf, maxRadius, outline, shaftAccess, shaftFootprint, snapTo } from '$lib/game/geometry';
	import { HULL_INNER_RADIUS, SNAP_ANGLE } from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';
	import { radialGuide } from '$lib/three/hullGeometry';
	import ModuleMesh from './ModuleMesh.svelte';
	import ShaftMesh from './ShaftMesh.svelte';
	import Outline from './Outline.svelte';
	import Zone from './Zone.svelte';

	const guideMat = new LineBasicMaterial({ color: '#5aa9e6', transparent: true, opacity: 0.35 });
	const deckH = $derived(game.deck.height);
	const warn = $derived(new Set([...(game.analysis?.blocked ?? []), ...(game.analysis?.unreachable ?? [])]));

	const baseY = $derived(game.floorY[game.current] ?? 0);
	const clipY = $derived(baseY + game.deck.height);

	// ladder-connection ghost (Hatch tool) or dragged connection
	const shaftGhost = $derived.by(() => {
		if (game.drag?.moved) {
			const sh = game.shafts.find((s) => s.uid === game.drag!.uid);
			if (!sh) return null;
			const t = game.shaftDragTarget(sh.uid, game.drag);
			return { ...t, from: sh.from, ...game.checkShaft(t.x, t.z, t.angle, sh.from, sh.uid) };
		}
		if (game.tool !== 'module' || game.selectedModule !== 'hatch' || game.cameraDragging) return null;
		const t = game.pending ?? game.hover;
		return t ? game.planShaft(t) : null;
	});
	const alignGeo = $derived.by(() => {
		if (!shaftGhost || shaftGhost.alignedWith === null) return null;
		const g = new BufferGeometry().setFromPoints([
			new Vector3(shaftGhost.x, -baseY - 0.25, shaftGhost.z),
			new Vector3(shaftGhost.x, game.stackTop - baseY + 0.6, shaftGhost.z)
		]);
		g.computeBoundingSphere();
		return g;
	});
	const dashMat = new LineDashedMaterial({ color: '#3ce0ff', dashSize: 0.15, gapSize: 0.1, depthTest: false, transparent: true });
	let dashLine = $state<import('three').Line>();
	$effect(() => {
		void alignGeo;
		dashLine?.computeLineDistances();
	});

	// placement ghost / drag ghost (equipment)
	const ghost = $derived.by(() => {
		if (game.drag?.moved && game.shafts.some((s) => s.uid === game.drag!.uid)) return null;
		if (game.drag?.moved) {
			const m = game.modules.find((mm) => mm.uid === game.drag!.uid);
			if (!m) return null;
			const c = game.check(m.type, game.drag.x, game.drag.z, m.angle, m.uid);
			return { type: m.type, x: game.drag.x, z: game.drag.z, angle: m.angle, ...c };
		}
		if (game.tool !== 'module' || game.selectedModule === 'hatch' || game.cameraDragging) return null;
		const t = game.pending ?? game.hover;
		if (!t) return null;
		const p = game.snapPt(t);
		const angle = game.snap ? snapTo(game.rotation, SNAP_ANGLE) : game.rotation;
		return { type: game.selectedModule, x: p.x, z: p.z, angle, ...game.check(game.selectedModule, p.x, p.z, angle) };
	});

	function dims(uid: number) {
		const m = game.modules.find((mm) => mm.uid === uid);
		if (!m) return null;
		const def = CATALOG_BY_ID[m.type];
		const f = footprintOf(m.type, m.x, m.z, m.angle);
		const h = def.fullHeight ? deckH : def.height;
		return {
			m,
			size: def.shape === 'circle' ? `Ø${def.w.toFixed(2)} × ${h.toFixed(2)} m` : `${def.w.toFixed(2)} × ${def.d.toFixed(2)} × ${h.toFixed(2)} m`,
			r: Math.hypot(m.x, m.z),
			wall: (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) - maxRadius(f),
			labelY: Math.max(h, 0.3) + 0.25
		};
	}
	const sel = $derived(game.selectedUid !== null && !game.drag?.moved ? dims(game.selectedUid) : null);
	const selSh = $derived(!game.drag?.moved ? game.selectedShaft : null);
	const measureLen = $derived(
		game.measureA && game.measureB ? Math.hypot(game.measureB.x - game.measureA.x, game.measureB.z - game.measureA.z) : null
	);
	const measureEnd = $derived(game.measureB ?? (game.tool === 'measure' && game.measureA ? game.hover : null));
</script>

{#if game.guides && !game.section}
	<T.LineSegments geometry={radialGuide()} material={guideMat} position.y={0.006} scale={[(game.deckRadius[game.current] ?? HULL_INNER_RADIUS) / HULL_INNER_RADIUS, 1, (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) / HULL_INNER_RADIUS]} />
	{#if (game.deckRadius[game.current] ?? HULL_INNER_RADIUS) < HULL_INNER_RADIUS - 0.01}
		<!-- nose ogive: usable radius at head height is a hard limit -->
		<T.Mesh position.y={0.012} rotation.x={-Math.PI / 2}>
			<T.RingGeometry args={[game.maxR() - 0.03, game.maxR(), 96]} />
			<T.MeshBasicMaterial color="#ff5a6a" transparent opacity={0.85} />
		</T.Mesh>
	{/if}
	{#each [1, 2, 3, 4] as r}
		<HTML position={[r, 0.02, 0]} center pointerEvents="none" zIndexRange={[5, 0]}><div class="lbl">{r} m</div></HTML>
	{/each}
	<HTML position={[0, 0.02, -(game.deckRadius[game.current] ?? HULL_INNER_RADIUS) + 0.25]} center pointerEvents="none" zIndexRange={[5, 0]}>
		<div class="lbl strong">{game.deckLabel(game.current)} · R {(game.deckRadius[game.current] ?? HULL_INNER_RADIUS).toFixed(2)} m{game.shipMode === 'habitat' && (game.deckRadius[game.current] ?? 4.5) < HULL_INNER_RADIUS - 0.01 ? ' (nose limit)' : ''}</div>
	</HTML>
{/if}

<!-- access zones + warnings -->
{#if game.clearance}
	{#each game.modules as m (m.uid)}
		{@const acc = accessFootprint(m.type, m.x, m.z, m.angle)}
		{#if acc && m.uid !== game.drag?.uid}
			<Zone f={acc} color={warn.has(m.uid) ? '#ff9a1f' : '#4aa3ff'} opacity={warn.has(m.uid) ? 0.32 : 0.14} />
		{/if}
		{#if warn.has(m.uid)}
			<Outline points={outline(footprintOf(m.type, m.x, m.z, m.angle))} color="#ff9a1f" y={0.03} />
		{/if}
	{/each}
	{#each game.shaftsOn(game.current) as sh (sh.uid)}
		{#if sh.uid !== game.drag?.uid}
			<Zone f={shaftAccess(sh.x, sh.z, sh.angle)} color={warn.has(sh.uid) ? '#ff9a1f' : '#4aa3ff'} opacity={warn.has(sh.uid) ? 0.32 : 0.14} />
		{/if}
	{/each}
{/if}

<!-- ladder labels on this deck -->
{#each game.shaftsOn(game.current) as sh (sh.uid)}
	{#if sh.uid !== game.drag?.uid && !game.section}
		<HTML position={[sh.x, 0.05, sh.z]} center pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="lad" class:up={sh.from === game.current}>
				{game.shaftLabel(sh)}
				{sh.from === game.current ? `↑ to ${game.deckLabel(sh.to)}` : `from ${game.deckLabel(sh.from)}`}
			</div>
		</HTML>
	{/if}
{/each}

<!-- hover + selection outlines -->
{#if game.tool === 'select' && game.hoverUid !== null && game.hoverUid !== game.selectedUid}
	{@const h = game.modules.find((m) => m.uid === game.hoverUid)}
	{#if h}
		<Outline points={outline(footprintOf(h.type, h.x, h.z, h.angle, 0.03))} color="#ffffff" opacity={0.6} />
	{/if}
{/if}
{#if game.tool === 'select' && game.hoverUid !== null && game.hoverUid !== game.selectedUid}
	{@const hs = game.shaftsOn(game.current).find((s) => s.uid === game.hoverUid)}
	{#if hs}
		<Outline points={outline(shaftFootprint(hs.x, hs.z, hs.angle))} color="#ffffff" opacity={0.6} />
	{/if}
{/if}
{#if selSh}
	<Outline points={outline(shaftFootprint(selSh.x, selSh.z, selSh.angle))} color="#3ce0ff" y={0.035} />
	<HTML position={[selSh.x, 1.4, selSh.z]} center pointerEvents="none" zIndexRange={[5, 0]}>
		<div class="dim">
			<b>Ladder {game.shaftLabel(selSh)}</b> · deck {selSh.from + 1} → {selSh.to + 1}<br />
			ladder {game.shaftLength(selSh).toFixed(2)} m · opening Ø0.80 m<br />
			x {selSh.x.toFixed(2)} z {selSh.z.toFixed(2)} · wall {((game.deckRadius[game.current] ?? HULL_INNER_RADIUS) - maxRadius(shaftFootprint(selSh.x, selSh.z, selSh.angle))).toFixed(2)} m · {selSh.angle.toFixed(0)}°
		</div>
	</HTML>
{/if}
{#if sel}
	<Outline points={outline(footprintOf(sel.m.type, sel.m.x, sel.m.z, sel.m.angle, 0.04))} color="#3ce0ff" y={0.035} />
	<HTML position={[sel.m.x, sel.labelY, sel.m.z]} center pointerEvents="none" zIndexRange={[5, 0]}>
		<div class="dim">
			<b>{CATALOG_BY_ID[sel.m.type].name}</b><br />
			{sel.size}<br />
			r {sel.r.toFixed(2)} m · wall {sel.wall.toFixed(2)} m · {sel.m.angle.toFixed(0)}°
		</div>
	</HTML>
{/if}

<!-- ghost -->
{#if ghost}
	{@const col = ghost.ok ? '#39ff88' : '#ff3b4e'}
	<Zone f={footprintOf(ghost.type, ghost.x, ghost.z, ghost.angle)} color={col} opacity={0.3} y={0.02} />
	{#if accessFootprint(ghost.type, ghost.x, ghost.z, ghost.angle)}
		<Zone f={accessFootprint(ghost.type, ghost.x, ghost.z, ghost.angle)!} color="#4aa3ff" opacity={0.15} y={0.018} />
	{/if}
	<T.Group position={[ghost.x, 0, ghost.z]} rotation.y={(ghost.angle * Math.PI) / 180}>
		<ModuleMesh type={ghost.type} ghost={col} deckHeight={deckH} phase={game.phase} />
	</T.Group>
	{#if !ghost.ok}
		<HTML position={[ghost.x, 0.1, ghost.z]} center pointerEvents="none" zIndexRange={[5, 0]}><div class="bad">{ghost.reason}</div></HTML>
	{/if}
{/if}

<!-- ladder-connection ghost + vertical alignment cue -->
{#if shaftGhost}
	{@const col = shaftGhost.ok ? '#39ff88' : '#ff3b4e'}
	<Zone f={shaftFootprint(shaftGhost.x, shaftGhost.z, shaftGhost.angle)} color={col} opacity={0.3} y={0.02} />
	<Zone f={shaftAccess(shaftGhost.x, shaftGhost.z, shaftGhost.angle)} color="#4aa3ff" opacity={0.15} y={0.018} />
	<T.Group position.y={-baseY}>
		<ShaftMesh x={shaftGhost.x} z={shaftGhost.z} angle={shaftGhost.angle} from={shaftGhost.from} ghost={col} maxY={clipY} />
	</T.Group>
	{#if alignGeo}
		<T.Line bind:ref={dashLine} geometry={alignGeo} material={dashMat} renderOrder={6} />
		<T.Mesh position={[shaftGhost.x, 0.04, shaftGhost.z]} rotation.x={Math.PI / 2}>
			<T.TorusGeometry args={[0.62, 0.03, 6, 48]} />
			<T.MeshBasicMaterial color="#3ce0ff" />
		</T.Mesh>
		<HTML position={[shaftGhost.x, 1.2, shaftGhost.z]} center pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="align">⇅ Aligned with {game.shaftLabel(shaftGhost.alignedWith!)}</div>
		</HTML>
	{/if}
	<HTML position={[shaftGhost.x, 0.1, shaftGhost.z]} center pointerEvents="none" zIndexRange={[5, 0]}>
		{#if shaftGhost.ok}
			<div class="ok">Ladder deck {shaftGhost.from + 1} → {shaftGhost.from + 2}</div>
		{:else}
			<div class="bad">{shaftGhost.reason}</div>
		{/if}
	</HTML>
{/if}

<!-- tape measure -->
{#if game.measureA}
	<T.Mesh position={[game.measureA.x, 0.05, game.measureA.z]}>
		<T.SphereGeometry args={[0.05, 12, 8]} />
		<T.MeshBasicMaterial color="#ffd23f" />
	</T.Mesh>
	{#if measureEnd}
		<Outline points={[[game.measureA.x, game.measureA.z], [measureEnd.x, measureEnd.z]]} color="#ffd23f" y={0.05} />
		<T.Mesh position={[measureEnd.x, 0.05, measureEnd.z]}>
			<T.SphereGeometry args={[0.05, 12, 8]} />
			<T.MeshBasicMaterial color="#ffd23f" />
		</T.Mesh>
		<HTML position={[(game.measureA.x + measureEnd.x) / 2, 0.15, (game.measureA.z + measureEnd.z) / 2]} center pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="tape">
				{(measureLen ?? Math.hypot(measureEnd.x - game.measureA.x, measureEnd.z - game.measureA.z)).toFixed(3)} m
			</div>
		</HTML>
	{/if}
{/if}

<style>
	.lbl {
		font: 600 10px system-ui, sans-serif;
		color: rgba(150, 205, 255, 0.85);
		white-space: nowrap;
		user-select: none;
	}
	.lbl.strong {
		color: #bfe3ff;
		font-size: 11px;
	}
	.lad {
		font: 700 11px system-ui, sans-serif;
		color: #111;
		background: #ffd23f;
		padding: 1px 5px;
		border-radius: 4px;
		transform: translateY(24px);
		white-space: nowrap;
		box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
	}
	.lad.up {
		background: #9fe3ff;
	}
	.align,
	.ok {
		font: 600 12px system-ui, sans-serif;
		white-space: nowrap;
		padding: 3px 8px;
		border-radius: 6px;
	}
	.align {
		background: rgba(0, 40, 60, 0.9);
		border: 1px solid #3ce0ff;
		color: #bff4ff;
	}
	.ok {
		background: rgba(6, 40, 20, 0.85);
		border: 1px solid #39ff88;
		color: #c4ffd9;
		transform: translateY(26px);
	}
	.dim,
	.bad,
	.tape {
		font: 12px/1.35 system-ui, sans-serif;
		white-space: nowrap;
		padding: 4px 8px;
		border-radius: 6px;
		user-select: none;
	}
	.dim {
		background: rgba(8, 18, 32, 0.88);
		border: 1px solid #3ce0ff;
		color: #dff6ff;
		transform: translateY(-30px);
	}
	.bad {
		background: rgba(60, 8, 14, 0.85);
		border: 1px solid #ff3b4e;
		color: #ffc2c8;
		transform: translateY(26px);
	}
	.tape {
		background: rgba(40, 32, 0, 0.88);
		border: 1px solid #ffd23f;
		color: #ffe9a0;
		font-weight: 700;
	}
</style>
