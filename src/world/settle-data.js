// Ground contact's vertex work (no three.js: a load worker runs it, src/load/worker.js; settle.js gathers it).
// Each mesh's vertices within FULL of its reference move by (surface − reference), fading out to FADE; the surface
// is the drawn ground (the tier's grid heights `mm`, N × N) raised by the rests overlapping the mesh.
import { Terrain } from './terrain.js';
import { drawnSampler } from './ground-data.js';
import { smooth } from '../util.js';

const FULL = 0.35, FADE = 0.8;

// the height at local (x, z) on a polar grid drawn linear over each cell's two triangles: { FN, FR, rim, nodes },
// nodes (FN + 1) × (FR + 1) by angle then ring, ring j at radius 0.0001 + j / FR × rim
export function polarAt({ FN, FR, rim, nodes }, x, z) {
  let a = Math.atan2(z, x); if (a < 0) a += 2 * Math.PI;
  const fs = (a / (2 * Math.PI)) * FN, ft = ((Math.hypot(x, z) - 0.0001) / rim) * FR, W = FN + 1;
  const i = Math.min(FN - 1, Math.floor(fs)), j = Math.max(0, Math.min(FR - 1, Math.floor(ft))), s = fs - i, t = ft - j;
  const hb = nodes[j * W + i + 1], hc = nodes[(j + 1) * W + i];
  if (s + t <= 1) { const ha = nodes[j * W + i]; return ha + s * (hb - ha) + t * (hc - ha); }
  const hd = nodes[(j + 1) * W + i + 1]; return hd + (1 - s) * (hc - hd) + (1 - t) * (hb - hd);
}

// a rest's height at world (x, z), -Infinity outside it (World.rests: circle `r` or box `hw`/`hd` turned by c, s;
// `polar`: its surface as drawn, placed at polar.x/y/z turned by polar.c/s, else the level `h`)
export function restAt(f, x, z) {
  const dx = x - f.x, dz = z - f.z;
  if (f.r !== undefined ? dx * dx + dz * dz >= f.r * f.r : Math.abs(dx * f.c - dz * f.s) >= f.hw || Math.abs(dx * f.s + dz * f.c) >= f.hd) return -Infinity;
  const P = f.polar;
  if (!P) return f.h;
  const px = x - P.x, pz = z - P.z;
  return P.y + polarAt(P, px * P.c - pz * P.s, px * P.s + pz * P.c);
}

// meshes: [{ pos, grime?, e: matrixWorld elements, ref: 'grime' | 'terrain' | level, level }] → per mesh
// { n: vertices moved, box: [min, max] as built, sphere: [x, y, z, r] after } (pos moved in place)
export function settleMeshes({ N, mm, pads, rests, meshes }) {
  const ground = drawnSampler(null, N, mm);
  let T = null;
  return meshes.map(({ pos: A, grime: G, e, ref, level }) => {
    const n3 = A.length, box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n3; i += 3) for (let k = 0; k < 3; k++) { const v = A[i + k]; if (v < box[k]) box[k] = v; if (v > box[k + 3]) box[k + 3] = v; }
    // the world box (no tilt or scale: settle.js checks) → the rests over it
    const xa = e[0] * box[0] + e[12], xb = e[0] * box[3] + e[12], xc = e[8] * box[2], xd = e[8] * box[5];
    const za = e[2] * box[0] + e[14], zb = e[2] * box[3] + e[14], zc = e[10] * box[2], zd = e[10] * box[5];
    const x0 = Math.min(xa, xb) + Math.min(xc, xd), x1 = Math.max(xa, xb) + Math.max(xc, xd);
    const z0 = Math.min(za, zb) + Math.min(zc, zd), z1 = Math.max(za, zb) + Math.max(zc, zd);
    const rs = rests.filter((f) => { const R = f.r ?? Math.hypot(f.hw, f.hd); return f.x + R > x0 && f.x - R < x1 && f.z + R > z0 && f.z - R < z1; });
    const terr = ref === 'terrain' && (T ||= Object.assign(new Terrain(), { pads }));
    let n = 0;
    for (let i = 0; i < n3; i += 3) {
      const lx = A[i], ly = A[i + 1], lz = A[i + 2];
      const x = e[0] * lx + e[8] * lz + e[12], y = ly + e[13], z = e[2] * lx + e[10] * lz + e[14];
      const h = G ? G[i / 3] : terr ? y - terr.heightFast(x, z) : y - level; // height over the reference
      if (h > FADE || h < -FADE) continue;
      const w = h < FULL ? 1 : 1 - smooth(FULL, FADE, h);
      let s = ground(x, z);
      for (const f of rs) { const r = restAt(f, x, z); if (r > s) s = r; }
      const d = s - (y - h);
      if (d !== 0) { A[i + 1] = ly + w * d; n++; }
    }
    // three's computeBoundingSphere: the box's centre, the farthest vertex
    let sphere = null;
    if (n) {
      const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n3; i += 3) for (let k = 0; k < 3; k++) { const v = A[i + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; }
      const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
      let r2 = 0;
      for (let i = 0; i < n3; i += 3) { const dx = A[i] - cx, dy = A[i + 1] - cy, dz = A[i + 2] - cz, q = dx * dx + dy * dy + dz * dz; if (q > r2) r2 = q; }
      sphere = [cx, cy, cz, Math.sqrt(r2)];
    }
    return { n, box, sphere };
  });
}
