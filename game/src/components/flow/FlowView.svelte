<script lang="ts">
  import { imageUrl } from '../../lib/flow/loadFlow';
  import { LEVEL_COUNT, LEVEL_THEME } from '../../lib/flow/puzzles';
  import type { FlowSession } from '../../lib/flow/session.svelte';
  import type { FlowSpot } from '../../lib/flow/types';
  import ImageScene from './ImageScene.svelte';
  import Minigames from './Minigames.svelte';

  let { session }: { session: FlowSession } = $props();

  const pages = $derived(session.flow?.pages.filter((item) => item.eventId === 'case-01') ?? []);
  const cut = $derived(pages[session.page] ?? null);
  const groups = ['ทั้งหมด', 'คำ', 'ภาพ', 'ตรรกะ'];
  const livingMarks: Record<number, string> = { 12: '💐', 22: '⭕' };
  const firstWeekday = new Date(2026, 9, 1).getDay();
  const dayCount = 31;

  function labelFor(spot: FlowSpot): string {
    if (spot.slug !== 'flow/star-box/lock') return spot.title;
    if (session.solved) return 'เปิดแล้ว';
    if (session.deduced) return 'เล่นเลื่อนบล็อก';
    return 'ตัวล็อก (ต้องสรุปคดีก่อน)';
  }

  function sceneImage(): string {
    const scene = session.scene;
    if (!scene) return '';
    if (scene.images && session.slot in scene.images) return scene.images[session.slot];
    return scene.image;
  }

  const levelHeight = LEVEL_COUNT * 110 + 160;
  function levelX(index: number): number { return 50 + 30 * Math.sin(index * 0.9); }
  function levelY(index: number): number { return levelHeight - 110 - index * 110; }
</script>

