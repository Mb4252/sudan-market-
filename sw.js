(function(){
  const CACHE_NAME = 'app-cache-v1';
  const urlsToCache = [
    '/',
    '/index.html',
    '/public/style.css',
    '/public/utils.js',
    '/public/priceWasm.js',
    '/public/price.js',
    '/public/filter.js',
    '/public/priceRadar.js',
    '/public/priceTrend.js',
    '/public/priceAlert.js',
    '/public/compare.js',
    '/public/theme.js',
    '/public/storage.js',
    '/public/priceEngine.js',
    '/public/config.js'
  ];

  self.addEventListener('install', e => {
    e.waitUntil(
      caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
    self.skipWaiting();
  });

  self.addEventListener('activate', e => {
    e.waitUntil(
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
      caches.match(e.request).then(cached => {
        return cached || fetch(e.request).then(resp => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, resp.clone());
            return resp;
          });
        });
      })
    );
  });
})();