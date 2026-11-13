// Angband3D Service Worker — v12.0.5 PWA & Multi-Realm Standalone Client Caching
const CACHE_NAME = 'angband3d-v12.1.0';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/dungeon.css',
  '/assets/favicon.png',
  '/assets/yasd3d_icon_192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
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
    url.pathname.endsWith('.mp3') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.webm') ||
    event.request.headers.has('range') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Cache-first strategy for static 3D models, textures, sprites, SFX, fonts, and versioned JS/CSS
  const hasVersionParam = url.searchParams.has('v');
  const bypassDiskCache = event.request.mode !== 'navigate' && (url.pathname.startsWith('/assets/') || hasVersionParam);
  const fetchFresh = () => bypassDiskCache ? fetch(event.request, { cache: 'reload' }) : fetch(event.request);
  const isVersionedCode = (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) && hasVersionParam;
  if (
    url.pathname.startsWith('/assets/models/') ||
    url.pathname.startsWith('/assets/polyhaven/') ||
    url.pathname.startsWith('/assets/sprites/') ||
    url.pathname.startsWith('/assets/textures/') ||
    url.pathname.startsWith('/assets/audio/sfx/') ||
    url.pathname.startsWith('/assets/fonts/') ||
    url.pathname.startsWith('/js/vendor/') ||
    url.pathname.startsWith('/wasm/') ||
    isVersionedCode
  ) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: !hasVersionParam }).then((cached) => {
        if (cached) return cached;
        return fetchFresh().then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        }).catch(() => {
          return caches.match(event.request, { ignoreSearch: true })
            .then((alt) => alt || new Response('Offline', { status: 503, statusText: 'Offline' }));
        });
      })
    );
    return;
  }

  // Network-first strategy for live updates with cache fallback
  event.respondWith(
    fetchFresh()
      .then((response) => {
        // Cache successful static asset responses
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
            return caches.match('/index.html', { ignoreSearch: true }).then((nav) => nav || new Response('Offline', { status: 503, statusText: 'Offline' }));
          }
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
