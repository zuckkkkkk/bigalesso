// BIGALESSO service worker (written to the build by scripts/build.mjs with its version + precache list).
// Versioned cache: a new build gets a new cache name, the old one is deleted on activate.
// Navigations: network first (fresh index.html), offline fallback to the cached one. Static files: cache first.
const VERSION = '__VERSION__';
const CACHE = 'bigalesso-' + VERSION;
const PRECACHE = [/*PRECACHE*/];
const SKIP = /\/(ws|api|healthz)(\/|$|\?)/;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('bigalesso-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin || SKIP.test(u.pathname)) return;
  if (r.mode === 'navigate') {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(CACHE).then(c => c.put('index.html', cp)).catch(() => { }); return res; })
      .catch(() => caches.match('index.html').then(m => m || caches.match('./'))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c => c.match(r).then(hit => hit || fetch(r).then(res => {
    if (res.ok && res.status === 200 && res.type === 'basic') c.put(r, res.clone()).catch(() => { });
    return res;
  }))));
});
