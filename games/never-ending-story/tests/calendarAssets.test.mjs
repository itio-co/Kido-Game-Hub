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

// Change-calendar menu starts collapsed each time the panel opens (0.6.27).
const panel = (await read('src/components/CalendarPanel.svelte')).toString();
assert.match(panel, /let changeOpen = \$state\(false\)/, 'menu starts collapsed');
assert.match(panel, /aria-expanded=\{changeOpen\}/, 'toggle exposes aria-expanded');
assert.match(panel, /data-testid="calendar-change-toggle"/, 'toggle test id');
assert.match(panel, /data-testid="calendar-change"/, 'section test id kept');
assert.match(panel, /\{#if changeOpen\}[\s\S]*calendar\.takeDown[\s\S]*\{\/if\}/, 'options and take-down live inside the collapsible part');
// 0.6.28: the close bar lives outside the scrolling body so it cannot cover the take-down button.
const bodyStart = panel.indexOf('data-testid="calendar-scroll"');
const footStart = panel.indexOf('class="sheet-foot"');
assert.ok(bodyStart > 0 && footStart > bodyStart, 'scroll body then foot');
assert.ok(panel.indexOf('calendar.takeDown') > bodyStart && panel.indexOf('calendar.takeDown') < footStart, 'take-down is inside the scroll body');
assert.ok(panel.indexOf("t('calendar.close')") > footStart, 'close button is in the foot, outside the scroll body');
for (const locale of ['th', 'en']) {
  const table = JSON.parse(await read(`src/locales/${locale}.json`));
  for (const key of ['calendar.change', 'calendar.downShort', 'calendar.takeDown', 'calendar.hangBack', 'calendar.downNote']) {
    assert.ok(table[key], `${locale} ${key}`);
  }
}

console.log('calendarAssets: ok');
