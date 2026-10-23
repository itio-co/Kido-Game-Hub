import {
  crossSolution,
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
import { t, type MessageKey } from '../i18n/core';
import { tx, txList } from '../i18n/content';
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
  let difficulty = $state('medium');
  let played = $state<string[]>([]);
  let seen = $state<string[]>([]);
  let levels = $state<FlowProgress['levels']>({ cross: [], jig: [], slide: [] });
  let practice = $state(false);
  let lvGame = $state<PuzzleKey>('cross');
  let lvN = $state(1);
  let category = $state('all');
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
    difficulty = saved?.difficulty || 'medium';
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
  const title = $derived.by(() => {
    const entry = registry?.screens.find((item) => item.screen === screen);
    return entry ? tx(entry, 'title') : t('game.flow.myRoom');
  });

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
    showToast(t('game.flow.evidenceFound', { code }) + (unlocked ? t('game.flow.timeUnlocked', { title: tx(unlocked, 'title') }) : ''));
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
      who: tx(found, 'who'),
      text: tx(found, 'text'),
      choices: found.choices.map((choice) => ({
        title: tx(choice, 'title'),
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
          ? { title: t('game.flow.close'), run: () => (talk = null) }
          : { title: t('game.flow.next'), run: () => openLines(who, lines, index + 1) },
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
      showToast(tx(action, 'text'));
      return;
    }
    if (action.type === 'evidence') {
      addEvidence(action.evidence);
      openLines(tx(action, 'who'), [tx(action, 'text')]);
      return;
    }
    if (action.type === 'dialogue') {
      openDialogue(action.dialogue);
      return;
    }
    if (action.type === 'lines') {
      openLines(tx(action, 'who'), txList(action, 'lines'));
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
        showToast(t('game.flow.boxOpened'));
        return;
      }
      if (!deduced) {
        openLines(t('game.flow.grandma'), [t('game.flow.boxLocked')]);
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
      showToast(t('game.flow.backHome'));
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
      showToast(t('game.hint.tryRoom', { room: tx(goal, 'room') }));
      return;
    }
    const here = scene?.spots.find((item) => item.title.includes(goal.object) && (item.when === 'always' || item.when === slot));
    if (here && screen === goal.at) {
      hintSpot = here.id;
      window.clearTimeout(hintTimer);
      hintTimer = window.setTimeout(() => {
        hintSpot = null;
      }, 2500);
      showToast(t('game.hint.tapSpot', { title: tx(here, 'title') }));
      return;
    }
    showToast(t('game.hint.goAndTap', { room: tx(goal, 'room'), object: tx(goal, 'object') }));
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
    showToast(t('game.practice.levelDone', { n: lvN, stars: '⭐'.repeat(stars) }));
    endPractice();
    history = history.slice(0, -1);
    await go('level-map', true, false);
  }

  async function onSlideWin(): Promise<void> {
    if (practice) {
      await finishPracticeLevel();
      return;
    }
    showToast(t('game.slide.win'));
    solved = true;
    addEvidence('E05');
    history = ['study', 'star-box'];
    await go('album', true);
  }

  function puzzleHint(): void {
    hints += 1;
    if (hints === 1) {
      if (screen === 'crossword') showToast(t('game.hint.crossword'));
      else if (screen === 'jigsaw') showToast(t('game.hint.jigsaw'));
      else showToast(t('game.hint.slide'));
      if (screen === 'crossword') cross = { ...cross, sel: '2,2' };
      if (screen === 'jigsaw') {
        jig = { ...jig, sel: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((index) => !jig.placed.includes(index)) ?? null };
      }
      return;
    }
    if (screen === 'crossword') {
      const solution = crossSolution();
      const key = Object.keys(solution).find((cell) => cross.fill[cell] !== solution[cell]);
      if (key) cross = { ...cross, fill: { ...cross.fill, [key]: solution[key] } };
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
    if (screen === 'event-select') return t('game.sub.eventSelect');
    if (screen === 'cutscene') return t('game.sub.cutscene', { page: page + 1, total: 3 });
    if (screen === 'difficulty') return t('game.sub.difficulty');
    if (screen === 'practice') return t('game.sub.practice', { played: played.length, total: flow?.practice.length ?? 0 });
    if (screen === 'level-map') return t('game.sub.levelMap');
    if (screen === 'notebook') return t('game.sub.evidence', { count: evidence.length, total: 5 });
    if (screen === 'case-board') return t('game.sub.caseBoard');
    if (screen === 'crossword' || screen === 'jigsaw' || screen === 'slide') {
      const game = flow?.games.find((item) => item.game === (screen === 'slide' ? 'slide' : screen === 'jigsaw' ? 'jigsaw' : 'crossword'));
      return `${game ? tx(game, 'hud') : ''} · ${t('game.sub.hints', { count: hints })}`;
    }
    if (!scene || !flow) return '';
    const current = flow.slots.find((item) => item.slot === slot);
    const clock = scene.timed ? `⏳ ${current ? tx(current, 'title') : ''} · ` : '';
    return `${clock}${tx(scene, 'hud')} · ${t('game.sub.evidence', { count: evidence.length, total: 5 })}`;
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
      if (!prev) { showToast(t('game.flow.alreadyHere')); return; }
      history = history.slice(0, -1);
      if (prev === 'player-room' || prev === 'level-map') endPractice();
      await go(prev, true, prev !== 'uncle');
    },
    /** A single tap (or click) acts at once; the spot's name pill stays up as feedback until the scene changes or the player taps empty space. */
    tapSpot(spot: FlowSpot) {
      selected = spot.id;
      const action = spot.slug === 'flow/grandma/talk' && solved
        ? { type: 'dialogue' as const, dialogue: 'flow/dialogue/grandma-win' }
        : spot.action;
      void perform(action);
    },
    clearSpot() { selected = null; },
    openEvent(eventId: string) {
      const event = flow?.events.find((item) => item.eventId === eventId);
      if (!event) return;
      if (event.unlockAfter) {
        showToast(solved && event.unlockAfter === 'case-01' ? t('game.flow.comingSoon') : event.lockedHint ? tx(event, 'lockedHint') : t('game.flow.stillLocked'));
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
      showToast(t('game.flow.difficultyPicked', { name: t(`game.difficulty.${name}` as MessageKey) }));
      history = ['player-room', 'event-select'];
      void go('house-map', true, false);
    },
    setCategory(next: string) { category = next; },
    openPractice(slug: string) {
      const card = flow?.practice.find((item) => item.slug === slug);
      if (!card) return;
      if (!played.includes(slug) || card.future || card.game === 'ex') {
        showToast(t('game.practice.lockedFromCase', { caseNo: card.caseNo }));
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
      if (!open) { showToast(t('game.practice.clearPrevious')); return; }
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
      if (!crossCorrect(cross.fill)) { showToast(t('game.cross.wrong')); return; }
      history = history.slice(0, -1);
      await go('uncle', true, false);
      openDialogue('flow/dialogue/mek-thanks');
    },
    pickPiece(index: number) { jig = { ...jig, sel: index }; },
    placePiece(index: number) {
      if (jig.sel === index) jig = { placed: [...jig.placed, index], sel: null };
      else if (jig.sel !== null) showToast(t('game.jigsaw.wrongSlot'));
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
      else if (!move) showToast(t('game.slide.stuck'));
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
        if (!hint && !(rightAnswer && rightProof)) hint = rightAnswer ? t('game.case.wrongProof') : tx(question, 'hint');
        return rightAnswer && rightProof ? 1 : -1;
      });
      marks = nextMarks;
      if (hint) openLines(t('game.flow.grandma'), [hint]);
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
        showToast(found.hint ? tx(found, 'hint') : t('game.flow.stillLocked'));
        return;
      }
      overlay = null;
      slot = next;
      if (screen !== 'living-room') void go('living-room', true, false);
      showToast(`⏳ ${tx(found, 'title')}`);
    },
    openDayTravel() { overlay = 'day'; },
  };
}

export type FlowSession = ReturnType<typeof createFlow>;
