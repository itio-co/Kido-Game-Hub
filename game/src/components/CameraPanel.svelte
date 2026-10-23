<script lang="ts">
  import type { Axis, V3 } from '../lib/editor/camMath';
  import type { DisplayMode } from '../lib/editor/modelEditor';
  import { AXIS_COLORS, AXIS_NAMES, type MatchState, type PrincipalMode } from '../lib/editor/matchState.svelte';
  import { T } from '../lib/editor/strings';

  type Props = {
    st: MatchState;
    onChange: () => void;
    say: (msg: string) => void;
    download: (blob: Blob, name: string) => void;
    dims: () => V3;
  };
  let { st, onChange, say, download, dims }: Props = $props();

  const r = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
  const res = $derived(st.residual);
  const euler = $derived(st.euler);
  const counts = $derived(([0, 1, 2] as Axis[]).map((a) => st.lines.filter((l) => l.axis === a).length));
  const pp = $derived(st.principal);
  const slug = $derived(st.asset.slug.split('/').pop());
  const axisLabels = ['X (กว้าง)', 'Y (ลึก)', 'Z (สูง)'];
  const displays: { id: DisplayMode; label: string }[] = [
    { id: 'solid', label: 'ทึบ' },
    { id: 'wire', label: 'โครงลวด' },
    { id: 'edges', label: 'เส้นขอบ' },
  ];
  const ppModes: { id: PrincipalMode; label: string }[] = [
    { id: 'center', label: 'กลางภาพ' },
    { id: 'vp3', label: 'จาก 3 จุดลับตา' },
    { id: 'free', label: 'ปรับเอง/จากคู่จุด' },
  ];

  const band = (deg: number): string => (deg < 0.5 ? 'good' : deg <= 2 ? 'warn' : 'bad');
  const fmtDeg = (deg: number): string => `${deg < 0.1 ? deg.toFixed(2) : deg.toFixed(1)}°`;
  const otherGroupName = $derived(T.groups[st.group === 'room' ? 'object' : 'room']);
  /** Per-axis "consolidate" (mode → auto, converge to the VP) / "parallel" (mode → parallel, exactly parallel) / all axes (keep modes). */
  function consolidate(axis?: Axis, mode?: 'auto' | 'parallel'): void {
    const r = st.consolidate(axis, mode);
    let msg = r.message;
    if (axis !== undefined && mode && !st.solveLines()) msg += ` · ${st.message}`;
    onChange();
    say(msg);
  }
  function modeHint(a: Axis): string {
    const h = st.parallelHints[a];
    if (!h) return '';
    return h.far ? T.vp.hintFar(Number.isFinite(h.distDiag) ? `${Math.round(h.distDiag)}×` : '∞ ×') : T.vp.hintCheap(fmtDeg(h.parDeg));
  }
  const selEdge = $derived.by(() => {
    const l = st.lines.find((x) => x.id === st.selectedLine);
    return l && st.edgeMap && st.edgeMode !== 'off' ? st.edgeAlignOf(l.a, l.b) : null;
  });
  function edgeRefine(which: 'selected' | 'all'): void {
    const r = st.edgeRefine(which);
    if (r.moved) st.solveLines();
    onChange();
    say(r.message);
  }
  function run(fn: () => boolean): void {
    fn();
    onChange();
    if (st.message) say(st.message);
  }
  function setPP(mode: PrincipalMode): void {
    st.principal = mode;
    if (mode === 'center') st.applyPrincipalCentre();
    onChange();
  }
  function addPreset(event: Event & { currentTarget: HTMLSelectElement }): void {
    const id = event.currentTarget.value;
    event.currentTarget.value = '';
    const kp = st.keyPoints().find((k) => k.id === id);
    if (!kp) return;
    st.addPair([...kp.p] as V3, kp.label);
    say(`แตะจุด “${kp.label}” บนภาพ`);
    onChange();
  }
  function addFromModel(): void {
    st.addPair(null);
    say('แตะจุดบนโมเดล (จะจับมุมที่ใกล้ที่สุด)');
  }
  function exportCam(): void {
    const json = JSON.stringify(st.camJson(dims()), null, 1);
    download(new Blob([json], { type: 'application/json' }), `${slug}-cam.json`);
    say(`ดาวน์โหลด ${slug}-cam.json แล้ว`);
  }
  function exportFull(): void {
    const json = JSON.stringify(st.fullJson(dims()), null, 2);
    download(new Blob([json], { type: 'application/json' }), `${slug}-camera-match.json`);
    say(`ดาวน์โหลด ${slug}-camera-match.json แล้ว`);
  }
  function numeric(fn: (v: number) => void) {
    return (e: Event & { currentTarget: HTMLInputElement }) => {
      fn(e.currentTarget.valueAsNumber);
      onChange();
    };
  }
