<script lang="ts">
  import type { V2 } from '../lib/editor/camMath';
  import { AXIS_COLORS, AXIS_NAMES, type MatchState } from '../lib/editor/matchState.svelte';
  import { joints, snapEndpoint, snapLine, SNAP_PX, type End, type EndRef, type SnapTarget } from '../lib/editor/guideSnap';
  import { distToRay, lockedPoint, lockVp, residualBand, vpPoint } from '../lib/editor/vpFit';
  import type { V3 } from '../lib/editor/camMath';

  type Props = {
    st: MatchState;
    /** Tap on the model while a pair waits for its 3D point; returns true when a point was taken. */
    onModelTap: (clientX: number, clientY: number) => boolean;
    onChange: () => void;
    /** Short status toast. */
    say?: (message: string) => void;
    /** The 3D model canvas (preserveDrawingBuffer) — the loupe magnifies it too. */
    modelCanvas?: HTMLCanvasElement | null;
  };
  let { st, onModelTap, onChange, say, modelCanvas = null }: Props = $props();

  let svg = $state<SVGSVGElement>();
  const vr = $derived(st.viewRect);
  const s = $derived(1 / st.k);

  function toRef(clientX: number, clientY: number): V2 {
    const r = svg!.getBoundingClientRect();
    return [vr.x0 + (clientX - r.left) * s, vr.y0 + (clientY - r.top) * s];
  }

  /** Segment a–b extended to the edges of the view (with margin). */
  function extend(a: V2, b: V2): [V2, V2] | null {
    const d: V2 = [b[0] - a[0], b[1] - a[1]];
    const len = Math.hypot(d[0], d[1]);
    if (len < 1e-9) return null;
    const m = Math.max(vr.w, vr.h);
    const x0 = vr.x0 - m * 0.05;
    const x1 = vr.x0 + vr.w + m * 0.05;
    const y0 = vr.y0 - m * 0.05;
    const y1 = vr.y0 + vr.h + m * 0.05;
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [p, q, lo, hi] of [
      [a[0], d[0], x0, x1],
      [a[1], d[1], y0, y1],
    ] as const) {
      if (Math.abs(q) < 1e-12) {
        if (p < lo || p > hi) return null;
        continue;
      }
      const ta = (lo - p) / q;
      const tb = (hi - p) / q;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 > t1) return null;
    return [
      [a[0] + d[0] * t0, a[1] + d[1] * t0],
      [a[0] + d[0] * t1, a[1] + d[1] * t1],
    ];
  }

  /** Segment p→q clipped to the view (with a small margin); null when it misses the view. */
  function clip(p: V2, q: V2): [V2, V2] | null {
    const m = Math.max(vr.w, vr.h) * 0.02;
    const lo = [vr.x0 - m, vr.y0 - m];
    const hi = [vr.x0 + vr.w + m, vr.y0 + vr.h + m];
    const d = [q[0] - p[0], q[1] - p[1]];
    let t0 = 0;
    let t1 = 1;
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]!) < 1e-12) {
        if (p[i]! < lo[i]! || p[i]! > hi[i]!) return null;
        continue;
      }
      const ta = (lo[i]! - p[i]!) / d[i]!;
      const tb = (hi[i]! - p[i]!) / d[i]!;
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (t0 > t1) return null;
    return [
      [p[0] + d[0]! * t0, p[1] + d[1]! * t0],
      [p[0] + d[0]! * t1, p[1] + d[1]! * t1],
    ];
  }
  /** Ray from `from` towards a homogeneous VP (to the VP itself, or far away when it is at infinity), clipped. */
  function rayTo(from: V2, vp: V3): [V2, V2] | null {
    const p = vpPoint(vp);
    if (p) return clip(from, p);
    const n = Math.hypot(vp[0], vp[1]) || 1;
    const sg = Math.sign(vp[2] || 1);
    const far = Math.max(vr.w, vr.h) * 10;
    return clip(from, [from[0] + (vp[0] * sg * far) / n, from[1] + (vp[1] * sg * far) / n]);
  }

  /**
   * "เส้นต่อถึงขอบ": the whole line of a guide — from its VP (or where it enters the view when the VP is off
   * screen), through the drawn segment, on to the view edge. VP at infinity → both directions. Clipped to the view.
   */
  function fullRay(l: { a: V2; b: V2 }, vp: V3): [V2, V2] | null {
    const p = vpPoint(vp);
    if (!p) return extend(l.a, l.b);
    const m: V2 = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2];
    const d: V2 = [m[0] - p[0], m[1] - p[1]];
    const n = Math.hypot(d[0], d[1]);
    if (n < 1e-9) return extend(l.a, l.b);
    const far = Math.max(vr.w, vr.h) * 4 + Math.hypot(m[0] - vr.x0, m[1] - vr.y0);
    return clip(p, [m[0] + (d[0] / n) * far, m[1] + (d[1] / n) * far]);
  }
  /** Ray (full or segment→VP) of one line against a fitted VP. */
  function rayOf(l: { a: V2; b: V2 }, vp: V3): [V2, V2] | null {
    if (st.rays) return fullRay(l, vp);
    // start the ray at the end of the line nearer to the VP
    const vpP = vpPoint(vp);
    const da = vpP ? Math.hypot(l.a[0] - vpP[0], l.a[1] - vpP[1]) : 0;
    const db = vpP ? Math.hypot(l.b[0] - vpP[0], l.b[1] - vpP[1]) : 0;
    let start: V2 = da < db ? l.a : l.b;
    if (!vpP) {
      const mx = (l.a[0] + l.b[0]) / 2;
      const my = (l.a[1] + l.b[1]) / 2;
      const sg = Math.sign(vp[2] || 1);
      start = (l.a[0] - mx) * vp[0] * sg + (l.a[1] - my) * vp[1] * sg > 0 ? l.a : l.b;
    }
    return rayTo(start, vp);
  }
  /** Ghost (other group) lines with their own faint rays; [] when the ghost is hidden. */
  const ghostInfo = $derived.by(() => {
    if (!st.ghost) return [];
    return st.otherLines.map((l) => {
      const f = st.ghostFits[l.axis];
      const ray = f && f.ids.includes(l.id) ? rayOf(l, f.fit.vp) : st.rays ? extend(l.a, l.b) : null;
      return { line: l, ray };
    });
  });
  const highlighted = $derived(new Set(st.highlight?.ids ?? []));

  // ---------- guide line ↔ mock-up edges ----------
  $effect(() => {
    void st.imageRect.src;
    void st.loadEdges();
  });
  /** Line being dragged (for the live edge label / ticks). */
  let dragId = $state<number | null>(null);
  /** The dragged line was pulled onto an image edge ("ดูดเข้าขอบภาพ" while dragging). */
  let edgeSnapped = $state(false);
  /** Per active line: alignment with the image edges (offset in ref px, band, samples for the ticks). */
  const edgeInfo = $derived.by(() => {
    const out = new Map<number, ReturnType<MatchState['edgeAlignOf']>>();
    if (!st.edgeMap || st.edgeMode === 'off') return out;
    for (const l of st.lines) out.set(l.id, st.edgeAlignOf(l.a, l.b));
    return out;
  });
  /** Lines whose perpendicular ticks (line → detected edge) are drawn. */
  const tickIds = $derived.by(() => {
    if (!st.showEdges) return new Set<number>();
    if (st.edgeMode === 'always' && dragId === null) return new Set(st.lines.map((l) => l.id));
    const ids = new Set<number>();
    if (dragId !== null) ids.add(dragId);
    else if (st.selectedLine !== null) ids.add(st.selectedLine);
    return ids;
  });
  const fmtPx = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : `${v < 10 ? v.toFixed(1) : Math.round(v)} px`);
  const tickColor = (off: number | null): string => {
    const d = Math.abs(off ?? 99) / (st.refPerImg || 1);
    return d < 1 ? '#3ddc6a' : d <= 2.5 ? '#ffb020' : '#ff3030';
  };

  /** Per line: residual to its axis VP (degrees), colour band, outlier flag and the faint ray to the VP. */
  const lineInfo = $derived.by(() => {
    const out = new Map<number, { deg: number; band: 'good' | 'warn' | 'bad'; outlier: boolean; ray: [V2, V2] | null }>();
    st.vpFits.forEach((f) => {
      if (!f) return;
      f.ids.forEach((id, i) => {
        const l = st.lines.find((x) => x.id === id);
        if (!l) return;
        const deg = f.fit.resDeg[i]!;
        out.set(id, { deg, band: residualBand(deg), outlier: f.fit.outlier[i]!, ray: rayOf(l, f.fit.vp) });
      });
    });
    return out;
  });
  /** While "ล็อกเข้าจุดลับตา" holds a drag: the ray the endpoint slides along. */
  let lockRay = $state<{ axis: number; ray: [V2, V2] | null } | null>(null);
  const fmtDeg = (deg: number): string => `${deg < 10 ? deg.toFixed(1) : Math.round(deg)}°`;

  /** Measured vanishing points: on-screen marker, or an arrow at the edge pointing to it. */
  const vpMarks = $derived.by(() => {
    const out: { axis: 0 | 1 | 2; inside: boolean; at: V2; angle: number; dist: number; par: boolean }[] = [];
    const cx = vr.x0 + vr.w / 2;
    const cy = vr.y0 + vr.h / 2;
    st.vps.forEach((fit, axis) => {
      if (!fit) return;
      const [X, Y, W] = fit.vp;
      const finite = Math.abs(W) > 1e-12 * Math.hypot(X, Y);
      const par = st.vpModes[axis] === 'parallel';
      const p: V2 | null = finite && !par ? [X / W, Y / W] : null;
      const inside = !!p && p[0] > vr.x0 && p[0] < vr.x0 + vr.w && p[1] > vr.y0 && p[1] < vr.y0 + vr.h;
      if (inside && p) {
        out.push({ axis: axis as 0 | 1 | 2, inside, at: p, angle: 0, dist: 0, par });
        return;
      }
      let dir: V2 = p ? [p[0] - cx, p[1] - cy] : [X * Math.sign(W || 1), Y * Math.sign(W || 1)];
      // parallel: a sign-free direction — put the marker on the top / right side for a stable place
      if (par && (dir[1] > 1e-9 || (Math.abs(dir[1]) <= 1e-9 && dir[0] < 0))) dir = [-dir[0], -dir[1]];
      const n = Math.hypot(dir[0], dir[1]) || 1;
      const u: V2 = [dir[0] / n, dir[1] / n];
      const pad = 26 * s;
      const tx = Math.abs(u[0]) > 1e-9 ? (vr.w / 2 - pad) / Math.abs(u[0]) : Infinity;
      const ty = Math.abs(u[1]) > 1e-9 ? (vr.h / 2 - pad) / Math.abs(u[1]) : Infinity;
      const t = Math.min(tx, ty);
      out.push({
        axis: axis as 0 | 1 | 2,
        inside: false,
        at: [cx + u[0] * t, cy + u[1] * t],
        angle: (Math.atan2(u[1], u[0]) * 180) / Math.PI,
        dist: p ? Math.hypot(p[0] - cx, p[1] - cy) : Infinity,
        par,
      });
    });
    return out;
  });

  /** Horizon of the solved camera (image of the ground plane's line at infinity). */
  const horizon = $derived.by(() => {
    const a = st.vpOf(0);
    const b = st.vpOf(1);
    if (!a || !b) return null;
    return extend(a, b);
  });

  const pairMarks = $derived(
    st.pairs.map((p) => ({ pair: p, proj: p.world ? st.projectPoint(p.world) : null })),
  );

  // ---------- pointer handling ----------
  type LineDrag = {
    kind: 'line'; id: number; end: End; off: V2; members: EndRef[]; x: number; y: number; moved: boolean;
    /** "ล็อกเข้าจุดลับตา": the line's fixed end and the VP of the other lines of its axis. */
    lock?: { fixed: V2; vp: V3; axis: number };
  };
  type SegDrag = { kind: 'seg'; id: number; p0: V2; a0: V2; b0: V2; ma: EndRef[]; mb: EndRef[]; x: number; y: number; moved: boolean };
  type Drag = LineDrag | SegDrag | { kind: 'pair'; id: number; off: V2 };
  let drag: Drag | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { startX: number; startY: number; moved: boolean; pinch: number | null; center: V2; zoom: number } | null = null;
  /** Current snap target while dragging (drawn as a ring + crosshair). */
  let hint = $state<(SnapTarget & { from?: End }) | null>(null);
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  const LONG_PRESS_MS = 550;
  const SNAP_LABEL = { endpoint: 'มุม', intersection: 'จุดตัด', segment: 'บนเส้น' } as const;
  const cornerList = $derived(joints(st.lines));

  // ---------- magnifier loupe (while dragging) ----------
  /** Dragged point in ref px + input kind; null when not dragging. */
  let loupe = $state<{ at: V2; touch: boolean; sx: number; sy: number; rx: number; ry: number } | null>(null);
  let loupeCanvas = $state<HTMLCanvasElement>();
  const LOUPE_MAG = 3.5;
  const loupeSize = $derived(loupe?.touch ? 124 : 140);
  /** Ref px per loupe px. */
  const ls = $derived(1 / (st.k * LOUPE_MAG));
  const loupeBox = $derived.by(() => {
    if (!loupe || !svg) return null;
    const D = loupeSize;
    const W = svg.clientWidth;
    const H = svg.clientHeight;
    const { sx, sy } = loupe;
    let cx: number;
    let cy: number;
    if (loupe.touch) {
      // above the finger; flip to the side when there is no room above
      cx = sx;
      cy = sy - D / 2 - 64;
      if (cy - D / 2 < 4) {
        cy = sy;
        cx = sx > W / 2 ? sx - D / 2 - 56 : sx + D / 2 + 56;
      }
    } else {
      // up-right of the cursor, never over the point; flip near edges
      const g = D / 2 + 26;
      cx = sx + g > W - D / 2 - 4 ? sx - g : sx + g;
      cy = sy - g < D / 2 + 4 ? sy + g : sy - g;
    }
    cx = Math.min(W - D / 2 - 4, Math.max(D / 2 + 4, cx));
    cy = Math.min(H - D / 2 - 4, Math.max(D / 2 + 4, cy));
    const w = D * ls;
    return { left: cx - D / 2, top: cy - D / 2, D, vb: [loupe.at[0] - w / 2, loupe.at[1] - w / 2, w, w] as const };
  });
  function showLoupe(event: PointerEvent, at: V2): void {
    const r = svg!.getBoundingClientRect();
    const sx = (at[0] - vr.x0) / s;
    const sy = (at[1] - vr.y0) / s;
    loupe = {
      at: [at[0], at[1]],
      touch: event.pointerType === 'touch' || event.pointerType === 'pen',
      sx: Math.max(0, Math.min(r.width, sx)),
      sy: Math.max(0, Math.min(r.height, sy)),
      rx: sx,
      ry: sy,
    };
  }
  /** Copy the magnified patch of the model render into the loupe (redrawn each frame while dragging). */
  function drawLoupeModel(): void {
    const c = loupeCanvas;
    const src = modelCanvas;
    if (!c || !src || !loupe || !svg) return;
    const D = loupeSize;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(D * dpr)) c.width = c.height = Math.round(D * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const f = src.width / (src.clientWidth || 1);
    const w = (D / LOUPE_MAG) * f;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(src, loupe.rx * f - w / 2, loupe.ry * f - w / 2, w, w, 0, 0, c.width, c.height);
  }
  let loupeRaf = 0;
  $effect(() => {
    if (!loupe) return;
    void loupe.rx;
    void loupe.ry;
    void st.cam;
    cancelAnimationFrame(loupeRaf);
    // two frames: the 3D view renders on the next frame after a camera change
    loupeRaf = requestAnimationFrame(() => {
      drawLoupeModel();
      loupeRaf = requestAnimationFrame(drawLoupeModel);
    });
  });

  // ---------- live solve while dragging (once per frame) ----------
  let solveRaf = 0;
  let solveWhat: 'lines' | 'pairs' = 'lines';
  function queueSolve(what: 'lines' | 'pairs'): void {
    solveWhat = what;
    if (solveRaf) return;
    solveRaf = requestAnimationFrame(() => {
      solveRaf = 0;
      if (st.dragging) st.solveLive(solveWhat);
    });
  }

  function clearPress(): void {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }
  function startHandle(event: PointerEvent, next: Drag): void {
    event.stopPropagation();
    event.preventDefault();
    svg!.setPointerCapture(event.pointerId);
    drag = next;
    hint = null;
    edgeSnapped = false;
    dragId = next.kind === 'pair' ? null : next.id;
    st.beginLive();
    if (next.kind === 'pair') st.selectedPair = next.id;
    else {
      st.selectedLine = next.id;
      st.pushLines();
    }
  }
  function lineHandle(event: PointerEvent, id: number, end: End): void {
    const line = st.lines.find((l) => l.id === id)!;
    const p = toRef(event.clientX, event.clientY);
    const at = line[end];
    const members = st.members({ line: id, end });
    let lock: LineDrag['lock'];
    if (st.lockVp) {
      const vp = lockVp(st.lines, id, st.vpFrame, members.map((m) => m.line), st.vpModes);
      if (vp) lock = { fixed: [...line[end === 'a' ? 'b' : 'a']], vp, axis: line.axis };
    }
    startHandle(event, { kind: 'line', id, end, off: [at[0] - p[0], at[1] - p[1]], members, x: event.clientX, y: event.clientY, moved: false, lock });
    // long-press on a shared corner = unlink this end
    clearPress();
    if (members.length > 1) {
      pressTimer = setTimeout(() => {
        pressTimer = null;
        if (drag?.kind !== 'line' || drag.id !== id || drag.moved) return;
        st.dropLastPush();
        drag = null;
        dragId = null;
        loupe = null;
        lockRay = null;
        st.endLive();
        if (st.unlink({ line: id, end })) {
          navigator.vibrate?.(25);
          say?.('แยกมุมแล้ว — ปลายเส้นนี้ลากได้อิสระ');
          onChange();
        }
      }, LONG_PRESS_MS);
    }
  }
  function segHandle(event: PointerEvent, id: number): void {
    const line = st.lines.find((l) => l.id === id)!;
    startHandle(event, {
      kind: 'seg',
      id,
      p0: toRef(event.clientX, event.clientY),
      a0: [...line.a],
      b0: [...line.b],
      ma: st.members({ line: id, end: 'a' }),
      mb: st.members({ line: id, end: 'b' }),
      x: event.clientX,
      y: event.clientY,
      moved: false,
    });
  }
  function pairHandle(event: PointerEvent, id: number): void {
    const pair = st.pairs.find((q) => q.id === id)!;
    const p = toRef(event.clientX, event.clientY);
    startHandle(event, { kind: 'pair', id, off: [pair.image![0] - p[0], pair.image![1] - p[1]] });
  }
  function setEnds(refs: EndRef[], q: V2): void {
    for (const r of refs) {
      const l = st.lines.find((x) => x.id === r.line);
      if (l) l[r.end] = [q[0], q[1]];
    }
  }
  /** Snap radius in ref px: constant on screen (12 px mouse / 22 px touch), so it shrinks as you zoom in. */
  const threshold = (event: PointerEvent): number => (event.pointerType === 'touch' ? SNAP_PX.touch : SNAP_PX.mouse) / st.k;
  const snapOn = (event: PointerEvent): boolean => st.snap && !event.altKey;

  function dragMove(event: PointerEvent, d: Drag): void {
    const p = toRef(event.clientX, event.clientY);
    if (d.kind === 'pair') {
      const pair = st.pairs.find((x) => x.id === d.id);
      if (pair) pair.image = [p[0] + d.off[0], p[1] + d.off[1]];
      showLoupe(event, [p[0] + d.off[0], p[1] + d.off[1]]);
      queueSolve('pairs');
      return;
    }
    if (!d.moved) {
      if (Math.hypot(event.clientX - d.x, event.clientY - d.y) < 4) return;
      d.moved = true;
      clearPress();
    }
    if (d.kind === 'line') {
      let q: V2 = [p[0] + d.off[0], p[1] + d.off[1]];
      // locked: slide along the ray from the fixed end to the VP of the other lines of this axis
      const lock = d.lock;
      if (lock) q = lockedPoint(lock.fixed, lock.vp, q) ?? q;
      let t = snapOn(event) ? snapEndpoint(st.snapPool, { line: d.id, end: d.end }, q, threshold(event), d.members) : null;
      // with the lock, a corner still wins when it (nearly) lies on the ray; an intersection is on the ray by construction
      if (t && lock && (t.kind === 'segment' || distToRay(lock.fixed, lock.vp, t.point) > threshold(event))) t = null;
      if (t) q = t.point;
      // lowest priority: pull the line onto the image edge under it (other end fixed)
      edgeSnapped = false;
      if (!t && !lock && st.edgeSnap && !event.altKey && st.edgeMap) {
        const l = st.lines.find((x) => x.id === d.id);
        if (l) {
          const other = d.end === 'a' ? l.b : l.a;
          const r = d.end === 'a' ? st.edgeFitSegment(q, other, { b: true }, 6) : st.edgeFitSegment(other, q, { a: true }, 6);
          const nq = r ? (d.end === 'a' ? r.a : r.b) : null;
          if (nq && Math.hypot(nq[0] - q[0], nq[1] - q[1]) < threshold(event)) {
            q = nq;
            edgeSnapped = true;
          }
        }
      }
      lockRay = lock ? { axis: lock.axis, ray: rayTo(lock.fixed, lock.vp) } : null;
      hint = t ? { ...t, from: d.end } : null;
      setEnds(d.members, q);
      showLoupe(event, q);
      queueSolve('lines');
    } else {
      const dx = p[0] - d.p0[0];
      const dy = p[1] - d.p0[1];
      let a: V2 = [d.a0[0] + dx, d.a0[1] + dy];
      let b: V2 = [d.b0[0] + dx, d.b0[1] + dy];
      const t = snapOn(event) ? snapLine(st.snapPool, d.id, a, b, threshold(event), [...d.ma, ...d.mb]) : null;
      if (t) {
        a = [a[0] + t.delta[0], a[1] + t.delta[1]];
        b = [b[0] + t.delta[0], b[1] + t.delta[1]];
      }
      edgeSnapped = false;
      if (!t && st.edgeSnap && !event.altKey && st.edgeMap) {
        const r = st.edgeFitSegment(a, b, {}, 6);
        if (r && Math.max(Math.hypot(r.a[0] - a[0], r.a[1] - a[1]), Math.hypot(r.b[0] - b[0], r.b[1] - b[1])) < threshold(event)) {
          a = r.a;
          b = r.b;
          edgeSnapped = true;
        }
      }
      hint = t ? { ...t, from: t.moved } : null;
      setEnds(d.ma, a);
      setEnds(d.mb, b);
      showLoupe(event, t ? t.point : [p[0], p[1]]);
      queueSolve('lines');
    }
  }
  /** Final solve on release so the camera matches the dropped lines, then leave live mode. */
  function finishLive(d: Drag): void {
    cancelAnimationFrame(solveRaf);
    solveRaf = 0;
    if (d.kind === 'pair' || d.moved) st.solveLive(d.kind === 'pair' ? 'pairs' : 'lines');
    st.endLive();
  }
  function dragEnd(d: Drag): void {
    clearPress();
    const t = hint;
    hint = null;
    dragId = null;
    edgeSnapped = false;
    loupe = null;
    lockRay = null;
    finishLive(d);
    if (d.kind === 'pair') return onChange();
    // endpoints that land on another axis's endpoint become one shared corner
    // (corners never link across groups: a ghost line is only a snap target)
    if (t?.kind === 'endpoint' && t.end && t.from && st.isActive(t.line)) {
      st.link({ line: d.id, end: t.from }, { line: t.line, end: t.end });
      say?.('เชื่อมมุมแล้ว — ลากไปด้วยกัน (กดค้างที่มุมเพื่อแยก)');
    }
    st.dropLastPush();
    onChange();
  }

  function down(event: PointerEvent): void {
    if (drag) return;
    svg!.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      gesture = { startX: event.clientX, startY: event.clientY, moved: false, pinch: null, center: [...st.center], zoom: st.zoom };
    } else if (pts.length === 2 && gesture) {
      gesture.moved = true;
      gesture.pinch = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      gesture.center = [...st.center];
      gesture.zoom = st.zoom;
    }
  }
  function move(event: PointerEvent): void {
    if (drag) {
      dragMove(event, drag);
      return;
    }
    if (!pointers.has(event.pointerId) || !gesture) return;
    const prev = pointers.get(event.pointerId)!;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pts = [...pointers.values()];
    if (pts.length >= 2 && gesture.pinch) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const mid = toRef((pts[0]!.x + pts[1]!.x) / 2, (pts[0]!.y + pts[1]!.y) / 2);
      st.zoomAt(dist / gesture.pinch, mid);
      gesture.pinch = dist;
      return;
    }
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 6) gesture.moved = true;
    if (gesture.moved) st.center = [st.center[0] - (event.clientX - prev.x) * s, st.center[1] - (event.clientY - prev.y) * s];
  }
  function up(event: PointerEvent): void {
    if (drag) {
      const d = drag;
      drag = null;
      dragEnd(d);
      return;
    }
    if (!pointers.has(event.pointerId)) {
      clearPress();
      return;
    }
    const g = gesture;
    pointers.delete(event.pointerId);
    if (pointers.size > 0) return;
    gesture = null;
    if (!g || g.moved) return;
    // a tap
    const pick = st.pick;
    if (pick?.want === 'image') {
      st.setPairImage(pick.pairId, toRef(event.clientX, event.clientY));
      onChange();
    } else if (pick?.want === 'model') {
      onModelTap(event.clientX, event.clientY);
    } else {
      st.selectedLine = null;
      st.selectedPair = null;
    }
  }
  function wheel(event: WheelEvent): void {
    event.preventDefault();
    st.zoomAt(Math.exp(-event.deltaY * 0.0015), toRef(event.clientX, event.clientY));
  }
