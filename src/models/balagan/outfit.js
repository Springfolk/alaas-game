// The festive outfit laid out before Ysyakh: the бууктаах сон (fur-trimmed coat with gathered sleeve heads),
// the дьабака hat on its stand and the этэрбэс boots. Forms after the references in src/data/images.json
// (`clothing`) and Jochelson 1933, Figs. 31–32, 35, 40 (docs/patterns.md).
import * as THREE from 'three/webgpu';
import { sheet, lathe, tube, xf, fbm2, vnoise, orient } from './geo.js';

const UP = () => [0, 1, 0];
const LEAN = -0.07; // boot shafts lean back, metres per metre
const SABLE = [0.34, 0.23, 0.15], CLOTH = [0.3, 0.27, 0.23], STUD = [1.25, 1.22, 1.15];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Per-vertex colour from f(x, y, z) → [r, g, b].
function tint(g, f) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) c.set(f(p.getX(i), p.getY(i), p.getZ(i)), i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// Fur: guard hair paler at the tips, darker in the parting; the colour carries the pelt's patches.
const furTint = (g, col = SABLE, seed = 3) => tint(g, (x, y, z) => {
  const k = 0.78 + 0.34 * fbm2(x * 14, z * 14 + y * 9, seed, 3) + 0.16 * vnoise(x * 70, z * 70 + y * 40, seed + 5);
  return [col[0] * k, col[1] * k, col[2] * k * 0.96];
});

// A ridge of fur along a path of [x, y, z] points lying on a surface: hw wide each side, h high, tousled.
export function furRidge(path, hw, h, { seed = 1, col = SABLE, nv = 5, closed = false } = {}) {
  const P = path.map((p) => new THREE.Vector3(...p)), n = P.length - 1;
  const g = sheet(n, nv, (u, v) => {
    const i = Math.round(u * n), a = P[Math.max(0, i - 1)], b = P[Math.min(n, i + 1)];
    const t = b.clone().sub(a).setY(0).normalize(), s = new THREE.Vector3(-t.z, 0, t.x);
    const th = v * Math.PI, end = closed ? 1 : Math.min(1, Math.min(u, 1 - u) * n * 0.7 + 0.35);
    const k = (1 + 0.22 * vnoise(i * 0.9 + seed, v * 6, seed) + 0.1 * vnoise(i * 3.1, v * 17, seed + 2)) * end;
    return [P[i].x + s.x * Math.cos(th) * hw * k, P[i].y + Math.sin(th) * h * k, P[i].z + s.z * Math.cos(th) * hw * k];
  }, { uvf: (u, v) => [u * n * 0.02, v * 0.1], face: UP });
  return furTint(g, col, seed);
}

// A flattened tube along a path: half width a(q), half height b(q), q = 0..1 along; lies on its underside.
function flatTube(path, a, b, { rows = 14, seg = 12, mod } = {}) {
  const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)));
  const mid = c.getPoints(24);
  return orient(sheet(seg, rows, (u, q) => {
    const p = c.getPoint(q), t = c.getTangent(q).setY(0).normalize(), s = new THREE.Vector3(-t.z, 0, t.x);
    const th = u * Math.PI * 2, m = mod ? mod(th, q) : 1;
    return [p.x + s.x * Math.cos(th) * a(q) * m, p.y + b(q) + Math.sin(th) * b(q) * m, p.z + s.z * Math.cos(th) * a(q) * m];
  }, { uvf: (u, q) => [u * 1.2, q * c.getLength() * 2.7] }), (x, y, z) => {   // outward from the path
    let best = mid[0], d = 1e9;
    for (const p of mid) { const e = (p.x - x) ** 2 + (p.z - z) ** 2; if (e < d) { d = e; best = p; } }
    return [x - best.x, y - best.y - b(0.5), z - best.z];
  });
}

