import { ENTITY_KINDS, type EntityKind } from '../catalog';
import { buildBook, buildBookshelf, buildShelfRow } from './bookshelf';
import {
  buildBed,
  buildBox,
  buildCalendar,
  buildDesk,
  buildDoor,
  buildFloor,
  buildLamp,
  buildNightstand,
  buildPlant,
  buildRug,
  buildWindow,
} from './builders';
import { registerKind, type KindHandler } from './registry';

/** Every known kind maps to a builder or a non-mesh role. Scene code dispatches through this table. */
const kindHandlers: Record<EntityKind, KindHandler> = {
  room: { role: 'root' },
  box: { role: 'scene', build: buildBox },
  floor: { role: 'scene', build: buildFloor },
  window: { role: 'scene', build: buildWindow },
  door: { role: 'scene', build: buildDoor },
  bed: { role: 'scene', build: buildBed },
  nightstand: { role: 'scene', build: buildNightstand },
  desk: { role: 'scene', build: buildDesk },
  bookshelf: { role: 'scene', build: buildBookshelf },
  'shelf-row': { role: 'nested', build: buildShelfRow },
  book: { role: 'nested', build: buildBook },
  calendar: { role: 'scene', build: buildCalendar },
  'calendar-theme': { role: 'data' },
  'calendar-entry': { role: 'data' },
  rug: { role: 'scene', build: buildRug },
  plant: { role: 'scene', build: buildPlant },
  lamp: { role: 'scene', build: buildLamp },
  hotspot: { role: 'ui' },
  'decor-slot': { role: 'ui' },
  'screen-registry': { role: 'data' },
  screen: { role: 'data' },
  'story-flow': { role: 'data' },
  scene: { role: 'data' },
  event: { role: 'data' },
  'cutscene-page': { role: 'data' },
  'speech-line': { role: 'data' },
  evidence: { role: 'data' },
  'time-slot': { role: 'data' },
  dialogue: { role: 'data' },
  choice: { role: 'data' },
  'practice-game': { role: 'data' },
  question: { role: 'data' },
  goal: { role: 'data' },
  minigame: { role: 'data' },
};

for (const kind of ENTITY_KINDS) registerKind(kind, kindHandlers[kind]);

export { dispatch, handlerFor } from './registry';
