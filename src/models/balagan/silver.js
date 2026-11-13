// The festive silver on its red cloth: the neck ring (кылдьыы) with the back ornament (кэлин кэбиһэр) and the
// breast ornament (илин кэбиһэр) with its күн disc, a pair of ытарҕа earrings, a pair of бөҕөх bracelets and the
// belt (көмүс кур). Forms measured on V. Kirillin's photographs of an 1884 set (Commons, CC BY-SA 4.0) and
// Sieroszewski's Rys. 96 (docs/patterns.md). Flat silver: sheet cut-outs lying on the cloth, engraving as dark ribbons.
import * as THREE from 'three/webgpu';
import { lathe, xf } from './geo.js';

const MMm = 0.001;
const BRIGHT = [1.12, 1.1, 1.05], MID = [0.86, 0.84, 0.8], ENG = [0.3, 0.29, 0.27];

// A flat cut-out facing up: `pts` [[u, w], …] in mm (u across, w along the piece), holes likewise.
function cut(pts, holes = []) {
  const sh = new THREE.Shape(pts.map(([u, w]) => new THREE.Vector2(u * MMm, -w * MMm)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, w]) => new THREE.Vector2(u * MMm, -w * MMm))));
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
}
const circ = (cu, cw, r, n = 8, a0 = 0) => Array.from({ length: n }, (_, k) => { const a = a0 + k / n * Math.PI * 2; return [cu + Math.cos(a) * r, cw + Math.sin(a) * r]; });
const ringG = (r0, r1, n = 10) => new THREE.RingGeometry(r0 * MMm, r1 * MMm, n).rotateX(-Math.PI / 2);
const rect = (u0, w0, u1, w1) => cut([[u0, w0], [u1, w0], [u1, w1], [u0, w1]]);

