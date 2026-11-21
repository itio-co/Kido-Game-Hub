// Wall calendar overlays: `node tests/calendarAssets.test.mjs`.
// Every overlay is a 720×1280 RGBA PNG aligned with the bedroom backdrop, and
// the room data links each calendar skin to a wall design.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DESIGN_OVERLAY, WALL_PATCH, CALENDAR_STATES } from '../src/lib/calendarDecor.ts';

const base = new URL('../', import.meta.url);
const read = (path) => fs.readFile(new URL(path, base));

async function pngHeader(path) {
  const buf = await read(path);
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${path} is a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

const room = JSON.parse(await read('public/data/player-room.json'));
const backdrop = room.backdrop;
assert.equal(backdrop, 'player-room-wide.jpg');

for (const file of [WALL_PATCH, ...Object.values(DESIGN_OVERLAY)]) {
  const head = await pngHeader(`public/img/decor/${file}`);
  assert.deepEqual([head.width, head.height], [720, 1280], `${file} matches backdrop size`);
  assert.equal(head.colorType, 6, `${file} is RGBA`);
}

const calendar = room.objects.find((obj) => obj.kind === 'calendar');
const walls = calendar.themes.map((theme) => theme.wall);
for (const design of CALENDAR_STATES.filter((state) => state !== 'none')) {
  assert.equal(walls.filter((wall) => wall === design).length, 1, `exactly one skin for ${design}`);
}
const night = calendar.themes.find((theme) => theme.wall === 'night-sky');
assert.equal(night.unlock?.afterCase, 'case-01', 'night-sky skin stays locked until case-01');
const garden = calendar.themes.find((theme) => theme.wall === 'garden');
assert.ok(garden && garden.unlock === null && garden.slug === 'player-room/calendar/theme/garden', 'garden skin');
const ids = calendar.themes.map((theme) => theme.id);
assert.equal(new Set(ids).size, ids.length, 'theme ids unique');

console.log('calendarAssets: ok');
