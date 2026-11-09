self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...SHELL_FILES])));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('rescom-shell-') && name !== CACHE_NAME) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
      } catch {
        // The cached shell can open the local workspace without a network.
      }
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/index.html')) || Response.error();
    })());
  } else if (SHELL_FILES.has(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  }
});
