// The ground's pure-CPU data (no three.js, so a worker can build it — src/load/worker.js): the warped grid's
// terrain samples and vertex arrays, and a splat set's diff × AO + roughness texels.
import { HOME } from './terrain.js';
import { sized } from '../load/texsize.js';

const A = 360, B = 2640; // x = A·u + B·u⁴ around the homestead

// The expensive part of an N×N grid: the terrain sampled at every vertex, in fixed point (a load worker computes it,
// or the baked geometry stands in: src/load/geocache.js). h: height in mm, nor: normal × 32767, spl: splat × 255
// (one plane per component, so the baked pack deflates well).
const warp = (u) => Math.sign(u) * (A * Math.abs(u) + B * u ** 4);
const gridX = (i, N) => HOME.x + warp(i / (N - 1) * 2 - 1), gridZ = (j, N) => HOME.z + 120 + warp(j / (N - 1) * 2 - 1);
export function groundSamples(terrain, N) {
  const h = new Int32Array(N * N), nor = new Int16Array(N * N * 3), spl = new Uint8Array(N * N * 4), n = [0, 1, 0];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, x = gridX(i, N), z = gridZ(j, N), y = terrain.height(x, z);
    h[k] = Math.round(y * 1000);
    terrain.normal(x, z, n, 0.8);
    for (let c = 0; c < 3; c++) nor[c * N * N + k] = Math.round(n[c] * 32767);
    const w = terrain.splat(x, z, y);
    for (let c = 0; c < 4; c++) spl[c * N * N + k] = Math.round(w[c] * 255);
  }
  return { N, h, nor, spl };
}

// The grid's vertex arrays from its samples: positions, uvs, normals, splat weights, triangle index.
export function groundArrays({ N, h, nor: qn, spl: qs }) {
  const pos = new Float32Array(N * N * 3), uvs = new Float32Array(N * N * 2), nor = new Float32Array(N * N * 3), spl = new Float32Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    const z = gridZ(j, N);
    for (let i = 0; i < N; i++) {
      const k = j * N + i, x = gridX(i, N);
      pos[k * 3] = x; pos[k * 3 + 1] = h[k] / 1000; pos[k * 3 + 2] = z;
      uvs[k * 2] = x; uvs[k * 2 + 1] = -z; // only for the normal-map tangent frame (sampling uses world xz)
    }
  }
  const NN = N * N;
  for (let k = 0; k < NN; k++) for (let c = 0; c < 3; c++) nor[k * 3 + c] = qn[c * NN + k] / 32767;
  for (let k = 0; k < NN; k++) for (let c = 0; c < 4; c++) spl[k * 4 + c] = qs[c * NN + k] / 255;
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let t = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  return { pos, uvs, nor, spl, idx };
}

// diff RGB × AO (arm.r) in RGB, roughness (arm.g) in A; `d`, `a` are ImageData-likes (arm may be smaller).
function packTexels(d, a) {
  const out = new Uint8Array(d.data.length), n = d.data.length;
  const sx = a.width / d.width;
  for (let i = 0; i < n; i += 4) {
    const p = i >> 2, x = p % d.width, y = (p / d.width) | 0;
    const j = (((y * sx) | 0) * a.width + ((x * sx) | 0)) * 4;
    const ao = 0.35 + 0.65 * a.data[j] / 255;
    out[i] = d.data[i] * ao; out[i + 1] = d.data[i + 1] * ao; out[i + 2] = d.data[i + 2] * ao;
    out[i + 3] = a.data[j + 1];
  }
  return { data: out, width: d.width, height: d.height };
}

// Fetches one image and returns its pixels, scaled to fit `max` (main thread or worker: OffscreenCanvas).
async function imagePixels(url, max, tries = 3) {
  let bmp;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    bmp = await createImageBitmap(await r.blob());
  } catch (e) {
    if (tries > 1) { await new Promise((ok) => setTimeout(ok, 400)); return imagePixels(url, max, tries - 1); }
    throw e;
  }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return g.getImageData(0, 0, w, h);
}

// One splat set packed from its diff.webp and arm.webp under `base` (the shipped size that covers `max`).
export async function packSet(base, max) {
  const [d, a] = await Promise.all(['diff', 'arm'].map((m) => imagePixels(sized(new URL(base + m + '.webp', location.href).href, max), max)));
  return packTexels(d, a);
}
