// Inside: the swept earth floor, the clay-filled log hearth with its four pot posts, the benches (орон)
// between the posts with hides on them, a horse-hide mat by the hearth, a little firewood.
import * as THREE from 'three/webgpu';
import { TAU, tube, merge, grid, xf } from './geom.js';
import { makeProfile } from './frame.js';
import { valueNoise, deg } from '../../util.js';

// benches run round the wall between the posts: 84 cm deep, their backs 12 cm off the wall poles
const B_OUT = makeProfile().rAtY(0.46) - 0.12;
export const BENCH = { rin: B_OUT - 0.84, rout: B_OUT, top: 0.46, hs: (14.6 * Math.PI) / 180 };
export const HEARTH = { half: 0.7, top: 0.235 }; // ~1.4 m square: about two square metres

// bays are centred between posts: 0° is the door (east), +90° south, −90° north
const BAYS = [
  { c: 30, hide: null },            // атах орон: humble guests by the door
  { c: 60, hide: [0, 1.3] },        // орто орон
  { c: 90, hide: [1, 2.1] },
  { c: 120, hide: [2, 3.7] },       // биллэрик: the honoured south-west
  { c: 150, hide: [3, 4.2] },       // бастыҥ орон
  { c: 180, hide: [1, 5.5] },       // кэтэҕириин: the family's place, west
  { c: 210, hide: [0, 6.1] },
  { c: 240, hide: [3, 7.9] },       // the women's (north) half
  { c: 270, hide: [1, 8.4] },
  { c: 300, hide: null },           // иһит ороно: the bench for vessels
];

// A box whose ends are cut along radial lines (a0, a1), between radii r0..r1 and heights y0..y1.
function sectorBox(a0, a1, r0, r1, y0, y1) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position, uv = g.attributes.uv;
  const len = ((r0 + r1) / 2) * (a1 - a0);
  for (let i = 0; i < p.count; i++) {
    const a = a0 + (a1 - a0) * (p.getX(i) + 0.5), r = r0 + (r1 - r0) * (p.getZ(i) + 0.5), y = y0 + (y1 - y0) * (p.getY(i) + 0.5);
    p.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    uv.setXY(i, uv.getX(i) * 0.2, uv.getY(i) * len);
  }
  g.computeVertexNormals();
  return g;
}

