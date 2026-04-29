const CACHE_NAME = 'vendelo-plus-v1';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './desktop.html',
  './icono.png',
  './manifest.json',
  'https://unpkg.com/@phosphor-icons/web@2.0.3/src/duotone/style.css',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js'
];

// Instalar Service Worker y cachear recursos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activar y limpiar caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  // Solo cachear peticiones GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retornar desde cache si existe, si no buscar en red
        return response || fetch(event.request).catch(() => {
          // Si falla la red (offline) y es una página, mostrar index.html
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
