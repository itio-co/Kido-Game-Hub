import {
  chunkFile,
  mergeManifests,
  pinnedPilotVersion,
  rollbackManifest,
  uploadPlan,
  type PilotManifest,
} from '../src/lib/pilotManifest.ts';

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

const local: PilotManifest = {
  format: 1,
  modules: {
    stirfry: { current: '1.2.0', retained: ['1.2.0'], versions: { '1.2.0': { file: 'modules/stirfry/1.2.0/aaa.js', hash: 'aaa' } } },
    rhythm: { current: '1.1.1', retained: ['1.1.1'], versions: { '1.1.1': { file: 'modules/rhythm/1.1.1/bbb.js', hash: 'bbb' } } },
  },
};

test('a missing pinned version falls back; current is used when unpinned', () => {
  ok(chunkFile(local, 'stirfry', '9.9.9') === null, 'missing pin');
  ok(chunkFile(local, 'stirfry', null)?.file.endsWith('aaa.js') === true, 'current');
  ok(chunkFile(local, 'stirfry', '1.2.0')?.version === '1.2.0', 'exact');
});

test('merge keeps old chunks, refuses a rewritten hash, and uploads only new versions', () => {
  const remote: PilotManifest = {
    format: 1,
    modules: {
      stirfry: { current: '1.2.0', retained: ['1.2.0'], versions: { '1.2.0': { file: 'modules/stirfry/1.2.0/aaa.js', hash: 'aaa' } } },
    },
  };
  const next: PilotManifest = {
    format: 1,
    modules: {
      stirfry: {
        current: '1.3.0',
        retained: ['1.3.0'],
        versions: { '1.3.0': { file: 'modules/stirfry/1.3.0/ccc.js', hash: 'ccc' } },
      },
    },
  };
  const merged = mergeManifests(remote, next);
  ok(merged.errors.length === 0, merged.errors.join(','));
  ok(merged.manifest.modules.stirfry.current === '1.3.0', 'current');
  ok(merged.manifest.modules.stirfry.retained.join(',') === '1.2.0,1.3.0', merged.manifest.modules.stirfry.retained.join(','));
  const plan = uploadPlan(remote, next);
  ok(plan.upload.length === 1 && plan.upload[0].hash === 'ccc', 'only new');
  const clash = mergeManifests(remote, {
    format: 1,
    modules: {
      stirfry: { current: '1.2.0', retained: ['1.2.0'], versions: { '1.2.0': { file: 'modules/stirfry/1.2.0/zzz.js', hash: 'zzz' } } },
    },
  });
  ok(clash.errors.some((line) => line.includes('stirfry@1.2.0')), clash.errors.join(','));
  ok(clash.manifest.modules.stirfry.versions['1.2.0'].hash === 'aaa', 'old hash kept');
});

test('rollback only moves the current pointer', () => {
  const merged = mergeManifests({
    format: 1,
    modules: {
      stirfry: { current: '1.2.0', retained: ['1.2.0'], versions: { '1.2.0': { file: 'a', hash: 'a' } } },
    },
  }, {
    format: 1,
    modules: {
      stirfry: { current: '1.3.0', retained: ['1.3.0'], versions: { '1.3.0': { file: 'c', hash: 'c' } } },
    },
  }).manifest;
  const rolled = rollbackManifest(merged, 'stirfry', '1.2.0');
  ok(rolled.modules.stirfry.current === '1.2.0', 'pointer');
  ok(rolled.modules.stirfry.versions['1.3.0'].hash === 'c', 'chunk remains');
  let threw = false;
  try { rollbackManifest(merged, 'stirfry', '0.1.0'); } catch { threw = true; }
  ok(threw, 'unknown version');
});

test('share links pin a pilot version', () => {
  ok(pinnedPilotVersion('stirfry', '#/play/stirfry/hard/7/rhythm@1.1.0+stirfry@1.2.0') === '1.2.0', 'stirfry');
  ok(pinnedPilotVersion('rhythm', '#/play/stirfry/hard/7/rhythm@1.1.0+stirfry@1.2.0') === '1.1.0', 'rhythm');
  ok(pinnedPilotVersion('stirfry', '#/play/stirfry') === null, 'fresh');
});

if (failed) process.exitCode = 1;