export function buildSilver(B, M, { x, y, z, yaw = 0 }) {
  // pieces are built in the set's own frame (mm: u across the cloth, w down its length from the neck ring's
  // centre) and turned onto the bench: w runs north (−z)
  let seed = 7;
  const put = (g, c, u = 0, w = 0, lift = 0, rot = 0) => {
    if (rot) g.rotateY(rot);
    if (c === BRIGHT) { seed = (seed * 16807) % 2147483647; const k = 0.86 + 0.2 * (seed / 2147483647); c = [c[0] * k, c[1] * k, c[2] * k]; }   // each piece a little its own tone
    g.translate(u * MMm, lift * MMm, w * MMm);
    xf(g, { r: [0, Math.PI + yaw, 0], p: [x, y, z] });
    B.add(M.silver, g, { color: c });
  };

  // ---- the figure-of-eight link of the chains (photo 05): two columns of two pierced discs, a hatched bar
  // down the middle, hatched triangles at the waist; 15 × 21 mm
  const link = (u, w, lift = 0.5) => {
    for (const su of [-1, 1]) for (const sw of [-1, 1]) put(ringG(1.55, 3.75, 6), BRIGHT, u + su * 3.9, w + sw * 4.6, lift);
    put(cut([[-1.25, -10.3], [0, -11], [1.25, -10.3], [1.25, 10.3], [0, 11], [-1.25, 10.3]]), MID, u, w, lift + 0.05);
    put(cut([[-1.25, -2.6], [-3.4, 0], [-1.25, 2.6]]), ENG, u, w, lift + 0.1);
    put(cut([[1.25, -2.6], [1.25, 2.6], [3.4, 0]]), ENG, u, w, lift + 0.1);
    // the arms that curl round the hooks, top and bottom
    for (const su of [-1, 1]) for (const sw of [-1, 1]) put(cut([[su * 1.25, sw * 7.3], [su * 5.6, sw * 7.9], [su * 6.9, sw * 9.6], [su * 5.4, sw * 10.4], [su * 1.25, sw * 9.4]]), BRIGHT, u, w, lift);
  };
  const hook = (u, w, len = 5.5) => put(rect(-0.9, 0, 0.9, len), MID, u, w, 0.95);
  // the small tablet between plate and chain: a rounded bar with a ring-and-cross stamp; 7.4 × 13 mm
  const tablet = (u, w) => {
    put(cut([[-3.2, -6.5], [-1.2, -5.6], [1.2, -5.6], [3.2, -6.5], [3.7, -3.6], [3.7, 3.6], [3.2, 6.5], [1.2, 5.6], [-1.2, 5.6], [-3.2, 6.5], [-3.7, 3.6], [-3.7, -3.6]]), BRIGHT, u, w, 0.5);
    put(ringG(2.35, 2.75, 10), ENG, u, w, 0.62);
    put(rect(-0.25, -1.4, 0.25, 1.4), ENG, u, w, 0.62); put(rect(-1.4, -0.25, 1.4, 0.25), ENG, u, w, 0.62);
  };
  // a round pendant with a stamped dot
  const coin = (u, w, r = 3.6) => { put(new THREE.CircleGeometry(r * MMm, 10).rotateX(-Math.PI / 2), BRIGHT, u, w, 0.4); put(new THREE.CircleGeometry(0.55 * MMm, 5).rotateX(-Math.PI / 2), ENG, u, w, 0.5); };

  // ---- кылдьыы: a hoop wound with wire, its flattened ends hooked into the plate (photos 02, 03)
  const RR = 76, GAP = 0.42;                                    // centreline radius; half the opening, radians
  {
    const N = 150, seg = 5, pos = [], col = [], idx = [];
    for (let k = 0; k <= N; k++) {
      const a = Math.PI / 2 + GAP + (k / N) * (Math.PI * 2 - 2 * GAP), end = Math.min(k, N - k) < 9;
      const rt = end ? 2.6 : 3.9 + (k % 2 ? 0.34 : -0.34), flat = end ? 0.45 : 1;
      for (let j = 0; j <= seg; j++) {
        const th = j / seg * Math.PI * 2, rr = RR + Math.cos(th) * rt * (end ? 1.6 : 1);
        pos.push(Math.cos(a) * rr * MMm, (4.0 + Math.sin(th) * rt * flat) * MMm, Math.sin(a) * rr * MMm);
        const c = end ? MID : k % 2 ? BRIGHT : [0.7, 0.68, 0.64]; col.push(...c);
      }
    }
    for (let k = 0; k < N; k++) for (let j = 0; j < seg; j++) { const a = k * (seg + 1) + j, b = a + seg + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    if (g.attributes.normal.getY(seg > 2 ? 1 : 0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
    put(g, BRIGHT);
  }
  // ---- кэлин кэбиһэр: the engraved plate, twelve tablets, six chains of fifteen links in two threes, tablets
  // again, the pierced end plates and their round pendants
  const PW = 100, PH = 36, w0 = RR - 4;                          // the plate hangs from the hoop's ends
  put(cut([[-PW / 2, 2], [-PW / 2 + 3, 0], [PW / 2 - 3, 0], [PW / 2, 2], [PW / 2, PH], [-PW / 2, PH]]), BRIGHT, 0, w0, 1.1);
  for (const [ins, wd] of [[1.5, 0.55], [3.6, 0.4]]) {           // its engraved double frame (the scroll and the date are not drawn)
    for (const [u0, wa, u1, wb] of [[-PW / 2 + ins, ins + 1, PW / 2 - ins, ins + 1 + wd], [-PW / 2 + ins, PH - ins - wd, PW / 2 - ins, PH - ins], [-PW / 2 + ins, ins + 1, -PW / 2 + ins + wd, PH - ins], [PW / 2 - ins - wd, ins + 1, PW / 2 - ins, PH - ins]]) put(rect(u0, wa, u1, wb), ENG, 0, w0, 1.2);
  }
  for (const su of [-1, 1]) put(ringG(1.2, 2.6, 8), MID, su * 30, w0 + 0.5, 1.6);
  const colU = (k) => (k - 2.5) * 16.6 + (k < 3 ? -2.5 : 2.5);     // six chains, a gap down the middle
  const tabU = (k, s) => colU(k) + s * 3.95;
  let w = w0 + PH;
  const tabletRow = () => { for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { hook(tabU(k, s), w - 1.5, 4.5); tablet(tabU(k, s), w + 8.5); } w += 15; };
  tabletRow();
  const ROWS = 15, PITCH = 25.5;
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < 6; k++) { for (const s of [-1, 1]) hook(tabU(k, s), w + r * PITCH - 1.5, 5); link(colU(k), w + r * PITCH + 13.2); }
  w += ROWS * PITCH;
  tabletRow();
  for (let k = 0; k < 6; k++) {
    for (const s of [-1, 1]) hook(tabU(k, s), w - 1.5, 5);
    const u = colU(k), c = w + 14;
    put(cut([[-5.5, -11], [5.5, -11], [8, -5], [8.2, 3], [5, 10.5], [0, 12], [-5, 10.5], [-8.2, 3], [-8, -5]], [circ(0, -4.2, 1.7, 6), circ(0, 4.2, 1.7, 6), circ(-4.2, 0, 1.7, 6), circ(4.2, 0, 1.7, 6)]), BRIGHT, u, c, 0.5);
    put(ringG(6.2, 6.6, 12), ENG, u, c, 0.6);
    for (const d of [-5.6, 0, 5.6]) { hook(u + d, c + 9.5, 4); coin(u + d, c + 16.5 + (d ? 0 : 2)); }
  }
  // ---- илин кэбиһэр: three short chains of the same links from the hoop's closed side to a bar, and the күн disc
  {
    let v = -RR - 3;
    for (const d of [-16.6, 0, 16.6]) { hook(d, v - 3, 6); }
    for (let r = 0; r < 3; r++) for (const d of [-16.6, 0, 16.6]) { link(d, v - 14 - r * PITCH); for (const s of [-1, 1]) hook(d + s * 3.95, v - 29 - r * PITCH, 5); }
    v -= 3 * PITCH + 4;
    put(rect(-27, -9, 27, 0), BRIGHT, 0, v, 1.0);
    for (const wd of [-7.6, -1.7]) put(rect(-25.5, wd, 25.5, wd + 0.3), ENG, 0, v, 1.1);
    hook(0, v - 13, 5);
    const c = v - 13 - 44;
    put(new THREE.CylinderGeometry(45 * MMm, 45 * MMm, 1.6 * MMm, 40), BRIGHT, 0, c, 1.0);
    for (const r of [42.5, 34, 13.5]) put(ringG(r - 0.45, r + 0.45, 40), ENG, 0, c, 1.9);
    put(new THREE.SphereGeometry(11 * MMm, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.4, 1), BRIGHT, 0, c, 1.8);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; put(new THREE.CircleGeometry(1.1 * MMm, 6).rotateX(-Math.PI / 2), ENG, Math.cos(a) * 18.5, c + Math.sin(a) * 18.5, 1.9); }
    for (let k = 0; k < 44; k++) { const a = k / 44 * Math.PI * 2; put(new THREE.CircleGeometry(0.9 * MMm, 5).rotateX(-Math.PI / 2), ENG, Math.cos(a) * 38.3, c + Math.sin(a) * 38.3, 1.9); }
  }
  // ---- ытарҕа (photos «Yakut earrings» 01–03): hook, a round engraved disc, two leaf links, a row of round
  // pendants, the lyre-shaped pierced plate, four trefoil plates each with a round pendant; 95 mm
  const earring = (eu, ew, rot) => {
    const at = (g, c, u, w2, lift = 0.5) => { g.rotateY(rot); const cs = Math.cos(rot), sn = Math.sin(rot); put(g, c, eu + u * cs + w2 * sn, ew - u * sn + w2 * cs, lift); };
    const hk = []; for (let k = 0; k <= 10; k++) { const a = Math.PI * (0.1 + 0.95 * k / 10); hk.push(new THREE.Vector3(Math.cos(a) * 9 * MMm, (1.2 + Math.sin(a) * 3) * MMm, (-9 - Math.sin(a) * 9) * MMm)); }
    at(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hk), 12, 0.6 * MMm, 4), MID, 0, 0, 0);
    at(new THREE.CylinderGeometry(9.5 * MMm, 9.5 * MMm, 1.2 * MMm, 20), BRIGHT, 0, 0, 0.8);
    for (const r of [8.3, 6.2]) at(ringG(r - 0.3, r + 0.3, 20), ENG, 0, 0, 1.5);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; at(cut(circ(Math.cos(a) * 2.9, Math.sin(a) * 2.9, 1.5, 5, a)), ENG, 0, 0, 1.5); }
    for (const s of [-1, 1]) { at(rect(-0.8, 0, 0.8, 5), MID, s * 5, 8.5, 0.9); at(cut([[0, -4.5], [3.6, -1], [2.6, 3.8], [0, 5], [-2.6, 3.8], [-3.6, -1]]), MID, s * 5.5, 17, 0.5); }
    for (const d of [-13.5, -4.6, 4.6, 13.5]) { at(rect(-0.7, 0, 0.7, 4), MID, d, 20, 0.9); coin2(at, d, 27 + Math.abs(d) * 0.12, 4.4); }
    // the lyre plate: two horns curling out and down from a stem, two half-moon openings, a toothed lower edge
    at(cut([[-2, 22], [2, 22], [4, 27], [9, 29], [14, 34], [17, 41], [17.5, 47], [21, 50], [17, 52.5], [12, 51.5], [8, 54], [4, 52], [0, 54.5], [-4, 52], [-8, 54], [-12, 51.5], [-17, 52.5], [-21, 50], [-17.5, 47], [-17, 41], [-14, 34], [-9, 29], [-4, 27]],
      [[[-10.5, 44.5], [-9.5, 39.5], [-6, 37], [-2.6, 39], [-2.2, 44.5]], [[10.5, 44.5], [2.2, 44.5], [2.6, 39], [6, 37], [9.5, 39.5]]]), BRIGHT, 0, 0, 0.5);
    for (const s of [-1, 1]) at(ringG(3.1, 3.5, 8), ENG, s * 6.2, 33.5, 0.6);
    for (const d of [-15, -5, 5, 15]) {
      at(rect(-0.8, 0, 0.8, 5), MID, d, 51.5, 0.95);
      at(cut([[-1.6, 56], [1.6, 56], [3.4, 60], [5.4, 66], [3, 67.2], [1.6, 69.5], [0, 67.6], [-1.6, 69.5], [-3, 67.2], [-5.4, 66], [-3.4, 60]]), BRIGHT, d, 0, 0.55);
      at(rect(-0.7, 0, 0.7, 4.5), MID, d, 68, 0.95); coin2(at, d, 77 + (Math.abs(d) < 6 ? 2.5 : 0), 5.2);
    }
  };
  const coin2 = (at, u, w2, r) => { at(new THREE.CircleGeometry(r * MMm, 12).rotateX(-Math.PI / 2), BRIGHT, u, w2, 0.45); at(ringG(r - 1.1, r - 0.8, 12), ENG, u, w2, 0.55); at(new THREE.CircleGeometry(0.5 * MMm, 5).rotateX(-Math.PI / 2), ENG, u, w2, 0.55); };
  earring(-118, -178, 2.92); earring(-128, -72, 2.74);
  // ---- бөҕөх (photos «Yakut bracelets» 01–03): broad cuffs, three raised ribs at each edge and the middle, two
  // plain bands between (their engraved scrolls are not drawn), open at the back; 62 mm high, standing
  for (const [bu, bw, turn] of [[112, -238, 1.9], [118, -150, 1.1]]) {
    const prof = [];
    const R0 = 27.5, R1 = 32, HH = 62, rib = (h) => { let d = 0; for (const c of [2.5, 6, 9.5, 27.5, 31, 34.5, 52.5, 56, 59.5]) d += 1.6 * Math.exp(-(((h - c) / 1.3) ** 2)); return d; };
    for (let k = 0; k <= 30; k++) { const h = k / 30 * HH; prof.push([(R0 + (R1 - R0) * h / HH + rib(h)) * MMm, h * MMm]); }
    for (let k = 2; k >= 0; k--) { const h = k / 2 * HH; prof.push([(R0 + (R1 - R0) * h / HH - 1.0) * MMm, h * MMm]); }
    const g = lathe(prof, 22, { phi0: 0.16, phiLen: Math.PI * 2 - 0.32 });
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const h = p.getY(i) / MMm, r = Math.hypot(p.getX(i), p.getZ(i)) / MMm - (R0 + (R1 - R0) * h / HH); c.set(r < -0.5 ? [0.5, 0.49, 0.46] : r > 0.5 ? BRIGHT : [0.8, 0.78, 0.73], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.rotateY(turn);
    put(g, BRIGHT, bu, bw, 0.2);
  }
}

