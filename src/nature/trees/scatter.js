// Where the taiga's trees stand (pure CPU, so a worker can do it — src/load/worker.js; forest.js uses it):
// larch/birch/pine stems from terrain.forest(), the edge's young birch, shrubs; sorted near-to-far from the
// alaas centre. bySp: variant indices per kind; keep: clearings { x, z, r }; lineUp: `?trees` debug count.
import { LAKE, HOME } from '../../world/terrain.js';
import { fbm, smooth, mulberry32 } from '../../util.js';

export function scatterTrees(terrain, { bySp, keep, far, lineUp = 0 }) {
  const X = [], Z = [], Y = [], ROT = [], S = [], VI = [];
  const rng = mulberry32(4242);
  const place = (s, rMin, rMax) => {
    const n = Math.ceil(rMax / s);
    for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      const x = (i + 0.15 + rng() * 0.7) * s, z = (j + 0.15 + rng() * 0.7) * s;
      const rd = terrain.rimDist(x, z);
      if (rd < rMin || rd >= rMax) continue;
      let f = terrain.forest(x, z);
      if (f < 0.02) continue;
      // clumps and gaps: Yakutian larch forest is open and patchy
      const clump = smooth(-0.35, 0.25, fbm(x * 0.02, z * 0.02, 61)) * 0.6 + 0.45;
      if (rng() > f * clump) continue;
      if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const y = terrain.height(x, z);
      if (terrain.water(x, z, y) !== null) continue;
      // species: birch belts at the alaas edge and groves on the meadow, pine on dry patches
      const meadow = 1 - smooth(310, 350, rd);
      const birchy = smooth(0.05, 0.45, fbm(x * 0.004, z * 0.004, 71)) * 0.6 + (1 - smooth(330, 420, rd)) * 0.45 + meadow * 0.6;
      const piney = smooth(0.2, 0.45, fbm(x * 0.003, z * 0.003, 83)) * (1 - meadow);
      const r = rng();
      let sp;
      if (r < birchy * 0.75) sp = 'birch';
      else if (rng() < piney * 0.7) sp = 'pine';
      else sp = rng() < 0.05 ? 'deadLarch' : 'larch';
      X.push(x); Z.push(z); Y.push(y - 0.05); ROT.push(rng() * Math.PI * 2);
      // mostly mature stems with a share of young ones
      // regrowth patches (old burns, windfalls) and the alaas-facing edge hold more young trees
      const regrow = smooth(0.1, 0.45, fbm(x * 0.006, z * 0.006, 97)) * 0.45 + (1 - smooth(330, 380, rd)) * 0.25;
      const age = rng() < 0.18 + regrow ? 0.38 + rng() * 0.42 : 0.8 + rng() * 0.45;
      const youngBirch = sp === 'birch' && age < 0.8 && rng() < 0.7;
      const vs = bySp[youngBirch ? 'youngBirch' : sp];
      S.push(youngBirch ? 0.7 + rng() * 0.6 : age * (meadow > 0.5 ? 0.85 : 1));
      VI.push(vs[(rng() * vs.length) | 0]);
    }
  };
  // shrubs: wild rose and willow along the forest edge and in glades, willow on the lake shore
  const shrubs = (s) => {
    const n = Math.ceil(720 / s);
    for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      const x = (i + rng()) * s, z = (j + rng()) * s;
      const rd = terrain.rimDist(x, z);
      if (rd > 720) continue;
      const f = terrain.forest(x, z);
      const edge = f * (1 - f) * 4;
      const ld = terrain.lakeDist(x, z);
      const shore = smooth(LAKE.r + 10, LAKE.r + 16, ld) * (1 - smooth(LAKE.r + 24, LAKE.r + 38, ld));
      const p = edge * 0.5 + f * 0.05 + shore * 0.12;
      if (rng() > p) continue;
      if (Math.hypot(x - HOME.x, z - HOME.z) < 70) continue;
      if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const y = terrain.height(x, z);
      if (terrain.water(x, z, y) !== null) continue;
      const kind = shore > 0.3 || rng() < 0.35 ? 'willow' : 'rose';
      const vs = bySp[kind];
      X.push(x); Z.push(z); Y.push(y - 0.03); ROT.push(rng() * Math.PI * 2); S.push(0.7 + rng() * 0.6);
      VI.push(vs[(rng() * vs.length) | 0]);
    }
  };
  // debug: `?trees` lines every variant up on the meadow at z = −120 (x = −60 + 9·i), plus shrubs
  for (let i = 0; i < lineUp; i++) { const x = -60 + i * 9, z = -120; X.push(x); Z.push(z); Y.push(terrain.height(x, z)); ROT.push(0); S.push(1); VI.push(i); }
  // the edge steps down into the meadow: scattered young birch (some larch) out ahead of the wall
  const ecotone = (sp0) => {
    const n = Math.ceil(400 / sp0);
    for (let j = -n; j < n; j++) for (let i = -n; i < n; i++) {
      const x = (i + rng()) * sp0, z = (j + rng()) * sp0;
      const rd = terrain.rimDist(x, z);
      if (rd < 265 || rd > 345) continue;
      const f = terrain.forest(x, z);
      if (f > 0.55) continue;
      const out = smooth(265, 330, rd) * smooth(-0.25, 0.25, fbm(x * 0.03, z * 0.03, 53));
      if (rng() > out * 0.55) continue;
      if (Math.hypot(x - HOME.x, (z - HOME.z) * 0.8) < 70) continue;
      if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
      const y = terrain.height(x, z);
      if (terrain.water(x, z, y) !== null) continue;
      const young = rng() < 0.8;
      const vs = bySp[young ? 'youngBirch' : 'larch'];
      X.push(x); Z.push(z); Y.push(y - 0.05); ROT.push(rng() * Math.PI * 2);
      S.push(young ? 0.6 + rng() * 0.6 * smooth(265, 340, rd) : 0.3 + rng() * 0.3);
      VI.push(vs[(rng() * vs.length) | 0]);
    }
  };
  ecotone(5);
  place(4.6, 0, 650);
  place(6.5, 650, far);
  shrubs(7);
  // near-to-far from the alaas centre, so the impostors draw front to back for anyone in the alaas
  const order = X.map((_, k) => k).sort((a, b) => Math.hypot(X[a], Z[a]) - Math.hypot(X[b], Z[b]));
  const N = X.length;
  const pick = (A, T) => T.from(order.map((k) => A[k]));
  // how deep in the forest each tree stands (0 at the edge → 1 inside): interior trees are shaded by others
  const DEPTH = Float32Array.from(order.map((k) => smooth(318, 375, terrain.rimDist(X[k], Z[k])) * smooth(0.35, 0.85, terrain.forest(X[k], Z[k]))));
  const trees = { N, DEPTH, X: pick(X, Float32Array), Z: pick(Z, Float32Array), Y: pick(Y, Float32Array), ROT: pick(ROT, Float32Array), S: pick(S, Float32Array), VI: pick(VI, Uint8Array) };

  return trees;
}
