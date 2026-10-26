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
export function setAnisotropy(n) { maxAniso = aniso(n); }
// anisotropic taps capped by the tier (phones 4: 16 taps on each of the ground's ~20 samples a pixel weigh on a phone GPU)
export const aniso = (n) => Math.min(n, TIER.aniso || n);
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

// One image load at a time per base (`u.loading`); it loads the largest size asked for (`u.want`) and, landing,
// uploads to the textures that need it: the waiting ones, or every one when the size changed (their GPU textures
// are dropped first: rebuilt at the new size, a rebind, no new shader). A size asked for meanwhile, or a texture
// needing a released image again (`u.refill`), runs the next round. One at a time: two loads of one image (a
// sharpen and a re-request on phones) once raced, one blanking the image the other was uploading — every frame
// then threw and the page reloaded in a loop.
function fill(base, path, max) {
  const u = base.userData;
  u.want = Math.max(u.want || 0, max);
  if (u.loading) return u.loading;
  u.loading = (async () => {
    while (u.refill || u.want > (u.got || 0)) {
      const m = u.want, url = sized(new URL(path, location.href).href, m);
      u.refill = false;
      let bmp;
      try { bmp = await span('tex.load', work('bitmap', { url, max: m }, () => loadBitmap(url, m))); } catch (e) { console.warn('texture', path, e); break; }
      const resized = u.got !== undefined && bmp.width !== u.gotW;
      const list = resized ? [...u.users] : u.clones.splice(0);
      if (resized) { for (const c of list) if (!u.clones.includes(c)) c.dispose(); u.clones.length = 0; }
      base.image?.close?.();
      base.image = bmp; u.got = m; u.gotW = bmp.width;
      for (const c of list) c.needsUpdate = true;
      if (TIER.release && renderer) {
        for (const c of list) renderer.initTexture(c);
        base.image = { width: bmp.width, height: bmp.height }; // no re-upload ever reads it (source version unchanged)
        bmp.close();
        u.released = true;
      }
    }
    u.loading = null;
  })();
  pending.add(u.loading);
  return u.loading;
}

export function tex(path, { srgb = false, repeat = [1, 1] } = {}) {
  const key = `${path}|${repeat}|${srgb}`;
  let t = cache.get(key);
  if (t) return t;
  let base = bases.get(path);
  if (!base) {
    base = new THREE.Texture();
    base.userData.clones = []; // waiting for an image
    base.userData.users = []; // every texture on it
    bases.set(path, base);
    // decoded in a load worker (src/load/bitmap.js), the main thread as the fallback
    fill(base, path, firstTextureMax());
  }
  const u = base.userData;
  // a fresh texture sharing the image (clone() would mark it for upload before the image exists)
  t = new THREE.Texture();
  t.source = base.source;
  t.flipY = false; // the bitmap is decoded already flipped
  u.users.push(t);
  if (u.released) { u.clones.push(t); u.refill = true; fill(base, path, u.got); } // phones: the image was let go: load it again
  else if (u.got !== undefined) t.needsUpdate = true;
  else u.clones.push(t);
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
    if (edgeFor(url, texMax) > edgeFor(url, base.userData.want)) jobs.push(() => fill(base, path, texMax));
  }
  // WebGL2 (phones) uploads and builds mips synchronously on the main thread: one swap at a time, two frames apart
  const gl = !!renderer?.backend?.isWebGLBackend, frame = () => new Promise((r) => requestAnimationFrame(r));
  const next = async () => { for (let j; (j = jobs.shift());) { await j(); if (gl) { await frame(); await frame(); } else await new Promise((r) => setTimeout(r, 16)); } };
  await Promise.all(gl ? [next()] : [next(), next(), next(), next()]);
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
