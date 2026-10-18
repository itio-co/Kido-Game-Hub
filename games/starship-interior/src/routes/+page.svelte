<script lang="ts">
	import { Canvas } from '@threlte/core';
	import CameraWidget from '$lib/components/CameraWidget.svelte';
	import { rig } from '$lib/three/cameraRig.svelte';
	import { ACESFilmicToneMapping, PCFShadowMap } from 'three';
	import { onMount } from 'svelte';
	import { game } from '$lib/game/state.svelte';
	import { DISCLAIMER } from '$lib/game/specs';
	import type { Tool } from '$lib/game/types';
	import Scene from '$lib/components/Scene.svelte';
	import DesignerScene from '$lib/components/DesignerScene.svelte';
	import DesignerPanel from '$lib/components/DesignerPanel.svelte';
	import { equip } from '$lib/game/equipStore.svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import StatsPanel from '$lib/components/StatsPanel.svelte';
	import Joystick from '$lib/components/Joystick.svelte';
	import AgentCard from '$lib/sim/AgentCard.svelte';
	import CrewSimPanel from '$lib/sim/CrewSimPanel.svelte';
	import { crew, fmtClock } from '$lib/sim/crewSim.svelte';

	let innerWidth = $state(1280);
	let innerHeight = $state(800);
	const mobile = $derived(innerWidth < 760);
	const portrait = $derived(innerHeight > innerWidth);

	onMount(() => {
		game.isTouch = window.matchMedia('(pointer: coarse)').matches;
		if (game.isTouch) game.quality = 'low'; // phones start in Low quality (toggle in View & checks)
		game.loadLocal(true);
		window.__game = game;
		(window as unknown as { __crew: typeof crew }).__crew = crew;
		(window as unknown as { __rig: typeof rig }).__rig = rig;
		(window as unknown as { __equip: typeof equip }).__equip = equip;
		window.__exports = {
			svg: (k: number, phase?: 'surface' | 'launch') => game.planSVG(k, phase),
			csv: () => game.bom(),
			elevation: () => game.elevation()
		};
	});

	const toolKeys: Record<string, Tool> = { Digit1: 'select', Digit2: 'module', Digit3: 'measure', Digit4: 'camera' };

	function onKeyUp(e: KeyboardEvent) {
		if (e.key === 'Alt') game.altHeld = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Alt') {
			game.altHeld = true;
			e.preventDefault();
		}
		const t = e.target as HTMLElement;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
		if (game.designer) return; // designer has its own keys (DesignerPanel)
		if (crew.possessed !== null) return; // PossessControls owns the keyboard
		if (e.code === 'KeyF') return toggleMode();
		if (game.mode !== 'build') return;
		const fine = e.shiftKey && !game.snap ? 1 : 15;
		if (e.code === 'KeyR') game.rotate(90);
		else if (e.code === 'KeyQ') game.rotate(-fine);
		else if (e.code === 'KeyE') game.rotate(fine);
		else if (e.code === 'KeyG') game.snap = !game.snap;
		else if (e.code === 'Delete' || e.code === 'Backspace') game.deleteSelected();
		else if (e.code === 'PageUp') game.selectDeck(game.current + 1);
		else if (e.code === 'PageDown') game.selectDeck(game.current - 1);
		else if (e.code === 'ArrowLeft') rig.orbitStep(-Math.PI / 12);
		else if (e.code === 'ArrowRight') rig.orbitStep(Math.PI / 12);
		else if (e.code === 'ArrowUp') rig.pitchStep(-0.1);
		else if (e.code === 'ArrowDown') rig.pitchStep(0.1);
		else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') rig.zoom(0.85);
		else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') rig.zoom(1 / 0.85);
		else if (e.code === 'Escape') {
			game.pending = null;
			game.selectedUid = null;
			game.measureA = game.measureB = null;
		} else if (toolKeys[e.code]) {
			game.tool = toolKeys[e.code];
			game.pending = null;
		}
	}

	function toggleMode() {
		game.pending = null;
		game.hover = null;
		game.drag = null;
		game.joystick = { x: 0, y: 0 };
		if (crew.possessed !== null) crew.possess(null);
		game.mode = game.mode === 'build' ? 'walk' : 'build';
	}
	let crewSheet = $state(false);
	const possessed = $derived(crew.possessed !== null && game.mode === 'build');
	function confirmPending() {
		if (game.pending && game.placeAt(game.pending)) game.pending = null;
	}
	const showRotate = $derived(game.tool === 'module' || (game.tool === 'select' && game.selectedUid !== null));
</script>

<svelte:window bind:innerWidth bind:innerHeight onkeydown={onKey} onkeyup={onKeyUp} onblur={() => (game.altHeld = false)} />

