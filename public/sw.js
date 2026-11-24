const CACHE_NAME = 'app-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/public/style.css',
  '/public/utils.js',
  '/public/price.js',
  '/public/filter.js',
  '/public/priceRadar.js',
  '/public/priceTrend.js',
  '/public/priceAlert.js',
  '/public/compare.js',
  '/public/script.js'
];
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});