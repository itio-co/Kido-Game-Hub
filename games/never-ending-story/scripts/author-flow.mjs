import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Story text lives in src/locales/story.{th,en}.json. S(key) marks a field as
// localized; localize() expands it into `field` (Thai, the game's default) and
// `fieldEn` (English) so the runtime can pick a language without a lookup table.
const locales = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales');
const storyTh = JSON.parse(readFileSync(join(locales, 'story.th.json'), 'utf8'));
const storyEn = JSON.parse(readFileSync(join(locales, 'story.en.json'), 'utf8'));
const TEXT = Symbol('text');
function S(key) {
  if (!(key in storyTh) || !(key in storyEn)) throw new Error(`missing story key ${key}`);
  return { [TEXT]: key };
}
const isText = (v) => v !== null && typeof v === 'object' && TEXT in v;
function localize(value) {
  if (Array.isArray(value)) return value.map(localize);
  if (value === null || typeof value !== 'object') return value;
  const out = {};
  for (const [field, v] of Object.entries(value)) {
    if (isText(v)) {
      out[field] = storyTh[v[TEXT]];
      out[`${field}En`] = storyEn[v[TEXT]];
    } else if (Array.isArray(v) && v.length > 0 && v.every(isText)) {
      out[field] = v.map((x) => storyTh[x[TEXT]]);
      out[`${field}En`] = v.map((x) => storyEn[x[TEXT]]);
    } else {
      out[field] = localize(v);
    }
  }
  return out;
}

let seq = 0;
function id() {
  const tail = seq.toString(16).padStart(12, '0');
  seq += 1;
  return `a4c0e001-0000-4000-8000-${tail}`;
}

function ent(kind, title, slug, extra = {}) {
  return { id: id(), kind, title, slug, ...extra };
}

const screens = [
  ['player-room', S('story.screen.playerRoom.title'), 'real'],
  ['event-select', S('story.screen.eventSelect.title'), 'demo'],
  ['cutscene', S('story.screen.cutscene.title'), 'demo'],
  ['difficulty', S('story.screen.difficulty.title'), 'demo'],
  ['house-map', S('story.screen.houseMap.title'), 'demo'],
  ['living-room', S('story.screen.livingRoom.title'), 'demo'],
  ['study', S('story.screen.study.title'), 'demo'],
  ['kitchen', S('story.screen.kitchen.title'), 'demo'],
  ['kitchen-close', S('story.screen.kitchenClose.title'), 'demo'],
  ['table', S('story.screen.table.title'), 'demo'],
  ['tray', S('story.screen.tray.title'), 'demo'],
  ['grandma', S('story.screen.grandma.title'), 'demo'],
  ['uncle', S('story.screen.uncle.title'), 'demo'],
  ['star-box', S('story.screen.starBox.title'), 'demo'],
  ['crossword', S('story.screen.crossword.title'), 'demo'],
  ['jigsaw', S('story.screen.jigsaw.title'), 'demo'],
  ['slide', S('story.screen.slide.title'), 'demo'],
  ['notebook', S('story.screen.notebook.title'), 'demo'],
  ['case-board', S('story.screen.caseBoard.title'), 'demo'],
  ['album', S('story.screen.album.title'), 'demo'],
  ['return-home', S('story.screen.returnHome.title'), 'real'],
  ['practice', S('story.screen.practice.title'), 'demo'],
  ['level-map', S('story.screen.levelMap.title'), 'demo'],
];

const registry = ent('screen-registry', S('story.screenRegistry.title'), 'screen-registry', {
  screens: screens.map(([screen, title, status]) =>
    ent('screen', title, `screen/${screen}`, { screen, status }),
  ),
});

function spot(title, slug, x, y, action, extra = {}) {
  return ent('hotspot', title, slug, {
    x,
    y,
    when: extra.when ?? 'always',
    action,
    doneEvidence: extra.done ?? null,
  });
}

const go = (screen) => ({ type: 'go', screen });
const toast = (text) => ({ type: 'toast', text });

