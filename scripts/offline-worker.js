const SHELL = '/?rescom-offline-shell';
const assetPaths = new Set(ASSETS);
const isShell = response => response.ok && !response.redirected &&
  response.headers.get('content-type')?.includes('text/html');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const shell = await fetch(SHELL, { cache: 'reload' });
    if (!isShell(shell)) throw new Error('Could not prepare the RESCOM app shell.');
    await cache.addAll(ASSETS);
    await cache.put(SHELL, shell);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter(name => name.startsWith('rescom-shell-') && name !== CACHE);
    await Promise.all(names.map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;

  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { signal: AbortSignal.timeout(5500) });
        if (response.status < 500) return response;
      } catch {
        // A slow or unreachable connection can reopen the cached workspace.
      }
      return (await caches.match(SHELL, { cacheName: CACHE })) || Response.error();
    })());
  } else if (assetPaths.has(url.pathname) || url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      return (await caches.match(url.pathname, { cacheName: CACHE })) || fetch(request);
    })());
  }
});
