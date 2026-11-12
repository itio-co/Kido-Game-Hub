<script lang="ts">
  import { appStorage } from '../lib/deployment';

  import { onMount, tick, untrack } from 'svelte';
  import { AXIS_COLORS, AXIS_NAMES, MatchState } from '../lib/editor/matchState.svelte';
  import type { V3 } from '../lib/editor/camMath';
  import { projectedBox } from '../lib/editor/viewFrame';
  import type { BringProblem } from '../lib/editor/bringToImage';
  import GuideOverlay from './GuideOverlay.svelte';
  import CameraPanel from './CameraPanel.svelte';
  import CompareDivider from './CompareDivider.svelte';
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
  import { withDefaultMasters } from '../lib/editor/masterLine';
  import { T } from '../lib/editor/strings';

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
  let snap = $state<EditorSnapshot>({
    ready: false,
    selectionMode: 'object', wholeSelected: false,
    parts: [],
    selected: null,
    canUndo: false,
    canRedo: false,
    canUndoBring: false,
    dirty: false,
    pivotMode: false,
    pivotPicking: false,
    pivotSnap: null,
  });
  let mode = $state<GizmoMode>('translate');
  let view = $state<ViewMode>('orbit');
  let snapOn = $state(true);
  let toast = $state<string | null>(null);
  let loading = $state(true);
  let vw = $state(0);
  let vh = $state(0);
  let toastTimer = 0;

  type DrawerTab = 'object' | 'camera' | 'parts' | 'files';
  const drawerTabs: { id: DrawerTab; label: string }[] = [
    { id: 'object', label: 'วัตถุ' }, { id: 'camera', label: 'กล้อง' },
    { id: 'parts', label: 'ชิ้นส่วน' }, { id: 'files', label: 'ไฟล์' },
  ];
  let drawerOpen = $state(false);
  let drawerTab = $state<DrawerTab>('object');
  let drawerToggle = $state<HTMLButtonElement>();
  let drawerHeading = $state<HTMLHeadingElement>();
  let rendererError = $state(false);
  async function toggleDrawer(): Promise<void> {
    if (drawerOpen) { closeDrawer(); return; }
    drawerOpen = true;
    await tick();
    drawerHeading?.focus({ preventScroll: true });
  }
  function closeDrawer(): void {
    drawerOpen = false;
    drawerToggle?.focus({ preventScroll: true });
  }
  function chooseDrawerTab(next: DrawerTab): void {
    drawerTab = next;
    if (next === 'camera' && view === 'orbit') pickView('match');
  }
  function drawerKeys(event: KeyboardEvent): void {
    if (event.key === 'Escape' && drawerOpen) {
      event.preventDefault(); event.stopPropagation(); closeDrawer();
    }
  }
  function tabKey(event: KeyboardEvent, index: number): void {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const n = event.key === 'Home' ? 0 : event.key === 'End' ? drawerTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + drawerTabs.length) % drawerTabs.length;
    chooseDrawerTab(drawerTabs[n]!.id);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n]?.focus();
  }
  function solveCamera(): void {
    if (!match) return;
    match.solveLines(); match.save();
    if (match.message) say(match.message);
  }
  function addGuide(axis: 0 | 1 | 2): void { match?.addLine(axis); match?.save(); }
  function removeGuide(): void {
    if (!match) return;
    const message = match.removeLine(match.selectedLine);
    if (message) { match.solveLines(); say(message); }
    match.save();
  }
  function toggleGuideSnap(): void {
    if (!match) return;
    match.snap = !match.snap; match.save(); say(T.snap.toast(match.snap));
  }
  function chooseImage(image: 'crop' | 'wide'): void { match?.setImage(image); match?.save(); }
  function cancelPick(): void {
    if (match?.pick) { match.removePair(match.pick.pairId); match.save(); }
    editor?.pickPivot(false);
  }
  // Picking needs the image. Closing the drawer does not reset the editor or the current view.
  $effect(() => {
    if (match?.pick || snap.pivotPicking) {
      drawerOpen = false;
      void tick().then(() => stageEl?.querySelector<HTMLButtonElement>('.pick-hint button')?.focus({ preventScroll: true }));
    }
  });

  const ref = $derived(option.asset.ref);
  /** Camera-match session of the current asset (also drives the mock-up view's camera). */
  let match = $state.raw<MatchState | null>(null);
  /** Source files (games/never-ending-story/assets-src/<item>/editor/) of the current asset + the dev save API. */
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
      if (m && m.origin !== 'draft' && disk && stableStringify(withDefaultMasters(disk)) !== stableStringify(m.fileData()) && m.loadFile(disk)) {
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
  // Mock-up and camera-match share one 2D view window (MatchState.center/zoom). It is fitted when a staged view
  // is entered from the free-orbit view (or the model / image changes), on ⤢, and on resize only while the user
  // hasn't zoomed or panned; after that a resize keeps the window (zoom is relative to the fit scale).
  let stagedFrom: { m: MatchState; image: string } | null = null;
  $effect(() => {
    if (!match) return;
    const staged2 = view === 'mock' || view === 'match';
    void match.stageW;
    void match.stageH;
    void match.padBottom;
    const image = match.image;
    const m = match;
    untrack(() => {
      if (!staged2) {
        stagedFrom = null;
        return;
      }
      const entering = !stagedFrom || stagedFrom.m !== m || stagedFrom.image !== image;
      stagedFrom = { m, image };
      if (entering || !m.userView) m.fit();
    });
  });
  // Reserve the bottom action dock while matching; the drawer never resizes this framing.
  $effect(() => {
    if (!match) return;
    const pad = view === 'match' ? 110 : MatchState.PAD_BOTTOM;
    if (match.padBottom !== pad) match.padBottom = pad;
  });

  // ---------- mock-up view: 2D zoom / pan of the view window ----------
  // One-finger / left-button drags stay with the model editor (tap to select, gizmo drags), so panning uses
  // middle-, right- or Space+drag on desktop and two fingers on touch; wheel / pinch zoom; double-click /
  // double-tap fits. The 3D camera stays the solved camera; only the window into it moves (pixel-locked).
  let stageEl = $state<HTMLDivElement>();
  let spaceHeld = $state(false);
  let mousePan: { id: number; x: number; y: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; x: number; y: number; ids: number[] } | null = null;
  let lastTap: { t: number; x: number; y: number } | null = null;
  let tapStart: { id: number; x: number; y: number; t: number } | null = null;
  const mockOn = (): boolean => view === 'mock' && !!match;
  const onStageControl = (event: Event): boolean => !!(event.target as Element | null)?.closest?.('[data-editor-chrome], button, input, select, label, summary, a');
  function stagePoint(clientX: number, clientY: number): [number, number] {
    const r = stageEl!.getBoundingClientRect();
    return match!.stageToRef(clientX - r.left, clientY - r.top);
  }
  function startPinch(): void {
    const [a, b] = [...touches.entries()];
    pinch = {
      dist: Math.max(1, Math.hypot(a![1].x - b![1].x, a![1].y - b![1].y)),
      x: (a![1].x + b![1].x) / 2,
      y: (a![1].y + b![1].y) / 2,
      ids: [a![0], b![0]],
    };
  }
  function stageDown(event: PointerEvent): void {
    if (!mockOn() || onStageControl(event)) return;
    if (event.pointerType === 'mouse') {
      if (event.button === 1 || event.button === 2 || (event.button === 0 && spaceHeld)) {
        mousePan = { id: event.pointerId, x: event.clientX, y: event.clientY };
        stageEl!.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 1) tapStart = { id: event.pointerId, x: event.clientX, y: event.clientY, t: performance.now() };
    else tapStart = null;
    if (touches.size === 2) {
      startPinch();
      stageEl!.setPointerCapture(event.pointerId);
      event.stopPropagation(); // the editor never sees the second finger
    }
  }
  function stageMove(event: PointerEvent): void {
    if (!mockOn()) return;
    if (mousePan && event.pointerId === mousePan.id) {
      match!.panScreen(event.clientX - mousePan.x, event.clientY - mousePan.y);
      mousePan.x = event.clientX;
      mousePan.y = event.clientY;
      event.stopPropagation();
      return;
    }
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || !pinch.ids.includes(event.pointerId)) return;
    const a = touches.get(pinch.ids[0]!)!;
    const b = touches.get(pinch.ids[1]!)!;
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    match!.panScreen(x - pinch.x, y - pinch.y);
    match!.zoomAt(dist / pinch.dist, stagePoint(x, y));
    pinch.dist = dist;
    pinch.x = x;
    pinch.y = y;
    event.stopPropagation();
  }
  function stageUp(event: PointerEvent): void {
    if (mousePan && event.pointerId === mousePan.id) {
      mousePan = null;
      event.stopPropagation();
      return;
    }
    if (!touches.has(event.pointerId)) return;
    const second = pinch && pinch.ids[1] === event.pointerId;
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = null;
    if (second) event.stopPropagation(); // the editor never saw this finger go down
    // double-tap (touch / pen) → fit
    const t0 = tapStart;
    tapStart = null;
    if (!mockOn() || event.type !== 'pointerup' || !t0 || t0.id !== event.pointerId) return;
    const now = performance.now();
    if (now - t0.t > 300 || Math.hypot(event.clientX - t0.x, event.clientY - t0.y) > 10) return;
    if (lastTap && now - lastTap.t < 350 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30) {
      lastTap = null;
      focusAt(event.clientX, event.clientY);
    } else lastTap = { t: now, x: event.clientX, y: event.clientY };
  }
  function stageWheel(event: WheelEvent): void {
    if (!mockOn() || onStageControl(event)) return;
    event.preventDefault();
    match!.zoomAt(Math.exp(-event.deltaY * 0.0015), stagePoint(event.clientX, event.clientY));
  }
  function stageDblClick(event: MouseEvent): void {
    if (!mockOn() || onStageControl(event)) return;
    if ((event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents) return;
    focusAt(event.clientX, event.clientY);
  }
  function stageContextMenu(event: MouseEvent): void {
    if (mockOn() && !onStageControl(event)) event.preventDefault(); // right-drag pans
  }
  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }
  function spaceKey(event: KeyboardEvent): void {
    if (event.code !== 'Space' || typing(event.target) || onStageControl(event)) return;
    if (event.type === 'keydown') {
      if (!mockOn()) return;
      spaceHeld = true;
      event.preventDefault(); // no page scroll / button press while Space-panning
    } else if (spaceHeld) {
      spaceHeld = false;
      event.preventDefault();
    }
  }
  const zoomPct = $derived(match ? Math.round(match.zoom * 100) : 100);

  // ---------- object framing (Focus / Object crop / Follow selection) ----------
  // Focus frames the selected part's mesh, projected through the solved camera, with ~15 % padding (the whole
  // model when nothing is selected); Object crop jumps to the asset's mock-up crop rect (the object) — handy when
  // the wide room image is shown, Fit shows the whole image. Only the 2D window moves; the camera stays solved.
  let followSel = $state(false);
  let compareOpen = $state(false);
  let bringProblem = $state<BringProblem | null>(null);
  $effect(() => { modelKey; view; bringProblem = null; });
  const bringMessages: Record<BringProblem, string> = {
    camera: 'ค่ากล้องไม่ถูกต้อง · เปิดปรับค่า > กล้อง เพื่อตรวจสอบเลนส์และตำแหน่ง · ยังไม่เปลี่ยนงาน',
    image: 'ขนาดภาพอ้างอิงไม่ถูกต้อง · ลองเลือกภาพวัตถุใหม่ · ยังไม่เปลี่ยนงาน',
    geometry: 'โมเดลมีขนาดเป็นศูนย์หรือพิกัดผิดปกติ · กู้ตำแหน่งและขนาดจากต้นฉบับได้ โดยคงกล้องเดิมและย้อนกลับได้',
    transform: 'ตำแหน่งหรือขนาดของชิ้นส่วนไม่ถูกต้อง · ยังไม่เปลี่ยนงาน กรุณาส่งไฟล์ Edits JSON เพื่อตรวจสอบ',
  };
  const comparing = $derived(staged && !!match && (compareOpen || match.split > 0));
  $effect(() => { if (staged && match && match.split > 0) compareOpen = true; });
  function toggleComparison(): void {
    if (!match) return;
    compareOpen = !comparing;
    match.split = compareOpen ? 50 : 0;
  }
  /** In image views this edits the MODEL, never the solved camera or the image position. */
  function centerModel(recoverPlacement = false): void {
    if (!editor || !snap.ready || loading) {
      say(rendererError ? 'เปิดโมเดล 3D ไม่ได้ในเบราว์เซอร์นี้' : 'รอโมเดลโหลดก่อน');
      return;
    }
    if (view === 'orbit') {
      if (editor.centerModel()) say('ย้ายมุมมองกลับมาที่วัตถุแล้ว');
      return;
    }
    if (!match) return;
    const points = editor.pointsOf(null, Infinity);
    if (!points.length) { say('ไม่มีชิ้นส่วนที่มองเห็น เปิดการแสดงชิ้นส่วนก่อน'); return; }
    const r = match.imageRect;
    const result = editor.bringToImage(match.cam, { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }, points, recoverPlacement);
    if (!result) { bringProblem = editor.bringProblem ?? 'transform'; return; }
    bringProblem = null;
    compareOpen = false;
    match.split = 0;
    match.opacity = 100;
    match.diff = 'off';
    match.fit();
    say(recoverPlacement ? 'กู้ตำแหน่งและขนาดโมเดลจากต้นฉบับแล้ว · ย้อนกลับได้' : result.changed ? 'ย้ายและปรับขนาดโมเดลเข้ากลางภาพแล้ว · ย้อนกลับได้' : 'โมเดลอยู่กลางภาพและพอดีภาพแล้ว');
  }
  function undoBring(): void {
    if (editor?.undoBringToImage()) say('คืนตำแหน่งและขนาดโมเดลก่อน Bring to view แล้ว');
  }
  function focus(name: string | null = sel?.name ?? null): void {
    if (!match || !editor) return;
    let box = projectedBox(match.cam, editor.pointsOf(name));
    if (!box && name) box = projectedBox(match.cam, editor.pointsOf(null));
    if (box) match.frameBox(box);
  }
  /** Double-click / double-tap: on a part → select + focus it; on empty space → fit. */
  function focusAt(clientX: number, clientY: number): void {
    const name = editor?.partAt(clientX, clientY) ?? null;
    if (!name) {
      match?.fit();
      return;
    }
    if (snap.selectionMode === 'object') { editor?.setSelectionMode('object'); focus(null); }
    else { if (sel?.name !== name) editor!.select(name); focus(name); }
  }
  // Follow selection: re-frame whenever the selected part changes (in the staged views).
  let followed: string | null = null;
  $effect(() => {
    const name = sel?.name ?? null;
    const on = followSel && (view === 'mock' || view === 'match');
    untrack(() => {
      if (on && name && name !== followed) focus(name);
      followed = on ? name : null;
    });
  });

  /** Screen point of the selected part's origin (gizmo) — test hook. */
  let selAnchor = $state<string | null>(null);
  /** Screen points of the selected part's box centre / nearest box corner while editing its pivot — test hook. */
  let pivotHints = $state<string | null>(null);
  // Push camera + visible window + display mode into the 3D view.
  $effect(() => {
    if (!match) return;
    const cam = match.cam;
    const rect = match.viewRect;
    const display: DisplayMode = view === 'orbit' ? 'solid' : match.display;
    if (!editor) return;
    void snap;
    untrack(() => {
      editor!.setMatch(cam, rect);
      editor!.setDisplay(display);
      const a = editor!.selectedScreen();
      selAnchor = a ? `${a[0].toFixed(1)},${a[1].toFixed(1)}` : null;
      const h = snap.pivotMode || snap.pivotPicking ? editor!.pivotHints() : null;
      pivotHints = h ? JSON.stringify(h) : null;
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
      if (from === 'draft') say(T.files.openedDraft);
      else if (from === 'file') say(T.files.openedFile);
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
    try {
      editor = createModelEditor(canvas, (next) => (snap = next));
      if (match) editor.setMatch(match.cam, match.viewRect);
      void load();
    } catch (error) {
      console.warn('3D editor unavailable', error);
      rendererError = true;
      loading = false;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.defaultPrevented || typing(target)) return;
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
      } else if (event.key === 'Escape') {
        if (drawerOpen) { closeDrawer(); return; }
        if (match?.pick) { cancelPick(); return; }
        if (snap.pivotPicking) editor?.pickPivot(false);
        else editor?.select(null);
      } else if ((event.key === 'd' || event.key === 'D') && !mod) togglePivot();
      else if ((event.key === 'f' || event.key === 'F') && !mod && (view === 'mock' || view === 'match')) focus();
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
    // rotate / scale are not part of pivot editing: picking one leaves pivot mode
    if (next !== 'translate' && snap.pivotMode) editor?.setPivotMode(false);
    editor?.setMode(next);
  }
  // ---------- pivot (origin) editing ----------
  let pivotSpace = $state<'local' | 'world'>('local');
  function togglePivot(): void {
    if (!editor) return;
    const on = !editor.pivotMode;
    if (on) mode = 'translate';
    editor.setPivotMode(on);
    say(T.pivot.toast(on));
  }
  function setPivotValue(axis: 0 | 1 | 2, value: number): void {
    editor?.setPivotValue(pivotSpace, axis, value);
  }
  const pivotShown = $derived(sel ? (pivotSpace === 'local' ? sel.pivotLocalCm : sel.pivotWorldCm) : null);
  function pickView(next: ViewMode): void {
    view = next;
    if (next === 'match') drawerTab = 'camera';
    else if (next === 'orbit' && drawerTab === 'camera') drawerTab = 'object';
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
      say(T.files.glbFailed);
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
  const changeLabel = (c: FileChange) => (c.status === 'new' ? T.files.statusNew : T.files.statusModified);
  async function saveFiles(): Promise<void> {
    const sf = files;
    if (!sf) return;
    if (sf.api !== 'on') {
      say(T.files.noApi);
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
        say(T.files.glbFailed);
        return;
      }
    }
    if (!sf.changes.length && !glb) {
      say(T.files.nothingToSave);
      return;
    }
    const res = await sf.save(sf.changes, glb);
    if (!res.ok) {
      say(T.files.saveFailed(res.error));
      return;
    }
    copied = false;
    refreshFiles();
    say(T.files.saved(res.paths.length));
  }
  function keepDraft(): void {
    if (files) files.dismissed = true;
  }
  function revertToFile(): void {
    const sf = files;
    if (!sf || !sf.canRevert) return;
    if (!confirm(T.files.revertConfirm)) return;
    for (const c of sf.changes) {
      if (c.status !== 'modified') continue;
      if (c.kind === 'match' && match) {
        if (match.loadFile(sf.matchFile)) match.save();
      } else if (c.kind === 'edits' && c.variant) {
        const state = sf.editsFile(c.variant);
        if (c.variant === option.variant.id && editor && state) editor.loadState(state);
        else {
          try {
            appStorage.removeItem(editsStorageKey(option.asset.slug, c.variant));
          } catch {
            /* ignore */
          }
        }
      }
    }
    refreshFiles();
    say(T.files.reverted);
  }
  function downloadSource(c: FileChange): void {
    download(new Blob([stableStringify(c.data)], { type: 'application/json' }), c.name);
    say(T.files.downloaded(c.name, files?.dir ?? ''));
  }
  async function copyGit(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      say(T.files.copyFailed);
    }
  }

  const axes = [0, 1, 2] as const;
  const posLabels = ['X ซ้าย–ขวา', 'Y สูง–ต่ำ', 'Z หน้า–หลัง'];
  const sizeLabels = ['กว้าง (X)', 'สูง (Y)', 'ลึก (Z)'];
  const rotLabels = ['X', 'Y', 'Z'];
  const icons: Record<string, string> = {
    center: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 12h8M12 8v8',
    compare: 'M4 5h16v14H4V5zm8-3v20M9 9l-3 3 3 3m6-6l3 3-3 3',
    back: 'M14 5l-7 7 7 7', undo: 'M9 6L4 11l5 5M4 11h10a6 6 0 016 6', redo: 'M15 6l5 5-5 5m5-5H10a6 6 0 00-6 6',
    orbit: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 9l8-4.5M12 12L4 7.5M12 12v9',
    mock: 'M3 4h18v16H3V4zm0 12l5-5 4 4 3-3 6 6M16 8h.01',
    match: 'M3 3h6M3 3v6m18-6h-6m6 0v6M3 21h6m-6 0v-6m18 6h-6m6 0v-6M5 17l7-12 7 12H5z',
    translate: 'M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3m12-6l3 3-3 3',
    rotate: 'M20 8a8 8 0 10.2 7M20 3v5h-5', scale: 'M14 3h7v7m0-7L10 14M10 4H3v17h17v-7',
    snap: 'M5 4v9a7 7 0 0014 0V4h-4v9a3 3 0 01-6 0V4H5zm0 5h4m6 0h4',
    fit: 'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6', crop: 'M7 3v14h14M3 7h14v14',
    focus: 'M12 3v3m0 12v3M3 12h3m12 0h3M12 8a4 4 0 100 8 4 4 0 000-8',
    settings: 'M4 7h16M4 17h16M8 4v6m8 4v6', close: 'M6 6l12 12M18 6L6 18',
    trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  };
  const modes: { id: GizmoMode; label: string }[] = [
    { id: 'translate', label: 'ย้าย' },
    { id: 'rotate', label: 'หมุน' },
    { id: 'scale', label: 'ขนาด' },
  ];
</script>

{#snippet icon(name: string)}
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={icons[name]} /></svg>
{/snippet}

{#snippet pivotIcon()}
  <!-- origin / pivot: a ringed dot with ticks (the ⌖ glyph is missing from common fonts) -->
  <svg class="pivot-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
  </svg>
{/snippet}

<svelte:window onkeydown={(event) => { drawerKeys(event); spaceKey(event); }} onkeyup={spaceKey} onblur={() => (spaceHeld = false)} />

<div class="editor">

  <div class="body">
    <div
      class="viewport"
      class:matching={view === 'match'}
      class:pivoting={view === 'match' && (snap.pivotMode || snap.pivotPicking)}
      class:mockzoom={view === 'mock' && !!match}
      class:spacepan={spaceHeld && view === 'mock'}
      bind:this={stageEl}
      bind:clientWidth={vw}
      bind:clientHeight={vh}
      onpointerdowncapture={stageDown}
      onpointermovecapture={stageMove}
      onpointerupcapture={stageUp}
      onpointercancelcapture={stageUp}
      onwheel={stageWheel}
      ondblclick={stageDblClick}
      oncontextmenu={stageContextMenu}
      data-stage
      data-zoom={match ? match.zoom.toFixed(4) : null}
      data-view-rect={match && staged ? [match.viewRect.x0, match.viewRect.y0, match.viewRect.w, match.viewRect.h].map((v) => v.toFixed(2)).join(',') : null}
      data-focus-box={match?.focusBox ? [match.focusBox.x0, match.focusBox.y0, match.focusBox.x1, match.focusBox.y1].map((v) => v.toFixed(2)).join(',') : null}
      data-sel-anchor={selAnchor}
      data-pivot={sel ? JSON.stringify({ local: sel.pivotLocalCm, world: sel.pivotWorldCm, center: sel.centerWorldCm }) : null}
      data-pivot-mode={snap.pivotMode ? (snap.pivotPicking ? 'pick' : 'on') : snap.pivotPicking ? 'pick' : null}
      data-pivot-snap={snap.pivotSnap}
      data-pivot-hints={pivotHints}
      role="presentation"
    >
      {#if staged && match}
        <img class="ref" src={match.imageRect.src} alt="Mock-up" style={imgStyle} draggable="false" data-ref-image={match.image} />
      {/if}
      <canvas bind:this={canvas} style={canvasStyle} aria-label={snap.selectionMode === 'object' ? 'พื้นที่แก้โมเดล แตะเพื่อเลือกทั้งวัตถุ' : 'พื้นที่แก้โมเดล แตะชิ้นส่วนเพื่อเลือก'}></canvas>
      {#if comparing && match}
        <CompareDivider bind:value={match.split} />
      {/if}
      {#if view === 'match' && match}
        <GuideOverlay st={match} onModelTap={modelTap} onChange={() => match?.save()} {say} modelCanvas={canvas} />
        {#if diffOn || (match.dragging && match.liveFail)}
          <div class="live-badges">
            {#if diffOn}<span class="badge diff" data-diff-badge>{T.diff.badge}</span>{/if}
            {#if match.dragging && match.liveFail}<span class="badge fail" data-solve-fail>{T.diff.solveFailed}</span>{/if}
          </div>
        {/if}
        {#if match.pick}
          <div class="pick-hint" data-editor-chrome><span>{match.pick.want === 'model' ? 'แตะจุดบนโมเดล' : 'แตะจุดเดียวกันบนภาพ'}</span><button type="button" onclick={cancelPick}>ยกเลิก</button></div>
        {/if}
      {/if}
      {#if snap.pivotPicking}
        <div class="pick-hint" data-pivot-pick-hint data-editor-chrome><span>{T.pivot.pickHint}</span><button type="button" onclick={cancelPick}>ยกเลิก</button></div>
      {/if}
      {#if loading}<p class="loading">กำลังโหลดโมเดล…</p>{/if}
      <header class="viewport-header" data-editor-chrome>
        <a class="e-back icon-button" href={`#/assets?asset=${encodeURIComponent(option.asset.slug)}`} aria-label="กลับไปคลังแอสเซ็ต (Asset browser)" title="กลับไปคลังแอสเซ็ต">{@render icon('back')}</a>
        <h1>3D Editor</h1>
        <div class="view-switch dock" role="radiogroup" aria-label="มุมกล้อง">
          {#each [['orbit', '3D', 'หมุนดูอิสระ'], ['mock', 'ภาพ', 'มุม Mock-up'], ['match', 'จัดมุม', 'จับมุมกล้อง']] as const as [id, label, title] (id)}
            <button type="button" role="radio" aria-checked={view === id} class:on={view === id} data-view={id} aria-label={title} {title} disabled={id !== 'orbit' && !ref} onclick={() => pickView(id)}>{@render icon(id)}<span>{label}</span></button>
          {/each}
        </div>
        <button type="button" class="drawer-toggle icon-button" class:on={drawerOpen} aria-label="คุณสมบัติ" title="เปิด/ปิดคุณสมบัติ" aria-expanded={drawerOpen} aria-controls="editor-properties" bind:this={drawerToggle} onclick={toggleDrawer} data-drawer-toggle>{@render icon('settings')}<span>ปรับค่า</span>{#if files?.changes.length}<i class="dirty-dot" aria-label="มีงานที่ยังไม่บันทึก"></i>{/if}</button>
      </header>
      <div class="selection-switch dock" data-editor-chrome role="group" aria-label="เลือกวัตถุหรือชิ้นส่วน">
        <button type="button" class:on={snap.selectionMode === 'object'} aria-pressed={snap.selectionMode === 'object'} onclick={() => editor?.setSelectionMode('object')} data-selection="object" title="ย้าย หมุน และย่อขยายทุกชิ้นพร้อมกัน">ทั้งชิ้น</button>
        <button type="button" class:on={snap.selectionMode === 'part'} aria-pressed={snap.selectionMode === 'part'} onclick={() => editor?.setSelectionMode('part')} data-selection="part" title="แตะเพื่อแก้เฉพาะชิ้นส่วน">แยกชิ้น</button>
      </div>
      <div class="tool-rail dock" data-editor-chrome aria-label="เครื่องมือ">
        {#if view === 'match' && match}
          {#each axes as a (a)}<button type="button" class="axis-tool" style="--axis:{AXIS_COLORS[a]}" aria-label={`เพิ่มเส้น ${AXIS_NAMES[a]}`} title={`เพิ่มเส้น ${AXIS_NAMES[a]}`} data-add-line-quick={a} onclick={() => addGuide(a)}><b>+{AXIS_NAMES[a]}</b><span>เส้น</span></button>{/each}
          <button type="button" aria-label="ลบเส้นที่เลือก" title="ลบเส้นที่เลือก" disabled={match.selectedLine === null} onclick={removeGuide} data-act="del-line-quick">{@render icon('trash')}<span>ลบเส้น</span></button>
          <button type="button" class:on={match.snap} aria-pressed={match.snap} aria-label={T.snap.label} title={T.snap.title} data-stage-snap onclick={toggleGuideSnap}>{@render icon('snap')}<span>ดูดเส้น</span></button>
        {:else}
          {#each modes as m (m.id)}<button type="button" aria-pressed={mode === m.id} class:on={mode === m.id} data-mode={m.id} title={m.label} onclick={() => pickMode(m.id)}>{@render icon(m.id)}<span>{m.label}</span></button>{/each}
          <button type="button" class:on={snapOn} aria-pressed={snapOn} aria-label="แม่เหล็กโมเดล" title="เปิด/ปิดแม่เหล็กโมเดล" data-snap onclick={toggleSnap}>{@render icon('snap')}<span>แม่เหล็ก</span></button>
        {/if}
        <button type="button" class:on={snap.pivotMode} aria-pressed={snap.pivotMode} aria-label={T.pivot.mode} title={T.pivot.modeTitle} disabled={snap.selectionMode === 'object'} onclick={togglePivot} data-act="pivot-mode">{@render pivotIcon()}<span>จุดหมุน</span></button>
      </div>
      {#if staged && match}
        <div class="nav-rail dock" data-editor-chrome data-mock-zoom aria-label="ปรับมุมมอง">
          <button type="button" aria-label={T.stage.zoomIn} title={T.stage.zoomIn} data-zoom-in onclick={() => match?.zoomAt(1.4)}>{@render icon('plus')}<span>ซูมเข้า</span></button>
          <button type="button" aria-label={T.stage.zoomOut} title={T.stage.zoomOut} data-zoom-out onclick={() => match?.zoomAt(1 / 1.4)}>{@render icon('minus')}<span>ซูมออก</span></button>
          <button type="button" aria-label={T.stage.fit} title={T.stage.fit} data-zoom-fit onclick={() => match?.fit()}>{@render icon('fit')}<span>พอดี</span></button>
          <button type="button" class="center-model" aria-label="Bring to view · นำโมเดลเข้ากลางภาพ" title="Bring to view: ย้ายและปรับขนาดโมเดลทั้งชิ้นให้พอดีกลางภาพอ้างอิง คงมุมกล้องเดิม · ย้อนกลับได้" data-center-model onclick={() => centerModel()}>{@render icon('center')}<span>เข้าภาพ</span></button>
          <button type="button" class:on={comparing} aria-pressed={comparing} aria-label="เทียบก่อนและหลัง" onclick={toggleComparison} data-compare-toggle title="เปิด/ปิดเส้นเลื่อนเทียบภาพก่อนกับโมเดลหลัง">{@render icon('compare')}<span>เทียบภาพ</span></button>
          <button type="button" aria-label={T.stage.focus} title={T.stage.focusTitle} data-zoom-focus onclick={() => focus()}>{@render icon('focus')}<span>โฟกัส</span></button>
          <button type="button" aria-label={T.stage.crop} title={T.stage.cropTitle} data-zoom-crop onclick={() => match?.cropPreset()}>{@render icon('crop')}<span>ครอป</span></button>
        </div>
      {:else}
        <div class="nav-rail dock" data-editor-chrome aria-label="ปรับมุมมอง">
          <button type="button" class="center-model" aria-label="ย้ายกลางจอ" title="นำวัตถุทั้งชิ้นกลับกลางจอ โดยไม่ย้ายชิ้นส่วน" data-center-model onclick={() => centerModel()}>{@render icon('center')}<span>กลางจอ</span></button>
        </div>
      {/if}
      {#if staged && match}
        <div class="match-dock dock" data-editor-chrome>
          <div role="radiogroup" aria-label="ภาพอ้างอิง">
            <button type="button" role="radio" aria-checked={match.image === 'crop'} class:on={match.image === 'crop'} data-reference-preset="crop" onclick={() => chooseImage('crop')}>เฉพาะชิ้น</button>
            <button type="button" role="radio" aria-checked={match.image === 'wide'} class:on={match.image === 'wide'} disabled={!ref?.mockup} data-reference-preset="wide" onclick={() => chooseImage('wide')}>ทั้งห้อง</button>
          </div>
          {#if view === 'match'}<button type="button" class="primary solve" onclick={solveCamera} data-act="solve-lines-quick">คำนวณกล้อง</button>{/if}
        </div>
      {/if}
      {#if bringProblem}
        <div class="bring-feedback" role="status" data-editor-chrome data-bring-error={bringProblem}>
          <span>{bringMessages[bringProblem]}</span>
          {#if bringProblem === 'geometry'}<button type="button" data-recover-placement onclick={() => centerModel(true)}>กู้ตำแหน่งและขนาด</button>{/if}
          <button type="button" onclick={() => bringProblem = null}>ปิด</button>
        </div>
      {:else if snap.canUndoBring}
        <div class="bring-feedback" role="status" data-editor-chrome data-bring-feedback>
          <span>ย้าย + ปรับขนาดโมเดลเข้าภาพแล้ว</span>
          <button type="button" onclick={undoBring} data-undo-bring>ย้อนกลับ</button>
        </div>
      {/if}
      <div class="history dock" data-editor-chrome>
        <button type="button" onclick={undo} disabled={lineHistory ? lineHistory.lineUndoCount === 0 : !snap.canUndo} aria-label={T.common.undoAria} title={T.common.undoAria}>{@render icon('undo')}</button>
        <button type="button" onclick={redo} disabled={lineHistory ? lineHistory.lineRedoCount === 0 : !snap.canRedo} aria-label={T.common.redoAria} title={T.common.redoAria}>{@render icon('redo')}</button>
      </div>
      <div class="view-status" aria-live="polite"><span>{snap.wholeSelected ? `${option.asset.title} · ทั้งชิ้น` : sel ? partLabel(sel.name) : snap.selectionMode === 'object' ? 'แตะเพื่อเลือกทั้งวัตถุ' : 'แตะเพื่อเลือกชิ้นส่วน'}</span>{#if staged}<span data-zoom-pct>{zoomPct}%</span>{/if}</div>
      {#if rendererError}<p class="render-error" role="status">เบราว์เซอร์นี้เปิด WebGL ไม่ได้<br /><small>ยังดูภาพอ้างอิงและตั้งค่ากล้องได้</small></p>{/if}

    </div>

    <aside class="panel" class:open={drawerOpen} id="editor-properties" aria-labelledby="properties-title" hidden={!drawerOpen} data-properties-drawer data-editor-chrome>
      <div class="drawer-head"><h2 id="properties-title" tabindex="-1" bind:this={drawerHeading}>คุณสมบัติ <small>Properties</small></h2><button type="button" class="icon-button" aria-label="ปิดคุณสมบัติ" onclick={closeDrawer} data-drawer-close>{@render icon('close')}</button></div>
      <div class="drawer-tabs" role="tablist" aria-label="หมวดคุณสมบัติ">
        {#each drawerTabs as t, i (t.id)}<button type="button" role="tab" id={`tab-${t.id}`} aria-selected={drawerTab === t.id} aria-controls={`panel-${t.id}`} tabindex={drawerTab === t.id ? 0 : -1} class:on={drawerTab === t.id} onclick={() => chooseDrawerTab(t.id)} onkeydown={(event) => tabKey(event, i)} data-drawer-tab={t.id}>{t.label}</button>{/each}
      </div>
      <div class="drawer-content">
      <div role="tabpanel" id="panel-camera" aria-labelledby="tab-camera" hidden={drawerTab !== 'camera'}>
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
        <label class="check" title={T.stage.followTitle}>
          <input type="checkbox" bind:checked={followSel} data-follow />
          <span>{T.stage.follow}</span>
        </label>
        <p class="tip" data-mock-hint>{T.stage.mockHint}</p>
      {/if}
      {#if view === 'match' && match}
        <CameraPanel st={match} onChange={() => match?.save()} {say} {download} dims={modelDims} />
      {/if}

      </div>
      <div role="tabpanel" id="panel-object" aria-labelledby="tab-object" hidden={drawerTab !== 'object'}>
      <label class="field">
        <span>โมเดล</span>
        <select value={modelKey} onchange={(e) => changeModel(e.currentTarget.value)} data-model>
          {#each options as o (o.key)}
            <option value={o.key}>{o.asset.title} · {o.variant.label}</option>
          {/each}
        </select>
      </label>


      {#if snap.wholeSelected}
        <section class="selected" data-selected-whole>
          <h2>{option.asset.title} · ทั้งชิ้น</h2>
          <p class="tip">ย้ายและหมุนรอบจุดกึ่งกลางทั้งวัตถุ · ขนาดเปลี่ยนทุกแกนเท่ากันเพื่อรักษารูปทรง ชิ้นที่ซ่อนจะตามไปด้วย ย้อนกลับได้</p>
          {#each axes as axis}
            <div class="row"><span>{rotLabels[axis]}</span>
              <button type="button" onclick={() => editor?.transformWhole('translate', axis, -posStep)} aria-label={`ย้ายทั้งชิ้น ${rotLabels[axis]} ลบ ${posStep} ซม.`}>−{posStep} ซม.</button>
              <button type="button" onclick={() => editor?.transformWhole('translate', axis, posStep)} aria-label={`ย้ายทั้งชิ้น ${rotLabels[axis]} บวก ${posStep} ซม.`}>+{posStep} ซม.</button>
            </div>
            <div class="row"><span>หมุน {rotLabels[axis]}</span>
              <button type="button" onclick={() => editor?.transformWhole('rotate', axis, -rotStep)}>−{rotStep}°</button>
              <button type="button" onclick={() => editor?.transformWhole('rotate', axis, rotStep)}>+{rotStep}°</button>
            </div>
          {/each}
          <div class="actions"><button type="button" data-whole-scale="down" onclick={() => editor?.transformWhole('scale', 0, 1 / 1.1)}>ย่อทั้งชิ้น</button><button type="button" data-whole-scale="up" onclick={() => editor?.transformWhole('scale', 0, 1.1)}>ขยายทั้งชิ้น</button></div>
          <div class="actions"><button type="button" disabled={!snap.canUndo} onclick={() => editor?.undo()}>ย้อนการแก้โมเดล</button><button type="button" disabled={!snap.canRedo} onclick={() => editor?.redo()}>ทำซ้ำการแก้โมเดล</button></div>
          <p class="tip">ต้องการแก้สี จุดหมุน หรือชิ้นส่วนเดียว ให้เลือก “แยกชิ้น”</p>
        </section>
      {:else if sel}
        <section class="selected" data-selected={sel.name}>
          <h2>{partLabel(sel.name)} <small>{sel.name}</small></h2>
          <p class="sub">ตำแหน่ง (ซม.)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{posLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('position', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" step={posStep} value={sel.positionCm[i]} aria-label={`ตำแหน่ง ${posLabels[i]} ซม.`} data-field="position-{i}"
                onchange={(e) => setValue('position', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('position', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <p class="sub">ขนาด (ซม.)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{sizeLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('size', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" min="0.1" step={posStep} value={sel.sizeCm[i]} aria-label={`ขนาด ${sizeLabels[i]} ซม.`} data-field="size-{i}"
                onchange={(e) => setValue('size', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('size', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <p class="sub">หมุน (องศา)</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{rotLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('rotation', i, -1)} aria-label="ลด">−</button>
              <input type="number" inputmode="decimal" step={rotStep} value={sel.rotationDeg[i]} aria-label={`หมุน ${rotLabels[i]} องศา`} data-field="rotation-{i}"
                onchange={(e) => setValue('rotation', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('rotation', i, 1)} aria-label="เพิ่ม">+</button>
            </div>
          {/each}
          <div class="pivot-box" data-pivot-panel>
            <div class="pivot-head">
              <b>{T.pivot.heading}</b>
              <button type="button" class="small" class:on={snap.pivotMode} aria-pressed={snap.pivotMode} title={T.pivot.modeTitle} onclick={togglePivot}
                data-act="pivot-mode-panel">{@render pivotIcon()} {T.pivot.mode}</button>
            </div>
            {#if snap.pivotMode}<p class="tip small">{T.pivot.modeOnly}</p>{/if}
            {#if snap.pivotSnap}<p class="tip small" data-pivot-snapped>{T.pivot.snapped(snap.pivotSnap)}</p>{/if}
            <div class="actions pivot-presets">
              <button type="button" class="small" onclick={() => editor?.pivotPreset('center')} data-act="pivot-center">{T.pivot.center}</button>
              <button type="button" class="small" onclick={() => editor?.pivotPreset('bottom')} data-act="pivot-bottom">{T.pivot.bottom}</button>
              <button type="button" class="small" class:on={snap.pivotPicking} onclick={() => editor?.pickPivot(!snap.pivotPicking)} data-act="pivot-pick"
                >{snap.pivotPicking ? T.pivot.pickCancel : T.pivot.pick}</button
              >
              <button type="button" class="small" onclick={() => editor?.pivotPreset('reset')} disabled={!sel.pivotSet} data-act="pivot-reset">{T.pivot.reset}</button>
            </div>
            <div class="seg" role="radiogroup" aria-label={T.pivot.spaceAria}>
              {#each [['local', T.pivot.local], ['world', T.pivot.world]] as const as [id, label] (id)}
                <button type="button" role="radio" aria-checked={pivotSpace === id} class:on={pivotSpace === id} data-pivot-space={id}
                  onclick={() => (pivotSpace = id)}>{label}</button>
              {/each}
            </div>
            <p class="sub" data-pivot-sub={pivotSpace}>{pivotSpace === 'local' ? T.pivot.localSub : T.pivot.worldSub}</p>
            {#each axes as i (i)}
              <div class="row pivot-row">
                <span>{rotLabels[i]}</span>
                <input type="number" inputmode="decimal" step={posStep} value={pivotShown?.[i] ?? 0} aria-label={`จุดหมุน ${rotLabels[i]}`} data-field="pivot-{i}"
                  onchange={(e) => setPivotValue(i, e.currentTarget.valueAsNumber)} />
              </div>
            {/each}
          </div>
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
        <p class="tip">แตะชิ้นส่วนในภาพ หรือเลือกจากแท็บชิ้นส่วน แล้วลากลูกศรหรือพิมพ์ตัวเลข</p>
      {/if}

      </div>
      <div role="tabpanel" id="panel-parts" aria-labelledby="tab-parts" hidden={drawerTab !== 'parts'}>
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

      </div>
      <div role="tabpanel" id="panel-files" aria-labelledby="tab-files" hidden={drawerTab !== 'files'}>
      {#if files?.showBadge}
        <div class="unsaved" role="status" data-unsaved>
          <b>{T.files.unsaved}</b>
          <ul>
            {#each files.changes as c (c.name)}
              <li><code>{c.name}</code> · {changeLabel(c)}</li>
            {/each}
          </ul>
          <div class="actions">
            {#if files.api === 'on'}
              <button type="button" class="primary" onclick={saveFiles} disabled={files.saving} data-act="save-files-badge">{T.files.saveButton}</button>
            {/if}
            <button type="button" onclick={keepDraft} data-act="keep-draft">{T.files.keepDraft}</button>
            {#if files.canRevert}
              <button type="button" class="danger" onclick={revertToFile} data-act="revert-file">{T.files.revert}</button>
            {/if}
          </div>
        </div>
      {/if}

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
          <h2>{T.files.heading}</h2>
          <p class="tip"><code>{files.dir}/</code></p>
          {#if files.changes.length}
            <ul class="changes">
              {#each files.changes as c (c.name)}
                <li data-change={c.name}>
                  <code>{c.name}</code> · {changeLabel(c)}
                  {#if files.api !== 'on'}
                    <button type="button" class="small" onclick={() => downloadSource(c)} data-act="download-source">{T.files.download}</button>
                  {/if}
                </li>
              {/each}
            </ul>
          {:else if files.api !== 'probing'}
            <p class="tip ok" data-in-sync>{T.files.inSync}{files.hasFiles ? '' : T.files.noFilesYet}</p>
          {/if}
          {#if files.api === 'on'}
            <label class="check">
              <input type="checkbox" bind:checked={withGlb} data-with-glb />
              <span>{T.files.includeGlb} <code>{glbFileName(option.variant.id)}</code> {T.files.includeGlbNote}</span>
            </label>
            <div class="actions col">
              <button type="button" class="primary" onclick={saveFiles} disabled={files.saving || (!files.changes.length && !withGlb)} data-act="save-files"
                >{files.saving ? T.files.saving : T.files.saveButton} <small>Ctrl+S</small></button
              >
            </div>
            {#if files.lastSave}
              <div class="saved" data-saved>
                <p>{T.files.savedList}</p>
                <ul>
                  {#each files.lastSave.paths as path (path)}<li><code>{path}</code></li>{/each}
                </ul>
                <p>{T.files.thenCommit}</p>
                <pre data-git>{files.lastSave.git}</pre>
                <button type="button" class="small" onclick={() => copyGit(files!.lastSave!.git)}>{copied ? T.files.copied : T.files.copyCommand}</button>
              </div>
            {/if}
          {:else if files.api === 'off'}
            <p class="tip" data-dev-hint>
              {T.files.devHintLead} <code>npm run dev</code> {T.files.devHintIn} <code>games/never-ending-story/</code>{T.files.devHintThen}
              <code>{files.dir}/</code> {T.files.devHintTail}
            </p>
          {/if}
        </section>
      {/if}
      </div>
      </div>
    </aside>
  </div>

  {#if toast}<p class="e-toast" role="status">{toast}</p>{/if}
</div>

<style>
  .editor { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; background: #16202b; color: #eaf6ff; font-size: 14px; user-select: none; }
  .body { flex: 1; min-height: 0; position: relative; }
  .viewport { position: absolute; inset: 0; background: #22303d; overflow: hidden; isolation: isolate; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .ref { position: absolute; display: block; pointer-events: none; object-fit: fill; max-width: none; }
  [hidden] { display: none !important; }
  button, .icon-button { font: inherit; color: inherit; min-height: 44px; min-width: 44px; box-sizing: border-box; border-radius: 8px; border: 1px solid #41566c; background: #1b2b3b; font-weight: 650; padding: 4px 10px; cursor: pointer; touch-action: manipulation; }
  button:disabled { opacity: 0.35; cursor: default; }
  button.on { background: #9bdbfb; border-color: #b3e8ff; color: #102331; }
  button.primary { background: #ffcf4d; border-color: #ffe294; color: #2a1a00; }
  button.danger { border-color: #a5484a; color: #ffb3b3; }
  button:focus-visible, a:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  .dock, .icon-button { background: rgba(15, 25, 36, 0.94); border: 1px solid #3a4a5a; box-shadow: 0 3px 14px #07111b4d; backdrop-filter: blur(12px); }
  .dock { border-radius: 11px; display: flex; gap: 2px; padding: 3px; }
  .dock button { border-color: transparent; background: transparent; }
  .dock button.on { background: #9bdbfb; color: #102331; }
  .viewport-header { position: absolute; z-index: 12; top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); display: flex; align-items: center; gap: 8px; pointer-events: none; }
  .viewport-header > * { pointer-events: auto; }
  h1 { margin: 0; font-size: 16px; font-weight: 650; color: #cee0ed; letter-spacing: 0.02em; text-shadow: 0 1px 5px #000; }
  .e-back { display: grid; place-items: center; width: 44px; padding: 0; text-decoration: none; }
  .view-switch { margin-left: auto; }
  .view-switch button, .drawer-toggle, .tool-rail button, .nav-rail button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; width: 46px; height: 48px; padding: 2px; }
  .view-switch button span, .drawer-toggle span, .tool-rail span, .nav-rail span { font-size: 10px; line-height: 1.2; white-space: nowrap; }
  .drawer-toggle { position: relative; width: 50px; height: 54px; }
  .dirty-dot { position: absolute; right: 5px; top: 5px; width: 7px; height: 7px; border-radius: 50%; background: #ffcf4d; border: 1px solid #172332; }
  .tool-rail, .nav-rail, .history, .match-dock { position: absolute; z-index: 10; }
  .selection-switch { position: absolute; top: calc(74px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 12; }
  .selection-switch button { font-size: 12px; padding: 4px 8px; }
  .tool-rail { top: calc(74px + env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); flex-direction: column; }
  .nav-rail { top: calc(74px + env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); flex-direction: column; }
  .axis-tool b { font-size: 19px; line-height: 23px; color: var(--axis); }
  .history { left: max(8px, env(safe-area-inset-left)); bottom: max(8px, env(safe-area-inset-bottom)); }
  .history button { display: grid; place-items: center; width: 44px; padding: 0; }
  .match-dock { bottom: calc(66px + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-50%); align-items: center; max-width: calc(100% - 16px); }
  .match-dock > div { display: flex; gap: 2px; }
  .match-dock .solve { background: #ffcf4d; border-color: #ffcf4d; color: #2a1a00; white-space: nowrap; }
  .view-status { position: absolute; right: max(10px, env(safe-area-inset-right)); bottom: calc(19px + env(safe-area-inset-bottom)); z-index: 6; display: flex; align-items: center; gap: 8px; color: #c5d7e6; font-size: 11px; max-width: calc(100% - 120px); pointer-events: none; }
  .view-status span { padding: 3px 6px; background: #0f1924bf; border-radius: 5px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .live-badges { position: absolute; left: 72px; top: calc(76px + env(safe-area-inset-top)); display: flex; flex-direction: column; gap: 4px; z-index: 4; pointer-events: none; }
  .badge { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 8px; background: #0009; width: max-content; }
  .badge.diff { color: #8fdfff; }
  .badge.fail { color: #ffb3b3; }
  .bring-feedback { position: absolute; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 15; background: #172d36f5; border: 1px solid #8fdfff; border-radius: 12px; padding: 6px 8px; max-width: calc(100% - 140px); display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px; text-align: center; font-size: 12px; }
  .bring-feedback button { min-height: 44px; font-size: 12px; }
  .nav-rail button.center-model { color: #ffe14d; }
  .nav-rail button.center-model span { font-size: 10px; }
  .pick-hint { position: absolute; left: 50%; top: calc(76px + env(safe-area-inset-top)); transform: translateX(-50%); margin: 0; z-index: 11; background: #3a1d3af5; border: 1px solid #ff4dd8; border-radius: 10px; padding: 5px 8px; display: flex; gap: 8px; align-items: center; max-width: calc(100% - 150px); font-size: 13px; }
  .pick-hint button { flex: 0 0 auto; }
  .loading, .render-error { position: absolute; left: 50%; top: 48%; transform: translate(-50%, -50%); margin: 0; padding: 10px 14px; border-radius: 10px; background: #101c28e6; text-align: center; pointer-events: none; max-width: calc(100% - 150px); width: max-content; z-index: 5; }
  .render-error { color: #d3deea; font-size: 13px; border: 1px solid #506070; }
  .render-error small { color: #9fb3c5; font-size: 11px; }
  .viewport.pivoting :global(svg.guides), .viewport.pivoting :global(svg.guides *) { pointer-events: none; }
  .viewport.mockzoom { touch-action: none; overscroll-behavior: contain; }
  .viewport.spacepan, .viewport.spacepan canvas { cursor: grab; }
  .panel { position: absolute; z-index: 20; top: calc(74px + env(safe-area-inset-top)); bottom: max(8px, env(safe-area-inset-bottom)); right: max(8px, env(safe-area-inset-right)); width: 370px; max-width: calc(100% - 16px); display: flex; flex-direction: column; border: 1px solid #465a6d; border-radius: 14px; background: #142130f7; box-shadow: 0 12px 40px #0006; backdrop-filter: blur(16px); overflow: hidden; user-select: text; }
  .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 4px 14px; gap: 8px; flex: 0 0 auto; }
  .drawer-head h2 { margin: 0; font-size: 16px; outline: none; }
  .drawer-head h2 small { display: block; margin: 0; font-size: 11px; letter-spacing: 0.04em; }
  .drawer-head .icon-button { display: grid; place-items: center; padding: 0; box-shadow: none; }
  .drawer-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 3px; padding: 4px 8px 8px; border-bottom: 1px solid #344759; flex: 0 0 auto; }
  .drawer-tabs button { font-size: 13px; padding: 0 4px; border: 0; }
  .drawer-content { overflow-y: auto; overflow-x: hidden; min-height: 0; padding: 12px 12px 24px; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: thin; }
  .field { display: grid; gap: 4px; margin: 0 0 10px; font-size: 14px; color: #c5d7e6; }
  select { font: inherit; font-size: 16px; min-height: 44px; min-width: 0; width: 100%; border-radius: 8px; border: 1px solid #41566c; background: #10202e; color: #eaf6ff; padding: 0 8px; }
  .slider input { width: 100%; height: 44px; }
  .seg { display: flex; gap: 6px; margin: 0 0 10px; }
  .seg button { flex: 1; padding: 4px; }
  .pivot-box { margin: 10px 0; padding: 8px; border: 1px solid #3a5a74; border-radius: 10px; }
  .pivot-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .pivot-box button.on { background: #ffe14d; color: #1b1b1b; }
  .pivot-presets { flex-wrap: wrap; margin-bottom: 8px; }
  .row.pivot-row { grid-template-columns: 1fr minmax(0, 140px); }
  .pivot-ico { display: inline-block; vertical-align: middle; }
  .tip.small { font-size: 13px; margin: 2px 0 6px; }
  h2 { font-size: 16px; margin: 10px 0 8px; }
  h2 small { font-size: 12px; color: #8fb3cc; font-weight: 400; margin-left: 6px; overflow-wrap: anywhere; }
  .sub { margin: 10px 0 4px; font-size: 13px; color: #8fdfff; font-weight: 700; }
  .tip { font-size: 14px; color: #b4c7d7; margin: 8px 0; line-height: 1.55; overflow-wrap: anywhere; }
  .selected { background: #1d2c3a; border: 1px solid #637762; border-radius: 10px; padding: 4px 8px 10px; margin: 6px 0 4px; }
  .row { display: grid; grid-template-columns: minmax(50px, 1fr) 44px minmax(48px, 76px) 44px; gap: 4px; align-items: center; margin: 0 0 6px; }
  .row span { font-size: 13px; }
  .row input[type='number'] { font: inherit; font-size: 16px; width: 100%; min-width: 0; min-height: 44px; box-sizing: border-box; border-radius: 8px; border: 1px solid #3a5a74; background: #0b1620; color: #fff; padding: 0 4px; text-align: right; }
  .step { padding: 0; font-size: 22px; }
  .row.color { grid-template-columns: 1fr 60px 80px; margin-top: 10px; }
  .row.color input { width: 60px; height: 44px; border: none; background: none; padding: 0; }
  .small { min-height: 44px; font-size: 13px; padding: 0 8px; }
  .actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .actions button { flex: 1 1 auto; }
  .actions.col { flex-direction: column; }
  .unsaved { margin: 0 0 12px; padding: 10px; border: 1px solid #ffcf4d; border-radius: 10px; background: #2b2a1a; color: #fff3c4; font-size: 14px; }
  .unsaved ul, .source ul { margin: 6px 0 0; padding-left: 20px; }
  .source code, .unsaved code { font-size: 12px; overflow-wrap: anywhere; }
  .source .changes li { margin: 0 0 6px; }
  .source .changes button { margin-left: 6px; }
  .tip.ok { color: #9fe6a0; }
  .check { display: flex; gap: 8px; align-items: center; margin: 10px 0 0; font-size: 14px; min-height: 44px; }
  .check input { width: 22px; height: 22px; flex: 0 0 auto; }
  .saved { margin-top: 10px; padding: 8px; border-radius: 10px; background: #12301f; color: #c9f5d2; font-size: 13px; }
  .saved p { margin: 4px 0; }
  .saved pre { margin: 4px 0 8px; padding: 6px 8px; background: #0b1a12; border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; user-select: all; }
  .parts { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .parts li { display: flex; gap: 6px; align-items: stretch; }
  .parts li.sel .pick { border-color: #ffe14d; background: #2b3a22; }
  .parts li.gone .pick { text-decoration: line-through; }
  .pick { flex: 1; min-width: 0; text-align: left; display: flex; flex-direction: column; justify-content: center; padding: 5px 8px; }
  .pick small { font-size: 11px; color: #8fb3cc; font-weight: 400; overflow-wrap: anywhere; }
  .e-toast { pointer-events: none; position: absolute; left: 50%; bottom: calc(132px + env(safe-area-inset-bottom)); transform: translateX(-50%); margin: 0; padding: 10px 14px; border-radius: 12px; background: #061828f5; border: 1px solid #8fdfff; font-size: 14px; z-index: 30; max-width: 86%; text-align: center; }
  @media (max-width: 600px) {
    h1 { display: none; }
    .view-switch { margin-left: auto; margin-right: auto; }
    .viewport-header { gap: 6px; }
    .panel { top: auto; bottom: 0; left: 0; right: 0; width: 100%; max-width: 100%; height: min(60dvh, 520px); max-height: calc(100% - 74px - env(safe-area-inset-top)); border-radius: 16px 16px 0 0; box-sizing: border-box; }
    .drawer-content { padding-bottom: calc(24px + env(safe-area-inset-bottom)); }
    .drawer-head { padding-top: 8px; }
    .pick-hint { flex-direction: column; gap: 4px; }
    .pick-hint button { width: 100%; }
  }
  @media (max-height: 500px) and (min-width: 601px) {
    .selection-switch { position: absolute; top: calc(74px + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); z-index: 12; }
  .selection-switch button { font-size: 12px; padding: 4px 8px; }
  .tool-rail { top: auto; bottom: max(8px, env(safe-area-inset-bottom)); flex-direction: row; }
    .nav-rail { top: auto; bottom: max(8px, env(safe-area-inset-bottom)); flex-direction: row; }
    .history { top: calc(74px + env(safe-area-inset-top)); bottom: auto; }
    .selection-switch { top: calc(126px + env(safe-area-inset-top)); }
    .match-dock { top: calc(74px + env(safe-area-inset-top)); bottom: auto; }
    .tool-rail button, .nav-rail button { width: 44px; }
    .view-status { bottom: 70px; }
    .panel { width: 340px; }
  }
</style>
