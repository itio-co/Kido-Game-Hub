import { driftErrors, versionChanged } from '../scripts/pilotDrift.mjs';

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

const recorded = {
  current: '1.1.1',
  retained: ['1.1.1'],
  versions: { '1.1.1': { sourceHash: 'aaa', file: 'a', hash: 'a' } },
};

test('unchanged source matches the recorded version', () => {
  ok(driftErrors('rhythm', '1.1.1', 'aaa', recorded).length === 0, 'clean');
  ok(versionChanged(recorded) === false, 'single version is not a change');
});

test('content change without a version bump fails', () => {
  const errors = driftErrors('rhythm', '1.1.1', 'bbb', recorded);
  ok(errors.some((line) => line.includes('content changed') && line.includes('1.1.1')), errors.join(','));
});

test('a version bump with the same source hash fails', () => {
  const errors = driftErrors('rhythm', '1.2.0', 'aaa', recorded);
  ok(errors.some((line) => line.includes('no content change')), errors.join(','));
  const stamped = {
    current: '1.2.0',
    versions: {
      '1.1.1': { sourceHash: 'aaa', file: 'a', hash: 'a' },
      '1.2.0': { sourceHash: 'aaa', file: 'b', hash: 'b' },
    },
  };
  ok(driftErrors('rhythm', '1.2.0', 'aaa', stamped).some((line) => line.includes('no content change')), 'recorded copy');
});

test('a real version bump is recorded and is the only deploy change', () => {
  const stamped = {
    current: '1.2.0',
    versions: {
      '1.1.1': { sourceHash: 'aaa', file: 'a', hash: 'a' },
      '1.2.0': { sourceHash: 'ccc', file: 'c', hash: 'c' },
    },
  };
  ok(driftErrors('rhythm', '1.2.0', 'ccc', stamped).length === 0, 'ok');
  ok(versionChanged(stamped) === true, 'changed');
  ok(versionChanged({ current: '1.1.1', versions: stamped.versions }) === false, 'older current');
});

if (failed) process.exitCode = 1;
