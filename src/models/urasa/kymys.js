// The kymys corner (north side, by the door): the smoked leather sack симиир on its low platform with the
// stirrer хамнатар in its wooden collar, the everyday ladle хамыйах hooked on the collar, carved chorons
// on a low board, birch-bark buckets ыаҕас (a milking one and a horsehair-stitched festive one).
import * as THREE from 'three/webgpu';
import { TAU, tube, lathe, merge, beam, grid, xf } from './geom.js';
import { R_POST } from './frame.js';
import { valueNoise, deg } from '../../util.js';

// the ladle's hook radius and its hang (rad about the sack's z: its handle's tilt off the horizontal), the lowest that
// keeps it 5 mm or more off the sack's shoulder (`sackAt`)
export const LADLE = { hookR: 0.021, hang: 0.87 };
const P2 = (r, a, y = 0) => [Math.cos(a) * r, y, Math.sin(a) * r];
const setUV = (g, fn) => { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) { const [a, b] = fn(uv.getX(i), uv.getY(i), p.getX(i), p.getY(i), p.getZ(i), i); uv.setXY(i, a, b); } return g; };
const plain = (g, k = 10) => setUV(g, (u, v) => [u + k, v]);

// ---- chorons: lathe bodies; outer vertices get uv.y = height fraction (carving bands), inner ones plain
// (uv.y 2..3 = the height fraction inside the bowl); `segs` round
function choronBody(prof, lipIndex, H, u0 = 0, segs = 28) {
  const g = lathe(prof, segs, (r, y, a) => r * (1 + valueNoise(a * 2, y * 30, 17) * 0.006));
  return setUV(g, (u, v, x, y, z, i) => {
    const row = Math.floor(i / (segs + 1));
    return row <= lipIndex ? [u + u0, y / H] : [u + 10, 2 + y / H];
  });
}
function choronA(scale = 1, segs = 28) {
  // standard choron on a conical foot: 22 cm, bowl 14 cm, lip 12.5 cm, raised rings
  const P = [[0.001, 0], [0.055, 0], [0.056, 0.006], [0.054, 0.013], [0.044, 0.017], [0.034, 0.035], [0.026, 0.055], [0.022, 0.07],
    [0.026, 0.075], [0.04, 0.085], [0.052, 0.098], [0.058, 0.11], [0.063, 0.125], [0.0665, 0.128], [0.068, 0.14], [0.07, 0.152],
    [0.068, 0.165], [0.0705, 0.169], [0.065, 0.178], [0.059, 0.188], [0.0585, 0.192], [0.0605, 0.194], [0.0575, 0.196], [0.0605, 0.198],
    [0.0565, 0.2], [0.059, 0.21], [0.0625, 0.219], [0.06, 0.2225],
    // inside
    [0.056, 0.221], [0.052, 0.21], [0.052, 0.19], [0.06, 0.15], [0.052, 0.115], [0.03, 0.093], [0.001, 0.088]];
  const S = P.map(([r, y]) => [r * scale, y * scale]);
  const g = choronBody(S, 27, 0.22 * scale, 0, segs);
  g.userData.inner = S.slice(28);
  return g;
}
function choronB() {
  // three-legged choron үс атахтаах, after REM 12175-2 (17 cm): outer profile from the photo's silhouette
  // (docs/patterns.md); uv.x in 2..3 → its traced bands (carving/chorons.webp, green)
  const P = [[0.001, 0.05], [0.03, 0.0505], [0.0382, 0.052], [0.0395, 0.0543], [0.0434, 0.0574], [0.0465, 0.0605], [0.0492, 0.0637],
    [0.0514, 0.0668], [0.0534, 0.0699], [0.0551, 0.0731], [0.0563, 0.0762], [0.0571, 0.0793], [0.0577, 0.0824], [0.058, 0.0856],
    [0.0581, 0.0887], [0.0579, 0.0918], [0.0577, 0.0949], [0.057, 0.098], [0.0564, 0.1012], [0.0554, 0.1043], [0.0542, 0.1074],
    [0.0525, 0.1105], [0.0508, 0.1137], [0.0488, 0.1168], [0.0468, 0.1199], [0.045, 0.123], [0.0437, 0.1262], [0.0426, 0.1293],
    [0.0424, 0.1324], [0.0424, 0.1356], [0.0426, 0.1387], [0.0428, 0.1418], [0.0434, 0.1449], [0.044, 0.148], [0.0446, 0.1512],
    [0.0453, 0.1543], [0.046, 0.1574], [0.0467, 0.1605], [0.0474, 0.1637], [0.0478, 0.1668], [0.0467, 0.1699],
    // lip and inside
    [0.0445, 0.1702], [0.043, 0.166], [0.0386, 0.14], [0.0386, 0.128], [0.0525, 0.09], [0.046, 0.069], [0.026, 0.0595], [0.001, 0.057]];
  const parts = [choronBody(P, 40, 0.17, 2)];
  const inner = P.slice(41);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + 0.3;
    const top = new THREE.Vector3(Math.cos(a) * 0.032, 0.058, Math.sin(a) * 0.032);
    const foot = new THREE.Vector3(Math.cos(a) * 0.066, 0.012, Math.sin(a) * 0.066);
    const mid = top.clone().lerp(foot, 0.5).add(new THREE.Vector3(Math.cos(a) * 0.004, 0, Math.sin(a) * 0.004));
    parts.push(plain(tube([top, mid, foot], (t) => 0.0075 - t * 0.002, 8, { capStart: true })));
    // hoof: a little flattened cap with a notch at the front
    const hoof = lathe([[0.001, 0], [0.011, 0], [0.0115, 0.008], [0.0085, 0.02], [0.006, 0.024], [0.001, 0.024]], 10, (r, y, an) => r * (1 - 0.35 * Math.max(0, Math.cos(an)) ** 8));
    parts.push(plain(xf(hoof, { ry: -a, p: [foot.x, 0, foot.z], s: [1.15, 1, 1] })));
  }
  const g = merge(parts);
  g.userData.inner = inner;
  return g;
}

