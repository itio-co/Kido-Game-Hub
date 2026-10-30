/* Never Ending Story Game — generated at build time. Do not edit. */
const CACHE = "nesg-73bb64c26495";
const PRECACHE = ["./assets/NotoSans-Bold-BQFlziyr.ttf","./assets/NotoSans-Regular-DuyeGPRW.ttf","./assets/NotoSansThai-Bold-C2Vi385s.ttf","./assets/NotoSansThai-Regular-CBs6PpnR.ttf","./assets/index-DT65nA9z.js","./assets/index-m82w72gX.css","./data/case-flow.json","./data/player-room.json","./data/screens.json","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-192.png","./icons/icon-maskable-512.png","./img/album-found.jpg","./img/cutscene-01-p1.jpg","./img/cutscene-01-p2.jpg","./img/cutscene-01-p3.jpg","./img/house-map.jpg","./img/kitchen-close.jpg","./img/kitchen-wide.jpg","./img/living-grandma.jpg","./img/living-shelf-tray.jpg","./img/living-table.jpg","./img/living-wide-afternoon.jpg","./img/living-wide-yesterday.jpg","./img/living-wide.jpg","./img/player-room-wide.jpg","./img/rin.jpg","./img/study-box.jpg","./img/study-wide.jpg","./img/uncle-mek.jpg","./index.html","./manifest.webmanifest","./models/grandma-mali-1k5.glb","./models/grandma-mali-3k.glb","./models/grandma-mali-6k.glb","./models/grandma-mali-cutout-19k.glb","./models/grandma-mali-head19k-tpose.glb","./models/grandma-mali-parametric.glb","./models/grandma-mali-remesh-1k5.glb","./models/grandma-mali-remesh-6k.glb","./models/grandma-mali-tripo-6k.glb","./models/grandma-mali-tripo-body-6kface.glb","./models/grandma-mali-tripo-smooth.glb","./models/grandma-mali-tripo6k-clean.glb","./models/grandma-mali-ultra-nopbr.glb","./models/grandma-mali-ultra.glb","./models/grandma-mali.glb","./models/nightstand-master.glb","./models/nightstand-meshy-1k5.glb","./models/nightstand-meshy-measured.glb","./models/nightstand.glb","./showcase/characters/aunt-rin-2inch-photo.jpg","./showcase/characters/aunt-rin-tpose.jpg","./showcase/characters/child-player-2inch-photo.jpg","./showcase/characters/child-player-tpose.jpg","./showcase/characters/dad-2inch-photo.jpg","./showcase/characters/dad-tpose.jpg","./showcase/characters/grandma-mali-2inch-photo.jpg","./showcase/characters/grandma-mali-3d-render.jpg","./showcase/characters/grandma-mali-tpose.jpg","./showcase/characters/mom-2inch-photo.jpg","./showcase/characters/mom-tpose.jpg","./showcase/characters/uncle-mek-2inch-photo.jpg","./showcase/characters/uncle-mek-tpose.jpg","./showcase/nightstand-ref-points.json","./showcase/nightstand-ref.png"];

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
