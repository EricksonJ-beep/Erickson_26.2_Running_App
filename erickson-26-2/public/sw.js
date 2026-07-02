const CACHE = 'erickson-v7'; // v7: manifest/icons/course maps now stale-while-revalidate (no more query-bust + reinstall to swap an asset)

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

  // Hashed build assets are immutable per URL — cache-first is safe and fastest.
  if (pathname.startsWith('/_next/static/')) {
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
    return;
  }

  // Manifest, icons, and course-map images: stale-while-revalidate. Serve the
  // cached copy instantly for offline speed, but refresh it in the background so
  // swapping an asset no longer needs a ?v= query-bust + cache bump + reinstall.
  if (/\.(png|ico|svg|webp|json)$/.test(pathname)) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(e.request).then((hit) => {
          const network = fetch(e.request)
            .then((res) => {
              if (res.ok) c.put(e.request, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || network;
        })
      )
    );
  }
});
