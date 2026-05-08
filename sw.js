const CACHE_NAME = 'vendelo-plus-v13';
const ASSETS = [
  './',
  './index.html',
  './mobile.html',
  './desktop.html',
  './admin.html',
  './icono.png',
  './manifest.json'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('PWA: Caching critical assets');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate strategy
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  // Skip external scripts from strict caching to avoid CORS issues or stale CDN files
  const isExternal = event.request.url.startsWith('http');
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => {
        if (event.request.mode === 'navigate') {
          return caches.match('./mobile.html');
        }
      });

      return cachedResponse || fetchPromise;
    })
  );
});
