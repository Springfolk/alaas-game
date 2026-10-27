// Cache-busting for public/ files that keep their name when replaced (GitHub Pages caches everything 10 min):
// `?v=` the content hash of the file's folder (texture set, assets/ref, assets/ui, audio), from vite.config.js.
// geo/ and impostors/ carry their own keys (geocache.js, atlas.js).
/* global __ASSET_V__ */
const V = typeof __ASSET_V__ === 'undefined' ? {} : __ASSET_V__;

export function versioned(url) {
  const path = url.split('?')[0], dir = path.slice(0, path.lastIndexOf('/'));
  for (const k in V) if (dir === k || dir.endsWith('/' + k)) return `${path}?v=${V[k]}`;
  return url;
}