// kymys levels in the guest's choron (cup space, upright, m): left after drinking / ladled full
export const KYMYS = { left: 0.12, full: 0.185 };

// ---- kymys in a choron: a surface kept level in the world inside the bowl, holding its volume as the cup tilts.
// `inner` = the bowl's inside profile [[r, y], …] in cup space. K.vol (m³) is what it holds (`volAt(level)`: the
// upright volume up to a level). fit(up) (`up` = world up in cup space) finds the plane that holds K.vol and draws
// it as a fan inside the bowl; what would rise over the lip spills: K.vol drops to the tilted bowl's `capacity`.
function kymysSurface(inner, mat, cup, level) {
  const prof = [...inner].sort((a, b) => a[1] - b[1]);
  const y0 = prof[0][1], top = prof[prof.length - 1][1] - 0.006;
  const rIn = (y) => {
    if (y <= prof[0][1]) return prof[0][0];
    for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [ra, ya] = prof[i - 1], [rb, yb] = prof[i]; return ra + (rb - ra) * (y - ya) / (yb - ya); }
    return prof[prof.length - 1][0];
  };
  const rTop = rIn(top);
  // volume under the plane p·u = H: the bowl as NS stacked discs, each cut by a chord in closed form
  // (G = ∫ over the chord's distance c from the middle of the disc's area on its side)
  const NS = 32, dy = (top - y0) / NS, sr = new Float64Array(NS);
  for (let i = 0; i < NS; i++) sr[i] = rIn(y0 + (i + 0.5) * dy);
  const G = (R, c) => c <= -R ? 0 : c >= R ? Math.PI * R * R * c
    : Math.PI * R * R * c - R * R * (c * Math.acos(c / R) - Math.sqrt(R * R - c * c)) - (R * R - c * c) ** 1.5 / 3;
  const volume = (u, s, H) => {
    let v = 0;
    for (let i = 0; i < NS; i++) {
      const ya = y0 + i * dy, R = sr[i];
      v += s < 1e-7 ? Math.PI * R * R * Math.min(dy, Math.max(0, H / u.y - ya)) : (s / u.y) * (G(R, (H - u.y * ya) / s) - G(R, (H - u.y * (ya + dy)) / s));
    }
    return v;
  };
  const brim = (u, s) => top * u.y - rTop * s; // the lip's lowest point along up
  const N = 48, pos = new Float32Array((N + 2) * 3), nor = new Float32Array((N + 2) * 3), idx = [];
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); // refitted (src/load/release.js keeps it)
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  const fuv = new Float32Array((N + 2) * 2); // uv.x: 0 in the middle, 1 at the wall (the froth ring, the thin edge)
  for (let i = 0; i <= N; i++) { fuv[(i + 1) * 2] = 1; fuv[(i + 1) * 2 + 1] = i / N; }
  g.setAttribute('uv', new THREE.BufferAttribute(fuv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = false; mesh.userData.noShadow = true; mesh.userData.dynamic = true;
  cup.add(mesh);
  const UP = new THREE.Vector3(0, 1, 0), c0 = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3();
  const inside = (q) => q.y >= y0 && q.y <= top && Math.hypot(q.x, q.z) <= rIn(q.y);
  const K = {
    mesh, top, rTop,
    volAt: (lvl) => volume(UP, 0, lvl),
    capacity: (u) => { const s = Math.hypot(u.x, u.z); return volume(u, s, brim(u, s)); },
    // the tilt (rad) at which the bowl holds exactly v
    tiltFor(v) {
      let a = 0, b = 1.3;
      for (let k = 0; k < 24; k++) { const m = (a + b) / 2; if (K.capacity(d.set(Math.sin(m), Math.cos(m), 0)) > v) a = m; else b = m; }
      return (a + b) / 2;
    },
    fit(u = UP) {
      if (u.y < 0.05) { K.vol = 0; mesh.visible = false; return; } // on its side or upside down: all out
      const s = Math.hypot(u.x, u.z), hi = brim(u, s);
      K.vol = Math.min(K.vol, volume(u, s, hi)); // over the lip: spilled (or drunk)
      // the bowl's deepest point along up, then the plane's offset that holds K.vol (bisection)
      let lo = 1e9, dr = 0, dyy = y0;
      for (const [r, y] of prof) if (y * u.y - r * s < lo) { lo = y * u.y - r * s; dr = r; dyy = y; }
      let a = lo, b = hi;
      for (let k = 0; k < 22; k++) { const m = (a + b) / 2; if (volume(u, s, m) < K.vol) a = m; else b = m; }
      const H = (a + b) / 2;
      // the fan's middle: above the deepest point (inside the pool however far the cup tilts)
      c0.set(s > 1e-7 ? -dr * u.x / s : 0, dyy, s > 1e-7 ? -dr * u.z / s : 0);
      c0.addScaledVector(u, H - c0.dot(u));
      mesh.visible = H - lo > 1e-4;
      e1.set(u.y, -u.x, 0).normalize(); e2.crossVectors(e1, u);
      pos.set([c0.x, c0.y, c0.z], 0);
      for (let i = 0; i <= N; i++) {
        const an = (i / N) * TAU;
        d.copy(e1).multiplyScalar(Math.cos(an)).addScaledVector(e2, Math.sin(an));
        // where the plane meets the wall along this direction: step out to the first miss, then bisect
        let t0 = 0, t1 = 0.006;
        while (t1 < 0.2 && inside(p.copy(c0).addScaledVector(d, t1))) { t0 = t1; t1 += 0.006; }
        for (let k = 0; k < 9; k++) { const m = (t0 + t1) / 2; if (inside(p.copy(c0).addScaledVector(d, m))) t0 = m; else t1 = m; }
        p.copy(c0).addScaledVector(d, t0 + 0.0015); // tucked into the wall
        pos.set([p.x, p.y, p.z], (i + 1) * 3);
      }
      for (let i = 0; i < N + 2; i++) nor.set([u.x, u.y, u.z], i * 3);
      g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true;
      g.computeBoundingSphere();
    },
  };
  K.vol = K.volAt(level);
  K.fit();
  return K;
}

// ---- the leather sack: flattened, slightly triangular, two welted side seams; the neck rounds and gathers over the
// wooden collar (its lower 5 cm, under the horsehair cord), centred on it. `sackAt(u, v)` = a point of its surface.
const SACK_H = 0.83, NECK_R = 0.0645; // the collar's outer radius is 0.062
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function sackAt(u, v) {
  const a = u * TAU;
  // full of milk: a heavy rounded belly, sloping shoulders, a narrow creased neck
  const f = v < 0.32 ? 1 : Math.pow(1 - (v - 0.32) / 0.68, 1.5);
  let w = 0.068 + (0.29 - 0.068) * f, d = 0.068 + (0.21 - 0.068) * f;
  const belly = 1 + 0.08 * Math.sin(Math.min(1, v / 0.45) * Math.PI);
  w *= belly; d *= belly;
  const top = sstep(0.88, 0.975, v); // 0 → 1 over the neck's last 8 cm: round, smooth, tight on the collar
  if (v > 0.75) { const cr = Math.sin(v * 70 + a * 2) * 0.006 * Math.min(1, (v - 0.75) / 0.15) * (1 - top); w += cr; d += cr; }
  if (v < 0.06) { const k = Math.sqrt(v / 0.06); w *= 0.55 + 0.45 * k; d *= 0.5 + 0.5 * k; }
  w += (NECK_R - w) * top; d += (NECK_R - d) * top;
  const ca = Math.cos(a), sa = Math.sin(a), e = 0.75 + 0.25 * top;
  const sup = (x) => Math.sign(x) * Math.pow(Math.abs(x), e); // squarish section, round on the collar
  let x = sup(ca) * w, z = sup(sa) * d;
  // welt along the side seams (a = 0, π)
  const seam = Math.exp(-((sa / 0.08) ** 2));
  x += Math.sign(ca) * seam * 0.012 * (1 - top);
  const n = (valueNoise(a * 2.5, v * 5, 41) * 0.012 + valueNoise(a * 7, v * 14, 43) * 0.004) * (1 - top);
  x *= 1 + n * 3; z *= 1 + n * 3;
  const y = v < 0.06 ? Math.sqrt(v / 0.06) * 0.03 : 0.03 + (v - 0.06) / 0.94 * (SACK_H - 0.03);
  return [x + 0.045 * v * v * (1 - v * v), y, z]; // the belly sags a little to one side; the neck stands centred on the collar
}
function sackGeom() {
  return grid(36, 40, sackAt, (u, v) => [u, v], false);
}

export function buildKymys(rng, M) {
  const group = new THREE.Group();
  const add = (g, m, parent = group) => { const o = new THREE.Mesh(g, m); parent.add(o); return o; };
  const colliders = [];
  const birch = [], hair = [], bark = [];

  // ---- platform and sack
  const aS = deg(-35), rS = R_POST - 0.42; // near the wall, inside the post ring, the stirrer well clear of the poles
  const sackRoot = new THREE.Group();
  sackRoot.position.set(...P2(rS, aS));
  sackRoot.rotation.y = -aS + Math.PI / 2; // sack width runs along the wall
  group.add(sackRoot);
  const plat = [];
  // three boards a little wider than the sack's belly, resting on two bearers (their ends under the outer boards)
  for (let k = 0; k < 3; k++) plat.push(beam([-0.37, 0.135, -0.2 + k * 0.2], [0.37, 0.135, -0.2 + k * 0.2], 0.19, 0.035, 0.005));
  for (const s of [-1, 1]) plat.push(beam([s * 0.26, 0.06, -0.28], [s * 0.26, 0.06, 0.28], 0.08, 0.12, 0.008));
  add(merge(plat), M.plank, sackRoot);
  const sack = add(sackGeom(), M.leather, sackRoot);
  sack.position.y = 0.152;
  const neckY = 0.152 + SACK_H, collarY = neckY - 0.01, collarTop = collarY + 0.04; // the leather ends 3 cm under the collar's top
  const collar = plain(lathe([[0.035, -0.04], [0.06, -0.04], [0.062, -0.03], [0.058, 0], [0.062, 0.03], [0.06, 0.04], [0.035, 0.04], [0.035, -0.04]], 20));
  const collarM = add(xf(collar, { p: [0, collarY, 0] }), M.birch, sackRoot);
  collarM.userData.noShadow = true;
  // horsehair cord tied round the neck over the collar, and a rope from the neck to the post
  for (let w = 0; w < 3; w++) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * 0.069, neckY - 0.03 + w * 0.009, Math.sin(a) * 0.069)); }
    hair.push(tube(pts, () => 0.0045, 5));
  }
  // stirrer хамнатар: birch pole, perforated cap below (inside), knob with incised rings and a white tuft
  const stirrer = new THREE.Group();
  sackRoot.add(stirrer);
  const sp = [plain(tube([new THREE.Vector3(0, 0.45, 0), new THREE.Vector3(0.002, 1.0, 0), new THREE.Vector3(0, 1.52, 0.003)], () => 0.0155, 10))];
  sp.push(plain(lathe([[0.001, 0.43], [0.05, 0.43], [0.052, 0.445], [0.035, 0.47], [0.016, 0.475]], 16)));
  sp.push(plain(lathe([[0.012, 1.5], [0.02, 1.512], [0.026, 1.53], [0.0245, 1.535], [0.026, 1.54], [0.024, 1.546], [0.0255, 1.552], [0.02, 1.568], [0.001, 1.575]], 16)));
  add(merge(sp), M.birch, stirrer);
  const tuft = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + rng(), l = 0.08 + rng() * 0.05;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(Math.cos(a) * (0.018 + t * 0.02), 1.495 - t * l, Math.sin(a) * (0.018 + t * 0.02))); }
    tuft.push(setUV(tube(pts, (t) => 0.004 * (1 - t * 0.7), 4), (u, v) => [u + 30, v]));
  }
  const tuftMesh = add(merge(tuft), M.hair, stirrer);
  tuftMesh.userData.noShadow = true;
  stirrer.position.y = neckY - 1.06; // the pole stands in the sack, knob ~0.5 m above the collar

  // ---- the ladle (удьаа kind): deep bowl, a handle rising off the rim and running straight on to a hook; hung by the
  // hook astride the collar's wall on the side along the wall (−x), the handle down over the sack's shoulder, clear
  // of it (the room side stays clear for the look that churns)
  const ladle = new THREE.Group();
  {
    const bowl = lathe([[0.001, -0.06], [0.03, -0.055], [0.045, -0.04], [0.053, -0.02], [0.055, 0], [0.051, 0.002], [0.049, -0.018], [0.042, -0.036], [0.028, -0.05], [0.001, -0.055]], 22);
    xf(bowl, { s: [1.0, 1, 0.82] });
    const hy = (t) => 0.004 + 0.085 * (1 - (1 - t) ** 3), path = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; path.push(new THREE.Vector3(0.048 + t * 0.3, hy(t), 0)); }
    // the end bends up so that, hung, its shank stands upright; then the hook: a little over a half turn, ~3 cm
    // inside, astride the collar's wall
    const HR = LADLE.hookR, th = LADLE.hang, e = path[path.length - 1].clone();
    let h = 0;
    const arc = (R, turn, n) => { // a turtle along an arc (turn > 0: to the left)
      const c = new THREE.Vector3(e.x - Math.sin(h) * R * Math.sign(turn), e.y + Math.cos(h) * R * Math.sign(turn), 0), a0 = h - Math.sign(turn) * Math.PI / 2;
      for (let i = 1; i <= n; i++) { const a = a0 + turn * i / n; path.push(new THREE.Vector3(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, 0)); }
      h += turn; e.copy(path[path.length - 1]); return c;
    };
    arc(0.03, Math.PI / 2 - th, 4);
    const hook = arc(HR, -Math.PI * 1.05, 9);
    const handle = tube(path, (t, an) => Math.hypot(Math.cos(an) * 0.0065, Math.sin(an) * 0.011) * (t < 0.06 ? 1.25 : 1) * (1 - t * 0.3), 8, { capEnd: true });
    // three turned rings round the handle's root, square to it
    const rings = [0.075, 0.085, 0.095].map((x) => { const t = (x - 0.048) / 0.3, th = Math.atan2(0.255 * (1 - t) ** 2, 0.3); return xf(lathe([[0.0125, -0.002], [0.015, 0], [0.0125, 0.002]], 10), { r: [0, 0, th - Math.PI / 2], p: [x, hy(t), 0] }); });
    add(merge([plain(bowl), plain(handle), ...rings.map((g) => plain(g))]), M.birch, ladle);
    // the hook's centre over the middle of the collar's wall, its inside resting on the rim
    const cx = hook.x * Math.cos(th) - hook.y * Math.sin(th), cy = hook.x * Math.sin(th) + hook.y * Math.cos(th);
    ladle.rotation.set(0, 0, th);
    ladle.position.set(-0.0485 - cx, collarTop - 0.006 - cy, 0);
    sackRoot.add(ladle);
  }

  // ---- board with chorons
  const aB = deg(-22), rB = R_POST - 0.85;
  const boardRoot = new THREE.Group();
  boardRoot.position.set(...P2(rB, aB));
  boardRoot.rotation.y = -aB + Math.PI / 2;
  group.add(boardRoot);
  const bd = [beam([-0.38, 0.1, 0], [0.38, 0.1, 0], 0.3, 0.035, 0.006)];
  for (const s of [-1, 1]) bd.push(beam([s * 0.27, 0.04, -0.13], [s * 0.27, 0.04, 0.13], 0.06, 0.08, 0.008));
  add(merge(bd), M.plank, boardRoot);
  const chorons = new THREE.Group();
  boardRoot.add(chorons);
  const hero = add(choronA(1, 56), M.birch, chorons); // held at the face: rounder
  hero.position.set(0.02, 0.118, 0.01);
  const b = add(choronB(), M.birch, chorons);
  b.position.set(-0.22, 0.118, -0.02); b.rotation.y = 0.4;
  const small = add(choronA(0.77), M.birch, chorons);
  small.position.set(0.24, 0.118, 0.03);
  // kymys in each: the guest's choron a quarter full (the act ladles it up), the others well filled
  const kymys = [[hero, KYMYS.left], [b, 0.15], [small, 0.15]].map(([cup, lvl]) => kymysSurface(cup.geometry.userData.inner, M.kymys, cup, lvl));
  // a lock of white mane hair tied to one leg of the three-legged choron
  {
    const tf = [];
    for (let k = 0; k < 6; k++) {
      const pts = [];
      for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(new THREE.Vector3(0.037 + t * 0.022 + k * 0.002, 0.05 - t * 0.04, 0.012 + (k - 3) * 0.003)); }
      tf.push(setUV(tube(pts, () => 0.0016, 3), (u, v) => [u + 30, v]));
    }
    const m = add(merge(tf), M.hair, b);
    m.userData.noShadow = true;
  }

  // ---- birch-bark buckets (docs/patterns.md). festive: the kumys bucket of Jochelson 1933, Fig. 100 (AMNH 70-8862):
  // groups of rolls wound with black-and-white horsehair, heights and roll sizes measured on the figure (24 cm tall).
  // everyday: the stitching of REM 12175-6 — a whip-stitched lip roll, a cross-stitched hoop under it, a whip-stitched
  // cord round the base (pitches measured against the photo's scale bar).
  const ring = (y, r, rad, opt = {}) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
    return tube(pts, () => rad, 6, opt);
  };
  // wound roll: hair-braid stripes (horsehair material, uv.x ≥ 5); the stripe pitch along the roll = 1 / (28 · uvScale)
  const wound = (y, r, rad, pitch, flip = false) => setUV(ring(y, r, rad, { uvScale: 1 / (28 * pitch) }), (u, v) => [(flip ? 1 - u : u) + 10, v]);
  const bucket = (h, rb, rt, festive) => {
    const n = 14;
    const R = (y) => rb + (rt - rb) * (y / h);
    const outer = [], inner = [];
    for (let i = 0; i <= n; i++) { const t = i / n; outer.push([rb + (rt - rb) * t, 0.004 + t * (h - 0.004)]); }
    for (let i = n; i >= 0; i--) { const t = i / n; inner.push([(rb + (rt - rb) * t) - 0.005, 0.012 + t * (h - 0.016)]); }
    const circ = TAU * rt;
    const go = lathe(outer, 32, (r, y, a) => r * (1 + valueNoise(a * 2, y * 10, 51) * 0.012));
    setUV(go, (u, v, x, y) => [u * circ / 1.6, y / 0.62 + 0.2]);
    const gi = lathe(inner, 32);
    setUV(gi, (u, v, x, y) => [u * circ / 1.6 + 10, y / 0.62]);
    // gi was built top → bottom so its faces point inwards
    const base = lathe([[rb - 0.005, 0.012], [0.001, 0.012]], 24);
    setUV(base, (u, v, x, y, z) => [x * 2 + 10.5, z * 2 + 0.5]);
    bark.push(go, gi, base);
    if (festive) {
      // Fig. 100, rows from the top: plain lip roll; rim group = rope roll, a plaited band (two counter-wound rolls),
      // rope roll; middle and lower groups = rope roll, bare dark hoop, rope roll; a wound roll round the base.
      // [height m, roll radius m, kind]: w = wound, f = wound the other way, d = dark hoop, p = plain willow
      const P = 0.0025; // strand pitch on the figure (8 px at 24 cm / 778 px)
      for (const [y, rr, k] of [[0.2394, 0.0025, 'p'], [0.2329, 0.004, 'w'], [0.22, 0.0043, 'w'], [0.2113, 0.0043, 'f'], [0.199, 0.004, 'w'],
        [0.1441, 0.0046, 'w'], [0.1314, 0.0068, 'd'], [0.1206, 0.004, 'w'], [0.0827, 0.0046, 'w'], [0.0722, 0.005, 'd'], [0.0629, 0.0037, 'w'], [0.008, 0.008, 'w']]) {
        const r = R(y) + rr * 0.8;
        if (k === 'p') birch.push(plain(ring(y, r, rr)));
        else if (k === 'd') hair.push(ring(y, r, rr));
        else hair.push(wound(y, r, rr, P, k === 'f'));
      }
    } else {
      // 12175-6: lip roll whip-stitched every 5.7 mm; hoop below cross-stitched from holes every 7.2 mm, each hole
      // sending two strands up over the hoop ±0.67 of the pitch; base cord whip-stitched every 6.9 mm
      hair.push(wound(h - 0.003, R(h) + 0.002, 0.003, 0.0057));
      const yc = h - 0.015, rh = R(yc) + 0.004;
      birch.push(plain(ring(yc, rh, 0.008)));
      const p = 0.0072, nh = Math.round(TAU * rh / p);
      for (let i = 0; i < nh; i++) {
        const a = (i / nh) * TAU;
        for (const s of [-1, 1]) {
          const b = a + s * 0.67 * TAU / nh, pts = [];
          for (let k = 0; k <= 6; k++) { // round the hoop's section from below to its top
            const f = k / 6, ph = -Math.PI / 2 + f * Math.PI, aa = a + (b - a) * f, rr = rh + Math.cos(ph) * 0.0089;
            pts.push(new THREE.Vector3(Math.cos(aa) * rr, yc + Math.sin(ph) * 0.0089, Math.sin(aa) * rr));
          }
          hair.push(tube(pts, () => 0.0009, 3));
        }
      }
      hair.push(wound(0.012, R(0.012) + 0.003, 0.003, 0.0069));
    }
    // braided horsehair handle, lying over to one side
    const hp = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * Math.PI; hp.push(new THREE.Vector3(Math.cos(a) * rt * 0.98, h - 0.02 + Math.sin(a) * 0.12 * 0.35, Math.sin(a) * 0.13 * Math.cos(t * 0.5) + 0.0)); }
    for (const p of hp) { const yy = p.y - (h - 0.02); p.y = h - 0.02 + yy * 0.4; p.z += yy * 0.9; }
    hair.push(setUV(tube(hp, () => 0.006, 6), (u, v) => [u + 10, v]));
  };
  // build each bucket in its own frame, then move it
  const placeBucket = (args, at, ry) => {
    const n0 = { bark: bark.length, birch: birch.length, hair: hair.length };
    bucket(...args);
    const T = (arr, from) => { for (let i = from; i < arr.length; i++) xf(arr[i], { ry, p: at }); };
    T(bark, n0.bark); T(birch, n0.birch); T(hair, n0.hair);
  };
  // on the floor in front of the north bench's end, and between the chorons' board and the door post
  const posA = P2(3.7, deg(-44)), posB = P2(4.25, deg(-21));
  placeBucket([0.24, 0.13, 0.1225, true], posA, 0.6); // Fig. 100: wider at the base
  placeBucket([0.24, 0.11, 0.12, false], posB, 2.0);
  // rope from the sack's neck to the nearest post (−45°)
  {
    const pa = -45 * Math.PI / 180, post = new THREE.Vector3(...P2(R_POST - 0.1, pa, 1.12));
    const neck = new THREE.Vector3(0, neckY - 0.03, 0).applyMatrix4(new THREE.Matrix4().compose(sackRoot.position, sackRoot.quaternion, new THREE.Vector3(1, 1, 1)));
    const pts = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; const p = neck.clone().lerp(post, t); p.y -= Math.sin(t * Math.PI) * 0.05; pts.push(p); }
    hair.push(tube(pts, () => 0.005, 5));
  }

  // merge the static parts into the corner group (world-of-model coordinates)
  const toModel = (root, geoms) => { root.updateMatrix(); return geoms.map((g) => g.applyMatrix4(root.matrix)); };
  const neckHair = toModel(sackRoot, hair.splice(0, 3));
  const buckets = new THREE.Group();
  group.add(buckets);
  add(merge(bark), M.vessel, buckets);
  add(merge([...birch]), M.birch, buckets);
  const hm = add(merge([...hair, ...neckHair]), M.hair);
  hm.userData.noShadow = true;

  // colliders (model-local)
  colliders.push({ x: Math.cos(aS) * rS, z: Math.sin(aS) * rS, hw: 0.36, hd: 0.36, rot: -aS });
  colliders.push({ x: Math.cos(aB) * rB, z: Math.sin(aB) * rB, hw: 0.17, hd: 0.4, rot: -aB });
  colliders.push({ x: posA[0], z: posA[2], r: 0.15 }, { x: posB[0], z: posB[2], r: 0.15 });

  return { group, sackRoot, sack, stirrer, ladle, chorons, hero, heroKymys: kymys[0], buckets, colliders, neckY, boardRoot };
}
