<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { OrbitControls, Stars } from '@threlte/extras';
	import { untrack } from 'svelte';
	import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
	import { PLAN_LIMITS, rig, type RigLimits } from '$lib/three/cameraRig.svelte';
	import { applyClipping, cutPlanes, heightPlane } from '$lib/three/sectionCut';
	import { hullRadiusAt } from '$lib/game/ship';
	import { tick } from 'svelte';
	import { Group, MOUSE, PMREMGenerator, TOUCH, type Texture } from 'three';
	import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
	import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
	import { CUTAWAY_HEIGHT } from '$lib/game/specs';
	import { game } from '$lib/game/state.svelte';
	import { download } from '$lib/game/exporters';
	import BuildInput from './BuildInput.svelte';
	import CutCaps from './CutCaps.svelte';
	import ShipView from './ShipView.svelte';
	import Terrain from './Terrain.svelte';
	import DeckModules from './DeckModules.svelte';
	import Hull from './Hull.svelte';
	import Overlays from './Overlays.svelte';
	import ShaftMesh from './ShaftMesh.svelte';
	import WalkControls from './WalkControls.svelte';
	import CrewLayer from '$lib/sim/CrewLayer.svelte';
	import PossessControls from '$lib/sim/PossessControls.svelte';
	import TrackballCam from './TrackballCam.svelte';
	import Dust from './Dust.svelte';
	import LadderHint from './LadderHint.svelte';
	import GroupLinks from './GroupLinks.svelte';
	import ClearanceOverlay from './ClearanceOverlay.svelte';
	import OccupancyBadges from '$lib/sim/OccupancyBadges.svelte';
	import NavOverlay from '$lib/sim/NavOverlay.svelte';
	import { crew } from '$lib/sim/crewSim.svelte';
	import Interior from './Interior.svelte';
	import { domeGeometry, domeMat } from '$lib/three/interior';
	import { HULL_INNER_RADIUS, SLAB_THICKNESS } from '$lib/game/specs';

	interface Props {
		portrait?: boolean;
	}
	let { portrait = false }: Props = $props();
	const { renderer, scene, dpr, invalidate } = useThrelte();

	// ---- quality: env map (procedural RoomEnvironment → PMREM, offline), shadows, DPR ----
	let envTex: Texture | undefined;
	$effect(() => {
		const high = game.quality === 'high';
		if (high && !envTex) {
			const pmrem = new PMREMGenerator(renderer);
			envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
			pmrem.dispose();
		}
		scene.environment = high ? (envTex ?? null) : null;
		scene.environmentIntensity = 0.55;
		dpr.set(Math.min(window.devicePixelRatio, high ? 2 : 1));
		invalidate();
	});

	// ---- section view: rotatable half / quarter cut (local clipping) + optional height cut ----
	renderer.localClippingEnabled = true;
	const habitat = $derived(game.shipMode === 'habitat');
	/** inside the ship (walk, possessed crew, cruise free-fly): full walls + ceilings, no section clipping */
	const interior = $derived(!game.exportAll && (game.mode === 'walk' || crew.possessed !== null));
	const viewDeck = $derived(crew.possessed !== null ? (crew.ui.agents[crew.possessed]?.deck ?? game.current) : game.walkDeck);
	/** phones / low quality: one light on the viewer's deck, no shadows, near-deck detail only */
	const lowPerf = $derived(game.quality === 'low' || game.isTouch);
	const outside = $derived.by(() => {
		if (game.mission === 'cruise' || game.mission === 'launch' || game.mission === 'landing' || game.phase === 'launch')
			return { key: 'space', color: '#24365e', intensity: 0.7, light: '#9fb8ff', li: 2.5 };
		return game.hab.location === 'mars'
			? { key: 'mars', color: '#e09060', intensity: 1.2, light: '#ffb27a', li: 5 }
			: { key: 'moon', color: '#cfd6e0', intensity: 1.1, light: '#e8eef8', li: 6 };
	});
	const cutOn = $derived(game.section && game.mode === 'build' && !game.exportAll && !interior);
	const cut = $derived(cutPlanes((game.cutDeg * Math.PI) / 180, game.cutMode));
	let clipRoot = $state<Group>();
	const clipTask = useTask(
		() => {
			if (clipRoot) applyClipping(clipRoot, cutOn ? cut.planes : null, cutOn && cut.intersect);
		},
		{ autoStart: false }
	);
	$effect(() => {
		heightPlane.constant = game.cutHeight;
		renderer.clippingPlanes = cutOn && game.cutHeightOn ? [heightPlane] : [];
		invalidate();
	});
	$effect(() => {
		if (cutOn) clipTask.start();
		else {
			clipTask.stop();
			if (clipRoot) applyClipping(clipRoot, null, false);
			invalidate();
		}
	});
	// live camera azimuth → follow-camera cut
	$effect(() => {
		const d = Math.round(((rig.az * 180) / Math.PI) * 2) / 2;
		untrack(() => (game.camAzDeg = ((d % 360) + 360) % 360));
	});

	// ---- what to draw ----
	const allDecks = $derived(game.mode === 'walk' || game.section || game.exportAll || interior);
	/** habitat elevation: the ship shell draws the walls */
	const shellView = $derived(habitat && (game.section || game.exportAll) && !interior);
	const topDeck = $derived(game.decks.length - 1);
	/** interior nose dome above the top deck (ogive) and aft bulkhead dome below deck 1 */
	const noseDome = $derived.by(() => {
		if (!interior) return null;
		const y0 = habitat ? game.floorY[topDeck] + game.decks[topDeck].height : game.stackTop;
		if (habitat) {
			const tip = game.ship.tip;
			const h = Math.max(0.5, tip - y0);
			return { y: y0, geo: domeGeometry(0, h, (t) => Math.max(0.02, hullRadiusAt(game.ship, y0 + t * h) - 0.012)) };
		}
		return { y: y0, geo: domeGeometry(HULL_INNER_RADIUS - 0.012, 3.2, (t) => (HULL_INNER_RADIUS - 0.012) * Math.pow(Math.max(0, 1 - t), 0.55)) };
	});
	const aftDome = $derived(interior ? domeGeometry((game.floorRadius[0] ?? HULL_INNER_RADIUS) - 0.012, 1.4, undefined, true) : null);
	$effect(() => {
		const a = noseDome?.geo,
			b = aftDome;
		return () => {
			a?.dispose();
			b?.dispose();
		};
	});
	(window as unknown as { __sceneCount: unknown }).__sceneCount = (name: string) => {
		let n = 0;
		scene.traverse((o) => {
			if (o.name === name && o.visible) n++;
		});
		return n;
	};
	$effect(() => {
		(window as unknown as { __renderInfo: unknown }).__renderInfo = () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, interior, clippedMaterials: (() => { let n = renderer.clippingPlanes.length; scene.traverse((o) => { const m = (o as { material?: { clippingPlanes?: unknown[] | null } }).material; if (m && !Array.isArray(m) && m.clippingPlanes?.length) n++; }); return n; })(), lights: (() => { let n = 0; scene.traverse((o) => { if ((o as { isLight?: boolean }).isLight && o.visible) n++; }); return n; })() });
	});
	function deckView(k: number) {
		const d = game.decks[k];
		if (allDecks) return { show: true, visible: d.height, full: true, modules: true, dim: false };
		if (k > game.current) return { show: false, visible: 0, full: false, modules: false, dim: false };
		if (k === game.current) return { show: true, visible: Math.min(CUTAWAY_HEIGHT, d.height), full: false, modules: true, dim: false };
		return { show: true, visible: d.height, full: false, modules: false, dim: true };
	}

	// ---- cameras ----
	const mouseButtons = $derived({
		LEFT: game.tool === 'camera' ? MOUSE.ROTATE : (null as unknown as MOUSE),
		MIDDLE: MOUSE.ROTATE,
		RIGHT: game.tool === 'camera' ? MOUSE.PAN : (null as unknown as MOUSE)
	});
	const touches = $derived({
		ONE: game.tool === 'camera' ? TOUCH.ROTATE : (null as unknown as TOUCH),
		TWO: game.twoFingerMode === 'rotate' ? TOUCH.DOLLY_ROTATE : TOUCH.DOLLY_PAN
	});
	const view = $derived.by(() => {
		if (game.section && habitat) {
			const cy = game.ship.tip / 2 - 1;
			const dist = portrait ? 118 : 74;
			return { target: [0, cy, 0] as [number, number, number], pos: [dist * 0.42, cy + 9, dist * 0.9] as [number, number, number] };
		}
		if (game.section) {
			const cy = game.stackTop / 2;
			const dist = portrait ? 24 : 15;
			return { target: [0, cy, 0] as [number, number, number], pos: [dist * 0.35, cy + 2.5, dist] as [number, number, number] };
		}
		const y = game.floorY[game.current] ?? 0;
		return {
			target: [0, y, 0] as [number, number, number],
			pos: (portrait ? [0, y + 14, 10.5] : [0, y + 8.5, 7.2]) as [number, number, number]
		};
	});
	// the camera is rebuilt only for section/portrait changes; switching decks keeps the view
	// angle and smoothly moves the orbit target to the selected deck's height
	const camKey = $derived(`${game.section}|${portrait}|${game.mode}|${game.shipMode}`);
	const limits = $derived.by((): RigLimits => {
		if (!game.section) return { ...PLAN_LIMITS, distMax: habitat ? 60 : PLAN_LIMITS.distMax };
		const top = habitat ? game.ship.tip : game.stackTop;
		return { polarMin: 0.03, polarMax: Math.PI - 0.03, distMin: 3, distMax: habitat ? 220 : 60, panR: habitat ? 40 : 8, panY: [-4, top + 4] };
	});
	let controls = $state<OrbitControlsImpl>();
	$effect(() => {
		const c = controls;
		if (!c) return;
		return untrack(() => rig.attach(c, view.target, view.pos, limits));
	});
	$effect(() => {
		const t = view.target;
		if (!game.section) untrack(() => rig.followY(t[1]));
	});
	const lightY = $derived(shellView ? 30 : (game.floorY[game.current] ?? 0));
	const bg = $derived(habitat && game.hab.location === 'mars' ? '#2a1c16' : '#05070b');

	// ---- GLB export of the whole ship (all decks, no overlays) ----
	let ship = $state<Group>();
	game.exportGLB = async () => {
		const prev = { all: game.exportAll };
		game.exportAll = true;
		await tick();
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		try {
			const exporter = new GLTFExporter();
			const glb = (await exporter.parseAsync(ship!, { binary: true })) as ArrayBuffer;
			download('starship-interior.glb', glb, 'model/gltf-binary');
			return glb.byteLength;
		} finally {
			game.exportAll = prev.all;
		}
	};
