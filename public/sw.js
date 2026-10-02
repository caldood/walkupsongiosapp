/* Offline-first service worker. The app shell is precached at install time; audio lives in
   IndexedDB (not here), so playback never depends on this cache or the network. */
const CACHE = 'gdm-__BUILD_ID__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, self.registration.scope).toString())))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gdm-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Page loads: try the network first (so a new version is picked up right away), but never wait long –
  // at a ballpark with a bad signal fall back to the cached copy after 3 seconds.
  if (req.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(new URL('./', self.registration.scope).toString(), copy));
          }
          return res;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3000)),
      ]).catch(() => caches.match(new URL('./', self.registration.scope).toString(), { ignoreSearch: true, ignoreVary: true })),
    );
    return;
  }

  // Everything else (hashed JS/CSS/icons) is cache-first.
  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || fetch(req).catch(() => Response.error())),
  );
});
