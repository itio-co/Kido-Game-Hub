/* Never Ending Story Game — generated at build time. Do not edit. */
const CACHE = "nesg-6e597601c949";
const PRECACHE = ["./assets/NotoSans-Bold-BQFlziyr.ttf","./assets/NotoSans-Regular-DuyeGPRW.ttf","./assets/NotoSansThai-Bold-C2Vi385s.ttf","./assets/NotoSansThai-Regular-CBs6PpnR.ttf","./assets/app-9AbT365K.js","./assets/app-Bg23FCx3.css","./assets/god-DCsCmMzR.css","./assets/god-DPjraQ9X.js","./assets/main-C-usmgUH.css","./assets/main-DNnCoZgt.js","./data/case-flow.json","./data/player-room.json","./data/screens.json","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./img/album-found.jpg","./img/cutscene-01-p1.jpg","./img/cutscene-01-p2.jpg","./img/cutscene-01-p3.jpg","./img/egg-young-grandpa.webp","./img/ending-01.jpg","./img/ending-02.jpg","./img/ending-03.jpg","./img/ending-04.jpg","./img/ending-05.jpg","./img/house-map.jpg","./img/kitchen-close.jpg","./img/kitchen-wide.jpg","./img/living-grandma.jpg","./img/living-shelf-tray.jpg","./img/living-table.jpg","./img/living-wide-afternoon.jpg","./img/living-wide-yesterday.jpg","./img/living-wide.jpg","./img/player-room-wide.jpg","./img/rin.jpg","./img/stirfry/kitchen.webp","./img/stirfry/wok-burnt.webp","./img/stirfry/wok-cooked.webp","./img/stirfry/wok-half.webp","./img/stirfry/wok-raw.webp","./img/stirfry/wok-toss.webp","./img/study-box.jpg","./img/study-wide.jpg","./img/uncle-mek.jpg","./index.html","./manifest.webmanifest","./models/nightstand-master.glb","./models/nightstand.glb","./showcase/nightstand-ref-points.json","./showcase/nightstand-ref.png"];

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
  if (url.pathname.includes('/api/')) return; // live API, never cached
  const file = url.pathname.split('/').pop() || '';
  // Admin page + module registry: always network, never cached.
  if (file === 'god' || file === 'god.html' || file === 'modules.json' || url.pathname.includes('/god/')) return;
  // HTML / navigations: network-first so a new deploy shows immediately; cache is the offline fallback.
  if (request.mode === 'navigate' || file === '' || file.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(fromCacheOrNetwork(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  } catch {
    const cached = (await caches.match(request, { ignoreSearch: true })) || (await caches.match('./index.html'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

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
    return new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}
