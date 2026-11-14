// Vite: defaults, plus the source keys of the baked geometry (tools/geo-keys.mjs, docs/loading.md) as
// `window.__GEO_KEYS__` in every page (re-hashed per page load in dev). Dev and build warn when
// public/assets/geo/ is stale: rerun `npm run bake-geometry`. And `window.__ASSET_V__`: a content hash per asset
// folder for `?v=` (src/load/assetv.js; index.html's assets/ui URLs get theirs here).
import { defineConfig } from 'vite';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { geoKeys, staleGroups } from './tools/geo-keys.mjs';

// { 'assets/tex/acg_hay': '1a2b3c4d', 'audio': …, … }: every public/ folder holding files, but geo/ and impostors/
function assetVersions() {
  const out = {};
  const walk = (rel) => {
    const ents = readdirSync(`public/${rel}`, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    const h = createHash('sha1');
    let files = 0;
    for (const e of ents) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else { h.update(e.name).update(readFileSync(`public/${rel}/${e.name}`)); files++; }
    }
    if (files) out[rel] = h.digest('hex').slice(0, 8);
  };
  for (const d of ['assets/tex', 'assets/ref', 'assets/ui', 'audio']) walk(d);
  return out;
}
const ASSET_V = assetVersions();
const uiVersioned = (html) => html.replace(/\/assets\/ui\/[\w.-]+(?![\w.?-])/g, (u) => `${u}?v=${ASSET_V['assets/ui']}`);

// The service worker's lists (public/sw.js, docs/offline.md): offline.json = { shell: the built scripts, files: every
// file, `?v=` as the game asks for it }; sw.js gets a build id, so each deploy installs a new worker.
function offlineList(dir) {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith('.'))
    .map((e) => `${e.parentPath}/${e.name}`.slice(dir.length + 1).replaceAll('\\', '/'))
    .filter((f) => !['index.html', 'viewer.html', 'sw.js', 'offline.json', 'og.jpg'].includes(f)).sort();
  const shell = files.filter((f) => /^assets\/[^/]+$/.test(f));
  const list = JSON.stringify({ shell, files: files.map((f) => { const v = ASSET_V[f.slice(0, f.lastIndexOf('/'))]; return v ? `${f}?v=${v}` : f; }) });
  writeFileSync(`${dir}/offline.json`, list);
  const build = createHash('sha1').update(list).update(readFileSync(`${dir}/index.html`)).digest('hex').slice(0, 10);
  writeFileSync(`${dir}/sw.js`, readFileSync(`${dir}/sw.js`, 'utf8').replace('__BUILD__', build));
}

const warnStale = (log) => {
  const stale = staleGroups();
  if (stale.length) log(`geometry bake stale for ${stale.join(', ')} (generated at load instead): npm run bake-geometry`);
};

function geoKeysPlugin() {
  return {
    name: 'geo-keys',
    transformIndexHtml: (html) => ({
      html: uiVersioned(html),
      tags: [{ tag: 'script', children: `window.__GEO_KEYS__=${JSON.stringify(geoKeys().keys)};window.__ASSET_V__=${JSON.stringify(ASSET_V)}`, injectTo: 'head-prepend' }],
    }),
    // a build re-serialises srcset after every html hook, dropping the query: version the written page again
    writeBundle(o) {
      const f = `${o.dir}/index.html`;
      if (!existsSync(f)) return;
      writeFileSync(f, uiVersioned(readFileSync(f, 'utf8')));
      offlineList(o.dir);
    },
    buildStart() { if (this.meta.watchMode === false) warnStale((m) => this.warn(m)); },
    configureServer(server) { warnStale((m) => server.config.logger.warn(m)); },
  };
}

// BASE: the public path for a sub-path host, e.g. GitHub Pages (`BASE=/alaas-game/ npm run build`)
export default defineConfig({ base: process.env.BASE || '/', plugins: [geoKeysPlugin()] });
