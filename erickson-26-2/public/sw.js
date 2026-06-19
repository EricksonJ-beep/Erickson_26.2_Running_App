const CACHE = 'erickson-v5'; // bump to purge stale cached icons/manifest (v4 served the old logo)

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) =>
      Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const { pathname } = new URL(e.request.url);

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (pathname.startsWith('/_next/static/') || /\.(png|ico|svg|webp|json)$/.test(pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
            return res;
          })
      )
    );
  }
});
