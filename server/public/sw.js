// Angband3D Service Worker — Split-Epoch PWA Shell + Persistent 3D/WASM Asset Cache
const CACHE_NAME = 'angband3d-v13.3.4';
const SW_VER = CACHE_NAME.replace(/^angband3d-v/, '');
const ASSET_CACHE = 'angband3d-assets-v4';
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  `/dist/app.min.css?v=${SW_VER}`,
  `/dist/boot.min.js?v=${SW_VER}`,
  `/dist/game.min.js?v=${SW_VER}`,
  `/assets/favicon.png?v=${SW_VER}`,
  `/assets/yasd3d_icon_192.png?v=${SW_VER}`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(u.includes('?v=') ? u : new Request(u, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ASSET_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/robots.txt' || url.pathname.startsWith('/.well-known/')) return;

  // Strictly bypass WebSockets, live API calls, health probes, and heavy media / range requests
  if (
    url.pathname.startsWith('/ws') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/health') ||
    url.pathname.startsWith('/assets/video/') ||
    url.pathname.startsWith('/assets/audio/music/') ||
    url.pathname === '/assets/audio/yasd_theme.ogg' ||
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.webm') ||
    event.request.headers.has('range') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  const hasVersionParam = url.searchParams.has('v');
  const isNav = event.request.mode === 'navigate';
  const bypassDiskCache = isNav || (url.pathname.startsWith('/assets/') && !hasVersionParam);
  const fetchFresh = () => bypassDiskCache ? fetch(event.request, { cache: isNav ? 'no-store' : 'no-cache' }) : fetch(event.request);
  const isHeavyImmutableAsset = (
    url.pathname.startsWith('/assets/models/') ||
    url.pathname.startsWith('/assets/polyhaven/') ||
    url.pathname.startsWith('/assets/sprites/') ||
    url.pathname.startsWith('/assets/textures/') ||
    url.pathname.startsWith('/assets/showcase/') ||
    url.pathname.startsWith('/assets/audio/sfx/') ||
    url.pathname.startsWith('/assets/fonts/') ||
    url.pathname.startsWith('/js/vendor/') ||
    url.pathname.startsWith('/wasm/')
  );
  const isVersionedCode = (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/') || url.pathname.startsWith('/dist/')) && hasVersionParam;

  if (isHeavyImmutableAsset || isVersionedCode) {
    const targetCacheName = isHeavyImmutableAsset ? ASSET_CACHE : CACHE_NAME;
    event.respondWith(
      caches.open(targetCacheName).then((cache) =>
        cache.match(event.request, { ignoreSearch: !hasVersionParam }).then((cached) => {
          if (cached) return cached;
          return fetchFresh().then((response) => {
            if (response && response.status === 200 && response.type === 'basic') {
              const cloned = response.clone();
              cache.put(event.request, cloned).then(async () => {
                if (!isHeavyImmutableAsset) return;
                const keys = await cache.keys();
                if (keys.length > 300) {
                  for (const oldReq of keys.slice(0, keys.length - 300)) {
                    await cache.delete(oldReq);
                  }
                }
              }).catch(() => {});
            }
            return response;
          }).catch(() => {
            return caches.match(event.request, { ignoreSearch: true })
              .then((alt) => alt || new Response('Offline', { status: 503, statusText: 'Offline' }));
          });
        })
      )
    );
    return;
  }

  // Network-first strategy for HTML shell & unversioned files with offline cache fallback
  event.respondWith(
    fetchFresh()
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/', { ignoreSearch: true })
              .then((nav) => nav || caches.match('/index.html', { ignoreSearch: true }))
              .then((nav) => nav || new Response('Offline', { status: 503, statusText: 'Offline' }));
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
