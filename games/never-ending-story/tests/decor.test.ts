import {
  DECOR_PHOTO,
  DECOR_PHOTO_LEGACY,
  KEEPSAKE_SHELF_ID,
  isGrandpaPhoto,
  normalizeDecor,
} from '../src/lib/decor.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

const BED = '517cf056-55dc-4981-80d0-3e34a326dd3f';
const RUG = 'd49d729b-1f63-42c2-8e9b-bee5e4d5e896';

test('isGrandpaPhoto accepts the new label, the legacy ตา label, and album-photo', () => {
  ok(isGrandpaPhoto(DECOR_PHOTO), 'new');
  ok(isGrandpaPhoto(DECOR_PHOTO_LEGACY), 'legacy');
  ok(isGrandpaPhoto('album-photo'), 'id');
  ok(!isGrandpaPhoto(null), 'null');
  ok(!isGrandpaPhoto('lamp'), 'other');
});

test('empty decor is unchanged', () => {
  const report = normalizeDecor({});
  ok(!report.changed && report.violations.length === 0, 'clean');
});

test('a photo already on the keepsake shelf with the new label is unchanged', () => {
  const report = normalizeDecor({ [KEEPSAKE_SHELF_ID]: DECOR_PHOTO });
  ok(!report.changed && report.violations.length === 0, 'clean');
  ok(report.decor[KEEPSAKE_SHELF_ID] === DECOR_PHOTO, 'kept');
});

test('a legacy ตา label on the keepsake shelf is rewritten to ปู่', () => {
  const report = normalizeDecor({ [KEEPSAKE_SHELF_ID]: DECOR_PHOTO_LEGACY });
  ok(report.changed, 'changed');
  ok(report.violations.length === 0, 'no move');
  ok(report.decor[KEEPSAKE_SHELF_ID] === DECOR_PHOTO, 'rewritten');
});

test('a photo on another slot moves to the keepsake shelf and records photo-off-shelf', () => {
  const report = normalizeDecor({ [BED]: DECOR_PHOTO_LEGACY });
  ok(report.changed, 'changed');
  ok(report.violations.map((item) => item.code).join() === 'photo-off-shelf', 'code');
  ok(report.violations[0].detail === BED, 'from');
  ok(report.decor[BED] === null, 'cleared');
  ok(report.decor[KEEPSAKE_SHELF_ID] === DECOR_PHOTO, 'shelf');
});

test('copies on several slots collapse onto the keepsake shelf', () => {
  const report = normalizeDecor({
    [BED]: DECOR_PHOTO_LEGACY,
    [RUG]: DECOR_PHOTO,
    [KEEPSAKE_SHELF_ID]: DECOR_PHOTO_LEGACY,
  });
  ok(report.changed, 'changed');
  ok(report.violations.some((item) => item.code === 'photo-off-shelf'), 'code');
  ok(report.decor[BED] === null && report.decor[RUG] === null, 'cleared');
  ok(report.decor[KEEPSAKE_SHELF_ID] === DECOR_PHOTO, 'shelf');
});

console.log(failed ? `decor: ${failed} failed` : 'decor: all passed');
if (failed) process.exitCode = 1;
