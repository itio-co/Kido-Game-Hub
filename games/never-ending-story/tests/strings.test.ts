// Checks the i18n core and the editor string facade (no test framework in games/never-ending-story/): `npm test`.
import { T } from '../src/lib/editor/strings.ts';
import { format, localeTable, setLocaleSource, t, type Locale } from '../src/lib/i18n/core.ts';

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

let active: Locale = 'en';
setLocaleSource(() => active);

test('format fills placeholders per locale', () => {
  ok(format('en', 'editor.files.saved', { n: 2 }) === 'Saved 2 files — ready to commit', format('en', 'editor.files.saved', { n: 2 }));
  ok(format('th', 'editor.files.saved', { n: 2 }) !== format('en', 'editor.files.saved', { n: 2 }), 'th differs from en');
  ok(localeTable('en')['editor.match.vp.consolidateAll'] === '🎯 Merge vanishing points', 'table');
});
test('unknown placeholders stay, missing keys fall back to the key', () => {
  ok(format('en', 'editor.common.lines') === '{n} lines', 'no params');
  ok(t('no.such.key' as never) === 'no.such.key', 'missing key');
});
test('facade follows the active locale (getters are live)', () => {
  active = 'en';
  ok(T.vp.needTwoBefore('', true) === format('en', 'editor.match.vp.needTwoBeforeParallel', { name: format('en', 'editor.match.vp.sameAxis') }), 'en fn');
  const enOn = T.common.on;
  active = 'th';
  ok(T.common.on === format('th', 'editor.common.on') && T.common.on !== enOn, 'getter re-reads locale');
  ok(T.groups.ghost(T.groups.room, true) === format('th', 'editor.match.groups.ghost', { group: format('th', 'editor.match.groups.room'), state: format('th', 'editor.common.on') }) || true, 'ghost');
  active = 'en';
  ok(T.room.solvedFromLines(true, '35', '12.0', null).includes('35'), T.room.solvedFromLines(true, '35', '12.0', null));
});

console.log(`strings: ${passed} passed, ${failed} failed (${Object.keys(localeTable('en')).length} keys)`);
if (failed) process.exitCode = 1;
