<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { MatchState } from '../lib/editor/matchState.svelte';
  import type { V3 } from '../lib/editor/camMath';
  import GuideOverlay from './GuideOverlay.svelte';
  import CameraPanel from './CameraPanel.svelte';
  import { SHOWCASE_ASSETS } from '../lib/showcaseAssets';
  import {
    createModelEditor,
    type EditorSnapshot,
    type GizmoMode,
    type ModelEditor,
    type ViewMode,
    type DisplayMode,
  } from '../lib/editor/modelEditor';
  import { partLabel } from '../lib/editor/partLabels';
  import { SourceFiles, editsStorageKey, type FileChange } from '../lib/editor/sourceFiles.svelte';
  import { glbFileName, stableStringify } from '../lib/editor/editorFilesCore.mjs';

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
  let editor = $state.raw<ModelEditor | null>(null);
  let snap = $state<EditorSnapshot>({ ready: false, parts: [], selected: null, canUndo: false, canRedo: false, dirty: false });
  let mode = $state<GizmoMode>('translate');
  let view = $state<ViewMode>('orbit');
  let snapOn = $state(true);
  let toast = $state<string | null>(null);
  let loading = $state(true);
  let vw = $state(0);
  let vh = $state(0);
  let toastTimer = 0;

  const ref = $derived(option.asset.ref);
  /** Camera-match session of the current asset (also drives the mock-up view's camera). */
  let match = $state.raw<MatchState | null>(null);
  /** Source files (game/assets-src/<item>/editor/) of the current asset + the dev save API. */
  let files = $state.raw<SourceFiles | null>(null);
  let matchFor = '';
  $effect(() => {
    const asset = option.asset;
    if (matchFor === asset.slug) return;
    matchFor = asset.slug;
    const sf = new SourceFiles(asset);
    const m = asset.ref ? new MatchState(asset, sf.matchFile) : null;
    files = sf;
    match = m;
    if (m) m.onSave = () => refreshFiles();
    untrack(() => refreshFiles());
    // dev API: the files on disk may be newer than the copy bundled into this page
    void sf.ready.then(() => {
      if (files !== sf) return;
      const disk = sf.matchFile;
      if (m && m.origin !== 'draft' && disk && stableStringify(disk) !== stableStringify(m.fileData()) && m.loadFile(disk)) {
        m.origin = 'file';
        m.save();
      }
      refreshFiles();
    });
  });
  function refreshFiles(): void {
    files?.refresh(match);
  }
  // model edits change → recompute the unsaved list
  $effect(() => {
    void snap;
    untrack(() => refreshFiles());
  });
  const staged = $derived(view !== 'orbit' && !!match);
  $effect(() => {
    if (!match) return;
    match.stageW = Math.max(1, vw);
    match.stageH = Math.max(1, vh);
  });
  // In the plain mock-up view the image always fits the viewport; camera-match fits on entry / resize
  // (fit keeps a strip under the image for the zoom buttons).
  $effect(() => {
    if (match && (view === 'mock' || view === 'match')) {
      void match.stageW;
      void match.stageH;
      void match.image;
      untrack(() => match!.fit());
    }
  });
  // Push camera + visible window + display mode into the 3D view.
  $effect(() => {
    if (!match) return;
    const cam = match.cam;
    const rect = match.viewRect;
    const display: DisplayMode = view === 'orbit' ? 'solid' : match.display;
    if (!editor) return;
    untrack(() => {
      editor!.setMatch(cam, rect);
      editor!.setDisplay(display);
    });
  });
  // Auto-save the match session.
  let saveTimer = 0;
  $effect(() => {
    if (!match) return;
    void match.cam;
    void JSON.stringify(match.lines);
    void JSON.stringify(match.pairs);
    void match.image;
    void match.principal;
    void match.lockLens;
    const m = match;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => m.save(), 300);
  });
  const imgStyle = $derived.by(() => {
    if (!match) return '';
    const r = match.imageRect;
    const v = match.viewRect;
    const k = match.k;
    return `left:${(r.x - v.x0) * k}px;top:${(r.y - v.y0) * k}px;width:${r.w * k}px;height:${r.h * k}px;`;
  });
  // Difference view: model render ⊖ mock-up (aligned areas go dark, misalignment glows).
  const diffOn = $derived(view === 'match' && !!match?.showDiff);
  const canvasStyle = $derived(
    staged && match
      ? `${diffOn ? 'mix-blend-mode:difference;opacity:1' : `opacity:${match.opacity / 100}`};clip-path:inset(0 0 0 ${match.split}%);`
      : '',
  );
  function modelTap(clientX: number, clientY: number): boolean {
    if (!editor || !match?.pick) return false;
    const p = editor.pickVertex(clientX, clientY);
    if (!p) {
      say('ไม่โดนโมเดล ลองแตะใหม่');
      return false;
    }
    match.setPairWorld(match.pick.pairId, p as V3, `โมเดล (${p.map((v) => v.toFixed(1)).join(', ')})`);
    say('แตะจุดเดียวกันบนภาพ');
    return true;
  }
  function modelDims(): V3 {
    const b = editor?.modelBox();
    return b ? [b.x[1] - b.x[0], b.y[1] - b.y[0], b.z[1]] : [0, 0, 0];
  }

  const sel = $derived(snap.selected);
  const posStep = $derived(snapOn ? 0.5 : 0.1);
  const rotStep = $derived(snapOn ? 15 : 1);

  /** In camera-match view, undo/redo act on the guide lines; otherwise on the model. */
  const lineHistory = $derived(view === 'match' ? match : null);
  function undo(): void {
    if (lineHistory) {
      if (lineHistory.undoLines()) lineHistory.save();
    } else editor?.undo();
  }
  function redo(): void {
    if (lineHistory) {
      if (lineHistory.redoLines()) lineHistory.save();
    } else editor?.redo();
  }
  function say(message: string): void {
    toast = message;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast = null), 2400);
  }

  async function load(): Promise<void> {
    if (!editor) return;
    loading = true;
    try {
      await tick(); // let the asset effect create this asset's SourceFiles first
      const sf = files?.asset === option.asset ? files : null;
      if (sf) await sf.ready;
      const { from } = await editor.load(option.asset, option.variant, sf?.editsFile(option.variant.id) ?? null);
      if (from === 'draft') say('เปิดงานที่แก้ค้างไว้ (บันทึกในเครื่องนี้)');
      else if (from === 'file') say('เปิดงานจากไฟล์ต้นฉบับ');
      refreshFiles();
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
    if (match) editor.setMatch(match.cam, match.viewRect);
    void load();
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveFiles();
      } else if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
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
      window.clearTimeout(saveTimer);
      match?.save();
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

  // ---------- source files (dev save API) ----------
  let withGlb = $state(false);
  let copied = $state(false);
  const changeLabel = (c: FileChange) => (c.status === 'new' ? 'ไฟล์ใหม่' : 'แก้ต่างจากไฟล์');
  async function saveFiles(): Promise<void> {
    const sf = files;
    if (!sf) return;
    if (sf.api !== 'on') {
      say('บันทึกลงไฟล์ได้เมื่อรัน npm run dev — ตอนนี้ใช้ปุ่มดาวน์โหลดไฟล์แทน');
      return;
    }
    if (sf.saving) return;
    refreshFiles();
    let glb: { name: string; blob: Blob } | null = null;
    if (withGlb && editor && snap.ready) {
      try {
        glb = { name: glbFileName(option.variant.id), blob: await editor.exportGlb() };
      } catch (err) {
        console.warn('export failed', err);
        say('ส่งออก GLB ไม่สำเร็จ');
        return;
      }
    }
    if (!sf.changes.length && !glb) {
      say('ไฟล์ต้นฉบับตรงกับงานแล้ว ไม่มีอะไรต้องบันทึก');
      return;
    }
    const res = await sf.save(sf.changes, glb);
    if (!res.ok) {
      say(`บันทึกลงไฟล์ไม่สำเร็จ: ${res.error}`);
      return;
    }
    copied = false;
    refreshFiles();
    say(`บันทึกลงไฟล์แล้ว ${res.paths.length} ไฟล์ — commit ได้เลย`);
  }
  function keepDraft(): void {
    if (files) files.dismissed = true;
  }
  function revertToFile(): void {
    const sf = files;
    if (!sf || !sf.canRevert) return;
    if (!confirm('กลับไปใช้ไฟล์ต้นฉบับ? งานที่ยังไม่บันทึกลงไฟล์จะหายไป')) return;
    for (const c of sf.changes) {
      if (c.status !== 'modified') continue;
      if (c.kind === 'match' && match) {
        if (match.loadFile(sf.matchFile)) match.save();
      } else if (c.kind === 'edits' && c.variant) {
        const state = sf.editsFile(c.variant);
        if (c.variant === option.variant.id && editor && state) editor.loadState(state);
        else {
          try {
            localStorage.removeItem(editsStorageKey(option.asset.slug, c.variant));
          } catch {
            /* ignore */
          }
        }
      }
    }
    refreshFiles();
    say('กลับไปใช้ไฟล์ต้นฉบับแล้ว');
  }
  function downloadSource(c: FileChange): void {
    download(new Blob([stableStringify(c.data)], { type: 'application/json' }), c.name);
    say(`ดาวน์โหลด ${c.name} แล้ว — วางไว้ใน ${files?.dir ?? ''}`);
  }
  async function copyGit(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      say('คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง');
    }
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
      <button type="button" class="e-hist" onclick={undo} disabled={lineHistory ? lineHistory.lineUndoCount === 0 : !snap.canUndo} aria-label="ย้อน (Undo)">↶ ย้อน</button>
      <button type="button" class="e-hist" onclick={redo} disabled={lineHistory ? lineHistory.lineRedoCount === 0 : !snap.canRedo} aria-label="ทำซ้ำ (Redo)">↷ ทำต่อ</button>
    </div>
  </header>

  <div class="body">
    <div class="viewport" class:matching={view === 'match'} bind:clientWidth={vw} bind:clientHeight={vh}>
      {#if staged && match}
        <img class="ref" src={match.imageRect.src} alt="Mock-up" style={imgStyle} draggable="false" data-ref-image={match.image} />
      {/if}
      <canvas bind:this={canvas} style={canvasStyle} aria-label="พื้นที่แก้โมเดล แตะชิ้นส่วนเพื่อเลือก"></canvas>
      {#if staged && match && match.split > 0}
        <div class="divider" style="left:{match.split}%"><span>ภาพ | โมเดล</span></div>
      {/if}
      {#if view === 'match' && match}
        <GuideOverlay st={match} onModelTap={modelTap} onChange={() => match?.save()} {say} modelCanvas={canvas} />
        <div class="stage-tools">
          <button type="button" aria-label="ซูมเข้า" onclick={() => match?.zoomAt(1.4)}>＋</button>
          <button type="button" aria-label="ซูมออก" onclick={() => match?.zoomAt(1 / 1.4)}>－</button>
          <button type="button" aria-label="พอดีจอ" onclick={() => match?.fit()}>⤢</button>
          <button type="button" aria-label="แม่เหล็กเส้น" title="แม่เหล็กเส้น (Alt ค้าง = ปิดชั่วคราว)" class="snap" class:on={match.snap} aria-pressed={match.snap} data-stage-snap
            onclick={() => { if (match) { match.snap = !match.snap; match.save(); say(match.snap ? 'แม่เหล็กเส้น: เปิด' : 'แม่เหล็กเส้น: ปิด'); } }}>🧲</button>
        </div>
        {#if diffOn || (match.dragging && match.liveFail)}
          <div class="live-badges">
            {#if diffOn}<span class="badge diff" data-diff-badge>เทียบความต่าง</span>{/if}
            {#if match.dragging && match.liveFail}<span class="badge fail" data-solve-fail>คำนวณกล้องไม่สำเร็จ · ใช้ค่าล่าสุด</span>{/if}
          </div>
        {/if}
        {#if match.pick}
          <p class="pick-hint">{match.pick.want === 'model' ? 'แตะจุดบนโมเดล' : 'แตะจุดเดียวกันบนภาพ'}</p>
        {/if}
      {/if}
      {#if loading}<p class="loading">กำลังโหลดโมเดล…</p>{/if}
      <div class="modes" role="radiogroup" aria-label="เครื่องมือ" hidden={view === 'match'}>
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
      {#if files?.showBadge}
        <div class="unsaved" role="status" data-unsaved>
          <b>● มีงานที่ยังไม่บันทึกลงไฟล์</b>
          <ul>
            {#each files.changes as c (c.name)}
              <li><code>{c.name}</code> · {changeLabel(c)}</li>
            {/each}
          </ul>
          <div class="actions">
            {#if files.api === 'on'}
              <button type="button" class="primary" onclick={saveFiles} disabled={files.saving} data-act="save-files-badge">💾 บันทึกลงไฟล์ต้นฉบับ</button>
            {/if}
            <button type="button" onclick={keepDraft} data-act="keep-draft">ใช้งานที่ค้างไว้ต่อ</button>
            {#if files.canRevert}
              <button type="button" class="danger" onclick={revertToFile} data-act="revert-file">กลับไปใช้ไฟล์</button>
            {/if}
          </div>
        </div>
      {/if}
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
        <button
          type="button"
          role="radio"
          aria-checked={view === 'match'}
          class:on={view === 'match'}
          data-view="match"
          disabled={!ref}
          onclick={() => pickView('match')}>จับมุมกล้อง</button
        >
      </div>
      {#if view === 'mock' && match}
        <div class="seg" role="radiogroup" aria-label="แบบการแสดงโมเดล">
          {#each [['solid', 'ทึบ'], ['wire', 'โครงลวด'], ['edges', 'เส้นขอบ']] as const as [id, label] (id)}
            <button type="button" role="radio" aria-checked={match.display === id} class:on={match.display === id} data-display={id}
              onclick={() => (match!.display = id)}>{label}</button>
          {/each}
        </div>
        <label class="field slider">
          <span>ความทึบโมเดลบนภาพ Mock-up {match.opacity}%</span>
          <input type="range" min="0" max="100" step="5" bind:value={match.opacity} data-overlay />
        </label>
        <label class="field slider">
          <span>เลื่อนเทียบ ก่อน|หลัง {match.split}%</span>
          <input type="range" min="0" max="100" step="1" bind:value={match.split} data-split />
        </label>
      {/if}
      {#if view === 'match' && match}
        <CameraPanel st={match} onChange={() => match?.save()} {say} {download} dims={modelDims} />
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

      {#if files}
        <section class="source" data-source-files={files.api}>
          <h2>ไฟล์ต้นฉบับ (commit ได้)</h2>
          <p class="tip"><code>{files.dir}/</code></p>
          {#if files.changes.length}
            <ul class="changes">
              {#each files.changes as c (c.name)}
                <li data-change={c.name}>
                  <code>{c.name}</code> · {changeLabel(c)}
                  {#if files.api !== 'on'}
                    <button type="button" class="small" onclick={() => downloadSource(c)} data-act="download-source">ดาวน์โหลด</button>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else if files.api !== 'probing'}
            <p class="tip ok" data-in-sync>✓ งานตรงกับไฟล์ต้นฉบับ{files.hasFiles ? '' : ' (ยังไม่มีไฟล์ — ยังไม่ได้แก้อะไร)'}</p>
          {/if}
          {#if files.api === 'on'}
            <label class="check">
              <input type="checkbox" bind:checked={withGlb} data-with-glb />
              <span>รวม <code>{glbFileName(option.variant.id)}</code> (โมเดลที่แก้แล้ว)</span>
            </label>
            <div class="actions col">
              <button type="button" class="primary" onclick={saveFiles} disabled={files.saving || (!files.changes.length && !withGlb)} data-act="save-files"
                >{files.saving ? 'กำลังบันทึก…' : '💾 บันทึกลงไฟล์ต้นฉบับ'} <small>Ctrl+S</small></button
              >
            </div>
            {#if files.lastSave}
              <div class="saved" data-saved>
                <p>บันทึกแล้ว:</p>
                <ul>
                  {#each files.lastSave.paths as path (path)}<li><code>{path}</code></li>{/each}
                </ul>
                <p>แล้ว commit ด้วย:</p>
                <pre data-git>{files.lastSave.git}</pre>
                <button type="button" class="small" onclick={() => copyGit(files!.lastSave!.git)}>{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกคำสั่ง'}</button>
              </div>
            {/if}
          {:else if files.api === 'off'}
            <p class="tip" data-dev-hint>
              บันทึกลงไฟล์โดยตรงได้เมื่อเปิดหน้านี้จาก <code>npm run dev</code> (ในโฟลเดอร์ <code>game/</code>) — ตอนนี้กดดาวน์โหลดแล้ววางไฟล์ไว้ใน
              <code>{files.dir}/</code> เองได้
            </p>
          {/if}
        </section>
      {/if}
    </div>
  </div>

  {#if toast}<p class="e-toast" role="status">{toast}</p>{/if}
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
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .ref { position: absolute; display: block; pointer-events: none; object-fit: fill; max-width: none; }
  .viewport.matching { flex-basis: 60%; isolation: isolate; }
  .live-badges { position: absolute; left: 8px; top: 8px; display: flex; flex-direction: column; gap: 4px; z-index: 4; pointer-events: none; }
  .badge { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 8px; background: rgba(0, 0, 0, 0.6); width: max-content; }
  .badge.diff { color: #8fdfff; }
  .badge.fail { color: #ffb3b3; opacity: 0.9; }
  .divider {
    position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px solid #ffe14d; pointer-events: none; z-index: 2;
  }
  .divider span {
    position: absolute; top: 6px; left: 0; transform: translateX(-50%); background: rgba(0, 0, 0, 0.65);
    color: #ffe14d; font-size: 13px; padding: 2px 8px; border-radius: 8px; white-space: nowrap;
  }
  /* a row along the bottom strip that MatchState.fit() keeps free under the image */
  .stage-tools { position: absolute; right: 8px; bottom: 6px; display: flex; flex-direction: row; gap: 6px; z-index: 4; }
  .stage-tools button { width: 46px; min-height: 46px; padding: 0; font-size: 21px; background: rgba(16, 32, 46, 0.88); }
  .stage-tools button.snap { opacity: 0.55; }
  .stage-tools button.snap.on { opacity: 1; border-color: #ffe14d; box-shadow: 0 0 0 2px rgba(255, 225, 77, 0.35) inset; }
  .pick-hint {
    position: absolute; left: 50%; top: 8px; transform: translateX(-50%); margin: 0; z-index: 4; pointer-events: none;
    background: rgba(58, 29, 58, 0.92); border: 2px solid #ff4dd8; border-radius: 10px; padding: 6px 12px; font-weight: 700;
  }
  .modes[hidden] { display: none; }
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
  .unsaved {
    margin: 0 0 12px;
    padding: 10px 12px;
    border: 2px solid #ffcf4d;
    border-radius: 12px;
    background: #2b2a1a;
    color: #fff3c4;
    font-size: 15px;
  }
  .unsaved ul,
  .source ul { margin: 6px 0 0; padding-left: 20px; }
  .unsaved .actions button,
  .source button { min-height: 44px; }
  .source code,
  .unsaved code { font-size: 13px; overflow-wrap: anywhere; }
  .source .changes li { margin: 0 0 6px; }
  .source .changes button { margin-left: 6px; min-height: 36px; }
  .tip.ok { color: #9fe6a0; }
  .check { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; font-size: 15px; min-height: 44px; }
  .check input { width: 22px; height: 22px; }
  .saved { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: #12301f; color: #c9f5d2; font-size: 14px; }
  .saved p { margin: 4px 0; }
  .saved pre { margin: 4px 0 8px; padding: 6px 8px; background: #0b1a12; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 13px; user-select: all; }
  .parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .parts li { display: flex; gap: 6px; align-items: stretch; }
  .parts li.sel .pick { border-color: #ffe14d; background: #2b3a22; }
  .parts li.gone .pick { text-decoration: line-through; }
  .pick { flex: 1; text-align: left; display: flex; flex-direction: column; justify-content: center; padding: 4px 10px; }
  .pick small { font-size: 12px; color: #8fb3cc; font-weight: 400; }
  .e-toast {
    pointer-events: none;
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
