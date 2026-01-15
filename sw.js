const CACHE_NAME = 'qibla-cache-v1';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/sw.js'];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((res) => res || fetch(e.request))
    );
});