export function buildInterior(rng) {
  const G = { floor: [], plank: [], clay: [], poleIn: [], hide: [], hair: [] };
  const colliders = [], benchTargets = [];

  // ---- floor: a polar grid, hard earth with a slight dip round the hearth; its rim ends between the two bark
  // layers (inner at +0.042, outer from ~+0.054), so no earth lip shows outside the cover
  G.floor.push(grid(72, 16, (u, v) => {
    const a = u * TAU, r = 0.0001 + v * (makeProfile().rAtY(0) + 0.05);
    const y = 0.012 + valueNoise(Math.cos(a) * r * 2, Math.sin(a) * r * 2, 21) * 0.008 - Math.exp(-(((r - 1.05) / 0.3) ** 2)) * 0.006;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  }, (u, v) => [u, v], true));

  // ---- hearth: two courses of notched logs, clay filling, four short posts and a crossbar for pots
  const h = HEARTH.half;
  const log = (a, b, r, seed) => tube([new THREE.Vector3(...a), new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.004, (a[2] + b[2]) / 2), new THREE.Vector3(...b)].flatMap((p, i, arr) => i < arr.length - 1 ? [p, p.clone().lerp(arr[i + 1], 0.5)] : [p]),
    (t, an) => r * (1 + valueNoise(an * 2 + seed, t * 6, 4) * 0.08) * (1 - Math.abs(t - 0.5) * 0.08), 9, { capStart: true, capEnd: true });
  for (const s of [-1, 1]) {
    G.poleIn.push(log([-h - 0.12, 0.06, s * h], [h + 0.12, 0.06, s * h], 0.068, s * 3));
    G.poleIn.push(log([s * h, 0.165, -h - 0.12], [s * h, 0.165, h + 0.12], 0.064, s * 5 + 1));
  }
  // clay: a slab filling the box, domed slightly, burnt in the middle
  G.clay.push(grid(18, 18, (u, v) => {
    const x = (u - 0.5) * 2 * (h + 0.02), z = (v - 0.5) * 2 * (h + 0.02);
    const e = Math.max(Math.abs(x), Math.abs(z)) / h;
    const y = HEARTH.top - Math.max(0, e - 0.9) * 0.4 + valueNoise(x * 6, z * 6, 31) * 0.006 - Math.exp(-(x * x + z * z) / 0.08) * 0.02;
    return [x, y, z];
  }, (u, v) => [u, v], false));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (h + 0.02), z = sz * (h + 0.02), top = 0.62 + rng() * 0.08;
    G.poleIn.push(tube([new THREE.Vector3(x, -0.1, z), new THREE.Vector3(x + 0.005, top * 0.5, z), new THREE.Vector3(x, top, z - 0.004)], (t) => 0.042 - t * 0.008, 8, { capEnd: true }));
  }
  colliders.push({ x: 0, z: 0, hw: h + 0.12, hd: h + 0.12 });

  // ---- benches
  const R = BENCH;
  for (const bay of BAYS) {
    const c = deg(bay.c), hs = R.hs;
    // plank top: four planks running round the wall, mitred at the posts so neighbouring benches meet flush
    const a0 = c - deg(15), a1 = c + deg(15);
    const nP = 4, pw = (R.rout - R.rin) / nP;
    for (let k = 0; k < nP; k++) {
      const r0 = R.rin + pw * k + 0.006, r1 = R.rin + pw * (k + 1) - 0.006, th = 0.042 + rng() * 0.01, dy = (rng() - 0.5) * 0.006;
      G.plank.push(sectorBox(a0, a1, r0, r1, R.top - th + dy, R.top + dy));
    }
    // closed front apron, a squared front edge beam (plain), a back rail
    G.plank.push(sectorBox(a0, a1, R.rin - 0.05, R.rin + 0.03, R.top - 0.12, R.top - 0.035));
    G.plank.push(sectorBox(a0, a1, R.rin - 0.01, R.rin + 0.025, 0.0, R.top - 0.12));
    G.plank.push(sectorBox(a0, a1, R.rout - 0.1, R.rout - 0.02, R.top - 0.12, R.top - 0.045));
    const mid = (R.rin + R.rout) / 2;
    colliders.push({ x: Math.cos(c) * mid, z: Math.sin(c) * mid, hw: (R.rout - R.rin) / 2 + 0.03, hd: mid * Math.sin(hs) + 0.06, rot: -c + 0.02 });
    benchTargets.push({ c, mid });
    // hide: drapes over the front edge
    if (bay.hide) {
      const [kind, seed] = bay.hide;
      const span = hs * (0.62 + rng() * 0.25), off = (rng() - 0.5) * (hs - span);
      const rIn = R.rin - 0.14 + rng() * 0.04, rOut = R.rout - 0.12 - rng() * 0.25;
      const g = grid(16, 12, (u, v) => {
        const a = c + off + (u - 0.5) * 2 * span;
        let r = rIn + (rOut - rIn) * v, y = R.top + 0.02 + valueNoise(u * 4 + seed, v * 4, 2) * 0.012;
        if (r < R.rin + 0.02) { const d = R.rin + 0.02 - r; y = R.top + 0.02 - Math.min(d, 0.04) * 0.3 - Math.max(0, d - 0.04) * 1.6; r = Math.min(r, R.rin - 0.065 - Math.max(0, d - 0.04) * 0.1); }
        return [Math.cos(a) * r, y, Math.sin(a) * r];
      }, (u, v) => [u, v], true);
      const n = g.attributes.position.count, at = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { at[i * 2] = kind; at[i * 2 + 1] = seed; }
      g.setAttribute('aHide', new THREE.BufferAttribute(at, 2));
      G.hide.push(g);
    }
  }
  // horse-hide mat on the floor west of the hearth
  {
    const g = grid(12, 14, (u, v) => {
      const x = -1.42 + (u - 0.5) * 0.66, z = (v - 0.5) * 1.12 + 0.05;
      return [x, 0.022 + valueNoise(u * 3, v * 3, 13) * 0.006, z];
    }, (u, v) => [u, v], false);
    const n = g.attributes.position.count, at = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { at[i * 2] = 0; at[i * 2 + 1] = 9.3; }
    g.setAttribute('aHide', new THREE.BufferAttribute(at, 2));
    G.hide.push(g);
  }
  // firewood: a few split larch billets by the hearth's north-west corner
  for (let k = 0; k < 5; k++) {
    const x = -0.55 + k * 0.09 + rng() * 0.03, y = 0.045 + (k > 2 ? 0.08 : 0), z = -1.05 - rng() * 0.04;
    const len = 0.45 + rng() * 0.1, rr = 0.045 + rng() * 0.012, rot = (rng() - 0.5) * 0.3;
    const g = tube([new THREE.Vector3(0, 0, -len / 2), new THREE.Vector3(0, 0, len / 2)], (t, an) => rr * (Math.sin(an + k) > -0.2 ? 1 : 0.35), 7, { capStart: true, capEnd: true });
    G.poleIn.push(xf(g, { r: [0, Math.PI / 2 + rot, 0], p: [x + (k > 2 ? 0.045 : 0), y, z] }));
  }
  const geoms = {};
  for (const [k, list] of Object.entries(G)) geoms[k] = merge(list, k === 'hide' ? ['aHide'] : []);
  return { geoms, colliders, benchTargets };
}
