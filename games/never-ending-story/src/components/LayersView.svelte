<script lang="ts">
  import { onMount } from 'svelte';
  import { t, type MessageKey } from '../lib/i18n/core';

  type Layer = { name: string; group: string; z: number; x: number; y: number; w: number; h: number };
  type Loaded = Layer & { color: ImageData; normal: ImageData };

  const BASE = import.meta.env.BASE_URL;
  const DIR = `${BASE}showcase/livingroom-layers/`;
  let canvas = $state<HTMLCanvasElement>();
  let layers = $state<Loaded[]>([]);
  let visible = $state<Record<string, boolean>>({});
  let lit = $state(false);
  let lightX = $state(0.3);
  let lightY = $state(0.6);
  let size = { width: 1024, height: 1024 };

  function loadImage(src: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  onMount(async () => {
    const manifest = await (await fetch(`${DIR}layers.json`)).json();
    size = { width: manifest.width, height: manifest.height };
    const sorted = (manifest.layers as Layer[]).sort((a, b) => a.z - b.z);
    layers = await Promise.all(
      sorted.map(async (layer) => ({
        ...layer,
        color: await loadImage(`${DIR}${layer.name}.color.webp`),
        normal: await loadImage(`${DIR}${layer.name}.normal.webp`),
      })),
    );
    visible = Object.fromEntries(layers.map((layer) => [layer.name, true]));
  });

  function render(): void {
    if (!canvas || layers.length === 0) return;
    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;
    const out = new Float32Array(width * height * 3);
    const len = Math.hypot(lightX, lightY, 1);
    const lx = lightX / len;
    const ly = lightY / len;
    const lz = 1 / len;
    for (const layer of layers) {
      if (!visible[layer.name]) continue;
      const c = layer.color.data;
      const n = layer.normal.data;
      for (let row = 0; row < layer.h; row++) {
        const py = layer.y + row;
        if (py < 0 || py >= height) continue;
        for (let col = 0; col < layer.w; col++) {
          const px = layer.x + col;
          if (px < 0 || px >= width) continue;
          const i = (row * layer.w + col) * 4;
          const a = c[i + 3] / 255;
          if (a === 0) continue;
          let shade = 1;
          if (lit) {
            const nx = n[i] / 127.5 - 1;
            const ny = n[i + 1] / 127.5 - 1;
            const nz = n[i + 2] / 127.5 - 1;
            shade = 0.35 + 0.9 * Math.max(0, nx * lx + ny * ly + nz * lz);
          }
          const o = (py * width + px) * 3;
          out[o] = out[o] * (1 - a) + c[i] * shade * a;
          out[o + 1] = out[o + 1] * (1 - a) + c[i + 1] * shade * a;
          out[o + 2] = out[o + 2] * (1 - a) + c[i + 2] * shade * a;
        }
      }
    }
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(width, height);
    for (let p = 0, q = 0; p < out.length; p += 3, q += 4) {
      img.data[q] = out[p];
      img.data[q + 1] = out[p + 1];
      img.data[q + 2] = out[p + 2];
      img.data[q + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  $effect(() => {
    void [lit, lightX, lightY, layers, JSON.stringify(visible)];
    render();
  });

  function camel(name: string): string {
    return name.replace(/_(\w)/g, (_, ch: string) => ch.toUpperCase());
  }

  function setAll(on: boolean): void {
    visible = Object.fromEntries(layers.map((layer) => [layer.name, on]));
  }

  function moveLight(event: PointerEvent): void {
    if (!lit || !canvas || event.buttons === 0) return;
    const rect = canvas.getBoundingClientRect();
    lightX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    lightY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
  }
</script>

<div class="layers-page" data-layers-page>
  <header>
    <p class="kicker">{t('game.layers.kicker')}</p>
    <h1>{t('game.layers.title')}</h1>
  </header>
  <div class="body">
    <canvas bind:this={canvas} onpointermove={moveLight} onpointerdown={moveLight} data-layers-canvas></canvas>
    <aside class="panel" aria-label={t('game.layers.panelAria')}>
      {#if layers.length === 0}
        <p>{t('game.layers.loading')}</p>
      {:else}
        <label class="lit"><input type="checkbox" bind:checked={lit} data-layers-lit /> {t('game.layers.lighting')}</label>
        {#if lit}<p class="hint">{t('game.layers.lightHint')}</p>{/if}
        <div class="bulk">
          <button type="button" onclick={() => setAll(true)}>{t('game.layers.all')}</button>
          <button type="button" onclick={() => setAll(false)}>{t('game.layers.none')}</button>
        </div>
        <ol>
          {#each [...layers].reverse() as layer (layer.name)}
            <li>
              <label>
                <input type="checkbox" bind:checked={visible[layer.name]} data-layer={layer.name} />
                <span class="z">z{layer.z}</span>
                {t(`game.layers.item.${camel(layer.name)}` as MessageKey)}
              </label>
            </li>
          {/each}
        </ol>
      {/if}
      <a href="#/" data-layers-back>{t('game.layers.back')}</a>
    </aside>
  </div>
</div>

<style>
  .layers-page { min-height: 100vh; padding: 16px; box-sizing: border-box; background: #1b1714; color: #f3e9dc; font-family: inherit; }
  header h1 { margin: 0 0 12px; font-size: 1.4rem; }
  .kicker { margin: 0; opacity: 0.7; font-size: 0.85rem; }
  .body { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
  canvas { width: min(100%, 640px); aspect-ratio: 1; border-radius: 8px; background: #000; touch-action: none; }
  .panel { flex: 1 1 220px; max-height: 42vh; overflow: auto; background: #2a231e; border-radius: 8px; padding: 12px; font-size: 0.9rem; }
  ol { list-style: none; padding: 0; margin: 8px 0; }
  li label, .lit { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
  .z { opacity: 0.5; font-size: 0.75rem; min-width: 2.2em; }
  .bulk { display: flex; gap: 6px; margin-top: 6px; }
  .hint { opacity: 0.7; font-size: 0.8rem; margin: 4px 0; }
  a { color: #ffd479; }
</style>
