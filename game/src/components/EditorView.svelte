<script lang="ts">
  import { onMount } from 'svelte';
  import { SHOWCASE_ASSETS } from '../lib/showcaseAssets';
  import {
    createModelEditor,
    type EditorSnapshot,
    type GizmoMode,
    type ModelEditor,
    type ViewMode,
  } from '../lib/editor/modelEditor';
  import { partLabel } from '../lib/editor/partLabels';

  const options = SHOWCASE_ASSETS.flatMap((asset) =>
    asset.variants.map((variant) => ({ key: `${asset.slug}|${variant.id}`, asset, variant })),
  );
  const fromHash = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const wantedModel = fromHash.get('model');
  const wantedAsset = fromHash.get('asset');
  const initial =
    options.find((o) => (!wantedAsset || o.asset.slug === wantedAsset) && (!wantedModel || o.variant.id === wantedModel)) ??
    options[0]!;

  let modelKey = $state(initial.key);
  const option = $derived(options.find((o) => o.key === modelKey) ?? options[0]!);

  let canvas = $state<HTMLCanvasElement>();
  let editor: ModelEditor | null = null;
  let snap = $state<EditorSnapshot>({ ready: false, parts: [], selected: null, canUndo: false, canRedo: false, dirty: false });
  let mode = $state<GizmoMode>('translate');
  let view = $state<ViewMode>('orbit');
  let snapOn = $state(true);
  let overlay = $state(50);
  let toast = $state<string | null>(null);
  let loading = $state(true);
  let vw = $state(0);
  let vh = $state(0);
  let toastTimer = 0;

  const ref = $derived(option.asset.ref);
  /** In mock-up view the canvas takes the crop's aspect so the matched camera lines up with the image. */
  const frame = $derived.by(() => {
    if (view !== 'mock' || !ref || !vw || !vh) return 'inset:0;width:100%;height:100%;';
    const a = ref.width / ref.height;
    const w = vw / vh > a ? vh * a : vw;
    const h = w / a;
    return `left:${(vw - w) / 2}px;top:${(vh - h) / 2}px;width:${w}px;height:${h}px;`;
  });

  const sel = $derived(snap.selected);
  const posStep = $derived(snapOn ? 0.5 : 0.1);
  const rotStep = $derived(snapOn ? 15 : 1);

  function say(message: string): void {
    toast = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast = null), 2400);
  }

  async function load(): Promise<void> {
    if (!editor) return;
    loading = true;
    try {
      const { restored } = await editor.load(option.asset, option.variant);
      if (restored) say('เปิดงานที่แก้ค้างไว้ (บันทึกในเครื่องนี้)');
    } catch (err) {
      console.warn('editor load failed', err);
      say('เปิดโมเดลไม่ได้');
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!canvas) return;
    editor = createModelEditor(canvas, (next) => (snap = next));
    void load();
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor?.redo();
        else editor?.undo();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        editor?.redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (snap.selected) editor?.remove(snap.selected.name);
      } else if (event.key === 'Escape') editor?.select(null);
      else if (event.key === 'w' || event.key === 'g') pickMode('translate');
      else if (event.key === 'e' || event.key === 'r') pickMode('rotate');
      else if (event.key === 's') pickMode('scale');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(toastTimer);
      editor?.dispose();
      editor = null;
    };
  });

  function changeModel(key: string): void {
    modelKey = key;
    void load();
  }

  function pickMode(next: GizmoMode): void {
    mode = next;
    editor?.setMode(next);
  }
  function pickView(next: ViewMode): void {
    view = next;
    editor?.setView(next);
  }
  function toggleSnap(): void {
    snapOn = !snapOn;
    editor?.setSnap(snapOn);
  }

  function setValue(kind: 'position' | 'rotation' | 'size', axis: 0 | 1 | 2, value: number): void {
    editor?.setValue(kind, axis, value);
  }
  function nudge(kind: 'position' | 'rotation' | 'size', axis: 0 | 1 | 2, dir: 1 | -1): void {
    if (!sel) return;
    const now = kind === 'position' ? sel.positionCm[axis] : kind === 'rotation' ? sel.rotationDeg[axis] : sel.sizeCm[axis];
    const step = kind === 'rotation' ? rotStep : posStep;
    const next = Math.round((now + dir * step) / step) * step;
    setValue(kind, axis, kind === 'size' ? Math.max(step, next) : next);
  }

  function download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  const fileBase = $derived(`${option.asset.slug.split('/').pop()}-${option.variant.id}-edited`);
  async function exportGlb(): Promise<void> {
    if (!editor) return;
    try {
      const blob = await editor.exportGlb();
      download(blob, `${fileBase}.glb`);
      say(`ดาวน์โหลด ${fileBase}.glb แล้ว`);
    } catch (err) {
      console.warn('export failed', err);
      say('ส่งออก GLB ไม่สำเร็จ');
    }
  }
  function exportEdits(): void {
    if (!editor) return;
    const json = JSON.stringify(editor.exportEdits(), null, 2);
    download(new Blob([json], { type: 'application/json' }), `${fileBase}.edits.json`);
    say(`ดาวน์โหลด ${fileBase}.edits.json แล้ว`);
  }
  function reset(): void {
    if (!snap.dirty) return;
    if (!confirm('ล้างการแก้ทั้งหมดของโมเดลนี้? (กด “ย้อน” เพื่อกลับมาได้)')) return;
    editor?.reset();
    say('กลับเป็นโมเดลเดิมแล้ว');
  }

  const axes = [0, 1, 2] as const;
  const posLabels = ['X ซ้าย–ขวา', 'Y สูง–ต่ำ', 'Z หน้า–หลัง'];
  const sizeLabels = ['กว้าง (X)', 'สูง (Y)', 'ลึก (Z)'];
  const rotLabels = ['X', 'Y', 'Z'];
  const modes: { id: GizmoMode; label: string }[] = [
    { id: 'translate', label: 'ย้าย' },
    { id: 'rotate', label: 'หมุน' },
    { id: 'scale', label: 'ขนาด' },
  ];
