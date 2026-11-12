import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bumpBuildNumber, readBuildNumber, writeBuildNumber } from '../scripts/buildNumber.mjs';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

test('the build number only goes up', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nes-build-'));
  writeBuildNumber(4, root);
  ok(bumpBuildNumber(root) === 5, 'first');
  ok(bumpBuildNumber(root) === 6, 'second');
  ok(readBuildNumber(root) === 6, 'stored');
  fs.rmSync(root, { recursive: true });
});

if (failed) process.exitCode = 1;