</script>

{#key bg}
	<T.Color attach="background" args={[bg]} />
{/key}
{#if !(habitat && game.hab.location === 'mars')}
	<Stars radius={habitat ? 160 : 80} depth={40} count={1500} factor={3} fade speed={0.3} />
{/if}

<T.AmbientLight intensity={interior ? 0.22 : 0.15} />
<T.HemisphereLight args={[interior ? (game.interiorTone === 'warm' ? '#fff1de' : '#e8f1ff') : '#dfe9ff', interior ? '#4a4540' : '#2a2622', interior ? 0.55 : 0.45]} />
<T.DirectionalLight
	position={[5, lightY + 12, 4]}
	intensity={interior ? 0.35 : 2.2}
	color="#fff6ea"
	castShadow={game.quality === 'high'}
	shadow.mapSize={[2048, 2048]}
	shadow.bias={-0.0004}
	shadow.normalBias={0.02}
	shadow.camera.left={-6}
	shadow.camera.right={6}
	shadow.camera.top={6}
	shadow.camera.bottom={-6}
	shadow.camera.near={1}
	shadow.camera.far={40}
	shadow.radius={4}
/>

<T.Group name="Clipped" bind:ref={clipRoot}>
<T.Group name="Starship" bind:ref={ship}>
	{#each game.decks as d, k (d.id)}
		{@const v = deckView(k)}
		{#if v.show}
			<T.Group position.y={game.floorY[k]} name={`Deck ${k + 1}`}>
				<Hull
					index={k}
					height={d.height}
					visible={v.visible}
					full={v.full}
					dim={v.dim}
					lights={v.full && !game.exportAll}
					{interior}
					holes={game.shafts.filter((sh) => sh.to === k).map((sh) => [sh.x, sh.z] as [number, number])}
					airlock={k === game.airlockDeck}
					rFloor={game.floorRadius[k]}
					rTop={habitat ? hullRadiusAt(game.ship, game.floorY[k] + v.visible) : undefined}
					floorOnly={shellView}
				/>
				{#if interior}
					<Interior
						index={k}
						height={d.height}
						rFloor={game.floorRadius[k]}
						rTop={habitat ? hullRadiusAt(game.ship, game.floorY[k] + d.height) : HULL_INNER_RADIUS}
						airlock={k === game.airlockDeck}
						holesAbove={game.shafts.filter((sh) => sh.from === k).map((sh) => [sh.x, sh.z] as [number, number])}
						ceiling={k < topDeck}
						near={Math.abs(k - viewDeck) <= 1}
						lights={lowPerf ? (k === viewDeck ? 1 : 0) : Math.abs(k - viewDeck) <= 1 ? 2 : 0}
						shadows={!lowPerf && game.quality === 'high' && k === viewDeck}
						tone={game.interiorTone}
						{outside}
					/>
				{/if}
				{#if v.modules}
					<DeckModules deck={d} hideUid={k === game.current && game.drag?.moved ? game.drag.uid : null} />
				{/if}
			</T.Group>
		{/if}
	{/each}
	<!-- ladder connections (deck N ladder → deck N+1 hatch opening) -->
	{#each game.shafts as sh (sh.uid)}
		{#if sh.uid !== (game.drag?.moved ? game.drag.uid : -1) && (allDecks || sh.from === game.current || sh.to === game.current)}
			<T.Group name={`Ladder ${game.shaftLabel(sh)}`}>
				<ShaftMesh
					x={sh.x}
					z={sh.z}
					angle={sh.angle}
					from={sh.from}
					maxY={allDecks ? Infinity : game.floorY[game.current] + game.deck.height}
				/>
			</T.Group>
		{/if}
	{/each}
	{#if shellView}
		<ShipView cutDeg={game.cutDeg} labels={!game.exportAll} />
	{/if}
	{#if noseDome}
		<T.Mesh position.y={noseDome.y} geometry={noseDome.geo} material={domeMat()} name="Nose dome (interior)" />
	{/if}
	{#if aftDome}
		<T.Mesh position.y={(game.floorY[0] ?? 0) - SLAB_THICKNESS} geometry={aftDome} material={domeMat()} name="Aft bulkhead (interior)" />
	{/if}
	{#if allDecks && !habitat && !interior}
		<!-- roof slab -->
		<T.Mesh position.y={game.stackTop + 0.125} name="Roof">
			<T.CylinderGeometry args={[4.5, 4.5, 0.25, 96]} />
			<T.MeshStandardMaterial color="#8d939b" metalness={0.6} roughness={0.45} />
		</T.Mesh>
	{/if}
</T.Group>
{#if habitat && !game.exportAll}
	<Terrain />
{/if}
{#if crew.enabled && !game.exportAll}
	<CrewLayer deckVisible={(k) => allDecks || k === game.current} />
	{#if crew.showNav}
		<NavOverlay />
	{/if}
	{#if crew.badges}
		<OccupancyBadges deckVisible={(k) => (crew.possessed !== null ? k === (crew.ui.agents[crew.possessed]?.deck ?? game.current) : k === game.current)} />
	{/if}
{/if}
{#if interior && !lowPerf}
	<!-- outside light (Sun on the Moon / Mars, starlight in cruise) through the +X portholes of the viewer's deck -->
	<T.SpotLight
		position={[6.5, (game.floorY[viewDeck] ?? 0) + 1.6, 0]}
		intensity={outside.li}
		distance={14}
		angle={0.55}
		penumbra={0.8}
		decay={1.2}
		color={outside.light}
		oncreate={(l) => {
			l.target.position.set(0, (game.floorY[viewDeck] ?? 0) + 0.4, 0);
			l.target.updateMatrixWorld();
		}}
	/>
{/if}
{#if game.mode === 'build' && !game.exportAll && !interior}
	<T.Group position.y={game.floorY[game.current]}>
		<Overlays />
		<GroupLinks />
		<ClearanceOverlay />
	</T.Group>
{/if}
</T.Group>
{#if cutOn}
	<CutCaps faces={cut.faces} />
{/if}

{#if game.microG && !game.exportAll}
	<Dust />
{/if}
{#if !game.exportAll}
	<LadderHint />
{/if}
{#if game.mode === 'build' && crew.possessed !== null}
	<PossessControls />
{:else if game.mode === 'build' && game.microG && game.freeCam}
	<TrackballCam pos={view.pos} target={[view.target[0], view.target[1] + 1.2, view.target[2]]} />
	<BuildInput />
{:else if game.mode === 'build'}
	{#key camKey}
		<T.PerspectiveCamera makeDefault position={untrack(() => view.pos)} fov={45} near={0.05} far={400}>
			<OrbitControls
				bind:ref={controls}
				enableDamping
				dampingFactor={0.12}
				{mouseButtons}
				{touches}
			/>
		</T.PerspectiveCamera>
	{/key}
	<BuildInput />
{:else}
	<WalkControls />
{/if}