const scenes = [
  ent('scene', S('story.scene.houseMap.title'), 'flow/scene/house-map', {
    screen: 'house-map',
    image: 'house-map.jpg',
    contain: true,
    hud: S('story.scene.houseMap.hud'),
    spots: [
      spot(S('story.houseMap.living.title'), 'flow/house-map/living', 50.2, 27.5, go('living-room')),
      spot(S('story.houseMap.study.title'), 'flow/house-map/study', 34.9, 62.3, go('study')),
      spot(S('story.houseMap.kitchen.title'), 'flow/house-map/kitchen', 72.5, 62.3, go('kitchen')),
    ],
  }),
  ent('scene', S('story.scene.livingRoom.title'), 'flow/scene/living-room', {
    screen: 'living-room',
    image: 'living-wide.jpg',
    images: {
      now: 'living-wide.jpg',
      afternoon: 'living-wide-afternoon.jpg',
      yesterday: 'living-wide-yesterday.jpg',
    },
    map: true,
    timed: true,
    hud: S('story.scene.livingRoom.hud'),
    spots: [
      spot(S('story.livingRoom.clock.title'), 'flow/living-room/clock', 13, 12.5, { type: 'clock' }),
      spot(S('story.livingRoom.calendar.title'), 'flow/living-room/calendar', 80, 27, { type: 'calendar' }),
      spot(S('story.livingRoom.tray.title'), 'flow/living-room/tray', 41, 37, go('tray'), { when: 'now', done: 'E04' }),
      spot(S('story.livingRoom.kitchenDoor.title'), 'flow/living-room/kitchen-door', 12, 25.3, go('kitchen'), { when: 'now' }),
      spot(S('story.livingRoom.studyDoor.title'), 'flow/living-room/study-door', 92, 33.8, go('study'), { when: 'now' }),
      spot(S('story.livingRoom.starBox.title'), 'flow/living-room/star-box', 85.3, 70.5, toast(S('story.livingRoom.starBox.action.text')), { when: 'now' }),
      spot(S('story.livingRoom.table.title'), 'flow/living-room/table', 42, 71.1, go('table'), { when: 'now', done: 'E01' }),
      spot(S('story.livingRoom.mek.title'), 'flow/living-room/mek', 17.8, 49.6, go('uncle'), { when: 'now', done: 'E03' }),
      spot(S('story.livingRoom.grandma.title'), 'flow/living-room/grandma', 61.4, 50.1, go('grandma'), { when: 'now' }),
      spot(S('story.livingRoom.starBoxPast.title'), 'flow/living-room/star-box-past', 84.3, 70.5, toast(S('story.livingRoom.starBoxPast.action.text')), { when: 'afternoon' }),
      spot(S('story.livingRoom.rin.title'), 'flow/living-room/rin', 27, 44.2, {
        type: 'lines',
        who: S('story.livingRoom.rin.action.who'),
        lines: [S('story.livingRoom.rin.action.line1'), S('story.livingRoom.rin.action.line2')],
      }, { when: 'afternoon' }),
      spot(S('story.livingRoom.fallenVase.title'), 'flow/living-room/fallen-vase', 38.5, 68, {
        type: 'lines',
        who: S('story.livingRoom.fallenVase.action.who'),
        lines: [S('story.livingRoom.fallenVase.action.line1')],
      }, { when: 'afternoon' }),
      spot(S('story.livingRoom.albumThen.title'), 'flow/living-room/album-then', 58, 69.5, {
        type: 'lines',
        who: S('story.livingRoom.albumThen.action.who'),
        lines: [S('story.livingRoom.albumThen.action.line1')],
      }, { when: 'afternoon' }),
      spot(S('story.livingRoom.trayAfternoon.title'), 'flow/living-room/tray-afternoon', 47, 37, toast(S('story.livingRoom.trayAfternoon.action.text')), { when: 'afternoon' }),
      spot(S('story.livingRoom.starBoxYesterday.title'), 'flow/living-room/star-box-yesterday', 84.3, 70.5, toast(S('story.livingRoom.starBoxYesterday.action.text')), { when: 'yesterday' }),
      spot(S('story.livingRoom.grandmaYesterday.title'), 'flow/living-room/grandma-yesterday', 26.7, 39, {
        type: 'lines',
        who: S('story.livingRoom.grandmaYesterday.action.who'),
        lines: [S('story.livingRoom.grandmaYesterday.action.line1'), S('story.livingRoom.grandmaYesterday.action.line2')],
      }, { when: 'yesterday' }),
      spot(S('story.livingRoom.albumShelf.title'), 'flow/living-room/album-shelf', 43, 30, {
        type: 'lines',
        who: S('story.livingRoom.albumShelf.action.who'),
        lines: [S('story.livingRoom.albumShelf.action.line1')],
      }, { when: 'yesterday' }),
      spot(S('story.livingRoom.trayYesterday.title'), 'flow/living-room/tray-yesterday', 42.5, 37.5, toast(S('story.livingRoom.trayYesterday.action.text')), { when: 'yesterday' }),
    ],
  }),
  ent('scene', S('story.scene.study.title'), 'flow/scene/study', {
    screen: 'study',
    image: 'study-wide.jpg',
    map: true,
    hud: S('story.scene.study.hud'),
    spots: [
      spot(S('story.study.leafBox.title'), 'flow/study/leaf-box', 66.5, 64, toast(S('story.study.leafBox.action.text'))),
      spot(S('story.study.starBox.title'), 'flow/study/star-box', 50.8, 63, go('star-box')),
    ],
  }),
  ent('scene', S('story.scene.kitchen.title'), 'flow/scene/kitchen', {
    screen: 'kitchen',
    image: 'kitchen-wide.jpg',
    map: true,
    hud: S('story.scene.kitchen.hud'),
    spots: [
      spot(S('story.kitchen.cloth.title'), 'flow/kitchen/cloth', 31.5, 40.5, go('kitchen-close')),
      spot(S('story.kitchen.vase.title'), 'flow/kitchen/vase', 79.5, 50, go('kitchen-close')),
    ],
  }),
  ent('scene', S('story.scene.kitchenClose.title'), 'flow/scene/kitchen-close', {
    screen: 'kitchen-close',
    image: 'kitchen-close.jpg',
    map: true,
    hud: S('story.scene.kitchenClose.hud'),
    spots: [
      spot(S('story.kitchenClose.cloth.title'), 'flow/kitchen-close/cloth', 28.6, 40, { type: 'evidence', evidence: 'E02', who: S('story.kitchenClose.cloth.action.who'), text: S('story.kitchenClose.cloth.action.text') }),
      spot(S('story.kitchenClose.vase.title'), 'flow/kitchen-close/vase', 68.7, 59.5, toast(S('story.kitchenClose.vase.action.text'))),
    ],
  }),
  ent('scene', S('story.scene.table.title'), 'flow/scene/table', {
    screen: 'table',
    image: 'living-table.jpg',
    map: true,
    hud: S('story.scene.table.hud'),
    spots: [
      spot(S('story.table.note.title'), 'flow/table/note', 35, 31.3, {
        type: 'evidence',
        evidence: 'E01',
        who: S('story.table.note.action.who'),
        text: S('story.table.note.action.text'),
      }, { done: 'E01' }),
      spot(S('story.table.water.title'), 'flow/table/water', 39.8, 53.3, { type: 'evidence', evidence: 'E02', who: S('story.table.water.action.who'), text: S('story.table.water.action.text') }, { done: 'E02' }),
      spot(S('story.table.albumMark.title'), 'flow/table/album-mark', 70, 64.3, toast(S('story.table.albumMark.action.text'))),
    ],
  }),
  ent('scene', S('story.scene.tray.title'), 'flow/scene/tray', {
    screen: 'tray',
    image: 'living-shelf-tray.jpg',
    map: true,
    hud: S('story.scene.tray.hud'),
    spots: [
      spot(S('story.tray.jigsaw.title'), 'flow/tray/jigsaw', 58.7, 65.5, { type: 'minigame', screen: 'jigsaw' }, { done: 'E04' }),
    ],
  }),
  ent('scene', S('story.scene.grandma.title'), 'flow/scene/grandma', {
    screen: 'grandma',
    image: 'living-grandma.jpg',
    map: true,
    hud: S('story.scene.grandma.hud'),
    enter: 'flow/dialogue/grandma-open',
    enterWhenSolved: 'flow/dialogue/grandma-win',
    spots: [spot(S('story.grandma.talk.title'), 'flow/grandma/talk', 50, 42, { type: 'dialogue', dialogue: 'flow/dialogue/grandma-open' })],
  }),
  ent('scene', S('story.scene.uncle.title'), 'flow/scene/uncle', {
    screen: 'uncle',
    image: 'uncle-mek.jpg',
    map: true,
    hud: S('story.scene.uncle.hud'),
    enter: 'flow/dialogue/mek-open',
    spots: [spot(S('story.uncle.talk.title'), 'flow/uncle/talk', 50, 40, { type: 'dialogue', dialogue: 'flow/dialogue/mek-open' })],
  }),
  ent('scene', S('story.scene.starBox.title'), 'flow/scene/star-box', {
    screen: 'star-box',
    image: 'study-box.jpg',
    map: true,
    hud: S('story.scene.starBox.hud'),
    spots: [
      spot(S('story.starBox.sticker.title'), 'flow/star-box/sticker', 46.5, 70, toast(S('story.starBox.sticker.action.text'))),
      spot(S('story.starBox.lock.title'), 'flow/star-box/lock', 52.6, 44.8, { type: 'box-lock' }),
    ],
  }),
  ent('scene', S('story.scene.album.title'), 'flow/scene/album', {
    screen: 'album',
    image: 'album-found.jpg',
    hud: S('story.scene.album.hud'),
    enter: 'flow/dialogue/album-open',
    spots: [
      spot(S('story.album.portrait.title'), 'flow/album/portrait', 37.8, 44.5, { type: 'dialogue', dialogue: 'flow/dialogue/album-portrait' }),
      spot(S('story.album.postcard.title'), 'flow/album/postcard', 80, 45, { type: 'dialogue', dialogue: 'flow/dialogue/album-card' }),
    ],
  }),
];

