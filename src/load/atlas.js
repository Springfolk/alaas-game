// Impostor atlases baked offline (tools/bake-impostors.mjs → public/assets/impostors/): at run time a bake
// needs dozens of one-off shaders (one per source material), so the shipped atlas is loaded instead when its
// key (the baked layout: clusters, parts, materials) still matches; otherwise the game bakes at load as before
// and warns. `?bakeimpostors` forces the load-time bake and exposes the targets for the tool.
import * as THREE from 'three/webgpu';
import { strHash, urlFlag } from '../util.js';
import { TIER } from '../engine/tier.js';
import { work } from './workers.js';
import { loadBitmap } from './bitmap.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/impostors/';
export const baking = urlFlag('bakeimpostors');
const meta = baking ? Promise.resolve({}) : fetch(BASE + 'meta.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

export const atlasKey = (s) => (strHash(s) >>> 0).toString(16);

// TIER.atlasMax (phones): decoded scaled down in a load worker instead of at full size (2048×2816)
// the homestead's atlas (2048×768) stays full size: phones switch to its impostors from ~45 m (lod.js)
const image = (url, max) => (max
  ? work('bitmap', { url, max, flip: false }, () => loadBitmap(url, max, 3, false)).then((b) => new THREE.Texture(b))
  : new THREE.TextureLoader().loadAsync(url));
const load = (file) => image(new URL(BASE + file, location.href).href, TIER.atlasMax && (file.startsWith('homestead') ? Math.max(2048, TIER.atlasMax) : TIER.atlasMax)).then((t) => {
  t.flipY = false; // stored top row first, as the render target it was read from
  t.needsUpdate = true;
  t.colorSpace = THREE.NoColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  return t;
});

// [albedo, normal] textures for atlas `name` if the shipped one matches `key`, else null
export async function shippedAtlas(name, key) {
  const m = (await meta)[name];
  if (!m || m.key !== key) {
    if (m) console.warn(`impostors ${name}: the shipped atlas is stale (baked at load instead): npm run bake-impostors`);
    return null;
  }
  try { return await Promise.all([load(`${name}-albedo.webp`), load(`${name}-normal.webp`)]); } catch { return null; }
}

// for the tool: the load-time bake's targets, once `done` resolves
export function exposeBake(name, key, rtA, rtN, done) {
  if (baking) (window.__atlases ||= {})[name] = { key, rtA, rtN, done };
}