<div class="flow">
  {#if session.scene}
    <ImageScene
      scene={session.scene}
      image={sceneImage()}
      spots={session.spots}
      selected={session.selected}
      hintId={session.hintSpot}
      evidence={session.evidence}
      {labelFor}
      onSpot={(spot) => session.tapSpot(spot)}
      onMiss={() => session.clearSpot()}
      onMap={session.scene.map ? () => session.go('house-map') : null}
    />
  {:else if session.screen === 'event-select'}
    <div class="evlist">
      <p class="evh">ออกจากห้องแล้ว จะไปไหนดีนะ?</p>
      {#each session.flow?.events ?? [] as event (event.id)}
        {@const open = !event.unlockAfter}
        <button type="button" class="evcard" class:off={!open} onclick={() => session.openEvent(event.eventId)}>
          <img src={imageUrl(event.cover)} alt="" />
          {#if open}
            <span class="badge">{event.eventId === 'case-01' && session.solved ? 'ไขแล้ว · เล่นซ้ำได้' : 'ใหม่'}</span>
          {:else}
            <span class="lock">ล็อก</span>
          {/if}
          <span class="evt">
            <b>{open ? event.title : '???'}</b>
            <small>{open ? event.subtitle : session.solved && event.unlockAfter === 'case-01' ? 'เร็ว ๆ นี้' : event.lockedHint}</small>
          </span>
        </button>
      {/each}
    </div>
  {:else if session.screen === 'cutscene' && cut}
    <button type="button" class="cs" onclick={() => session.nextPage()}>
      <img src={imageUrl(cut.image)} alt="" />
      {#each cut.lines as line (line.id)}
        <span class="bub" style="left:{line.x}%;top:{line.y}%;max-width:{line.w}%"><b>{line.who}</b>{line.text}</span>
      {/each}
      <span class="cap">{cut.caption}</span>
      <span class="tapnext">{session.page < pages.length - 1 ? 'แตะเพื่ออ่านต่อ' : 'แตะเพื่อเริ่มคดี'}</span>
      <span class="dots">{#each pages as _, index (index)}<i class:on={index === session.page}></i>{/each}</span>
    </button>
    {#if session.page > 0}
      <button type="button" class="prev" onclick={() => session.prevPage()}>ก่อนหน้า</button>
    {/if}
    <button type="button" class="skip" onclick={() => session.skipCutscene()}>ข้าม</button>
  {:else if session.screen === 'difficulty'}
    <div class="pick">
      <h1>เลือกระดับความยากของคดีนี้</h1>
      <p>เลือกได้ใหม่ทุกครั้งที่เริ่มคดี ไม่มีจำกัดเวลา</p>
      {#each session.flow?.difficulties ?? [] as name (name)}
        <button type="button" onclick={() => session.pickDifficulty(name)}>{name}</button>
      {/each}
    </div>
  {:else if session.screen === 'practice'}
    <div class="pgrid">
      <div class="chips">
        {#each groups as group (group)}
          <button type="button" class:on={session.category === group} onclick={() => session.setCategory(group)}>{group}</button>
        {/each}
      </div>
      <div class="cards">
        {#each (session.flow?.practice ?? []).filter((game) => session.category === 'ทั้งหมด' || game.group === session.category) as game (game.id)}
          {@const on = session.played.includes(game.slug)}
          {@const row = game.game === 'cross' || game.game === 'jig' || game.game === 'slide' ? session.levels[game.game] : []}
          {@const total = row.reduce((sum, value) => sum + (value || 0), 0)}
          <button type="button" class="gcard" class:off={!on} onclick={() => session.openPractice(game.slug)}>
            {#if on && !session.seen.includes(game.slug)}<i class="new">ใหม่</i>{/if}
            <span class="gic">{on ? game.icon : 'ล็อก'}</span>
            <b>{game.title}{game.future ? ' (ตัวอย่าง)' : ''}</b>
            <small>{game.group}</small>
            {#if on}
              <small>⭐ {total}/{3 * LEVEL_COUNT}</small>
            {:else}
              <small>ปลดล็อกจากคดี {game.caseNo}{game.future ? ' (ตัวอย่างอนาคต)' : ''}</small>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {:else if session.screen === 'level-map'}
    {@const theme = LEVEL_THEME[session.lvGame]}
    <div class="lvwrap" style="background:{theme.bg}">
      <div class="lvboard" style="height:{levelHeight}px">
        {#each Array.from({ length: LEVEL_COUNT }, (_, index) => index) as index (index)}
          {@const stars = session.levels[session.lvGame][index] ?? 0}
          {@const open = index === 0 || (session.levels[session.lvGame][index - 1] ?? 0) > 0}
          <button
            type="button"
            class="lvn"
            class:done={stars > 0}
            class:open={stars === 0 && open}
            class:lock={!open}
            style="left:{levelX(index)}%;top:{levelY(index)}px"
            onclick={() => session.openLevel(index)}
          >
            <b>{open ? index + 1 : 'ล็อก'}</b>
            {#if stars}<span>{'⭐'.repeat(stars)}{'☆'.repeat(3 - stars)}</span>{/if}
          </button>
        {/each}
        <p class="lvtitle" style="top:{levelHeight - 60}px">{theme.icon} เริ่มต้น</p>
      </div>
    </div>
  {:else if session.screen === 'notebook'}
    <div class="note-list">
      <h1>สมุดคดี: อัลบั้มครอบครัวที่หายไป</h1>
      <ul>
        {#each session.flow?.evidence ?? [] as item (item.id)}
          <li class:have={session.evidence.includes(item.code)}>
            {session.evidence.includes(item.code) ? `พบ ${item.code}` : `${item.code} ยังไม่พบ`}
            {#if session.evidence.includes(item.code)}<span>{item.text}</span>{/if}
          </li>
        {/each}
      </ul>
      {#if session.deduced}
        <p>สรุปคดีแล้ว ไปเปิดกล่องในห้องทำงาน</p>
      {:else if session.evidence.includes('E01') && session.evidence.includes('E02') && session.evidence.includes('E04')}
        <button type="button" class="mgbtn" onclick={() => session.go('case-board')}>สรุปคดี (3 คำถาม)</button>
      {:else}
        <p>เก็บหลักฐาน E01, E02, E04 ให้ครบเพื่อสรุปคดี</p>
      {/if}
    </div>
  {:else if session.screen === 'case-board'}
    <div class="deduce">
      {#each session.flow?.questions ?? [] as question, index (question.id)}
        <section class:ok={session.marks[index] === 1} class:bad={session.marks[index] === -1}>
          <h2>{question.prompt} {session.marks[index] === 1 ? 'ถูก' : ''}</h2>
          {#if question.mode === 'portrait'}
            <div class="row">
              {#each question.answers as answer (answer.id)}
                <button type="button" class="por" class:sel={session.picks[index] === answer.value} style="background-image:url('{answer.image ? imageUrl(answer.image) : ''}')" onclick={() => session.pickAnswer(index, answer.value ?? '')}>
                  <span>{answer.title}</span>
                </button>
              {/each}
            </div>
          {:else if question.mode === 'chips'}
            <div class="row">
              {#each question.answers as answer (answer.id)}
                <button type="button" class="ch" class:sel={session.picks[index] === answer.value} onclick={() => session.pickAnswer(index, answer.value ?? '')}>{answer.title}</button>
              {/each}
            </div>
          {:else}
            <div class="mini" style="background-image:url('{imageUrl('house-map.jpg')}')">
              <button type="button" class:sel={session.picks[index] === 'living'} style="left:10%;top:10%;width:80%;height:35%" aria-label="ห้องนั่งเล่น" onclick={() => session.pickAnswer(index, 'living')}></button>
              <button type="button" class:sel={session.picks[index] === 'study'} style="left:12%;top:46%;width:40%;height:34%" aria-label="ห้องทำงาน" onclick={() => session.pickAnswer(index, 'study')}></button>
              <button type="button" class:sel={session.picks[index] === 'kitchen'} style="left:53%;top:46%;width:35%;height:34%" aria-label="ครัว" onclick={() => session.pickAnswer(index, 'kitchen')}></button>
            </div>
            <p>{question.answers.find((answer) => answer.value === session.picks[index])?.title ?? 'แตะห้องบนแผนผัง'}</p>
          {/if}
          <div class="row proof">
            <span>หลักฐาน</span>
            {#each session.evidence.filter((code) => code !== 'E05') as code (code)}
              <button type="button" class="evc" class:sel={session.proof[index] === code} onclick={() => session.pickProof(index, code)}>{code}</button>
            {/each}
          </div>
        </section>
      {/each}
      <button type="button" class="mgbtn" onclick={() => session.gradeCase()}>ยืนยันข้อสรุป</button>
    </div>
  {:else if session.screen === 'crossword' || session.screen === 'jigsaw' || session.screen === 'slide'}
    <Minigames {session} />
  {/if}

  {#if session.talk}
    <div class="dlg">
      <p><b>{session.talk.who}:</b> “{session.talk.text}”</p>
      <div class="btns">
        {#each session.talk.choices as choice, index (index)}
          <button type="button" onclick={() => choice.run()}>{choice.title}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if session.overlay}
    <div class="time-sheet">
      <button type="button" class="calx" aria-label="ปิด" onclick={() => session.closeOverlay()}>✕</button>
      <div class="calc">
        {#if session.overlay === 'calendar'}
          <div class="calh"><span>ปฏิทินของยายมะลิ</span><small>ตุลาคม 2569</small></div>
          <div class="calg">
            {#each ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as name (name)}<div class="dw">{name}</div>{/each}
            {#each Array.from({ length: firstWeekday }) as _, index (index)}<div></div>{/each}
            {#each Array.from({ length: dayCount }, (_, index) => index + 1) as day (day)}
              <div class="d" class:m={livingMarks[day]} class:t={day === 22}>{day}{#if livingMarks[day]}<i>{livingMarks[day]}</i>{/if}</div>
            {/each}
          </div>
          <ul>
            <li><b>12 ต.ค.</b> วันครบรอบแต่งงานของตากับยาย</li>
            <li class="clue"><button type="button" onclick={() => session.showToast('ยายเขียนไว้เองว่าบ่ายนี้น้ารินมาเก็บบ้าน — ใครอาจย้ายอัลบั้มนะ?')}>⭕ <b>22 ต.ค.</b> วงแดงวันนี้: บ่ายนี้ รินมาช่วยเก็บกวาดบ้าน</button></li>
          </ul>
          <button type="button" class="link" onclick={() => session.openDayTravel()}>ย้อนวันด้วยปฏิทิน</button>
        {:else}
          <div class="calh"><span>{session.overlay === 'clock' ? 'นาฬิกา: ย้อนชั่วโมง' : 'ปฏิทิน: ย้อนวัน'}</span><small>พลังย้อนเวลา</small></div>
          <ul>
            {#each (session.flow?.slots ?? []).filter((item) => session.overlay === 'day' || item.part === 'hour') as item (item.id)}
              {@const open = !item.unlockBy || session.evidence.includes(item.unlockBy)}
              <li>
                <button type="button" class:locked={!open} onclick={() => session.chooseSlot(item.slot)}>
                  {#if open}
                    {item.slot === session.slot ? '▶ ' : ''}{item.title}
                  {:else}
                    ??? — {item.hint}
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .flow { position: absolute; inset: 0; color: #eaf6ff; font-size: var(--fs); }
  .evlist, .pgrid, .note-list, .deduce, .pick, .lvwrap { position: absolute; inset: 0; overflow: auto; padding: 78px 12px 96px; }
  .evlist { background: linear-gradient(170deg, #2a2440, #3a2f2a); display: flex; flex-direction: column; gap: 12px; }
  .evh, .pick p, .note-list p { text-align: center; margin: 0; }
  .evcard { position: relative; border: 0; border-radius: 16px; overflow: hidden; min-height: 150px; background: #1a1a22; text-align: left; padding: 0; color: #fff; }
  .evcard img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .evcard.off img { filter: grayscale(1) brightness(0.12); }
  .evt { position: absolute; left: 0; right: 0; bottom: 0; padding: 26px 12px 10px; background: linear-gradient(transparent, rgba(0, 0, 0, 0.82)); }
  .evt b { display: block; font-size: calc(var(--fs) + 2px); }
  .evt small { font-size: var(--fs-sm); }
  .badge, .lock { position: absolute; z-index: 1; top: 8px; left: 8px; background: #ffcf4a; color: #3a2a00; border-radius: 8px; padding: 2px 8px; font-weight: 800; font-size: var(--fs-sm); }
  .lock { top: 36%; left: 50%; transform: translate(-50%, -50%); background: transparent; color: #fff; font-size: calc(var(--fs) + 8px); }
  .cs { position: absolute; inset: 0; border: 0; padding: 0; background: #000; }
  .cs img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .bub { position: absolute; background: #fff; color: #2b2233; border-radius: 16px; padding: 8px 12px; font-size: var(--fs); line-height: 1.4; text-align: left; box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35); }
  .bub b { display: block; font-size: var(--fs-sm); color: #b0567a; }
  .cap { position: absolute; left: 4%; right: 4%; bottom: 96px; background: #fff6dc; color: #3a2a10; border-radius: 10px; padding: 10px 12px; font-size: var(--fs); line-height: 1.45; text-align: left; }
  .tapnext { position: absolute; right: 12px; bottom: 64px; color: #fff; font-size: var(--fs-sm); }
  .dots { position: absolute; left: 0; right: 0; bottom: 34px; display: flex; justify-content: center; gap: 8px; }
  .dots i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255, 255, 255, 0.4); }
  .dots i.on { background: #fff; }
  .skip, .prev { position: absolute; z-index: 6; bottom: 16px; background: rgba(0, 0, 0, 0.55); color: #fff; border: 0; border-radius: 16px; padding: 8px 14px; font-size: var(--fs-sm); font-weight: 700; }
  .skip { right: 12px; }
  .prev { left: 84px; }
  .pick { background: linear-gradient(160deg, #f6e7d7, #e8d3f0); color: #3a3550; }
  .pick h1 { margin: 12px 0 8px; text-align: center; font-size: calc(var(--fs) + 6px); }
  .pick button, .mgbtn, .chips button, .link { min-height: 48px; border-radius: 12px; border: 1px solid #39e0ff; background: #0d4a66; color: #fff; font-weight: 800; font-size: var(--fs); padding: 10px 14px; }
  .pick button { display: block; width: min(100%, 280px); margin: 10px auto; }
  .pgrid { background: #163044; }
  .chips { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
  .chips button.on { background: #39e0ff; color: #06212f; }
  .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .gcard { position: relative; background: #fffaf0; color: #13324a; border: 0; border-radius: 14px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
  .gcard.off { background: #2b3640; color: #8996a2; }
  .gic { font-size: calc(var(--fs) + 16px); }
  .new { position: absolute; top: 6px; right: 6px; background: #ff5d73; color: #fff; font-style: normal; font-size: var(--fs-sm); border-radius: 8px; padding: 1px 6px; }
  .lvwrap { color: #13324a; }
  .lvboard { position: relative; }
  .lvn { position: absolute; transform: translate(-50%, -50%); width: 64px; height: 64px; border-radius: 50%; border: 3px solid #fff; background: #9aa4ad; color: #13324a; font-size: var(--fs); }
  .lvn b { font-size: calc(var(--fs) + 2px); }
  .lvn span { position: absolute; top: 66px; left: 50%; transform: translateX(-50%); white-space: nowrap; font-size: var(--fs-sm); }
  .lvn.done { background: #ffcf4a; }
  .lvn.open { background: #39e0ff; }
  .lvtitle { position: absolute; left: 50%; transform: translateX(-50%); background: #fff; border-radius: 12px; padding: 4px 10px; font-weight: 800; margin: 0; }
  .note-list, .deduce { background: #102433; }
  .note-list h1, .deduce h2 { font-size: calc(var(--fs) + 2px); margin: 0 0 8px; }
  .note-list ul { list-style: none; padding: 0; margin: 0 0 12px; }
  .note-list li { margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); opacity: 0.55; }
  .note-list li.have { opacity: 1; }
  .note-list li span, .deduce p { display: block; font-size: var(--fs-sm); margin-top: 4px; }
  .deduce { display: flex; flex-direction: column; gap: 8px; }
  .deduce section { background: rgba(6, 24, 40, 0.93); border: 1px solid #39e0ff; border-radius: 12px; padding: 8px 10px; }
  .deduce section.ok { border-color: #5fd38a; }
  .deduce section.bad { border-color: #ff8a7a; }
  .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .ch, .evc { border: 2px solid #2d6d8a; background: #0d3346; color: #fff; border-radius: 10px; padding: 6px 8px; font-size: var(--fs-sm); }
  .ch.sel, .evc.sel, .por.sel { border-color: #7fe9ff; box-shadow: 0 0 8px #39e0ff; }
  .por { width: 72px; height: 72px; border-radius: 50%; background-size: cover; background-position: 50% 18%; border: 3px solid #2d6d8a; color: #fff; position: relative; }
  .por span { position: absolute; left: 50%; bottom: -8px; transform: translateX(-50%); background: rgba(0, 0, 0, 0.65); border-radius: 6px; padding: 0 4px; font-size: var(--fs-sm); white-space: nowrap; }
  .mini { position: relative; width: 120px; aspect-ratio: 3 / 4; background-color: #efe6d2; background-repeat: no-repeat; background-position: center; background-size: contain; border-radius: 6px; }
  .mini button { position: absolute; border: 0; background: transparent; }
  .mini button.sel { background: rgba(57, 224, 255, 0.35); outline: 2px solid #39e0ff; }
  .proof { margin-top: 6px; }
  .dlg { position: absolute; z-index: 7; left: 4%; right: 4%; bottom: 96px; background: rgba(6, 24, 40, 0.96); border: 2px solid #39e0ff; border-radius: 12px; padding: 12px 14px; font-size: var(--fs); line-height: 1.5; }
  .dlg b { color: #7fe9ff; }
  .btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .btns button { background: #0d4a66; border: 1px solid #39e0ff; color: #fff; border-radius: 8px; padding: 8px 12px; font-size: var(--fs-sm); font-weight: 700; }
  .time-sheet { position: absolute; inset: 0; z-index: 6; background: rgba(0, 0, 0, 0.55); padding: 72px 14px 96px; overflow: auto; }
  .calc { background: repeating-linear-gradient(0deg, #f3e3c3 0 6px, #efdcb8 6px 7px); color: #4a2e18; border: 8px solid #8a5a34; border-radius: 14px; padding: 12px; }
  .calh { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(90deg, #6b3f22, #8a5a34); color: #fff; border-radius: 10px; padding: 8px 10px; font-weight: 800; }
  .calh small { font-weight: 500; font-size: var(--fs-sm); }
  .calg { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin: 8px 0; text-align: center; font-size: var(--fs-sm); }
  .dw { font-weight: 800; }
  .d { aspect-ratio: 1; border-radius: 6px; background: rgba(255, 255, 255, 0.55); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; }
  .d.m { font-weight: 800; }
  .d.t { box-shadow: inset 0 0 0 2px currentColor; }
  .d i { font-style: normal; }
  .calc ul { list-style: none; padding: 0; margin: 8px 0; }
  .calc li { margin: 4px 0; }
  .calc li button, .link { width: 100%; text-align: left; background: rgba(255, 255, 255, 0.55); color: inherit; border: 0; border-radius: 8px; padding: 8px; font-size: var(--fs-sm); }
  .calc li button.locked { background: #2b3640; color: #c5d0d8; }
  .clue button { background: rgba(255, 220, 200, 0.85); }
  .calx { position: absolute; right: 22px; top: 78px; width: 36px; height: 36px; border-radius: 50%; border: 0; background: #fff; color: #333; font-size: 18px; }
  .link { margin-top: 8px; background: #fff; color: #4a2e18; border: 1px solid #888; }
</style>
