<script lang="ts">
  import { onMount } from 'svelte';
  import { t, type MessageKey } from '../lib/i18n/core';
  import { DEFAULT_LIGHT, hexToRgb, lightVector, parseLayersQuery, planShadows, type SceneLight, type ShadowConfig } from '../lib/shadows/shadows';
  import { maskByReceivers, multiplyShadow, rasteriseShadow } from '../lib/shadows/render';

  type Box = { x: number; y: number; w: number; h: number };
  /** `ao`: the object's own contact shadow / ambient occlusion on the room (multiply factor image), moves and toggles with it. */
  type Layer = Box & { name: string; group: string; z: number; shadow: ShadowConfig; ao?: Box };
  type Loaded = Layer & { color: ImageData; normal: ImageData; bitmap: HTMLCanvasElement; aoData?: ImageData };

  const BASE = import.meta.env.BASE_URL;
  const DIR = `${BASE}showcase/livingroom-layers/`;
  const query = parseLayersQuery(location.hash);
  const aoOn = !/[?&]ao=0/.test(location.hash);
  let canvas = $state<HTMLCanvasElement>();
  let layers = $state.raw<Loaded[]>([]);
  let visible = $state<Record<string, boolean>>({});
  let castShadow = $state<Record<string, boolean>>({});
  let moved = $state<Record<string, [number, number]>>({ ...query.move });
  let lit = $state(false);
  let shadowsOn = $state(query.shadows);
  let light = $state<SceneLight>({ ...DEFAULT_LIGHT });
  let ready = $state(false);
  let size = { width: 1024, height: 1024 };

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function pixels(img: HTMLImageElement): { data: ImageData; canvas: HTMLCanvasElement } {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    return { data: ctx.getImageData(0, 0, img.width, img.height), canvas: c };
  }

  onMount(async () => {
    const manifest = await (await fetch(`${DIR}layers.json`)).json();
    size = { width: manifest.width, height: manifest.height };
    light = { ...DEFAULT_LIGHT, ...manifest.light, ...(query.angle !== undefined ? { shadowAngleDeg: query.angle } : {}) };
    const sorted = (manifest.layers as Layer[]).sort((a, b) => a.z - b.z);
    layers = await Promise.all(
      sorted.map(async (layer) => {
        const color = pixels(await loadImage(`${DIR}${layer.name}.color.webp`));
        const normal = pixels(await loadImage(`${DIR}${layer.name}.normal.webp`));
        const aoData = layer.ao ? pixels(await loadImage(`${DIR}${layer.name}.ao.webp`)).data : undefined;
        return { ...layer, shadow: layer.shadow ?? { type: 'none' }, color: color.data, normal: normal.data, bitmap: color.canvas, aoData };
      }),
    );
    visible = Object.fromEntries(layers.map((layer) => [layer.name, !query.off.includes(layer.name)]));
    castShadow = Object.fromEntries(layers.map((layer) => [layer.name, true]));
    ready = true;
  });

  function offsetOf(name: string): [number, number] {
    return moved[name] ?? [0, 0];
  }

  /** Scene-sized canvas holding one caster at its moved position (input for silhouette shadows). */
  function placed(layer: Loaded): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = size.width;
    c.height = size.height;
    const [mx, my] = offsetOf(layer.name);
    c.getContext('2d')!.drawImage(layer.bitmap, layer.x + mx, layer.y + my);
    return c;
  }

  /** Union alpha of the visible receiver layers at their moved positions ('shell' = bare room layers). */
  function receiverMask(names: string[], width: number, height: number): Uint8ClampedArray {
    const mask = new Uint8ClampedArray(width * height);
    for (const layer of layers) {
      const isShell = layer.group === 'room_shell' || layer.group === 'background_view';
      if (!visible[layer.name] || !(names.includes(layer.name) || (isShell && names.includes('shell')))) continue;
      const [mx, my] = offsetOf(layer.name);
      const c = layer.color.data;
      for (let row = 0; row < layer.h; row++) {
        const py = layer.y + my + row;
        if (py < 0 || py >= height) continue;
        for (let col = 0; col < layer.w; col++) {
          const px = layer.x + mx + col;
          if (px < 0 || px >= width) continue;
          const a = c[(row * layer.w + col) * 4 + 3];
          const o = py * width + px;
          if (a > mask[o]) mask[o] = a;
        }
      }
    }
    return mask;
  }

  /** Multiply the object's stored AO factor onto the room under it, at the object's moved position. */
  function applyAo(out: Float32Array, box: Box, data: ImageData, mx: number, my: number, recv: Uint8ClampedArray, width: number, height: number): void {
    const d = data.data;
    for (let row = 0; row < box.h; row++) {
      const py = box.y + my + row;
      if (py < 0 || py >= height) continue;
      for (let col = 0; col < box.w; col++) {
        const px = box.x + mx + col;
        if (px < 0 || px >= width) continue;
        const p = py * width + px;
        const k = recv[p] / 255;
        if (k === 0) continue;
        const i = (row * box.w + col) * 4;
        for (let ch = 0; ch < 3; ch++) out[p * 3 + ch] *= 1 - (1 - d[i + ch] / 255) * k;
      }
    }
  }

  function render(): void {
    if (!canvas || !ready) return;
    const { width, height } = size;
    canvas.width = width;
    canvas.height = height;
    const out = new Float32Array(width * height * 3);
    const [lx, ly, lz] = lightVector(light);
    const tint = hexToRgb(light.color);
    for (const layer of layers) {
      if (!visible[layer.name]) continue;
      const [mx, my] = offsetOf(layer.name);
      if (shadowsOn && castShadow[layer.name]) {
        const plans = planShadows(layer, light, mx, my);
        const source = plans.some((plan) => plan.kind === 'silhouette') ? placed(layer) : layer.bitmap;
        for (const plan of plans) {
          const mask = rasteriseShadow(plan, source, width, height);
          if (plan.receivers) maskByReceivers(mask, receiverMask(plan.receivers, width, height));
          multiplyShadow(out, mask, tint);
        }
        if (aoOn && layer.ao && layer.aoData) applyAo(out, layer.ao, layer.aoData, mx, my, receiverMask(['shell', 'rug'], width, height), width, height);
      }
      const c = layer.color.data;
      const n = layer.normal.data;
      for (let row = 0; row < layer.h; row++) {
        const py = layer.y + my + row;
        if (py < 0 || py >= height) continue;
        for (let col = 0; col < layer.w; col++) {
          const px = layer.x + mx + col;
          if (px < 0 || px >= width) continue;
          const i = (row * layer.w + col) * 4;
          const a = c[i + 3] / 255;
          if (a === 0) continue;
          let shade = 1;
          if (lit) {
            const dot = (n[i] / 127.5 - 1) * lx + (n[i + 1] / 127.5 - 1) * ly + (n[i + 2] / 127.5 - 1) * lz;
            shade = 0.35 + 0.9 * Math.max(0, dot);
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
    canvas.dataset.rendered = String(Number(canvas.dataset.rendered ?? 0) + 1);
  }

  let frame = 0;
  $effect(() => {
    void [lit, shadowsOn, ready, JSON.stringify(light), JSON.stringify(visible), JSON.stringify(castShadow), JSON.stringify(moved)];
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  });

  function setAll(on: boolean): void {
    // "None" hides the objects only; the room shell and the view through the doorways stay until toggled one by one.
    visible = Object.fromEntries(layers.map((layer) => [layer.name, on || isRoom(layer)]));
  }

  function isRoom(layer: Layer): boolean {
    return layer.group === 'room_shell' || layer.group === 'background_view';
  }

  function camel(name: string): string {
    return name.replace(/_(\w)/g, (_, ch: string) => ch.toUpperCase());
  }

  // Drag on the picture to move the topmost visible object (room shell layers stay put).
  let dragging: { name: string; startX: number; startY: number; base: [number, number] } | null = null;
  function scenePoint(event: PointerEvent): [number, number] {
    const rect = canvas!.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * size.width, ((event.clientY - rect.top) / rect.height) * size.height];
  }
  function pick(event: PointerEvent): void {
    const [sx, sy] = scenePoint(event);
    for (const layer of [...layers].reverse()) {
      if (!visible[layer.name] || layer.group === 'room_shell' || layer.group === 'background_view') continue;
      const [mx, my] = offsetOf(layer.name);
      const col = Math.floor(sx - layer.x - mx);
      const row = Math.floor(sy - layer.y - my);
      if (col < 0 || row < 0 || col >= layer.w || row >= layer.h) continue;
      if (layer.color.data[(row * layer.w + col) * 4 + 3] > 0) {
        dragging = { name: layer.name, startX: sx, startY: sy, base: offsetOf(layer.name) };
        canvas!.setPointerCapture(event.pointerId);
        return;
      }
    }
  }
  function drag(event: PointerEvent): void {
    if (!dragging) return;
    const [sx, sy] = scenePoint(event);
    moved = { ...moved, [dragging.name]: [dragging.base[0] + sx - dragging.startX, dragging.base[1] + sy - dragging.startY] };
  }
</script>

<div class="layers-page" data-layers-page>
  <header>
    <p class="kicker">{t('game.layers.kicker')}</p>
    <h1>{t('game.layers.title')}</h1>
  </header>
  <div class="body">
    <canvas
      bind:this={canvas}
      onpointerdown={pick}
      onpointermove={drag}
      onpointerup={() => (dragging = null)}
      data-layers-canvas
    ></canvas>
    <p class="hint">{t('game.layers.dragHint')}</p>
    {#if !ready}
      <p>{t('game.layers.loading')}</p>
    {:else}
      <section class="panel" aria-label={t('game.layers.shadowsAria')} data-shadows-panel>
        <h2>{t('game.layers.shadowsTitle')}</h2>
        <label class="row"><input type="checkbox" bind:checked={shadowsOn} data-shadows-on /> {t('game.layers.shadowsOn')}</label>
        <label class="slider">{t('game.layers.lightAngle')} <input type="range" min="0" max="359" bind:value={light.shadowAngleDeg} data-light-angle /></label>
        <label class="slider">{t('game.layers.lightElevation')} <input type="range" min="10" max="80" bind:value={light.elevationDeg} /></label>
        <label class="slider">{t('game.layers.softness')} <input type="range" min="0" max="1" step="0.05" bind:value={light.softness} /></label>
        <label class="slider">{t('game.layers.intensity')} <input type="range" min="0" max="1" step="0.05" bind:value={light.intensity} /></label>
        <label class="row"><input type="checkbox" bind:checked={lit} data-layers-lit /> {t('game.layers.lighting')}</label>
        <button type="button" onclick={() => (moved = {})}>{t('game.layers.resetMoves')}</button>
      </section>
      <section class="panel" aria-label={t('game.layers.panelAria')}>
        <div class="bulk">
          <button type="button" onclick={() => setAll(true)}>{t('game.layers.all')}</button>
          <button type="button" onclick={() => setAll(false)}>{t('game.layers.none')}</button>
          <span class="legend">{t('game.layers.shadowColumn')}</span>
        </div>
        <ol>
          {#each [...layers].reverse() as layer (layer.name)}
            <li>
              <label>
                <input type="checkbox" bind:checked={visible[layer.name]} data-layer={layer.name} />
                <span class="z">z{layer.z}</span>
                {t(`game.layers.item.${camel(layer.name)}` as MessageKey)}
              </label>
              {#if layer.shadow.type !== 'none'}
                <input
                  type="checkbox"
                  class="cast"
                  bind:checked={castShadow[layer.name]}
                  aria-label={t('game.layers.shadowColumn')}
                  data-layer-shadow={layer.name}
                />
              {/if}
            </li>
          {/each}
        </ol>
      </section>
    {/if}
    <a href="#/" data-layers-back>{t('game.layers.back')}</a>
  </div>
</div>

<style>
  .layers-page { min-height: 100vh; padding: 16px; box-sizing: border-box; background: #1b1714; color: #f3e9dc; font-family: inherit; }
  header h1 { margin: 0 0 12px; font-size: 1.4rem; }
  h2 { margin: 0 0 6px; font-size: 1rem; }
  .kicker { margin: 0; opacity: 0.7; font-size: 0.85rem; }
  .body { display: flex; flex-direction: column; gap: 10px; }
  canvas { width: min(100%, 640px); aspect-ratio: 1; border-radius: 8px; background: #000; touch-action: none; cursor: grab; }
  .panel { background: #2a231e; border-radius: 8px; padding: 12px; font-size: 0.9rem; }
  .panel ol { list-style: none; padding: 0; margin: 8px 0; max-height: 40vh; overflow: auto; }
  li { display: flex; align-items: center; justify-content: space-between; }
  li label, .row { display: flex; gap: 6px; align-items: center; padding: 2px 0; cursor: pointer; }
  .slider { display: grid; grid-template-columns: 9em 1fr; align-items: center; gap: 6px; padding: 2px 0; }
  .z { opacity: 0.5; font-size: 0.75rem; min-width: 2.2em; }
  .bulk { display: flex; gap: 6px; align-items: center; }
  .legend { margin-left: auto; opacity: 0.7; font-size: 0.8rem; }
  .hint { opacity: 0.7; font-size: 0.8rem; margin: 0; }
  a { color: #ffd479; }
</style>