// A row of square silver studs (the белые бляшки of the trim bands) along a path, facing up.
function studs(add, M, path, pitch, size, lift = 0.0016) {
  const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p))), L = c.getLength(), n = Math.max(1, Math.floor(L / pitch));
  for (let k = 0; k < n; k++) {
    const q = (k + 0.5) / n, p = c.getPointAt(q), t = c.getTangentAt(q);
    const g = new THREE.ConeGeometry(size * 0.72, size * 0.3, 4, 1, true).rotateY(Math.PI / 4);   // a low four-sided dome
    add(M.silver, xf(g, { r: [0, Math.atan2(-t.z, t.x), 0], p: [p.x, p.y + lift + size * 0.15, p.z] }), { color: STUD });
  }
}
// A line of seed beads as a flat ribbon, one colour per bead.
function beads(add, M, path, cols, pitch = 0.0055, w = 0.0018, lift = 0.0012) {
  const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p))), L = c.getLength(), n = Math.max(2, Math.round(L / pitch));
  const pos = [], col = [], idx = [];
  for (let k = 0; k < n; k++) {
    const a = c.getPointAt(k / n), b = c.getPointAt((k + 0.82) / n), t = b.clone().sub(a).setY(0).normalize();
    const sx = -t.z * w, sz = t.x * w, cc = cols[k % cols.length], i = pos.length / 3;
    pos.push(a.x - sx, a.y + lift, a.z - sz, a.x + sx, a.y + lift, a.z + sz, b.x - sx, b.y + lift, b.z - sz, b.x + sx, b.y + lift, b.z + sz);
    for (let j = 0; j < 4; j++) col.push(...cc);
    idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  add(M.food, g);
}
const WHITE = [0.92, 0.9, 0.84], BLUE = [0.1, 0.3, 0.5], GREEN = [0.12, 0.62, 0.4];

