/* ============================================================================
 * AcroFlow service worker — offline-first app shell caching.
 * ----------------------------------------------------------------------------
 * Strategy: cache-first for the app shell (HTML/CSS/JS/manifest/icons).
 * On install we pre-cache everything; on fetch we serve from cache and
 * update the cache in the background from the network when available.
 * Bump CACHE_VERSION when shipping changes so clients pick them up.
 * ========================================================================== */

const CACHE_VERSION = 'acroflow-v8';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data.js',
  './supabase-adapter.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('AcroFlow SW: precache failed', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Only handle same-origin requests (tutorial links etc. go to network).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      // Serve cache immediately when we have it; otherwise wait for network.
      return cached || network;
    })
  );
});
