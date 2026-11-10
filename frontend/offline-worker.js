self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...SHELL_FILES]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter(name => name.startsWith('rescom-shell-') && name !== CACHE_NAME);
    await Promise.all(previous.slice(0, -1).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'rescom:offline-shell') {
    event.ports[0]?.postMessage(SHELL_FILES.has(event.data.entry));
  }
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(event.request, { signal: controller.signal });
        if (response.ok) return response;
      } catch {
        // The cached shell can open the local workspace without a network.
      } finally {
        clearTimeout(timeout);
      }
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/index.html')) || Response.error();
    })());
  } else if (SHELL_FILES.has(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(url.pathname)) || fetch(event.request)));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(event.request).then(saved => saved || fetch(event.request)));
  }
});