</script>

<div class="editor">
  <header>
    <a class="e-back" href="#/showcase" aria-label="กลับไปมุมออกแบบ">‹ กลับ</a>
    <h1>แก้โมเดล 3D</h1>
    <div class="hist">
      <button type="button" class="e-hist" onclick={() => editor?.undo()} disabled={!snap.canUndo} aria-label="ย้อน (Undo)">↶ ย้อน</button>
      <button type="button" class="e-hist" onclick={() => editor?.redo()} disabled={!snap.canRedo} aria-label="ทำซ้ำ (Redo)">↷ ทำต่อ</button>
    </div>
  </header>

  <div class="body">
    <div class="viewport" bind:clientWidth={vw} bind:clientHeight={vh}>
      <canvas bind:this={canvas} style={frame} aria-label="พื้นที่แก้โมเดล แตะชิ้นส่วนเพื่อเลือก"></canvas>
      {#if view === 'mock' && ref}
        <img class="ref" src={ref.src} alt="Mock-up" style="{frame}opacity:{overlay / 100};" draggable="false" />
      {/if}
      {#if loading}<p class="loading">กำลังโหลดโมเดล…</p>{/if}
      <div class="modes" role="radiogroup" aria-label="เครื่องมือ">
        {#each modes as m (m.id)}
          <button type="button" role="radio" aria-checked={mode === m.id} class:on={mode === m.id} data-mode={m.id} onclick={() => pickMode(m.id)}
            >{m.label}</button
          >
        {/each}
        <button type="button" class:on={snapOn} aria-pressed={snapOn} onclick={toggleSnap} data-snap
          >แม่เหล็ก {snapOn ? 'เปิด' : 'ปิด'}</button
        >
      </div>
    </div>

    <div class="panel">
      <label class="field">
        <span>โมเดล</span>
        <select value={modelKey} onchange={(e) => changeModel(e.currentTarget.value)} data-model>
          {#each options as o (o.key)}
            <option value={o.key}>{o.asset.title} · {o.variant.label}</option>
          {/each}
        </select>
      </label>

      <div class="seg" role="radiogroup" aria-label="มุมกล้อง">
        <button type="button" role="radio" aria-checked={view === 'orbit'} class:on={view === 'orbit'} data-view="orbit" onclick={() => pickView('orbit')}
          >หมุนดูอิสระ</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={view === 'mock'}
          class:on={view === 'mock'}
          data-view="mock"
          disabled={!ref}
          onclick={() => pickView('mock')}>มุม Mock-up</button
        >
      </div>
      {#if view === 'mock'}
        <label class="field slider">
          <span>ความเข้มภาพ Mock-up {overlay}%</span>
          <input type="range" min="0" max="100" step="5" bind:value={overlay} data-overlay />
        </label>
      {/if}

      {#if sel}
        <section class="selected" data-selected={sel.name}>
          <h2>{partLabel(sel.name)} <small>{sel.name}</small></h2>
          <p class="sub">ตำแหน่ง (ซม.)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{posLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('position', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" step={posStep} value={sel.positionCm[i]} data-field="position-{i}"
                onchange={(e) => setValue('position', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('position', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <p class="sub">ขนาด (ซม.)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{sizeLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('size', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" min="0.1" step={posStep} value={sel.sizeCm[i]} data-field="size-{i}"
                onchange={(e) => setValue('size', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('size', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <p class="sub">หมุน (องศา)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{rotLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('rotation', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" step={rotStep} value={sel.rotationDeg[i]} data-field="rotation-{i}"
                onchange={(e) => setValue('rotation', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('rotation', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <div class="row color">
            <span>สี</span>
            <input type="color" value={sel.color} onchange={(e) => editor?.setColor(e.currentTarget.value)} aria-label="สีชิ้นส่วน" />
            <button type="button" class="small" onclick={() => editor?.setColor(null)}>สีเดิม</button>
          </div>
          <div class="actions">
            <button type="button" onclick={() => editor?.duplicate(sel.name)} data-act="duplicate">ทำสำเนา</button>
            <button type="button" onclick={() => editor?.toggleHidden(sel.name)} data-act="hide">ซ่อน</button>
            <button type="button" class="danger" onclick={() => editor?.remove(sel.name)} data-act="delete">ลบชิ้นนี้</button>
          </div>
        </section>
      {:else}
        <p class="tip">แตะชิ้นส่วนในภาพ หรือเลือกจากรายการด้านล่าง แล้วลากลูกศรหรือพิมพ์ตัวเลข</p>
      {/if}

      <section>
        <h2>ชิ้นส่วน ({snap.parts.filter((p) => !p.deleted).length})</h2>
        <ul class="parts">
          {#each snap.parts as p (p.name)}
            <li class:sel={sel?.name === p.name} class:gone={p.deleted}>
              <button type="button" class="pick" disabled={p.deleted || p.hidden} onclick={() => editor?.select(p.name)} data-part={p.name}>
                <b>{partLabel(p.name)}</b>
                <small>{p.name}{p.hidden ? ' · ซ่อนอยู่' : ''}{p.deleted ? ' · ลบแล้ว' : ''}</small>
              </button>
              {#if p.deleted}
                <button type="button" class="small" onclick={() => editor?.restore(p.name)}>เอากลับ</button>
              {:else}
                <button type="button" class="small" onclick={() => editor?.toggleHidden(p.name)} aria-pressed={p.hidden}
                  >{p.hidden ? 'แสดง' : 'ซ่อน'}</button
                >
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <h2>บันทึก / ส่งออก</h2>
        <p class="tip">งานที่แก้บันทึกในเครื่องนี้อัตโนมัติ ส่วนที่ซ่อนไว้ยังถูกส่งออก ส่วนที่ลบจะไม่ถูกส่งออก</p>
        <div class="actions col">
          <button type="button" class="primary" onclick={exportGlb} disabled={!snap.ready} data-act="export-glb">ดาวน์โหลด GLB ที่แก้แล้ว</button>
          <button type="button" onclick={exportEdits} disabled={!snap.ready} data-act="export-json">ดาวน์โหลดรายการแก้ (JSON)</button>
          <button type="button" class="danger" onclick={reset} disabled={!snap.dirty}>ล้างการแก้ทั้งหมด</button>
        </div>
      </section>
    </div>
  </div>

  {#if toast}<p class="toast" role="status">{toast}</p>{/if}
</div>

<style>
  .editor {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #16202b;
    color: #eaf6ff;
    font-size: 17px;
    user-select: none;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: calc(6px + env(safe-area-inset-top)) 64px 6px 10px;
    background: #0f1821;
    border-bottom: 1px solid #2c4256;
  }
  h1 { margin: 0; font-size: 20px; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .e-back {
    color: #8fdfff;
    text-decoration: none;
    font-weight: 700;
    font-size: 16px;
    padding: 8px 6px;
    white-space: nowrap;
  }
  .hist { display: flex; gap: 6px; }
  button {
    font: inherit;
    color: inherit;
    min-height: 44px;
    border-radius: 10px;
    border: 2px solid #3a5a74;
    background: #10202e;
    font-weight: 700;
    padding: 0 12px;
    cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  button.on { background: #8fdfff; border-color: #8fdfff; color: #082030; }
  button.primary { background: #ffcf4d; border-color: #ffcf4d; color: #2a1a00; }
  button.danger { border-color: #a5484a; color: #ffb3b3; }
  .e-hist { font-size: 15px; padding: 0 10px; white-space: nowrap; }

  .body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .viewport { position: relative; flex: 0 0 48%; min-height: 240px; background: #22303d; overflow: hidden; }
  canvas, .ref { position: absolute; display: block; touch-action: none; }
  .ref { pointer-events: none; object-fit: fill; }
  .loading {
    position: absolute; left: 50%; top: 45%; transform: translate(-50%, -50%);
    margin: 0; padding: 8px 14px; border-radius: 10px; background: rgba(0, 0, 0, 0.6);
  }
  .modes {
    position: absolute; left: 8px; right: 8px; bottom: 8px;
    display: flex; gap: 6px; justify-content: center; pointer-events: none;
  }
  .modes button { pointer-events: auto; background: rgba(16, 32, 46, 0.88); min-width: 64px; }
  .modes button.on { background: #8fdfff; }

  .panel { flex: 1; min-height: 0; overflow: auto; padding: 12px 12px 40px; user-select: text; }
  .field { display: grid; gap: 4px; margin: 0 0 10px; font-size: 15px; color: #c5d7e6; }
  select {
    font: inherit; font-size: 17px; min-height: 46px; border-radius: 10px;
    border: 2px solid #3a5a74; background: #10202e; color: #eaf6ff; padding: 0 8px;
  }
  .slider input { width: 100%; height: 36px; }
  .seg { display: flex; gap: 8px; margin: 0 0 10px; }
  .seg button { flex: 1; }
  h2 { font-size: 18px; margin: 14px 0 8px; }
  h2 small { font-size: 13px; color: #8fb3cc; font-weight: 400; margin-left: 6px; }
  .sub { margin: 10px 0 4px; font-size: 14px; color: #8fdfff; font-weight: 700; }
  .tip { font-size: 15px; color: #c5d7e6; margin: 8px 0; line-height: 1.45; }
  .selected { background: #1d2c3a; border: 2px solid #ffe14d; border-radius: 12px; padding: 4px 10px 10px; margin: 6px 0 4px; }
  .row { display: grid; grid-template-columns: 1fr 44px 92px 44px; gap: 6px; align-items: center; margin: 0 0 6px; }
  .row span { font-size: 15px; }
  .row input[type='number'] {
    font: inherit; font-size: 18px; width: 100%; min-height: 44px; box-sizing: border-box;
    border-radius: 8px; border: 2px solid #3a5a74; background: #0b1620; color: #fff; padding: 0 6px; text-align: right;
  }
  .step { padding: 0; font-size: 22px; }
  .row.color { grid-template-columns: 1fr 64px 92px; margin-top: 10px; }
  .row.color input { width: 60px; height: 44px; border: none; background: none; padding: 0; }
  .small { min-height: 40px; font-size: 15px; padding: 0 10px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .actions button { flex: 1 1 auto; }
  .actions.col { flex-direction: column; }
  .parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .parts li { display: flex; gap: 6px; align-items: stretch; }
  .parts li.sel .pick { border-color: #ffe14d; background: #2b3a22; }
  .parts li.gone .pick { text-decoration: line-through; }
  .pick { flex: 1; text-align: left; display: flex; flex-direction: column; justify-content: center; padding: 4px 10px; }
  .pick small { font-size: 12px; color: #8fb3cc; font-weight: 400; }
  .toast {
    position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom)); transform: translateX(-50%);
    margin: 0; padding: 10px 16px; border-radius: 12px; background: rgba(6, 24, 40, 0.94);
    border: 1px solid #8fdfff; font-size: 16px; z-index: 30; max-width: 90%; text-align: center;
  }

  @media (min-width: 900px) {
    .body { flex-direction: row; }
    .viewport { flex: 1 1 auto; height: auto; }
    .panel { flex: 0 0 400px; border-left: 1px solid #2c4256; }
  }
</style>
