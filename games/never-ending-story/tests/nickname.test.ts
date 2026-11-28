import { EN_NICKNAMES, NICK_MAX, NICK_MIN, TH_NICKNAMES, cleanNickname, nicknameError, randomNickname } from '../src/lib/nickname.ts';

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

test('lists are large, unique, and all valid everyday names', () => {
  for (const [locale, list] of [['th', TH_NICKNAMES], ['en', EN_NICKNAMES]] as const) {
    ok(list.length >= 100, `${locale} list too small: ${list.length}`);
    ok(new Set(list).size === list.length, `${locale} list has duplicates`);
    for (const name of list) {
      ok(nicknameError(name) === null, `${locale} invalid name ${name}: ${nicknameError(name)}`);
    }
  }
});

test('validation: trim, empty, length, charset', () => {
  ok(cleanNickname('  ต้น   แบงค์  ') === 'ต้น แบงค์', 'collapse spaces');
  ok(nicknameError('') === 'prologue.name.errShort', 'empty');
  ok(nicknameError(' ') === 'prologue.name.errShort', 'blank');
  ok(nicknameError('ก') === 'prologue.name.errShort', 'one char');
  ok(nicknameError('ab') === null, 'two latin');
  ok(nicknameError('ต้น') === null, 'thai nick');
  ok(nicknameError('x'.repeat(NICK_MAX)) === null, 'at max');
  ok(nicknameError('x'.repeat(NICK_MAX + 1)) === 'prologue.name.errLong', 'over max');
  ok(NICK_MIN === 2 && NICK_MAX === 20, 'limits');
  ok(nicknameError('hi!') === 'prologue.name.errChars', 'bang');
  ok(nicknameError('Ann_Lee') === null, 'underscore');
  ok(nicknameError('Ann-Lee') === null, 'hyphen');
  ok(nicknameError('Ann.Lee') === null, 'dot');
});

test('randomNickname picks from the locale list and can avoid the current name', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 80; i++) {
    const n = randomNickname('th', { random: () => (i + 0.5) / 80 });
    ok(TH_NICKNAMES.includes(n), `th pick ${n}`);
    seen.add(n);
  }
  ok(seen.size >= 40, `expected variety, got ${seen.size}`);
  const avoid = TH_NICKNAMES[0]!;
  for (let i = 0; i < 40; i++) {
    const n = randomNickname('th', { avoid, random: () => (i + 0.1) / 40 });
    ok(n !== avoid, `avoided ${avoid} but got it back`);
    ok(TH_NICKNAMES.includes(n), `avoid pick ${n}`);
  }
  const en = randomNickname('en', { random: () => 0 });
  ok(EN_NICKNAMES.includes(en), `en pick ${en}`);
});

console.log(`nickname: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
