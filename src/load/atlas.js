// Impostor atlases baked offline (tools/bake-impostors.mjs → public/assets/impostors/): at run time a bake
// needs dozens of one-off shaders (one per source material), so the shipped atlas is loaded instead when its
// key (the baked layout: clusters, parts, materials) still matches; otherwise the game bakes at load as before
// and warns. `?bakeimpostors` forces the load-time bake and exposes the targets for the tool.
import * as THREE from 'three/webgpu';
import { strHash, urlFlag } from '../util.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/impostors/';
export const baking = urlFlag('bakeimpostors');
const meta = baking ? Promise.resolve({}) : fetch(BASE + 'meta.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));

export const atlasKey = (s) => (strHash(s) >>> 0).toString(16);

const load = (file) => new THREE.TextureLoader().loadAsync(BASE + file).then((t) => {
  t.flipY = false; // stored top row first, as the render target it was read from
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
