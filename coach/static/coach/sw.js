// Basic Service Worker for PWA installability
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
    // Basic fetch handler (network first, no caching for now, just to pass PWA requirements)
    e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
