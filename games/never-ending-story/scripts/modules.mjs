// Modular-monolith tooling: module registry + import-boundary check.
// Usage: node scripts/modules.mjs check | registry [outFile]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'src/modules');
const SRC_EXT = /\.(ts|mts|js|mjs|svelte|json)$/;

const walk = (dir) => fs.existsSync(dir)
  ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
  : [];

export function readManifests() {
  return fs.readdirSync(MODULES).filter((d) => fs.existsSync(path.join(MODULES, d, 'module.json')))
    .map((d) => ({ dir: path.join(MODULES, d), ...JSON.parse(fs.readFileSync(path.join(MODULES, d, 'module.json'), 'utf8')) }));
}

/** Which module owns a file: the src/modules/<id>/ folder, else "core". */
function ownerOf(file) {
  const rel = path.relative(MODULES, file);
  return rel.startsWith('..') ? 'core' : rel.split(path.sep)[0];
}

function filesOf(mod) {
  if (mod.id !== 'core') return walk(mod.dir).filter((f) => SRC_EXT.test(f));
  return [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'worker'))].filter((f) => SRC_EXT.test(f) && ownerOf(f) === 'core');
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.svelte`, `${base}.mjs`, `${base}.js`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return base;
}

/** Cross-module imports must target a public entry listed in the target's module.json. */
export function checkBoundaries(mods = readManifests()) {
  const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
  const errors = [];
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'worker'))].filter((f) => /\.(ts|svelte|mjs|js)$/.test(f));
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      const target = resolveImport(file, m[1] ?? m[2]);
      if (!target) continue;
      const from = ownerOf(file);
      const to = ownerOf(target);
      if (to === 'core' || to === from) continue;
      const mod = byId[to];
      const publicFiles = (mod?.publicEntries ?? [mod?.entry]).map((e) => path.join(ROOT, e));
      if (!publicFiles.includes(target)) {
        errors.push(`${path.relative(ROOT, file)} imports ${m[1] ?? m[2]} (internal file of module "${to}"; use its public entry)`);
      }
    }
  }
  return errors;
}

const parse = (v) => String(v).split('-')[0].split('.').map((n) => Number(n) || 0);
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
/** Minimal semver ranges: exact, ^x.y.z, ~x.y.z, >=x.y.z (space-separated = AND). */
export function satisfies(version, range) {
  const v = parse(version);
  return range.trim().split(/\s+/).every((r) => {
    if (r === '*' ) return true;
    if (r.startsWith('>=')) return cmp(v, parse(r.slice(2))) >= 0;
    if (r.startsWith('^')) { const b = parse(r.slice(1)); return cmp(v, b) >= 0 && (b[0] > 0 ? v[0] === b[0] : v[1] === b[1]); }
    if (r.startsWith('~')) { const b = parse(r.slice(1)); return cmp(v, b) >= 0 && v[0] === b[0] && v[1] === b[1]; }
    return cmp(v, parse(r)) === 0;
  });
}

function lastCommit(files) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%H%x09%cI%x09%s', '--', ...files.map((f) => path.relative(ROOT, f))], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (!out) return null;
    const [sha, date, subject] = out.split('\t');
    return { sha, date, subject };
  } catch { return null; }
}

export function buildRegistry() {
  const appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const mods = readManifests().map((m) => ({ ...m, version: m.version === 'app' ? appVersion : m.version }));
  const versions = Object.fromEntries(mods.map((m) => [m.id, m.version]));
  const modules = mods.map((m) => {
    const files = filesOf(m).sort();
    const hash = createHash('sha256');
    let size = 0;
    for (const f of files) { const b = fs.readFileSync(f); size += b.length; hash.update(path.relative(ROOT, f)).update(b); }
    return {
      id: m.id, name: m.name, kind: m.kind, version: m.version, description: m.description, entry: m.entry,
      dependsOn: Object.entries(m.dependsOn ?? {}).map(([id, range]) => ({ id, range, version: versions[id] ?? null, ok: !!versions[id] && satisfies(versions[id], range) })),
      files: files.length, size, hash: hash.digest('hex').slice(0, 12), lastCommit: lastCommit(files),
    };
  });
  return { appVersion, generatedAt: new Date().toISOString(), modules };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2] ?? 'check';
  if (cmd === 'check') {
    const errors = checkBoundaries();
    const reg = buildRegistry();
    for (const m of reg.modules) for (const d of m.dependsOn) if (!d.ok) errors.push(`${m.id} needs ${d.id} ${d.range}, found ${d.version}`);
    if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
    console.log(`modules ok: ${reg.modules.map((m) => `${m.id}@${m.version}`).join(', ')}`);
  } else if (cmd === 'registry') {
    const out = process.argv[3] ?? 'dist/modules.json';
    fs.writeFileSync(path.resolve(ROOT, out), JSON.stringify(buildRegistry(), null, 2));
    console.log(`wrote ${out}`);
  }
}
