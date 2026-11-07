// i18n guard: no Thai outside the locale files, key parity between locales,
// matching {param} placeholders, and no unused keys.
// Run: node tests/i18n.test.mjs (part of `npm test`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const THAI = /[\u0E00-\u0E7F]/;
const CODE = /\.(ts|svelte|js|mjs)$/;
const failures = [];

function walk(dir, pick) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, pick));
    else if (pick(path)) out.push(path);
  }
  return out;
}

// 1. No Thai characters in code (src/, scripts/, tests/). Thai lives only in src/locales/*.json.
const codeFiles = [
  ...walk(join(root, 'src'), (path) => CODE.test(path)),
  ...walk(join(root, 'scripts'), (path) => !path.endsWith('.json')),
  ...walk(join(root, 'tests'), (path) => CODE.test(path)),
];
for (const file of codeFiles) {
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (THAI.test(line)) failures.push(`Thai text in ${relative(root, file)}:${index + 1}: ${line.trim().slice(0, 80)}`);
  });
}

// 2. Key parity and placeholder parity for every locale pair.
const load = (name) => JSON.parse(readFileSync(join(root, 'src/locales', name), 'utf8'));
const params = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const KEY = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const pairs = [
  ['en.json', 'th.json'],
  ['story.en.json', 'story.th.json'],
];
for (const [enName, thName] of pairs) {
  const en = load(enName);
  const th = load(thName);
  for (const key of Object.keys(en)) {
    if (!(key in th)) failures.push(`${thName} is missing key ${key}`);
    if (!KEY.test(key)) failures.push(`${enName}: key ${key} is not a dotted English key`);
  }
  for (const key of Object.keys(th)) if (!(key in en)) failures.push(`${enName} is missing key ${key}`);
  for (const [key, value] of Object.entries(en)) {
    if (typeof value !== 'string' || value === '') failures.push(`${enName}: ${key} must be a non-empty string`);
    else if (THAI.test(value) && !key.startsWith('locale.name.')) failures.push(`${enName}: ${key} contains Thai`);
    if (typeof th[key] === 'string' && params(value) !== params(th[key])) {
      failures.push(`${key}: placeholders differ (${enName}: {${params(value)}}, ${thName}: {${params(th[key])}})`);
    }
  }
}

// 3. No unused keys. A key counts as used when it appears as a quoted literal in code, or when it starts
//    with a template prefix such as `game.difficulty.${id}`.
const sources = codeFiles.filter((file) => !file.includes(`${join(root, 'tests')}`)).map((file) => readFileSync(file, 'utf8')).join('\n');
const prefixes = [...sources.matchAll(/`([a-z][\w.]*\.)\$\{/g)].map((m) => m[1]);
const used = (key) => sources.includes(`'${key}'`) || sources.includes(`"${key}"`) || prefixes.some((prefix) => key.startsWith(prefix));
for (const name of ['en.json', 'story.en.json']) {
  for (const key of Object.keys(load(name))) if (!used(key)) failures.push(`${name}: unused key ${key}`);
}

if (failures.length) {
  console.error(`i18n guard: ${failures.length} problem(s)\n` + failures.map((line) => `  ${line}`).join('\n'));
  process.exit(1);
}
console.log(`i18n guard: OK (${codeFiles.length} code files, ${Object.keys(load('en.json')).length} UI keys, ${Object.keys(load('story.en.json')).length} story keys)`);
