<script lang="ts">
  import { onMount } from 'svelte';
  import { mountCharacterStage, type CharacterSnapshot, type CharacterStage } from '../lib/characterStage';
  import type { ShowcaseAsset } from '../lib/showcaseAssets';
  import { t } from '../lib/i18n/core';

  let { asset }: { asset: ShowcaseAsset } = $props();
  let canvas = $state<HTMLCanvasElement>();
  let stage: CharacterStage | null = null;
  let snap = $state<CharacterSnapshot>({ status: 'loading', clip: '', playing: true, loop: true, seat: false });
  const clips = $derived(asset.character?.clips ?? []);

  onMount(() => {
    if (!canvas || !asset.character) return;
    stage = mountCharacterStage(canvas, asset, (next) => (snap = next));
    return () => {
      stage?.dispose();
      stage = null;
    };
  });
</script>

<div class="character">
  <div class="frame">
    <canvas bind:this={canvas} aria-label={t('game.character.view')} data-character-canvas></canvas>
    {#if snap.status !== 'ready'}
      <p class="status" data-character-status={snap.status}>
        {snap.status === 'error' ? t('game.character.error') : t('game.character.loading')}
      </p>
    {/if}
  </div>
  <p class="hint">{t('game.character.orbitHint')}</p>

  <label class="sofa">
    <input
      type="checkbox"
      checked={snap.seat}
      disabled={snap.status !== 'ready'}
      data-character-seat
      onchange={(event) => stage?.setSeat(event.currentTarget.checked)}
    />
    <span>{t('game.character.sofa')}</span>
  </label>

  <h3>{t('game.character.animation')}</h3>
  <div class="clips" role="radiogroup" aria-label={t('game.character.animation')}>
    {#each clips as clip (clip.id)}
      <button
        type="button"
        role="radio"
        aria-checked={snap.clip === clip.clip}
        class:on={snap.clip === clip.clip}
        disabled={snap.status !== 'ready'}
        data-clip={clip.clip}
        onclick={() => stage?.play(clip.clip)}>{clip.label}</button
      >
    {/each}
  </div>

  <div class="transport">
    <button
      type="button"
      disabled={snap.status !== 'ready'}
      data-character-play
      aria-pressed={!snap.playing}
      onclick={() => stage?.setPlaying(!snap.playing)}
      >{snap.playing ? `❚❚ ${t('game.character.pause')}` : `▶ ${t('game.character.play')}`}</button
    >
    <label class="loop">
      <input
        type="checkbox"
        checked={snap.loop}
        data-character-loop
        onchange={(event) => stage?.setLoop(event.currentTarget.checked)}
      />
      <span>{t('game.character.loop')}</span>
    </label>
  </div>
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    max-height: 68vh;
    min-height: 280px;
    border-radius: 12px;
    overflow: hidden;
    background: #f3dcc0;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .status {
    position: absolute;
    inset: auto 0 12px;
    margin: 0;
    text-align: center;
    color: #5a3a20;
    font-size: 15px;
  }
  .hint { margin: 8px 0 12px; font-size: 14px; color: #c5d7e6; }
  h3 { margin: 14px 0 8px; font-size: 16px; }
  .clips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
  }
  button {
    min-height: 44px;
    border-radius: 10px;
    border: 2px solid #3a5a74;
    background: #10202e;
    color: #eaf6ff;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    padding: 0 10px;
  }
  button.on {
    background: #8fdfff;
    border-color: #8fdfff;
    color: #082030;
  }
  button:disabled { opacity: 0.5; }
  .transport {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 12px 0 0;
  }
  .transport button { min-width: 120px; }
  label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    font-size: 15px;
    font-weight: 700;
  }
  input[type='checkbox'] { width: 22px; height: 22px; accent-color: #8fdfff; }
  .sofa {
    padding: 0 14px;
    border-radius: 10px;
    background: #10202e;
    border: 2px solid #3a5a74;
  }
</style>
