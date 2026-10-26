// PBR materials from the CC0 texture sets in public/assets/tex/<id>/ (diff, nor, arm = AO/rough/metal).
// Fetch new sets with tools/fetch-assets.mjs.
import * as THREE from 'three/webgpu';
import { loadBitmap } from '../load/bitmap.js';
import { work } from '../load/workers.js';
import { span } from '../load/prof.js';
import { TIER } from './tier.js';
import { FIRST, sized, edgeFor } from '../load/texsize.js';
import { urlFlag, KEYART } from '../util.js';

const cache = new Map();
const bases = new Map(); // path → the base texture its clones share the image of
const pending = new Set(); // image loads in flight (texturesLoaded)
// Resolves once every texture requested so far has loaded (or failed), e.g. before baking impostors.
export async function texturesLoaded() { while (pending.size) { const list = [...pending]; await Promise.all(list); for (const p of list) pending.delete(p); } }
let maxAniso = 8, texMax = 4096;
export function setAnisotropy(n) { maxAniso = n; }
// Largest texture edge the device tier allows (Engine sets it before the world loads); the shipped size that
// covers it is fetched (src/load/texsize.js), bigger images are scaled down. Decoded in load workers as
// ImageBitmaps (pre-flipped, alpha not premultiplied).
export function setTextureMax(n) { texMax = n; }
export const textureMax = () => texMax;
// Every load starts at 256 (~1.5 MB for the whole world), sharpenTextures() brings the tier's size in play.
// ?sharp (A/B), ?keyart and the impostor bake load the tier's size at once.
const SHARP = KEYART || urlFlag('sharp') || urlFlag('bakeimpostors');
export const firstTextureMax = () => (SHARP ? texMax : Math.min(FIRST, texMax));
// TIER.release (phones): each image is uploaded as soon as it decodes and then closed — WebKit keeps an
// ImageBitmap as an IOSurface besides the GPU copy (~0.5 GB at 1k on iOS, counted against the tab). A texture
// asked for after that reloads its image.
let renderer = null;
export function setTextureRenderer(r) { renderer = r; }

// Loads `path` at `max` into `base`; `list` are the textures to upload once it decodes. sharpen: they already
// hold a smaller image, so their GPU textures are dropped first (rebuilt at the new size: a rebind, no new shader).
function fill(base, path, max, list, sharpen = false) {
  const url = sized(new URL(path, location.href).href, max);
  base.userData.max = max;
  const p = span('tex.load', work('bitmap', { url, max }, () => loadBitmap(url, max))).then((bmp) => {
    if (sharpen) { for (const c of list) c.dispose(); base.image?.close?.(); }
    base.image = bmp;
    for (const c of list) c.needsUpdate = true;
    if (!TIER.release || !renderer) return;
    for (const c of list) renderer.initTexture(c);
    list.length = 0;
    base.image = { width: bmp.width, height: bmp.height }; // no re-upload ever reads it (source version unchanged)
    bmp.close();
    base.userData.released = true;
  }).catch((e) => console.warn('texture', path, e));
  pending.add(p);
  return p;
}

export function tex(path, { srgb = false, repeat = [1, 1] } = {}) {
  const key = `${path}|${repeat}|${srgb}`;
  let t = cache.get(key);
  if (t) return t;
  let base = bases.get(path);
  if (!base) {
    base = new THREE.Texture();
    base.userData.clones = []; // waiting for the image
    base.userData.users = []; // every texture on it (sharpenTextures)
    // decoded in a load worker (src/load/bitmap.js), the main thread as the fallback
    fill(base, path, firstTextureMax(), base.userData.clones);
    bases.set(path, base);
  }
  // a fresh texture sharing the image (clone() would mark it for upload before the image exists)
  t = new THREE.Texture();
  t.source = base.source;
  t.flipY = false; // the bitmap is decoded already flipped
  base.userData.users.push(t);
  if (base.userData.released) { base.userData.released = false; base.image = null; base.userData.clones.push(t); fill(base, path, base.userData.max, base.userData.clones); } else if (base.image) t.needsUpdate = true; else base.userData.clones.push(t);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  cache.set(key, t);
  return t;
}

// Other loads that start small (the ground's packed sets): fn(max) reloads at the tier's size.
const sharpeners = [];
export function onSharpen(fn) { if (!SHARP && FIRST < texMax) sharpeners.push(fn); }

// After ready: every texture that started at 256 reloads at the tier's size, a few at a time (each swap is an
// upload + mips on a render frame). Resolves when all are in.
export async function sharpenTextures() {
  const jobs = [...sharpeners.splice(0).map((fn) => () => fn(texMax))];
  for (const [path, base] of bases) {
    const url = new URL(path, location.href).href;
    if (edgeFor(url, texMax) > edgeFor(url, base.userData.max)) jobs.push(() => fill(base, path, texMax, [...base.userData.users], true));
  }
  const next = async () => { for (let j; (j = jobs.shift());) { await j(); await new Promise((r) => setTimeout(r, 16)); } };
  await Promise.all([next(), next(), next(), next()]);
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
