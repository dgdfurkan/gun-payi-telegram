// Uygulama kabuğunu önbellekler; kişisel veri IndexedDB'de kalır, burada silinmez.
const VERSION = '5.2.0';
const CACHE = 'gp-' + VERSION;
const FONTS = 'gp-fonts';
const SHELL = [
  '/', '/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/api.js', '/js/categories.js', '/js/chrome.js', '/js/compose.js', '/js/core.js', '/js/ctx.js', '/js/icons.js', '/js/pages.js',
  '/js/parse.js', '/js/pickers.js', '/js/plan.js', '/js/store.js', '/js/ui.js', '/js/version.js', '/js/voice.js',
  '/icons/icon-192.png', '/icons/apple-touch-icon.png',
];

// Yönlendirilmiş yanıtı önbelleğe temiz bir kopya olarak koy (Safari yönlendirmeli yanıtı reddeder).
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async path => {
      const res = await fetch(path, { cache: 'reload' });
      if (res.ok) await cache.put(path, await clean(res));
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  // Yazı tipi (Google Fonts): bir kez indir, sonra çevrimdışı da kullan.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.origin !== location.origin) return;
  if (/^\/(api|telegram)\//.test(url.pathname) || url.pathname === '/health' || url.pathname.endsWith('.shortcut')) return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => (await caches.match('/', { cacheName: CACHE })) || clean(await fetch(req)))());
    return;
  }
  e.respondWith((async () => {
    const hit = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') {
      const copy = await clean(res.clone());
      caches.open(CACHE).then(c => c.put(req, copy));
    }
    return res;
  })());
});
