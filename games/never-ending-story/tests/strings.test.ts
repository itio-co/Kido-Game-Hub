// Checks the i18n-ready string table (no test framework in games/never-ending-story/): `npm test` in games/never-ending-story/.
import { MESSAGES, T, format, localeTable, type MessageKey } from '../src/lib/editor/strings.ts';

declare const process: { exitCode?: number };
let failed = 0;
let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}
const holes = (s: string): string => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const THAI = /[\u0E00-\u0E7F]/;

test('keys are dotted English and every entry has en + th', () => {
  for (const k of Object.keys(MESSAGES) as MessageKey[]) {
    ok(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/.test(k), `bad key ${k}`);
    const m = MESSAGES[k];
    ok(typeof m.en === 'string' && m.en.length > 0 && typeof m.th === 'string' && m.th.length > 0, `missing value ${k}`);
    ok(!THAI.test(m.en), `Thai in en value ${k}`);
  }
});
test('placeholders match between locales', () => {
  for (const k of Object.keys(MESSAGES) as MessageKey[]) {
    ok(holes(MESSAGES[k].en) === holes(MESSAGES[k].th), `placeholders differ ${k}`);
  }
});
test('format fills placeholders; localeTable is flat', () => {
  ok(format('en', 'editor.files.saved', { n: 2 }) === 'Saved 2 files — ready to commit', format('en', 'editor.files.saved', { n: 2 }));
  ok(format('th', 'editor.files.saved', { n: 2 }) === 'บันทึกลงไฟล์แล้ว 2 ไฟล์ — commit ได้เลย', 'th saved');
  const en = localeTable('en');
  ok(Object.keys(en).length === Object.keys(MESSAGES).length && en['cameraMatch.vp.consolidateAll'] === '🎯 Merge vanishing points', 'table');
});
test('facade renders the current (Thai) text unchanged', () => {
  ok(T.room.solvedFromLines(true, '35', '12.0', null) === 'คำนวณจากเส้นแล้ว (วัตถุ+ห้อง) · เลนส์ 35 มม. · วัตถุหมุน 12.0°', T.room.solvedFromLines(true, '35', '12.0', null));
  ok(T.vp.needTwoBefore('', true) === 'ต้องมีอย่างน้อย 2 เส้นในแกนเดียวกัน ก่อนทำให้ขนาน', T.vp.needTwoBefore('', true));
  ok(T.vp.madeParallel(T.vp.axisName(2), 3) === 'ทำให้เส้น แกน Z ขนานกันแล้ว · ปรับ 3 เส้นตามทิศเฉลี่ย (จุดลับตาที่ ∞)', 'madeParallel');
  ok(T.groups.ghost(T.groups.room, true) === '👻 เส้นห้องจาง ๆ เปิด', T.groups.ghost(T.groups.room, true));
});

console.log(`strings: ${passed} passed, ${failed} failed (${Object.keys(MESSAGES).length} keys)`);
if (failed) process.exitCode = 1;
