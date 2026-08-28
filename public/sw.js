// PKG.3 — offline shell. Network-first for navigations: a deploy is picked
// up on the next online launch and the cached copy serves only when the
// network fails, so there is no "update available" UI and nobody is frozen
// on an old build. One cache, one entry (the single-file game IS the app).
// Plain JS on purpose: it ships as-is from public/, outside the bundle.
const CACHE = 'rokket-v1';

self.addEventListener('install', (e) => {
  // pre-cache on install so "installed, then went offline" already works.
  // A failed pre-cache must not block activation — the page that registered
  // us just loaded from this origin, and the next good navigation fills the
  // cache anyway (see fetch below).
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add('/'))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  const net = fetch(e.request);
  // Registered synchronously, and BEFORE respondWith's consumer is attached,
  // so this .then runs first and clones the body before the browser starts
  // reading it. Only a good shell may replace the cached one: a 5xx during
  // a deploy must never become the offline copy.
  e.waitUntil(
    net
      .then((res) => (res.ok ? caches.open(CACHE).then((c) => c.put('/', res.clone())) : undefined))
      .catch(() => {}),
  );
  e.respondWith(net.catch(() => caches.match('/').then((hit) => hit ?? Response.error())));
});
