// Vite: defaults, plus the source keys of the baked geometry (tools/geo-keys.mjs, docs/loading.md) as
// `window.__GEO_KEYS__` in every page (re-hashed per page load in dev). Dev and build warn when
// public/assets/geo/ is stale: rerun `npm run bake-geometry`.
import { defineConfig } from 'vite';
import { geoKeys, staleGroups } from './tools/geo-keys.mjs';

const warnStale = (log) => {
  const stale = staleGroups();
  if (stale.length) log(`geometry bake stale for ${stale.join(', ')} (generated at load instead): npm run bake-geometry`);
};

function geoKeysPlugin() {
  return {
    name: 'geo-keys',
    transformIndexHtml: () => [{ tag: 'script', children: `window.__GEO_KEYS__=${JSON.stringify(geoKeys().keys)}`, injectTo: 'head-prepend' }],
    buildStart() { if (this.meta.watchMode === false) warnStale((m) => this.warn(m)); },
    configureServer(server) { warnStale((m) => server.config.logger.warn(m)); },
  };
}

// BASE: the public path for a sub-path host, e.g. GitHub Pages (`BASE=/alaas-game/ npm run build`)
export default defineConfig({ base: process.env.BASE || '/', plugins: [geoKeysPlugin()] });
