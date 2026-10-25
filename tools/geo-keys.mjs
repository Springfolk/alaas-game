// Source keys of the baked geometry (src/load/geocache.js, tools/bake-geometry.mjs): per group, a hash of every
// source file its generators import (relative imports followed), the shared terrain/layout/util code, the pack
// format (geocodec.js; geocache.js itself is left out) and the three.js version. vite.config.js puts them in the
// page (re-hashed per load in dev) and warns at build or dev start when public/assets/geo/manifest.json is stale.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SKIP = resolve(ROOT, 'src/load/geocache.js');
const SHARED = ['src/world/terrain.js', 'src/world/layout.js', 'src/util.js', 'src/load/geocodec.js'];
const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;

// every file `entry` reaches through relative imports
function closure(entry, seen = new Set()) {
  const file = resolve(ROOT, entry);
  if (seen.has(file) || file === SKIP || !existsSync(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT)) closure(relative(ROOT, resolve(dirname(file), m[1] || m[2])), seen);
  return seen;
}

const three = () => JSON.parse(readFileSync(resolve(ROOT, 'node_modules/three/package.json'), 'utf8')).version;

// groups: one per model module, the forest's generators, the load-time worker jobs
export function geoGroups() {
  const groups = {};
  for (const f of readdirSync(resolve(ROOT, 'src/models'))) if (f.endsWith('.js')) groups[`model:${f.slice(0, -3)}`] = [`src/models/${f}`];
  groups.forest = ['src/nature/forest.js'];
  groups.jobs = ['src/load/worker.js'];
  return groups;
}

// { group: key } and the files each key covers
export function geoKeys() {
  const keys = {}, files = new Set(), v = three();
  for (const [g, entries] of Object.entries(geoGroups())) {
    const set = new Set();
    for (const e of [...entries, ...SHARED]) closure(e, set);
    const h = createHash('sha1').update(`three ${v}\n`);
    for (const f of [...set].sort()) { h.update(relative(ROOT, f) + '\n'); h.update(readFileSync(f)); files.add(f); }
    keys[g] = h.digest('hex').slice(0, 12);
  }
  return { keys, files: [...files] };
}

// groups whose shipped bake no longer matches the sources
export function staleGroups(keys = geoKeys().keys) {
  const path = resolve(ROOT, 'public/assets/geo/manifest.json');
  if (!existsSync(path)) return Object.keys(keys);
  const baked = JSON.parse(readFileSync(path, 'utf8')).keys || {};
  return Object.keys(keys).filter((g) => g in baked && baked[g] !== keys[g]); // groups not shipped never go stale
}
