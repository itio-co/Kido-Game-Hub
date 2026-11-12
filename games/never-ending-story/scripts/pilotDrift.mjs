/** Source hashes for the rhythm/stirfry pilot, and the version-bump rules. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PILOT_IDS = ['rhythm', 'stirfry'];
const CODE = /\.(ts|svelte|js|mjs|css|json)$/;

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.name === 'GDD.md') return [];
    return CODE.test(entry.name) ? [full] : [];
  });
}

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.svelte`, `${base}.js`, `${base}.mjs`, `${base}.json`, `${base}.css`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Module files plus the relative imports they pull in (deps). `module.json` `version` is not part of the hash. */
export function sourceFiles(id, root = ROOT) {
  const dir = path.join(root, 'src/modules', id);
  const seen = new Set();
  const queue = walk(dir);
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    seen.add(file);
    if (!CODE.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/(?:from|import)\s*(?:[^'";]*?from\s*)?['"](\.[^'"]+)['"]/g)) {
      const next = resolveImport(file, match[1]);
      if (!next || seen.has(next)) continue;
      const rel = path.relative(root, next).split(path.sep).join('/');
      if (rel === 'package.json' || rel.startsWith('src/locales/')) continue;
      queue.push(next);
    }
  }
  return [...seen].sort();
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sourceHash(id, root = ROOT) {
  const hash = createHash('sha256');
  for (const file of sourceFiles(id, root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    hash.update(rel);
    hash.update('\0');
    if (rel.endsWith('/module.json')) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      delete data.version;
      hash.update(stable(data));
    } else {
      hash.update(fs.readFileSync(file));
    }
    hash.update('\0');
  }
  return hash.digest('hex');
}

function cmp(a, b) {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/**
 * @returns {string[]} human-readable failures. Empty means this version matches its recorded source.
 * A missing record for a new version is a failure until pilot-manifest.json records a different source hash.
 */
export function driftErrors(id, version, hash, recorded) {
  const versions = recorded?.versions ?? {};
  const saved = versions[version];
  if (!saved) {
    const previous = Object.keys(versions).filter((item) => cmp(item, version) < 0).sort(cmp).at(-1);
    if (previous && versions[previous].sourceHash === hash) {
      return [`${id}@${version} was bumped with no content change from ${previous}`];
    }
    return [`${id}@${version} is not recorded in pilot-manifest.json`];
  }
  if (saved.sourceHash !== hash) {
    return [`${id} content changed but version is still ${version}`];
  }
  const same = Object.keys(versions).filter((item) => item !== version && versions[item].sourceHash === hash && cmp(version, item) > 0);
  if (recorded.current === version && same.length) {
    return [`${id}@${version} was bumped with no content change from ${same.sort(cmp).at(-1)}`];
  }
  return [];
}

/** Current version is a real change when an older recorded version has a different source hash. */
export function versionChanged(recorded) {
  if (!recorded?.current || !recorded.versions?.[recorded.current]) return false;
  const previous = Object.keys(recorded.versions).filter((item) => cmp(item, recorded.current) < 0).sort(cmp).at(-1);
  if (!previous) return false;
  return recorded.versions[previous].sourceHash !== recorded.versions[recorded.current].sourceHash;
}

export function readPilotManifest(root = ROOT) {
  const file = path.join(root, 'pilot-manifest.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function checkPilotManifest(root = ROOT) {
  const manifest = readPilotManifest(root);
  const errors = [];
  for (const id of PILOT_IDS) {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'src/modules', id, 'module.json'), 'utf8')).version;
    errors.push(...driftErrors(id, version, sourceHash(id, root), manifest.modules?.[id]));
  }
  return errors;
}
