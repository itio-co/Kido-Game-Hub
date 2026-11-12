/**
 * Upload only new rhythm/stirfry version chunks, then point modules/manifest.json at them.
 * Default is a dry run. Pass --apply to talk to Cloudflare. This file never deletes a key.
 *
 *   node --experimental-strip-types scripts/module-deploy.ts upload --space dev
 *   node --experimental-strip-types scripts/module-deploy.ts upload --space prod --apply
 *   node --experimental-strip-types scripts/module-deploy.ts rollback --space dev --module stirfry --version 1.2.0 --apply
 *
 * Spaces use the KV namespaces already documented for APP_BASE. Each space has its own namespace,
 * and keys are the path under that base (`/modules/...`), matching the Worker asset lookup.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpBuildNumber } from './buildNumber.mjs';
import {
  emptyManifest,
  isPilotManifest,
  mergeManifests,
  rollbackManifest,
  uploadPlan,
  type PilotManifest,
} from '../src/lib/pilotManifest.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPACES = {
  prod: { base: '/never', kv: 'fd398000ddb740198d25474d340f9d13' },
  dev: { base: '/dev/never', kv: '1f761c42cfb240afb23e5ff941ad3d9e' },
} as const;

type SpaceName = keyof typeof SPACES;

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? '' : null;
}
const apply = process.argv.includes('--apply');
const command = process.argv[2] ?? 'upload';

function spaceOf(): SpaceName {
  const name = arg('space') ?? 'dev';
  if (name !== 'prod' && name !== 'dev') throw new Error(`unknown space ${name}`);
  return name;
}

async function readManifest(rel: string): Promise<PilotManifest> {
  const raw = JSON.parse(await readFile(path.join(root, rel), 'utf8')) as unknown;
  if (!isPilotManifest(raw)) throw new Error(`${rel} is missing or invalid; run the app build first`);
  return raw;
}

function api(account: string, ns: string, suffix: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${ns}/${suffix}`;
}

async function cf(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
  return res;
}

async function remoteManifest(token: string, account: string, ns: string): Promise<PilotManifest> {
  const key = encodeURIComponent('/modules/manifest.json');
  const res = await cf(token, api(account, ns, `values/${key}`));
  if (res.status === 404) return emptyManifest();
  if (!res.ok) throw new Error(`read manifest failed: ${res.status} ${await res.text()}`);
  const body: unknown = await res.json();
  if (!isPilotManifest(body)) throw new Error('remote manifest is not format 1');
  return body;
}

async function putBulk(token: string, account: string, ns: string, items: { key: string; value: string; hash: string; ct: string }[]): Promise<void> {
  if (!items.length) return;
  const body = items.map((item) => ({
    key: item.key,
    value: Buffer.from(item.value).toString('base64'),
    base64: true,
    metadata: { ct: item.ct, h: item.hash },
  }));
  const res = await cf(token, api(account, ns, 'bulk'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let success = false;
  try { success = (JSON.parse(text) as { success?: boolean }).success === true; } catch { success = false; }
  if (!res.ok || !success) throw new Error(`kv bulk failed: ${res.status} ${text.slice(0, 400)}`);
}

async function main(): Promise<void> {
  const space = spaceOf();
  const cfg = SPACES[space];
  if (command === 'rollback') {
    const id = arg('module');
    const version = arg('version');
    if (!id || !version) throw new Error('rollback needs --module and --version');
    if (!apply) {
      console.log(JSON.stringify({ dryRun: true, space, base: cfg.base, rollback: { id, version }, note: 'pass --apply to update the manifest only' }, null, 2));
      return;
    }
    const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
    const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required with --apply');
    const appBuild = bumpBuildNumber(root);
    const remote = await remoteManifest(token, account, cfg.kv);
    const next = { ...rollbackManifest(remote, id, version), build: appBuild };
    await putBulk(token, account, cfg.kv, [{
      key: '/modules/manifest.json',
      value: `${JSON.stringify(next, null, 2)}\n`,
      hash: 'manifest',
      ct: 'application/json; charset=utf-8',
    }]);
    console.log(JSON.stringify({ applied: true, space, current: next.modules[id]?.current }, null, 2));
    return;
  }
  if (command !== 'upload') throw new Error('command must be upload or rollback');
  const packaged = await readManifest('dist/module-deploy/manifest.json');
  const site = await readManifest('dist/modules/manifest.json');
  if (!Object.keys(packaged.modules).length) {
    if (!apply) {
      console.log(JSON.stringify({
        dryRun: true,
        space,
        base: cfg.base,
        upload: [],
        note: 'No pilot module version changed. Unchanged modules are not in the deploy package and are not uploaded.',
      }, null, 2));
      return;
    }
    const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
    const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
    if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required with --apply');
    const appBuild = bumpBuildNumber(root);
    const remote = await remoteManifest(token, account, cfg.kv);
    await putBulk(token, account, cfg.kv, [{
      key: '/modules/manifest.json',
      value: `${JSON.stringify({ ...remote, build: appBuild }, null, 2)}\n`,
      hash: 'manifest',
      ct: 'application/json; charset=utf-8',
    }]);
    console.log(JSON.stringify({ applied: true, space, upload: [], build: appBuild, note: 'No module chunks uploaded. The app build number advanced.' }, null, 2));
    return;
  }
  if (!apply) {
    const plan = uploadPlan(null, packaged);
    console.log(JSON.stringify({
      dryRun: true,
      space,
      base: cfg.base,
      kv: cfg.kv,
      upload: plan.upload.map((chunk) => `/${chunk.file}`),
      current: Object.fromEntries(Object.entries(packaged.modules).map(([id, mod]) => [id, mod.current])),
      note: 'Only modules whose version changed are listed. Pass --apply to upload those chunks if the namespace does not have them yet.',
    }, null, 2));
    return;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
  const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required with --apply');
  const appBuild = bumpBuildNumber(root);
  const remote = await remoteManifest(token, account, cfg.kv);
  const plan = uploadPlan(remote, packaged);
  if (plan.errors.length) throw new Error(plan.errors.join('\n'));
  const merged = { ...mergeManifests(remote, site).manifest, build: appBuild };
  const files = [];
  for (const chunk of plan.upload) {
    files.push({
      key: `/${chunk.file}`,
      value: await readFile(path.join(distOf(chunk.file)), 'utf8'),
      hash: chunk.hash,
      ct: 'text/javascript; charset=utf-8',
    });
  }
  await putBulk(token, account, cfg.kv, files);
  await putBulk(token, account, cfg.kv, [{
    key: '/modules/manifest.json',
    value: `${JSON.stringify(merged, null, 2)}\n`,
    hash: 'manifest',
    ct: 'application/json; charset=utf-8',
  }]);
  console.log(JSON.stringify({ applied: true, space, uploaded: files.map((file) => file.key), current: Object.fromEntries(Object.entries(merged.modules).map(([id, mod]) => [id, mod.current])) }, null, 2));
}

function distOf(file: string): string {
  return path.join(root, 'dist', file);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
