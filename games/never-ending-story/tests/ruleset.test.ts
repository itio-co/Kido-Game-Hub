// Ruleset pins on share links: canonical key, versionless legacy, unsupported versions.
import { canonicalRuleset, parseRuleset, resolveRuleset, supportedKeys, type ModuleRules } from '../src/modules/minigame-core/ruleset.ts';

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

const stirfry: ModuleRules[] = [
  { id: 'rhythm', versions: ['1.1.0', '1.2.0'], current: '1.2.0', legacy: '1.1.0' },
  { id: 'stirfry', versions: ['1.2.0'], current: '1.2.0', legacy: '1.2.0' },
];

test('canonical key sorts module ids and ignores input order', () => {
  const a = canonicalRuleset([{ id: 'stirfry', version: '1.2.0' }, { id: 'rhythm', version: '1.1.0' }]);
  const b = canonicalRuleset([{ id: 'rhythm', version: '1.1.0' }, { id: 'stirfry', version: '1.2.0' }]);
  ok(a === 'rhythm@1.1.0+stirfry@1.2.0', a);
  ok(a === b, 'order');
});

test('parse rejects junk, duplicates, and spaces', () => {
  ok(parseRuleset('rhythm@1.1.0+stirfry@1.2.0')?.length === 2, 'pair');
  ok(parseRuleset('rhythm@1.1.0+rhythm@1.2.0') === null, 'dup');
  ok(parseRuleset('rhythm@1.1') === null, 'short');
  ok(parseRuleset('Rhythm@1.1.0') === null, 'case');
  ok(parseRuleset('rhythm@1.1.0 stirfry@1.2.0') === null, 'space');
});

test('versionless link is the legacy ruleset, not the current one', () => {
  const res = resolveRuleset(stirfry, null);
  ok(res.ok && res.legacy && res.key === 'rhythm@1.1.0+stirfry@1.2.0', JSON.stringify(res));
});

test('a supported pin plays that version; a missing one is rejected', () => {
  const okRes = resolveRuleset(stirfry, 'stirfry@1.2.0+rhythm@1.2.0');
  ok(okRes.ok && okRes.key === 'rhythm@1.2.0+stirfry@1.2.0', JSON.stringify(okRes));
  const bad = resolveRuleset(stirfry, 'rhythm@9.9.9+stirfry@1.2.0');
  ok(!bad.ok && bad.currentKey === 'rhythm@1.2.0+stirfry@1.2.0', JSON.stringify(bad));
  const extra = resolveRuleset(stirfry, 'rhythm@1.1.0');
  ok(!extra.ok, 'missing pack');
});

test('supported keys are the cartesian product', () => {
  const keys = supportedKeys(stirfry);
  ok(keys.length === 2, keys.join(','));
  ok(keys.includes('rhythm@1.1.0+stirfry@1.2.0') && keys.includes('rhythm@1.2.0+stirfry@1.2.0'), keys.join(','));
});

if (failed) process.exitCode = 1;
