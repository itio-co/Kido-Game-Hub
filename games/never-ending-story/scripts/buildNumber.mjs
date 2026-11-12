/** Monotonic app build number. Each build and each real deploy adds one. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildFile(root = ROOT) {
  return path.join(root, 'build.json');
}

export function readBuildNumber(root = ROOT) {
  const data = JSON.parse(fs.readFileSync(buildFile(root), 'utf8'));
  const number = Number(data.number);
  if (!Number.isInteger(number) || number < 0) throw new Error('build.json number must be a non-negative integer');
  return number;
}

export function writeBuildNumber(number, root = ROOT) {
  if (!Number.isInteger(number) || number < 0) throw new Error('build number must be a non-negative integer');
  fs.writeFileSync(buildFile(root), `${JSON.stringify({ number }, null, 2)}\n`);
  return number;
}

export function bumpBuildNumber(root = ROOT) {
  return writeBuildNumber(readBuildNumber(root) + 1, root);
}