// ---------- бууктаах сон: laid on its back, collar to the west (−x), front opening along z = oz ----------
export function buildCoat(B, M, { ox, cy, oz }) {
  const add = (m, g, o) => B.add(m, g, o);
  const L = 1.02;                                               // collar seam to hem
  // half width at s metres from the collar: shoulders, the fitted waist, the gored skirt
  const W = (s) => (s < 0.4 ? 0.2 - 0.03 * sm(0.1, 0.4, s) : 0.17 + 0.29 * Math.pow((s - 0.4) / (L - 0.4), 0.9));
  // the cloth's height over the bench at (s, t): padded body, falling to the edges; the skirt lies in fanned folds
  const H = (s, t, side) => {
    const v = Math.min(1, Math.abs(t) / W(s)), fall = (1 - v ** 6) * sm(0, 0.03, L - s) * sm(-0.01, 0.03, s);
    const k = sm(0.42, 0.95, s);
    const folds = 0.024 * k * (0.5 + 0.5 * Math.cos(v * Math.PI * 2 * 4.5 + side * 0.9 + s * 1.3)) * (0.35 + 0.65 * v);
    return 0.004 + (0.02 + folds + 0.004 * fbm2(s * 11, t * 11 + side * 3, 7, 2)) * fall;
  };
  const at = (s, t, side, lift = 0) => [ox + s + 0.035 * Math.min(1, Math.abs(t) / 0.2) * (1 - sm(0, 0.2, s)), cy + H(s, t, side) + lift, oz + side * t];
  for (const side of [-1, 1]) {
    // body panel: the left front laps a finger over the right
    const t0 = side < 0 ? -0.012 : 0.002, lap = side < 0 ? 0.003 : 0;
    add(M.wool, sheet(38, 16, (u, v) => { const s = u * L, t = t0 + v * (W(s) - t0); return at(s, t, side, lap); }, { uvf: (u, v) => [u * L * 2.7, v * 0.6 * 2.7], face: UP }), { color: CLOTH });
    // trim bands inside the fur, after the coat in `clothing-1`: dark red cloth with a row of square silver studs between
    // two lines of white beads: down the front, round the hem, and a short one across the hip
    const band = (pts, w, nseg = 24) => {
      const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
      add(M.velvet, sheet(nseg, 2, (u, v) => { const p = c.getPointAt(u), t = c.getTangentAt(u).setY(0).normalize(); const d = (v - 0.5) * w; return [p.x - t.z * d, p.y + 0.0012, p.z + t.x * d]; }, { uvf: (u, v) => [u * c.getLength() * 6, v * w * 6], face: UP }));
      const off = (d) => { const o = []; for (let k = 0; k <= nseg; k++) { const p = c.getPointAt(k / nseg), t = c.getTangentAt(k / nseg).setY(0).normalize(); o.push([p.x - t.z * d, p.y + 0.0012, p.z + t.x * d]); } return o; };
      studs(add, M, off(0), 0.0125, 0.0075);
      beads(add, M, off(w / 2 - 0.002), [WHITE]); beads(add, M, off(-w / 2 + 0.002), [WHITE]);
    };
    const line = (f, a, b, n = 24) => { const o = []; for (let k = 0; k <= n; k++) o.push(f(a + (b - a) * (k / n))); return o; };
    band(line((s) => at(s, 0.068, side), 0.13, L - 0.11), 0.026, 40);
    band(line((v) => at(L - 0.1, 0.085 + v * (W(L - 0.1) - 0.11), side), 0, 1, 30), 0.026, 36);
    band(line((v) => at(0.56, 0.1 + v * (W(0.56) - 0.125), side), 0, 1, 8), 0.022, 10);
    // the green cloth panel between the hip band and the hem band (the photo's coat has it on the skirt's side)
    add(M.wool, sheet(8, 6, (u, v) => { const s = 0.585 + u * 0.1, t = 0.11 + v * (W(s) - 0.15); return at(s, t, side, 0.0009); }, { uvf: (u, v) => [u * 0.27, v * 0.5], face: UP }), { color: GREEN });
    // sable: down the front edge, round the hem
    add(M.fur, furRidge(line((s) => at(s, 0.026, side, 0.002), 0.1, L - 0.03, 44), 0.03, 0.024, { seed: 11 + side }));
    add(M.fur, furRidge(line((v) => at(L - 0.035, 0.03 + v * (W(L - 0.035) - 0.03), side, 0.002), 0, 1, 26), 0.05, 0.03, { seed: 21 + side, col: [0.4, 0.29, 0.19], nv: 6 }));

    // sleeve: laid beside the body, tight at the wrist and widening to the shoulder, where it is gathered into
    // the high буук
    const sh = at(0.05, 0.2, side), cu = [ox + 0.66, cy, oz + side * 0.43];
    const path = [[sh[0] - 0.01, cy, sh[2]], [ox + 0.2, cy, oz + side * 0.275], [ox + 0.44, cy, oz + side * 0.36], cu];
    const a = (q) => 0.05 + 0.045 * (1 - q) ** 1.4 + 0.022 * Math.exp(-(((q - 0.1) / 0.11) ** 2));
    const bq = (q) => 0.015 + 0.012 * (1 - q) + 0.036 * Math.exp(-(((q - 0.09) / 0.1) ** 2));
    const pleat = (th, q) => 1 + 0.07 * Math.cos(th * 11) * Math.exp(-((q / 0.16) ** 2)) + 0.012 * Math.sin(th * 3 + q * 23);
    add(M.wool, flatTube(path, a, bq, { rows: 22, seg: 22, mod: pleat }), { color: CLOTH });
    const c = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)));
    // round the sleeve: the armhole's stud band, two bands with a green panel between at the forearm, the sable cuff
    const ring = (q, grow, fn) => { const o = []; for (let k = 0; k <= 14; k++) { const th = Math.PI * (0.06 + 0.88 * k / 14), p = c.getPoint(q), t = c.getTangent(q).setY(0).normalize(); o.push([p.x - t.z * Math.cos(th) * (a(q) + grow), p.y + bq(q) + Math.sin(th) * (bq(q) + grow), p.z + t.x * Math.cos(th) * (a(q) + grow)]); } return fn ? fn(o) : o; };
    const cuffBand = (q0, q1, mat, opt) => add(mat, sheet(14, 2, (u, v) => { const q = q0 + (q1 - q0) * v, th = Math.PI * (0.04 + 0.92 * u), p = c.getPoint(q), t = c.getTangent(q).setY(0).normalize(); return [p.x - t.z * Math.cos(th) * (a(q) + 0.0015), p.y + bq(q) + Math.sin(th) * (bq(q) + 0.0015), p.z + t.x * Math.cos(th) * (a(q) + 0.0015)]; }, { uvf: (u, v) => [u * 0.6, v * 0.2], face: UP }), opt);
    for (const [q0, q1] of [[0.6, 0.64], [0.75, 0.79]]) { cuffBand(q0, q1, M.velvet); studs(add, M, ring((q0 + q1) / 2, 0.0028), 0.0125, 0.0075, 0); }
    cuffBand(0.64, 0.75, M.wool, { color: GREEN });
    cuffBand(0.2, 0.235, M.velvet); studs(add, M, ring(0.2175, 0.0028), 0.0125, 0.0075, 0);
    add(M.fur, furTint(flatTube([c.getPoint(0.86).toArray(), c.getPoint(0.93).toArray(), c.getPoint(1).toArray()], () => 0.066, () => 0.034, { rows: 5, seg: 14, mod: (th, q) => (1 + 0.16 * vnoise(th * 2.2, q * 5, 31 + side)) * (0.75 + 0.25 * Math.sin(q * Math.PI)) }), [0.36, 0.25, 0.16], 5));
  }
  // the fur collar, worn flat: round the neck and down to where the front edges begin
  const neck = [];
  for (let k = 0; k <= 24; k++) { const a = (k / 24 - 0.5) * Math.PI * 1.5; neck.push([ox + 0.075 - Math.cos(a) * 0.085, cy + 0.03, oz + Math.sin(a) * 0.1]); }
  add(M.fur, furRidge(neck, 0.045, 0.03, { seed: 41, nv: 6 }));
}

