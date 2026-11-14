// Service worker (registered by src/load/offline.js in a production build; docs/offline.md): repeat visits load
// from the Cache API and the installed app plays offline. One cache per scope (main and canary share an origin).
// vite.config.js stamps BUILD and writes offline.json ({ shell: built files, files: every file, `?v=` included }).
const BUILD = '__BUILD__';
const SCOPE = new URL(self.registration.scope);
const CACHE = `alaas:${SCOPE.pathname}`;
const NESTED = SCOPE.pathname + 'canary/'; // the canary build under main's scope has its own worker
const BUILT = /\/assets\/[^/]+-[\w-]{8}\.(js|css)$/;
const list = () => fetch(new URL(`offline.json?b=${BUILD}`, SCOPE), { cache: 'no-cache' }).then((r) => r.json());
const VARY = { ignoreVary: true }; // same-origin only: a server's `Vary: Origin` must not hide a stored file
const ok = (r) => r && r.status === 200 && r.type === 'basic';

self.addEventListener('install', (e) => e.waitUntil((async () => {
  const [cache, { shell }] = await Promise.all([caches.open(CACHE), list()]);
  await cache.addAll(['./', ...shell].map((u) => new URL(u, SCOPE).href));
  await self.skipWaiting();
})()));

// a new build: drop what it no longer ships
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  await self.clients.claim();
  const [cache, { files }] = await Promise.all([caches.open(CACHE), list()]);
  const keep = new Set(['./', ...files].map((u) => new URL(u.split('?')[0], SCOPE).pathname));
  for (const req of await cache.keys()) if (!keep.has(new URL(req.url).pathname)) await cache.delete(req);
})().catch(() => {})));

// stores a response; of a file that keeps its name (`?v=`, `?k=`) only the newest version stays
async function put(cache, req, res) {
  const url = new URL(req.url);
  if (url.search) for (const old of await cache.keys(url.origin + url.pathname, { ignoreSearch: true })) if (old.url !== req.url) await cache.delete(old);
  await cache.put(req, res);
}
const network = async (cache, req, key = req) => {
  const res = await fetch(req);
  if (ok(res)) put(cache, key, res.clone()).catch(() => {});
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname) || url.pathname.startsWith(NESTED)
    || req.headers.has('range') || /\/(sw\.js|offline\.json)$/.test(url.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const offline = () => cache.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || Response.error());
    if (req.mode === 'navigate') return network(cache, req, SCOPE.href).catch(() => cache.match(SCOPE.href, VARY)); // the page: fresh when online
    if (url.searchParams.has('v') || url.searchParams.has('k') || BUILT.test(url.pathname)) { // never changes under this URL
      return (await cache.match(req, VARY)) || network(cache, req).catch(offline);
    }
    if (req.cache === 'no-cache') return network(cache, req).catch(offline); // manifests
    const hit = await cache.match(req, VARY), fresh = network(cache, req);
    if (hit) { fresh.catch(() => {}); return hit; } // the rest (fonts): cached now, refreshed for next time
    return fresh.catch(offline);
  })());
});

// the installed app (src/load/offline.js): everything play can ask for, one file at a time
self.addEventListener('message', (e) => {
  if (!Array.isArray(e.data?.offline)) return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const u of e.data.offline) {
      const url = new URL(u, SCOPE).href;
      if (await cache.match(url, { ignoreSearch: true, ignoreVary: true })) continue;
      try { const res = await fetch(url); if (ok(res)) await cache.put(url, res); } catch { return; } // offline: next launch
    }
    e.source?.postMessage({ offline: 'done' });
  })());
});