</script>

<section class="cm" data-camera-panel>
  <h2>จับมุมกล้อง (Camera match)</h2>
  <p class="tip">
    1) ลากปลายเส้นสีให้ทับขอบที่ขนานกันในภาพ: <b style="color:{AXIS_COLORS[0]}">แดง = แกน X (ด้านกว้าง)</b>,
    <b style="color:{AXIS_COLORS[1]}">เขียว = แกน Y (ด้านลึก)</b>, <b style="color:{AXIS_COLORS[2]}">น้ำเงิน = แกน Z (แนวตั้ง)</b>
    2) กด “คำนวณจากเส้น” 3) เพิ่มคู่จุดเพื่อตั้งระยะ/ขนาด แล้วกด “คำนวณละเอียด”
  </p>

  <div class="seg3" role="radiogroup" aria-label="ภาพที่ใช้">
    <button type="button" class:on={st.image === 'crop'} aria-checked={st.image === 'crop'} role="radio" data-image="crop"
      onclick={() => { st.setImage('crop'); onChange(); say(T.groups.cropToast); }}>{T.groups.cropButton}</button>
    <button type="button" class:on={st.image === 'wide'} aria-checked={st.image === 'wide'} role="radio" data-image="wide"
      disabled={!st.asset.ref?.mockup} onclick={() => { st.setImage('wide'); onChange(); say(T.groups.wideToast); }}>{T.groups.wideButton}</button>
  </div>
  {#if st.asset.ref?.mockup}
    <p class="tip group" data-group={st.group}>
      {T.groups.editing} <b class="gname g-{st.group}">{T.groups.lineOf(st.groupName)}</b> {T.groups.count(st.lines.length)} · {T.groups.otherCount(otherGroupName, st.otherLines.length)}
      {st.group === 'room' ? T.groups.roomHowTo : T.groups.objectHowTo} — {T.groups.sharedCamera}
    </p>
  {/if}
  <div class="actions snaprow">
    {#if st.asset.ref?.mockup}
      <button type="button" class:on={st.ghost} aria-pressed={st.ghost} data-ghost
        onclick={() => { st.ghost = !st.ghost; onChange(); }}>{T.groups.ghost(otherGroupName, st.ghost)}</button>
    {/if}
    <button type="button" class:on={st.rays} aria-pressed={st.rays} data-rays
      onclick={() => { st.rays = !st.rays; onChange(); }}>{T.groups.rays(st.rays)}</button>
  </div>

  <h3>การแสดงผล</h3>
  <div class="seg3" role="radiogroup" aria-label="แบบการแสดงโมเดล">
    {#each displays as d (d.id)}
      <button type="button" role="radio" aria-checked={st.display === d.id} class:on={st.display === d.id} data-display={d.id}
        onclick={() => (st.display = d.id)}>{d.label}</button>
    {/each}
  </div>
  <label class="field slider">
    <span>ความทึบโมเดล {st.opacity}%</span>
    <input type="range" min="0" max="100" step="5" bind:value={st.opacity} data-opacity />
  </label>
  <label class="field slider">
    <span>เลื่อนเทียบ ก่อน|หลัง {st.split}%</span>
    <input type="range" min="0" max="100" step="1" bind:value={st.split} data-split />
  </label>

  <h3>เส้นนำสายตา</h3>
  <div class="adds">
    {#each [0, 1, 2] as const as a (a)}
      <button type="button" class="add" style="border-color:{AXIS_COLORS[a]}" data-add-line={a}
        onclick={() => { st.addLine(a); onChange(); }}>+ เส้น {AXIS_NAMES[a]} <small>({counts[a]})</small></button>
    {/each}
  </div>
  <div class="actions">
    <button type="button" class="danger" disabled={st.selectedLine === null} data-act="del-line"
      onclick={() => { st.removeLine(st.selectedLine); onChange(); }}>ลบเส้นที่เลือก</button>
    <button type="button" data-act="seed-lines" onclick={() => { st.seedLines(); onChange(); }}>วางเส้นตามกล้องปัจจุบัน</button>
    <button type="button" data-act="clear-lines" onclick={() => { st.clearLines(); onChange(); }}>ล้างเส้น</button>
  </div>
  <div class="actions snaprow">
    <button type="button" class:on={st.snap} aria-pressed={st.snap} data-line-snap
      onclick={() => { st.snap = !st.snap; onChange(); say(T.snap.toast(st.snap)); }}>{T.snap.button(st.snap)}</button>
    <button type="button" disabled={!st.lines.find((l) => l.id === st.selectedLine)?.links} data-act="unlink-line"
      onclick={() => { const n = st.unlinkLine(st.selectedLine); onChange(); if (n) say(T.snap.unlinked); }}>{T.snap.unlink}</button>
    <button type="button" class="small" aria-label={T.snap.undoLinesAria} disabled={st.lineUndoCount === 0} data-act="undo-lines"
      onclick={() => { st.undoLines(); onChange(); }}>{T.common.undo}</button>
    <button type="button" class="small" aria-label={T.snap.redoLinesAria} disabled={st.lineRedoCount === 0} data-act="redo-lines"
      onclick={() => { st.redoLines(); onChange(); }}>{T.common.redo}</button>
  </div>
  <div class="vpbox" data-vp-panel>
    <div class="vphead">{T.vp.heading} <small>{T.vp.headingNote}</small></div>
    {#each [0, 1, 2] as const as a (a)}
      {@const f = st.vpFits[a]}
      {@const par = st.vpModes[a] === 'parallel'}
      <div class="vprow vpm" data-vp-row={a} data-vp-mode={st.vpModes[a]}>
        <b class="ax" style="color:{AXIS_COLORS[a]}">{AXIS_NAMES[a]}</b>
        {#if f}
          {@const nOut = f.fit.outlier.filter(Boolean).length}
          <span class="rms {band(f.fit.rmsDeg)}" data-vp-rms={a} data-rms={f.fit.rmsDeg.toFixed(4)}>{par ? '∠' : 'RMS'} {fmtDeg(f.fit.rmsDeg)}</span>
          <span class="n">{T.common.lines(f.ids.length)}{par ? T.vp.parallelTag : ''}{nOut ? T.vp.outliers(nOut) : ''}</span>
        {:else}
          <span class="rms">—</span>
          <span class="n">{T.vp.needTwo}{par ? T.vp.parallelTag : ''}</span>
        {/if}
        <span class="pair">
          <button type="button" class="small mode" class:on={!par} aria-pressed={!par} data-consolidate={a} data-active={!par}
            title={T.vp.consolidateTitle} onclick={() => consolidate(a, 'auto')}>{T.vp.consolidateAxis(AXIS_NAMES[a])}</button>
          <button type="button" class="small mode" class:on={par} aria-pressed={par} data-parallel={a} data-active={par}
            title={T.vp.parallelTitle} onclick={() => consolidate(a, 'parallel')}>{T.vp.parallelAxis(AXIS_NAMES[a])}</button>
        </span>
      </div>
      {#if st.parallelHints[a]}
        <button type="button" class="hint" data-parallel-hint={a} onclick={() => consolidate(a, 'parallel')}
          >{T.vp.hint(AXIS_NAMES[a], modeHint(a))}</button>
      {/if}
    {/each}
    <div class="actions">
      <button type="button" data-act="consolidate" disabled={!st.vpFits.some(Boolean)} onclick={() => consolidate()}>{T.vp.consolidateAll}</button>
      <button type="button" class:on={st.lockVp} aria-pressed={st.lockVp} data-lock-vp
        onclick={() => { st.lockVp = !st.lockVp; onChange(); say(T.vp.lockToast(st.lockVp)); }}>{T.vp.lock(st.lockVp)}</button>
    </div>
    <p class="tip legend">{T.vp.legendColor} <span class="good">● &lt; 0.5°</span> <span class="warn">● ≤ 2°</span> <span class="bad">● &gt; 2°</span> · {T.vp.legendOutlier} · <b>{T.vp.legendConsolidate}</b> {T.vp.legendConsolidateText} · <b>{T.vp.legendLock}</b>{T.vp.legendLockText} · <b>{T.vp.legendParallel}</b>{T.vp.legendParallelText}</p>
  </div>
  <div class="vpbox" data-edge-panel>
    <div class="vphead">{T.edges.heading} <small>{T.edges.headingNote}</small>
      {#if !st.edgeMap}<span class="n" data-edge-loading>{T.edges.loading}</span>{/if}
    </div>
    <div class="seg3" role="radiogroup" aria-label={T.edges.showAria}>
      {#each (['drag', 'always', 'off'] as const).map((id) => [id, T.showModes[id]] as const) as [id, label] (id)}
        <button type="button" role="radio" aria-checked={st.edgeMode === id} class:on={st.edgeMode === id} data-edge-mode={id}
          onclick={() => { st.edgeMode = id; onChange(); }}>{label}</button>
      {/each}
    </div>
    {#if selEdge}
      <div class="vprow" data-edge-readout={selEdge.band} data-edge-off={selEdge.meanOff === null ? null : selEdge.meanOff.toFixed(3)}>
        <b class="ax">{T.edges.line}</b>
        <span class="rms {selEdge.band === 'none' ? '' : selEdge.band}">{selEdge.meanOff === null ? T.edges.none : T.edges.offBy(`${selEdge.meanOff.toFixed(1)} px`)}</span>
        <span class="n">{T.edges.score(Math.round(selEdge.score * 100), Math.round(selEdge.coverage * 100))}</span>
        <span></span>
      </div>
    {/if}
    <div class="actions">
      <button type="button" data-act="edge-refine" disabled={st.selectedLine === null || !st.edgeMap} onclick={() => edgeRefine('selected')}>{T.edges.refineSelected}</button>
      <button type="button" data-act="edge-refine-all" disabled={!st.lines.length || !st.edgeMap} onclick={() => edgeRefine('all')}>{T.edges.refineAll}</button>
      <button type="button" class:on={st.edgeSnap} aria-pressed={st.edgeSnap} data-edge-snap
        onclick={() => { st.edgeSnap = !st.edgeSnap; onChange(); say(T.edges.snapWhileDragToast(st.edgeSnap)); }}>{T.edges.snapWhileDrag(st.edgeSnap)}</button>
    </div>
    <p class="tip legend">{T.edges.legendLead} <span class="good">● &lt; 1 px</span> <span class="warn">● ≤ 2.5 px</span> <span class="bad">● &gt; 2.5 px</span> · <b>{T.edges.legendRefine}</b> {T.edges.legendRefineText}</p>
  </div>
  <div class="field" role="radiogroup" aria-label={T.diff.aria}>
    <span>{T.diff.label}</span>
    <div class="seg3">
      {#each (['drag', 'always', 'off'] as const).map((id) => [id, T.showModes[id]] as const) as [id, label] (id)}
        <button type="button" role="radio" aria-checked={st.diff === id} class:on={st.diff === id} data-diff-mode={id}
          onclick={() => { st.diff = id; onChange(); }}>{label}</button>
      {/each}
    </div>
  </div>
  <p class="tip">{T.snap.tipDrag}<b>{T.snap.tipLinked}</b>{T.snap.tipLinkedRest}<b>{T.snap.tipHold}</b>{T.snap.tipHoldRest}{st.linkedEnds ? T.snap.tipLinkedEnds(st.linkedEnds) : ''}</p>
  <div class="zoom">
    <button type="button" aria-label="ซูมเข้า" data-zoom="in" onclick={() => st.zoomAt(1.4)}>＋</button>
    <button type="button" aria-label="ซูมออก" data-zoom="out" onclick={() => st.zoomAt(1 / 1.4)}>－</button>
    <button type="button" data-zoom="fit" onclick={() => st.fit()}>พอดีจอ</button>
    <span class="hint">ลากพื้นหลังเพื่อเลื่อน · หนีบ/ล้อเมาส์เพื่อซูม</span>
  </div>

  <h3>คำนวณกล้อง</h3>
  <div class="field">
    <span>จุดกึ่งกลางภาพ (principal point)</span>
    <div class="seg3" role="radiogroup" aria-label="จุดกึ่งกลางภาพ">
      {#each ppModes as m (m.id)}
        <button type="button" role="radio" aria-checked={pp === m.id} class:on={pp === m.id} data-pp={m.id} onclick={() => setPP(m.id)}>{m.label}</button>
      {/each}
    </div>
  </div>
  <label class="check"><input type="checkbox" bind:checked={st.lockLens} data-lock-lens /> ล็อกเลนส์ (ไม่คำนวณทางยาวโฟกัส)</label>
  <div class="actions col">
    <button type="button" class="primary" data-act="solve-lines" onclick={() => run(() => st.solveLines())}>คำนวณจากเส้น (มุม + เลนส์)</button>
  </div>
  {#if st.asset.ref?.mockup}
    <label class="check"><input type="checkbox" checked={st.roomAligned} data-room-aligned
      onchange={(e) => { st.roomAligned = e.currentTarget.checked; run(() => st.solveLines()); }} /> {T.room.aligned}</label>
    {#if !st.roomAligned}
      <p class="tip" data-room-yaw={st.roomYaw.toFixed(3)}>{T.room.yawLead} <b>{st.roomYaw.toFixed(1)}°</b> {T.room.yawRest(st.roomYaw.toFixed(1))}</p>
    {/if}
    {@const ag = st.agreement}
    <div class="vpbox" data-agree-panel data-band={ag?.band ?? null}>
      <div class="vphead">{T.room.agreement}
        {#if ag?.band}<span class="rms {ag.band}" data-agree-overall={ag.band}>{ag.band === 'good' ? T.room.bandGood : ag.band === 'warn' ? T.room.bandWarn : T.room.bandBad}{ag.maxDeg !== null ? T.room.max(fmtDeg(ag.maxDeg)) : ''}</span>{/if}
      </div>
      {#if !ag}
        <p class="tip">{T.room.drawBoth}</p>
      {:else}
        {#each ag.axes as a (a.axis)}
          <button type="button" class="vprow agree" class:hl={st.highlight?.axis === a.axis} data-agree-axis={a.axis} data-band={a.band}
            data-deg={a.deg === null ? null : a.deg.toFixed(4)} disabled={!a.worst.length}
            onclick={() => { st.highlightAxis(a.axis); onChange(); if (st.highlight) say(T.room.highlighted(st.highlight.ids.length, AXIS_NAMES[a.axis])); }}>
            <b class="ax" style="color:{AXIS_COLORS[a.axis]}">{AXIS_NAMES[a.axis]}</b>
            {#if a.deg !== null}
              <span class="rms {a.band}">{fmtDeg(a.deg)}</span>
            {:else}
              <span class="n">—</span>
            {/if}
            <span class="n" data-agree-notpar={a.notParallel.length ? a.notParallel.join(',') : null}
              >{a.deg === null ? T.room.needTwoBoth : a.mode === 'parallel' ? T.room.diffParallel : T.room.diffVp}{a.notParallel.length
                ? T.room.notParallel(a.notParallel.map((g) => T.groups[g]).join('/'))
                : ''}</span>
            <span class="n">{T.room.showLines}</span>
          </button>
        {/each}
        <div class="vprow" data-agree-focal={ag.fDiffPct === null ? null : ag.fDiffPct.toFixed(2)}>
          <b class="ax">f</b>
          {#if ag.fDiffPct !== null}<span class="rms {ag.fBand}">{ag.fDiffPct.toFixed(1)}%</span>{:else}<span class="n">—</span>{/if}
          <span class="n">{T.room.lenses(ag.fObject ? T.common.mm(r(st.lensOfFull(ag.fObject), 1)) : '—', ag.fRoom ? T.common.mm(r(st.lensOfFull(ag.fRoom), 1)) : '—')}</span>
          <span></span>
        </div>
        <p class="tip legend">{T.room.legendAngle} <span class="good">● &lt; 1°</span> <span class="warn">● ≤ 3°</span> <span class="bad">● &gt; 3°</span> · {T.room.legendLens} <span class="good">&lt; 5%</span> <span class="warn">≤ 15%</span> · {T.room.legendTap}</p>
      {/if}
    </div>
  {/if}

  <h3>คู่จุด (โมเดล ↔ ภาพ) <small>{st.completePairs.length} คู่</small></h3>
  <p class="tip">เลือกมุมที่รู้ขนาดจริง (เช่น สูง 55 ซม.) แล้วแตะจุดเดียวกันบนภาพ · 2 คู่ = ตั้งระยะ/ตำแหน่ง · 4–6 คู่ขึ้นไป = คำนวณทั้งหมด</p>
  <div class="actions">
    <select onchange={addPreset} data-add-preset aria-label="เพิ่มคู่จุดจากมุมที่รู้ขนาด">
      <option value="">+ จุดมุมที่รู้ขนาด…</option>
      {#each st.keyPoints() as k (k.id)}
        <option value={k.id}>{k.label}</option>
      {/each}
    </select>
    <button type="button" data-act="pair-model" onclick={addFromModel}>+ แตะจุดบนโมเดล</button>
  </div>
  {#if st.pick}
    <p class="picking" data-picking={st.pick.want}>
      {st.pick.want === 'model' ? '👉 แตะจุดบนโมเดล' : '👉 แตะจุดเดียวกันบนภาพ'}
      <button type="button" class="small" onclick={() => { st.removePair(st.pick?.pairId ?? null); onChange(); }}>ยกเลิก</button>
    </p>
  {/if}
  {#if st.pairs.length}
    <ol class="pairs">
      {#each st.pairs as p (p.id)}
        {@const proj = p.world ? st.projectPoint(p.world) : null}
        {@const err = proj && p.image ? Math.hypot(proj[0] - p.image[0], proj[1] - p.image[1]) : null}
        <li class:sel={st.selectedPair === p.id}>
          <span>{p.label ?? (p.world ? `(${p.world.map((v) => r(v, 1)).join(', ')})` : 'รอจุดบนโมเดล')}</span>
          <small>{p.image ? (err !== null ? `${r(err, 1)} px` : '') : 'รอจุดบนภาพ'}</small>
          <button type="button" class="small" aria-label="ลบคู่จุด" onclick={() => { st.removePair(p.id); onChange(); }}>ลบ</button>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="actions">
    <button type="button" data-act="solve-position" disabled={st.completePairs.length < 2} onclick={() => run(() => st.solvePosition())}>ตั้งระยะจากคู่จุด (≥2)</button>
    <button type="button" class="primary" data-act="solve-all" disabled={st.completePairs.length < 4} onclick={() => run(() => st.solveAll())}>คำนวณละเอียด (≥4)</button>
  </div>

  <div class="result" data-residual>
    <b>ค่าคลาดเคลื่อน</b>
    เส้น {res.lines === null ? '–' : `${r(res.lines, 2)} px`} · คู่จุด {res.points === null ? '–' : `${r(res.points, 2)} px`}
  </div>

  <h3>ค่ากล้อง <small>(หน่วย Blender)</small></h3>
  <div class="vals">
    <span>เลนส์ (มม.)</span>
    <input type="number" step="0.5" value={r(st.lens, 2)} onchange={numeric((v) => st.setLens(v))} data-cam="lens" />
    <span class="note" data-cam-fov>FOV แนวนอน {r(st.hfov, 2)}°{st.wideLens ? ` · บนภาพเต็ม ${r(st.wideLens, 1)} มม. / ${r(st.wideHfov ?? 0, 1)}°` : ''}</span>
    {#each [0, 1, 2] as const as i (i)}
      <span>ตำแหน่ง {axisLabels[i]} ซม.</span>
      <input type="number" step="1" value={r(st.cam.C[i], 1)} onchange={numeric((v) => st.setPosition(i, v))} data-cam="pos-{i}" />
    {/each}
    {#each [0, 1, 2] as const as i (i)}
      <span>หมุน {AXIS_NAMES[i]} (องศา)</span>
      <input type="number" step="0.1" value={r(euler[i], 2)} onchange={numeric((v) => st.setEuler(i, v))} data-cam="rot-{i}" />
    {/each}
    <span>จุดกึ่งกลาง cx, cy (px)</span>
    <div class="two">
      <input type="number" step="1" value={r(st.cam.cx, 1)} onchange={numeric((v) => st.setPrincipal(0, v))} data-cam="cx" />
      <input type="number" step="1" value={r(st.cam.cy, 1)} onchange={numeric((v) => st.setPrincipal(1, v))} data-cam="cy" />
    </div>
  </div>
  <div class="actions">
    <button type="button" data-act="flip" onclick={() => { st.flip(); onChange(); }}>กลับด้าน 180°</button>
    <button type="button" class="danger" data-act="reset-cam" onclick={() => { st.resetCamera(); onChange(); if (st.message) say(st.message); }}>กลับเป็นกล้องเดิม</button>
  </div>

  <h3>บันทึก / ส่งออกกล้อง</h3>
  <p class="tip">บันทึกในเครื่องนี้อัตโนมัติ (มุม Mock-up จะใช้กล้องนี้) · cam.json ใช้กับ blender/add_cam.py, render.py</p>
  <div class="actions col">
    <button type="button" class="primary" data-act="export-cam" onclick={exportCam}>ดาวน์โหลด cam.json (Blender)</button>
    <button type="button" data-act="export-match" onclick={exportFull}>ดาวน์โหลดค่าทั้งหมด (Blender + Three.js)</button>
  </div>
</section>

<style>
  button {
    font: inherit; color: inherit; min-height: 44px; border-radius: 10px; border: 2px solid #3a5a74;
    background: #10202e; font-weight: 700; padding: 0 12px; cursor: pointer;
  }
  button:disabled { opacity: 0.4; cursor: default; }
  button.on { background: #8fdfff; border-color: #8fdfff; color: #082030; }
  button.primary { background: #ffcf4d; border-color: #ffcf4d; color: #2a1a00; }
  button.danger { border-color: #a5484a; color: #ffb3b3; }
  .small { min-height: 40px; font-size: 15px; padding: 0 10px; }
  .vpbox { border: 1px solid #2c4256; border-radius: 10px; padding: 8px 10px; margin: 10px 0; background: rgba(255, 255, 255, 0.03); }
  .vphead { font-size: 15px; color: #e6f0f8; font-weight: 700; margin-bottom: 4px; }
  .vphead small { font-weight: 400; color: #9fb4c6; }
  .vprow { display: grid; grid-template-columns: 22px auto 1fr auto; align-items: center; gap: 8px; min-height: 40px; font-size: 15px; color: #c5d7e6; }
  .vprow .ax { font-size: 17px; }
  .vprow.vpm { grid-template-columns: 22px auto 1fr auto; }
  .pair { display: inline-flex; gap: 6px; }
  .small.mode { min-width: 64px; min-height: 44px; border: 1px solid #3a5670; background: #1a2836; color: #c5d7e6; }
  .small.mode.on { background: #8fd8ff; color: #06202f; border-color: #8fd8ff; }
  .hint { width: 100%; min-height: 44px; text-align: left; font-size: 14px; font-weight: 400; border: 1px dashed #ffd36b; background: rgba(255, 211, 107, 0.08); color: #ffe7a6; border-radius: 8px; padding: 4px 8px; margin: 2px 0 6px; }
  button.vprow.agree { width: 100%; border: 1px solid transparent; background: transparent; padding: 0 4px; text-align: left; font-weight: 400; min-height: 44px; }
  button.vprow.agree.hl { border-color: #ff00d4; background: rgba(255, 0, 212, 0.12); }
  .n { color: #9fb4c6; }
  .gname.g-object { color: #ffcf4d; }
  .gname.g-room { color: #8fdfff; }
  .rms { font-weight: 700; font-variant-numeric: tabular-nums; }
  .good { color: #3ddc6a; }
  .warn { color: #ffb020; }
  .bad { color: #ff4d4d; }
  .legend span { white-space: nowrap; font-weight: 700; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .actions button { flex: 1 1 auto; }
  .actions.col { flex-direction: column; }
  .tip { font-size: 15px; color: #c5d7e6; margin: 8px 0; line-height: 1.45; }
  .field { display: grid; gap: 4px; margin: 0 0 8px; font-size: 15px; color: #c5d7e6; }
  .slider input { width: 100%; height: 36px; }
  h2 { font-size: 18px; margin: 14px 0 8px; }
  select {
    font: inherit; font-size: 16px; min-height: 46px; border-radius: 10px;
    border: 2px solid #3a5a74; background: #10202e; color: #eaf6ff; padding: 0 8px;
  }
  .cm { border-top: 2px solid #2c4256; margin-top: 10px; }
  h3 { font-size: 16px; margin: 14px 0 6px; color: #8fdfff; }
  h3 small { font-weight: 400; color: #8fb3cc; font-size: 13px; }
  .seg3 { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 8px; }
  .seg3 button { flex: 1 1 0; font-size: 15px; padding: 0 6px; }
  .adds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .add { border-width: 3px; font-size: 15px; padding: 0 4px; }
  .add small { font-weight: 400; }
  .zoom { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .zoom button { min-width: 48px; font-size: 18px; }
  .hint { font-size: 13px; color: #8fb3cc; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 15px; margin: 6px 0; min-height: 40px; }
  .check input { width: 24px; height: 24px; }
  .picking { background: #3a1d3a; border: 2px solid #ff4dd8; border-radius: 10px; padding: 6px 10px; display: flex; gap: 8px; align-items: center; justify-content: space-between; font-weight: 700; }
  .pairs { margin: 6px 0; padding-left: 22px; display: grid; gap: 4px; font-size: 14px; }
  .pairs li { display: grid; grid-template-columns: 1fr auto auto; gap: 6px; align-items: center; }
  .pairs li.sel span { color: #ffe14d; }
  .pairs small { color: #39f3ff; }
  .result { margin: 10px 0; padding: 8px 10px; border-radius: 10px; background: #0b1620; border: 1px solid #39f3ff; font-size: 15px; }
  .vals { display: grid; grid-template-columns: 1fr 120px; gap: 6px 8px; align-items: center; font-size: 15px; }
  .vals .note { grid-column: 1 / -1; font-size: 13px; color: #8fb3cc; margin-top: -2px; }
  .vals input, .two input {
    font: inherit; font-size: 17px; width: 100%; min-height: 44px; box-sizing: border-box;
    border-radius: 8px; border: 2px solid #3a5a74; background: #0b1620; color: #fff; padding: 0 6px; text-align: right;
  }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  .actions select { flex: 1 1 100%; min-height: 46px; }
</style>
