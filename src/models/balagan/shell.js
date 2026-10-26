// The balagan's body: post frame, sloped log walls, clay-dung plaster, earth roof with sod, earth berm,
// door bay with its door, small windows, the canopy (чарапчы) and the khoton on the north wall.
import * as THREE from 'three/webgpu';
import { Buckets, box, log, sheet, rrect, fbm2, xf, tube } from './geo.js';
import { FX, FZ, H, OUT, GAP, PL, ZD, DW, DH, XD, BAY, ROOF, KH, WINDOWS, WIN, HEARTH, bayX } from './dims.js';
import { openingsNode } from './mats.js';
import { float } from 'three/tsl';
import { section } from '../../load/geocache.js';

const lin = (F, y) => F + GAP + OUT * (1 - y / H);           // inner face, extrapolated below 0
const hp = (F, y) => lin(F, y) + PL;                          // plaster surface
const SIDES = {
  E: { n: [1, 0], t: [0, 1], F: FX, L: FZ },
  W: { n: [-1, 0], t: [0, 1], F: FX, L: FZ },
  S: { n: [0, 1], t: [1, 0], F: FZ, L: FX },
  N: { n: [0, -1], t: [1, 0], F: FZ, L: FX },
};
const at = (sd, perp, lat, y) => [sd.n[0] * perp + sd.t[0] * lat, y, sd.n[1] * perp + sd.t[1] * lat];

