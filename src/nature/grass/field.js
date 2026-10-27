// The meadow field's pure-CPU texels (no three.js scene objects, so a worker can bake them —
// src/load/worker.js): terrain samples for grass.js's field textures and the homestead mask's last pass.
import { toHalfFloat } from 'three/src/extras/DataUtils.js';
import { LAKE, HOME } from '../../world/terrain.js';
import { smooth, fbm } from '../../util.js';

export const FIELD = { res: 512, x0: -576, size: 1152, hbase: 95 }; // 2.25 m texels over the alaas and its rim

// grazed and trodden around the homestead; the hay meadow downslope (south) stays tall
function grazedAt(x, z, spots) {
  const dh = Math.hypot(x - HOME.x, z - HOME.z);
  let g = (1 - smooth(22, 70, dh)) * (1 - 0.65 * smooth(8, 45, z - HOME.z));
  for (const p of spots) g = Math.max(g, 1 - smooth(5, 16, Math.hypot(x - p.x, z - p.z)));
  return g;
}

// A (half floats): height − hbase, lake distance, 0, 1 · B (bytes): forest, path, dry, grazed
export function fieldTexels(terrain, spots) {
  const { res: RES, x0: X0, size: SIZE, hbase } = FIELD;
  const a = new Uint16Array(RES * RES * 4), b = new Uint8Array(RES * RES * 4);
  const cell = SIZE / RES;
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const x = X0 + (i + 0.5) * cell, z = X0 + (j + 0.5) * cell, k = (j * RES + i) * 4;
    const h = terrain.height(x, z);
    const [forest, , path, dry] = terrain.splat(x, z, h);
    const lakeD = terrain.lakeDist(x, z) - LAKE.r;
    const grazed = grazedAt(x, z, spots);
    a[k] = toHalfFloat(h - hbase); a[k + 1] = toHalfFloat(lakeD); a[k + 2] = 0; a[k + 3] = toHalfFloat(1);
    b[k] = forest * 255; b[k + 1] = path * 255; b[k + 2] = dry * 255; b[k + 3] = grazed * 255;
  }
  return { a, b };
}

// The mask's RGBA from its stamped cut (R) and mown (G) channels: B = grazed (field formula, max mown),
// A = bare soil (hoof-broken patches in the sward + trodden ground).
// R = FLOOR marks ground under a house's earth floor: cut and wholly bare (no blade or flower pokes through)
export const FLOOR = 2;
export function maskTexels(R, G, spots, { x0, z0, w, nx, nz }) {
  const px = w / nx, d = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = x0 + (i + 0.5) * px, z = z0 + (j + 0.5) * px;
    const g = Math.max(grazedAt(x, z, spots), G[k]);
    const bare = R[k] >= FLOOR ? 1 : Math.min(1, (g > 0 ? smooth(0.06, 0.3, fbm(x * 0.55, z * 0.55, 91, 3)) * g * 0.85 : 0) + smooth(0.25, 0.75, R[k]) * 0.5); // fbm only where grazed: most texels aren't
    d[k * 4] = Math.min(1, R[k]) * 255; d[k * 4 + 1] = G[k] * 255; d[k * 4 + 2] = g * 255; d[k * 4 + 3] = bare * 255;
  }
  return d;
}
