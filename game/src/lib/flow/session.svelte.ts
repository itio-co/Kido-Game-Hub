import {
  CROSS_SOLUTION,
  cloneCross,
  cloneJig,
  cloneSlide,
  crossCorrect,
  freshCross,
  freshJig,
  freshSlide,
  practiceSetup,
  starCount,
  starText,
  stepBlock,
  type CrossState,
  type JigState,
  type SlideState,
} from './puzzles';
import type {
  CaseFlow,
  FlowAction,
  FlowProgress,
  FlowSpot,
  PuzzleKey,
  ScreenId,
  ScreenRegistry,
} from './types';

export type TalkChoice = { title: string; run: () => void };
export type Talk = { who: string; text: string; choices: TalkChoice[] };

const PUZZLE_SCREEN: Record<PuzzleKey, ScreenId> = {
  cross: 'crossword',
  jig: 'jigsaw',
  slide: 'slide',
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function createFlow(onSave: (progress: FlowProgress) => void) {
  let flow = $state<CaseFlow | null>(null);
  let registry = $state<ScreenRegistry | null>(null);
  let ready = $state(false);
  let screen = $state<ScreenId>('player-room');
  let history = $state<ScreenId[]>([]);
  let fading = $state(false);
  let selected = $state<string | null>(null);
  let hintSpot = $state<string | null>(null);
  let toastText = $state<string | null>(null);
  let talk = $state<Talk | null>(null);
  let overlay = $state<null | 'calendar' | 'clock' | 'day'>(null);
  let slot = $state<'yesterday' | 'afternoon' | 'now'>('now');
  let evidence = $state<string[]>([]);
  let solved = $state(false);
  let deduced = $state(false);
  let reward = $state(false);
  let difficulty = $state('ปานกลาง');
  let played = $state<string[]>([]);
  let seen = $state<string[]>([]);
  let levels = $state<FlowProgress['levels']>({ cross: [], jig: [], slide: [] });
  let practice = $state(false);
  let lvGame = $state<PuzzleKey>('cross');
  let lvN = $state(1);
  let category = $state('ทั้งหมด');
  let page = $state(0);
  let hints = $state(0);
  let hintTier = $state(0);
  let hintGoal = $state(-1);
  let cross = $state<CrossState>(freshCross());
  let jig = $state<JigState>(freshJig());
  let slide = $state<SlideState>(freshSlide());
  let snap = $state<{ cross: CrossState; jig: JigState; slide: SlideState } | null>(null);
  let picks = $state<(string | null)[]>([null, null, null]);
  let proof = $state<(string | null)[]>([null, null, null]);
  let marks = $state<number[]>([0, 0, 0]);
  let toastTimer = 0;
  let hintTimer = 0;

  function use(nextFlow: CaseFlow, nextRegistry: ScreenRegistry, saved: FlowProgress | null): void {
    flow = nextFlow;
    registry = nextRegistry;
    evidence = [...(saved?.evidence ?? [])];
    solved = saved?.solved ?? false;
    deduced = saved?.deduced ?? false;
    reward = saved?.reward ?? false;
    difficulty = saved?.difficulty || 'ปานกลาง';
    played = [...(saved?.played ?? [])];
    seen = [...(saved?.seen ?? [])];
    levels = {
      cross: [...(saved?.levels.cross ?? [])],
      jig: [...(saved?.levels.jig ?? [])],
      slide: [...(saved?.levels.slide ?? [])],
    };
    ready = true;
  }

  const scene = $derived(flow?.scenes.find((item) => item.screen === screen) ?? null);
  const status = $derived(registry?.screens.find((item) => item.screen === screen)?.status ?? 'demo');
  const title = $derived(registry?.screens.find((item) => item.screen === screen)?.title ?? 'ห้องของฉัน');

  function persist(): void {
    onSave({
      evidence: [...evidence],
      solved,
      deduced,
      reward,
      difficulty,
      played: [...played],
      seen: [...seen],
      levels: { cross: [...levels.cross], jig: [...levels.jig], slide: [...levels.slide] },
    });
  }

  function showToast(text: string): void {
    if (!text) return;
    toastText = text;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastText = null;
    }, 2200);
  }

  function has(code: string): boolean {
    return evidence.includes(code);
  }

  function addEvidence(code: string): void {
    if (has(code)) return;
    evidence = [...evidence, code];
    const unlocked = flow?.slots.find((item) => item.unlockBy === code);
    showToast(`ได้หลักฐาน ${code}${unlocked ? ` · ปลดล็อกเวลา: ${unlocked.title}` : ''}`);
    persist();
  }

  function practiceOf(game: PuzzleKey) {
    return flow?.practice.find((item) => item.game === game && !item.future);
  }

  function openDialogue(slug: string): void {
    if (slug === 'flow/dialogue/grandma-open' && solved) {
      openDialogue('flow/dialogue/grandma-win');
      return;
    }
    const found = flow?.dialogues.find((item) => item.slug === slug);
    if (!found) return;
    talk = {
      who: found.who,
      text: found.text,
      choices: found.choices.map((choice) => ({
        title: choice.title,
        run: () => {
          talk = null;
          if (choice.next) openDialogue(choice.next);
          else if (choice.action) void perform(choice.action);
        },
      })),
    };
  }

  function openLines(who: string, lines: string[], index = 0): void {
    const last = index >= lines.length - 1;
    talk = {
      who,
      text: lines[index] ?? '',
      choices: [
        last
          ? { title: 'ปิด', run: () => (talk = null) }
          : { title: 'ต่อ', run: () => openLines(who, lines, index + 1) },
      ],
    };
  }

  function enter(next: ScreenId): void {
    const found = flow?.scenes.find((item) => item.screen === next);
    if (next === 'uncle') addEvidence('E03');
    if (!found) return;
    const slug = solved && found.enterWhenSolved ? found.enterWhenSolved : found.enter;
    if (slug) openDialogue(slug);
  }

  async function go(next: ScreenId, replace = false, runEnter = true): Promise<void> {
    if (fading) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fading = true;
    await wait(reduce ? 0 : 300);
    if (!replace && next !== screen) history = [...history, screen];
    if (next !== 'living-room') slot = 'now';
    screen = next;
    selected = null;
    overlay = null;
    talk = null;
    if (runEnter) enter(next);
    await wait(30);
    fading = false;
  }

  async function perform(action: FlowAction): Promise<void> {
    if (action.type === 'go') {
      if (action.screen === 'study' && screen === 'case-board') {
        history = ['living-room'];
        await go('study', true);
        return;
      }
      await go(action.screen);
      return;
    }
    if (action.type === 'toast') {
      showToast(action.text);
      return;
    }
    if (action.type === 'evidence') {
      addEvidence(action.evidence);
      openLines(action.who, [action.text]);
      return;
    }
    if (action.type === 'dialogue') {
      openDialogue(action.dialogue);
      return;
    }
    if (action.type === 'lines') {
      openLines(action.who, action.lines);
      return;
    }
    if (action.type === 'clock') {
      overlay = 'clock';
      return;
    }
    if (action.type === 'calendar') {
      overlay = 'calendar';
      return;
    }
    if (action.type === 'minigame') {
      hints = 0;
      const key: PuzzleKey = action.screen === 'crossword' ? 'cross' : action.screen === 'jigsaw' ? 'jig' : 'slide';
      const card = practiceOf(key);
      if (!practice && card && !played.includes(card.slug)) {
        played = [...played, card.slug];
        const row = levels[key].slice();
        row[0] = Math.max(row[0] ?? 0, 2);
        levels = { ...levels, [key]: row };
        persist();
      }
      await go(action.screen);
      return;
    }
    if (action.type === 'box-lock') {
      if (solved) {
        showToast('เปิดกล่องนี้แล้ว');
        return;
      }
      if (!deduced) {
        openLines('ยายมะลิ', ['กล่องนี้ล็อกอยู่นะ ลองสรุปคดีบนกระดานให้ครบก่อนสิจ๊ะ']);
        return;
      }
      hints = 0;
      await go('slide');
      return;
    }
    if (action.type === 'home') {
      reward = true;
      persist();
      history = [];
      talk = null;
      await go('player-room', true, false);
      showToast('กลับถึงบ้านแล้ว แตะช่องว่างเพื่อวางรูปตา');
    }
  }

  function unmetGoal() {
    return (
      flow?.goals.find((goal) => {
        if (goal.code === 'table') return !has('E01') || !has('E02');
        if (goal.code === 'tray') return !has('E04');
        if (goal.code === 'mek') return !has('E03');
        if (goal.code === 'deduce') return !deduced;
        if (goal.code === 'box') return !solved;
        return true;
      }) ?? flow?.goals[flow.goals.length - 1]
    );
  }

  function exploreHint(): void {
    const goal = unmetGoal();
    if (!goal || !flow) return;
    const index = flow.goals.indexOf(goal);
    if (hintGoal !== index) {
      hintGoal = index;
      hintTier = 0;
    }
    hintTier = Math.min(hintTier + 1, 2);
    if (hintTier === 1) {
      showToast(`คำใบ้: ลองไปดูที่ ${goal.room}`);
      return;
    }
    const here = scene?.spots.find((item) => item.title.includes(goal.object) && (item.when === 'always' || item.when === slot));
    if (here && screen === goal.at) {
      hintSpot = here.id;
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hintSpot = null;
      }, 2500);
      showToast(`คำใบ้: แตะ “${here.title}”`);
      return;
    }
    showToast(`คำใบ้: ไปที่ ${goal.room} แล้วแตะ “${goal.object}”`);
  }

  function endPractice(): void {
    if (snap) {
      cross = cloneCross(snap.cross);
      jig = cloneJig(snap.jig);
      slide = cloneSlide(snap.slide);
      snap = null;
    }
    practice = false;
  }

  function startPractice(game: PuzzleKey, level: number): void {
    if (!snap) snap = { cross: cloneCross(cross), jig: cloneJig(jig), slide: cloneSlide(slide) };
    practiceSetup(game, level, cross, jig, slide);
    cross = cloneCross(cross);
    jig = cloneJig(jig);
    slide = cloneSlide(slide);
  }

  async function finishPracticeLevel(): Promise<void> {
    const stars = starCount(hints);
    const row = levels[lvGame].slice();
    row[lvN - 1] = Math.max(row[lvN - 1] ?? 0, stars);
    levels = { ...levels, [lvGame]: row };
    persist();
    showToast(`ด่าน ${lvN} ได้ ${'⭐'.repeat(stars)} ปลดล็อกด่านถัดไป`);
    endPractice();
    history = history.slice(0, -1);
    await go('level-map', true, false);
  }

  async function onSlideWin(): Promise<void> {
    if (practice) {
      await finishPracticeLevel();
      return;
    }
    showToast('กุญแจถึงรูกุญแจ!');
    solved = true;
    addEvidence('E05');
    history = ['study', 'star-box'];
    await go('album', true);
  }

  function puzzleHint(): void {
    hints += 1;
    if (hints === 1) {
      if (screen === 'crossword') showToast('คำใบ้: ช่องที่ต้องเติมคือข้อ 3 แนวนอน');
      else if (screen === 'jigsaw') showToast('คำใบ้: เลือกชิ้นให้แล้ว ลองหาช่องของมัน');
      else showToast('คำใบ้: บล็อก A ขวางทางกุญแจอยู่ — ลองขยับ A');
      if (screen === 'crossword') cross = { ...cross, sel: '2,2' };
      if (screen === 'jigsaw') {
        jig = { ...jig, sel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((index) => !jig.placed.includes(index)) ?? null };
      }
      return;
    }
    if (screen === 'crossword') {
      const key = Object.keys(CROSS_SOLUTION).find((cell) => cross.fill[cell] !== CROSS_SOLUTION[cell]);
      if (key) cross = { ...cross, fill: { ...cross.fill, [key]: CROSS_SOLUTION[key] } };
      return;
    }
    if (screen === 'jigsaw') {
      const index = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((item) => !jig.placed.includes(item));
      if (index !== undefined) jig = { placed: [...jig.placed, index], sel: null };
      return;
    }
    const move = stepBlock(slide, slide.A.r < 2 ? 'A' : 'K');
    slide = cloneSlide(slide);
    if (move === 'win') void onSlideWin();
  }

  const spots = $derived.by(() => {
    if (!scene) return [];
    return scene.spots.filter((item) => item.when === 'always' || item.when === slot);
  });

  const subtitle = $derived.by(() => {
    if (screen === 'event-select') return 'แตะการ์ดเพื่อเริ่มเหตุการณ์';
    if (screen === 'cutscene') return `หน้า ${page + 1}/3`;
    if (screen === 'difficulty') return 'เลือกได้ใหม่ทุกครั้งที่เริ่มคดี ไม่มีจำกัดเวลา';
    if (screen === 'practice') return `ปลดล็อกแล้ว ${played.length}/${flow?.practice.length ?? 0}`;
    if (screen === 'level-map') return 'ผ่านด่านเพื่อปลดล็อกด่านถัดไป';
    if (screen === 'notebook') return `หลักฐาน ${evidence.length}/5`;
    if (screen === 'case-board') return 'ตอบ 3 ข้อ แล้วเลือกหลักฐานยืนยัน';
    if (screen === 'crossword' || screen === 'jigsaw' || screen === 'slide') {
      return `${flow?.games.find((item) => item.game === (screen === 'slide' ? 'slide' : screen === 'jigsaw' ? 'jigsaw' : 'crossword'))?.hud ?? ''} · คำใบ้ ${hints}`;
    }
    if (!scene || !flow) return '';
    const clock = scene.timed ? `⏳ ${flow.slots.find((item) => item.slot === slot)?.title ?? ''} · ` : '';
    return `${clock}${scene.hud} · หลักฐาน ${evidence.length}/5`;
  });

  return {
    get ready() { return ready; },
    get flow() { return flow; },
    use,
    get screen() { return screen; },
    get fading() { return fading; },
    get selected() { return selected; },
    get hintSpot() { return hintSpot; },
    get toastText() { return toastText; },
    get talk() { return talk; },
    get overlay() { return overlay; },
    get slot() { return slot; },
    get evidence() { return evidence; },
    get solved() { return solved; },
    get deduced() { return deduced; },
    get reward() { return reward; },
    get difficulty() { return difficulty; },
    get played() { return played; },
    get seen() { return seen; },
    get levels() { return levels; },
    get practice() { return practice; },
    get lvGame() { return lvGame; },
    get lvN() { return lvN; },
    get category() { return category; },
    get page() { return page; },
    get hints() { return hints; },
    get cross() { return cross; },
    get jig() { return jig; },
    get slide() { return slide; },
    get picks() { return picks; },
    get proof() { return proof; },
    get marks() { return marks; },
    get scene() { return scene; },
    get spots() { return spots; },
    get status() { return status; },
    get title() { return title; },
    get subtitle() { return subtitle; },
    get history() { return history; },
    starText: () => starText(hints),
    showToast,
    exploreHint,
    closeTalk() { talk = null; },
    closeOverlay() { overlay = null; },
    async go(next: ScreenId) { await go(next); },
    async back() {
      if (talk) { talk = null; return; }
      if (overlay) { overlay = null; return; }
      const prev = history[history.length - 1];
      if (!prev) { showToast('อยู่หน้านี้แล้ว'); return; }
      history = history.slice(0, -1);
      if (prev === 'player-room' || prev === 'level-map') endPractice();
      await go(prev, true, prev !== 'uncle');
    },
    tapSpot(spot: FlowSpot) {
      if (selected === spot.id) {
        selected = null;
        const action = spot.slug === 'flow/grandma/talk' && solved
          ? { type: 'dialogue' as const, dialogue: 'flow/dialogue/grandma-win' }
          : spot.action;
        void perform(action);
        return;
      }
      selected = spot.id;
    },
    clearSpot() { selected = null; },
    openEvent(eventId: string) {
      const event = flow?.events.find((item) => item.eventId === eventId);
      if (!event) return;
      if (event.unlockAfter) {
        showToast(solved && event.unlockAfter === 'case-01' ? 'เร็ว ๆ นี้' : event.lockedHint ?? 'ยังล็อกอยู่');
        return;
      }
      page = 0;
      void go('cutscene');
    },
    nextPage() {
      const pages = flow?.pages.filter((item) => item.eventId === 'case-01') ?? [];
      if (page < pages.length - 1) {
        page += 1;
        void go('cutscene', true, false);
        return;
      }
      void go('difficulty');
    },
    prevPage() {
      if (page <= 0) return;
      page -= 1;
      void go('cutscene', true, false);
    },
    skipCutscene() { void go('difficulty'); },
    pickDifficulty(name: string) {
      difficulty = name;
      persist();
      showToast(`ระดับ: ${name}`);
      history = ['player-room', 'event-select'];
      void go('house-map', true, false);
    },
    setCategory(next: string) { category = next; },
    openPractice(slug: string) {
      const card = flow?.practice.find((item) => item.slug === slug);
      if (!card) return;
      if (!played.includes(slug) || card.future || card.game === 'ex') {
        showToast(`ยังล็อก — ปลดล็อกจากคดี ${card.caseNo}`);
        return;
      }
      seen = seen.includes(slug) ? seen : [...seen, slug];
      persist();
      if (card.game === 'cross' || card.game === 'jig' || card.game === 'slide') lvGame = card.game;
      void go('level-map');
    },
    openLevel(index: number) {
      const row = levels[lvGame];
      const open = index === 0 || (row[index - 1] ?? 0) > 0;
      if (!open) { showToast('ผ่านด่านก่อนหน้าก่อนนะ'); return; }
      lvN = index + 1;
      practice = true;
      hints = 0;
      startPractice(lvGame, lvN);
      void go(PUZZLE_SCREEN[lvGame]);
    },
    pickCell(id: string) { cross = { ...cross, sel: id }; },
    typeLetter(letter: string) {
      const fill = { ...cross.fill, [cross.sel]: letter };
      let sel = cross.sel;
      const [row, col] = sel.split(',').map(Number);
      if (row === 2 && col < 4) sel = `2,${col + 1}`;
      cross = { fill, sel };
    },
    async submitCross() {
      if (practice) { await finishPracticeLevel(); return; }
      if (!crossCorrect(cross.fill)) { showToast('ยังไม่ครบหรือไม่ถูก — ลองคำใบ้ได้'); return; }
      history = history.slice(0, -1);
      await go('uncle', true, false);
      openDialogue('flow/dialogue/mek-thanks');
    },
    pickPiece(index: number) { jig = { ...jig, sel: index }; },
    placePiece(index: number) {
      if (jig.sel === index) jig = { placed: [...jig.placed, index], sel: null };
      else if (jig.sel !== null) showToast('ยังไม่ใช่ช่องนี้ ลองอีกที');
    },
    async finishJigsaw() {
      if (practice) { await finishPracticeLevel(); return; }
      jig = { placed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], sel: null };
      addEvidence('E04');
      history = history.slice(0, -1);
      await go('tray', true, false);
      openDialogue('flow/dialogue/map-clue');
    },
    async tapBlock(name: 'A' | 'B' | 'K') {
      const move = stepBlock(slide, name);
      slide = cloneSlide(slide);
      if (move === 'win') await onSlideWin();
      else if (!move) showToast('บล็อกนี้ขยับไม่ได้ตอนนี้');
    },
    puzzleHint,
    pickAnswer(index: number, value: string) {
      const next = picks.slice();
      next[index] = value;
      picks = next;
      const marked = marks.slice();
      marked[index] = 0;
      marks = marked;
    },
    pickProof(index: number, code: string) {
      const next = proof.slice();
      next[index] = code;
      proof = next;
      const marked = marks.slice();
      marked[index] = 0;
      marks = marked;
    },
    gradeCase() {
      let hint: string | null = null;
      if (!flow) return;
      const nextMarks = flow.questions.map((question, index) => {
        const rightAnswer = picks[index] === question.right;
        const rightProof = question.evidence.includes(proof[index] ?? '');
        if (!hint && !(rightAnswer && rightProof)) hint = rightAnswer ? 'คำตอบอาจถูกแล้ว แต่หลักฐานใบนี้ยังไม่ได้บอกเรื่องนั้นนะ' : question.hint;
        return rightAnswer && rightProof ? 1 : -1;
      });
      marks = nextMarks;
      if (hint) openLines('ยายมะลิ', [hint]);
      else {
        deduced = true;
        persist();
        openDialogue('flow/dialogue/deduce-ok');
      }
    },
    chooseSlot(next: 'yesterday' | 'afternoon' | 'now') {
      const found = flow?.slots.find((item) => item.slot === next);
      if (!found) return;
      if (found.unlockBy && !has(found.unlockBy)) {
        showToast(found.hint ?? 'ยังล็อกอยู่');
        return;
      }
      overlay = null;
      slot = next;
      if (screen !== 'living-room') void go('living-room', true, false);
      showToast(`⏳ ${found.title}`);
    },
    openDayTravel() { overlay = 'day'; },
  };
}

export type FlowSession = ReturnType<typeof createFlow>;
