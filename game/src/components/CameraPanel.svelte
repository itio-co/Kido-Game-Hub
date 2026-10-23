<script lang="ts">
  import type { Axis, V3 } from '../lib/editor/camMath';
  import type { DisplayMode } from '../lib/editor/modelEditor';
  import { AXIS_COLORS, AXIS_NAMES, type MatchState, type PrincipalMode } from '../lib/editor/matchState.svelte';

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
      onclick={() => { st.setImage('crop'); onChange(); }}>ภาพครอป</button>
    <button type="button" class:on={st.image === 'wide'} aria-checked={st.image === 'wide'} role="radio" data-image="wide"
      disabled={!st.asset.ref?.mockup} onclick={() => { st.setImage('wide'); onChange(); }}>Mock-up เต็ม</button>
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
      onclick={() => { st.snap = !st.snap; onChange(); say(st.snap ? 'แม่เหล็กเส้น: เปิด' : 'แม่เหล็กเส้น: ปิด'); }}>🧲 แม่เหล็กเส้น {st.snap ? 'เปิด' : 'ปิด'}</button>
    <button type="button" disabled={!st.lines.find((l) => l.id === st.selectedLine)?.links} data-act="unlink-line"
      onclick={() => { const n = st.unlinkLine(st.selectedLine); onChange(); if (n) say('แยกมุมของเส้นที่เลือกแล้ว'); }}>แยกมุมที่เชื่อม</button>
    <button type="button" class="small" aria-label="ย้อนการแก้เส้น" disabled={st.lineUndoCount === 0} data-act="undo-lines"
      onclick={() => { st.undoLines(); onChange(); }}>↶ ย้อน</button>
    <button type="button" class="small" aria-label="ทำซ้ำการแก้เส้น" disabled={st.lineRedoCount === 0} data-act="redo-lines"
      onclick={() => { st.redoLines(); onChange(); }}>↷ ทำซ้ำ</button>
  </div>
  <div class="field" role="radiogroup" aria-label="โหมดเทียบความต่าง">
    <span>โหมดเทียบความต่าง (โมเดล ⊖ ภาพ: ตรงกัน = มืด, เพี้ยน = เรืองแสง)</span>
    <div class="seg3">
      {#each [['drag', 'ขณะลาก'], ['always', 'เปิดตลอด'], ['off', 'ปิด']] as const as [id, label] (id)}
        <button type="button" role="radio" aria-checked={st.diff === id} class:on={st.diff === id} data-diff-mode={id}
          onclick={() => { st.diff = id; onChange(); }}>{label}</button>
      {/each}
    </div>
  </div>
  <p class="tip">ลากปลายเส้น (หรือลากทั้งเส้น) ไปใกล้เส้นแกนอื่น จะดูดติดปลายเส้น จุดตัด หรือบนเส้น · ปลายที่ดูดติดกันจะ<b>เชื่อมเป็นมุมเดียว</b> (กรอบเหลือง) ลากไปด้วยกัน · <b>กดค้าง</b>ที่มุมเพื่อแยก · กด Alt ค้างขณะลากเพื่อปิดแม่เหล็กชั่วคราว{st.linkedEnds ? ` · เชื่อมอยู่ ${st.linkedEnds} ปลาย` : ''}</p>
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
