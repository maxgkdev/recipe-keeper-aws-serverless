self.addEventListener('install', event => {
  self.skipWaiting(); // Forces the browser to activate this new version immediately
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
  // CRITICAL FIX: Ignore all requests to AWS API Gateway, external proxies, and image hosts.
  // Only intercept requests that originate from our own domain.
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // For local files, try fetching from the network first. If offline, try the cache.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});