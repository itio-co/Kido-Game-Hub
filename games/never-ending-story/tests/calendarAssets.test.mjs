// Wall calendar overlays: `node tests/calendarAssets.test.mjs`.
// Every overlay is a 720×1280 RGBA PNG aligned with the bedroom backdrop, and
// the room data links each calendar skin to a wall design.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
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

// 0.6.29: every design hangs on the original calendar's footprint (measured on the backdrop:
// header top to page bottom incl. paper thickness) and from the same nail.
const FOOTPRINT = { x0: 251, y0: 371, x1: 354, y1: 482 };
const NAIL_TOP = { x: 301, y: 338 };
const TOL = 2;

function decodeRgba(buf) {
  let off = 8, width = 0, height = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'bit depth 8'); assert.equal(data[9], 6, 'RGBA'); assert.equal(data[12], 0, 'not interlaced');
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[dst + x - 4] : 0, b = y ? out[dst - stride + x] : 0, c = x >= 4 && y ? out[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { width, height, alpha: (x, y) => out[(y * width + x) * 4 + 3] };
}

function bodyFootprint(img) {
  // calendar body = (nearly) opaque pixels; the contact shadow stays well below 200
  const rows = new Array(img.height).fill(0);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.alpha(x, y) > 200) rows[y]++;
  const max = Math.max(...rows);
  const headerTop = rows.findIndex((n) => n >= 0.6 * max);
  const nailY = rows.findIndex((n) => n > 0);
  const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  let nx0 = Infinity, nx1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (img.alpha(x, y) <= 200) continue;
    if (y >= headerTop) { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); }
    if (y <= nailY + 4) { nx0 = Math.min(nx0, x); nx1 = Math.max(nx1, x); }
  }
  return { box, nail: { x: (nx0 + nx1) / 2, y: nailY } };
}

const shadowBoxes = [];
for (const [design, file] of Object.entries(DESIGN_OVERLAY)) {
  const img = decodeRgba(await read(`public/img/decor/${file}`));
  const { box, nail } = bodyFootprint(img);
  for (const k of Object.keys(FOOTPRINT)) {
    assert.ok(Math.abs(box[k] - FOOTPRINT[k]) <= TOL, `${design} ${k}=${box[k]} expected ${FOOTPRINT[k]}±${TOL}`);
  }
  assert.ok(Math.abs(nail.x - NAIL_TOP.x) <= TOL && Math.abs(nail.y - NAIL_TOP.y) <= TOL, `${design} nail ${JSON.stringify(nail)}`);
  // whole overlay (incl. contact shadow) lies inside the wall patch, so no old-calendar pixel can peek out
  const any = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (img.alpha(x, y) > 10) {
    any.x0 = Math.min(any.x0, x); any.x1 = Math.max(any.x1, x); any.y0 = Math.min(any.y0, y); any.y1 = Math.max(any.y1, y);
  }
  shadowBoxes.push(any);
}
// 0.6.30 edge quality (checked on a dark pink background, where the v0.6.29 colour-keyed mattes looked ragged)
function components(img, minAlpha) {
  const seen = new Uint8Array(img.width * img.height);
  let n = 0;
  for (let i = 0; i < seen.length; i++) {
    if (seen[i] || img.alpha(i % img.width, (i / img.width) | 0) <= minAlpha) continue;
    n++; const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), x = j % img.width, y = (j / img.width) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy, k = Y * img.width + X;
        if (X < 0 || Y < 0 || X >= img.width || Y >= img.height || seen[k] || img.alpha(X, Y) <= minAlpha) continue;
        seen[k] = 1; stack.push(k);
      }
    }
  }
  return n;
}
function edgeWobble(img, side) {
  // sub-pixel edge position per row/column from body coverage (shadow alpha stays below 80);
  // a straight anti-aliased edge has a near-zero second difference, stair-steps/notches do not
  const cov = (x, y) => Math.min(1, Math.max(0, (img.alpha(x, y) - 80) / 175));
  const e = [];
  if (side === 'bottom') for (let x = FOOTPRINT.x0 + 7; x < FOOTPRINT.x1 - 8; x++) { let s = 0; for (let y = 470; y < 490; y++) s += cov(x, y); e.push(s); }
  else for (let y = FOOTPRINT.y0 + 6; y < 470; y++) {
    let s = 0; const [a, b] = side === 'left' ? [FOOTPRINT.x0 - 4, FOOTPRINT.x0 + 11] : [FOOTPRINT.x1 - 9, FOOTPRINT.x1 + 6];
    for (let x = a; x < b; x++) s += cov(x, y); e.push(s);
  }
  let worst = 0;
  for (let i = 1; i < e.length - 1; i++) worst = Math.max(worst, Math.abs(e[i - 1] - 2 * e[i] + e[i + 1]));
  return worst;
}
for (const [design, file] of Object.entries(DESIGN_OVERLAY)) {
  const img = decodeRgba(await read(`public/img/decor/${file}`));
  assert.equal(components(img, 0), 1, `${design}: stray semi-transparent specks`);
  assert.equal(components(img, 200), 1, `${design}: body, rope and nail must be one solid shape`);
  for (const side of ['left', 'right', 'bottom']) {
    const w = edgeWobble(img, side);
    assert.ok(w <= 0.3, `${design} ${side} edge is ragged (wobble ${w.toFixed(2)} px)`);
  }
  // soft shadow fades to nothing: wherever the overlay meets fully transparent pixels it is already ~0
  // (a clipped/boxed shadow would end on a visible step)
  let rim = 0;
  for (let y = 1; y < img.height - 1; y++) for (let x = 1; x < img.width - 1; x++) {
    const v = img.alpha(x, y);
    if (v && (!img.alpha(x - 1, y) || !img.alpha(x + 1, y) || !img.alpha(x, y - 1) || !img.alpha(x, y + 1))) rim = Math.max(rim, v);
  }
  assert.ok(rim <= 3, `${design} overlay ends on a hard alpha step (${rim})`);
}
// all designs share one outer box (±TOL), so swapping never changes size or position
for (const b of shadowBoxes) for (const k of Object.keys(b)) assert.ok(Math.abs(b[k] - shadowBoxes[0][k]) <= TOL, `outer box ${k} differs`);
// the take-down patch covers the original footprint plus its drop shadow
const patch = decodeRgba(await read(`public/img/decor/${WALL_PATCH}`));
for (let y = FOOTPRINT.y0; y <= FOOTPRINT.y1 + 20; y++) for (let x = FOOTPRINT.x0; x <= FOOTPRINT.x1 + (y < 395 ? 8 : 12); x++) {
  assert.equal(patch.alpha(x, y), 255, `wall patch opaque at ${x},${y}`);
}

console.log('calendarAssets: ok');
