// The winter place's gear, stored over the summer (variant 'winter'): the ox hay sledge (сыарҕа) on blocks by
// the south wall with the ox yoke (бурҕалдьы) on its rails; inside, the hide-lined hunting skis (туут хайыһар)
// and their staff, and the ice chisel (анньыы) leaning by the door; the winter furs laid on хаҥас орон (the
// саҥыйах coat, the pointed cap, mittens, fur boots); the barn swallows' (хараҥаччы) mud nests on the beams.
// Forms after Jochelson 1933 (Figs. 27, 78: the ox sledge and yoke) and Sieroszewski 1896 (ch. XI, XIII; Rys. 46,
// 89), the entries' sources (src/data/entries.json: syarga, khayyhar, winter-clothing, annyy, kharangachchy).
import * as THREE from 'three/webgpu';
import { box, log, sheet, lathe, tube, xf, fbm2, vnoise } from './geo.js';
import { FX, FZ, H, inner } from './dims.js';

const BT = 0.5; // bench top
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function proxy(root, w, h, d, p, r = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set(...p); m.rotation.set(...r); m.visible = false; m.castShadow = false;
  root.add(m);
  return m;
}
// vertex colour of fur: f(x, y, z) → brightness about col
function furCol(g, col, seed, k = 1) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = (0.8 + 0.32 * fbm2(x * 13 * k + y * 5, z * 13 * k + y * 7, seed, 3) + 0.14 * vnoise(x * 60, z * 60 + y * 50, seed + 3));
    c.set([col[0] * f, col[1] * f, col[2] * f], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
// a shaggy surface: push the vertices of g out along their normals by fur noise
function shag(g, amp, seed) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const d = amp * (0.5 + 0.5 * vnoise(p.getX(i) * 90, p.getZ(i) * 90 + p.getY(i) * 70, seed));
    p.setXYZ(i, p.getX(i) + n.getX(i) * d, p.getY(i) + n.getY(i) * d, p.getZ(i) + n.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

export function buildWinterGear({ B, M, rng, root, ground }) {
  const targets = {}, colliders = [];

  const perches = []; // where the swallows sit when out (src/nature/life/birds.js)
  // ---------- сыарҕа: the ox hay sledge on two blocks off the ground, south of the house ----------
  // two birch runners turned up at the front, four pairs of short stanchions (атах) mortised into them carrying
  // two rails, cross-ties, a few deck boards (адарай); its two shafts (ураҕас) laid along the ground before it;
  // no body (a load is roped onto the rails). Sizes are a working sledge's, not measured from a Sakha piece.
  {
    const S = { x: -0.3, z: 5.1, len: 2.2, track: 0.31 }, gy = Math.max(ground(S.x - 1.1, S.z), ground(S.x + 1.1, S.z));
    const y0 = gy + 0.12;                       // the runners' soles, on two blocks
    const W = (g) => B.add(M.outWood, g, { color: [0.86, 0.8, 0.72] });
    for (const bx of [-0.75, 0.75]) W(log([S.x + bx, gy - 0.02, S.z - 0.45], [S.x + bx, gy - 0.02, S.z + 0.45], 0.075, 0.07, rng, { seg: 7, caps: true }));
    const front = S.x + S.len / 2, back = S.x - S.len / 2;
    for (const sd of [-1, 1]) {
      const z = S.z + sd * S.track, pts = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14, x = back + t * S.len, up = x > front - 0.42 ? Math.pow((x - (front - 0.42)) / 0.42, 1.8) : 0;
        pts.push([x - up * 0.08, y0 + 0.045 + up * 0.36, z]);
      }
      // a runner: a squared birch bar 7 × 9 cm, its upturned toe thinning
      const c = new THREE.CatmullRomCurve3(pts.map((p) => V(...p)));
      const g = sheet(28, 8, (u, v) => {
        const p = c.getPointAt(u), t = c.getTangentAt(u), nrm = V(-t.y, t.x, 0).normalize(), a = v * Math.PI * 2;
        const hw = 0.035, hh = 0.045 * (1 - 0.35 * Math.max(0, u - 0.8) / 0.2);
        const ca = Math.cos(a), sa = Math.sin(a), sq = (q) => Math.sign(q) * Math.min(1, Math.abs(q) * 1.6);
        return [p.x + nrm.x * sq(sa) * hh, p.y + nrm.y * sq(sa) * hh, p.z + sq(ca) * hw];
      }, { uvf: (u, v) => [v * 0.3, u * 2.4] });
      W(g);
      // stanchions and the rail they carry
      const posts = [-0.85, -0.3, 0.25, 0.75];
      for (const px of posts) W(box(0.05, 0.27, 0.045, { p: [S.x + px, y0 + 0.22, z], r: [sd * 0.08, 0, 0] }));
      W(log([back + 0.08, y0 + 0.37, z + sd * 0.02], [front - 0.25, y0 + 0.37, z + sd * 0.02], 0.03, 0.028, rng, { seg: 6, caps: true }));
      // the rail's head bound to the runner's toe with rawhide
      W(log([front - 0.25, y0 + 0.37, z + sd * 0.02], [front - 0.12, y0 + 0.4, z], 0.022, 0.02, rng, { seg: 5 }));
      for (const px of posts) B.add(M.leather, xf(new THREE.TorusGeometry(0.035, 0.007, 4, 10), { p: [S.x + px, y0 + 0.37, z + sd * 0.01], r: [0, Math.PI / 2, 0] }), { color: [0.45, 0.36, 0.28] });
    }
    for (const px of [-0.85, -0.3, 0.25, 0.75]) W(log([S.x + px, y0 + 0.13, S.z - S.track - 0.02], [S.x + px, y0 + 0.13, S.z + S.track + 0.02], 0.022, 0.022, rng, { seg: 5, caps: true }));
    for (const dz of [-0.17, 0, 0.17]) W(box(1.5, 0.025, 0.14, { p: [S.x - 0.05, y0 + 0.155, S.z + dz], r: [0, (rng() - 0.5) * 0.03, 0] }));
    // shafts: unhitched, their butts by the toes, laid out on the grass ahead, converging
    for (const sd of [-1, 1]) W(log([front - 0.05, ground(front, S.z) + 0.05, S.z + sd * 0.36], [front + 2.0, ground(front + 2, S.z) + 0.04, S.z + sd * 0.22], 0.035, 0.028, rng, { seg: 6, caps: true }));
    // бурҕалдьы: the yoke, two light bars pinned at both ends round the ox's neck, laid across the rails
    const yx = S.x + 0.5, yy = y0 + 0.42;
    for (const dx of [-0.07, 0.07]) W(log([yx + dx, yy + (dx > 0 ? 0.02 : 0), S.z - 0.42], [yx + dx, yy + (dx > 0 ? 0.02 : 0), S.z + 0.42], 0.03, 0.03, rng, { seg: 6, caps: true }));
    for (const sz of [-0.36, 0.36]) W(box(0.2, 0.03, 0.03, { p: [yx, yy + 0.01, S.z + sz] }));
    // the rawhide traces coiled on the deck
    const coil = [];
    for (let k = 0; k <= 40; k++) { const a = k * 0.62, r = 0.1 + 0.04 * Math.sin(k * 0.3); coil.push([S.x - 0.55 + Math.cos(a) * r, y0 + 0.175 + k * 0.0012, S.z + Math.sin(a) * r]); }
    B.add(M.leather, tube(coil, 0.008, 4, false, 80), { color: [0.42, 0.33, 0.25] });
    targets.sledge = proxy(root, 2.9, 0.7, 1.0, [S.x + 0.3, y0 + 0.3, S.z]);
    for (const px of [-0.6, -0.05, 0.45]) for (const sd of [-1, 1]) perches.push([S.x + px, y0 + 0.4, S.z + sd * (S.track + 0.02)]); // the swallows' perches on its rails
    perches.push([yx + 0.07, yy + 0.055, S.z - 0.2], [yx + 0.07, yy + 0.055, S.z + 0.22]); // and on the yoke
    targets.shafts = proxy(root, 2.1, 0.2, 0.9, [front + 1, gy + 0.08, S.z]);
    colliders.push({ x: S.x + 0.1, z: S.z, hw: 1.25, hd: 0.42 }, { x: front + 1, z: S.z, hw: 1, hd: 0.4, y0: -10, y1: gy + 0.15 });
  }

  // ---------- inside, east wall south of the door: the skis, their staff and the ice chisel ----------
  const wallX = (y) => inner(FX, y) - 0.04;
  const leanOn = (z, h, foot = 0.3, off = 0) => ({ a: V(wallX(0) - foot, 0.01, z), b: V(wallX(h) - 0.02 - off, h, z) });
  {
    // туут хайыһар: wide boards, the tip turned up, lined under with leg skin, hair pointing back; a toe strap
    for (const [z, tw] of [[1.18, 0.02], [1.38, -0.03]]) { // the hide to the room, the tips to the wall
      const { a, b } = leanOn(z, 1.62, 0.42, 0.12), L = a.distanceTo(b) + 0.06, d = b.clone().sub(a).normalize();
      const w = 0.17, th = 0.018;
      const frame = new THREE.Matrix4().makeBasis(V(0, 0, 1).applyAxisAngle(d, tw), d, V(0, 0, 1).applyAxisAngle(d, tw).cross(d)).setPosition(a); // +z: to the room
      const curve = (u) => (u > 0.82 ? Math.pow((u - 0.82) / 0.18, 2) * 0.1 : 0); // the turned-up tip, away from the wall
      const hw = (u) => w / 2 * (u > 0.86 ? 1 - Math.pow((u - 0.86) / 0.14, 2) * 0.75 : 1);
      // board (top face and edges) and the hide on the face turned to the room
      const board = sheet(20, 6, (u, v) => { const s = (v - 0.5) * 2, x = s * hw(u), r = th / 2 * Math.cos(Math.asin(Math.min(1, Math.abs(s)))); return [x, u * L, -curve(u) - r]; }, { uvf: (u, v) => [v * w, u * L] });
      B.add(M.oiled, board.applyMatrix4(frame), { color: [0.9, 0.8, 0.66] });
      const hide = sheet(20, 6, (u, v) => { const s = (v - 0.5) * 2, x = s * hw(u) * 0.98; return [x, u * L, -curve(u) + th / 2 + 0.004 * (1 - s * s)]; }, { uvf: (u, v) => [v * w, u * L] });
      B.add(M.fur, furCol(shag(hide, 0.004, 7), [0.42, 0.34, 0.26], 5, 0.4).applyMatrix4(frame));
      // the strap across the middle
      B.add(M.leather, xf(box(w + 0.01, 0.035, 0.012), { p: [0, L * 0.45, -th - 0.004] }).applyMatrix4(frame), { color: [0.35, 0.26, 0.2] });
    }
    // the staff (хайыһар тайаҕа) with its ring (хаалык) near the foot
    const { a, b } = leanOn(1.56, 1.5, 0.25);
    B.add(M.beams, log(a.toArray(), b.toArray(), 0.016, 0.013, rng, { seg: 6, caps: true }), { color: [0.9, 0.82, 0.7] });
    const rp = a.clone().lerp(b, 0.08);
    B.add(M.leather, xf(new THREE.TorusGeometry(0.06, 0.006, 4, 14), { p: rp.toArray(), r: [Math.PI / 2 - 0.2, 0, 0] }), { color: [0.4, 0.3, 0.22] });
    for (let k = 0; k < 4; k++) { const q = (k / 4) * Math.PI * 2; B.add(M.leather, tube([rp.toArray(), [rp.x + Math.cos(q) * 0.058, rp.y, rp.z + Math.sin(q) * 0.058]], 0.003, 3, false, 2), { color: [0.4, 0.3, 0.22] }); }
    targets.skis = proxy(root, 0.5, 1.6, 0.6, [wallX(0.8) - 0.15, 0.8, 1.37]);
    colliders.push({ x: wallX(0) - 0.2, z: 1.37, hw: 0.2, hd: 0.3 });

    // анньыы: a long iron head, a spear-like point widening a little, its socket on a straight shaft; a cord
    // loop at the shaft's end for the wrist
    const c = leanOn(1.74, 1.55, 0.22), dd = c.b.clone().sub(c.a).normalize(), headL = 0.42;
    const sock = c.a.clone().addScaledVector(dd, headL);
    B.add(M.oiled, log(sock.toArray(), c.b.toArray(), 0.02, 0.018, rng, { seg: 7, caps: true }), { color: [0.85, 0.75, 0.62] });
    const head = lathe([[0, 0], [0.006, 0.012], [0.017, 0.05], [0.016, 0.1], [0.012, 0.22], [0.014, 0.34], [0.021, 0.37], [0.022, 0.42]], 6);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dd);
    head.applyQuaternion(q).translate(c.a.x, c.a.y, c.a.z);
    B.add(M.iron, head, { color: [0.6, 0.55, 0.5] });
    const cord = [];
    for (let k = 0; k <= 12; k++) { const t = k / 12, a = t * Math.PI * 2; cord.push([c.b.x - 0.02 - (1 - Math.cos(a)) * 0.035, c.b.y - 0.03 - Math.sin(a) * 0.01 - Math.sin(t * Math.PI) * 0.09, c.b.z + Math.sin(a) * 0.025]); }
    B.add(M.leather, tube(cord, 0.004, 3, false, 16), { color: [0.38, 0.29, 0.22] });
    targets.chisel = proxy(root, 0.3, 1.5, 0.2, [wallX(0.8) - 0.12, 0.78, 1.74]);
  }

  // ---------- the winter furs on хаҥас орон (north bench, x −1.35…0.25) ----------
  {
    const cy = BT + 0.005, oz = -2.32;
    // саҥыйах: the long coat, fur outward, laid open on its back, collar to the west, skirt flaring east
    const L = 1.25, Wd = (s) => (s < 0.35 ? 0.22 : 0.2 + 0.25 * Math.pow((s - 0.35) / (L - 0.35), 0.9));
    for (const sd of [-1, 1]) {
      const g = sheet(30, 10, (u, v) => { const s = u * L, t = v * Wd(s), fall = 1 - Math.pow(v, 5); return [-1.25 + s, cy + 0.01 + 0.07 * fall * Math.min(1, s * 12) + 0.012 * Math.sin(v * 7 + s * 5) * v, oz + sd * t]; }, { uvf: (u, v) => [u * L, v * 0.5], face: () => [0, 1, 0] });
      B.add(M.fur, furCol(shag(g, 0.012, 11 + sd), [0.56, 0.36, 0.2], 13 + sd));
      // sleeve along the body's side, cuffs to the east
      const pts = [[-1.18, cy + 0.04, oz + sd * 0.2], [-0.95, cy + 0.045, oz + sd * 0.3], [-0.62, cy + 0.04, oz + sd * 0.36]];
      B.add(M.fur, furCol(shag(xf(tube(pts, 0.055, 9, false, 10), { s: [1, 0.6, 1], p: [0, cy * 0.4 + 0.012, 0] }), 0.01, 17 + sd), [0.52, 0.34, 0.19], 19 + sd));
    }
    // the otter collar: darker
    const neck = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16 - 0.5) * Math.PI * 1.4; neck.push([-1.17 - Math.cos(a) * 0.08, cy + 0.06, oz + Math.sin(a) * 0.12]); }
    B.add(M.fur, furCol(shag(tube(neck, 0.035, 7, false, 18), 0.008, 23), [0.3, 0.21, 0.14], 29));
    // чомпой бэргэһэ: the pointed cap with two ear tabs, fur trimmed
    const hx = 0.05, hz = -2.25, hb = BT;
    B.add(M.wool, lathe([[0.1, 0], [0.098, 0.05], [0.085, 0.1], [0.06, 0.15], [0.03, 0.19], [0, 0.215]], 16).translate(hx, hb + 0.02, hz), { color: [0.22, 0.2, 0.19] });
    B.add(M.fur, furCol(shag(xf(new THREE.TorusGeometry(0.1, 0.03, 6, 20), { r: [Math.PI / 2, 0, 0], p: [hx, hb + 0.035, hz] }), 0.008, 31), [0.45, 0.32, 0.2], 33));
    for (const sd of [-1, 1]) B.add(M.fur, furCol(shag(xf(sheet(4, 4, (u, v) => [(u - 0.5) * 0.09, -v * 0.12, 0]), { r: [0.25, sd * Math.PI / 2, 0], p: [hx + sd * 0.11, hb + 0.06, hz] }), 0.008, 35 + sd), [0.4, 0.29, 0.19], 37));
    // үтүлүк: a pair of wide fur mittens with only the thumb parted, on their thongs
    for (const [mx, mz, ry] of [[-0.25, -2.12, 0.4], [-0.12, -2.0, -0.2]]) {
      const g = xf(new THREE.SphereGeometry(0.08, 12, 8), { s: [1, 0.35, 1.5] });
      B.add(M.fur, furCol(shag(xf(g, { r: [0, ry, 0], p: [mx, BT + 0.03, mz] }), 0.008, 41), [0.62, 0.5, 0.36], 43));
      const th = xf(new THREE.SphereGeometry(0.03, 8, 6), { s: [1, 0.6, 1.6], r: [0, ry + 0.9, 0], p: [mx + Math.cos(ry) * 0.07, BT + 0.025, mz - Math.sin(ry) * 0.06] });
      B.add(M.fur, furCol(th, [0.6, 0.48, 0.34], 45));
    }
    B.add(M.leather, tube([[-0.25, BT + 0.02, -1.98], [-0.2, BT + 0.012, -1.94], [-0.14, BT + 0.012, -1.93], [-0.12, BT + 0.02, -1.9]], 0.004, 3, false, 10), { color: [0.3, 0.22, 0.17] });
    // тыс этэрбэс: thigh-high boots of leg skins, hair outward, standing before the bench
    for (const sd of [-1, 1]) {
      const bx = -0.55 + sd * 0.11, bz = -1.72;
      const shaft = lathe([[0.05, 0.06], [0.054, 0.15], [0.056, 0.3], [0.064, 0.45], [0.072, 0.6], [0.074, 0.64], [0.06, 0.64]], 14);
      B.add(M.fur, furCol(shag(xf(shaft, { r: [0.04 * sd, 0, -0.03], p: [bx, 0.01, bz] }), 0.006, 51 + sd), [0.6, 0.5, 0.38], 53 + sd, 0.6));
      const foot = xf(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), { s: [1.1, 0.9, 2.1], p: [bx, 0.01, bz + 0.06] });
      B.add(M.fur, furCol(foot, [0.46, 0.38, 0.3], 55));
      B.add(M.leather, xf(box(0.11, 0.012, 0.24), { p: [bx, 0.012, bz + 0.06] }), { color: [0.3, 0.23, 0.18] });
    }
    targets.clothing = proxy(root, 1.4, 0.3, 0.9, [-0.6, BT + 0.1, -2.3]);
    targets.boots = proxy(root, 0.4, 0.7, 0.3, [-0.55, 0.35, -1.72]);
  }

  // ---------- хараҥаччы уйата: barn swallows' mud cups on top of the crossbeams, against the wall ----------
  const nests = [];
  for (const [x, z, sd] of [[1.3, FZ, 1], [-1.2, FZ, 1], [0.6, -FZ, -1]]) {
    const y = H - 0.1 + 0.105, nz = z + sd * 0.02;
    const g = lathe([[0.02, 0], [0.055, 0.012], [0.07, 0.04], [0.072, 0.065], [0.06, 0.07], [0.05, 0.05], [0.03, 0.035], [0, 0.03]], 14, { phi0: 0, phiLen: Math.PI * 2 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * vnoise(p.getX(i) * 80, p.getY(i) * 80 + p.getZ(i) * 60, 3); p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
    xf(g, { s: [1.2, 1, 0.75], p: [x, y, nz - sd * 0.035] });
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const f = 0.75 + 0.5 * vnoise(p.getX(i) * 150, p.getY(i) * 150, 5); c.set([0.36 * f, 0.29 * f, 0.21 * f], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.computeVertexNormals();
    B.add(M.food, g);
    // a few straws sticking out of the rim
    for (let k = 0; k < 5; k++) { const a = rng() * Math.PI * 2; B.add(M.hair, tube([[x + Math.cos(a) * 0.06, y + 0.06, nz - sd * 0.035 + Math.sin(a) * 0.045], [x + Math.cos(a) * 0.11, y + 0.055 + rng() * 0.03, nz - sd * 0.035 + Math.sin(a) * 0.08]], 0.0015, 3, false, 2), { color: [0.7, 0.62, 0.42] }); }
    nests.push([x, y + 0.075, nz - sd * 0.035]);
  }
  targets.nests = proxy(root, 3.2, 0.4, 0.4, [0, H + 0.05, FZ - 0.1]);
  return { targets, colliders, nests, perches };
}
