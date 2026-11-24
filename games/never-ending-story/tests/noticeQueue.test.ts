import { enqueueNotice, flushNotice } from '../src/modules/event-core/noticeQueue.ts';

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

test('a notice waits until the dialog or note is closed', () => {
  const queued = enqueueNotice(true, [], 'ได้หลักฐาน E01');
  ok(queued.show === null && queued.pending[0] === 'ได้หลักฐาน E01', JSON.stringify(queued));
  const still = flushNotice(true, queued.pending);
  ok(still.show === null && still.pending.length === 1, 'still open');
  const after = flushNotice(false, queued.pending);
  ok(after.show === 'ได้หลักฐาน E01' && after.pending.length === 0, JSON.stringify(after));
});

test('with no dialog open the notice shows immediately', () => {
  const next = enqueueNotice(false, [], 'ใช้พลังย้อนเวลาได้ที่นาฬิกา');
  ok(next.show === 'ใช้พลังย้อนเวลาได้ที่นาฬิกา' && next.pending.length === 0, JSON.stringify(next));
});

if (failed) process.exitCode = 1;
