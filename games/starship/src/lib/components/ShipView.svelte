<script lang="ts">
	/**
	 * Habitat mode – the whole ship in elevation / section: stainless shell from stacked rings with
	 * the ogive nose, domes per state (intact / hatch / cut flange), ring welds, cut & reweld
	 * markers of ring inserts, sealed-tank tint, engines, LOX header, side openings + tunnel stubs,
	 * ground line and labels. Decks themselves are drawn by Scene (floor-only Hull + modules).
	 */
	import { T } from '@threlte/core';
	import { HTML } from '@threlte/extras';
	import { DoubleSide, LatheGeometry, MeshStandardMaterial, Vector2 } from 'three';
	import { game } from '$lib/game/state.svelte';
	import { HULL_OUTER, LOCATIONS, NOSE_LENGTH, RING_HEIGHT, arealDensity, noseRadius } from '$lib/game/ship';
	import { HULL_INNER_RADIUS, HULL_WALL_THICKNESS } from '$lib/game/specs';
	import { domeCurve, hullPolyline } from '$lib/three/capProfiles';
	import { brushedTexture } from '$lib/three/materials';

	interface Props {
		/** cut azimuth (deg) – labels are placed beside the cut so they stay readable */
		cutDeg: number;
		labels?: boolean;
	}
	let { cutDeg, labels = true }: Props = $props();

	const g = $derived(game.ship);
	const h = $derived(game.hab);
	const R = HULL_INNER_RADIUS;

	const steel = new MeshStandardMaterial({ color: '#cfd4da', metalness: 0.88, roughness: 0.34, side: DoubleSide, map: brushedTexture() });
	const steelIn = new MeshStandardMaterial({ color: '#9aa1aa', metalness: 0.7, roughness: 0.5, side: DoubleSide });
	const weldMat = new MeshStandardMaterial({ color: '#5d636b', metalness: 0.6, roughness: 0.5 });
	const reweldMat = new MeshStandardMaterial({ color: '#ff8a1a', emissive: '#ff6a00', emissiveIntensity: 0.6 });
	const groundMat = new MeshStandardMaterial({ color: '#ffd23a', emissive: '#ffb000', emissiveIntensity: 0.7 });
	const hatchMat = new MeshStandardMaterial({ color: '#f2c400', metalness: 0.3, roughness: 0.5 });
	const darkMat = new MeshStandardMaterial({ color: '#1b1f25', roughness: 0.8, side: DoubleSide });
	const tankTint = {
		lox: new MeshStandardMaterial({ color: '#5fb6ff', transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false }),
		ch4: new MeshStandardMaterial({ color: '#79e08a', transparent: true, opacity: 0.16, side: DoubleSide, depthWrite: false })
	};

	// shell: inner profile up, outer profile down → one solid lathe
	const shell = $derived.by(() => {
		const inner = hullPolyline(g, 48);
		const outer = inner.map(([u, y]) => [u + HULL_WALL_THICKNESS * Math.min(1, u / 1.0), y] as [number, number]).reverse();
		return new LatheGeometry([...outer, ...inner].map(([u, y]) => new Vector2(Math.max(u, 0.001), y)), 128);
	});
	const domeGeos = $derived(
		g.domes.map((d) => ({
			d,
			geo: d.state === 'cut' ? null : new LatheGeometry(domeCurve(d.y, d.dir, d.state === 'hatch' ? 0.5 : 0.001, 40).map(([u, y]) => new Vector2(u, y)), 96)
		}))
	);
	$effect(() => {
		const a = shell;
		const b = domeGeos;
		return () => {
			a.dispose();
			b.forEach((x) => x.geo?.dispose());
		};
	});
	const sec = $derived(Object.fromEntries(g.sections.map((s) => [s.id, s])));
	const dir = (deg: number) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)] as const;
	const right = $derived(dir(cutDeg + 90));
	const left = $derived(dir(cutDeg - 90));
	const loc = $derived(LOCATIONS[h.location]);
	const lowestShielded = $derived(game.decks.map((_, k) => k).filter((k) => game.shielded(k) !== 'none'));
	const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

	function openingY(o: { ring: number; spanWeld: boolean }) {
		const y0 = g.ringY[o.ring] ?? 0;
		return o.spanWeld ? y0 + RING_HEIGHT : y0 + RING_HEIGHT / 2;
	}
	const engines = [
		...[0, 120, 240].map((a) => ({ a, r: 1.15, bell: 0.65, len: 2.2 })),
		...[60, 180, 300].map((a) => ({ a, r: 3.05, bell: 1.15, len: 3.2 }))
	];
	const headerY = $derived(g.tip - 3.4);
