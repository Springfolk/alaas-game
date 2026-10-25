// The land: one Central Yakutia alaas — a thermokarst hollow with a lake, a mown/grazed meadow,
// a ring of larch-birch taiga — and the summer homestead (сайылык) on its dry north slope.
// Pure functions of (x, z). North is −Z, east is +X. Metres.
import { fbm, smooth, lerp, clamp } from '../util.js';

export const ALAAS = { x: 0, z: 0, r: 330 };          // meadow edge (forest starts beyond)
export const LAKE = { x: 15, z: 40, r: 95, level: 90.6 };
export const HOME = { x: 0, z: -205 };                 // homestead centre (the uraha)
const RIM = 101;                                // taiga level around the hollow
const FLOOR = 91.4;

export class Terrain {
  constructor() {
    this.pads = []; // { x, z, r, h?, soft } flattened building platforms, added by the layout
  }
  addPad(x, z, r, soft = 4) {
    const p = { x, z, r, soft, h: this.base(x, z) };
    this.pads.push(p);
    return p.h;
  }
  // distance from the alaas centre, wobbled so the rim is not a circle
  rimDist(x, z) {
    const dx = x - ALAAS.x, dz = z - ALAAS.z;
    const a = Math.atan2(dz, dx);
    return Math.hypot(dx, dz) * (1 + 0.07 * Math.sin(a * 3 + 0.6) + 0.04 * Math.sin(a * 7 + 2.1));
  }
  lakeDist(x, z) {
    const dx = x - LAKE.x, dz = z - LAKE.z;
    const a = Math.atan2(dz, dx);
    const wob = 1 + 0.1 * Math.sin(a * 2 + 1.0) + 0.06 * Math.sin(a * 5 + 0.3) + fbm(x * 0.01, z * 0.01, 41) * 0.08;
    return Math.hypot(dx, dz) / wob;
  }
  base(x, z) {
    const rd = this.rimDist(x, z);
    // the hollow: flat floor, long gentle slope up to the taiga
    const bowl = smooth(170, 390, rd);
    let h = lerp(FLOOR, RIM, bowl);
    h += fbm(x * 0.004, z * 0.004, 7) * (1.2 + bowl * 2.5);   // swells
    h += fbm(x * 0.03, z * 0.03, 9) * 0.25;                    // hummocks (thermokarst ground)
    h += fbm(x * 0.0009, z * 0.0009, 3) * 6 * smooth(400, 900, rd); // far terrain
    // the lake basin and its marshy shore
    const ld = this.lakeDist(x, z);
    const shore = smooth(LAKE.r - 30, LAKE.r + 25, ld);
    h = lerp(LAKE.level - 2.4 + smooth(0, LAKE.r, ld) * 1.6, h, shore);
    h = Math.min(h, lerp(LAKE.level - 0.35, h, smooth(LAKE.r - 4, LAKE.r + 14, ld)));
    return h;
  }
  height(x, z) {
    let h = this.base(x, z);
    for (const p of this.pads) {
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r + p.soft) h = lerp(p.h, h, smooth(p.r, p.r + p.soft, d));
    }
    return h;
  }
  // height() bilinear between memoised samples every `step` m: for dense per-vertex lookups (the yard's
  // dirt-at-the-base attribute), where a millimetre does not matter and height() per vertex costs ~0.2 s at load
  heightFast(x, z, step = 0.25) {
    const m = this._hm ||= new Map();
    const fx = x / step, fz = z / step, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const at = (a, b) => { const k = a * 65536 + b; let h = m.get(k); if (h === undefined) m.set(k, h = this.height(a * step, b * step)); return h; };
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  }
  normal(x, z, out = [0, 1, 0], e = 0.6) {
    const hx = this.height(x + e, z) - this.height(x - e, z);
    const hz = this.height(x, z + e) - this.height(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out[0] = -hx / l; out[1] = 2 * e / l; out[2] = -hz / l;
    return out;
  }
  water(x, z, h = this.height(x, z)) {
    return h < LAKE.level && this.lakeDist(x, z) < LAKE.r + 20 ? LAKE.level : null;
  }
  // 0..1 how much taiga stands here
  forest(x, z) {
    const rd = this.rimDist(x, z);
    let f = smooth(300, 345, rd + fbm(x * 0.01, z * 0.01, 13) * 30);
    // birch groves straying onto the upper meadow
    f = Math.max(f, smooth(0.25, 0.5, fbm(x * 0.012, z * 0.012, 17)) * smooth(250, 300, rd) * 0.8);
    // the homestead's clearing; the birch/larch fringe begins 60–100 m behind it (north)
    const dh = Math.hypot(x - HOME.x, (z - HOME.z) * (z < HOME.z ? 0.7 : 1));
    f *= smooth(55, 90, dh);
    return clamp(f, 0, 1);
  }
  // splat weights for the ground material: forest floor, shore, trodden path, dry grass
  splat(x, z, h = this.height(x, z)) {
    const forest = smooth(0.25, 0.7, this.forest(x, z));
    const ld = this.lakeDist(x, z);
    const shore = 1 - smooth(LAKE.r + 1, LAKE.r + 12 + fbm(x * 0.05, z * 0.05, 5) * 6, ld);
    const dh = Math.hypot(x - HOME.x, z - HOME.z);
    let path = (1 - smooth(14, 30, dh)) * smooth(-0.2, 0.3, fbm(x * 0.08, z * 0.08, 23));
    for (const p of this.pads) path = Math.max(path, 1 - smooth(p.r * 0.6, p.r + 2.5, Math.hypot(x - p.x, z - p.z)));
    const dry = smooth(0.0, 0.5, fbm(x * 0.006, z * 0.006, 29)) * (1 - forest);
    return [forest, shore, path, dry];
  }
  surface(x, z) {
    const [forest, shore, path] = this.splat(x, z);
    if (this.water(x, z) !== null) return 'water';
    if (shore > 0.5) return 'mud';
    if (path > 0.5) return 'dirt';
    return forest > 0.5 ? 'forest' : 'grass';
  }
}
