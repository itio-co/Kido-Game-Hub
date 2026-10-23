<script lang="ts">
	/** Floating designer toolbar for sub-object editing: Object / Vertex / Edge / Face + operations, multi/box select, snap, undo. */
	import { equip } from '$lib/game/equipStore.svelte';
	import { game } from '$lib/game/state.svelte';
	let { mobile = false }: { mobile?: boolean } = $props();
	const part = $derived(equip.part);
	const show = $derived(equip.editable && !!part && part.shape !== 'glb');
	const MODES = [
		{ id: 'object', icon: '⬛', label: 'Object', key: '1' },
		{ id: 'vertex', icon: '•', label: 'Vertex', key: '2' },
		{ id: 'edge', icon: '╱', label: 'Edge', key: '3' },
		{ id: 'face', icon: '◼', label: 'Face', key: '4' }
	] as const;
	const run = (n: Parameters<typeof equip.op>[0]) => game.flash(equip.op(n));
	const cm = $derived(equip.editMode !== 'object');
	const canUndo = $derived((void equip.undoN, equip.history.canUndo));
	const canRedo = $derived((void equip.undoN, equip.history.canRedo));
</script>

{#if show}
	<div class="etb glass" class:mobile data-testid="edit-toolbar">
		<div class="seg">
			{#each MODES as m (m.id)}
				<button class:active={equip.editMode === m.id} onclick={() => equip.setEditMode(m.id)} title="{m.label} mode ({m.key}; Tab toggles edit mode)" aria-label="{m.label} mode" data-testid="edit-mode-{m.id}">
					<span class="i">{m.icon}</span>{#if !mobile}<small>{m.label}</small>{/if}
				</button>
			{/each}
		</div>
		{#if cm}
			<div class="seg">
				{#if equip.editMode === 'face'}
					<button onclick={() => run('extrude')} title="Extrude faces (E)" aria-label="Extrude" data-testid="op-extrude">⇡{#if !mobile}<small>Extrude</small>{/if}</button>
					<button onclick={() => run('inset')} title="Inset faces (I)" aria-label="Inset" data-testid="op-inset">⧈{#if !mobile}<small>Inset</small>{/if}</button>
					<button onclick={() => run('flip')} title="Flip normals of the selected faces (N)" aria-label="Flip normals" data-testid="op-flip">⇅{#if !mobile}<small>Flip</small>{/if}</button>
				{/if}
				{#if equip.editMode === 'edge'}
					<button onclick={() => run('bevel')} title="Bevel / chamfer edges 2 cm (B)" aria-label="Bevel" data-testid="op-bevel">◩{#if !mobile}<small>Bevel</small>{/if}</button>
				{/if}
				<button onclick={() => run('merge')} title="Merge selected vertices at their centre (M)" aria-label="Merge" data-testid="op-merge">⊕{#if !mobile}<small>Merge</small>{/if}</button>
				<button onclick={() => run('delete')} title="Delete selection (X / Del)" aria-label="Delete components" data-testid="op-delete">✕{#if !mobile}<small>Delete</small>{/if}</button>
				<button onclick={() => run('all')} title="Select all / none (A)" aria-label="Select all" data-testid="op-all">▣{#if !mobile}<small>All</small>{/if}</button>
			</div>
			<div class="seg">
				<button onclick={() => run('recalc')} title="Recalculate normals outside (Shift+N)" aria-label="Recalculate normals" data-testid="op-recalc">⟳{#if !mobile}<small>Normals</small>{/if}</button>
				<button class:active={!!equip.workMesh?.sm} onclick={() => run('shade')} title="Flat / smooth shading" aria-label="Smooth shading" data-testid="op-shade">◐{#if !mobile}<small>{equip.workMesh?.sm ? 'Smooth' : 'Flat'}</small>{/if}</button>
			</div>
			<div class="seg">
				<button class:active={equip.multi} onclick={() => (equip.multi = !equip.multi)} title="Multi-select: taps / clicks add or remove (same as Shift)" aria-label="Multi-select" data-testid="edit-multi">＋{#if !mobile}<small>Multi</small>{/if}</button>
				<button class:active={equip.boxSelect} onclick={() => (equip.boxSelect = !equip.boxSelect)} title="Box select with a plain drag (Shift+drag always works on desktop); orbit with right-drag / two fingers" aria-label="Box select" data-testid="edit-box">⬚{#if !mobile}<small>Box</small>{/if}</button>
				<button onclick={() => (equip.snap = equip.snap === 0.01 ? 0.05 : 0.01)} title="Gizmo / nudge snap" aria-label="Snap step" data-testid="edit-snap">{equip.snap === 0.01 ? '1' : '5'} cm</button>
				<span class="n" data-testid="edit-count">{equip.selCount}</span>
			</div>
		{/if}
		<div class="seg">
			<button disabled={!canUndo} onclick={() => equip.undo()} title="Undo (Ctrl+Z)" aria-label="Undo" data-testid="edit-undo">↶</button>
			<button disabled={!canRedo} onclick={() => equip.redo()} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" data-testid="edit-redo">↷</button>
		</div>
	</div>
{/if}

<style>
	.etb {
		position: absolute;
		top: calc(10px + env(safe-area-inset-top));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 6px;
		padding: 5px;
		z-index: 14;
		max-width: calc(100% - 150px);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.etb.mobile {
		left: 8px;
		right: 8px;
		transform: none;
		max-width: none;
		top: calc(56px + env(safe-area-inset-top));
		flex-wrap: wrap;
		gap: 4px;
	}
	.seg {
		display: flex;
		gap: 3px;
		align-items: center;
		padding-right: 6px;
		border-right: 1px solid rgba(120, 200, 255, 0.18);
	}
	.seg:last-child {
		border-right: 0;
		padding-right: 0;
	}
	button {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1px;
		min-width: 40px;
		min-height: 38px;
		font: 600 14px/1 system-ui, sans-serif;
		color: #dbeafe;
		background: rgba(120, 200, 255, 0.07);
		border: 1px solid rgba(120, 200, 255, 0.22);
		border-radius: 9px;
		cursor: pointer;
		touch-action: manipulation;
	}
	.mobile button {
		min-width: 40px;
		min-height: 40px;
		font-size: 16px;
	}
	button small {
		font-size: 9.5px;
		font-weight: 500;
		opacity: 0.8;
	}
	button.active {
		color: #1a0d00;
		background: linear-gradient(180deg, #ffc27a, #ff9a3c);
		border-color: #ffd7a8;
	}
	button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.i {
		font-size: 15px;
	}
	.n {
		min-width: 22px;
		text-align: center;
		font: 700 12px system-ui;
		color: #ffb35c;
	}
</style>
