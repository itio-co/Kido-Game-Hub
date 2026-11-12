/**
 * After the app build: emit rhythm and stirfry as versioned ES chunks plus modules/manifest.json.
 * Svelte stays a shared runtime (import map) so a rolled-back chunk still mounts in the current page.
 */
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { generatePrecache } from './precache.mjs';
import { readBuildNumber } from './buildNumber.mjs';
import { driftErrors, readPilotManifest, sourceHash, versionChanged } from './pilotDrift.mjs';
import type { PilotManifest } from '../src/lib/pilotManifest.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const require = createRequire(import.meta.url);
const svelteRoot = path.dirname(require.resolve('svelte/package.json'));

const RUNTIME: { specifier: string; name: string; entry: string }[] = [
  { specifier: 'svelte', name: 'svelte', entry: 'src/index-client.js' },
  { specifier: 'svelte/internal/client', name: 'client', entry: 'src/internal/client/index.js' },
  { specifier: 'svelte/internal/disclose-version', name: 'disclose-version', entry: 'src/internal/disclose-version.js' },
  { specifier: 'svelte/internal/flags/legacy', name: 'legacy', entry: 'src/internal/flags/legacy.js' },
];

const PILOTS = ['rhythm', 'stirfry'] as const;

function externalSvelte(id: string): boolean {
  return id === 'svelte' || id.startsWith('svelte/');
}

async function bundleFile(entry: string, outDir: string, external: boolean): Promise<void> {
  await build({
    configFile: false,
    root,
    publicDir: false,
    logLevel: 'warn',
    plugins: entry.includes(`${path.sep}modules${path.sep}`) ? [svelte()] : [],
    define: { 'import.meta.env.BASE_URL': JSON.stringify('./') },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      lib: { entry, formats: ['es'], fileName: 'mod' },
      rollupOptions: external ? { external: externalSvelte } : {},
    },
  });
}

async function inlineCss(jsPath: string, cssPath: string, styleId: string): Promise<string> {
  let js = await readFile(jsPath, 'utf8');
  let css = '';
  try { css = await readFile(cssPath, 'utf8'); } catch { /* component had no styles */ }
  if (!css) return js;
  const boot = `if(typeof document!=="undefined"&&!document.getElementById(${JSON.stringify(styleId)})){const s=document.createElement("style");s.id=${JSON.stringify(styleId)};s.textContent=${JSON.stringify(css)};document.head.appendChild(s);}\n`;
  return boot + js;
}

async function emitRuntime(): Promise<Record<string, string>> {
  const outDir = path.join(dist, 'modules/runtime');
  const input = Object.fromEntries(RUNTIME.map((item) => [item.name, path.join(svelteRoot, item.entry)]));
  await build({
    configFile: false,
    root: svelteRoot,
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input,
        preserveEntrySignatures: 'strict',
        output: { entryFileNames: '[name].js', chunkFileNames: 'shared-[hash].js', format: 'es' },
      },
    },
  });
  return Object.fromEntries(RUNTIME.map((item) => [item.specifier, `./modules/runtime/${item.name}.js`]));
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function emitModule(id: (typeof PILOTS)[number], recorded: PilotManifest): Promise<{ version: string; file: string; hash: string; sourceHash: string; deploy: boolean }> {
  const meta = JSON.parse(await readFile(path.join(root, 'src/modules', id, 'module.json'), 'utf8')) as { version: string };
  const hashed = sourceHash(id, root);
  const problems = driftErrors(id, meta.version, hashed, recorded.modules?.[id]);
  if (problems.length) throw new Error(problems.join('\n'));
  const saved = recorded.modules[id].versions[meta.version];
  const deploy = versionChanged(recorded.modules[id]);
  const dest = path.join(dist, saved.file);
  if (await fileExists(dest)) {
    const onDisk = createHash('sha256').update(await readFile(dest)).digest('hex').slice(0, 16);
    if (onDisk === saved.hash) {
      console.log(`skip rebuild ${id}@${meta.version} (source unchanged${deploy ? ', version changed' : ''})`);
      return { version: meta.version, file: saved.file, hash: saved.hash, sourceHash: hashed, deploy };
    }
  }
  const tmp = path.join(dist, '.pilot-tmp', id);
  await bundleFile(path.join(root, 'src/modules', id, 'index.ts'), tmp, true);
  const js = await inlineCss(path.join(tmp, 'mod.js'), path.join(tmp, 'mod.css'), `nes-pilot-${id}`);
  const hash = createHash('sha256').update(js).digest('hex').slice(0, 16);
  if (hash !== saved.hash) throw new Error(`${id}@${meta.version} output hash is ${hash}, pilot-manifest.json records ${saved.hash}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, js);
  console.log(`${deploy ? 'deploy' : 'site-only'} ${id}@${meta.version} ${saved.file}`);
  return { version: meta.version, file: saved.file, hash, sourceHash: hashed, deploy };
}

function injectImportMap(html: string, imports: Record<string, string>): string {
  const tag = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
  const stripped = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
  return stripped.replace('<head>', `<head>${tag}`);
}

const appBuild = readBuildNumber(root);
console.log(`app build ${appBuild}`);
const recorded = readPilotManifest(root) as PilotManifest;
const imports = await emitRuntime();
const modules: PilotManifest['modules'] = {};
const deployModules: PilotManifest['modules'] = {};
for (const id of PILOTS) {
  const chunk = await emitModule(id, recorded);
  const record = {
    current: chunk.version,
    retained: recorded.modules[id]?.retained ?? [chunk.version],
    versions: { ...(recorded.modules[id]?.versions ?? {}), [chunk.version]: { file: chunk.file, hash: chunk.hash, sourceHash: chunk.sourceHash, firstBuild: recorded.modules[id]?.versions[chunk.version]?.firstBuild ?? appBuild } },
  };
  modules[id] = record;
  if (chunk.deploy) deployModules[id] = { current: chunk.version, retained: [chunk.version], versions: { [chunk.version]: record.versions[chunk.version] } };
}
const manifest: PilotManifest = { format: 1, build: appBuild, modules };
await mkdir(path.join(dist, 'modules'), { recursive: true });
await writeFile(path.join(dist, 'modules/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await mkdir(path.join(dist, 'module-deploy'), { recursive: true });
await writeFile(path.join(dist, 'module-deploy/manifest.json'), `${JSON.stringify({ format: 1, modules: deployModules }, null, 2)}\n`);
console.log(Object.keys(deployModules).length ? `deploy package: ${Object.keys(deployModules).join(', ')}` : 'deploy package: no module version changed');
for (const htmlName of ['index.html', 'god.html']) {
  const file = path.join(dist, htmlName);
  await writeFile(file, injectImportMap(await readFile(file, 'utf8'), imports));
}
await rm(path.join(dist, '.pilot-tmp'), { recursive: true, force: true });
await rm(path.join(dist, '.pilot-runtime'), { recursive: true, force: true });
const missing = new Set<string>();
async function scan(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (entry.name.endsWith('.js')) {
      const text = await readFile(full, 'utf8');
      for (const match of text.matchAll(/["'](svelte(?:\/[^"']+)?)["']/g)) {
        const spec = match[1];
        if (spec.startsWith('svelte/src/')) continue;
        if (!imports[spec]) missing.add(spec);
      }
    }
  }
}
await scan(dist);
if (missing.size) throw new Error(`import map is missing ${[...missing].join(', ')}`);
await generatePrecache(dist);
const stray = await readdir(dist).catch(() => []);
if (stray.includes('.pilot-tmp')) throw new Error('pilot temp dir was not removed');
