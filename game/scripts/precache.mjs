import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function toRelativeUrl(outDir, file) {
  const rel = path.relative(outDir, file).split(path.sep).join('/');
  return './' + rel.split('/').map(encodeURIComponent).join('/');
}

export function renderServiceWorker(cacheId, urls) {
  return `/* Never Ending Story Game — generated at build time. Do not edit. */
const CACHE = ${JSON.stringify(`nesg-${cacheId}`)};
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return;
  event.respondWith(fromCacheOrNetwork(request));
});

async function fromCacheOrNetwork(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
`;
}

export async function generatePrecache(outDir) {
  const files = (await walk(outDir)).filter((file) => path.basename(file) !== 'sw.js').sort();
  const hash = createHash('sha256');
  const urls = [];
  for (const file of files) {
    const url = toRelativeUrl(outDir, file);
    urls.push(url);
    hash.update(url);
    hash.update(await readFile(file));
  }
  const cacheId = hash.digest('hex').slice(0, 12);
  await writeFile(path.join(outDir, 'sw.js'), renderServiceWorker(cacheId, urls));
  return { cacheId, urls };
}