// ---------- дьабака: sable band with ear pieces, the cloth crown (чопчуур) with its silver туоһахта ----------
export function buildHat(B, M, { x, y, z }) {
  const add = (m, g, o) => B.add(m, g, o);
  const front = (g) => xf(g, { p: [x, y, z] });                // the hat faces south (+z), into the room
  // the fur: a deep band widening upward, tousled
  const BP = [[0.0, 0.0], [0.09, 0.0]];
  for (let k = 0; k <= 12; k++) { const a = -Math.PI / 2 + k / 12 * Math.PI; BP.push([0.09 + 0.036 * Math.cos(a) ** 0.6, 0.07 + 0.07 * Math.sin(a)]); }
  BP.push([0.066, 0.136]);
  const band = lathe(BP, 44);
  const bp = band.attributes.position;
  for (let k = 0; k < bp.count; k++) { const a = Math.atan2(bp.getZ(k), bp.getX(k)), yy = bp.getY(k); const f = 1 + 0.035 * vnoise(a * 5, yy * 45, 3) + 0.035 * vnoise(a * 16, yy * 120, 4) + 0.03 * vnoise(a * 40, yy * 300, 5); bp.setX(k, bp.getX(k) * f); bp.setZ(k, bp.getZ(k) * f); }
  band.computeVertexNormals();
  add(M.fur, furTint(front(band), SABLE, 9));
  // ear pieces and the long back piece that covers the neck
  for (const [rot, wide, len] of [[-Math.PI / 2, 0.9, 0.1], [Math.PI / 2, 0.9, 0.1], [Math.PI, 1.5, 0.105]]) {
    const g = sheet(8, 8, (u, v) => { const a = (u - 0.5) * wide * (1 - 0.25 * v), r = 0.106 + 0.012 * Math.sin(v * Math.PI) + 0.004 * vnoise(u * 5, v * 5, 8); return [Math.sin(a) * r, 0.012 - v * len, Math.cos(a) * r]; }, {});
    add(M.fur, furTint(front(orient(xf(g, { r: [0, rot, 0] }), (px, py, pz) => [px, 0, pz])), [0.26, 0.18, 0.12], 6));
  }
  // the crown: black cloth narrowing to a blunt point, a red band at its foot and four red strips to the top,
  // each edged with white beads and set with square studs (the crown's bead spirals of Jochelson's Fig. 32 are not drawn)
  const CR = [[0.074, 0.125], [0.07, 0.18], [0.062, 0.24], [0.05, 0.29], [0.036, 0.32], [0.022, 0.338], [0.01, 0.348], [0.0, 0.35]];
  add(M.wool, front(lathe(CR, 24)), { color: CLOTH });
  const rAt = (yy) => { for (let k = 1; k < CR.length; k++) if (yy <= CR[k][1]) { const t = (yy - CR[k - 1][1]) / (CR[k][1] - CR[k - 1][1]); return CR[k - 1][0] + (CR[k][0] - CR[k - 1][0]) * t; } return 0; };
  const on = (a, yy, lift = 0.0012) => { const r = rAt(yy) + lift; return [x + Math.sin(a) * r, y + yy, z + Math.cos(a) * r]; };
  const hoop = (yy, n = 32) => { const o = []; for (let k = 0; k <= n; k++) o.push(on(k / n * Math.PI * 2, yy)); return o; };
  const strip = (pts0, pts1) => { const n = pts0.length - 1; const g = sheet(n, 1, (u, v) => { const i = Math.round(u * n); return v ? pts1[i] : pts0[i]; }, { uvf: (u, v) => [u * 2, v * 0.2] }); g.computeVertexNormals(); return g; };
  const outward = (g) => { const n = g.attributes.normal, p = g.attributes.position; if ((p.getX(0) - x) * n.getX(0) + (p.getZ(0) - z) * n.getZ(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); } return g; };
  add(M.velvet, outward(strip(hoop(0.142), hoop(0.172))));
  const hoopStuds = (yy, n) => { for (let k = 0; k < n; k++) { const a = (k + 0.5) / n * Math.PI * 2, p = on(a, yy, 0.002); const g = new THREE.ConeGeometry(0.0054, 0.0022, 4, 1, true).rotateY(Math.PI / 4).rotateX(Math.PI / 2); add(M.silver, xf(g, { r: [0, a, 0], p }), { color: STUD }); } };
  hoopStuds(0.157, 36);
  for (let q = 0; q < 4; q++) {
    const a0 = q * Math.PI / 2 + Math.PI / 4, col = (d) => { const o = []; for (let k = 0; k <= 10; k++) { const yy = 0.176 + k * 0.0155; o.push(on(a0 + d / Math.max(0.02, rAt(yy)), yy)); } return o; };
    add(M.velvet, outward(strip(col(-0.011), col(0.011))));
    for (let k = 1; k < 10; k += 1) { const yy = 0.176 + k * 0.0155, p = on(a0, yy, 0.002); const g = new THREE.ConeGeometry(0.0048, 0.002, 4, 1, true).rotateY(Math.PI / 4).rotateX(Math.PI / 2); add(M.silver, xf(g, { r: [0, a0, 0], p }), { color: STUD }); }
  }
  // туоһахта: the round silver sun on the front of the crown (Jochelson Fig. 63a: a rim band between rings,
  // a plain field, a boss ringed with dots), Ø 9 cm, leaning with the crown
  const D = [];
  D.push([new THREE.CylinderGeometry(0.045, 0.045, 0.0024, 36).rotateX(Math.PI / 2), [1.12, 1.1, 1.05]]);
  for (const [r, w] of [[0.0425, 0.0007], [0.034, 0.0006], [0.0135, 0.0006]]) D.push([new THREE.RingGeometry(r - w, r + w, 36).translate(0, 0, 0.0014), [0.3, 0.29, 0.27]]);
  D.push([new THREE.SphereGeometry(0.011, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.42).translate(0, 0, 0.001), [1.2, 1.18, 1.12]]);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; D.push([new THREE.CircleGeometry(0.0011, 6).translate(Math.cos(a) * 0.0185, Math.sin(a) * 0.0185, 0.0014), [0.3, 0.29, 0.27]]); }
  for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; D.push([new THREE.CircleGeometry(0.0009, 5).translate(Math.cos(a) * 0.0383, Math.sin(a) * 0.0383, 0.0014), [0.34, 0.33, 0.3]]); }
  const lean = Math.atan2(rAt(0.2) - rAt(0.28), 0.08);
  for (const [g, c] of D) add(M.silver, xf(g, { r: [-lean, 0, 0], s: [0.84, 0.84, 1], p: [x, y + 0.235, z + rAt(0.235) + 0.006] }), { color: c });
}