</script>

<svg
  bind:this={svg}
  class="guides"
  class:picking={!!st.pick}
  viewBox="{vr.x0} {vr.y0} {vr.w} {vr.h}"
  preserveAspectRatio="none"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  onwheel={wheel}
  role="application"
  aria-label="เส้นนำสายตา ลากปลายเส้นให้ทับขอบในภาพ"
  data-guides
  data-edge-mode={st.edgeMode}
  data-edge-ready={st.edgeMap ? 'true' : null}
>
  {#if st.showEdges && st.edgeUrl}
    {@const img = st.imageRect}
    <g class="edgelayer" data-edge-overlay>
      <rect x={vr.x0} y={vr.y0} width={vr.w} height={vr.h} class="edim" />
      <image href={st.edgeUrl} x={img.x} y={img.y} width={img.w} height={img.h} preserveAspectRatio="none" class="eimg" />
    </g>
  {/if}
  {#if horizon}
    <line x1={horizon[0][0]} y1={horizon[0][1]} x2={horizon[1][0]} y2={horizon[1][1]} class="horizon" />
  {/if}
  {#each ghostInfo as g (g.line.id)}
    {@const c = AXIS_COLORS[g.line.axis]}
    <g class="ghost" data-ghost-line={g.line.id} data-group={st.otherGroup}>
      {#if g.ray}
        <line x1={g.ray[0][0]} y1={g.ray[0][1]} x2={g.ray[1][0]} y2={g.ray[1][1]} stroke={c} class="gray" data-ray={g.line.id} />
      {/if}
      {#if highlighted.has(g.line.id)}
        <line x1={g.line.a[0]} y1={g.line.a[1]} x2={g.line.b[0]} y2={g.line.b[1]} class="hl" data-hl={g.line.id} />
      {/if}
      <line x1={g.line.a[0]} y1={g.line.a[1]} x2={g.line.b[0]} y2={g.line.b[1]} stroke={c} class="gseg" />
      {#each ['a', 'b'] as const as end (end)}
        <circle cx={g.line[end][0]} cy={g.line[end][1]} r={4 * s} fill={c} class="gdot" />
      {/each}
    </g>
  {/each}
  {#each st.lines as line (line.id)}
    {@const info = lineInfo.get(line.id)}
    {@const ext = info ? null : extend(line.a, line.b)}
    {@const c = AXIS_COLORS[line.axis]}
    {@const sel = st.selectedLine === line.id}
    {#if ext}
      <line x1={ext[0][0]} y1={ext[0][1]} x2={ext[1][0]} y2={ext[1][1]} stroke={c} class="ext" />
    {/if}
    {#if info?.ray}
      <line x1={info.ray[0][0]} y1={info.ray[0][1]} x2={info.ray[1][0]} y2={info.ray[1][1]} stroke={c} class="vray" class:full={st.rays}
        data-vp-ray={line.id} data-ray={st.rays ? line.id : null} />
    {/if}
    {#if highlighted.has(line.id)}
      <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} class="hl" data-hl={line.id} />
    {/if}
    {@const ea = edgeInfo.get(line.id)}
    {#if ea && st.showEdges}
      <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} class="ehalo {ea.band}" data-edge-halo={line.id} data-edge-band={ea.band}
        data-edge-off={ea.meanOff === null ? null : ea.meanOff.toFixed(3)} data-edge-score={ea.score.toFixed(3)} />
    {/if}
    {#if info}
      <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} class="halo {info.band}" class:outlier={info.outlier}
        data-res={line.id} data-band={info.band} data-deg={info.deg.toFixed(4)} data-outlier={info.outlier || null} />
    {/if}
    <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} stroke={c} class="seg" class:sel />
    {#if ea && tickIds.has(line.id)}
      <g class="ticks" data-edge-ticks={line.id}>
        {#each ea.samples as sm, i (i)}
          {#if sm.q}
            <line x1={sm.p[0]} y1={sm.p[1]} x2={sm.q[0]} y2={sm.q[1]} stroke={tickColor(sm.off)} class="tick" data-edge-tick />
            <circle cx={sm.q[0]} cy={sm.q[1]} r={1.8 * s} fill={tickColor(sm.off)} class="tickdot" />
          {:else}
            <circle cx={sm.p[0]} cy={sm.p[1]} r={1.5 * s} class="tickmiss" />
          {/if}
        {/each}
      </g>
    {/if}
    {#if ea && dragId === line.id && st.showEdges}
      {@const mx = (line.a[0] + line.b[0]) / 2}
      {@const my = (line.a[1] + line.b[1]) / 2}
      <text x={mx + 10 * s} y={my + 22 * s} font-size={13 * s} stroke-width={3 * s} class="elabel {ea.band}" data-edge-label={line.id}
        >{ea.meanOff === null ? 'ไม่พบขอบภาพใกล้เส้น' : `ห่างขอบภาพ ${fmtPx(ea.meanOff)}`}{edgeSnapped ? ' · ดูดแล้ว' : ''}</text>
    {/if}
    {#if info && info.band !== 'good'}
      <text x={(line.a[0] + line.b[0]) / 2 + 8 * s} y={(line.a[1] + line.b[1]) / 2 - 8 * s} font-size={12 * s} stroke-width={3 * s} class="rlabel {info.band}"
        data-res-label={line.id}>{info.outlier ? '⚠ ' : ''}{fmtDeg(info.deg)}</text>
    {/if}
    <line
      x1={line.a[0]}
      y1={line.a[1]}
      x2={line.b[0]}
      y2={line.b[1]}
      class="handle seg-hit"
      role="button"
      tabindex="-1"
      aria-label="ลากทั้งเส้น"
      data-seg={line.id}
      onpointerdown={(e) => segHandle(e, line.id)}
    />
  {/each}
  {#if lockRay?.ray}
    <line x1={lockRay.ray[0][0]} y1={lockRay.ray[0][1]} x2={lockRay.ray[1][0]} y2={lockRay.ray[1][1]} stroke={AXIS_COLORS[lockRay.axis]} class="lockray" data-vp-lock />
  {/if}
  {#each cornerList as j (j.id)}
    <g class="joint" data-joint={j.id} data-members={j.members.length}>
      <rect x={j.point[0] - 17 * s} y={j.point[1] - 17 * s} width={34 * s} height={34 * s} rx={6 * s} />
    </g>
  {/each}
  {#each st.lines as line (line.id)}
    {@const c = AXIS_COLORS[line.axis]}
    {@const sel = st.selectedLine === line.id}
    {#each ['a', 'b'] as const as end (end)}
      {@const p = line[end]}
      <g
        class="handle"
        role="button"
        tabindex="-1"
        aria-label="ปลายเส้น"
        data-handle="{line.id}-{end}"
        data-axis={line.axis}
        data-linked={line.links?.[end] ?? null}
        onpointerdown={(e) => lineHandle(e, line.id, end)}
      >
        <circle cx={p[0]} cy={p[1]} r={24 * s} class="hit" />
        <circle cx={p[0]} cy={p[1]} r={(sel ? 13 : 11) * s} fill={c} class="dot" class:sel />
        <circle cx={p[0]} cy={p[1]} r={2.2 * s} class="pin" />
      </g>
    {/each}
  {/each}
  {#if hint}
    <g class="snap" data-snap-indicator={hint.kind}>
      <circle cx={hint.point[0]} cy={hint.point[1]} r={18 * s} class="snap-ring" />
      <line x1={hint.point[0] - 26 * s} y1={hint.point[1]} x2={hint.point[0] + 26 * s} y2={hint.point[1]} />
      <line x1={hint.point[0]} y1={hint.point[1] - 26 * s} x2={hint.point[0]} y2={hint.point[1] + 26 * s} />
      <text x={hint.point[0] + 22 * s} y={hint.point[1] - 20 * s} font-size={13 * s}>{SNAP_LABEL[hint.kind]}</text>
    </g>
  {/if}

  {#each vpMarks as m (m.axis)}
    {#if m.inside}
      <g class="vp" data-vp={m.axis}>
        <circle cx={m.at[0]} cy={m.at[1]} r={9 * s} fill="none" stroke={AXIS_COLORS[m.axis]} />
        <line x1={m.at[0] - 14 * s} y1={m.at[1]} x2={m.at[0] + 14 * s} y2={m.at[1]} stroke={AXIS_COLORS[m.axis]} />
        <line x1={m.at[0]} y1={m.at[1] - 14 * s} x2={m.at[0]} y2={m.at[1] + 14 * s} stroke={AXIS_COLORS[m.axis]} />
        <text x={m.at[0] + 12 * s} y={m.at[1] - 10 * s} font-size={14 * s} fill={AXIS_COLORS[m.axis]}>VP {AXIS_NAMES[m.axis]}</text>
      </g>
    {:else if m.par}
      <!-- parallel axis: VP at infinity → a two-headed "∞" direction arrow at the edge -->
      <g class="vp off par" data-vp={m.axis} data-vp-parallel={m.axis} transform="translate({m.at[0]} {m.at[1]})">
        <g transform="rotate({m.angle})">
          <line x1={-16 * s} y1={0} x2={16 * s} y2={0} stroke={AXIS_COLORS[m.axis]} stroke-width={3 * s} />
          <path d="M {8 * s} {-7 * s} L {20 * s} 0 L {8 * s} {7 * s} Z" fill={AXIS_COLORS[m.axis]} />
          <path d="M {-8 * s} {-7 * s} L {-20 * s} 0 L {-8 * s} {7 * s} Z" fill={AXIS_COLORS[m.axis]} />
        </g>
        <text x={0} y={(m.at[1] > vr.y0 + vr.h / 2 ? -16 : 28) * s} font-size={13 * s} text-anchor="middle" fill={AXIS_COLORS[m.axis]}
          >∞ {AXIS_NAMES[m.axis]} ขนาน</text
        >
      </g>
    {:else}
      <g class="vp off" data-vp={m.axis} transform="translate({m.at[0]} {m.at[1]})">
        <g transform="rotate({m.angle})">
          <path d="M {-10 * s} {-9 * s} L {12 * s} 0 L {-10 * s} {9 * s} Z" fill={AXIS_COLORS[m.axis]} />
        </g>
        <text x={0} y={(m.at[1] > vr.y0 + vr.h / 2 ? -14 : 24) * s} font-size={13 * s} text-anchor="middle" fill={AXIS_COLORS[m.axis]}
          >VP {AXIS_NAMES[m.axis]} {Number.isFinite(m.dist) ? `${Math.round(m.dist)} px` : '∞'}</text
        >
      </g>
    {/if}
  {/each}

  {#each pairMarks as { pair, proj }, i (pair.id)}
    {@const sel = st.selectedPair === pair.id}
    {#if proj && pair.image}
      <line x1={proj[0]} y1={proj[1]} x2={pair.image[0]} y2={pair.image[1]} class="resid" />
    {/if}
    {#if proj}
      <circle cx={proj[0]} cy={proj[1]} r={6 * s} class="proj" />
    {/if}
    {#if pair.image}
      {@const p = pair.image}
      <g class="handle pair" role="button" tabindex="-1" aria-label="จุดบนภาพ" data-pair={pair.id} onpointerdown={(e) => pairHandle(e, pair.id)}>
        <circle cx={p[0]} cy={p[1]} r={24 * s} class="hit" />
        <rect x={p[0] - 9 * s} y={p[1] - 9 * s} width={18 * s} height={18 * s} class="pdot" class:sel transform="rotate(45 {p[0]} {p[1]})" />
        <circle cx={p[0]} cy={p[1]} r={2.2 * s} class="pin" />
        <text x={p[0] + 13 * s} y={p[1] + 5 * s} font-size={14 * s} class="plabel">{i + 1}</text>
      </g>
    {/if}
  {/each}
</svg>

{#if loupeBox && loupe}
  {@const img = st.imageRect}
  {@const c = loupe.at}
  <div class="loupe" style="left:{loupeBox.left}px;top:{loupeBox.top}px;width:{loupeBox.D}px;height:{loupeBox.D}px" data-loupe aria-hidden="true">
    <svg viewBox={loupeBox.vb.join(' ')} preserveAspectRatio="none">
      <image href={img.src} x={img.x} y={img.y} width={img.w} height={img.h} preserveAspectRatio="none" />
    </svg>
    <canvas bind:this={loupeCanvas} class="lmodel" class:diff={st.showDiff} style={st.showDiff ? '' : `opacity:${st.showEdges ? 0 : st.opacity / 100}`} data-loupe-model={st.showDiff ? 'diff' : 'overlay'}></canvas>
    <svg viewBox={loupeBox.vb.join(' ')} preserveAspectRatio="none">
      {#if st.showEdges && st.edgeUrl}
        <g data-loupe-edges>
          <rect x={loupeBox.vb[0]} y={loupeBox.vb[1]} width={loupeBox.vb[2]} height={loupeBox.vb[3]} class="edim" />
          <image href={st.edgeUrl} x={img.x} y={img.y} width={img.w} height={img.h} preserveAspectRatio="none" class="eimg" />
        </g>
      {/if}
      {#each st.lines as line (line.id)}
        {@const ea = tickIds.has(line.id) ? edgeInfo.get(line.id) : null}
        {#if ea}
          {#each ea.samples as sm, i (i)}
            {#if sm.q}<line x1={sm.p[0]} y1={sm.p[1]} x2={sm.q[0]} y2={sm.q[1]} stroke={tickColor(sm.off)} class="tick" />{/if}
          {/each}
        {/if}
        {@const ext = extend(line.a, line.b)}
        {#if ext}<line x1={ext[0][0]} y1={ext[0][1]} x2={ext[1][0]} y2={ext[1][1]} stroke={AXIS_COLORS[line.axis]} class="ext" />{/if}
        <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} stroke={AXIS_COLORS[line.axis]} class="lseg" />
        {#each ['a', 'b'] as const as end (end)}
          <circle cx={line[end][0]} cy={line[end][1]} r={7 * ls} fill="none" stroke={AXIS_COLORS[line.axis]} class="lend" />
        {/each}
      {/each}
      {#each st.pairs as pair (pair.id)}
        {#if pair.image}<rect x={pair.image[0] - 6 * ls} y={pair.image[1] - 6 * ls} width={12 * ls} height={12 * ls} class="lpair" transform="rotate(45 {pair.image[0]} {pair.image[1]})" />{/if}
      {/each}
      {#if hint}
        <circle cx={hint.point[0]} cy={hint.point[1]} r={16 * ls} class="snap-ring" data-loupe-snap={hint.kind} />
      {/if}
      <g class="reticle">
        <line x1={c[0] - 60 * ls} y1={c[1]} x2={c[0] - 6 * ls} y2={c[1]} />
        <line x1={c[0] + 6 * ls} y1={c[1]} x2={c[0] + 60 * ls} y2={c[1]} />
        <line x1={c[0]} y1={c[1] - 60 * ls} x2={c[0]} y2={c[1] - 6 * ls} />
        <line x1={c[0]} y1={c[1] + 6 * ls} x2={c[0]} y2={c[1] + 60 * ls} />
        <circle cx={c[0]} cy={c[1]} r={1.4 * ls} class="rdot" />
      </g>
    </svg>
    {#if hint}<span class="lsnap">{SNAP_LABEL[hint.kind]}</span>
    {:else if edgeSnapped}<span class="lsnap" data-loupe-edge-snap>ขอบภาพ</span>
    {:else if dragId !== null && st.showEdges && edgeInfo.get(dragId)}<span class="lsnap edge" data-loupe-edge-off>ห่างขอบ {fmtPx(edgeInfo.get(dragId)?.meanOff)}</span>{/if}
  </div>
{/if}

<style>
  .guides { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; z-index: 3; }
  .guides.picking { cursor: crosshair; }
  .guides.picking .handle { pointer-events: none; }
  line, circle, path, rect { vector-effect: non-scaling-stroke; }
  .ext { stroke-width: 1.5; stroke-dasharray: 7 6; opacity: 0.85; }
  .seg { stroke-width: 3.5; }
  .vray { stroke-width: 1; opacity: 0.4; pointer-events: none; }
  .vray.full { stroke-width: 1.2; opacity: 0.5; }
  .ghost { pointer-events: none; }
  .gray { stroke-width: 1; opacity: 0.22; }
  .gseg { stroke-width: 2; opacity: 0.45; stroke-dasharray: 8 4; }
  .gdot { opacity: 0.45; }
  .hl { stroke: #fff; stroke-width: 11; stroke-linecap: round; opacity: 0.9; pointer-events: none; stroke-dasharray: 3 3; filter: drop-shadow(0 0 3px #ff00d4); }
  .edgelayer { pointer-events: none; }
  .edim { fill: #000; opacity: 0.62; pointer-events: none; }
  .eimg { pointer-events: none; image-rendering: auto; }
  .ehalo { stroke-width: 16; stroke-linecap: round; opacity: 0.32; pointer-events: none; }
  .ehalo.good { stroke: #3ddc6a; }
  .ehalo.warn { stroke: #ffb020; }
  .ehalo.bad { stroke: #ff3030; }
  .ehalo.none { stroke: #9aa7b4; stroke-dasharray: 4 6; }
  .ticks { pointer-events: none; }
  .tick { stroke-width: 1.6; }
  .tickmiss { fill: #9aa7b4; opacity: 0.7; }
  .elabel { font-weight: 700; paint-order: stroke; stroke: rgba(0, 0, 0, 0.85); pointer-events: none; fill: #e8f6ff; }
  .elabel.good { fill: #7dffa0; }
  .elabel.warn { fill: #ffc65c; }
  .elabel.bad { fill: #ff8a8a; }
  .lsnap.edge { color: #9ff; }
  .halo { stroke-width: 9; stroke-linecap: round; opacity: 0.55; pointer-events: none; }
  .halo.good { stroke: #3ddc6a; }
  .halo.warn { stroke: #ffb020; }
  .halo.bad { stroke: #ff3030; }
  .halo.outlier { stroke-dasharray: 6 4; opacity: 0.85; }
  .rlabel { font-weight: 700; paint-order: stroke; stroke: rgba(0, 0, 0, 0.8); pointer-events: none; }
  .rlabel.warn { fill: #ffb020; }
  .rlabel.bad { fill: #ff6b6b; }
  .lockray { stroke-width: 2; stroke-dasharray: 10 4 2 4; opacity: 0.95; pointer-events: none; }
  .seg.sel { stroke-width: 5; }
  .horizon { stroke: #ffe14d; stroke-width: 1.5; stroke-dasharray: 2 5; opacity: 0.9; }
  .handle { cursor: move; }
  .seg-hit { stroke: transparent; stroke-width: 22; stroke-linecap: round; fill: none; pointer-events: stroke; }
  .joint rect { fill: none; stroke: #ffe14d; stroke-width: 2.5; stroke-dasharray: 5 3; pointer-events: none; }
  .snap { pointer-events: none; }
  .loupe {
    position: absolute; z-index: 5; pointer-events: none; border-radius: 50%; overflow: hidden;
    border: 3px solid #fff; box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.55), 0 6px 18px rgba(0, 0, 0, 0.5); background: #0b1620;
  }
  .loupe { isolation: isolate; }
  .loupe svg, .loupe canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
  .lmodel.diff { mix-blend-mode: difference; }
  .lseg { stroke-width: 2; }
  .lend { stroke-width: 1.5; }
  .lpair { fill: none; stroke: #ff4dd8; stroke-width: 2; }
  .reticle line { stroke: #fff; stroke-width: 1.5; filter: drop-shadow(0 0 1px #000); }
  .rdot { fill: #ff2d2d; }
  .lsnap {
    position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); font-size: 12px; font-weight: 700;
    color: #ffe14d; background: rgba(0, 0, 0, 0.65); padding: 1px 6px; border-radius: 6px;
  }
  .snap line { stroke: #fff; stroke-width: 1.5; }
  .snap-ring { fill: rgba(255, 225, 77, 0.18); stroke: #ffe14d; stroke-width: 3; }
  .snap text { fill: #ffe14d; font-weight: 700; paint-order: stroke; stroke: rgba(0, 0, 0, 0.8); stroke-width: 3px; }
  .hit { fill: transparent; }
  .dot { stroke: #fff; stroke-width: 2; opacity: 0.88; }
  .dot.sel { stroke: #ffe14d; stroke-width: 3; }
  .pin { fill: #fff; }
  .vp line, .vp circle { stroke-width: 2; }
  .vp text, .plabel { font-weight: 700; paint-order: stroke; stroke: rgba(0, 0, 0, 0.75); stroke-width: 3px; }
  .proj { fill: none; stroke: #39f3ff; stroke-width: 2.5; }
  .resid { stroke: #39f3ff; stroke-width: 1.5; }
  .pdot { fill: #ff4dd8; stroke: #fff; stroke-width: 2; }
  .pdot.sel { stroke: #ffe14d; stroke-width: 3; }
  .plabel { fill: #ff9cf0; }
</style>