const choice = (title, slug, extra) => ent('choice', title, slug, extra);

const dialogues = [
  ent('dialogue', S('story.dialogue.grandmaOpen.title'), 'flow/dialogue/grandma-open', {
    who: S('story.dialogue.grandmaOpen.who'),
    text: S('story.dialogue.grandmaOpen.text'),
    choices: [
      choice(S('story.dialogue.grandmaOpen.ask.title'), 'flow/dialogue/grandma-open/ask', { next: 'flow/dialogue/grandma-ask' }),
      choice(S('story.common.close'), 'flow/dialogue/grandma-open/close', { action: { type: 'toast', text: '' } }),
    ],
  }),
  ent('dialogue', S('story.dialogue.grandmaAsk.title'), 'flow/dialogue/grandma-ask', {
    who: S('story.dialogue.grandmaAsk.who'),
    text: S('story.dialogue.grandmaAsk.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/grandma-ask/close', {})],
  }),
  ent('dialogue', S('story.dialogue.grandmaWin.title'), 'flow/dialogue/grandma-win', {
    who: S('story.dialogue.grandmaWin.who'),
    text: S('story.dialogue.grandmaWin.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/grandma-win/close', {})],
  }),
  ent('dialogue', S('story.dialogue.mekOpen.title'), 'flow/dialogue/mek-open', {
    who: S('story.dialogue.mekOpen.who'),
    text: S('story.dialogue.mekOpen.text'),
    choices: [
      choice(S('story.dialogue.mekOpen.help.title'), 'flow/dialogue/mek-open/help', { next: 'flow/dialogue/mek-crossword' }),
      choice(S('story.common.close'), 'flow/dialogue/mek-open/close', {}),
    ],
  }),
  ent('dialogue', S('story.dialogue.mekCrossword.title'), 'flow/dialogue/mek-crossword', {
    who: S('story.dialogue.mekCrossword.who'),
    text: S('story.dialogue.mekCrossword.text'),
    choices: [
      choice(S('story.dialogue.mekCrossword.play.title'), 'flow/dialogue/mek-crossword/play', { action: { type: 'minigame', screen: 'crossword' } }),
      choice(S('story.common.close'), 'flow/dialogue/mek-crossword/close', {}),
    ],
  }),
  ent('dialogue', S('story.dialogue.mekThanks.title'), 'flow/dialogue/mek-thanks', {
    who: S('story.dialogue.mekThanks.who'),
    text: S('story.dialogue.mekThanks.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/mek-thanks/close', {})],
  }),
  ent('dialogue', S('story.dialogue.albumOpen.title'), 'flow/dialogue/album-open', {
    who: S('story.dialogue.albumOpen.who'),
    text: S('story.dialogue.albumOpen.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/album-open/close', {})],
  }),
  ent('dialogue', S('story.dialogue.albumPortrait.title'), 'flow/dialogue/album-portrait', {
    who: S('story.dialogue.albumPortrait.who'),
    text: S('story.dialogue.albumPortrait.text'),
    choices: [choice(S('story.dialogue.albumPortrait.next.title'), 'flow/dialogue/album-portrait/next', { next: 'flow/dialogue/album-rin' })],
  }),
  ent('dialogue', S('story.dialogue.albumRin.title'), 'flow/dialogue/album-rin', {
    who: S('story.dialogue.albumRin.who'),
    text: S('story.dialogue.albumRin.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/album-rin/close', {})],
  }),
  ent('dialogue', S('story.dialogue.albumCard.title'), 'flow/dialogue/album-card', {
    who: S('story.dialogue.albumCard.who'),
    text: S('story.dialogue.albumCard.text'),
    choices: [choice(S('story.dialogue.albumCard.home.title'), 'flow/dialogue/album-card/home', { action: { type: 'home' } })],
  }),
  ent('dialogue', S('story.dialogue.deduceOk.title'), 'flow/dialogue/deduce-ok', {
    who: S('story.dialogue.deduceOk.who'),
    text: S('story.dialogue.deduceOk.text'),
    choices: [choice(S('story.dialogue.deduceOk.go.title'), 'flow/dialogue/deduce-ok/go', { action: go('study') })],
  }),
  ent('dialogue', S('story.dialogue.mapClue.title'), 'flow/dialogue/map-clue', {
    who: S('story.dialogue.mapClue.who'),
    text: S('story.dialogue.mapClue.text'),
    choices: [choice(S('story.common.close'), 'flow/dialogue/map-clue/close', {})],
  }),
];

