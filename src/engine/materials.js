// PBR materials from the CC0 texture sets in public/assets/tex/<id>/ (diff, nor, arm = AO/rough/metal).
// Fetch new sets with tools/fetch-assets.mjs.
import * as THREE from 'three/webgpu';
import { loadBitmap } from '../load/bitmap.js';
import { work } from '../load/workers.js';
import { span } from '../load/prof.js';

const cache = new Map();
const pending = new Set(); // image loads in flight (texturesLoaded)
// Resolves once every texture requested so far has loaded (or failed), e.g. before baking impostors.
export async function texturesLoaded() { while (pending.size) { const list = [...pending]; await Promise.all(list); for (const p of list) pending.delete(p); } }
let maxAniso = 8, texMax = 4096;
export function setAnisotropy(n) { maxAniso = n; }
// Largest texture edge the device tier allows (Engine sets it before the world loads); bigger images are
// scaled down at load. Decoded in load workers as ImageBitmaps (pre-flipped, alpha not premultiplied).
export function setTextureMax(n) { texMax = n; }
export const textureMax = () => texMax;

export function tex(path, { srgb = false, repeat = [1, 1] } = {}) {
  const key = `${path}|${repeat}|${srgb}`;
  let t = cache.get(key);
  if (t) return t;
  let base = cache.get(path);
  if (!base) {
    base = new THREE.Texture();
    base.userData.clones = [];
    // decoded in a load worker (src/load/bitmap.js), the main thread as the fallback
    const url = new URL(path, location.href).href;
    pending.add(span('tex.load', work('bitmap', { url, max: texMax }, () => loadBitmap(url, texMax))).then((bmp) => {
      base.image = bmp;
      for (const c of base.userData.clones) c.needsUpdate = true;
    }).catch((e) => console.warn('texture', path, e)));
    cache.set(path, base);
  }
  // a fresh texture sharing the image (clone() would mark it for upload before the image exists)
  t = new THREE.Texture();
  t.source = base.source;
  t.flipY = false; // the bitmap is decoded already flipped
  if (base.image) t.needsUpdate = true; else base.userData.clones.push(t);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

// The three maps of a set as textures, for TSL graphs that mix several sets.
export function maps(id, repeat = [1, 1]) {
  const p = `${import.meta.env.BASE_URL}assets/tex/${id}/`;
  return {
    diff: tex(p + 'diff.webp', { srgb: true, repeat }),
    nor: tex(p + 'nor.webp', { repeat }),
    arm: tex(p + 'arm.webp', { repeat }),
  };
}

// A ready MeshStandardNodeMaterial from one set. `tint` multiplies the albedo.
export function pbr(id, { repeat = [1, 1], tint, normalScale = 1, roughness = 1, side, ...rest } = {}) {
  const m = maps(id, repeat);
  const mat = new THREE.MeshStandardNodeMaterial({
    map: m.diff, normalMap: m.nor, aoMap: m.arm, roughnessMap: m.arm, metalnessMap: m.arm,
    roughness, metalness: 1, side: side ?? THREE.FrontSide, ...rest,
  });
  mat.normalScale.set(normalScale, normalScale);
  if (tint) mat.color.set(tint);
  mat.name = id;
  return mat;
}
