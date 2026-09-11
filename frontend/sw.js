const CACHE_NAME = 'recipe-keeper-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json'
];

// 1. Install and cache the core files
self.addEventListener('install', event => {
  self.skipWaiting(); // Forces the browser to immediately activate the new version
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Clean up old vaults when the app updates
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. THE UPGRADE: "Network-First" Strategy
self.addEventListener('fetch', event => {

   if (!event.request.url.startsWith('http') || event.request.method !== 'GET') {
    return; 
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // If we have internet, save a fresh copy to the vault and show the new code!
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // If the internet is down, fallback to the vault
        return caches.match(event.request);
      })
  );
});