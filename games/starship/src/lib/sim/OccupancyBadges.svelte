<script lang="ts">
	/** Floating occupancy badges: "n/cap" (green free · amber partly used · red full) + queue, chair dots, condition bar. */
	import { HTML } from '@threlte/extras';
	import { onDestroy } from 'svelte';
	import { CATALOG_BY_ID } from '$lib/game/catalog';
	import { dimsOf } from '$lib/game/geometry';
	import { game } from '$lib/game/state.svelte';
	import { crew } from './crewSim.svelte';
	interface Props {
		deckVisible: (k: number) => boolean;
	}
	let { deckVisible }: Props = $props();
	type Occ = ReturnType<typeof crew.occupancy>[number];
	let occ = $state<Occ[]>([]);
	const tick = () => (occ = crew.occupancy());
	tick();
	const t = setInterval(tick, 300);
	onDestroy(() => clearInterval(t));
	const pos = (o: Occ): [number, number, number] | null => {
		const m = game.decks[o.deck]?.modules.find((mm) => mm.uid === o.uid);
		if (!m) return null;
		const def = CATALOG_BY_ID[m.type];
		return [m.x, (game.floorY[o.deck] ?? 0) + (m.y ?? 0) + Math.min(dimsOf(def).height, game.decks[o.deck].height - 0.35) + 0.22, m.z];
	};
	const seatPos = (deck: number, uid: number): [number, number, number] | null => {
		const m = game.decks[deck]?.modules.find((mm) => mm.uid === uid);
		return m ? [m.x, (game.floorY[deck] ?? 0) + 1.0, m.z] : null;
	};
	const col = (o: Occ) => (o.power ? '#6b7280' : o.state === 'Broken' ? '#dc2626' : o.cap === 0 ? '#ef4444' : o.n >= o.cap ? '#ef4444' : o.n > 0 ? '#f59e0b' : '#22c55e');
	const condCol = (c: number) => (c > 60 ? '#22c55e' : c > 35 ? '#f59e0b' : c > 0 ? '#ef4444' : '#6b7280');
</script>

{#each occ as o (o.key)}
	{#if deckVisible(o.deck)}
		{@const p = pos(o)}
		{#if p}
			<HTML position={p} center pointerEvents="none" zIndexRange={[6, 0]}>
				<div class="occ" data-occ={o.key} data-power={o.power} data-state={o.state} data-cond={o.cond} data-door={o.door} style="--c:{col(o)}">
					<span class="n">{o.state === 'Broken' ? '✖ broken' : o.door === 'occupied' ? '🔒 occupied' : `${o.n}/${o.cap}`}</span>{#if o.q}<span class="q">+{o.q}⏳</span>{/if}{#if o.state === 'Needs maintenance'}<span class="q">🔧</span>{/if}{#if o.power}<span class="q pw" title={o.power === 'shed' ? 'Unavailable (no power)' : 'Brownout: cannot start'}>{o.power === 'shed' ? '🔌✖' : '⚡✖'}</span>{/if}
					{#if o.cond !== undefined}<span class="bar" title="condition"><i style="width:{Math.max(4, o.cond)}%;background:{condCol(o.cond)}"></i></span>{/if}
				</div>
			</HTML>
			{#each o.seats as s (s.uid)}
				{@const sp = seatPos(o.deck, s.uid)}
				{#if sp}
					<HTML position={sp} center pointerEvents="none" zIndexRange={[6, 0]}>
						<div class="dot" style="background:{s.occ ? '#ef4444' : '#22c55e'}"></div>
					</HTML>
				{/if}
			{/each}
		{/if}
	{/if}
{/each}

<style>
	.occ {
		display: flex;
		align-items: center;
		gap: 3px;
		font: 600 10px/1.1 system-ui, sans-serif;
		color: #e6f2ff;
		background: rgba(8, 14, 24, 0.72);
		border: 1px solid var(--c);
		box-shadow: 0 0 6px color-mix(in srgb, var(--c) 55%, transparent);
		padding: 1px 5px;
		border-radius: 8px;
		white-space: nowrap;
	}
	.n {
		color: var(--c);
	}
	.q {
		color: #fbbf24;
	}
	.bar {
		width: 22px;
		height: 4px;
		background: rgba(255, 255, 255, 0.15);
		border-radius: 2px;
		overflow: hidden;
		display: inline-block;
	}
	.bar i {
		display: block;
		height: 100%;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 1px solid rgba(0, 0, 0, 0.6);
	}
</style>