</script>

<T.Group name="Ship shell">
	<T.Mesh geometry={shell} material={steel} castShadow receiveShadow />
	<!-- ring welds (every 1.83 m) -->
	{#each g.joints as y}
		<T.Mesh position.y={y} rotation.x={Math.PI / 2} material={weldMat}>
			<T.TorusGeometry args={[HULL_OUTER + 0.004, 0.025, 4, 128]} />
		</T.Mesh>
	{/each}
	<!-- cut & reweld markers from inserted rings -->
	{#each g.welds as w}
		<T.Mesh position.y={w.y} rotation.x={Math.PI / 2} material={reweldMat}>
			<T.TorusGeometry args={[HULL_OUTER + 0.03, 0.06, 6, 128]} />
		</T.Mesh>
	{/each}
	<!-- domes -->
	{#each domeGeos as { d, geo }}
		{#if geo}
			<T.Mesh geometry={geo} material={steelIn} castShadow />
			{#if d.state === 'hatch'}
				<T.Mesh position.y={d.y + d.dir * 2.0} rotation.x={Math.PI / 2} material={hatchMat}>
					<T.TorusGeometry args={[0.52, 0.06, 8, 48]} />
				</T.Mesh>
			{/if}
		{:else}
			<!-- cut dome: flat ring flange left on the barrel -->
			<T.Mesh position.y={d.y} rotation.x={-Math.PI / 2} material={reweldMat}>
				<T.RingGeometry args={[R - 0.6, R, 96]} />
			</T.Mesh>
		{/if}
	{/each}
	<!-- sealed tanks: propellant-volume tint until converted -->
	{#each ['lox', 'ch4'] as const as id}
		{#if !h.converted[id]}
			{@const s = sec[id]}
			<T.Mesh position.y={(s.y0 + s.y1) / 2} material={tankTint[id]}>
				<T.CylinderGeometry args={[R - 0.05, R - 0.05, s.y1 - s.y0, 64, 1, true]} />
			</T.Mesh>
		{/if}
	{/each}
	<!-- Raptor engines in the aft bay -->
	{#each engines as e}
		<T.Mesh position={[Math.sin((e.a * Math.PI) / 180) * e.r, e.len / 2 + 0.3, Math.cos((e.a * Math.PI) / 180) * e.r]} material={steelIn}>
			<T.CylinderGeometry args={[0.28, e.bell, e.len, 32, 1, true]} />
		</T.Mesh>
	{/each}
	<!-- LOX header tank in the nose (ESTIMATE position) -->
	<T.Mesh position.y={headerY} material={steelIn}>
		<T.SphereGeometry args={[Math.min(1.6, noseRadius(headerY - g.noseBase) - 0.3), 32, 20]} />
	</T.Mesh>
	<!-- side openings + tunnel stubs -->
	{#each h.openings as o}
		{@const y = openingY(o)}
		{@const [sx, sz] = dir(o.angle)}
		<T.Group position={[sx * (HULL_OUTER - 0.1), y, sz * (HULL_OUTER - 0.1)]} rotation.y={(o.angle * Math.PI) / 180}>
			<T.Mesh material={darkMat}>
				<T.BoxGeometry args={[o.w, o.h, 0.4]} />
			</T.Mesh>
			<T.Mesh position.z={0.21} material={hatchMat}>
				<T.BoxGeometry args={[o.w + 0.16, o.h + 0.16, 0.04]} />
			</T.Mesh>
			{#if o.tunnel}
				<T.Mesh position.z={0.1 + o.tunnelLen / 2} rotation.x={Math.PI / 2} material={steel}>
					<T.CylinderGeometry args={[1.0, 1.0, o.tunnelLen, 40, 1, true]} />
				</T.Mesh>
				<T.Mesh position.z={0.1 + o.tunnelLen} material={darkMat}>
					<T.CircleGeometry args={[0.98, 40]} />
				</T.Mesh>
			{/if}
		</T.Group>
		{#if labels}
			<HTML position={[sx * (HULL_OUTER + (o.tunnel ? o.tunnelLen : 0) + 0.8), y + 1.2, sz * (HULL_OUTER + (o.tunnel ? o.tunnelLen : 0) + 0.8)]} center pointerEvents="none" zIndexRange={[5, 0]}>
				<div class="tag op">P{o.uid}{o.tunnel ? ` · T${o.uid}` : ''}{o.tunnel && y + 1 < game.soilTop ? ' (buried)' : ''}</div>
			</HTML>
		{/if}
	{/each}
	<!-- ground line on the hull -->
	<T.Mesh position.y={game.soilTop} rotation.x={Math.PI / 2} material={groundMat}>
		<T.TorusGeometry args={[HULL_OUTER + 0.05, 0.05, 6, 128]} />
	</T.Mesh>
</T.Group>

{#if labels}
	{#each g.sections as s}
		{@const y = (s.y0 + s.y1) / 2}
		{@const r = (s.id === 'nose' ? noseRadius(NOSE_LENGTH * 0.35) : HULL_OUTER) + 1.4}
		<HTML position={[right[0] * r, y, right[1] * r]} pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="tag sec" class:tank={s.kind === 'tank'}>
				<b>{s.short}</b> {s.name}<br />
				<small>
					{s.y0.toFixed(1)}–{s.y1.toFixed(1)} m{s.rings ? ` · ${s.rings} rings` : ''} · {fmt(s.volume)} m³
					{#if s.id === 'lox' || s.id === 'ch4'} · {h.converted[s.id] ? 'HABITAT' : 'SEALED'}{/if}
				</small>
			</div>
		</HTML>
	{/each}
	{#each g.domes as d}
		<HTML position={[right[0] * (HULL_OUTER + 0.6), d.y + d.dir * 1.0, right[1] * (HULL_OUTER + 0.6)]} pointerEvents="none" zIndexRange={[5, 0]}>
			<div class="tag dome">{d.name}: {d.state === 'cut' ? 'cut → flange' : d.state === 'hatch' ? 'Ø1 m hatch' : 'intact'}</div>
		</HTML>
	{/each}
	{#each game.decks as d, k}
		{#if d.section !== 'crew' || game.floorY[k] < g.tip}
			<HTML position={[left[0] * (HULL_OUTER + 0.6), game.floorY[k] + 0.3, left[1] * (HULL_OUTER + 0.6)]} pointerEvents="none" zIndexRange={[5, 0]}>
				<div class="tag deck" class:shield={game.shielded(k) === 'full'} class:part={game.shielded(k) === 'partial'} style="transform: translateX(-100%)">
					{game.deckLabel(k)}{game.shielded(k) === 'full' ? ' 🛡' : game.shielded(k) === 'partial' ? ' ◐' : ''}
				</div>
			</HTML>
		{/if}
	{/each}
	{#each g.welds as w, i}
		{#if i % 2 === 0}
			<HTML position={[left[0] * (HULL_OUTER + 4.5), w.y, left[1] * (HULL_OUTER + 4.5)]} pointerEvents="none" zIndexRange={[5, 0]}>
				<div class="tag weld" style="transform: translate(-100%, -50%)">✂ cut & reweld · requalify</div>
			</HTML>
		{/if}
	{/each}
	<HTML position={[left[0] * (HULL_OUTER + 5), game.soilTop + 0.5, left[1] * (HULL_OUTER + 5)]} pointerEvents="none" zIndexRange={[5, 0]}>
		<div class="tag ground" style="transform: translateX(-100%)">
			{loc.name} · {loc.g} m/s² · grade +{h.burial.toFixed(1)} m · berm {h.berm.toFixed(1)} m<br />
			<small>lateral cover ≥ {arealDensity(3, loc.rho).toFixed(0)} g/cm² (3 m crest) · {lowestShielded.length} deck(s) at/below soil line</small>
		</div>
	</HTML>
{/if}

<style>
	.tag {
		font: 11px/1.25 system-ui, sans-serif;
		color: #e8edf3;
		background: rgba(12, 16, 22, 0.78);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 6px;
		white-space: nowrap;
	}
	.sec b {
		color: #8fd0ff;
	}
	.sec.tank b {
		color: #ffd27a;
	}
	small {
		opacity: 0.8;
		font-size: 10px;
	}
	.dome {
		color: #ffb15a;
	}
	.deck.shield {
		border-color: #4cd07d;
		color: #9cf0b8;
	}
	.deck.part {
		border-color: #d0b44c;
	}
	.weld {
		color: #ff9a3a;
		border-color: #ff8a1a;
	}
	.ground {
		color: #ffd23a;
		border-color: #ffd23a;
	}
	.op {
		color: #ffe28a;
	}
</style>