// ---------- этэрбэс: soft boots of smoked leather, the toe turned up, the top edged with cloth and beads ----------
export function buildBoots(B, M, { x, y, z }) {
  const add = (m, g, o) => B.add(m, g, o);
  const LEATHER = [0.62, 0.48, 0.36];
  for (const s of [-1, 1]) {
    const bx = x + s * 0.1, yaw = s * 0.16;
    const place = (g) => xf(xf(g, { r: [0, yaw, 0] }), { p: [bx, y, z] });
    // shaft: soft, slumped in rings at the ankle, a little wider at the calf; the toe points −z (into the room is +z: heels to the bench)
    const shaft = lathe([[0.043, 0.06], [0.047, 0.1], [0.045, 0.16], [0.049, 0.25], [0.054, 0.33], [0.058, 0.4], [0.059, 0.43], [0.055, 0.432], [0.05, 0.4]], 18);
    const pa = shaft.attributes.position;
    for (let k = 0; k < pa.count; k++) {
      const yy = pa.getY(k), a = Math.atan2(pa.getZ(k), pa.getX(k));
      const wr = (1 - sm(0.1, 0.24, yy)) * (0.07 * Math.sin(yy * 95 + Math.sin(a * 2) * 1.6) + 0.04 * Math.sin(yy * 190 + a)) + 0.02 * vnoise(a * 3, yy * 20, 5 + s);
      const lean = (yy - 0.06) * LEAN;                           // the shaft leans back a little
      pa.setX(k, pa.getX(k) * (1 + wr) * 0.92); pa.setZ(k, pa.getZ(k) * (1 + wr) + lean);
    }
    shaft.computeVertexNormals();
    add(M.leather, place(shaft), { color: LEATHER });
    // foot: a long soft vamp, the sole's seam, the toe turned up (Jochelson: the сары этэрбэс is known by it)
    const foot = sheet(16, 12, (u, v) => {
      const zz = -0.07 + u * 0.25, k = u, th = v * Math.PI;                             // heel (−z, at the bench) → toe (+z)
      const hw = 0.047 * (0.82 + 0.3 * Math.sin(Math.min(1, k * 1.25) * Math.PI) ** 0.8) * (1 - sm(0.8, 1, k) * 0.75);
      const top = (0.085 - 0.05 * sm(0.15, 0.6, k)) * (1 - sm(0.86, 1, k) * 0.55), up = 0.05 * sm(0.72, 1, k) ** 1.6;
      return [Math.cos(th) * hw, 0.004 + up + Math.sin(th) * top, zz];
    }, { uvf: (u, v) => [u * 0.4, v * 0.2] });
    foot.computeVertexNormals();
    const fn = foot.attributes.normal; if (fn.getY(Math.floor(fn.count / 2)) < 0) { const ix = foot.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } foot.computeVertexNormals(); }
    add(M.leather, place(foot), { color: [0.58, 0.44, 0.33] });
    add(M.leather, place(tube([[-0.05, 0.008, -0.07], [-0.056, 0.007, 0.03], [-0.03, 0.03, 0.165], [0, 0.052, 0.182], [0.03, 0.03, 0.165], [0.056, 0.007, 0.03], [0.05, 0.008, -0.07]], 0.004, 3, false, 20)), { color: [0.36, 0.26, 0.19] });
    // ties: a thong wound twice round the ankle, its ends hanging
    for (const yy of [0.115, 0.128]) { const o = []; for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2 + yy * 30; o.push([Math.cos(a) * 0.046, yy + 0.004 * Math.sin(a * 2), Math.sin(a) * 0.05 - 0.004]); } add(M.leather, place(tube(o, 0.0028, 3, true, 18)), { color: [0.3, 0.21, 0.15] }); }
    add(M.leather, place(tube([[s * 0.04, 0.12, 0.03], [s * 0.056, 0.09, 0.04], [s * 0.06, 0.04, 0.035]], 0.0024, 4)), { color: [0.3, 0.21, 0.15] });
    // the top's edging: black cloth, a red band and bead lines (white, blue) round it
    const hoop = (yy, r, n = 20) => { const o = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; o.push([Math.cos(a) * r * 0.92, yy, Math.sin(a) * r + (yy - 0.06) * LEAN]); } return o; };
    const ringBand = (y0, y1, mat, opt) => { const g = sheet(20, 1, (u, v) => { const yy = v ? y1 : y0, a = -u * Math.PI * 2, r = 0.0585 + (yy - 0.4) * 0.03 + (mat === M.velvet ? 0.0012 : 0); return [Math.cos(a) * r * 0.92, yy, Math.sin(a) * r + (yy - 0.06) * LEAN]; }, { uvf: (u, v) => [u * 1.2, v * 0.1] }); add(mat, place(orient(g, (px, py, pz) => [px, 0, pz])), opt); };
    ringBand(0.368, 0.432, M.wool, { color: CLOTH });
    ringBand(0.386, 0.414, M.velvet);
    for (const [yy, cols] of [[0.38, [WHITE]], [0.42, [WHITE]], [0.4, [BLUE, BLUE, WHITE]]]) {
      const pts = hoop(yy, 0.0604 + (yy - 0.4) * 0.03, 28).map((p) => { const v = new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw); return [bx + v.x, y + v.y, z + v.z]; });
      beadsRound(add, M, pts, [bx, z], cols);
    }
  }
}
// bead line round an upright cylinder: ribbon facing outward from the axis
function beadsRound(add, M, pts, [cx, cz], cols, h = 0.0036) {
  const pos = [], col = [], idx = [], n = (pts.length - 1) * 3;
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  for (let k = 0; k < n; k++) {
    const a = c.getPointAt(k / n), b = c.getPointAt((k + 0.8) / n), cc = cols[k % cols.length], i = pos.length / 3;
    for (const p of [a, b]) { const dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz), ex = dx / l * 0.001, ez = dz / l * 0.001; pos.push(p.x + ex, p.y - h / 2, p.z + ez, p.x + ex, p.y + h / 2, p.z + ez); }
    for (let j = 0; j < 4; j++) col.push(...cc);
    idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nn = g.attributes.normal, p0 = g.attributes.position;
  if ((p0.getX(0) - cx) * nn.getX(0) + (p0.getZ(0) - cz) * nn.getZ(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  add(M.food, g);
}
