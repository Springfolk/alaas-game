// The kymys corner (north side, by the door): the smoked leather sack симиир on its low platform with the
// stirrer хамнатар in its wooden collar, the everyday ladle хамыйах hooked on the collar, carved chorons
// on a low board, birch-bark buckets ыаҕас (a milking one and a horsehair-stitched festive one).
import * as THREE from 'three/webgpu';
import { TAU, tube, lathe, merge, beam, grid, xf } from './geom.js';
import { R_POST } from './frame.js';
import { valueNoise, deg } from '../../util.js';

const P2 = (r, a, y = 0) => [Math.cos(a) * r, y, Math.sin(a) * r];
const setUV = (g, fn) => { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) { const [a, b] = fn(uv.getX(i), uv.getY(i), p.getX(i), p.getY(i), p.getZ(i), i); uv.setXY(i, a, b); } return g; };
const plain = (g, k = 10) => setUV(g, (u, v) => [u + k, v]);

// ---- chorons: lathe bodies; outer vertices get uv.y = height fraction (carving bands), inner ones plain
function choronBody(prof, lipIndex, H, u0 = 0) {
  const g = lathe(prof, 28, (r, y, a) => r * (1 + valueNoise(a * 2, y * 30, 17) * 0.006));
  const segs = 28;
  return setUV(g, (u, v, x, y, z, i) => {
    const row = Math.floor(i / (segs + 1));
    return row <= lipIndex ? [u + u0, y / H] : [u + 10, 2];
  });
}
function choronA(scale = 1) {
  // standard choron on a conical foot: 22 cm, bowl 14 cm, lip 12.5 cm, raised rings
  const P = [[0.001, 0], [0.055, 0], [0.056, 0.006], [0.054, 0.013], [0.044, 0.017], [0.034, 0.035], [0.026, 0.055], [0.022, 0.07],
    [0.026, 0.075], [0.04, 0.085], [0.052, 0.098], [0.058, 0.11], [0.063, 0.125], [0.0665, 0.128], [0.068, 0.14], [0.07, 0.152],
    [0.068, 0.165], [0.0705, 0.169], [0.065, 0.178], [0.059, 0.188], [0.0585, 0.192], [0.0605, 0.194], [0.0575, 0.196], [0.0605, 0.198],
    [0.0565, 0.2], [0.059, 0.21], [0.0625, 0.219], [0.06, 0.2225],
    // inside
    [0.056, 0.221], [0.052, 0.21], [0.052, 0.19], [0.06, 0.15], [0.052, 0.115], [0.03, 0.093], [0.001, 0.088]];
  const S = P.map(([r, y]) => [r * scale, y * scale]);
  const g = choronBody(S, 27, 0.22 * scale);
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

// kymys levels in the guest's choron (cup space, m): left after drinking / ladled full
export const KYMYS = { left: 0.12, full: 0.185 };

// ---- kymys in a choron: a flat surface kept level in the world and fitted to the bowl's inner wall.
// `inner` = the bowl's inside profile [[r, y], …] in cup space. fit(level) re-shapes it for the cup's tilt;
// what would rise over the lip has been spilled, so the level drops to stay inside.
function kymysSurface(inner, mat, cup, level) {
  const prof = [...inner].sort((a, b) => a[1] - b[1]);
  const top = prof[prof.length - 1][1] - 0.006;
  const rIn = (y) => {
    if (y <= prof[0][1]) return prof[0][0];
    for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, y0] = prof[i - 1], [r1, y1] = prof[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
    return prof[prof.length - 1][0];
  };
  const N = 28, pos = new Float32Array((N + 2) * 3), nor = new Float32Array((N + 2) * 3), idx = [];
  for (let i = 1; i <= N; i++) idx.push(0, i + 1, i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); // the level, refitted (src/load/release.js keeps it)
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((N + 2) * 2), 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = false; mesh.userData.noShadow = true; mesh.userData.dynamic = true;
  cup.add(mesh);
  const up = new THREE.Vector3(0, 1, 0), slopes = new Float32Array(N + 1), radii = new Float32Array(N + 1);
  const K = { mesh, level, fit(lvl = K.level, u = up) {
    const ny = Math.max(u.y, 0.25);
    let peak = -1e9;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a), sl = -(u.x * c + u.z * s) / ny;
      // where the level plane meets the wall along this direction: rIn(lvl + sl·r) = r (bisection)
      let lo = 0, hi = 0.2;
      for (let k = 0; k < 14; k++) { const r = (lo + hi) / 2; if (rIn(lvl + sl * r) > r) lo = r; else hi = r; }
      const r = lo + 0.0015;   // tucked into the wall
      slopes[i] = sl; radii[i] = r;
      peak = Math.max(peak, lvl + sl * r);
    }
    K.level = lvl - Math.max(0, peak - top);
    pos.set([0, K.level, 0], 0);
    for (let i = 0; i <= N; i++) { const a = (i / N) * TAU; pos.set([Math.cos(a) * radii[i], K.level + slopes[i] * radii[i], Math.sin(a) * radii[i]], (i + 1) * 3); }
    for (let i = 0; i < N + 2; i++) nor.set([u.x, u.y, u.z], i * 3);
    g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  } };
  K.fit();
  return K;
}

