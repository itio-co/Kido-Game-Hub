import { classifyGodLoginError, settleLogin } from '../src/modules/god-mode/loginResult.ts';
import { nextVersionTap, unlockShowsBubble, GOD_TAP_TARGET, GOD_TAP_WINDOW_MS } from '../src/modules/god-mode/taps.ts';

declare const process: { exitCode?: number };
let failed = 0;
function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok ${name}`))
    .catch((e: Error) => {
      failed++;
      console.error(`FAIL ${name}: ${e.message}`);
    });
}
function ok(c: boolean, msg: string): void {
  if (!c) throw new Error(msg);
}

await test('eight taps inside the window unlock; a pause resets', () => {
  let clock = null as ReturnType<typeof nextVersionTap>['clock'];
  const start = 1_000;
  for (let i = 1; i < GOD_TAP_TARGET; i += 1) {
    const step = nextVersionTap(clock, start + i * 200);
    ok(!step.unlocked, `tap ${i}`);
    ok(step.hint === (i >= 5), `hint ${i}`);
    clock = step.clock;
  }
  const unlocked = nextVersionTap(clock, start + 1600);
  ok(unlocked.unlocked && unlocked.clock === null, 'eighth');
  const late = nextVersionTap({ count: 7, startedAt: start }, start + GOD_TAP_WINDOW_MS + 1);
  ok(!late.unlocked && late.count === 1, 'timeout resets');
});

await test('a valid session shows the bubble and a missing session asks for login', () => {
  ok(unlockShowsBubble(true) === true, 'logged in');
  ok(unlockShowsBubble(false) === false, 'needs login');
});

await test('login uses the God API and does not keep the password', async () => {
  let sent = '';
  const okResult = await settleLogin(async () => {
    sent = 'secret-pass';
  });
  ok(okResult.ok === true && sent === 'secret-pass', 'sent once');
  ok(!JSON.stringify(okResult).includes('secret-pass'), 'result has no password');

  const bad = await settleLogin(async () => {
    throw { code: 'bad-password', data: { attemptsLeft: 3 }, password: 'wrong-pass' };
  });
  ok(!bad.ok && bad.code === 'bad-password' && bad.attemptsLeft === 3, JSON.stringify(bad));
  ok(!JSON.stringify(bad).includes('wrong-pass'), 'error has no password');

  const locked = classifyGodLoginError({ code: 'locked', data: { retryAfterSec: 120 } });
  ok(!locked.ok && locked.code === 'locked' && locked.retryAfterSec === 120, JSON.stringify(locked));
  const missing = classifyGodLoginError({ code: 'not-configured', data: {} });
  ok(!missing.ok && missing.code === 'not-configured', JSON.stringify(missing));
});

if (failed) process.exitCode = 1;