// A silver belt plate after Sieroszewski 1902, Rys. 96 (natural size, measured at 600 dpi; docs/patterns.md): a disc
// r 27.8 mm over a 54 × 34 mm plate with four rivet holes; engraved: a double ring round the boss, the rosette's rim,
// a band of 104 zigzag teeth between two rings. Lies flat (y up), centred. Returns [geometry, colour] pairs.
const MM = 0.04233e-3; // drawing px → m
export function beltPlate() {
  const R = 657, HW = 641, HH = 405, pts = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const rct = Math.min(HW / Math.max(1e-6, Math.abs(c)), HH / Math.max(1e-6, Math.abs(s)));
    const r = Math.max(R, rct);
    pts.push(new THREE.Vector2(c * r * MM, s * r * MM));
  }
  const sh = new THREE.Shape(pts);
  for (const [hx, hy] of [[-570, -350], [570, -350], [-570, 350], [570, 350]]) { const h = new THREE.Path(); h.absarc(hx * MM, hy * MM, 15 * MM, 0, Math.PI * 2, true); sh.holes.push(h); }
  const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: false, curveSegments: 4 });
  plate.rotateX(-Math.PI / 2);
  // engraved lines: flat dark ribbons just over the plate (round tubes cost 3× the triangles for lines 0.4 mm wide)
  const y = 0.0013, out = [[plate, [1, 1, 1]]];
  for (const r of [108, 137, 352, 514, 548]) out.push([new THREE.RingGeometry((r * MM) - 0.00022, (r * MM) + 0.00022, r < 200 ? 16 : 40, 1).rotateX(-Math.PI / 2).translate(0, y, 0), ENG]);
  const zz = [];
  for (let k = 0; k <= 208; k++) { const a = (k / 208) * Math.PI * 2, r = k % 2 ? 545 : 518; zz.push([Math.cos(a) * r * MM, Math.sin(a) * r * MM]); }
  out.push([flatLine(zz, 0.0002, y), ENG]);
  return out;
}

// A flat ribbon (half width w, facing up at height y) along a polyline of [x, z] points.
function flatLine(pts, w, y) {
  const pos = [], idx = [];
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w, nz = dx / l * w;
    pos.push(pts[k][0] - nx, y, pts[k][1] - nz, pts[k][0] + nx, y, pts[k][1] + nz);
    if (k) { const i = (k - 1) * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orientUp(g);
}
// Flip a flat geometry's winding so it faces +y.
function orientUp(g) {
  const n = g.attributes.normal;
  if (n.count && n.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