// ---- the leather sack: flattened, slightly triangular, two welted side seams, neck on a collar
function sackGeom() {
  return grid(36, 30, (u, v) => {
    const a = u * TAU;
    const H = 0.83;
    // full of milk: a heavy rounded belly, sloping shoulders, a narrow creased neck
    const f = v < 0.32 ? 1 : Math.pow(1 - (v - 0.32) / 0.68, 1.5);
    let w = 0.068 + (0.29 - 0.068) * f, d = 0.068 + (0.21 - 0.068) * f;
    const belly = 1 + 0.08 * Math.sin(Math.min(1, v / 0.45) * Math.PI);
    w *= belly; d *= belly;
    if (v > 0.75) { const cr = Math.sin(v * 70 + a * 2) * 0.006 * (v - 0.75) / 0.25; w += cr; d += cr; }
    if (v < 0.06) { const k = Math.sqrt(v / 0.06); w *= 0.55 + 0.45 * k; d *= 0.5 + 0.5 * k; }
    const ca = Math.cos(a), sa = Math.sin(a);
    const sup = (x) => Math.sign(x) * Math.pow(Math.abs(x), 0.75); // squarish section
    let x = sup(ca) * w, z = sup(sa) * d;
    // welt along the side seams (a = 0, π)
    const seam = Math.exp(-((sa / 0.08) ** 2));
    x += Math.sign(ca) * seam * 0.012;
    const n = valueNoise(a * 2.5, v * 5, 41) * 0.012 + valueNoise(a * 7, v * 14, 43) * 0.004;
    x *= 1 + n * 3; z *= 1 + n * 3;
    const y = v < 0.06 ? Math.sqrt(v / 0.06) * 0.03 : 0.03 + (v - 0.06) / 0.94 * (H - 0.03);
    return [x + Math.pow(v, 2) * 0.03, y, z];
  }, (u, v) => [u, v], false);
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
  const neckY = 0.152 + 0.83;
  const collar = plain(lathe([[0.035, -0.04], [0.06, -0.04], [0.062, -0.03], [0.058, 0], [0.062, 0.03], [0.06, 0.04], [0.035, 0.04], [0.035, -0.04]], 20));
  const collarM = add(xf(collar, { p: [0, neckY + 0.02, 0] }), M.birch, sackRoot);
  collarM.userData.noShadow = true;
  // horsehair cord tied round the neck, and a rope from the neck to the post
  for (let w = 0; w < 3; w++) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * 0.071, neckY - 0.035 + w * 0.012, Math.sin(a) * 0.071)); }
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

  // ---- the ladle (удьаа kind): deep bowl, S-curved handle with a hook, hung on the collar
  const ladle = new THREE.Group();
  {
    const bowl = lathe([[0.001, -0.06], [0.03, -0.055], [0.045, -0.04], [0.053, -0.02], [0.055, 0], [0.051, 0.002], [0.049, -0.018], [0.042, -0.036], [0.028, -0.05], [0.001, -0.055]], 22);
    xf(bowl, { s: [1.0, 1, 0.82] });
    const path = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      const x = 0.05 + t * 0.3, y = 0.0 + Math.sin(t * Math.PI * 0.9) * 0.05 + t * 0.12 - (t > 0.9 ? (t - 0.9) * 0.4 : 0);
      path.push(new THREE.Vector3(x, y, 0));
    }
    // the hook at the end curls down
    const e = path[path.length - 1];
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * Math.PI * 0.9; path.push(new THREE.Vector3(e.x + Math.sin(a) * 0.025, e.y - (1 - Math.cos(a)) * 0.025, 0)); }
    const handle = tube(path, (t, an) => Math.hypot(Math.cos(an) * 0.007, Math.sin(an) * 0.012) * (t < 0.08 ? 1.25 : 1) * (1 - t * 0.25), 8, { capEnd: true });
    const rings = [0.075, 0.085, 0.095].map((x) => xf(lathe([[0.012, -0.002], [0.0145, 0], [0.012, 0.002]], 10), { r: [0, 0, Math.PI / 2 - 0.3], p: [x, 0.012 + (x - 0.05) * 0.4, 0] }));
    add(merge([plain(bowl), plain(handle), ...rings.map((g) => plain(g))]), M.birch, ladle);
    // hang it on the room side (−z): the hook's curl (centre at handle-local (0.35, 0.0705)) over the collar rim,
    // the handle leaning out over the sack's shoulder, the bowl hanging clear of the belly
    const th = 0.89, cx = 0.35 * Math.cos(th) - 0.0705 * Math.sin(th), cy = 0.35 * Math.sin(th) + 0.0705 * Math.cos(th);
    ladle.rotation.set(0, -Math.PI / 2, th);
    ladle.position.set(0, neckY + 0.068 - cy, -0.0485 - cx);
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
  const hero = add(choronA(1), M.birch, chorons);
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
