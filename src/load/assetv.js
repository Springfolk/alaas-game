// Cache-busting for public/ files that keep their name when replaced (GitHub Pages caches everything 10 min):
// `?v=` the content hash of the file's folder (texture set, assets/ref, assets/ui, audio). The table is put in
// the page by vite.config.js (`__ASSET_V__`: only index.html changes when an asset does) and handed to the load
// workers as they start (src/load/workers.js). geo/ and impostors/ carry their own keys (geocache.js, atlas.js).
export function versioned(url) {
  const V = globalThis.__ASSET_V__;
  if (!V) return url;
  const path = url.split('?')[0], dir = path.slice(0, path.lastIndexOf('/'));
  for (const k in V) if (dir === k || dir.endsWith('/' + k)) return `${path}?v=${V[k]}`;
  return url;
}