<div class="app" class:mobile>
	{#if !mobile}
		{#if game.designer}<DesignerPanel />{:else}<Sidebar />{/if}
	{/if}

	<main class="viewport">
		<div class="canvas-wrap">
			{#key game.designer}
				<Canvas dpr={Math.min(window.devicePixelRatio, 2)} shadows={PCFShadowMap} toneMapping={ACESFilmicToneMapping}>
					{#if game.designer}<DesignerScene />{:else}<Scene {portrait} />{/if}
				</Canvas>
			{/key}
		</div>
	{#if game.designer}
		<div class="top-right">
			<button class="fab" onclick={() => (game.designer = false)}>◀ Planner</button>
		</div>
		{#if game.isTouch}<div class="tip" class:mobile>Tap a part to select · drag gizmo · 1 finger orbit · pinch zoom</div>{/if}
		{#if game.toast}<div class="toast">{game.toast}</div>{/if}
		{#if mobile}<DesignerPanel mobile />{/if}
	{:else}

		<div class="top-left">
			{#if mobile}<StatsPanel compact />{/if}
			{#if game.mode === 'build'}
				<div class="pills">
					{#each game.decks as d, k (d.id)}
						<button class:active={k === game.current} onclick={() => game.selectDeck(k)}>{game.shipMode === 'habitat' ? game.deckLabel(k) : `D${k + 1}`}</button>
					{/each}
					<button onclick={() => game.addDeck()} aria-label="Add deck">＋</button>
					<button class:active={game.section} onclick={() => (game.section = !game.section)} aria-label="Section view">✂</button>
				</div>
			{:else}
				<div class="pills"><span class="deckname">{game.deckLabel(game.walkDeck)}</span></div>
			{/if}
		</div>

		<div class="top-right">
			<button class="fab" onclick={toggleMode}>{game.mode === 'build' ? '🚶 Walk' : '🛠 Build'}</button>
			{#if game.mode === 'build'}<button class="fab" onclick={() => (game.designer = true)} aria-label="Equipment designer">📐{mobile ? '' : ' Design'}</button>{/if}
			{#if game.mode === 'build'}
				<CameraWidget compact={mobile} />
			{/if}
		</div>

		{#if crew.enabled && !game.designer}
			<div class="simclock" class:mobile>
				<button onclick={() => (crew.running = !crew.running)} aria-label={crew.running ? 'Pause sim' : 'Play sim'}>{crew.running ? '⏸' : '▶'}</button>
				<b>{fmtClock(crew.ui.clock)}</b>
				<button onclick={() => (crew.speed = crew.speed === 60 ? 1 : crew.speed === 1 ? 4 : crew.speed === 4 ? 16 : 60)} aria-label="Sim speed">{crew.speed}×</button>
			</div>
		{/if}
		{#if game.mode === 'build' && crew.enabled}<AgentCard {mobile} />{/if}
		{#if mobile && game.mode === 'build' && !possessed}
			<button class="fab crewfab" class:on={crewSheet} onclick={() => (crewSheet = !crewSheet)} aria-label="Crew sim">👥</button>
			{#if crewSheet}
				<div class="crewsheet">
					<div class="sheethead"><b>👥 Crew simulation</b><button class="fab" onclick={() => (crewSheet = false)} aria-label="Close crew sheet">✕</button></div>
					<CrewSimPanel />
				</div>
			{/if}
		{/if}
		{#if possessed}
			{#if crew.ui.prompt}<div class="prompt" class:mobile>{crew.ui.prompt}</div>{/if}
			<div class="possess-actions" class:mobile>
				<button class="fab ok" onclick={() => crew.interact(false)} aria-label="Use / climb up">E {game.isTouch ? 'Use ⬆' : 'Use / ⬆'}</button>
				<button class="fab" onclick={() => crew.interact(true)} aria-label="Climb down">⬇</button>
				<button class="fab" onclick={() => (crew.firstPerson = !crew.firstPerson)} aria-label="Camera view">{crew.firstPerson ? '3rd' : '1st'}</button>
				<button class="fab del" onclick={() => crew.possess(null)} aria-label="Release">⏏ Release</button>
			</div>
			{#if game.isTouch}
				<Joystick />
				<div class="tip walk">Joystick: move · drag: look</div>
			{:else}
				<div class="center-hint low">WASD move · Shift run · drag look · wheel zoom · E use / climb up · Q down · V 1st/3rd person · Esc release</div>
			{/if}
		{:else if game.mode === 'build'}
			<div class="build-actions" class:mobile>
				{#if game.tool === 'module' && game.pending}
					<button class="fab ok" onclick={confirmPending} aria-label="Place">✓ Place</button>
					<button class="fab" onclick={() => (game.pending = null)} aria-label="Cancel">✕</button>
				{/if}
				{#if game.tool === 'select' && game.selectedUid !== null}
					<button class="fab del" onclick={() => game.deleteSelected()} aria-label="Delete">🗑</button>
				{/if}
				{#if game.tool === 'module' && game.selectedModule === 'hatch'}
					<button class="fab" class:on={game.alignShafts} onclick={() => (game.alignShafts = !game.alignShafts)} aria-label="Align snap">
						⇅ <small>Align {game.alignShafts ? 'on' : 'off'}</small>
					</button>
				{/if}
				{#if showRotate}
					<button class="fab" onclick={() => game.rotate(-15)} aria-label="Rotate left">⟲</button>
					<button class="fab" onclick={() => game.rotate(15)} aria-label="Rotate">⟳ <small>15°</small></button>
					<button class="fab" onclick={() => game.rotate(90)} aria-label="Rotate 90">90°</button>
				{/if}
			</div>
			{#if game.isTouch && !game.pending}
				<div class="tip" class:mobile>
					{#if game.tool === 'module'}Tap to preview · tap again or ✓ to place · 2 fingers: camera
					{:else if game.tool === 'select'}Tap to select · drag selected to move · 2 fingers: camera
					{:else if game.tool === 'measure'}Tap two points to measure
					{:else}1 finger orbit · pinch zoom{/if}
				</div>
			{/if}
		{:else}
			<div class="crosshair"></div>
			{#if game.isTouch}
				<Joystick />
				<div class="tip walk">Joystick: move · drag: look</div>
			{:else if !game.pointerLocked}
				<div class="center-hint">Click to look · WASD move · Shift run · E/Space up · Q/C down a hatch · F build</div>
			{/if}
			{#if game.hatchHere.up || game.hatchHere.down}
				<div class="travel">
					{#if game.hatchHere.up}<button class="fab" onclick={() => game.travel?.(1)}>⬆ Up</button>{/if}
					{#if game.hatchHere.down}<button class="fab" onclick={() => game.travel?.(-1)}>⬇ Down</button>{/if}
				</div>
			{/if}
		{/if}

		{#if game.toast}<div class="toast">{game.toast}</div>{/if}
		{#if !mobile}<div class="disclaimer">{DISCLAIMER}</div>{/if}

		{#if mobile && game.mode === 'build' && !possessed && !crewSheet}
			<Sidebar mobile />
		{/if}
	{/if}
	</main>
</div>

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #05070b;
		color: #d6e2f5;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		overflow: hidden;
		overscroll-behavior: none;
		-webkit-tap-highlight-color: transparent;
	}
	.app {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 320px 1fr;
	}
	.app.mobile {
		grid-template-columns: 1fr;
	}
	.viewport {
		position: relative;
		overflow: hidden;
		min-width: 0;
	}
	.canvas-wrap {
		position: absolute;
		inset: 0;
		z-index: 0;
		isolation: isolate; /* keep 3D HTML labels below the UI */
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.top-left {
		position: absolute;
		top: calc(12px + env(safe-area-inset-top));
		left: calc(12px + env(safe-area-inset-left));
		right: calc(140px + env(safe-area-inset-right));
		pointer-events: none;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
	}
	.top-left > :global(*) {
		pointer-events: auto;
	}
	.pills {
		display: flex;
		gap: 5px;
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.pills button,
	.deckname {
		flex-shrink: 0;
		white-space: nowrap;
		font: inherit;
		font-weight: 600;
		font-size: 13px;
		color: #e4f0ff;
		background: rgba(14, 22, 36, 0.88);
		border: 1px solid #2c4466;
		border-radius: 10px;
		min-width: 44px;
		min-height: 40px;
		padding: 0 10px;
		touch-action: manipulation;
		display: grid;
		place-items: center;
	}
	.pills button.active {
		border-color: #49a6ff;
		background: rgba(23, 64, 106, 0.95);
	}
	.top-right {
		position: absolute;
		top: calc(12px + env(safe-area-inset-top));
		right: calc(12px + env(safe-area-inset-right));
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
	}
	.fab {
		font: inherit;
		font-weight: 600;
		color: #e4f0ff;
		background: rgba(14, 22, 36, 0.9);
		border: 1px solid #2c4466;
		border-radius: 12px;
		min-height: 48px;
		min-width: 48px;
		padding: 0 14px;
		cursor: pointer;
		touch-action: manipulation;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
	}
	.simclock {
		position: absolute;
		top: calc(12px + env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		z-index: 11;
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(14, 22, 36, 0.9);
		border: 1px solid #2c4466;
		border-radius: 12px;
		padding: 3px 5px;
		font-variant-numeric: tabular-nums;
		font-size: 13px;
	}
	.simclock.mobile {
		top: calc(58px + env(safe-area-inset-top));
		left: auto;
		right: calc(70px + env(safe-area-inset-right));
		transform: none;
		font-size: 12px;
	}
	.simclock button {
		font: inherit;
		color: inherit;
		background: #131c2c;
		border: 1px solid #24344e;
		border-radius: 8px;
		min-width: 36px;
		min-height: 32px;
		touch-action: manipulation;
	}
	.crewfab {
		position: absolute;
		right: calc(12px + env(safe-area-inset-right));
		bottom: calc(130px + env(safe-area-inset-bottom));
		z-index: 11;
	}
	.crewfab.on {
		border-color: #49a6ff;
	}
	.crewsheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: 58%;
		overflow-y: auto;
		z-index: 13;
		background: rgba(9, 13, 22, 0.97);
		border-top: 1px solid #2c4466;
		border-radius: 14px 14px 0 0;
		padding: 10px 12px calc(14px + env(safe-area-inset-bottom));
		overscroll-behavior: contain;
	}
	.sheethead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}
	.sheethead .fab {
		min-height: 36px;
		min-width: 36px;
		padding: 0 8px;
	}
	.prompt {
		position: absolute;
		left: 50%;
		bottom: 140px;
		transform: translateX(-50%);
		z-index: 11;
		background: rgba(10, 18, 30, 0.9);
		border: 1px solid #49a6ff;
		border-radius: 10px;
		padding: 7px 14px;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
	}
	.prompt.mobile {
		bottom: calc(210px + env(safe-area-inset-bottom));
		font-size: 13px;
	}
	.possess-actions {
		position: absolute;
		right: calc(12px + env(safe-area-inset-right));
		bottom: calc(60px + env(safe-area-inset-bottom));
		z-index: 11;
		display: flex;
		gap: 8px;
	}
	.possess-actions.mobile {
		flex-direction: column;
		align-items: flex-end;
		bottom: calc(40px + env(safe-area-inset-bottom));
	}
	.center-hint.low {
		top: auto;
		bottom: 14px;
	}
	.fab small {
		font-size: 11px;
		opacity: 0.8;
	}
	.fab.ok {
		background: rgba(20, 110, 60, 0.95);
		border-color: #39ff88;
	}
	.fab.on {
		border-color: #3ce0ff;
		color: #bff4ff;
	}
	.fab.del {
		border-color: #ff3b4e;
	}
	.build-actions {
		position: absolute;
		right: 16px;
		bottom: 40px;
		display: flex;
		gap: 8px;
		z-index: 10;
	}
	.build-actions.mobile {
		bottom: calc(124px + env(safe-area-inset-bottom));
		right: calc(10px + env(safe-area-inset-right));
		left: 10px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	.build-actions.mobile .fab {
		min-height: 54px;
		min-width: 54px;
	}
	.tip {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		bottom: 44px;
		font-size: 12px;
		padding: 6px 12px;
		border-radius: 999px;
		background: rgba(10, 16, 28, 0.75);
		color: #9fb6d6;
		white-space: nowrap;
		pointer-events: none;
		z-index: 5;
	}
	.tip.mobile {
		bottom: calc(190px + env(safe-area-inset-bottom));
		font-size: 11px;
	}
	.tip.walk {
		bottom: auto;
		top: calc(110px + env(safe-area-inset-top));
	}
	.travel {
		position: absolute;
		right: calc(16px + env(safe-area-inset-right));
		bottom: calc(40px + env(safe-area-inset-bottom));
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 20;
	}
	.travel .fab {
		min-height: 60px;
		min-width: 90px;
	}
	.crosshair {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 10px;
		height: 10px;
		margin: -5px 0 0 -5px;
		border: 2px solid rgba(255, 255, 255, 0.7);
		border-radius: 50%;
		pointer-events: none;
	}
	.center-hint {
		position: absolute;
		left: 50%;
		top: 58%;
		transform: translateX(-50%);
		padding: 10px 16px;
		border-radius: 10px;
		background: rgba(10, 16, 28, 0.8);
		border: 1px solid #2c4466;
		pointer-events: none;
		font-size: 13px;
		white-space: nowrap;
	}
	.toast {
		position: absolute;
		left: 50%;
		top: calc(64px + env(safe-area-inset-top));
		transform: translateX(-50%);
		padding: 8px 16px;
		border-radius: 10px;
		background: rgba(18, 30, 50, 0.94);
		border: 1px solid #3a6aa0;
		z-index: 40;
		pointer-events: none;
		font-size: 14px;
		max-width: 90vw;
		text-align: center;
	}
	.disclaimer {
		position: absolute;
		left: 12px;
		bottom: 8px;
		font-size: 11px;
		color: rgba(224, 168, 90, 0.8);
		pointer-events: none;
	}
</style>
