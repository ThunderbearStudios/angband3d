// Angband3D Service Worker — v9.1.0 PWA & Multi-Realm Standalone Client Caching
const CACHE_NAME = 'angband3d-v9.9.3';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/dungeon.css',
  '/css/chronicle.css',
  '/js/app.js',
  '/js/input.js',
  '/js/menu-router.js',
  '/js/terminal.js',
  '/js/hud.js',
  '/js/dungeon3d.js',
  '/js/audio.js',
  '/js/network.js',
  '/js/realm-keys.js',
  '/js/screen-context.js',
  '/js/demo-player.js',
  '/js/mobile-overlay.js',
  '/js/chronicle/chronicle-store.js',
  '/js/chronicle/chronicle-grounder.js',
  '/js/chronicle/chronicle-filter.js',
  '/js/chronicle/chronicle-audio.js',
  '/js/chronicle/chronicle-llm.js',
  '/js/chronicle/chronicle-manager.js',
  '/js/heng/heng-translate.js',
  '/js/local_bridge.js',
  '/js/engine-worker.js',
  '/wasm/angband.js',
  '/wasm/angband.wasm',
  '/wasm/angband.data',
  '/assets/thunderbear_logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn('[SW] Cache prefetch non-fatal error:', err);
      });
    }).then(() => self.skipWaiting())
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
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.webm') ||
    event.request.headers.has('range') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first strategy for live updates with cache fallback
  event.respondWith(
    fetch(event.request)
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
