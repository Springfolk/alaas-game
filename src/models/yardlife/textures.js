// Procedural texture sets, painted by tools/bake-canvas-tex.mjs (no photo source exists under CC0 for these):
// birch bark (outer, inner), log end grain, plain silver sheet, saddle broadcloth, smoke puff.
// Each set: { diff (sRGB), nor (tangent-space, GL), arm? } as THREE.Textures with RepeatWrapping.
import * as THREE from 'three/webgpu';
import { mulberry32, valueNoise, fbm } from '../../util.js';
import { maps } from '../../engine/materials.js';

const cache = new Map();

function makeTex(data, w, h, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// paint(x, y) → [r, g, b, height, rough] in 0..1 for a w×h tileable image
function bake(w, h, paint, normalStrength = 2) {
  const col = new Uint8Array(w * h * 4), nor = new Uint8Array(w * h * 4), arm = new Uint8Array(w * h * 4);
  const hgt = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b, ht, ro = 0.85] = paint(x, y);
    const i = y * w + x;
    col[i * 4] = Math.max(0, Math.min(255, r * 255)); col[i * 4 + 1] = Math.max(0, Math.min(255, g * 255)); col[i * 4 + 2] = Math.max(0, Math.min(255, b * 255)); col[i * 4 + 3] = 255;
    hgt[i] = ht;
    arm[i * 4] = 255; arm[i * 4 + 1] = Math.max(0, Math.min(255, ro * 255)); arm[i * 4 + 2] = 0; arm[i * 4 + 3] = 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const hx = hgt[y * w + ((x + 1) % w)] - hgt[y * w + ((x - 1 + w) % w)];
    const hy = hgt[((y + 1) % h) * w + x] - hgt[((y - 1 + h) % h) * w + x];
    let nx = -hx * normalStrength, ny = hy * normalStrength, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nor[i * 4] = (nx / l * 0.5 + 0.5) * 255; nor[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255; nor[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255; nor[i * 4 + 3] = 255;
  }
  return { diff: makeTex(col, w, h, true), nor: makeTex(nor, w, h, false), arm: makeTex(arm, w, h, false) };
}

// tileable value noise: wrap the lattice at period p
function tnoise(x, y, p, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const h = (a, b) => valueNoise(((a % p) + p) % p + 0.0, ((b % p) + p) % p + 0.0, seed);
  const f = (t) => t * t * (3 - 2 * t);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  const u = f(xf), v = f(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tfbm(x, y, p, seed, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += tnoise(x * f, y * f, p * f, seed + i * 7) * amp; f *= 2; amp *= 0.5; }
  return s;
}

const SETS = {
  // Birch bark, outer face: cream-white with dark horizontal lenticels and grey smudges.
  // One tile = 0.5 m. Lenticels run across the trunk (along u).
  birch() {
    const W = 512, H = 512, rng = mulberry32(11);
    const len = [];
    for (let i = 0; i < 260; i++) len.push({ x: rng() * W, y: rng() * H, l: 6 + rng() ** 2 * 60, t: 0.8 + rng() * 2.2, d: 0.4 + rng() * 0.6 });
    const grid = new Float32Array(W * H);
    for (const q of len) for (let dx = -q.l; dx <= q.l; dx++) for (let dy = -3; dy <= 3; dy++) {
      const x = ((Math.round(q.x + dx) % W) + W) % W, y = ((Math.round(q.y + dy + Math.sin(dx * 0.05) * 1.5) % H) + H) % H;
      const e = Math.max(0, 1 - Math.abs(dy) / q.t) * (1 - (Math.abs(dx) / q.l) ** 3);
      grid[y * W + x] = Math.max(grid[y * W + x], e * q.d);
    }
    return bake(W, H, (x, y) => {
      const n = tfbm(x / 64, y / 64, 8, 3), m = tfbm(x / 16, y / 128, 32, 5, 3);
      const l = grid[y * W + x];
      const peel = Math.max(0, tfbm(x / 40, y / 10, 12.8, 9) - 0.25) * 2;
      let r = 0.86 + n * 0.07, g = 0.83 + n * 0.07, b = 0.76 + n * 0.06;
      // grey-ochre smudges
      const s = Math.max(0, tfbm(x / 90, y / 40, 512 / 90, 21) + 0.05);
      r -= s * 0.25; g -= s * 0.26; b -= s * 0.28;
      // peeling papery edges show the warm under-layer
      r = r * (1 - peel) + 0.8 * peel; g = g * (1 - peel) + 0.6 * peel; b = b * (1 - peel) + 0.42 * peel;
      r *= 1 - l * 0.8; g *= 1 - l * 0.82; b *= 1 - l * 0.8;
      return [r + m * 0.03, g + m * 0.03, b + m * 0.03, -l * 0.6 + peel * 0.3 + m * 0.05, 0.55 + l * 0.3];
    }, 3);
  },
  // Birch bark, inner face: ochre-salmon, faint horizontal streaks, lighter where it was scraped.
  birchIn() {
    const W = 256, H = 256;
    return bake(W, H, (x, y) => {
      const n = tfbm(x / 32, y / 6, 8, 41), m = tfbm(x / 64, y / 64, 4, 43);
      const r = 0.74 + n * 0.08 + m * 0.06, g = 0.47 + n * 0.06 + m * 0.05, b = 0.29 + n * 0.04 + m * 0.03;
      return [r, g, b, n * 0.4, 0.62];
    }, 2);
  },
  // Log end grain: growth rings (larch: tight, dark latewood), radial checks, centred on uv 0.5,0.5
  // (one tile = 1 m, so a log of radius r uses a 2r patch of it).
  endgrain() {
    // rings centred on the tile corner (uv 0,0), so an end disc with uv = metres from its pith
    // (material scale 0.6 m) shows rings round its own centre; heartwood darker within ~8 cm
    const W = 512, H = 512, T = 0.6;
    return bake(W, H, (x, y) => {
      let u = x / W, v = y / H;
      if (u > 0.5) u -= 1; if (v > 0.5) v -= 1;
      const r = Math.hypot(u, v) * T, a = Math.atan2(v, u); // metres
      const wob = fbm(Math.cos(a) * 2 + 9, Math.sin(a) * 2, 7) * 0.004 + fbm(u * 40, v * 40, 3) * 0.0008;
      const ring = 0.5 + 0.5 * Math.cos((r + wob) / 0.0045 * 2 * Math.PI);
      const late = Math.pow(ring, 5);
      const heart = 1 - Math.min(1, Math.max(0, (r - 0.06) / 0.03));
      const check = Math.max(0, 1 - Math.abs(Math.sin(a * 2 + fbm(r * 30, 0, 5) * 1.5)) * 30) * Math.min(1, r * 40) * (fbm(a * 3, 1, 9) > 0 ? 1 : 0);
      const n = fbm(u * 60, v * 60, 13) * 0.05;
      let R = 0.82 - late * 0.2 + n, G = 0.64 - late * 0.18 + n, B = 0.45 - late * 0.13 + n;
      R -= heart * 0.12; G -= heart * 0.17; B -= heart * 0.15;
      R *= 1 - check * 0.75; G *= 1 - check * 0.75; B *= 1 - check * 0.75;
      return [R, G, B, -late * 0.35 - check, 0.8];
    }, 2);
  },
  // Plain silver sheet (rear bow, plaques). The lyre engraving drawn here before had no traced source; the front bow's
  // engraving is the traced canvas_bowplate (tools/make-carving.mjs, docs/patterns.md).
  silver() {
    const W = 256, H = 256;
    return bake(W, H, (x, y) => {
      const c = 0.86 + tfbm(x / 50, y / 50, 256 / 50, 77) * 0.06;
      return [c, c * 0.985, c * 0.96, 0, 0.3];
    }, 1.5);
  },
  // Broadcloth: fine twill, colour comes from vertex colours (red, black panels).
  cloth() {
    const W = 128, H = 128;
    return bake(W, H, (x, y) => {
      const tw = 0.5 + 0.5 * Math.sin((x + y) * Math.PI / 2);
      const n = tfbm(x / 16, y / 16, 8, 31) * 0.1;
      const c = 0.9 + tw * 0.08 + n;
      return [c, c, c, tw * 0.2 + n, 0.92];
    }, 1);
  },
};

// The sets are baked to public/assets/tex/canvas_<name>/ by tools/bake-canvas-tex.mjs (painting them here
// cost ~1 s of main-thread time at load); rerun it after changing a painter.
export const CANVAS_SETS = Object.keys(SETS);
export function paintCanvasSet(name) {
  if (!cache.has(name)) cache.set(name, SETS[name]());
  return cache.get(name);
}
export const canvasMaps = (name) => maps(`canvas_${name}`);

// A soft smoke puff (alpha in .r) made of a few overlapping noise blobs; tileable not needed.
let puff;
export function puffTexture() {
  if (puff) return puff;
  const S = 128, data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S * 2 - 1, v = y / S * 2 - 1;
    const r = Math.hypot(u, v);
    const n = fbm(u * 2.2 + 5, v * 2.2 + 5, 61, 5);
    const a = Math.max(0, Math.min(1, (1 - r * (1.05 - n * 0.6)) * 1.6)) * Math.max(0, 1 - r) ** 0.6;
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = a * 255; data[i + 3] = 255;
  }
  puff = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  puff.generateMipmaps = true; puff.minFilter = THREE.LinearMipmapLinearFilter; puff.magFilter = THREE.LinearFilter;
  puff.needsUpdate = true;
  return puff;
}
