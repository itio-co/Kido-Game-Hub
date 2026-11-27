// Contract check against the authored case-flow.json (not typechecked by tsc).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flow = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/data/case-flow.json'), 'utf8'),
);

const catalog = (flow.evidence ?? []).map((item) => item.code);
assert.deepEqual([...catalog].sort(), ['E01', 'E02', 'E03', 'E04', 'E06']);
assert.equal(flow.calendarTravel, false);

const afternoon = flow.slots.find((item) => item.slot === 'afternoon');
const yesterday = flow.slots.find((item) => item.slot === 'yesterday');
assert.ok(afternoon && afternoon.part === 'hour');
assert.deepEqual([...(afternoon.unlockBy ?? [])].sort(), ['E01', 'E06']);
assert.equal(yesterday?.part, 'day');

const spots = flow.scenes.flatMap((scene) => (scene.spots ?? []).map((spot) => ({ scene: scene.slug, ...spot })));
const grants = (code) => spots.filter((spot) => spot.action?.evidence === code);

const e02 = grants('E02');
assert.ok(e02.length > 0, 'has E02 sources');
assert.ok(e02.every((spot) => spot.when === 'afternoon' && spot.scene === 'flow/scene/living-room'));
assert.ok(e02.some((spot) => String(spot.slug).includes('rin')), 'Rin spill grants E02');

const table = spots.filter((spot) => spot.scene === 'flow/scene/table');
assert.equal(table.length, 1);
assert.equal(table[0].slug, 'flow/table/note');
assert.equal(table[0].action?.type, 'inspect-note');
assert.equal(table[0].action?.evidence, 'E01');

const kitchen = grants('E06');
assert.ok(kitchen.length >= 2 && kitchen.every((spot) => spot.scene === 'flow/scene/kitchen-close'));
assert.ok(kitchen.every((spot) => spot.when === 'now'), 'E06 close-up spots are present-day only');

const kitchenWide = flow.scenes.find((scene) => scene.screen === 'kitchen');
assert.ok(kitchenWide.images.now === 'kitchen-wide.jpg');
assert.ok(kitchenWide.images.afternoon === 'kitchen-wide-past.jpg');
assert.ok(kitchenWide.images.yesterday === 'kitchen-wide-past.jpg');
assert.ok((kitchenWide.spots ?? []).every((spot) => spot.when === 'now'), 'vase and towel hidden in the past');

const door = spots.find((spot) => spot.slug === 'flow/living-room/kitchen-door');
assert.equal(door.when, 'always', 'kitchen door works in every time slot');

const why = flow.questions.find((item) => item.slug === 'flow/question/why');
assert.deepEqual([...(why?.evidence ?? [])].sort(), ['E02', 'E06']);

console.log('ok rewindPower.flow: case-flow contracts hold');
