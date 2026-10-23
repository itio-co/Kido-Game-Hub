<script lang="ts">
  import { imageUrl } from '../../lib/flow/loadFlow';
  import { CROSS_GRID, CROSS_KEYS, CROSS_NUM, FAKE_TIME, jigPosition } from '../../lib/flow/puzzles';
  import type { FlowSession } from '../../lib/flow/session.svelte';

  let { session }: { session: FlowSession } = $props();

  const time = $derived(
    session.screen === 'slide' ? FAKE_TIME.slide : session.screen === 'jigsaw' ? FAKE_TIME.jigsaw : FAKE_TIME.crossword,
  );
</script>

<div class="mg">
  <div class="mgbar">
    {#if session.practice}<span class="prac">ฝึก · ด่าน {session.lvN}</span>{/if}
    <span class="t">⏱ {time.elapsed} · 🏆 {time.best} <small>({session.practice ? `ด่าน ${session.lvN}` : session.difficulty})</small></span>
    <span class="stars">{session.starText()}</span>
    <button type="button" class="mgbtn" onclick={() => session.puzzleHint()}>คำใบ้</button>
  </div>

  {#if session.screen === 'crossword'}
    <div class="cw">
      <div class="cwg">
        {#each [0, 1, 2] as row (row)}
          {#each [0, 1, 2, 3, 4] as col (col)}
            {@const id = `${row},${col}`}
            {#if CROSS_GRID[row][col] === '#'}
              <div class="cwc blk"></div>
            {:else}
              <button
                type="button"
                class="cwc"
                class:sel={session.cross.sel === id}
                class:hl={row === 2}
                onclick={() => session.pickCell(id)}
              >
                {#if CROSS_NUM[id]}<i>{CROSS_NUM[id]}</i>{/if}
                {session.cross.fill[id] ?? ''}
              </button>
            {/if}
          {/each}
        {/each}
      </div>
      <p class="clues">
        <b>แนวนอน</b> 1. สิ่งที่เห็นเป็นจุดส่องแสงบนท้องฟ้ายามค่ำคืน ✓<br />
        3. อีกคำหนึ่งที่หมายถึง “สวย” ←<br />
        <b>แนวตั้ง</b> 2. ทำให้สิ่งของอยู่บนโต๊ะ เช่น “___ หนังสือบนโต๊ะ”
      </p>
    </div>
    <div class="keys">
      {#each CROSS_KEYS as letter, index (index)}
        <button type="button" onclick={() => session.typeLetter(letter)}>{letter}</button>
      {/each}
    </div>
    <button type="button" class="mgbtn done" onclick={() => session.submitCross()}>
      {session.practice ? `ผ่านด่าน ${session.lvN}` : 'ส่งคำตอบ'}
    </button>
  {:else if session.screen === 'jigsaw'}
    <div class="jg">
      <div class="jgb">
        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as index (index)}
          {#if session.jig.placed.includes(index)}
            <div class="pc" style="background-image:url('{imageUrl('house-map.jpg')}');background-position:{jigPosition(index)}"></div>
          {:else}
            <button type="button" class="jgs" aria-label="ช่อง {index + 1}" onclick={() => session.placePiece(index)}></button>
          {/if}
        {/each}
      </div>
    </div>
    {#if session.jig.placed.length < 12}
      <div class="jgt">
        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter((index) => !session.jig.placed.includes(index)) as index (index)}
          <button
            type="button"
            class="pc"
            class:sel={session.jig.sel === index}
            style="background-image:url('{imageUrl('house-map.jpg')}');background-position:{jigPosition(index)}"
            aria-label="ชิ้น {index + 1}"
            onclick={() => session.pickPiece(index)}
          ></button>
        {/each}
      </div>
    {/if}
    <button type="button" class="mgbtn done" onclick={() => session.finishJigsaw()}>
      {session.practice ? `ผ่านด่าน ${session.lvN}` : session.jig.placed.length === 12 ? 'เสร็จ' : 'ต่อที่เหลือให้'}
    </button>
  {:else}
    <div class="sb">
      <div class="sbg">
        {#each [0, 1, 2, 3] as row (row)}
          {#each [0, 1, 2, 3] as col (col)}
            <div class="sbcell" style="left:{col * 25}%;top:{row * 25}%"></div>
          {/each}
        {/each}
        <div class="exit"></div>
        <div class="keyhole">🔒</div>
        {#each Object.entries(session.slide) as [name, block] (name)}
          <button
            type="button"
            class="blk2"
            style="left:calc({block.c * 25}% + 4px);top:calc({block.r * 25}% + 4px);width:calc({(block.v ? 25 : 25 * block.len)}% - 8px);height:calc({(block.v ? 25 * block.len : 25)}% - 8px);background:{block.col}"
            onclick={() => session.tapBlock(name as 'A' | 'B' | 'K')}
          >{block.label}</button>
        {/each}
      </div>
    </div>
    <p class="slide-note">แตะบล็อกเพื่อเลื่อน · A แนวตั้ง · B และ K แนวนอน · ไม่มีจำกัดเวลา</p>
  {/if}
</div>

<style>
  .mg { position: absolute; inset: 0; z-index: 1; padding: 78px 12px 96px; display: flex; flex-direction: column; gap: 10px; overflow: auto; background: linear-gradient(160deg, #1d3346, #2c4a5e); }
  .mgbar { display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap; background: rgba(6, 30, 48, 0.92); color: #eaf6ff; border: 1px solid #39e0ff; border-radius: 12px; padding: 8px 10px; font-size: var(--fs-sm); }
  .t { font-variant-numeric: tabular-nums; }
  .stars { letter-spacing: 1px; }
  .prac { background: #ffcf4a; color: #3a2a00; border-radius: 8px; padding: 2px 6px; font-weight: 800; }
  .mgbtn { background: #0d4a66; border: 1px solid #39e0ff; color: #fff; border-radius: 10px; padding: 8px 12px; font-weight: 700; }
  .done { align-self: flex-end; }
  .cw { background: #f4efe2; color: #13324a; border-radius: 10px; padding: 12px; }
  .cwg { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; max-width: 320px; margin: 0 auto; }
  .cwc { aspect-ratio: 1; border: 2px solid #333; background: #fff; display: flex; align-items: center; justify-content: center; font-size: calc(var(--fs) + 8px); font-weight: 800; position: relative; color: #13324a; }
  .cwc.blk { background: #2b2b2b; border-color: #2b2b2b; }
  .cwc.sel { background: #c9f3ff; outline: 3px solid #39e0ff; }
  .cwc.hl { background: #eafaff; }
  .cwc.sel.hl { background: #c9f3ff; }
  .cwc i { position: absolute; left: 3px; top: 1px; font-size: 12px; font-style: normal; font-weight: 700; }
  .clues { font-size: var(--fs-sm); line-height: 1.55; margin: 8px 0 0; }
  .clues b { color: #0d4a66; }
  .keys { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .keys button { width: 48px; height: 48px; font-size: calc(var(--fs) + 6px); border-radius: 10px; border: 2px solid #39a8d8; background: #fff; color: #13324a; font-weight: 800; }
  .jg { background: #6b4a2f; border-radius: 12px; padding: 10px; }
  .jgb { position: relative; margin: 0 auto; width: min(100%, 300px); aspect-ratio: 3 / 4; background: #efe6d2; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); gap: 2px; }
  .jgs { border: 1px dashed rgba(0, 0, 0, 0.25); background: transparent; }
  .pc { background-size: 300% 400%; border-radius: 4px; border: 0; padding: 0; }
  .jgt { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; background: #8a8f96; border-radius: 12px; padding: 10px; }
  .jgt .pc { width: 62px; height: 62px; }
  .jgt .pc.sel { outline: 3px solid #39e0ff; }
  .sb { background: #2d55a6; border-radius: 16px; padding: 16px; width: min(100%, 320px); margin: 0 auto; }
  .sbg { position: relative; background: #c9a676; border-radius: 8px; aspect-ratio: 1; box-shadow: inset 0 0 0 4px #a07c4c; }
  .sbcell { position: absolute; width: 25%; height: 25%; border: 1px dashed rgba(0, 0, 0, 0.15); }
  .blk2 { position: absolute; border: 0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: calc(var(--fs) + 4px); font-weight: 800; color: #fff; box-shadow: 0 3px 0 rgba(0, 0, 0, 0.3); }
  .exit { position: absolute; right: -16px; top: 28%; width: 16px; height: 19%; background: #1b2f5a; border-radius: 0 6px 6px 0; }
  .keyhole { position: absolute; right: -46px; top: 30%; font-size: 26px; }
  .slide-note { color: #eaf6ff; font-size: var(--fs-sm); text-align: center; margin: 0; }
</style>
