import {
  CROSS_SOLUTION,
  cloneCross,
  cloneJig,
  cloneSlide,
  crossCorrect,
  firstFreePiece,
  freshCross,
  freshJig,
  freshSlide,
  isJigBoard,
  jigProfile,
  jigProfileForLabel,
  placeHint,
  practiceSetup,
  selectPiece,
  startJigsaw,
  starCount,
  starText,
  stepBlock,
  type CrossState,
  type JigBoard,
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
import type { NavContext } from '../../lib/types';
import { replayEventRun } from './replay';
import { t } from '../../lib/i18n';
import {
  CASE_KEY_ID,
  CASE_PHOTO_ID,
  canSolveCase,
  catalogCodes,
  countedEvidence,
  allowHouseMapTravel,
  houseMapGate,
  houseMapUnlocked,
  mapUnlockNeedsPersist,
  showHouseMapButton as houseMapButtonVisible,
} from './progress';
import { hasClockRewind, slotUnlocked, unlockCodes } from './rewindPower';
import { enqueueNotice, flushNotice } from './noticeQueue';
import {
  GRANDMA_WIN,
  caseStage,
  grandmaDialogueSlug,
  isGrandmaStageSlug,
  normalizeCaseState,
  openBoxBag,
  showPhotoBag,
  type CaseStage,
  type CaseViolation,
} from './caseState';
import { tapFanEgg } from '../../lib/eggs';
import { endingIdFor, primaryEventId } from './story';
import { playModeFromContext, type PlayMode } from '../minigame-core/framework';
import {
  isEventRunActive,
  isEventRunScreen,
  restoreEventScroll,
  resumeEventScreen,
  shouldConfirmLeave,
  snapshotEventScroll,
  type ScrollShot,
} from './leaveEvent';

export type TalkChoice = { title: string; run: () => void };
export type Talk = { who: string; text: string; choices: TalkChoice[]; notice?: boolean };
export type NoteInspect = { front: string; back: string; side: 'front' | 'back' };

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

/** Keep a loading dialog on screen long enough to register as feedback. */
const LOADING_MIN_MS = 200;

export function createFlow(onSave: (progress: FlowProgress) => void) {
  let flow = $state<CaseFlow | null>(null);
  let registry = $state<ScreenRegistry | null>(null);
  let ready = $state(false);
  let screen = $state<ScreenId>('player-room');
  let history = $state<ScreenId[]>([]);
  let fading = $state(false);
  /** Shared loading dialog for slow scene transitions. */
  let loading = $state(false);
  let selected = $state<string | null>(null);
  let hintSpot = $state<string | null>(null);
  let toastText = $state<string | null>(null);
  /** The toast belongs in the bottom message area (locked rooms). */
  let toastLow = $state(false);
  /** House map floor on screen. */
  let mapFloor = $state<1 | 2>(1);
  let talk = $state<Talk | null>(null);
  let note = $state<NoteInspect | null>(null);
  let pendingNotices = $state<string[]>([]);
  let overlay = $state<null | 'calendar' | 'clock' | 'day' | 'bag'>(null);
  let slot = $state<'yesterday' | 'afternoon' | 'now'>('now');
  let evidence = $state<string[]>([]);
  let solved = $state(false);
  let deduced = $state(false);
  let reward = $state(false);
  let poster = $state(false);
  let caseDone = $state(false);
  let cleared = $state(false);
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
  let jigCompleting = false;
  let slide = $state<SlideState>(freshSlide());
  let snap = $state<{ cross: CrossState; jig: JigState; slide: SlideState } | null>(null);
  let picks = $state<(string | null)[]>([null, null, null]);
  let proof = $state<(string | null)[]>([null, null, null]);
  let marks = $state<number[]>([0, 0, 0]);
  let toastTimer = 0;
  let hintTimer = 0;
  let mapPulseTimer = 0;
  let mapUnlockPulse = $state(false);
  let bag = $state<string[]>([]);
  let bagPulse = $state(false);
  let bagFreshId = $state<string | null>(null);
  let bagPulseTimer = 0;
  let repaired = $state<CaseViolation[]>([]);
  let leaveConfirm = $state(false);
  let leaveDest = $state<ScreenId>('event-select');
  let leaveReplace = false;
  let leaveRunEnter = true;
  let leaveFromBack = false;
  let allowLeave = false;
  let completionLeave = false;
  let savedScroll: ScrollShot[] = [];
  let resumeScreen: ScreenId | null = null;

  function mapIsUnlocked(): boolean {
    return houseMapUnlocked(flow, evidence);
  }

  function use(nextFlow: CaseFlow, nextRegistry: ScreenRegistry, saved: FlowProgress | null): void {
    flow = nextFlow;
    registry = nextRegistry;
    const catalog = catalogCodes(nextFlow);
    const gate = houseMapGate(nextFlow);
    const report = normalizeCaseState(
      {
        evidence: saved?.evidence ?? [],
        bag: saved?.bag,
        solved: saved?.solved,
        deduced: saved?.deduced,
        caseDone: saved?.caseDone,
        poster: saved?.poster,
        mapUnlocked: saved?.mapUnlocked,
        talkSlug: saved?.nav?.talkSlug,
      },
      catalog,
      gate,
    );
    evidence = report.evidence;
    solved = report.solved;
    deduced = report.deduced;
    repaired = report.violations;
    reward = saved?.reward ?? false;
    difficulty = saved?.difficulty || 'ปานกลาง';
    played = [...(saved?.played ?? [])];
    seen = [...(saved?.seen ?? [])];
    levels = {
      cross: [...(saved?.levels.cross ?? [])],
      jig: [...(saved?.levels.jig ?? [])],
      slide: [...(saved?.levels.slide ?? [])],
    };
    poster = report.poster;
    caseDone = report.caseDone;
    cleared = saved?.cleared === true || report.caseDone;
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
        if (report.talkSlug && screen === navScreen) {
          queueMicrotask(() => openDialogue(report.talkSlug!));
        }
      }
    }
    if (isEventRunActive({ context, practice, practiceRun, caseDone }) && !isEventRunScreen(screen)) {
      screen = resumeEventScreen({ context, practice, practiceRun, caseDone, screen, history });
    }
    bag = report.bag;
    // The button reads the jigsaw evidence, not the saved flag. Write the flag when a real
    // win predates it, and clear a true flag that has no such evidence (visits and other clues do not count).
    if (report.changed || (gate && mapUnlockNeedsPersist(saved?.mapUnlocked, mapIsUnlocked()))) persist();
    if (screen === 'jigsaw') jig = startJigsaw(difficulty);
    queueMicrotask(() => armEventGuard());
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
      cleared,
      mapUnlocked: houseMapGate(flow) ? mapIsUnlocked() : undefined,
      bag: [...bag],
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

  function eventLeaveState() {
    return { context, practice, practiceRun, caseDone, screen };
  }

  function armEventGuard(): void {
    if (typeof window === 'undefined') return;
    if (!isEventRunActive(eventLeaveState())) return;
    const state = window.history.state;
    if (state && typeof state === 'object' && (state as { nesEventGuard?: boolean }).nesEventGuard) return;
    window.history.pushState({ nesEventGuard: true }, '', window.location.href);
  }

  function clearEventGuard(): void {
    if (typeof window === 'undefined') return;
    const state = window.history.state;
    if (state && typeof state === 'object' && (state as { nesEventGuard?: boolean }).nesEventGuard) {
      window.history.replaceState(null, '', window.location.href);
    }
  }

  function requestLeave(dest: ScreenId, opts?: { replace?: boolean; runEnter?: boolean; fromBack?: boolean }): boolean {
    if (allowLeave || completionLeave) return false;
    if (!shouldConfirmLeave(eventLeaveState(), dest, { isCompletion: completionLeave })) return false;
    resumeScreen = screen;
    savedScroll = typeof document !== 'undefined' ? snapshotEventScroll(document) : [];
    leaveDest = dest;
    leaveReplace = opts?.replace ?? false;
    leaveRunEnter = opts?.runEnter ?? true;
    leaveFromBack = opts?.fromBack ?? false;
    leaveConfirm = true;
    return true;
  }

  function cancelLeave(): void {
    leaveConfirm = false;
    const stay = resumeScreen ?? screen;
    if (screen !== stay) {
      allowLeave = true;
      void go(stay, true, false).finally(() => { allowLeave = false; });
    }
    if (typeof document !== 'undefined') {
      const shots = savedScroll;
      requestAnimationFrame(() => restoreEventScroll(document, shots));
    }
    armEventGuard();
  }

  async function confirmLeave(): Promise<void> {
    const dest = leaveDest;
    const fromBack = leaveFromBack;
    const replace = leaveReplace;
    const runEnter = leaveRunEnter;
    leaveConfirm = false;
    resetEventRun();
    clearEventGuard();
    allowLeave = true;
    try {
      if (fromBack) {
        const prev = history[history.length - 1];
        if (prev === dest) history = history.slice(0, -1);
        await go(dest, true, dest !== 'uncle' && runEnter);
      } else {
        await go(dest, replace, runEnter);
      }
    } finally {
      allowLeave = false;
    }
  }

  function attemptSwipeLeave(): void {
    if (leaveConfirm) return;
    if (screen === 'cutscene' || screen === 'ending-comic') return;
    const prev = history[history.length - 1];
    if (!prev) return;
    requestLeave(prev, { fromBack: true });
  }

  function bindLeaveGuard(): () => void {
    if (typeof window === 'undefined') return () => {};
    armEventGuard();
    const onPop = () => {
      if (allowLeave || completionLeave) return;
      if (!isEventRunActive(eventLeaveState())) return;
      window.history.pushState({ nesEventGuard: true }, '', window.location.href);
      requestLeave('event-select', { replace: true, runEnter: false });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }

  function pulseBag(id?: string): void {
    bagPulse = true;
    bagFreshId = id ?? null;
    window.clearTimeout(bagPulseTimer);
    bagPulseTimer = window.setTimeout(() => { bagPulse = false; bagFreshId = null; }, 2600);
  }

  function setMapFloor(floor: 1 | 2): void {
    mapFloor = floor;
    selected = null;
  }

  function showToast(text: string, low = false): void {
    if (!text) return;
    toastText = text;
    toastLow = low;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastText = null;
    }, 2200);
  }

  function has(code: string): boolean {
    return evidence.includes(code);
  }

  function evidenceMessage(code: string, hadClock: boolean): string {
    const ready = !hadClock && hasClockRewind(flow?.slots, evidence);
    const base = t('evidence.got', { code });
    return ready ? `${base} · ${t('time.clockReady')}` : base;
  }

  function presentBottom(text: string): void {
    talk = {
      who: '',
      text,
      notice: true,
      choices: [{ title: t('note.close'), run: dismissTalk }],
    };
  }

  function announceBottom(text: string): void {
    const busy = !!talk || !!note;
    const next = enqueueNotice(busy, pendingNotices, text);
    pendingNotices = next.pending;
    if (next.show) presentBottom(next.show);
  }

  function dismissTalk(): void {
    talk = null;
    talkSlug = null;
    flushBottom();
  }

  function flushBottom(): void {
    const next = flushNotice(!!talk || !!note, pendingNotices);
    pendingNotices = next.pending;
    if (next.show) presentBottom(next.show);
  }

  function takeEvidence(code: string): string | null {
    if (has(code)) return null;
    const hadClock = hasClockRewind(flow?.slots, evidence);
    evidence = [...evidence, code];
    persist();
    return evidenceMessage(code, hadClock);
  }

  function addEvidence(code: string): void {
    const message = takeEvidence(code);
    if (message) announceBottom(message);
  }

  function showPowerHint(text: string): void {
    announceBottom(text);
  }

  function practiceOf(game: PuzzleKey) {
    return flow?.practice.find((item) => item.game === game && !item.future);
  }

  function progressStage(): CaseStage {
    return caseStage({ solved, deduced, poster, caseDone });
  }

  function resolveGrandmaEntry(slug: string): string {
    if (!isGrandmaStageSlug(slug)) return slug;
    return grandmaDialogueSlug(progressStage());
  }

  function openDialogue(slug: string): void {
    slug = resolveGrandmaEntry(slug);
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
          else flushBottom();
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
          ? { title: t('note.close'), run: dismissTalk }
          : { title: 'ต่อ', run: () => openLines(who, lines, index + 1) },
      ],
    };
  }

  function enter(next: ScreenId): void {
    const found = flow?.scenes.find((item) => item.screen === next);
    const message = next === 'uncle' ? takeEvidence('E03') : null;
    if (!found) return;
    const slug = found.enter;
    if (slug) openDialogue(slug);
    if (message) announceBottom(message);
  }

  async function withLoading(task: () => Promise<void>): Promise<void> {
    if (loading) return;
    loading = true;
    const started = Date.now();
    try {
      await task();
    } finally {
      const left = LOADING_MIN_MS - (Date.now() - started);
      if (left > 0) await wait(left);
      loading = false;
    }
  }

  async function go(next: ScreenId, replace = false, runEnter = true, opts?: { fade?: boolean }): Promise<void> {
    // Wait out an in-flight fade instead of dropping the navigation (practice list
    // used void go() then immediate openLevel, which previously no-op'd).
    if (fading) {
      let guard = 0;
      while (fading && guard < 40) {
        await wait(50);
        guard += 1;
      }
    }
    if (requestLeave(next, { replace, runEnter })) return;
    if (next === 'house-map' && !allowHouseMapTravel(mapIsUnlocked())) {
      showToast(t('toast.mapLocked'));
      return;
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useFade = opts?.fade !== false && !loading && !reduce;
    if (useFade) {
      fading = true;
      await wait(300);
    } else {
      fading = false;
    }
    if (!replace && next !== screen) history = [...history, screen];
    if (next !== 'living-room') slot = 'now';
    screen = next;
    if (next === 'study') mapFloor = 2;
    else if (next === 'living-room' || next === 'kitchen' || next === 'kitchen-close') mapFloor = 1;
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
    armEventGuard();
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
    if (action.type === 'locked') {
      showToast(action.text, true);
      return;
    }
    if (action.type === 'floor') {
      setMapFloor(action.floor);
      return;
    }
    if (action.type === 'evidence') {
      const message = takeEvidence(action.evidence);
      openLines(action.who, [action.text]);
      if (message) announceBottom(message);
      return;
    }
    if (action.type === 'inspect-note') {
      const message = action.evidence ? takeEvidence(action.evidence) : null;
      note = { front: action.front, back: action.back, side: 'front' };
      if (message) announceBottom(message);
      return;
    }
    if (action.type === 'dialogue') {
      openDialogue(action.dialogue);
      return;
    }
    if (action.type === 'lines') {
      const message = action.evidence ? takeEvidence(action.evidence) : null;
      openLines(action.who, action.lines);
      if (message) announceBottom(message);
      return;
    }
    if (action.type === 'clock') {
      if (!hasClockRewind(flow?.slots, evidence)) {
        showPowerHint(t('time.clockNeedClue'));
        return;
      }
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
      if (action.screen === 'jigsaw') ensureJigBoard();
      await go(action.screen);
      return;
    }
    if (action.type === 'box-lock') {
      if (solved) {
        showToast('เปิดกล่องนี้แล้ว');
        return;
      }
      if (!bag.includes(CASE_KEY_ID)) {
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
      cleared = true;
      talk = null;
      talkSlug = null;
      context = 'hub';
      practice = false;
      practiceRun = false;
      persist();
      history = [];
      completionLeave = true;
      allowLeave = true;
      try {
        await go('player-room', true, false);
      } finally {
        completionLeave = false;
        allowLeave = false;
      }
      showToast(t('toast.caseComplete'));
      return;
    }
    if (action.type === 'take-poster') {
      if (poster || bag.includes(CASE_PHOTO_ID)) {
        showToast(t(poster ? 'toast.photoShown' : 'toast.photoHeld'));
        return;
      }
      bag = openBoxBag(bag);
      pulseBag(CASE_PHOTO_ID);
      persist();
      showToast(t('toast.photoAwarded'));
      return;
    }
    if (action.type === 'show-photo') {
      const given = showPhotoBag(bag);
      if (!given.shown) {
        showToast(t('toast.needPhoto'));
        return;
      }
      bag = given.bag;
      poster = true;
      persist();
      showToast(t('toast.photoShown'));
      openDialogue(GRANDMA_WIN);
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

  /** Start a board for the case difficulty, or keep an in-progress one of the same profile. */
  function ensureJigBoard(): void {
    if (isJigBoard(jig)) {
      const total = jig.cols * jig.rows;
      const inProgress = jig.placed.length > 0 && jig.placed.length < total;
      if (inProgress) return;
    }
    jig = startJigsaw(difficulty);
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
    solved = true;
    bag = openBoxBag(bag);
    pulseBag(CASE_PHOTO_ID);
    showToast(t('toast.photoAwarded'));
    history = ['study', 'star-box'];
    await go('album', true);
  }

  function puzzleHint(): void {
    hints += 1;
    if (hints === 1) {
      if (screen === 'crossword') showToast('คำใบ้: ช่องที่ต้องเติมคือข้อ 3 แนวนอน');
      else if (screen === 'jigsaw') showToast('คำใบ้: ลากชิ้นไปวางที่ช่องของมัน');
      else showToast('คำใบ้: บล็อก A ขวางทางกุญแจอยู่ — ลองขยับ A');
      if (screen === 'crossword') cross = { ...cross, sel: '2,2' };
      if (screen === 'jigsaw') {
        if (isJigBoard(jig)) {
          const free = firstFreePiece(jig);
          jig = free ? selectPiece(jig, free.id) : jig;
        } else {
          jig = { ...jig, sel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((index) => !jig.placed.includes(index)) ?? null };
        }
      }
      return;
    }
    if (screen === 'crossword') {
      const key = Object.keys(CROSS_SOLUTION).find((cell) => cross.fill[cell] !== CROSS_SOLUTION[cell]);
      if (key) cross = { ...cross, fill: { ...cross.fill, [key]: CROSS_SOLUTION[key] } };
      return;
    }
    if (screen === 'jigsaw') {
      if (isJigBoard(jig)) jig = placeHint(jig);
      else {
        const index = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((item) => !jig.placed.includes(item));
        if (index !== undefined) jig = { placed: [...jig.placed, index], sel: null };
      }
      return;
    }
    const move = stepBlock(slide, slide.A.r < 2 ? 'A' : 'K');
    slide = cloneSlide(slide);
    if (move === 'win') void onSlideWin();
  }

  const spots = $derived.by(() => {
    if (!scene) return [];
    const hasFloors = !!scene.floors;
    return scene.spots.filter((item) => {
      if (item.when !== 'always' && item.when !== slot) return false;
      if (item.slug === 'flow/star-box/lock' && solved) return false;
      if (hasFloors && item.floor && item.floor !== mapFloor) return false;
      return true;
    });
  });

  const subtitle = $derived.by(() => {
    if (screen === 'event-select') return 'แตะการ์ดเพื่อเริ่มเหตุการณ์';
    // comic pages: the dots in the panel's bottom bar are the page indicator (no extra pill over the caption)
    if (screen === 'cutscene' || screen === 'ending-comic') return '';
    if (screen === 'difficulty') return 'เลือกได้ใหม่ทุกครั้งที่เริ่มคดี ไม่มีจำกัดเวลา';
    if (screen === 'practice') return '';
    if (screen === 'level-map') return practice ? '' : 'ผ่านด่านเพื่อปลดล็อกด่านถัดไป';
    if (screen === 'notebook') return t('hud.evidence', { n: countedEvidence(catalogCodes(flow), evidence).length, total: catalogCodes(flow).length || 4 });
    if (screen === 'case-board') return 'ตอบ 3 ข้อ แล้วเลือกหลักฐานยืนยัน';
    if (screen === 'crossword' || screen === 'jigsaw' || screen === 'slide') {
      if (practice) return '';
      if (screen === 'jigsaw') {
        const profile = isJigBoard(jig)
          ? jigProfile(jig.profileId, jig.version)
          : jigProfileForLabel(difficulty);
        const n = isJigBoard(jig) ? jig.cols * jig.rows : profile.cols * profile.rows;
        return t('jigsaw.hud', {
          n,
          rotation: t(`jigsaw.rotation.${profile.rotation}`),
          hints,
        });
      }
      return `${flow?.games.find((item) => item.game === (screen === 'slide' ? 'slide' : 'crossword'))?.hud ?? ''} · คำใบ้ ${hints}`;
    }
    if (!scene || !flow) return '';
    if (screen === 'star-box' && solved) {
      const found = countedEvidence(catalogCodes(flow), evidence).length;
      return `${t('box.opened')} · ${t('hud.evidence', { n: found, total: catalogCodes(flow).length || 4 })}`;
    }
    if (solved && !poster && !caseDone && bag.includes(CASE_PHOTO_ID)) {
      return `${t('hud.takePoster')} · ${t('hud.evidence', { n: countedEvidence(catalogCodes(flow), evidence).length, total: catalogCodes(flow).length || 4 })}`;
    }
    const clock = scene.timed ? `⏳ ${flow.slots.find((item) => item.slot === slot)?.title ?? ''} · ` : '';
    const found = countedEvidence(catalogCodes(flow), evidence).length;
    const hud = scene.floors?.find((item) => item.floor === mapFloor)?.hud ?? scene.hud;
    return `${clock}${hud} · ${t('hud.evidence', { n: found, total: catalogCodes(flow).length || 4 })}`;
  });

  function resetEventRun(): void {
    const next = replayEventRun({
      evidence,
      bag,
      solved,
      deduced,
      reward,
      poster,
      caseDone,
      cleared,
      difficulty,
      played,
      seen,
      levels,
      page,
      slot,
      hints,
      hintTier,
      hintGoal,
      cross,
      jig,
      slide,
      snap,
      picks,
      proof,
      marks,
      talk,
      talkSlug,
      overlay,
      selected,
      hintSpot,
      toastText,
      eggReveal,
      mapUnlockPulse,
      bagPulse,
    }, { cross: freshCross(), jig: freshJig(), slide: freshSlide() });
    evidence = next.evidence;
    bag = next.bag;
    solved = next.solved;
    deduced = next.deduced;
    reward = next.reward;
    poster = next.poster;
    caseDone = next.caseDone;
    cleared = next.cleared;
    difficulty = next.difficulty;
    page = next.page;
    slot = next.slot;
    hints = next.hints;
    hintTier = next.hintTier;
    hintGoal = next.hintGoal;
    cross = next.cross;
    jig = next.jig;
    slide = next.slide;
    snap = next.snap;
    picks = next.picks;
    proof = next.proof;
    marks = next.marks;
    talk = null;
    talkSlug = next.talkSlug;
    overlay = next.overlay;
    selected = next.selected;
    hintSpot = next.hintSpot;
    toastText = next.toastText;
    eggReveal = next.eggReveal;
    mapUnlockPulse = next.mapUnlockPulse;
    bagPulse = next.bagPulse;
    bagFreshId = null;
    window.clearTimeout(toastTimer);
    window.clearTimeout(hintTimer);
    window.clearTimeout(mapPulseTimer);
    window.clearTimeout(bagPulseTimer);
    toastTimer = 0;
    hintTimer = 0;
    mapPulseTimer = 0;
    bagPulseTimer = 0;
  }

  return {
    get ready() { return ready; },
    get flow() { return flow; },
    use,
    get screen() { return screen; },
    get fading() { return fading; },
    get loading() { return loading; },
    runWithLoading: withLoading,
    get selected() { return selected; },
    get hintSpot() { return hintSpot; },
    get toastText() { return toastText; },
    get toastLow() { return toastLow; },
    get mapFloor() { return mapFloor; },
    setMapFloor,
    get note() { return note; },
    flipNote() { if (note) note = { ...note, side: note.side === 'front' ? 'back' : 'front' }; },
    closeNote() { note = null; flushBottom(); },
    get talk() { return talk; },
    get overlay() { return overlay; },
    get slot() { return slot; },
    get evidence() { return evidence; },
    get solved() { return solved; },
    get deduced() { return deduced; },
    get reward() { return reward; },
    get poster() { return poster; },
    get caseDone() { return caseDone; },
    get cleared() { return cleared; },
    get mapUnlocked() { return mapIsUnlocked(); },
    get bag() { return bag; },
    get bagPulse() { return bagPulse; },
    get bagFreshId() { return bagFreshId; },
    get canSolve() { return canSolveCase(catalogCodes(flow), evidence); },
    get stateCheck() {
      const gate = houseMapGate(flow);
      const stage = progressStage();
      return {
        stage,
        grandmaDialogue: grandmaDialogueSlug(stage),
        houseMap: gate ? (mapIsUnlocked() ? 'unlocked' : 'locked') : 'ungated',
        houseMapEvidence: gate,
        violations: normalizeCaseState({
          evidence,
          bag,
          solved,
          deduced,
          poster,
          caseDone,
          mapUnlocked: gate ? mapIsUnlocked() : undefined,
        }, catalogCodes(flow), gate).violations,
        repaired,
      };
    },
    get evidenceTotal() { return catalogCodes(flow).length || 4; },
    /** Bottom-bar house map. Same rule on every scene that sets `map`. */
    get showHouseMapButton() {
      return houseMapButtonVisible({ context, sceneHasMap: scene?.map === true, flow, evidence });
    },
    get mapUnlockPulse() { return mapUnlockPulse; },
    get eggReveal() { return eggReveal; },
    get difficulty() { return difficulty; },
    get played() { return played; },
    get seen() { return seen; },
    get levels() { return levels; },
    get practice() { return practice; },
    get context() { return context; },
    /** Practice map, story case, or the online challenge shell. */
    get playMode(): PlayMode {
      return playModeFromContext(context, practice || practiceRun);
    },
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
    get leaveConfirm() { return leaveConfirm; },
    confirmLeave,
    cancelLeave,
    attemptSwipeLeave,
    bindLeaveGuard,
    starText: () => starText(hints),
    showToast,
    exploreHint,
    closeTalk() { talk = null; talkSlug = null; persist(); },
    closeOverlay() { overlay = null; },
    async go(next: ScreenId) { await go(next); },
    openHouseMap() { void go('house-map'); },
    async back() {
      if (leaveConfirm) { cancelLeave(); return; }
      if (talk) { talk = null; return; }
      if (overlay) { overlay = null; return; }
      const prev = history[history.length - 1];
      if (!prev) { showToast('อยู่หน้านี้แล้ว'); return; }
      if (requestLeave(prev, { fromBack: true })) return;
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
        void perform(spot.action);
        return;
      }
      selected = spot.id;
    },
    clearSpot() { selected = null; },
    openEvent(eventId: string) {
      const event = flow?.events.find((item) => item.eventId === eventId);
      if (!event) return;
      if (event.unlockAfter) {
        showToast(cleared && event.unlockAfter === primaryEventId(flow) ? 'เร็ว ๆ นี้' : event.lockedHint ?? 'ยังล็อกอยู่');
        return;
      }
      resetEventRun();
      context = 'event';
      practice = false;
      practiceRun = false;
      void go('cutscene');
    },
    nextPage() {
      if (screen === 'ending-comic') {
        const pages = flow?.pages.filter((item) => item.eventId === endingIdFor(primaryEventId(flow))) ?? [];
        if (page < pages.length - 1) {
          page += 1;
          persist();
          return;
        }
        void perform({ type: 'home' });
        return;
      }
      const pages = flow?.pages.filter((item) => item.eventId === primaryEventId(flow)) ?? [];
      if (page < pages.length - 1) {
        page += 1;
        void go('cutscene', true, false);
        return;
      }
      void go('difficulty');
    },
    prevPage() {
      if (page <= 0) {
        const prev = history[history.length - 1] ?? 'event-select';
        requestLeave(prev, { fromBack: !!history[history.length - 1] });
        return;
      }
      page -= 1;
      if (screen === 'ending-comic') {
        persist();
        return;
      }
      void go('cutscene', true, false);
    },
    skipCutscene() {
      if (loading) return;
      if (screen === 'ending-comic') {
        void withLoading(async () => {
          await perform({ type: 'home' });
        });
        return;
      }
      if (!cleared) return; // first play: intro not skippable
      void withLoading(async () => {
        // Hold the dialog over the comic first so the tap is obvious, then
        // switch without the 300ms blank fade. Difficulty itself is instant.
        await wait(LOADING_MIN_MS);
        await go('difficulty', false, true, { fade: false });
      });
    },
    skipIntro() {
      if (!cleared) return;
      void go('difficulty');
    },
    skipToMap() {
      if (!cleared) return;
      context = 'event';
      practice = false;
      practiceRun = false;
      history = ['player-room', 'event-select'];
      void go(mapIsUnlocked() ? 'house-map' : 'living-room', true, false);
    },
    closeEgg() { eggReveal = false; },
    jumpEndingComic() {
      poster = true;
      solved = true;
      bag = bag.filter((id) => id !== CASE_KEY_ID && id !== CASE_PHOTO_ID);
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
    pickPiece(index: number) {
      jig = isJigBoard(jig) ? selectPiece(jig, index) : { ...jig, sel: index };
    },
    placePiece(index: number) {
      if (jig.sel === index) jig = { ...jig, placed: [...jig.placed, index], sel: null };
      else if (jig.sel !== null) showToast('ยังไม่ใช่ช่องนี้ ลองอีกที');
    },
    setJig(next: JigBoard) { jig = next; },
    async finishJigsaw() {
      if (practice) { await finishPracticeLevel(); return; }
      if (screen !== 'jigsaw' || jigCompleting) return;
      jigCompleting = true;
      const gate = houseMapGate(flow);
      const firstUnlock = gate !== null && !has(gate);
      addEvidence(gate ?? 'E04');
      if (firstUnlock) {
        showToast(t('toast.mapUnlocked'));
        mapUnlockPulse = true;
        window.clearTimeout(mapPulseTimer);
        mapPulseTimer = window.setTimeout(() => { mapUnlockPulse = false; }, 2600);
      }
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
        if (!solved && !bag.includes(CASE_KEY_ID)) {
          bag = [...bag, CASE_KEY_ID];
          pulseBag(CASE_KEY_ID);
          showToast(t('toast.keyAwarded'));
        }
        persist();
        openDialogue('flow/dialogue/deduce-ok');
      }
    },
    chooseSlot(next: 'yesterday' | 'afternoon' | 'now') {
      const found = flow?.slots.find((item) => item.slot === next);
      if (!found) return;
      if (!slotUnlocked(found.unlockBy, evidence)) {
        showPowerHint(found.hint ?? t('time.slotLocked'));
        return;
      }
      overlay = null;
      slot = next;
      if (screen !== 'living-room') void go('living-room', true, false);
      showToast(`⏳ ${found.title}`);
    },
    openDayTravel() {
      if (!flow?.calendarTravel) {
        showPowerHint(t('time.calendarPowerWeak'));
        return;
      }
      overlay = 'day';
    },
    hasClockRewind() { return hasClockRewind(flow?.slots, evidence); },
    slotUnlocked(unlockBy: string | string[] | null) { return slotUnlocked(unlockBy, evidence); },
    openBag() { overlay = 'bag'; },
  };
}

export type FlowSession = ReturnType<typeof createFlow>;
