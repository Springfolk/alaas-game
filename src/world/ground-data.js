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
// The ground as drawn at (x, z) by an N×N grid: the terrain at the cell's corners, linear over its two triangles
// (the diagonal runs from (i+1, j) to (i, j+1)). Between the corners it differs from terrain.height by centimetres.
const unwarp = (d) => { const X = Math.abs(d); let a = Math.min(1, X / A); for (let k = 0; k < 8; k++) a -= (A * a + B * a ** 4 - X) / (A + 4 * B * a ** 3); return Math.sign(d) * a; };
// `at(i, j)` = the sample at a grid node (a cache may stand in for the terrain)
export function drawnHeight(terrain, x, z, N, at = (i, j) => Math.round(terrain.height(gridX(i, N), gridZ(j, N)) * 1000) / 1000) {
  const fi = (unwarp(x - HOME.x) + 1) / 2 * (N - 1), fj = (unwarp(z - HOME.z - 120) + 1) / 2 * (N - 1);
  const i = Math.max(0, Math.min(N - 2, Math.floor(fi))), j = Math.max(0, Math.min(N - 2, Math.floor(fj)));
  const x0 = gridX(i, N), x1 = gridX(i + 1, N), z0 = gridZ(j, N), z1 = gridZ(j + 1, N), u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0);
  const hb = at(i + 1, j), hc = at(i, j + 1);
  if (u + v <= 1) { const ha = at(i, j); return ha + u * (hb - ha) + v * (hc - ha); }
  const hd = at(i + 1, j + 1); return hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
}
export const gridNode = (i, j, N) => [gridX(i, N), gridZ(j, N)];
// drawnHeight for many points, fast: the cell found by bisection over the grid's node lines, the node samples memoised
// in a typed array, or read from the grid's own samples `mm` (groundSamples' h) (what World.drawnAt and the load's
// settling use)
export function drawnSampler(terrain, N, mm = null) {
  const gx = new Float64Array(N), gz = new Float64Array(N), h = mm ? null : new Float32Array(N * N).fill(NaN);
  for (let i = 0; i < N; i++) { gx[i] = gridX(i, N); gz[i] = gridZ(i, N); }
  const cell = (a, v, last) => { // the last point's cell first: points come near each other
    if (v >= a[last] && v < a[last + 1]) return last;
    let lo = 0, hi = N - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; } return lo;
  };
  let li = 0, lj = 0;
  const at = mm ? (i, j) => mm[j * N + i] / 1000 : (i, j) => { const k = j * N + i; let y = h[k]; if (y !== y) h[k] = y = Math.round(terrain.height(gx[i], gz[j]) * 1000) / 1000; return y; };
  return (x, z) => {
    const i = (li = cell(gx, x, li)), j = (lj = cell(gz, z, lj)), u = (x - gx[i]) / (gx[i + 1] - gx[i]), v = (z - gz[j]) / (gz[j + 1] - gz[j]);
    const hb = at(i + 1, j), hc = at(i, j + 1);
    if (u + v <= 1) { const ha = at(i, j); return ha + u * (hb - ha) + v * (hc - ha); }
    const hd = at(i + 1, j + 1); return hd + (1 - u) * (hc - hd) + (1 - v) * (hb - hd);
  };
}
// drawnHeight for many points: the node samples memoised
export function drawnBy(terrain, N) {
  const c = new Map(), at = (i, j) => { const k = j * N + i; let y = c.get(k); if (y === undefined) c.set(k, (y = Math.round(terrain.height(gridX(i, N), gridZ(j, N)) * 1000) / 1000)); return y; };
  return (x, z) => drawnHeight(terrain, x, z, N, at);
}

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