// The geometry runs in section()s, which a bake stands in for (src/load/geocache.js): materials, colliders,
// the door pivots and the window data stay outside them.
export function buildShell({ M, rng, winter, root }) {
  const B = new Buckets();
  const colliders = [];
  const win = WINDOWS.map(([side, c, sill]) => ({ side, c, sill, sd: SIDES[side] }));
  const inBay = (side, s) => side === 'E' && Math.abs(s - ZD) < BAY + 0.01;

  // ---------- sloped log walls ----------
  section(() => {
    for (const [side, sd] of Object.entries(SIDES)) {
      const Lmax = sd.L + GAP + OUT + 0.05;
      let s = -Lmax + rng() * 0.05;
      while (s < Lmax) {
        const r = 0.065 + rng() * 0.03;
        s += r;
        const lat = s;
        s += r + (winter ? 0.003 : 0.007) + rng() * 0.008;   // summer walls have air gaps
        if (inBay(side, lat)) continue;
        const over = Math.abs(lat) - (sd.L + GAP) + r * 0.6;
        let ytop = over > 0 ? H * (1 - over / OUT) : H + 0.14;
        if (ytop < 0.12) continue;
        const pointed = over > 0;
        const segs = [[-0.25, ytop]];
        const w = win.find((o) => o.side === side && Math.abs(lat - o.c) < WIN / 2 + r);
        if (w) { segs.length = 0; segs.push([-0.25, w.sill - 0.035], [w.sill + WIN + 0.035, ytop]); }
        const tint = 0.82 + rng() * 0.3, warm = rng() * 0.08;
        for (const [y0, y1] of segs) {
          const lean = (rng() - 0.5) * 0.03;
          const a = at(sd, lin(sd.F, y0) + r, lat, y0), b = at(sd, lin(sd.F, y1) + r + lean, lat + (rng() - 0.5) * 0.03, y1);
          const g = log(a, b, r * 1.05, r * 0.9, rng, { seg: 7, bow: 0.015, knob: 0.12, caps: y0 > 0 || !pointed, capTop: pointed && y1 === ytop ? 0.12 : 0 });
          B.add(M.logs, g, { color: [tint + warm, tint, tint - warm], extra: { outw: [sd.n[0], 0, sd.n[1]] } });
        }
      }
    }

  });
  // ---------- post frame, crossbeams, matitsa, ceiling ----------
  section(() => {
    const posts = [[-FX, -FZ], [0, -FZ], [FX, -FZ], [-FX, FZ], [0, FZ], [FX, FZ]];
    for (const [x, z] of posts) {
      const toyon = x === -FX && z === FZ;   // the master post is separate (interactable)
      if (toyon) continue;
      const r = 0.13 + rng() * 0.02;
      B.add(M.logs, log([x, -0.3, z], [x + (rng() - 0.5) * 0.04, H, z + (rng() - 0.5) * 0.04], r, r * 0.92, rng, { seg: 9, knob: 0.05, caps: true }),
        { color: [0.95, 0.9, 0.85], extra: { outw: [0, 0, 0] } });
    }
    const beam = (a, b, r) => B.add(M.logs, log(a, b, r, r * 0.9, rng, { seg: 9, knob: 0.05, bow: 0.008, caps: true }), { color: [0.9, 0.85, 0.8], extra: { outw: [0, 0, 0] } });
    beam([-FX - 0.25, H - 0.1, -FZ], [FX + 0.25, H - 0.1, -FZ], 0.11);
    beam([-FX - 0.25, H - 0.1, FZ], [FX + 0.25, H - 0.1, FZ], 0.11);
    beam([-FX, H - 0.1, -FZ - 0.25], [-FX, H - 0.1, FZ + 0.25], 0.105);
    beam([FX, H - 0.1, -FZ - 0.25], [FX, H - 0.1, FZ + 0.25], 0.105);
    // matitsa (сис мас) N–S across the middle, on packing blocks (сыттык) that give the roof its crown
    beam([0, H + 0.2, -FZ - 0.2], [0.02, H + 0.2, FZ + 0.2], 0.16);   // ends inside the plaster
    for (const z of [-FZ, FZ]) B.add(M.beams, box(0.24, 0.16, 0.22, { p: [0, H + 0.03, z] }), { color: [0.5, 0.45, 0.4] });
    // ceiling poles E–W from the matitsa down to the side beams and out over the wall tops
    const yc = (x) => H + 0.36 - (Math.min(Math.abs(x), FX) / FX) * 0.33;
    for (const sgn of [-1, 1]) {
      const pz = lin(FZ, yc(FX)) + 0.12;   // the poles end inside the plaster (no ends show under the roof)
      for (let z = -pz; z < pz; z += 0.1 + rng() * 0.012) {
        const r = 0.045 + rng() * 0.012;
        B.add(M.logs, log([sgn * 0.05, yc(0) + r, z], [sgn * (lin(FX, yc(FX)) + 0.2), yc(FX) - 0.06 + r, z + (rng() - 0.5) * 0.04], r, r * 0.85, rng, { seg: 5, knob: 0.06, bow: 0.015 }),
          { color: [0.7 + rng() * 0.2, 0.68, 0.64], extra: { outw: [0, 1, 0] } });
      }
    }
    // bark layer above the poles (closes light leaks; seen between poles as dark)
    // it ends between the lining and the plaster, so no dark edge shows outside under the roof
    const bx0 = lin(FX, yc(FX) + 0.1) + 0.23, bz0 = lin(FZ, yc(FX) + 0.1) + 0.21;
    const bark = sheet(16, 12, (u, v) => { const x = (u * 2 - 1) * bx0, z = (v * 2 - 1) * bz0; return [x, yc(x) + 0.1, z]; }, { face: () => [0, -1, 0] });
    B.add(M.ceilingBark, bark);
  });

  // ---------- plaster shell (lofted rounded box, holes where it flaked) ----------
  const Nring = 260, rows = 22, y0p = -0.15, y1p = ROOF.under + 0.05;
  const perim = 2 * (2 * hp(FX, 1) + 2 * hp(FZ, 1));
  const plasterLoft = (hxF, hzF, cz, skipFace, seed, yTop = y1p) => sheet(Nring, rows, (u, v) => {
    const y = y0p + v * (yTop - y0p);
    const rc = 0.32 + 0.18 * (1 - Math.max(0, y) / H);
    const [x, z, nx, nz] = rrect(hxF(y), hzF(y), rc, u);
    const a = u * perim;
    let d = 0.028 * fbm2(a * 1.2, y * 1.5, seed) + 0.01 * fbm2(a * 5, y * 5, seed + 3);
    d += 0.07 * Math.max(0, 1 - Math.max(0, y) / 0.7) ** 2;          // plaster fattens into the berm
    d -= 0.03 * Math.max(0, (y - (yTop - 0.35)) / 0.35);              // tucks under the roof
    return [x + nx * d, y, cz + z + nz * d];
  }, { uvf: (u, v) => [u * perim, (y0p + v * (yTop - y0p)) / 0.94], skip: skipFace, face: (x, y, z) => [x, 0, z - cz] });
  const ufrac = (u) => u; // perimeter fraction
  // where the door bay meets the east wall, leave the plaster out (the bay's own faces close it)
  const houseSkip = (u, v) => {
    const y = y0p + v * (y1p - y0p);
    const [x, z] = rrect(hp(FX, y), hp(FZ, y), 0.4, ufrac(u));
    return x > FX && Math.abs(z - ZD) < BAY - 0.02;
  };
  const openings = win.map((o) => ({ axis: o.sd.n[0] ? 'x' : 'z', sign: o.sd.n[0] || o.sd.n[1], c: o.c, hw: WIN / 2, y0: o.sill, y1: o.sill + WIN, min: o.sd.F }));
  M.plasterHouse = M.plaster(openingsNode(openings));
  M.plasterHouse.shadowSide = THREE.DoubleSide;
  section(() => {
    B.add(M.plasterHouse, plasterLoft((y) => hp(FX, y), (y) => hp(FZ, y), 0, houseSkip, 11));
  });

  // dark backing behind the logs (bark and clay pressed into the gaps): no daylight through the walls
  section(() => {
    const lining = sheet(160, 10, (u, v) => {
      const y = -0.1 + v * 2.9;
      const [x, z] = rrect(lin(FX, y) + 0.17, lin(FZ, y) + 0.17, 0.3, u);
      return [x, y, z];
    }, { face: (x, y, z) => [-x, 0, -z], skip: (u, v) => { const y = -0.1 + v * 2.9; const [x, z] = rrect(lin(FX, y) + 0.17, lin(FZ, y) + 0.17, 0.3, u); return (x > FX && Math.abs(z - ZD) < BAY - 0.02 && y < 2.45) || win.some((o) => (o.sd.n[0] ? Math.sign(x) === o.sd.n[0] && Math.abs(x) > FX && Math.abs(z - o.c) < WIN / 2 + 0.02 : Math.sign(z) === o.sd.n[1] && Math.abs(z) > FZ && Math.abs(x - o.c) < WIN / 2 + 0.02) && y > o.sill - 0.05 && y < o.sill + WIN + 0.05); } });
    B.add(M.lining, lining);
  });

  // ---------- door bay: vertical front with the door, plastered cheeks, plank linings ----------
  const bayPl = M.plasterBay = M.plaster(() => float(0));
  bayPl.shadowSide = THREE.DoubleSide;
  const zL = ZD - BAY, zR = ZD + BAY, yb0 = -0.2, yb1 = ROOF.under + 0.04;
  section(() => {
    // front face with the door hole
    B.add(bayPl, sheet(14, 26, (u, v) => [bayX(yb0 + v * (yb1 - yb0)) + 0.015 * fbm2(u * 6, v * 9, 5), yb0 + v * (yb1 - yb0), zR - u * (zR - zL)],
      { uvf: (u, v) => [u * 2 * BAY, v * (yb1 - yb0)], skip: (u, v) => { const z = zR - u * (zR - zL), y = yb0 + v * (yb1 - yb0); return Math.abs(z - ZD) < DW / 2 + 0.07 && y < DH + 0.09; }, face: () => [1, 0, 0] }));
    for (const [z, sg] of [[zL, -1], [zR, 1]]) {
      const g = sheet(10, 20, (u, v) => { const y = yb0 + v * (yb1 - yb0); return [hp(FX, y) - 0.2 + u * (bayX(y) - hp(FX, y) + 0.2), y, z + sg * 0.012 * fbm2(u * 5, v * 7, 9)]; },
        { uvf: (u, v) => [u * 1.0, v * 2.4], face: () => [0, 0, sg] });
      B.add(bayPl, g);
    }
    // linings of the passage, lintel and the wall above the door inside
    const xIn = lin(FX, DH) - 0.05;
    for (const sg of [-1, 1]) {
      // board sides of the passage, from the leaning inner wall face out to the door frame (both faces of a 4 cm board)
      const zb = ZD + sg * (DW / 2 + 0.03), zc = ZD + sg * (BAY - 0.01), tone = [0.75 + rng() * 0.2, 0.68, 0.6];
      for (const [z, f] of [[zb, -sg], [zb + sg * 0.04, sg]]) {
        B.add(M.beams, sheet(4, 8, (u, v) => { const y = v * (DH + 0.06), x0 = lin(FX, y) - 0.03; return [x0 + u * (XD - x0), y, z]; },
          { uvf: (u, v, P) => [P[0], P[1]], face: () => [0, 0, f] }), { color: tone });
      }
      // dark backing between that board and the bay cheek, where the wall logs stop (else the cheek's outer plaster shows through)
      B.add(M.lining, sheet(2, 8, (u, v) => { const y = -0.1 + v * (DH + 0.2); return [lin(FX, y) + 0.17, y, zb + u * (zc - zb)]; }, { face: () => [-1, 0, 0] }));
    }
    for (let i = 0; i < 5; i++) B.add(M.beams, box(XD - xIn + 0.1, 0.05, (DW + 0.14) / 5, { p: [(XD + xIn) / 2, DH + 0.035, ZD - (DW + 0.14) / 2 + (i + 0.5) * (DW + 0.14) / 5] }), { color: [0.7 + rng() * 0.2, 0.62, 0.55] });
    for (let i = 0; i < 8; i++) {
      const w = 2 * BAY / 8;
      B.add(M.beams, box(0.045, ROOF.under - DH + 0.1, w + 0.005, { p: [lin(FX, H) - 0.02, (ROOF.under + DH) / 2, zL + (i + 0.5) * w] }), { color: [0.6 + rng() * 0.2, 0.55, 0.5] });
    }
    // door frame (jambs, head, threshold log) on the outer face
    B.add(M.outWood, box(0.12, DH + 0.12, 0.1, { p: [XD + 0.02, DH / 2, ZD - DW / 2 - 0.05] }), { color: [0.75, 0.73, 0.7] });
    B.add(M.outWood, box(0.12, DH + 0.12, 0.1, { p: [XD + 0.02, DH / 2, ZD + DW / 2 + 0.05] }), { color: [0.75, 0.73, 0.7] });
    B.add(M.outWood, box(0.14, 0.12, DW + 0.32, { p: [XD + 0.02, DH + 0.06, ZD] }), { color: [0.72, 0.7, 0.66] });
    B.add(M.logs, log([XD - 0.2, 0.03, ZD - DW / 2 - 0.1], [XD - 0.2, 0.05, ZD + DW / 2 + 0.1], 0.08, 0.075, rng, { caps: true }), { color: [0.8, 0.75, 0.7], extra: { outw: [0, 1, 0] } });
  });
  colliders.push({ x: (2.6 + 4.3) / 2, z: (-3.9 + ZD - DW / 2 + 0.02) / 2, hw: (4.3 - 2.6) / 2, hd: (ZD - DW / 2 + 0.02 + 3.9) / 2 });
  colliders.push({ x: (2.6 + 4.3) / 2, z: (ZD + DW / 2 - 0.02 + 3.9) / 2, hw: (4.3 - 2.6) / 2, hd: (3.9 - ZD - DW / 2 + 0.02) / 2 });
  colliders.push({ x: -(2.6 + 4.3) / 2, z: 0, hw: (4.3 - 2.6) / 2, hd: 3.9 });
  colliders.push({ x: 0, z: (2.25 + 4.0) / 2, hw: 4.3, hd: (4.0 - 2.25) / 2 });
  colliders.push({ x: 0, z: -(2.25 + 4.0) / 2, hw: 4.3, hd: (4.0 - 2.25) / 2 });

  // the door leaf: split larch planks on two battens, hide hinges; pivots on the north jamb
  const doorPivot = new THREE.Group();
  doorPivot.position.set(XD + 0.09, 0.02, ZD - DW / 2);
  const DB = new Buckets();
  const nP = 4, pw = DW / nP;
  section(() => {
    for (let i = 0; i < nP; i++) DB.add(M.outWood, box(0.055, DH - 0.03 - rng() * 0.03, pw - 0.006, { p: [0, (DH - 0.03) / 2, (i + 0.5) * pw], r: [0, 0, (rng() - 0.5) * 0.008] }), { color: [0.78 + rng() * 0.15, 0.74, 0.7] });
    for (const y of [0.3, DH - 0.35]) DB.add(M.outWood, box(0.04, 0.12, DW - 0.06, { p: [-0.045, y, DW / 2], r: [0.03, 0, 0] }), { color: [0.7, 0.66, 0.62] });
    for (const y of [0.28, DH - 0.33]) DB.add(M.leather, box(0.09, 0.08, 0.14, { p: [0.0, y, 0.0] }), { color: [0.5, 0.4, 0.32] });
    DB.add(M.leather, tube([[0.04, 0.95, DW - 0.12], [0.08, 0.9, DW - 0.13], [0.04, 0.85, DW - 0.12]], 0.012, 5), { color: [0.45, 0.35, 0.28] });
  });
  DB.build(doorPivot);
  root.add(doorPivot);
  const door = { pivot: doorPivot, open: winter ? 0 : 1, target: winter ? 0 : 1, maxAngle: 1.75 };
  doorPivot.rotation.y = door.open * door.maxAngle;

  // ---------- windows: board tunnels through the wall, net / mica / birch-bark fill ----------
  for (const o of win) { const yc0 = o.sill + WIN / 2; o.inner = at(o.sd, lin(o.sd.F, yc0) - 0.05, o.c, yc0); o.normal = [o.sd.n[0], 0, o.sd.n[1]]; }
  section(() => {
    for (const o of win) {
      const sd = o.sd, yc0 = o.sill + WIN / 2;
      const p0 = lin(sd.F, yc0) - 0.05, p1 = hp(sd.F, yc0) + 0.03, pm = (p0 + p1) / 2, len = p1 - p0;
      const rot = sd.n[0] ? [0, Math.PI / 2, 0] : [0, 0, 0];
      const put = (g, lat, y, perp) => { xf(g, { r: rot }); const q = at(sd, perp, lat, y); xf(g, { p: q }); return g; };
      // boards (local box: x = lateral, y = up, z = along the wall normal)
      for (const [w, h, dl, dy] of [[WIN + 0.06, 0.03, 0, -0.015], [WIN + 0.06, 0.03, 0, WIN + 0.015], [0.03, WIN, -WIN / 2 - 0.015, WIN / 2], [0.03, WIN, WIN / 2 + 0.015, WIN / 2]]) {
        const g = box(w, h, len);
        B.add(M.beams, put(g, o.c + dl * (sd.n[1] < 0 || sd.n[0] > 0 ? 1 : 1), o.sill + dy, pm), { color: [0.75, 0.7, 0.62] });
      }
      const fill = new THREE.PlaneGeometry(WIN, WIN);
      if (winter && o.side !== 'W') {
        // closed up for the summer: a sheet of birch bark wedged in from outside (the west window keeps its mica)
        const g = new THREE.PlaneGeometry(WIN + 0.02, WIN + 0.02, 2, 2);
        B.add(M.birch, put(xf(g, { r: [0, sd.n[1] < 0 || sd.n[0] < 0 ? Math.PI : 0, 0] }), o.c, yc0, p1 - 0.06), { color: [0.85, 0.82, 0.78] });
        continue;
      }
      const mat = o.side === 'W' ? M.mica : M.net;
      B.add(mat, put(fill, o.c, yc0, pm + 0.05));
      // willow frame of the fill
      for (const [w, h, dl, dy] of [[WIN, 0.015, 0, -WIN / 2 + 0.008], [WIN, 0.015, 0, WIN / 2 - 0.008], [0.015, WIN, -WIN / 2 + 0.008, 0], [0.015, WIN, WIN / 2 - 0.008, 0]]) {
        B.add(M.beams, put(box(w, h, 0.015), o.c + dl, yc0 + dy, pm + 0.05), { color: [0.6, 0.5, 0.38] });
      }
    }
  });

  // ---------- earth roof: soil edge band and sod top with a low crown (sheds east and west) ----------
  // inset: how far in from the edge the underside starts (house: just outside the dark lining, so no soil shows inside)
  const roof = (hx, hz, cz, edge, crown, under, seed, inset = [0.75, 0.75]) => {
    const N = 150;
    const topY = (x, z) => edge + crown * Math.pow(Math.max(0, 1 - Math.abs(x) / hx), 0.9) + 0.035 * fbm2(x * 1.3, z * 1.3, seed) + 0.015 * fbm2(x * 4, z * 4, seed + 1);
    section(() => {
      // soil band: underside → bulging face → rounded lip
      const innerHx = hx - inset[0], innerHz = hz - inset[1];
      const bandRings = [[innerHx, innerHz, under, 0], [hx - 0.06, hz - 0.06, under + 0.02, 0.04], [hx + 0.01, hz + 0.01, (under + edge) / 2 - 0.05, 0.14], [hx + 0.03, hz + 0.03, edge - 0.12, 0.12], [hx - 0.06, hz - 0.06, -1, 0.06]];
      B.add(M.soil, sheet(N, bandRings.length - 1, (u, v) => {
        const k = Math.round(v * (bandRings.length - 1));
        const [rx, rz, y, j] = bandRings[k];
        const [x, z, nx, nz] = rrect(rx, rz, Math.min(0.5, rz - 0.01), u);
        const jit = j * (fbm2(u * 60, k * 3.1, seed + 7) + 0.6 * fbm2(u * 190, k * 1.7, seed + 8));
        const X = x + nx * jit, Z = cz + z + nz * jit;
        const Y = y < 0 ? topY(X, Z - cz) - 0.03 : y + (k === 3 ? (topY(X, Z - cz) - edge) * 0.9 : 0) + j * 0.6 * fbm2(u * 40, k, seed + 9) + (k === 3 ? 0.07 * fbm2(u * 160, 3, seed + 11) : 0);
        return [X, Y, Z];
      }, { face: (x, y, z) => [x, 0, z - cz], uvf: (u, v) => [u * 2 * (2 * hx + 2 * hz), v * 0.7] }));
      // sod top: the edge ring drawn in onto the middle line — every point keeps its own path, so no ring
      // folds over the next and the middle closes (per-ring rounded rects left a slot open there)
      const ox = hx - 0.1, oz = hz - 0.1, mx = Math.max(0, hx - hz);
      B.add(M.sod, sheet(N, 9, (u, v) => {
        const [x0, z0, nx, nz] = rrect(ox, oz, Math.min(0.5, oz - 0.01), u);
        const jit = v === 0 ? 0.02 * (fbm2(u * 60, 0, seed + 7) + 0.6 * fbm2(u * 190, 0, seed + 8)) : 0;
        const ex = x0 + nx * jit, ez = z0 + nz * jit;
        const X = ex + (Math.max(-mx, Math.min(mx, ex)) - ex) * v, Z = cz + ez * (1 - v);
        return [X, topY(X, Z - cz) - 0.03, Z];
      }, { face: () => [0, 1, 0], uvf: (u, v) => [u * 2 * (2 * hx + 2 * hz), v * 0.7] }));
    });
    return topY;
  };
  const roofTop = roof(ROOF.hx, ROOF.hz, 0, ROOF.edge, ROOF.crown, ROOF.under, 21, [ROOF.hx - lin(FX, ROOF.under) - 0.22, ROOF.hz - lin(FZ, ROOF.under) - 0.22]);
  M.soil.shadowSide = M.sod.shadowSide = THREE.DoubleSide;

  // ---------- khoton (cow barn) against the north wall: lower, rougher, more dung in the plaster ----------
  const kcz = KH.zc;
  const klin = (F, y) => F + GAP + 0.65 * (1 - y / KH.h);
  const KZD = -5.4;  // barn door on its east wall
  const kSkip = (u, v) => {
    const y = y0p + v * (KH.top - 0.2 - y0p);
    const [x, z] = rrect(klin(KH.hx, y) + PL, klin(KH.hz, y) + PL, 0.4, u);
    return z + kcz > -hp(FZ, y) + 0.25 || (x > KH.hx && Math.abs(z + kcz - KZD) < 0.62); // ends 25 cm inside the house wall
  };
  M.plasterKhoton = M.plaster(openingsNode([]), { khoton: true, flake: winter ? 0.72 : 0.66 });
  M.plasterKhoton.shadowSide = THREE.DoubleSide;
  section(() => {
    B.add(M.plasterKhoton, plasterLoft((y) => klin(KH.hx, y) + PL, (y) => klin(KH.hz, y) + PL, kcz, kSkip, 31, KH.top - 0.2));
  });
  const KR = { hx: KH.hx + 0.85, z0: -2.95, z1: kcz - KH.hz - GAP - PL - 0.45 };
  KR.hz = (KR.z0 - KR.z1) / 2; KR.cz = (KR.z0 + KR.z1) / 2;
  const kTop = roof(KR.hx, KR.hz, KR.cz, KH.top, 0.16, KH.top - 0.45, 41);
  // barn door bay
  // its front stands out past the roof edge: vertical past the lintel, then leaning back into the roof's underside
  const kxd = klin(KH.hx, 0) + PL + 0.05, kyT = KH.top - 0.4, kyB = (v) => -0.2 + v * (kyT + 0.2);
  const kbayX = (y) => (y < 1.62 ? kxd : kxd + (KR.hx - 0.1 - kxd) * Math.min(1, (y - 1.62) / (kyT - 1.62)));
  section(() => {
    for (const [z, sg] of [[KZD - 0.62, -1], [KZD + 0.62, 1]]) {
      const g = sheet(8, 14, (u, v) => { const y = kyB(v); return [klin(KH.hx, y) + PL - 0.2 + u * (kbayX(y) - klin(KH.hx, y) - PL + 0.2), y, z]; }, { uvf: (u, v) => [u, v * 2], face: () => [0, 0, sg] });
      B.add(M.plasterKhoton, g);
    }
    B.add(M.plasterKhoton, sheet(10, 16, (u, v) => [kbayX(kyB(v)), kyB(v), KZD + 0.62 - u * 1.24], {
      face: () => [1, 0, 0], uvf: (u, v) => [u * 1.24, v * 2], skip: (u, v) => Math.abs(0.62 - u * 1.24) < 0.52 && kyB(v) < 1.45,
    }));
    for (const dz of [-0.55, 0.55]) B.add(M.outWood, box(0.12, 1.55, 0.1, { p: [kxd + 0.02, 0.75, KZD + dz] }), { color: [0.62, 0.6, 0.56] });
    B.add(M.outWood, box(0.14, 0.12, 1.3, { p: [kxd + 0.02, 1.5, KZD] }), { color: [0.62, 0.6, 0.56] });
    // inside of the barn (seen through the door): dark board lining, a manger log — kept between the bay cheeks,
    // since the khoton wall leans in and anything wider would show outside
    const kIn = 0.6, kD = 1.6;
    B.add(M.beams, box(0.05, 1.6, 2 * kIn, { p: [kxd - kD, 0.8, KZD] }), { color: [0.35, 0.3, 0.26] });
    for (const sg of [-1, 1]) B.add(M.beams, box(kD, 1.6, 0.05, { p: [kxd - kD / 2 - 0.02, 0.8, KZD + sg * (kIn - 0.03)] }), { color: [0.35, 0.3, 0.26] });
    B.add(M.beams, box(kD + 0.05, 0.05, 2 * kIn, { p: [kxd - kD / 2 - 0.02, 1.52, KZD] }), { color: [0.25, 0.2, 0.17] });
    B.add(M.logs, log([kxd - 1.45, 0.35, KZD - kIn + 0.06], [kxd - 1.45, 0.38, KZD + kIn - 0.06], 0.11, 0.1, rng, { caps: true }), { color: [0.6, 0.55, 0.5], extra: { outw: [0, 1, 0] } });
  });
  // barn door: summer propped open, winter shut
  const kd = new THREE.Group();
  kd.position.set(kxd + 0.08, 0.02, KZD - 0.5);
  const KB = new Buckets();
  section(() => {
    for (let i = 0; i < 4; i++) KB.add(M.outWood, box(0.05, 1.4 - rng() * 0.05, 0.245, { p: [0, 0.7, 0.125 + i * 0.25], r: [0, 0, (rng() - 0.5) * 0.02] }), { color: [0.7 + rng() * 0.1, 0.67, 0.62] });
    KB.add(M.outWood, box(0.04, 0.1, 0.95, { p: [-0.04, 0.35, 0.5], r: [0.25, 0, 0] }), { color: [0.6, 0.57, 0.52] });
  });
  KB.build(kd);
  kd.rotation.y = winter ? 0 : 1.9;
  root.add(kd);
  colliders.push({ x: 0, z: (KR.z1 - 0.6 - 3.4) / 2, hw: klin(KH.hx, 0) + PL + 0.35, hd: (KR.z1 - 0.6 + 3.4) / -2 }); // to the berm's foot
  // ---------- earth berm (кунус) round the foot, held by horizontal logs on stakes ----------
  // Two cross-sections (offset out from the wall foot, height), blended per point round the perimeter:
  // CURB where the retaining logs stand (the earth heaps over the top log, its face hidden behind them),
  // FREE elsewhere (corners, the khoton, the door ends): a slumped toe running out into the ground.
  const CURB = [[0.02, 0.58], [0.3, 0.44], [0.48, 0.37], [0.575, 0.3], [0.6, 0.02], [0.66, -0.25]];
  const FREE = [[0.02, 0.58], [0.3, 0.44], [0.5, 0.32], [0.7, 0.13], [0.88, -0.01], [0.95, -0.25]];
  const SLUMP = 0.55, Y_END = 0.03;   // a door gap's earth slumps down over this run to a crumbled end at the threshold
  const ease = (t) => { t = Math.min(1, Math.max(0, t)); return 1 - (1 - t) * (1 - t); };
  const slumped = (y, s) => (y > Y_END ? Y_END + (y - Y_END) * s : y);
  // cut(x, z) → true where the berm is left out; curb(x, z), slump(x, z): 0..1 (slump 1 = full height). All three
  // are asked at the perimeter point where the logs stand (local to the berm's centre), so a cut meets a slumped end.
  const berm = (hxF, hzF, cz, cut, seed, { curb = () => 0, slump = () => 1, NU = 440 } = {}) => {
    const p0x = hxF(0), p0z = hzF(0);
    const NR = CURB.length + 1;   // NU columns: ~8 cm each on the house, so a slumped end gets several
    const at = (u) => rrect(p0x + 0.6, p0z + 0.6, 0.55, u);
    const skipF = (u) => { const [x, z] = at(u); return cut(x, z); };
    const f = (u, v) => {
      const k = Math.round(v * (NR - 1));
      const [ox, oz] = at(u);
      const c = curb(ox, oz), s = slump(ox, oz);
      let rx, rz, y;
      if (k === 0) {   // inside the wall; at a slumped end it comes down to the foot, just inside the bay front
        const w = (p0, r) => p0 - 0.05 + (r - 0.11 - p0) * s;
        rx = w(p0x, hxF(0.72)); rz = w(p0z, hzF(0.72)); y = slumped(0.72, s);
      }
      else {
        const [cd, cy] = CURB[k - 1], [fd, fy] = FREE[k - 1];
        const d = 0.02 + (fd + (cd - fd) * c - 0.02) * Math.sqrt(s);   // a slumping end narrows to a rounded nose
        rx = p0x + d; rz = p0z + d; y = slumped(fy + (cy - fy) * c, s);
      }
      const [x, z, nx, nz] = rrect(rx, rz, 0.55, u);
      const j = 0.06 * fbm2(u * 50, k * 2, seed) * (k >= 3 ? 1 - 0.8 * c : 1) * (0.3 + 0.7 * Math.sqrt(s));   // the curbed face keeps behind the logs
      const dy = k > 0 && k < 4 && y > Y_END ? 0.05 * fbm2(u * 70, k, seed + 2) * s : 0;
      return [x + nx * j, y + dy, cz + z + nz * j];
    };
    B.add(M.sod, sheet(NU, NR - 1, f, { uvf: (u, v) => [u * 30, v * 1.4], skip: skipF, face: (x, y, z) => [x * 0.3, 1, (z - cz) * 0.3] }));
    // where the berm is cut (door gaps, the khoton joint) a soil face closes its cross-section down into the ground;
    // at the doors the earth has slumped to a few centimetres there, at the khoton joint it lies inside the house berm
    for (let i = 0; i < NU; i++) {
      const a = skipF((i - 0.5) / NU), b = skipF((i + 0.5) / NU);
      if (a === b) continue;
      const u = i / NU, q = f(u, 0.5), q2 = f(u + (a ? -1 : 1) / NU, 0.5), out = [q2[0] - q[0], 0, q2[2] - q[2]];
      const n = NR - 1;   // from ring 1 out: ring 0 lies inside the wall (and the door bay)
      B.add(M.soil, sheet(1, n - 1, (w, v) => { const P = f(u, (1 + v * (n - 1)) / n); return w ? [P[0], -0.3, P[2]] : P; },
        { uvf: (w, v, P) => [v * 1.2, P[1]], face: () => out }));
    }
    return [p0x + 0.55, p0z + 0.55, 0.33];
  };
  // the house berm's logs: x = ±bx (east, west), z = bz (south); the north side lies inside the khoton
  const p0x = hp(FX, 0), p0z = hp(FZ, 0), bx = p0x + 0.62, bz = p0z + 0.62;
  const doorCut = DW / 2 + 0.05, logGap = doorCut + SLUMP;   // logs stop where the earth starts to slump
  const span = (t, a, b) => Math.min(1, Math.max(0, Math.min(t - a, b - t) / 0.25 + 0.4));   // 1 along a log, 0 0.1 m past its end
  const logEnd = { x: bx - 0.5, z: bz - 0.5 };
  const houseCurb = (x, z) => {
    if (x > p0x) return z < ZD ? span(z, -logEnd.z, ZD - logGap) : span(z, ZD + logGap, logEnd.z);
    if (x < -p0x) return span(z, -logEnd.z, logEnd.z);
    if (z > p0z) return span(x, -logEnd.x, logEnd.x);
    return 0;
  };
  const houseSlump = (x, z) => (x > 0 ? ease((Math.abs(z - ZD) - doorCut) / SLUMP) : 1);
  const kSlump = (x, z) => (x > 0 ? ease((Math.abs(z + kcz - KZD) - 0.6) / SLUMP) : 1);
  const hb = section(() => berm((y) => hp(FX, y), (y) => hp(FZ, y), 0, (x, z) => x > 0 && Math.abs(z - ZD) < doorCut, 51, { curb: houseCurb, slump: houseSlump }));
  // the khoton's bank ends inside the house berm (z > -3.3) and at its door
  const kb = section(() => berm((y) => klin(KH.hx, y) + PL, (y) => klin(KH.hz, y) + PL, kcz, (x, z) => z + kcz > -3.3 || (x > 0 && Math.abs(z + kcz - KZD) < 0.6), 61, { slump: kSlump, NU: 300 }));
  // retaining logs along each straight side of the house berm, on stakes; the earth slumps off past their ends.
  // Bark faces out and up (`outw`): the material darkens faces across `outw` as clay-packed joints.
  section(() => {
    const rl = (a, b, outw, r = 0.09) => B.add(M.logs, log(a, b, r, r * 0.9, rng, { caps: true, seg: 8, bow: 0.004, knob: 0.06 }), { color: [0.75, 0.72, 0.68], extra: { outw } });
    const OUT_S = [0, 0.6, 0.8], OUT_W = [-0.8, 0.6, 0], OUT_E = [0.8, 0.6, 0];
    for (const y of [0.075, 0.235]) {
      rl([-logEnd.x, y, bz], [logEnd.x, y, bz], OUT_S);
      rl([-bx, y, -logEnd.z], [-bx, y, logEnd.z], OUT_W);
      rl([bx, y, -logEnd.z], [bx, y, ZD - logGap], OUT_E);
      rl([bx, y, ZD + logGap], [bx, y, logEnd.z], OUT_E);
    }
    const stake = (x, z, dir) => rl([x, -0.2, z], [x + (rng() - 0.5) * 0.03, 0.42, z + (rng() - 0.5) * 0.03], dir, 0.065);
    const run = (a, b, put) => { const n = Math.max(1, Math.round((b - a) / 1.6)); for (let i = 0; i <= n; i++) put(a + 0.12 + (b - a - 0.24) * i / n + (i > 0 && i < n ? (rng() - 0.5) * 0.3 : 0)); };
    run(-logEnd.x, logEnd.x, (x) => stake(x, bz + 0.15, [0, 0, 1]));
    run(-logEnd.z, logEnd.z, (z) => stake(-bx - 0.15, z, [-1, 0, 0]));
    run(-logEnd.z, ZD - logGap, (z) => stake(bx + 0.15, z, [1, 0, 0]));
    run(ZD + logGap, logEnd.z, (z) => stake(bx + 0.15, z, [1, 0, 0]));
  });

  // ---------- canopy (чарапчы) over the door: two posts, a beam, poles and a thin earth layer ----------
  const cx = XD + 1.85, cw = 1.2, cy = 2.02;
  for (const dz of [-cw, cw]) colliders.push({ x: cx, z: ZD + dz, r: 0.12 });
  section(() => {
    for (const dz of [-cw, cw]) {
      B.add(M.outWood, log([cx, -0.3, ZD + dz], [cx + (rng() - 0.5) * 0.05, cy, ZD + dz], 0.09, 0.08, rng, { caps: true, seg: 8 }), { color: [0.72, 0.7, 0.66] });
      B.add(M.outWood, log([XD + 0.05, cy + 0.2, ZD + dz], [cx + 0.15, cy + 0.03, ZD + dz], 0.075, 0.07, rng, { caps: true, seg: 7 }), { color: [0.7, 0.68, 0.64] });
    }
    B.add(M.outWood, log([cx, cy + 0.02, ZD - cw - 0.25], [cx, cy + 0.02, ZD + cw + 0.25], 0.085, 0.08, rng, { caps: true, seg: 8 }), { color: [0.7, 0.68, 0.64] });
    for (let z = ZD - cw - 0.2; z < ZD + cw + 0.2; z += 0.085 + rng() * 0.01) {
      const r = 0.035 + rng() * 0.01;
      B.add(M.outWood, log([XD - 0.1, cy + 0.33, z], [cx + 0.14 + rng() * 0.06, cy + 0.13, z + (rng() - 0.5) * 0.04], r, r * 0.85, rng, { seg: 5, caps: true }), { color: [0.68 + rng() * 0.1, 0.66, 0.62] });
    }
    const cTop = (u, v) => cy + 0.5 - u * 0.21 + 0.05 * Math.sin(v * Math.PI) + 0.02 * fbm2(u * 6, v * 6, 4);
    const cX = (u) => XD - 0.1 + u * (cx + 0.12 - XD + 0.1), cZ = (v) => ZD - cw - 0.12 + v * (2 * cw + 0.24);
    const cs = sheet(10, 10, (u, v) => [cX(u), cTop(u, v), cZ(v)], { face: () => [0, 1, 0] });
    // the earth layer's edges (front and both sides): a crumbled, bulging lip that meets the sod's edge on top
    // (one flat strip read as a board)
    const lip = (n, base, out, yb, yt, seed) => sheet(n, 3, (t, v) => {
      const k = Math.round(v * 3), [x, z] = base(t), y0 = yb(t), y1 = yt(t);
      const e = Math.min(1, 12 * t * (1 - t));   // the ends close onto the corner line, where the next lip starts
      const o = e * [-0.02 + 0.02 * fbm2(t * 13, 0, seed), 0.022 + 0.02 * fbm2(t * 11, 1, seed), 0.012 + 0.015 * fbm2(t * 17, 2, seed), 0][k];
      const y = [y0 + 0.03 * e * fbm2(t * 13, 3, seed), y0 + 0.4 * (y1 - y0), y0 + 0.8 * (y1 - y0), y1][k];
      return [x + out[0] * o, y, z + out[1] * o];
    }, { uvf: (t, v, P) => [P[0] + P[2], P[1]], face: () => [out[0], 0, out[1]] });
    B.add(M.soil, lip(24, (t) => [cX(1), cZ(t)], [1, 0], () => cy + 0.12, (t) => cTop(1, t), 3));
    for (const sv of [0, 1]) B.add(M.soil, lip(16, (t) => [cX(t), cZ(sv)], [0, sv ? 1 : -1], (t) => cy + 0.3 - t * 0.18, (t) => cTop(t, sv), 5 + sv));
    B.add(M.sod, cs);
  });

  // ---------- chimney top (хоро) above the earth roof ----------
  const chim = { x: HEARTH.x + 0.12, z: HEARTH.z - 0.12 };
  const chTop = roofTop(chim.x, chim.z) + 0.68;
  const B2 = { chim, chTop };

  const meshes = B.build(root);
  return { colliders, door, kDoor: kd, windows: win, roofTop, kRoof: { hx: KR.hx, hz: KR.hz, cz: KR.cz, top: kTop }, canopy: { x0: XD - 0.1, x1: cx + 0.12, z0: ZD - cw - 0.12, z1: ZD + cw + 0.12, y: cy + 0.5 }, berm: { hb, kb, kcz, KZD, kxd, height: (y, x, z) => slumped(y, houseSlump(x, z)) }, chim: B2, meshes };
}
