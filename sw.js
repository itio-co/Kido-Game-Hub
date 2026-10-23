/* Never Ending Story Game — generated at build time. Do not edit. */
const CACHE = "nesg-19ff6f129ab3";
const PRECACHE = ["./assets/NotoSans-Bold-BQFlziyr.ttf","./assets/NotoSans-Regular-DuyeGPRW.ttf","./assets/NotoSansThai-Bold-C2Vi385s.ttf","./assets/NotoSansThai-Regular-CBs6PpnR.ttf","./assets/index-BCHVTeld.css","./assets/index-Bi3k7SkM.js","./data/case-flow.json","./data/player-room.json","./data/screens.json","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./img/album-found.jpg","./img/cutscene-01-p1.jpg","./img/cutscene-01-p2.jpg","./img/cutscene-01-p3.jpg","./img/house-map.jpg","./img/kitchen-close.jpg","./img/kitchen-wide.jpg","./img/living-grandma.jpg","./img/living-shelf-tray.jpg","./img/living-table.jpg","./img/living-wide-afternoon.jpg","./img/living-wide-yesterday.jpg","./img/living-wide.jpg","./img/player-room-wide.jpg","./img/rin.jpg","./img/study-box.jpg","./img/study-wide.jpg","./img/uncle-mek.jpg","./index.html","./manifest.webmanifest","./models/nightstand-master.glb","./models/nightstand.glb","./showcase/nightstand-ref-points.json","./showcase/nightstand-ref.png"];

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
