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
import type { NavContext } from '../types';
import { t } from '../i18n';
import { tapFanEgg } from '../eggs';

export type TalkChoice = { title: string; run: () => void };
export type Talk = { who: string; text: string; choices: TalkChoice[] };

const EVENT_CASE_SCREENS = new Set<ScreenId>([
  'house-map', 'living-room', 'study', 'kitchen', 'kitchen-close', 'table', 'tray',
  'grandma', 'uncle', 'star-box', 'crossword', 'jigsaw', 'slide', 'notebook', 'case-board', 'album',
]);

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
  let poster = $state(false);
  let caseDone = $state(false);
  let talkSlug = $state<string | null>(null);
  let eggReveal = $state(false);
  let difficulty = $state('ปานกลาง');
  let played = $state<string[]>([]);
  let seen = $state<string[]>([]);
  let levels = $state<FlowProgress['levels']>({ cross: [], jig: [], slide: [] });
  let practice = $state(false);
  /** Sticky: set by practice-corner entry; cleared only when entering hub/event. */
  let practiceRun = $state(false);
  let context = $state<NavContext>('hub');
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
    poster = saved?.poster === true;
    caseDone = saved?.caseDone === true;
    ready = true;
    if (saved?.nav?.screen) {
      const navScreen = saved.nav.screen as ScreenId;
      const navSchema = typeof saved.nav.schema === 'number' ? saved.nav.schema : 0;
      slot = saved.nav.slot ?? 'now';
      page = saved.nav.page ?? 0;
      if (saved.nav.lvGame === 'cross' || saved.nav.lvGame === 'jig' || saved.nav.lvGame === 'slide') {
        lvGame = saved.nav.lvGame;
      }
      if (typeof saved.nav.lvN === 'number' && saved.nav.lvN > 0) lvN = saved.nav.lvN;

      // schema < 2 (0.5.3–0.5.7): never resume mid-puzzle / inferred-event chrome.
      if (navSchema < 2) {
        screen = 'player-room';
        history = [];
        context = 'hub';
        practice = false;
        practiceRun = false;
        talkSlug = null;
      } else {
        screen = navScreen;
        history = (saved.nav.history as ScreenId[]) ?? [];
        practice = saved.nav.practice === true;
        if (saved.nav.context === 'hub' || saved.nav.context === 'event' || saved.nav.context === 'practice') {
          context = saved.nav.context;
        } else if (practice || navScreen === 'practice' || navScreen === 'level-map') {
          context = 'practice';
        } else {
          context = 'hub';
          practice = false;
        }
        practiceRun = context === 'practice';
        // Stranded puzzle with no practice flag → hub (never fake event).
        if (
          (navScreen === 'crossword' || navScreen === 'jigsaw' || navScreen === 'slide')
          && context !== 'event'
          && !practice
        ) {
          screen = 'player-room';
          history = [];
          context = 'hub';
          practiceRun = false;
        }
        if (saved.nav.talkSlug && screen === navScreen) {
          queueMicrotask(() => openDialogue(saved.nav!.talkSlug!));
        }
      }
    }
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
      poster,
      caseDone,
      nav: {
        screen,
        history: [...history],
        slot,
        page,
        talkSlug,
        context,
        schema: 2,
        practice,
        lvGame,
        lvN,
      },
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
    talkSlug = slug;
    talk = {
      who: found.who,
      text: resolveText(found.text),
      choices: found.choices.map((choice) => ({
        title: resolveText(choice.title),
        run: () => {
          talk = null;
          talkSlug = null;
          persist();
          if (choice.next) openDialogue(choice.next);
          else if (choice.action) void perform(choice.action);
        },
      })),
    };
    persist();
  }

  function resolveText(value: string): string {
    if (!value) return value;
    if (value.includes('.') && !value.includes(' ')) return t(value);
    return value;
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
    if (next === 'grandma' && solved) {
      openDialogue(poster ? 'flow/dialogue/grandma-win' : 'flow/dialogue/grandma-need-poster');
      return;
    }
    const slug = solved && found.enterWhenSolved ? found.enterWhenSolved : found.enter;
    if (slug) openDialogue(slug);
  }

  async function go(next: ScreenId, replace = false, runEnter = true): Promise<void> {
    // Wait out an in-flight fade instead of dropping the navigation (practice list
    // used void go() then immediate openLevel, which previously no-op'd).
    if (fading) {
      let guard = 0;
      while (fading && guard < 40) {
        await wait(50);
        guard += 1;
      }
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    fading = true;
    await wait(reduce ? 0 : 300);
    if (!replace && next !== screen) history = [...history, screen];
    if (next !== 'living-room') slot = 'now';
    screen = next;
    selected = null;
    overlay = null;
    talk = null;
    if (next === 'player-room' || next === 'event-select') {
      context = 'hub';
      practice = false;
      practiceRun = false;
    } else if (
      practiceRun
      || next === 'practice'
      || next === 'level-map'
      || (context === 'practice' && (next === 'crossword' || next === 'jigsaw' || next === 'slide'))
    ) {
      // Practice-corner stack always wins over EVENT_CASE_SCREENS (crossword etc.).
      context = 'practice';
      practiceRun = true;
      if (next === 'crossword' || next === 'jigsaw' || next === 'slide') {
        practice = true;
      }
    } else if (next === 'cutscene' || next === 'difficulty' || next === 'ending-comic' || EVENT_CASE_SCREENS.has(next)) {
      context = 'event';
      practice = false;
      practiceRun = false;
    }
    if (runEnter) enter(next);
    persist();
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
        openLines('ย่ามะลิ', ['กล่องนี้ล็อกอยู่นะ ลองสรุปคดีบนกระดานให้ครบก่อนสิจ๊ะ']);
        return;
      }
      hints = 0;
      await go('slide');
      return;
    }
    if (action.type === 'home') {
      reward = true;
      caseDone = true;
      talk = null;
      talkSlug = null;
      context = 'hub';
      practice = false;
      practiceRun = false;
      persist();
      history = [];
      await go('player-room', true, false);
      showToast(t('toast.caseComplete'));
      return;
    }
    if (action.type === 'take-poster') {
      poster = true;
      persist();
      showToast(t('toast.posterTaken'));
      return;
    }
    if (action.type === 'ending-comic') {
      page = 0;
      talk = null;
      talkSlug = null;
      await go('ending-comic', false, false);
      return;
    }
    if (action.type === 'egg-fan') {
      const result = tapFanEgg();
      if (result.unlocked) {
        eggReveal = true;
        showToast(t('toast.eggFound'));
      } else if (result.state.fanSticker) {
        eggReveal = true;
      } else {
        showToast('…');
      }
      return;
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

  function setContext(next: NavContext): void {
    context = next;
    if (next !== 'practice') {
      // leaving practice mode clears the practice puzzle flag
      // (practice list itself uses context==='practice' with practice===false)
    }
    if (next === 'hub' || next === 'event') {
      // keep practice boolean managed by start/endPractice
    }
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
    if (screen === 'ending-comic') {
      const total = flow?.pages.filter((item) => item.eventId === 'case-01-ending').length ?? 5;
      return `หน้า ${page + 1}/${total}`;
    }
    if (screen === 'difficulty') return 'เลือกได้ใหม่ทุกครั้งที่เริ่มคดี ไม่มีจำกัดเวลา';
    if (screen === 'practice') return '';
    if (screen === 'level-map') return practice ? '' : 'ผ่านด่านเพื่อปลดล็อกด่านถัดไป';
    if (screen === 'notebook') return `หลักฐาน ${evidence.length}/5`;
    if (screen === 'case-board') return 'ตอบ 3 ข้อ แล้วเลือกหลักฐานยืนยัน';
    if (screen === 'crossword' || screen === 'jigsaw' || screen === 'slide') {
      if (practice) return '';
      return `${flow?.games.find((item) => item.game === (screen === 'slide' ? 'slide' : screen === 'jigsaw' ? 'jigsaw' : 'crossword'))?.hud ?? ''} · คำใบ้ ${hints}`;
    }
    if (!scene || !flow) return '';
    if (poster && solved && !caseDone) {
      return `${t('hud.takePoster')} · ${t('hud.evidence', { n: evidence.length })}`;
    }
    const clock = scene.timed ? `⏳ ${flow.slots.find((item) => item.slot === slot)?.title ?? ''} · ` : '';
    return `${clock}${scene.hud} · ${t('hud.evidence', { n: evidence.length })}`;
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
    get poster() { return poster; },
    get caseDone() { return caseDone; },
    get eggReveal() { return eggReveal; },
    get difficulty() { return difficulty; },
    get played() { return played; },
    get seen() { return seen; },
    get levels() { return levels; },
    get practice() { return practice; },
    get context() { return context; },
    /** สมุดคดี + event status: only when nav.context was positively set to event. */
    get showCaseUi() {
      return context === 'event' && !practice && !practiceRun && EVENT_CASE_SCREENS.has(screen);
    },
    enterPractice() {
      context = 'practice';
      practiceRun = true;
      practice = false;
      void go('practice');
    },
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
    closeTalk() { talk = null; talkSlug = null; persist(); },
    closeOverlay() { overlay = null; },
    async go(next: ScreenId) { await go(next); },
    async back() {
      if (talk) { talk = null; return; }
      if (overlay) { overlay = null; return; }
      const prev = history[history.length - 1];
      if (!prev) { showToast('อยู่หน้านี้แล้ว'); return; }
      history = history.slice(0, -1);
      if (prev === 'player-room' || prev === 'level-map') endPractice();
      if (prev === 'player-room' || prev === 'event-select') {
        context = 'hub';
        practice = false;
        practiceRun = false;
      } else if (prev === 'practice' || prev === 'level-map') {
        context = 'practice';
        practiceRun = true;
      }
      await go(prev, true, prev !== 'uncle');
    },
    tapSpot(spot: FlowSpot) {
      if (selected === spot.id) {
        selected = null;
        const action =
          spot.slug === 'flow/grandma/talk' && solved
            ? {
                type: 'dialogue' as const,
                dialogue: poster ? 'flow/dialogue/grandma-win' : 'flow/dialogue/grandma-need-poster',
              }
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
        showToast(caseDone && event.unlockAfter === 'case-01' ? 'เร็ว ๆ นี้' : event.lockedHint ?? 'ยังล็อกอยู่');
        return;
      }
      page = 0;
      context = 'event';
      practice = false;
      practiceRun = false;
      void go('cutscene');
    },
    nextPage() {
      if (screen === 'ending-comic') {
        const pages = flow?.pages.filter((item) => item.eventId === 'case-01-ending') ?? [];
        if (page < pages.length - 1) {
          page += 1;
          persist();
          return;
        }
        void perform({ type: 'home' });
        return;
      }
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
      if (screen === 'ending-comic') {
        persist();
        return;
      }
      void go('cutscene', true, false);
    },
    skipCutscene() {
      if (screen === 'ending-comic') {
        void perform({ type: 'home' });
        return;
      }
      if (!caseDone) return; // first play: intro not skippable
      void go('difficulty');
    },
    skipIntro() {
      if (!caseDone) return;
      void go('difficulty');
    },
    skipToMap() {
      if (!caseDone) return;
      context = 'event';
      practice = false;
      practiceRun = false;
      history = ['player-room', 'event-select'];
      void go('house-map', true, false);
    },
    closeEgg() { eggReveal = false; },
    jumpEndingComic() {
      poster = true;
      solved = true;
      page = 0;
      context = 'event';
      practice = false;
      practiceRun = false;
      void go('ending-comic', true, false);
    },
    pickDifficulty(name: string) {
      difficulty = name;
      context = 'event';
      practice = false;
      practiceRun = false;
      persist();
      showToast(`ระดับ: ${name}`);
      // Fresh event entry lands in living room; house map stays via แผนผังบ้าน.
      history = ['player-room', 'event-select'];
      void go('living-room', true, false);
    },
    setCategory(next: string) { category = next; },
    async openPractice(slug: string) {
      const card = flow?.practice.find((item) => item.slug === slug);
      if (!card) return;
      context = 'practice';
      practiceRun = true;
      if (card.game === 'stirfry') {
        seen = seen.includes(slug) ? seen : [...seen, slug];
        if (!played.includes(slug)) played = [...played, slug];
        persist();
        window.location.hash = card.route ?? '#/play/stirfry';
        return;
      }
      if (card.future || card.game === 'ex' || card.game === 'fan' || card.game === 'photobox' || !played.includes(slug)) {
        showToast(card.future || card.caseNo === 'soon'
          ? `เร็ว ๆ นี้ — ${card.title}`
          : `ยังล็อก — ปลดล็อกจากคดี ${card.caseNo}`);
        return;
      }
      seen = seen.includes(slug) ? seen : [...seen, slug];
      if (card.game === 'cross' || card.game === 'jig' || card.game === 'slide') lvGame = card.game;
      persist();
      await go('level-map');
    },
    async copyPracticeLink(slug: string) {
      const card = flow?.practice.find((item) => item.slug === slug);
      const path = card?.route ?? `#/practice/${encodeURIComponent(slug)}`;
      const url = `${window.location.origin}${window.location.pathname}${path}`;
      try {
        await navigator.clipboard.writeText(url);
        showToast('คัดลอกลิงก์แล้ว');
      } catch {
        showToast(url);
      }
    },
    async openLevel(index: number) {
      const row = levels[lvGame];
      const open = index === 0 || (row[index - 1] ?? 0) > 0;
      if (!open) { showToast('ผ่านด่านก่อนหน้าก่อนนะ'); return; }
      lvN = index + 1;
      context = 'practice';
      practiceRun = true;
      practice = true;
      hints = 0;
      startPractice(lvGame, lvN);
      await go(PUZZLE_SCREEN[lvGame]);
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
      if (hint) openLines('ย่ามะลิ', [hint]);
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