const emptyClose = new Set([
  'flow/dialogue/grandma-open/close',
  'flow/dialogue/grandma-ask/close',
  'flow/dialogue/grandma-win/close',
  'flow/dialogue/mek-open/close',
  'flow/dialogue/mek-crossword/close',
  'flow/dialogue/mek-thanks/close',
  'flow/dialogue/album-open/close',
  'flow/dialogue/album-rin/close',
  'flow/dialogue/map-clue/close',
]);
for (const dialogue of dialogues) {
  for (const item of dialogue.choices) {
    if (emptyClose.has(item.slug)) delete item.action;
  }
}

const flow = ent('story-flow', S('story.case01.title'), 'flow/case-01', {
  difficulties: ['easy', 'medium', 'hard'],
  events: [
    ent('event', S('story.event.case01.title'), 'flow/event/case-01', {
      eventId: 'case-01',
      subtitle: S('story.event.case01.subtitle'),
      cover: 'cutscene-01-p2.jpg',
      unlockAfter: null,
      lockedHint: null,
    }),
    ent('event', S('story.event.case02.title'), 'flow/event/case-02', {
      eventId: 'case-02',
      subtitle: S('story.event.case02.subtitle'),
      cover: 'study-wide.jpg',
      unlockAfter: 'case-01',
      lockedHint: S('story.event.case02.lockedHint'),
    }),
    ent('event', S('story.event.case03.title'), 'flow/event/case-03', {
      eventId: 'case-03',
      subtitle: S('story.event.case03.subtitle'),
      cover: 'kitchen-wide.jpg',
      unlockAfter: 'case-02',
      lockedHint: S('story.event.case03.lockedHint'),
    }),
  ],
  pages: [
    ent('cutscene-page', S('story.cutscene.case01.p1.title'), 'flow/cutscene/case-01/p1', {
      eventId: 'case-01',
      image: 'cutscene-01-p1.jpg',
      caption: S('story.cutscene.case01.p1.caption'),
      lines: [
        ent('speech-line', S('story.cutscene.case01.p1.mom.title'), 'flow/cutscene/case-01/p1/mom', {
          who: S('story.cutscene.case01.p1.mom.who'),
          text: S('story.cutscene.case01.p1.mom.text'),
          x: 4,
          y: 22,
          w: 48,
        }),
        ent('speech-line', S('story.cutscene.case01.p1.child.title'), 'flow/cutscene/case-01/p1/child', {
          who: S('story.cutscene.case01.p1.child.who'),
          text: S('story.cutscene.case01.p1.child.text'),
          x: 40,
          y: 58,
          w: 44,
        }),
      ],
    }),
    ent('cutscene-page', S('story.cutscene.case01.p2.title'), 'flow/cutscene/case-01/p2', {
      eventId: 'case-01',
      image: 'cutscene-01-p2.jpg',
      caption: S('story.cutscene.case01.p2.caption'),
      lines: [
        ent('speech-line', S('story.cutscene.case01.p2.grandma.title'), 'flow/cutscene/case-01/p2/grandma', {
          who: S('story.cutscene.case01.p2.grandma.who'),
          text: S('story.cutscene.case01.p2.grandma.text'),
          x: 2,
          y: 46,
          w: 50,
        }),
      ],
    }),
    ent('cutscene-page', S('story.cutscene.case01.p3.title'), 'flow/cutscene/case-01/p3', {
      eventId: 'case-01',
      image: 'cutscene-01-p3.jpg',
      caption: S('story.cutscene.case01.p3.caption'),
      lines: [
        ent('speech-line', S('story.cutscene.case01.p3.grandma.title'), 'flow/cutscene/case-01/p3/grandma', {
          who: S('story.cutscene.case01.p3.grandma.who'),
          text: S('story.cutscene.case01.p3.grandma.text'),
          x: 2,
          y: 50,
          w: 34,
        }),
        ent('speech-line', S('story.cutscene.case01.p3.child.title'), 'flow/cutscene/case-01/p3/child', {
          who: S('story.cutscene.case01.p3.child.who'),
          text: S('story.cutscene.case01.p3.child.text'),
          x: 56,
          y: 72,
          w: 42,
        }),
      ],
    }),
  ],
  evidence: [
    ent('evidence', S('story.evidence.e01.title'), 'flow/evidence/e01', {
      code: 'E01',
      text: S('story.evidence.e01.text'),
    }),
    ent('evidence', S('story.evidence.e02.title'), 'flow/evidence/e02', {
      code: 'E02',
      text: S('story.evidence.e02.text'),
    }),
    ent('evidence', S('story.evidence.e03.title'), 'flow/evidence/e03', {
      code: 'E03',
      text: S('story.evidence.e03.text'),
    }),
    ent('evidence', S('story.evidence.e04.title'), 'flow/evidence/e04', {
      code: 'E04',
      text: S('story.evidence.e04.text'),
    }),
    ent('evidence', S('story.evidence.e05.title'), 'flow/evidence/e05', {
      code: 'E05',
      text: S('story.evidence.e05.text'),
    }),
  ],
  slots: [
    ent('time-slot', S('story.time.yesterday.title'), 'flow/time/yesterday', {
      slot: 'yesterday',
      part: 'day',
      image: 'living-wide-yesterday.jpg',
      unlockBy: 'E01',
      hint: S('story.time.yesterday.hint'),
    }),
    ent('time-slot', S('story.time.afternoon.title'), 'flow/time/afternoon', {
      slot: 'afternoon',
      part: 'hour',
      image: 'living-wide-afternoon.jpg',
      unlockBy: 'E02',
      hint: S('story.time.afternoon.hint'),
    }),
    ent('time-slot', S('story.time.now.title'), 'flow/time/now', {
      slot: 'now',
      part: 'hour',
      image: 'living-wide.jpg',
      unlockBy: null,
      hint: null,
    }),
  ],
  scenes,
  dialogues,
  games: [
    ent('minigame', S('story.minigame.crossword.title'), 'flow/minigame/crossword', {
      game: 'crossword',
      hud: S('story.minigame.crossword.hud'),
    }),
    ent('minigame', S('story.minigame.jigsaw.title'), 'flow/minigame/jigsaw', {
      game: 'jigsaw',
      hud: S('story.minigame.jigsaw.hud'),
    }),
    ent('minigame', S('story.minigame.slide.title'), 'flow/minigame/slide', {
      game: 'slide',
      hud: S('story.minigame.slide.hud'),
    }),
  ],
  practice: [
    ['cross', S('story.practice.cross0.title'), '📰', 'word', '01', false],
    ['jig', S('story.practice.jig1.title'), '🗺', 'picture', '01', false],
    ['slide', S('story.practice.slide2.title'), '🧩', 'logic', '01', false],
    ['ex', S('story.practice.future3.title'), '🔍', 'picture', '02', true],
    ['ex', S('story.practice.future4.title'), '🃏', 'picture', '03', true],
    ['ex', S('story.practice.future5.title'), '🔐', 'word', '02', true],
    ['ex', S('story.practice.future6.title'), '🌀', 'logic', '04', true],
    ['ex', S('story.practice.future7.title'), '🚰', 'logic', '05', true],
    ['ex', S('story.practice.future8.title'), '🗓', 'word', '03', true],
  ].map(([game, title, icon, group, caseNo, future], index) =>
    ent('practice-game', title, `flow/practice/${future ? 'future' : game}-${index}`, {
      game,
      icon,
      group,
      caseNo,
      future,
    }),
  ),
  questions: [
    ent('question', S('story.question.who.title'), 'flow/question/who', {
      prompt: S('story.question.who.prompt'),
      right: 'rin',
      evidence: ['E01', 'E03'],
      hint: S('story.question.who.hint'),
      mode: 'portrait',
      answers: [
        choice(S('story.question.who.grandma.title'), 'flow/question/who/grandma', { value: 'grandma', image: 'living-grandma.jpg' }),
        choice(S('story.question.who.mek.title'), 'flow/question/who/mek', { value: 'mek', image: 'uncle-mek.jpg' }),
        choice(S('story.question.who.rin.title'), 'flow/question/who/rin', { value: 'rin', image: 'rin.jpg' }),
      ],
    }),
    ent('question', S('story.question.why.title'), 'flow/question/why', {
      prompt: S('story.question.why.prompt'),
      right: 'water',
      evidence: ['E02'],
      hint: S('story.question.why.hint'),
      mode: 'chips',
      answers: [
        choice(S('story.question.why.water.title'), 'flow/question/why/water', { value: 'water' }),
        choice(S('story.question.why.hide.title'), 'flow/question/why/hide', { value: 'hide' }),
        choice(S('story.question.why.look.title'), 'flow/question/why/look', { value: 'look' }),
      ],
    }),
    ent('question', S('story.question.where.title'), 'flow/question/where', {
      prompt: S('story.question.where.prompt'),
      right: 'study',
      evidence: ['E04'],
      hint: S('story.question.where.hint'),
      mode: 'map',
      answers: [
        choice(S('story.question.where.living.title'), 'flow/question/where/living', { value: 'living' }),
        choice(S('story.question.where.study.title'), 'flow/question/where/study', { value: 'study' }),
        choice(S('story.question.where.kitchen.title'), 'flow/question/where/kitchen', { value: 'kitchen' }),
      ],
    }),
  ],
  goals: [
    ent('goal', S('story.goal.table.title'), 'flow/goal/table', { code: 'table', room: S('story.goal.table.room'), at: 'living-room', object: S('story.goal.table.object') }),
    ent('goal', S('story.goal.tray.title'), 'flow/goal/tray', { code: 'tray', room: S('story.goal.tray.room'), at: 'living-room', object: S('story.goal.tray.object') }),
    ent('goal', S('story.goal.mek.title'), 'flow/goal/mek', { code: 'mek', room: S('story.goal.mek.room'), at: 'living-room', object: S('story.goal.mek.object') }),
    ent('goal', S('story.goal.deduce.title'), 'flow/goal/deduce', { code: 'deduce', room: S('story.goal.deduce.room'), at: null, object: S('story.goal.deduce.object') }),
    ent('goal', S('story.goal.box.title'), 'flow/goal/box', { code: 'box', room: S('story.goal.box.room'), at: 'study', object: S('story.goal.box.object') }),
    ent('goal', S('story.goal.home.title'), 'flow/goal/home', { code: 'home', room: S('story.goal.home.room'), at: 'player-room', object: S('story.goal.home.object') }),
  ],
});

const root = dirname(fileURLToPath(import.meta.url));
const data = join(root, '../public/data');
writeFileSync(join(data, 'screens.json'), JSON.stringify(localize(registry), null, 2) + '\n');
writeFileSync(join(data, 'case-flow.json'), JSON.stringify(localize(flow), null, 2) + '\n');
console.log('screens', registry.screens.length, 'ids', seq);
