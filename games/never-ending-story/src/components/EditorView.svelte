<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { MatchState } from '../lib/editor/matchState.svelte';
  import type { V3 } from '../lib/editor/camMath';
  import { projectedBox } from '../lib/editor/viewFrame';
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
    type OriginOp,
  } from '../lib/editor/modelEditor';
  import { AXIS_COLORS } from '../lib/editor/modal';
  import { partLabel } from '../lib/editor/partLabels';
  import { SourceFiles, editsStorageKey, type FileChange } from '../lib/editor/sourceFiles.svelte';
  import { glbFileName, stableStringify } from '../lib/editor/editorFilesCore.mjs';
  import { withDefaultMasters } from '../lib/editor/masterLine';
  import { T } from '../lib/editor/strings';
  import { t, LOCALES } from '../lib/i18n/core';
  import { locale } from '../lib/i18n/locale.svelte';

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
    parts: [],
    selected: null,
    canUndo: false,
    canRedo: false,
    dirty: false,
    pivotMode: false,
    cursorTool: false,
    cursorCm: [0, 0, 0],
    modal: null,
    pivotSnap: null,
    scope: 'part',
    root: null,
    placement: null,
    scaleLocked: true,
    floorSnap: true,
  });
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
  // The mock-up view keeps its tool row (gizmo modes + zoom) in the strip under the fitted image.
  let modesH = $state(0);
  $effect(() => {
    if (!match) return;
    const pad = view === 'mock' ? Math.max(MatchState.PAD_BOTTOM, modesH + 16) : MatchState.PAD_BOTTOM;
    if (match.padBottom !== pad) match.padBottom = pad;
  });

  // ---------- mock-up view: 2D zoom / pan of the view window ----------
  // One-finger / left-button drags stay with the model editor (tap to select, gizmo drags), so panning uses
  // middle- (or Shift+middle-, like Blender's view pan) or Space+drag on desktop and two fingers on touch; wheel / pinch zoom; double-click /
  // double-tap fits. The 3D camera stays the solved camera; only the window into it moves (pixel-locked).
  let stageEl = $state<HTMLDivElement>();
  let spaceHeld = $state(false);
  let mousePan: { id: number; x: number; y: number } | null = null;
  const touches = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; x: number; y: number; ids: number[] } | null = null;
  let lastTap: { t: number; x: number; y: number } | null = null;
  let tapStart: { id: number; x: number; y: number; t: number } | null = null;
  const mockOn = (): boolean => view === 'mock' && !!match;
  const onStageControl = (event: Event): boolean => !!(event.target as Element | null)?.closest?.('button, input, select, label');
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
    if (onStageControl(event)) return;
    // Blender: Shift+right-click places the 3D cursor (every view, before the guide lines see the click)
    if (event.pointerType === 'mouse' && event.button === 2 && event.shiftKey && editor && !editor.modalActive) {
      editor.placeCursorAt(event.clientX, event.clientY);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!mockOn()) return;
    if (event.pointerType === 'mouse') {
      if (event.button === 1 || (event.button === 0 && spaceHeld)) {
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
    event.preventDefault(); // right button = cancel / Shift+right-click = 3D cursor (Blender), never the browser menu
  }
  function typing(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }
  function spaceKey(event: KeyboardEvent): void {
    if (event.code !== 'Space' || typing(event.target)) return;
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
    if (snap.scope === 'object') {
      editor!.selectRoot();
      focus(null);
      return;
    }
    if (sel?.name !== name) editor!.select(name);
    focus(name);
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
  /** Screen point of the whole object's box centre — test hook. */
  let objCenter = $state<string | null>(null);
  /** Screen points of the selected part's box centre / nearest box corner while editing its pivot — test hook. */
  let pivotHints = $state<string | null>(null);
  /** Client points of the gizmo's X / Y / Z handles (move / scale) — test hook for touch drags. */
  let gizmoHandles = $state<string | null>(null);
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
      const oc = editor!.objectScreen();
      objCenter = oc ? `${oc[0].toFixed(1)},${oc[1].toFixed(1)}` : null;
      const h = snap.pivotMode ? editor!.pivotHints() : null;
      pivotHints = h ? JSON.stringify(h) : null;
      const gh = (['X', 'Y', 'Z'] as const).map((a) => editor!.gizmoHandle(a));
      gizmoHandles = gh.every(Boolean) ? JSON.stringify(gh) : null;
    });
  });
  // Whole-object placement: the camera stays in world space, the solver works in the object's frame.
  $effect(() => {
    const p = snap.placement;
    if (match) untrack(() => match!.setPlacement(p));
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
      say(t('editor.pick.missedModel'));
      return false;
    }
    match.setPairWorld(match.pick.pairId, p as V3, t('editor.pick.modelPoint', { coords: p.map((v) => v.toFixed(1)).join(', ') }));
    say(t('editor.pick.tapSameOnImage'));
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
      say(t('editor.load.failed'));
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    if (!canvas) return;
    editor = createModelEditor(canvas, (next) => (snap = next));
    if (match) editor.setMatch(match.cam, match.viewRect);
    void load();
    // Blender keymap (3D editor); the camera-match guide tools keep their own controls.
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target)) return;
      if (editor?.modalActive) {
        editor.modalKey(event); // G / R / S running: it owns the keyboard
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      const k = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (delAsk) {
        if (event.key === 'Enter') confirmDelete();
        else if (event.key === 'Escape') delAsk = null;
        return;
      }
      if (mod && k === 's') {
        event.preventDefault();
        void saveFiles();
      } else if (mod && k === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && k === 'y') {
        event.preventDefault();
        redo();
      } else if (mod) return;
      else if (event.key === 'Escape') {
        if (originMenu || optionsOpen) closeMenus();
        else if (snap.cursorTool) editor?.setCursorTool(false);
      } else if (event.code === 'NumpadDecimal' || (k === 'f' && !event.shiftKey && !event.altKey)) {
        event.preventDefault();
        frameSelected();
      } else if (event.key === 'Home') {
        event.preventDefault();
        frameAll();
      } else if (event.altKey) {
        const code = event.code;
        if (k === 'a' || code === 'KeyA') {
          event.preventDefault();
          editor?.select(null);
        } else if (snap.root && (code === 'KeyG' || code === 'KeyR' || code === 'KeyS')) {
          // Alt+G / Alt+R / Alt+S: Clear Location / Rotation / Scale of the whole object
          event.preventDefault();
          const kind = code === 'KeyG' ? 'position' : code === 'KeyR' ? 'rotation' : 'scale';
          editor?.clearPlacement(kind);
          say(T.place.cleared(T.place.clearOf(kind)));
        }
      } else if (event.shiftKey) {
        if (k === 'd' && snap.selected && editor) {
          event.preventDefault();
          editor.duplicate(snap.selected.name, false);
          startModal('grab');
        } else if (k === 'c' && editor) {
          event.preventDefault();
          editor.resetCursor();
          frameAll();
          say(T.cursor.reset);
        }
      } else if (k === 'g') startModal('grab');
      else if (k === 'r') startModal('rotate');
      else if (k === 's') startModal('scale');
      else if ((k === 'x' || event.key === 'Delete') && snap.selected) {
        event.preventDefault();
        delAsk = snap.selected.name;
      } else if (k === 'a') {
        event.preventDefault();
        editor?.selectRoot();
        say(T.selectAll);
      }
      else if (k === 'n') {
        sidebar = !sidebar;
        say(T.sidebarToast(sidebar));
      }
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

  // ---------- whole object (Object mode on the root) ----------
  const rootInfo = $derived(snap.root);
  let bakePlacement = $state(false);
  function pickScope(next: 'part' | 'object'): void {
    editor?.setScope(next);
  }
  function setPlace(kind: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number): void {
    if (!editor) return;
    if (kind === 'scale' && snap.scaleLocked) {
      say(T.place.scaleBlocked);
      return;
    }
    editor.setPlacementValue(kind, axis, value);
  }
  function nudgePlace(kind: 'position' | 'rotation', axis: 0 | 1 | 2, dir: 1 | -1): void {
    if (!rootInfo) return;
    const now = kind === 'position' ? rootInfo.positionCm[axis] : rootInfo.rotationDeg[axis];
    const step = kind === 'rotation' ? rotStep : snapOn ? 1 : 0.1;
    setPlace(kind, axis, Math.round((now + dir * step) / step) * step);
  }
  function toggleScaleLock(): void {
    if (!editor) return;
    if (snap.scaleLocked && !confirm(T.place.scaleWarn)) return;
    editor.setScaleLocked(!snap.scaleLocked);
  }
  const fmtCm = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

  function pickMode(next: GizmoMode): void {
    // rotating / scaling origins is not supported (Affect Only Origins keeps the move tool)
    if (next !== 'translate' && snap.pivotMode) {
      say(T.origin.noRotate);
      return;
    }
    mode = next;
    editor?.setMode(next);
  }
  // ---------- Blender-style keymap helpers ----------
  let sidebar = $state(true);
  let originMenu = $state(false);
  let optionsOpen = $state(false);
  /** Part waiting for the X / Delete confirmation. */
  let delAsk = $state<string | null>(null);
  function closeMenus(): void {
    originMenu = false;
    optionsOpen = false;
  }
  function startModal(kind: 'grab' | 'rotate' | 'scale'): void {
    if (!editor || (!snap.selected && !snap.root)) return;
    if (kind !== 'grab' && snap.pivotMode) {
      say(T.origin.noRotate);
      return;
    }
    if (kind === 'scale' && snap.root && snap.scaleLocked) {
      say(T.place.scaleBlocked);
      return;
    }
    closeMenus();
    editor.startModal(kind);
  }
  function confirmDelete(): void {
    const name = delAsk;
    delAsk = null;
    if (name) editor?.remove(name);
  }
  /** Numpad . / F: Frame Selected (the 2D window in the staged views, the orbit camera otherwise). */
  function frameSelected(): void {
    if (view === 'mock' || view === 'match') focus();
    else editor?.frameOrbit(sel?.name ?? null);
  }
  /** Home: Frame All. */
  function frameAll(): void {
    if (view === 'mock' || view === 'match') focus(null);
    else editor?.frameOrbit(null);
  }
  function setOrigin(op: OriginOp): void {
    originMenu = false;
    editor?.setOrigin(op);
  }
  const originOps: { op: OriginOp; label: string }[] = [
    { op: 'geometry', label: T.origin.toGeometry },
    { op: 'cursor', label: T.origin.toCursor },
    { op: 'geometryToOrigin', label: T.origin.geometryToOrigin },
    { op: 'bottom', label: T.origin.toBottom },
    { op: 'reset', label: T.origin.reset },
  ];
  function toggleCursorTool(): void {
    closeMenus();
    editor?.setCursorTool(!snap.cursorTool);
  }
  /** Blender-like header / status bar text of the running G / R / S. */
  const modalText = $derived.by(() => {
    const m = snap.modal;
    if (!m) return null;
    const v = m.values;
    const fmtM = (x: number) => `${x.toFixed(4)} m`;
    let value: string;
    if (m.kind === 'grab') value = v.length === 1 ? T.modal.dist(m.typed ?? fmtM(v[0]!)) : T.modal.free(fmtM(v[0]!), fmtM(v[1]!), fmtM(v[2]!));
    else if (m.kind === 'rotate') value = T.modal.rot(m.typed ?? `${v[0]!.toFixed(2)}°`);
    else value = T.modal.factor(m.typed ?? v[0]!.toFixed(4));
    const along = m.axis && m.space ? ` ${T.modal.along(m.space, m.axis)}` : '';
    const who = m.root ? `${T.place.rootRow} · ` : '';
    return `${who}${T.modal.name(m.kind)}${m.origins ? ` (${T.modal.originOnly})` : ''} · ${value}${along}`;
  });
  const axisColor = (axis: string | null): string => (axis ? AXIS_COLORS['XYZ'.indexOf(axis)]! : '#eaf6ff');
  // ---------- pivot (origin) editing ----------
  let pivotSpace = $state<'local' | 'world'>('local');
  function togglePivot(): void {
    if (!editor) return;
    const on = !editor.pivotMode;
    if (on) {
      mode = 'translate';
      editor.setMode('translate');
    }
    editor.setPivotMode(on);
    say(T.origin.toast(on));
  }
  function setPivotValue(axis: 0 | 1 | 2, value: number): void {
    editor?.setPivotValue(pivotSpace, axis, value);
  }
  const pivotShown = $derived(sel ? (pivotSpace === 'local' ? sel.pivotLocalCm : sel.pivotWorldCm) : null);
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
      const blob = await editor.exportGlb({ bake: bakePlacement });
      download(blob, `${fileBase}.glb`);
      say(t('editor.export.downloaded', { file: `${fileBase}.glb` }));
    } catch (err) {
      console.warn('export failed', err);
      say(T.files.glbFailed);
    }
  }
  function exportEdits(): void {
    if (!editor) return;
    const json = JSON.stringify(editor.exportEdits(), null, 2);
    download(new Blob([json], { type: 'application/json' }), `${fileBase}.edits.json`);
    say(t('editor.export.downloaded', { file: `${fileBase}.edits.json` }));
  }
  function reset(): void {
    if (!snap.dirty) return;
    if (!confirm(t('editor.reset.confirm'))) return;
    editor?.reset();
    say(t('editor.reset.done'));
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
        glb = { name: glbFileName(option.variant.id), blob: await editor.exportGlb({ bake: bakePlacement }) };
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
            localStorage.removeItem(editsStorageKey(option.asset.slug, c.variant));
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
  // part fields stay in glTF order (x, y = up, z = front); labels use Blender axis names
  const posLabels = $derived(T.part.posLabels);
  const sizeLabels = $derived(T.part.sizeLabels);
  const rotLabels = $derived(T.part.rotLabels);
  const pivotLabels = ['X', 'Y', 'Z'];
  const modes: { id: GizmoMode; label: string; title: string }[] = $derived([
    { id: 'translate', label: T.tool.move, title: T.tool.moveTitle },
    { id: 'rotate', label: T.tool.rotate, title: T.tool.rotateTitle },
    { id: 'scale', label: T.tool.scale, title: T.tool.scaleTitle },
  ]);
</script>

{#snippet pivotIcon()}
  <!-- origin / pivot: a ringed dot with ticks (the ⌖ glyph is missing from common fonts) -->
  <svg class="pivot-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
  </svg>
{/snippet}

{#snippet cursorIcon()}
  <!-- Blender's 3D cursor: a red / white ring with cross-hair ticks -->
  <svg class="pivot-ico" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="#ffffff" stroke-width="2.6" />
    <circle cx="12" cy="12" r="6.5" fill="none" stroke="#ff3352" stroke-width="2.6" stroke-dasharray="5.1 5.1" />
    <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  </svg>
{/snippet}

<svelte:window
  onkeydown={spaceKey}
  onkeyup={spaceKey}
  onblur={() => (spaceHeld = false)}
  onpointerdown={(e) => { if ((originMenu || optionsOpen) && !(e.target as Element | null)?.closest?.('.pop')) closeMenus(); }}
/>

<div class="editor">
  <header>
    <a class="e-back" href="#/showcase" aria-label={t('editor.header.backAria')}>{t('editor.header.back')}</a>
    <h1>{t('editor.header.title')}</h1>
    <div class="lang" role="radiogroup" aria-label={t('editor.header.language')}>
      {#each LOCALES as l (l)}
        <button type="button" role="radio" aria-checked={locale.editor === l} class:on={locale.editor === l} data-lang={l}
          onclick={() => locale.set('editor', l)}>{l.toUpperCase()}</button
        >
      {/each}
    </div>
    <div class="hist">
      <button type="button" class="e-hist" onclick={undo} disabled={lineHistory ? lineHistory.lineUndoCount === 0 : !snap.canUndo} aria-label={T.common.undoAria}>{T.common.undo}</button>
      <button type="button" class="e-hist" onclick={redo} disabled={lineHistory ? lineHistory.lineRedoCount === 0 : !snap.canRedo} aria-label={T.common.redoAria}>{T.common.redoNext}</button>
    </div>
  </header>

  <div class="body">
    <div
      class="viewport"
      class:matching={view === 'match'}
      class:pivoting={view === 'match' && (snap.pivotMode || snap.cursorTool)}
      class:cursortool={snap.cursorTool}
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
      data-object-center={objCenter}
      data-pivot={sel ? JSON.stringify({ local: sel.pivotLocalCm, world: sel.pivotWorldCm, center: sel.centerWorldCm }) : null}
      data-pivot-mode={snap.pivotMode ? 'on' : null}
      data-cursor={snap.cursorCm.join(',')}
      data-cursor-tool={snap.cursorTool ? 'on' : null}
      data-modal={snap.modal ? JSON.stringify(snap.modal) : null}
      data-scope-now={snap.scope}
      data-root-sel={snap.root ? 'on' : null}
      data-placement={snap.placement ? JSON.stringify(snap.placement) : null}
      data-root={rootInfo ? JSON.stringify(rootInfo) : null}
      data-match-cam={match && staged && match.cam ? JSON.stringify({ C: match.cam.C.map((v) => +v.toFixed(3)), R: match.cam.R.map((r) => r.map((v) => +v.toFixed(5))) }) : null}
      data-pivot-snap={snap.pivotSnap}
      data-pivot-hints={pivotHints}
      data-gizmo-handles={gizmoHandles}
      role="presentation"
    >
      {#if staged && match}
        <img class="ref" src={match.imageRect.src} alt="Mock-up" style={imgStyle} draggable="false" data-ref-image={match.image} />
      {/if}
      <canvas bind:this={canvas} style={canvasStyle} aria-label={t('editor.viewport.aria')}></canvas>
      {#if staged && match && match.split > 0}
        <div class="divider" style="left:{match.split}%"><span>{t('editor.viewport.splitLabel')}</span></div>
      {/if}
      {#if view === 'match' && match}
        <GuideOverlay st={match} onModelTap={modelTap} onChange={() => match?.save()} {say} modelCanvas={canvas} />
        <div class="stage-tools">
          <button type="button" aria-label={T.stage.zoomIn} title={T.stage.zoomIn} onclick={() => match?.zoomAt(1.4)}>＋</button>
          <button type="button" aria-label={T.stage.zoomOut} title={T.stage.zoomOut} onclick={() => match?.zoomAt(1 / 1.4)}>－</button>
          <button type="button" aria-label={T.stage.fit} title={T.stage.fit} onclick={() => match?.fit()}>⤢</button>
          <button type="button" aria-label={T.stage.focus} title={T.stage.focusTitle} data-zoom-focus onclick={() => focus()}>◎</button>
          <button type="button" aria-label={T.stage.crop} title={T.stage.cropTitle} data-zoom-crop onclick={() => match?.cropPreset()}>▣</button>
          <button type="button" aria-label={T.origin.affect} title={T.origin.affectTitle} class="snap" class:on={snap.pivotMode} aria-pressed={snap.pivotMode}
            data-act="affect-origins-stage" onclick={togglePivot}>{@render pivotIcon()}</button>
          <button type="button" aria-label={T.cursor.place} title={T.cursor.placeTitle} class="snap" class:on={snap.cursorTool} aria-pressed={snap.cursorTool}
            data-act="cursor-tool-stage" onclick={toggleCursorTool}>{@render cursorIcon()}</button>
          <button type="button" aria-label={T.snap.label} title={T.snap.title} class="snap" class:on={match.snap} aria-pressed={match.snap} data-stage-snap
            onclick={() => { if (match) { match.snap = !match.snap; match.save(); say(T.snap.toast(match.snap)); } }}>🧲</button>
        </div>
        {#if diffOn || (match.dragging && match.liveFail)}
          <div class="live-badges">
            {#if diffOn}<span class="badge diff" data-diff-badge>{T.diff.badge}</span>{/if}
            {#if match.dragging && match.liveFail}<span class="badge fail" data-solve-fail>{T.diff.solveFailed}</span>{/if}
          </div>
        {/if}
        {#if match.pick}
          <p class="pick-hint">{match.pick.want === 'model' ? t('editor.pick.tapOnModel') : t('editor.pick.tapSameOnImage')}</p>
        {/if}
      {/if}
      {#if snap.cursorTool && !snap.modal}
        <p class="pick-hint cursor-hint" data-cursor-hint>{T.cursor.hint}</p>
      {/if}
      {#if snap.modal && modalText}
        <div class="modal-status" role="status" data-modal-status>
          <b style="color:{axisColor(snap.modal.axis)}">{modalText}</b>
          <span>{T.modal.keys(snap.modal.snapping)}</span>
        </div>
      {/if}
      {#if delAsk}
        <div class="del-ask" role="alertdialog" aria-label={T.del.confirm} data-del-confirm>
          <b>{T.del.confirm}</b> <small>{partLabel(delAsk)}</small>
          <div class="actions">
            <button type="button" class="danger" onclick={confirmDelete} data-act="delete-ok">{T.del.ok}</button>
            <button type="button" onclick={() => (delAsk = null)} data-act="delete-cancel">{T.del.cancel}</button>
          </div>
        </div>
      {/if}
      {#if loading}<p class="loading">{t('editor.load.loading')}</p>{/if}
      <div class="modes" class:withzoom={view === 'mock' && !!match} hidden={view === 'match'} bind:clientHeight={modesH}>
        <div class="mode-group" role="radiogroup" aria-label={T.tool.aria}>
          {#each modes as m (m.id)}
            <button type="button" role="radio" aria-checked={mode === m.id} class:on={mode === m.id} data-mode={m.id} title={m.title}
              disabled={m.id !== 'translate' && snap.pivotMode} onclick={() => pickMode(m.id)}>{m.label}</button
            >
          {/each}
          <button type="button" class:on={snapOn} aria-pressed={snapOn} onclick={toggleSnap} data-snap title={T.snap.title}
            >{t('editor.snap.button', { state: T.common.onOff(snapOn) })}</button
          >
        </div>
        <div class="mode-group scope-group" role="radiogroup" aria-label={T.place.scope}>
          <button type="button" role="radio" aria-checked={snap.scope === 'part'} class:on={snap.scope === 'part'} data-scope="part" title={T.place.scopePartTitle}
            onclick={() => pickScope('part')}>{T.place.scopePart}</button>
          <button type="button" role="radio" aria-checked={snap.scope === 'object'} class:on={snap.scope === 'object'} data-scope="object" title={T.place.scopeObjectTitle}
            onclick={() => pickScope('object')}>{T.place.scopeObject}</button>
        </div>
        <div class="mode-group origin-group">
          <div class="pop">
            <button type="button" class="pivot" class:on={snap.pivotMode} aria-expanded={optionsOpen} aria-haspopup="true" title={T.origin.options}
              onclick={() => { originMenu = false; optionsOpen = !optionsOpen; }} data-act="options">{@render pivotIcon()} ▾</button>
            {#if optionsOpen}
              <div class="menu" data-options-menu>
                <b>{T.origin.transform}</b>
                <label class="check" title={T.origin.affectTitle}>
                  <input type="checkbox" checked={snap.pivotMode} onchange={togglePivot} data-act="affect-origins" />
                  <span>{T.origin.affectOnly}: {T.origin.origins}</span>
                </label>
              </div>
            {/if}
          </div>
          <div class="pop">
            <button type="button" aria-expanded={originMenu} aria-haspopup="menu" disabled={!sel && !rootInfo} onclick={() => { optionsOpen = false; originMenu = !originMenu; }}
              data-act="set-origin">{T.origin.setOrigin} ▾</button>
            {#if originMenu && (sel || rootInfo)}
              <div class="menu" role="menu" data-origin-menu>
                {#each originOps as o (o.op)}
                  <button type="button" role="menuitem" data-origin={o.op} disabled={o.op === 'reset' && !(sel ? sel.pivotSet : rootInfo?.originSet)}
                    onclick={() => setOrigin(o.op)}>{o.label}</button>
                {/each}
              </div>
            {/if}
          </div>
          <button type="button" class="pivot" class:on={snap.cursorTool} aria-pressed={snap.cursorTool} aria-label={T.cursor.place} title={T.cursor.placeTitle}
            onclick={toggleCursorTool} data-act="cursor-tool">{@render cursorIcon()}</button>
        </div>
        {#if view === 'mock' && match}
          <div class="zoom-group" data-mock-zoom>
            <button type="button" aria-label={T.stage.zoomIn} title={T.stage.zoomIn} data-zoom-in onclick={() => match?.zoomAt(1.4)}>＋</button>
            <button type="button" aria-label={T.stage.zoomOut} title={T.stage.zoomOut} data-zoom-out onclick={() => match?.zoomAt(1 / 1.4)}>－</button>
            <button type="button" aria-label={T.stage.fit} title={T.stage.fit} data-zoom-fit onclick={() => match?.fit()}>⤢</button>
            <button type="button" aria-label={T.stage.focus} title={T.stage.focusTitle} data-zoom-focus onclick={() => focus()}>◎</button>
            <button type="button" aria-label={T.stage.crop} title={T.stage.cropTitle} data-zoom-crop onclick={() => match?.cropPreset()}>▣</button>
            <span class="zpct" aria-live="polite" data-zoom-pct>{T.stage.zoomLabel(zoomPct)}</span>
          </div>
        {/if}
      </div>
    </div>

    <div class="panel" hidden={!sidebar} data-sidebar>
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
      <label class="field">
        <span>{t('editor.panel.model')}</span>
        <select value={modelKey} onchange={(e) => changeModel(e.currentTarget.value)} data-model>
          {#each options as o (o.key)}
            <option value={o.key}>{o.asset.title} · {o.variant.label}</option>
          {/each}
        </select>
      </label>

      <div class="seg" role="radiogroup" aria-label={t('editor.view.aria')}>
        <button type="button" role="radio" aria-checked={view === 'orbit'} class:on={view === 'orbit'} data-view="orbit" onclick={() => pickView('orbit')}
          >{t('editor.view.orbit')}</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={view === 'mock'}
          class:on={view === 'mock'}
          data-view="mock"
          disabled={!ref}
          onclick={() => pickView('mock')}>{t('editor.view.mock')}</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={view === 'match'}
          class:on={view === 'match'}
          data-view="match"
          disabled={!ref}
          onclick={() => pickView('match')}>{t('editor.view.match')}</button
        >
      </div>
      {#if view === 'mock' && match}
        <div class="seg" role="radiogroup" aria-label={t('editor.display.aria')}>
          {#each [['solid', t('editor.display.solid')], ['wire', t('editor.display.wire')], ['edges', t('editor.display.edges')]] as const as [id, label] (id)}
            <button type="button" role="radio" aria-checked={match.display === id} class:on={match.display === id} data-display={id}
              onclick={() => (match!.display = id)}>{label}</button>
          {/each}
        </div>
        <label class="field slider">
          <span>{t('editor.display.opacity', { pct: match.opacity })}</span>
          <input type="range" min="0" max="100" step="5" bind:value={match.opacity} data-overlay />
        </label>
        <label class="field slider">
          <span>{t('editor.display.split', { pct: match.split })}</span>
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

      {#if sel}
        <section class="selected" data-selected={sel.name}>
          <h2>{partLabel(sel.name)} <small>{sel.name}</small></h2>
          <p class="sub">{T.part.position}</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{posLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('position', i, -1)} aria-label={t('editor.part.decrease')}>−</button>
              <input type="number" inputmode="decimal" step={posStep} value={sel.positionCm[i]} data-field="position-{i}"
                onchange={(e) => setValue('position', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('position', i, 1)} aria-label={t('editor.part.increase')}>+</button>
            </div>
          {/each}
          <p class="sub">{T.part.size}</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{sizeLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('size', i, -1)} aria-label={t('editor.part.decrease')}>−</button>
              <input type="number" inputmode="decimal" min="0.1" step={posStep} value={sel.sizeCm[i]} data-field="size-{i}"
                onchange={(e) => setValue('size', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('size', i, 1)} aria-label={t('editor.part.increase')}>+</button>
            </div>
          {/each}
          <p class="sub">{T.part.rotation}</p>
          {#each axes as i (i)}
            <div class="row">
              <span>{rotLabels[i]}</span>
              <button type="button" class="step" onclick={() => nudge('rotation', i, -1)} aria-label={t('editor.part.decrease')}>−</button>
              <input type="number" inputmode="decimal" step={rotStep} value={sel.rotationDeg[i]} data-field="rotation-{i}"
                onchange={(e) => setValue('rotation', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudge('rotation', i, 1)} aria-label={t('editor.part.increase')}>+</button>
            </div>
          {/each}
          <div class="pivot-box" data-pivot-panel>
            <div class="pivot-head">
              <b>{T.origin.heading}</b>
              <label class="check small" title={T.origin.affectTitle}>
                <input type="checkbox" checked={snap.pivotMode} onchange={togglePivot} data-act="affect-origins-panel" />
                <span>{T.origin.affect}</span>
              </label>
            </div>
            {#if snap.pivotMode}<p class="tip small">{T.origin.affectOnHint}</p>{/if}
            {#if snap.pivotSnap}<p class="tip small" data-pivot-snapped>{T.origin.snapped(snap.pivotSnap)}</p>{/if}
            <p class="sub">{T.origin.setOrigin}</p>
            <div class="actions pivot-presets">
              {#each originOps as o (o.op)}
                <button type="button" class="small" data-origin-panel={o.op} disabled={o.op === 'reset' && !sel.pivotSet} onclick={() => setOrigin(o.op)}>{o.label}</button>
              {/each}
            </div>
            <p class="tip small cursor-row" data-cursor-row>
              {@render cursorIcon()} {snap.cursorCm.map((v) => `${v}`).join(', ')} cm
              <button type="button" class="small" onclick={toggleCursorTool} class:on={snap.cursorTool} aria-pressed={snap.cursorTool} data-act="cursor-tool-panel">{T.cursor.place}</button>
            </p>
            <div class="seg" role="radiogroup" aria-label={T.origin.spaceAria}>
              {#each [['local', T.origin.local], ['world', T.origin.world]] as const as [id, label] (id)}
                <button type="button" role="radio" aria-checked={pivotSpace === id} class:on={pivotSpace === id} data-pivot-space={id}
                  onclick={() => (pivotSpace = id)}>{label}</button>
              {/each}
            </div>
            <p class="sub" data-pivot-sub={pivotSpace}>{pivotSpace === 'local' ? T.origin.localSub : T.origin.worldSub}</p>
            {#each axes as i (i)}
              <div class="row pivot-row">
                <span style="color:{AXIS_COLORS[i]}">{pivotLabels[i]}</span>
                <input type="number" inputmode="decimal" step={posStep} value={pivotShown?.[i] ?? 0} data-field="pivot-{i}"
                  onchange={(e) => setPivotValue(i, e.currentTarget.valueAsNumber)} />
              </div>
            {/each}
          </div>
          <div class="row color">
            <span>{t('editor.part.color')}</span>
            <input type="color" value={sel.color} onchange={(e) => editor?.setColor(e.currentTarget.value)} aria-label={t('editor.part.colorAria')} />
            <button type="button" class="small" onclick={() => editor?.setColor(null)}>{t('editor.part.colorReset')}</button>
          </div>
          <div class="actions">
            <button type="button" onclick={() => editor?.duplicate(sel.name)} data-act="duplicate">{t('editor.part.duplicate')}</button>
            <button type="button" onclick={() => editor?.toggleHidden(sel.name)} data-act="hide">{t('editor.part.hide')}</button>
            <button type="button" class="danger" onclick={() => editor?.remove(sel.name)} data-act="delete">{t('editor.part.delete')}</button>
          </div>
        </section>
      {:else if rootInfo}
        <section class="selected root-panel" data-root-panel>
          <h2>{T.place.heading} <small>{rootInfo.name}</small></h2>
          <p class="tip small" data-root-dims>
            {T.place.dims(fmtCm(rootInfo.dimsCm[0]), fmtCm(rootInfo.dimsCm[1]), fmtCm(rootInfo.dimsCm[2]), fmtCm(rootInfo.baseCm))}
          </p>
          <p class="sub">{T.place.location}</p>
          {#each axes as i (i)}
            <div class="row">
              <span style="color:{AXIS_COLORS[i]}">{T.place.axes[i]}</span>
              <button type="button" class="step" onclick={() => nudgePlace('position', i, -1)} aria-label="−">−</button>
              <input type="number" inputmode="decimal" step={snapOn ? 1 : 0.1} value={rootInfo.positionCm[i]} data-field="place-position-{i}"
                onchange={(e) => setPlace('position', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudgePlace('position', i, 1)} aria-label="+">+</button>
            </div>
          {/each}
          <p class="sub">{T.place.rotation}</p>
          {#each axes as i (i)}
            <div class="row">
              <span style="color:{AXIS_COLORS[i]}">{T.place.axes[i]}</span>
              <button type="button" class="step" onclick={() => nudgePlace('rotation', i, -1)} aria-label="−">−</button>
              <input type="number" inputmode="decimal" step={rotStep} value={rootInfo.rotationDeg[i]} data-field="place-rotation-{i}"
                onchange={(e) => setPlace('rotation', i, e.currentTarget.valueAsNumber)} />
              <button type="button" class="step" onclick={() => nudgePlace('rotation', i, 1)} aria-label="+">+</button>
            </div>
          {/each}
          <p class="sub">{T.place.scale}</p>
          <div class="row">
            <button type="button" class="step lock" class:on={snap.scaleLocked} aria-pressed={snap.scaleLocked}
              aria-label={snap.scaleLocked ? T.place.scaleUnlock : T.place.scaleLocked} title={snap.scaleLocked ? T.place.scaleUnlock : T.place.scaleLocked}
              onclick={toggleScaleLock} data-act="scale-lock">{snap.scaleLocked ? '🔒' : '🔓'}</button>
            <input type="number" inputmode="decimal" min="0.01" step="0.01" value={rootInfo.scale} disabled={snap.scaleLocked} data-field="place-scale"
              onchange={(e) => setPlace('scale', 0, e.currentTarget.valueAsNumber)} />
          </div>
          {#if !snap.scaleLocked || rootInfo.scale !== 1}<p class="tip small warn" data-scale-warn>{T.place.scaleWarn}</p>{/if}
          <label class="check" title={T.place.floorSnapTitle}>
            <input type="checkbox" checked={snap.floorSnap} onchange={(e) => editor?.setFloorSnap(e.currentTarget.checked)} data-act="floor-snap" />
            <span>{T.place.floorSnap}</span>
          </label>
          <div class="actions">
            <button type="button" class="small" onclick={() => editor?.snapToFloor()} data-act="drop-floor">{T.place.dropToFloor}</button>
          </div>
          <p class="sub">{T.origin.setOrigin}</p>
          <div class="actions pivot-presets">
            {#each originOps as o (o.op)}
              <button type="button" class="small" data-origin-panel={o.op} disabled={o.op === 'reset' && !rootInfo.originSet} onclick={() => setOrigin(o.op)}>{o.label}</button>
            {/each}
          </div>
          <p class="tip small">{T.place.clear}</p>
          <div class="actions">
            {#each ['position', 'rotation', 'scale'] as const as kind (kind)}
              <button type="button" class="small" onclick={() => editor?.clearPlacement(kind)} data-clear={kind} disabled={kind === 'scale' && snap.scaleLocked}>{T.place.clearOf(kind)}</button>
            {/each}
          </div>
          {#if staged}<p class="tip small" data-camera-note>{T.place.cameraNote}</p>{/if}
        </section>
      {:else}
        <p class="tip small" data-keys-tip>{T.keysTip}</p>
        <p class="tip">{t('editor.parts.tip')}</p>
      {/if}

      <section>
        <h2>{t('editor.parts.heading', { n: snap.parts.filter((p) => !p.deleted).length })}</h2>
        <ul class="parts">
          <li class:sel={!!rootInfo} class="root-row">
            <button type="button" class="pick" disabled={!snap.ready} onclick={() => editor?.selectRoot()} data-part-root>
              <b>▣ {T.place.rootRow}</b>
              <small>{T.place.rootRowSub(option.asset.slug.split('/').pop() ?? '')}</small>
            </button>
          </li>
          {#each snap.parts as p (p.name)}
            <li class:sel={sel?.name === p.name} class:gone={p.deleted}>
              <button type="button" class="pick" disabled={p.deleted || p.hidden} onclick={() => editor?.selectPart(p.name)} data-part={p.name}>
                <b>{partLabel(p.name)}</b>
                <small>{p.name}{p.hidden ? t('editor.parts.hiddenTag') : ''}{p.deleted ? t('editor.parts.deletedTag') : ''}</small>
              </button>
              {#if p.deleted}
                <button type="button" class="small" onclick={() => editor?.restore(p.name)}>{t('editor.parts.restore')}</button>
              {:else}
                <button type="button" class="small" onclick={() => editor?.toggleHidden(p.name)} aria-pressed={p.hidden}
                  >{p.hidden ? t('editor.part.show') : t('editor.part.hide')}</button
                >
              {/if}
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <h2>{t('editor.export.heading')}</h2>
        <p class="tip">{t('editor.export.tip')}</p>
        <div class="actions col">
          <button type="button" class="primary" onclick={exportGlb} disabled={!snap.ready} data-act="export-glb">{t('editor.export.glb')}</button>
          <button type="button" onclick={exportEdits} disabled={!snap.ready} data-act="export-json">{t('editor.export.json')}</button>
          <label class="check" title={T.place.bakeTitle}>
            <input type="checkbox" bind:checked={bakePlacement} data-act="bake-placement" />
            <span>{T.place.bake}</span>
          </label>
          <button type="button" class="danger" onclick={reset} disabled={!snap.dirty}>{t('editor.reset.button')}</button>
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
  .lang { display: flex; gap: 2px; }
  .lang button { min-height: 36px; padding: 0 8px; font-size: 13px; }
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
  .modes { flex-wrap: wrap; align-items: center; }
  .mode-group, .zoom-group { display: flex; gap: 6px; justify-content: center; align-items: center; }
  .zoom-group button { min-width: 46px; width: 46px; padding: 0; font-size: 21px; }
  .zoom-group .zpct {
    pointer-events: none; font-size: 13px; color: #cfe6f5; background: rgba(0, 0, 0, 0.45); padding: 2px 6px; border-radius: 6px;
    min-width: 64px; text-align: center;
  }
  /* camera match: while editing a pivot the guide lines step aside so the gizmo / pick tap reach the model */
  .viewport.pivoting :global(svg.guides),
  .viewport.pivoting :global(svg.guides *) { pointer-events: none; }
  .viewport.mockzoom { touch-action: none; overscroll-behavior: contain; }
  .viewport.spacepan, .viewport.spacepan canvas { cursor: grab; }
  .modes button.on { background: #8fdfff; }
  .modes button:disabled { opacity: 0.45; }
  .pop { position: relative; display: flex; }
  .menu {
    position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 12; pointer-events: auto;
    display: flex; flex-direction: column; gap: 4px; padding: 8px; min-width: 230px;
    background: rgba(12, 24, 36, 0.97); border: 1px solid #5a7d99; border-radius: 10px;
  }
  .menu b { font-size: 13px; color: #8fb3cc; }
  .modes .menu button { text-align: left; min-height: 40px; }
  .menu .check { display: flex; gap: 8px; align-items: center; font-size: 15px; }
  .modal-status {
    position: absolute; left: 8px; right: 8px; top: 8px; z-index: 6; pointer-events: none;
    display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; border-radius: 8px;
    background: rgba(20, 20, 20, 0.88); font-size: 14px; color: #ddd;
  }
  .modal-status b { font-size: 15px; font-variant-numeric: tabular-nums; }
  .modal-status span { font-size: 12px; opacity: 0.85; }
  .del-ask {
    position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); z-index: 20;
    padding: 10px 14px; border-radius: 12px; background: rgba(12, 24, 36, 0.97); border: 2px solid #ff6b6b;
  }
  .del-ask .actions { margin-top: 8px; }
  .viewport.cursortool canvas { cursor: crosshair; }
  .cursor-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .check.small { font-size: 14px; display: flex; gap: 6px; align-items: center; }
  .panel[hidden] { display: none !important; }
  @media (max-width: 899px) {
    /* phones: the stage is short (overflow hidden), so menus open as a sheet along the bottom of the screen */
    .menu {
      position: fixed; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); min-width: 0;
      max-height: 70vh; overflow: auto; z-index: 40; box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
    }
  }

  .panel { flex: 1; min-height: 0; overflow: auto; padding: 12px 12px 40px; user-select: text; }
  .field { display: grid; gap: 4px; margin: 0 0 10px; font-size: 15px; color: #c5d7e6; }
  select {
    font: inherit; font-size: 17px; min-height: 46px; border-radius: 10px;
    border: 2px solid #3a5a74; background: #10202e; color: #eaf6ff; padding: 0 8px;
  }
  .slider input { width: 100%; height: 36px; }
  .seg { display: flex; gap: 8px; margin: 0 0 10px; }
  .seg button { flex: 1; }
  .pivot-box { margin: 10px 0; padding: 8px 10px; border: 1px solid #3a5a74; border-radius: 10px; }
  .pivot-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .pivot-box button.on, .modes button.pivot.on { background: #ffe14d; color: #1b1b1b; }
  .pivot-presets { flex-wrap: wrap; margin-bottom: 8px; }
  .modes button.pivot { min-width: 46px; width: 46px; padding: 0; font-size: 22px; }
  .row.pivot-row { grid-template-columns: 1fr 140px; }
  .pivot-ico { display: inline-block; vertical-align: middle; }
  .tip.small { font-size: 13px; margin: 2px 0 6px; }
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
  .parts li.root-row .pick { border-style: dashed; }
  .tip.warn { color: #ffcf70; }
  .step.lock.on { background: #3a3320; }
  .root-panel input:disabled { opacity: 0.6; }
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
