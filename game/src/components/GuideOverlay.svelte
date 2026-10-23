<script lang="ts">
  import type { V2 } from '../lib/editor/camMath';
  import { AXIS_COLORS, AXIS_NAMES, type MatchState } from '../lib/editor/matchState.svelte';

  type Props = {
    st: MatchState;
    /** Tap on the model while a pair waits for its 3D point; returns true when a point was taken. */
    onModelTap: (clientX: number, clientY: number) => boolean;
    onChange: () => void;
  };
  let { st, onModelTap, onChange }: Props = $props();

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

  /** Measured vanishing points: on-screen marker, or an arrow at the edge pointing to it. */
  const vpMarks = $derived.by(() => {
    const out: { axis: 0 | 1 | 2; inside: boolean; at: V2; angle: number; dist: number }[] = [];
    const cx = vr.x0 + vr.w / 2;
    const cy = vr.y0 + vr.h / 2;
    st.vps.forEach((fit, axis) => {
      if (!fit) return;
      const [X, Y, W] = fit.vp;
      const finite = Math.abs(W) > 1e-12 * Math.hypot(X, Y);
      const p: V2 | null = finite ? [X / W, Y / W] : null;
      const inside = !!p && p[0] > vr.x0 && p[0] < vr.x0 + vr.w && p[1] > vr.y0 && p[1] < vr.y0 + vr.h;
      if (inside && p) {
        out.push({ axis: axis as 0 | 1 | 2, inside, at: p, angle: 0, dist: 0 });
        return;
      }
      const dir: V2 = p ? [p[0] - cx, p[1] - cy] : [X * Math.sign(W || 1), Y * Math.sign(W || 1)];
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
  type Drag = { kind: 'line'; id: number; end: 'a' | 'b'; off: V2 } | { kind: 'pair'; id: number; off: V2 };
  let drag: Drag | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: { startX: number; startY: number; moved: boolean; pinch: number | null; center: V2; zoom: number } | null = null;

  function startHandle(event: PointerEvent, next: Drag): void {
    event.stopPropagation();
    event.preventDefault();
    svg!.setPointerCapture(event.pointerId);
    drag = next;
    if (next.kind === 'line') st.selectedLine = next.id;
    else st.selectedPair = next.id;
  }
  function lineHandle(event: PointerEvent, id: number, end: 'a' | 'b'): void {
    const line = st.lines.find((l) => l.id === id)!;
    const p = toRef(event.clientX, event.clientY);
    const at = line[end];
    startHandle(event, { kind: 'line', id, end, off: [at[0] - p[0], at[1] - p[1]] });
  }
  function pairHandle(event: PointerEvent, id: number): void {
    const pair = st.pairs.find((q) => q.id === id)!;
    const p = toRef(event.clientX, event.clientY);
    startHandle(event, { kind: 'pair', id, off: [pair.image![0] - p[0], pair.image![1] - p[1]] });
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
      const p = toRef(event.clientX, event.clientY);
      const q: V2 = [p[0] + drag.off[0], p[1] + drag.off[1]];
      if (drag.kind === 'line') {
        const d = drag;
        const line = st.lines.find((l) => l.id === d.id);
        if (line) line[d.end] = q;
      } else {
        const d = drag;
        const pair = st.pairs.find((x) => x.id === d.id);
        if (pair) pair.image = q;
      }
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
      drag = null;
      onChange();
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
>
  {#if horizon}
    <line x1={horizon[0][0]} y1={horizon[0][1]} x2={horizon[1][0]} y2={horizon[1][1]} class="horizon" />
  {/if}
  {#each st.lines as line (line.id)}
    {@const ext = extend(line.a, line.b)}
    {@const c = AXIS_COLORS[line.axis]}
    {@const sel = st.selectedLine === line.id}
    {#if ext}
      <line x1={ext[0][0]} y1={ext[0][1]} x2={ext[1][0]} y2={ext[1][1]} stroke={c} class="ext" />
    {/if}
    <line x1={line.a[0]} y1={line.a[1]} x2={line.b[0]} y2={line.b[1]} stroke={c} class="seg" class:sel />
    {#each ['a', 'b'] as const as end (end)}
      {@const p = line[end]}
      <g class="handle" role="button" tabindex="-1" aria-label="ปลายเส้น" data-handle="{line.id}-{end}" data-axis={line.axis} onpointerdown={(e) => lineHandle(e, line.id, end)}>
        <circle cx={p[0]} cy={p[1]} r={24 * s} class="hit" />
        <circle cx={p[0]} cy={p[1]} r={(sel ? 13 : 11) * s} fill={c} class="dot" class:sel />
        <circle cx={p[0]} cy={p[1]} r={2.2 * s} class="pin" />
      </g>
    {/each}
  {/each}

  {#each vpMarks as m (m.axis)}
    {#if m.inside}
      <g class="vp" data-vp={m.axis}>
        <circle cx={m.at[0]} cy={m.at[1]} r={9 * s} fill="none" stroke={AXIS_COLORS[m.axis]} />
        <line x1={m.at[0] - 14 * s} y1={m.at[1]} x2={m.at[0] + 14 * s} y2={m.at[1]} stroke={AXIS_COLORS[m.axis]} />
        <line x1={m.at[0]} y1={m.at[1] - 14 * s} x2={m.at[0]} y2={m.at[1] + 14 * s} stroke={AXIS_COLORS[m.axis]} />
        <text x={m.at[0] + 12 * s} y={m.at[1] - 10 * s} font-size={14 * s} fill={AXIS_COLORS[m.axis]}>VP {AXIS_NAMES[m.axis]}</text>
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

<style>
  .guides { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; cursor: grab; z-index: 3; }
  .guides.picking { cursor: crosshair; }
  .guides.picking .handle { pointer-events: none; }
  line, circle, path, rect { vector-effect: non-scaling-stroke; }
  .ext { stroke-width: 1.5; stroke-dasharray: 7 6; opacity: 0.85; }
  .seg { stroke-width: 3; }
  .seg.sel { stroke-width: 5; }
  .horizon { stroke: #ffe14d; stroke-width: 1.5; stroke-dasharray: 2 5; opacity: 0.9; }
  .handle { cursor: move; }
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
