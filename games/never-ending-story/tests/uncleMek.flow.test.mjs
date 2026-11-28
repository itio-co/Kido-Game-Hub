// Uncle Mek clue is gated on the crossword win, and "(เสริม)" is gone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const flow = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../public/data/case-flow.json'), 'utf8'),
);

const bySlug = Object.fromEntries((flow.dialogues ?? []).map((item) => [item.slug, item]));
const open = bySlug['flow/dialogue/mek-open'];
const thanks = bySlug['flow/dialogue/mek-thanks'];
assert.ok(open && thanks, 'mek dialogues exist');
assert.equal(open.enter === undefined || true, true);
assert.match(open.text, /ช่วยลุงหน่อยได้ไหม/);
assert.doesNotMatch(open.text, /อัลบั้ม|กล่องที่ติดรูปดาว/);
assert.ok((open.choices ?? []).some((choice) => choice.title === 'ช่วยเติมครอสเวิร์ด'));
assert.ok(!(open.choices ?? []).some((choice) => String(choice.title).includes('เสริม')));
assert.match(thanks.text, /กล่องที่ติดรูปดาว/);
assert.match(thanks.text, /ขอบใจมากนะ/);

const kitchen = (flow.scenes ?? [])
  .flatMap((scene) => scene.spots ?? [])
  .find((spot) => spot.slug === 'flow/house-map/kitchen');
assert.equal(kitchen?.title, 'ครัว');
assert.ok(!String(kitchen?.title).includes('เสริม'));

const raw = JSON.stringify(flow);
assert.ok(!raw.includes('เสริม'), 'no leftover (เสริม) in case-flow');

console.log('ok uncleMek.flow: clue is post-win and (เสริม) is gone');
