// Inside the balagan: the named benches (орон), the хаппахчы alcove, тойон баҕана with the calendar
// board, the low table, the долбуур shelf with bowls, ladle and birch-bark ware, the festive outfit and
// silver laid out for Ysyakh, the хомус on its peg, the knife on the work board, furs and curtains.
import * as THREE from 'three/webgpu';
import { box, log, sheet, fbm2, xf, lathe, tube } from './geo.js';
import { FX, FZ, H, ZD, DW, inner } from './dims.js';

const BT = 0.5; // bench top height
const POSTS_X = [-FX, 0, FX];   // the post frame's posts stand at these x on both long walls (shell.js)

// invisible ray targets (raycasts ignore visibility; nothing is drawn)
function proxy(root, w, h, d, p, r = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
  m.position.set(...p); m.rotation.set(...r);
  m.visible = false; m.castShadow = false;
  root.add(m);
  return m;
}

export function buildInterior({ B, M, rng, winter, root }) {
  const colliders = [], targets = {}, benches = [];
  const bz = inner(FZ, BT), bx = inner(FX, BT);  // wall at bench height
  const FRONT_Z = 1.9, FRONT_X = 2.4;

  // ---------- floor of beaten earth (and through the door passage) ----------
  const fl = sheet(30, 26, (u, v) => [-3.7 + u * 7.5, 0.012 + 0.006 * fbm2(u * 9, v * 9, 2), -3.2 + v * 6.4], { face: () => [0, 1, 0] });
  B.add(M.floorMat, fl);
  B.add(M.floorMat, sheet(6, 4, (u, v) => [3.5 + u * 0.7, 0.014, ZD - DW / 2 - 0.05 + v * (DW + 0.1)], { face: () => [0, 1, 0] }));

  // ---------- benches ----------
  // rect in plan, which side is the front (room side), label
  const defs = [
    { x0: 0.95, x1: bx - 0.02, z0: FRONT_Z, z1: bz, front: 'z-', sah: 'Атах орон', en: 'Atakh oron, the humble bench by the door', ru: 'Атах орон — лежанка у двери для простых гостей', hide: winter ? null : [0.42, 0.28, 0.17] },
    { x0: -0.95, x1: 0.95, z0: FRONT_Z, z1: bz, front: 'z-', sah: 'Орто орон', en: 'Orto oron, the middle bench', ru: 'Орто орон — средняя лежанка', hide: null },
    { x0: -bx + 0.02, x1: -0.95, z0: FRONT_Z, z1: bz, front: 'z-', sah: 'Биллэрик', en: 'Billerik, the honoured bench', ru: 'Биллэрик — почётная лежанка', hide: winter ? null : [0.16, 0.11, 0.07] },
    { x0: -bx, x1: -FRONT_X, z0: 0.15, z1: FRONT_Z, front: 'x+', sah: 'Бастыҥ орон', en: 'Bastyng oron, the best bench', ru: 'Бастыҥ орон — лучшее место', hide: winter ? null : [0.36, 0.2, 0.1] },
    { x0: -bx, x1: -FRONT_X, z0: -FRONT_Z, z1: 0.15, front: 'x+', sah: 'Кэтэҕириин', en: 'Ketegiriin, the family bed', ru: 'Кэтэҕириин — семейная постель', hide: winter ? null : [0.55, 0.5, 0.44] },
    { x0: -1.35, x1: 0.25, z0: -bz, z1: -FRONT_Z, front: 'z+', sah: 'Хаҥас орон', en: "Khangas oron, the women's bench", ru: 'Хаҥас орон — женская лежанка', hide: null },
    { x0: 0.25, x1: 0.98, z0: -bz, z1: -FRONT_Z, front: 'z+', sah: 'Иһит ороно', en: 'Ihit orono, the bench for vessels', ru: 'Иһит ороно — лавка для посуды', hide: null },
    { x0: -bx + 0.02, x1: -1.35, z0: -bz, z1: -FRONT_Z, front: 'z+', alcove: true },
  ];
  for (const d of defs) {
    const alongX = d.front[0] === 'z';
    const L = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
    const D = alongX ? Math.abs(d.z1 - d.z0) : Math.abs(d.x1 - d.x0);
    const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
    const fs = d.front[1] === '+' ? 1 : -1;      // front direction sign along the depth axis
    // planks along the bench, slightly uneven, gaps between
    const nP = Math.max(4, Math.round(D / 0.24));
    for (let i = 0; i < nP; i++) {
      const off = -D / 2 + (i + 0.5) * D / nP;
      const w = D / nP - 0.008, t = 0.045, y = BT - t / 2 + (rng() - 0.5) * 0.008;
      const tint = [0.9 + rng() * 0.15, 0.78 + rng() * 0.1, 0.6];
      const g = alongX ? box(L - 0.02, t, w, { p: [cx, y, cz + off], r: [(rng() - 0.5) * 0.01, 0, 0] }) : box(w, t, L - 0.02, { p: [cx + off, y, cz], r: [0, 0, (rng() - 0.5) * 0.01] });
      B.add(M.planks, g, { color: tint });
    }
    // squared front beam (plain: no image source for carving on bench beams, docs/patterns.md), sleepers under
    const fp = alongX ? [cx, BT - 0.11, cz + fs * (D / 2 - 0.06)] : [cx + fs * (D / 2 - 0.06), BT - 0.11, cz];
    B.add(M.beams, alongX ? box(L, 0.17, 0.12, { p: fp }) : box(0.12, 0.17, L, { p: fp }), { color: [0.62, 0.5, 0.4] });
    for (const k of [0.15, L / 2, L - 0.15]) {
      const q = alongX ? [d.x0 + k, 0.2, cz] : [cx, 0.2, d.z0 + k];
      B.add(M.beams, alongX ? box(0.12, 0.4, D - 0.1, { p: q }) : box(D - 0.1, 0.4, 0.12, { p: q }), { color: [0.45, 0.38, 0.32] });
    }
    // low partition board at the bench's ends ("doorways" between compartments)
    if (!d.alcove) for (const k of [0, L]) {
      const q = alongX ? [d.x0 + k, BT + 0.15, cz] : [cx, BT + 0.15, d.z0 + k];
      B.add(M.planks, alongX ? box(0.04, 0.3, D * 0.7, { p: [q[0], q[1], cz - fs * D * 0.15] }) : box(D * 0.7, 0.3, 0.04, { p: [cx - fs * D * 0.15, q[1], q[2]] }), { color: [0.75, 0.62, 0.5] });
    }
    colliders.push({ x: cx, z: cz, hw: Math.abs(d.x1 - d.x0) / 2, hd: Math.abs(d.z1 - d.z0) / 2, y0: -1, y1: BT + 0.05 });
    if (d.hide) {
      // along a bench with a post standing in it (the frame's posts are on the long walls), the hide takes the
      // longer free stretch beside the post: its legs reach ~1.45 × its half length
      let a = d.x0 + 0.06, b = d.x1 - 0.06;
      if (alongX) for (const px of POSTS_X) if (px > a && px < b) { if (px - a > b - px) b = px - 0.25; else a = px + 0.25; }
      const hc = alongX ? (a + b) / 2 : cx, hl = alongX ? Math.min(L * 0.42, (b - a) / 2 / 1.45) : L * 0.42;
      hide(B, M, rng, alongX ? [hc, cz + (d.z1 > 0 ? 0.08 : -0.08)] : [cx - 0.08, cz], alongX ? [hl, D * 0.45] : [D * 0.45, hl], alongX, fs, D, d.hide);
    }
    if (!d.alcove) {
      const t = proxy(root, alongX ? L : D, 0.4, alongX ? D : L, [cx, BT - 0.1, cz]);
      benches.push({ target: t, label: { sah: d.sah, en: d.en, ru: d.ru } });
    }
  }
  // pillows on the best bench and the family bed
  if (!winter) for (const [x, z] of [[-3.1, 1.3], [-3.15, -1.2], [-3.05, -0.5]]) {
    const g = new THREE.SphereGeometry(0.2, 12, 8);
    xf(g, { p: [x, BT + 0.08, z], s: [0.7, 0.3, 1.05] });
    B.add(M.leather, g, { color: [0.85, 0.7, 0.55] });
  }

  // ---------- хаппахчы: the curtained alcove of the women's side (look only) ----------
  {
    const x0 = -bx, x1 = -1.35, zf = -FRONT_Z + 0.05, top = 1.95;
    const xl = (y) => -inner(FX, y) + 0.03;   // the leaning west wall: nothing pokes through it
    for (let i = 0; i < 6; i++) B.add(M.planks, box(0.035, top, 1.2 / 6 + 0.004, { p: [x1, top / 2, zf - (i + 0.5) * 1.2 / 6] }), { color: [0.7 + rng() * 0.15, 0.6, 0.5] });
    B.add(M.planks, box(x1 - xl(top) + 0.05, 0.04, inner(FZ, top) - FRONT_Z + 0.02, { p: [(xl(top) + x1) / 2, top, -(FRONT_Z + inner(FZ, top)) / 2] }), { color: [0.6, 0.5, 0.42] });
    B.add(M.beams, log([xl(top - 0.06) + 0.02, top - 0.06, zf + 0.04], [x1, top - 0.06, zf + 0.04], 0.025, 0.022, rng, { caps: true }), { color: [0.5, 0.4, 0.32] });
    const cx = (u, y) => xl(y) + u * (x1 - 0.03 - xl(y));
    const curtain = sheet(36, 18, (u, v) => { const y = 0.05 + v * (top - 0.13); return [cx(u, y), y, zf + 0.035 + 0.012 * Math.sin(u * 37) + 0.01 * fbm2(u * 6, v * 4, 3) * v]; }, { uvf: (u, v) => [u * (x1 - x0), v * (top - 0.13)], face: () => [0, 0, 1] });
    B.add(M.birchCurtain, curtain);
    for (const u of [0, 0.5, 1]) B.add(M.leather, log([cx(u, 0.05), 0.05, zf + 0.045], [cx(u, top - 0.08), top - 0.08, zf + 0.045], 0.012, 0.012, rng, { caps: true, knob: 0 }), { color: [0.3, 0.2, 0.14] });
    B.add(M.leather, box(x1 - x0 - 0.06, 0.025, 0.012, { p: [(x0 + x1) / 2, 0.06, zf + 0.045] }), { color: [0.3, 0.2, 0.14] });
    colliders.push({ x: (x0 + x1) / 2, z: -(FRONT_Z + bz) / 2, hw: (x1 - x0) / 2 + 0.05, hd: (bz - FRONT_Z) / 2 + 0.1 });
    targets.khappakhchy = proxy(root, x1 - x0, top, 0.2, [(x0 + x1) / 2, top / 2, zf]);
  }

  // ---------- leather curtain of кэтэҕириин, half drawn ----------
  if (!winter) {
    const xr = -FRONT_X + 0.03, z0 = -FRONT_Z + 0.05, z1 = -0.65, top = 1.95;
    B.add(M.beams, log([xr, top, -FRONT_Z], [xr, top, 0.2], 0.022, 0.02, rng, { caps: true }), { color: [0.5, 0.4, 0.3] });
    B.add(M.leather, sheet(30, 14, (u, v) => {
      const z = z0 + Math.pow(u, 1.25) * (z1 - z0);
      return [xr + 0.04 * Math.sin(u * 40) * (0.6 + v * 0.4) + 0.02 * fbm2(u * 5, v * 3, 4), BT + 0.02 + v * (top - BT - 0.04), z];
    }, { uvf: (u, v) => [u * 1.4, v * 1.4], face: () => [1, 0, 0] }), { color: [0.62, 0.5, 0.42] });
  }

  // ---------- тойон баҕана: the master post in the SW corner, horse-head finial, horsehair tufts ----------
  {
    const px = -FX, pz = FZ;
    B.add(M.logs, log([px, -0.3, pz], [px + 0.01, H, pz - 0.01], 0.175, 0.16, rng, { seg: 12, knob: 0.03, caps: true }), { color: [0.85, 0.72, 0.6], extra: { outw: [0, 0, 0] } });
    const inDir = new THREE.Vector3(1, 0, -1).normalize();   // faces the room (NE)
    const fy = 1.9, fx = px + inDir.x * 0.2, fz = pz + inDir.z * 0.2;
    if (!winter) {
      // carved horse head: neck block, head, muzzle, ears
      const yaw = Math.atan2(-inDir.z, inDir.x);
      const parts = [
        [new THREE.SphereGeometry(0.05, 10, 8), [0, 0, 0], [1.6, 1.0, 0.9]],
        [new THREE.SphereGeometry(0.035, 10, 8), [0.08, -0.03, 0], [1.4, 0.9, 0.85]],
        [new THREE.ConeGeometry(0.012, 0.04, 6), [-0.03, 0.05, 0.018], [1, 1, 1]],
        [new THREE.ConeGeometry(0.012, 0.04, 6), [-0.03, 0.05, -0.018], [1, 1, 1]],
        [new THREE.BoxGeometry(0.08, 0.1, 0.07), [-0.06, -0.04, 0], [1, 1, 1]],
      ];
      for (const [g, p, s] of parts) {
        xf(g, { s });
        xf(g, { p });
        xf(g, { r: [0, yaw, 0] });
        xf(g, { p: [fx, fy, fz] });
        B.add(M.oiled, g, { color: [0.38, 0.3, 0.24] });
      }
      // horsehair tufts, white and black, tied below the head
      for (const [k, col] of [[-1, [0.88, 0.86, 0.8]], [1, [0.05, 0.045, 0.04]]]) {
        const side = new THREE.Vector3(-inDir.z, 0, inDir.x).multiplyScalar(k * 0.05);
        for (let i = 0; i < 26; i++) {
          const a = rng() * 6.28, r = rng() * 0.012;
          const sx = fx + side.x + Math.cos(a) * r, sz = fz + side.z + Math.sin(a) * r;
          const sway = (rng() - 0.5) * 0.04;
          B.add(M.hair, tube([[sx, fy - 0.1, sz], [sx + sway * 0.5, fy - 0.25, sz + sway * 0.3], [sx + sway, fy - 0.4 - rng() * 0.05, sz + sway * 0.6]], 0.0018, 3, false, 4), { color: col });
        }
        B.add(M.leather, new THREE.CylinderGeometry(0.014, 0.014, 0.025, 8).translate(fx + side.x, fy - 0.1, fz + side.z), { color: [0.3, 0.2, 0.14] });
      }
    }
    targets.toyon = proxy(root, 0.38, 2.1, 0.38, [px, 1.05, pz]);

    // calendar board (ый ааттара): a larch plank, 12 months of notches, a peg on a string
    const CB = [];
    CB.push([box(0.12, 0.6, 0.02), [0.62, 0.48, 0.34]]);
    for (let m = 0; m <= 12; m++) CB.push([box(0.12, 0.004, 0.006, { p: [0, -0.3 + m * 0.05, 0.009] }), [0.12, 0.09, 0.07]]);
    for (let m = 0; m < 12; m++) for (let k = 0; k < 30; k++) {
      const grp = Math.floor(k / 10), y = -0.3 + m * 0.05 + 0.004 + (k % 10) * 0.0042 + grp * 0.0001;
      const x = -0.05 + grp * 0.035 + (k % 10 === 9 ? 0.002 : 0);
      CB.push([new THREE.PlaneGeometry(0.012 + (k % 5 === 4 ? 0.006 : 0), 0.0016).translate(x, y, 0.0102), [0.15, 0.11, 0.08]]);
    }
    for (let m = 0; m < 12; m++) CB.push([new THREE.CylinderGeometry(0.004, 0.004, 0.022, 6).rotateX(Math.PI / 2).translate(0.045, -0.275 + m * 0.05, 0), [0.05, 0.04, 0.03]]);
    CB.push([new THREE.CylinderGeometry(0.0035, 0.0035, 0.035, 6).rotateX(Math.PI / 2).translate(0.045, -0.275 + 6 * 0.05, 0.02), [0.85, 0.72, 0.55]]);   // the peg in От ыйа (July)
    CB.push([tube([[0.045, -0.275 + 6 * 0.05, 0.03], [0.06, -0.0, 0.025], [0.05, 0.27, 0.015]], 0.0012, 3), [0.3, 0.25, 0.2]]);
    CB.push([tube([[0, 0.3, 0.0], [0, 0.36, 0.01], [0, 0.41, -0.02]], 0.004, 4), [0.3, 0.2, 0.14]]);
    for (const [g, c] of CB) {
      xf(g, { r: [0, Math.atan2(inDir.x, inDir.z), 0] });
      xf(g, { p: [px + inDir.x * 0.19, 1.45, pz + inDir.z * 0.19] });
      B.add(M.oiled, g, { color: c.map((v) => v * 1.2) });
    }
    B.add(M.beams, new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6).rotateX(Math.PI / 2).rotateY(Math.atan2(inDir.x, inDir.z)).translate(px + inDir.x * 0.2, 1.86, pz + inDir.z * 0.2), { color: [0.5, 0.4, 0.3] });
    targets.calendar = proxy(root, 0.2, 0.68, 0.08, [px + inDir.x * 0.2, 1.47, pz + inDir.z * 0.2], [0, Math.atan2(inDir.x, inDir.z), 0]);
  }

  // ---------- low table (сандалы) before the best bench, with a bowl of salamaat ----------
  const T = { x: -1.95, z: 1.05, w: 0.62, d: 0.9, h: 0.42 };
  if (!winter) {
    for (let i = 0; i < 3; i++) B.add(M.oiled, box(T.w / 3 - 0.006, 0.04, T.d, { p: [T.x - T.w / 2 + (i + 0.5) * T.w / 3, T.h, T.z] }), { color: [0.75, 0.62, 0.5] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(M.oiled, box(0.06, T.h - 0.02, 0.06, { p: [T.x + sx * (T.w / 2 - 0.06), (T.h - 0.02) / 2, T.z + sz * (T.d / 2 - 0.06)] }), { color: [0.55, 0.45, 0.36] });
    B.add(M.oiled, box(T.w - 0.1, 0.05, 0.04, { p: [T.x, 0.12, T.z] }), { color: [0.5, 0.42, 0.34] });
    colliders.push({ x: T.x, z: T.z, hw: T.w / 2, hd: T.d / 2, y0: -1, y1: T.h + 0.05 });
  }

  // ---------- кытыйа bowls: three sizes (A low, B standard with a copper band, C tall) ----------
  const bowl = (rim, ht, x, y, z, { band = false, food = false, tint = [1, 1, 1] } = {}) => {
    const r = rim / 2, base = r * 0.45;
    const out = [[0, 0], [base, 0], [base + 0.004, 0.004], [r * 0.82, ht * 0.45], [r, ht * 0.95], [r - 0.004, ht], [r - 0.01, ht * 0.97], [r * 0.78, ht * 0.5], [base * 0.9, 0.012], [0, 0.012]];
    const g = lathe(out, 16).translate(x, y, z);
    B.add(M.oiled, g, { color: tint });
    if (band) B.add(M.silver, lathe([[r + 0.002, ht * 0.78], [r + 0.003, ht * 0.86], [r * 1.0 + 0.002, ht * 0.95]], 16).translate(x, y, z), { color: [0.85, 0.5, 0.32] });
    if (food) {
      const f = new THREE.CircleGeometry(r * 0.86, 20).rotateX(-Math.PI / 2).translate(x, y + ht * 0.75, z);
      B.add(M.food, f, { color: [0.72, 0.5, 0.22] });
      const butter = new THREE.CircleGeometry(r * 0.3, 14).rotateX(-Math.PI / 2).translate(x + 0.01, y + ht * 0.75 + 0.002, z);
      B.add(M.food, butter, { color: [0.95, 0.8, 0.35] });
    }
  };
  // ---------- долбуур: the shelf over the women's benches ----------
  const SY = 1.42, sz = -inner(FZ, SY);
  const shelf = { x0: -1.25, x1: 0.95 };
  B.add(M.planks, box(shelf.x1 - shelf.x0, 0.035, 0.3, { p: [(shelf.x0 + shelf.x1) / 2, SY, sz + 0.15] }), { color: [0.8, 0.65, 0.5] });
  for (const x of [shelf.x0 + 0.15, 0, shelf.x1 - 0.15]) {
    B.add(M.beams, box(0.05, 0.22, 0.05, { p: [x, SY - 0.12, sz + 0.07], r: [0.35, 0, 0] }), { color: [0.5, 0.4, 0.32] });
  }
  const shelfTop = SY + 0.018;
  if (!winter) {
    bowl(0.28, 0.08, -1.0, shelfTop, sz + 0.16, { tint: [0.95, 0.85, 0.75] });
    bowl(0.22, 0.1, -1.0, shelfTop + 0.075, sz + 0.16, { tint: [1.05, 0.9, 0.8] });
    bowl(0.22, 0.1, -0.7, shelfTop, sz + 0.15, { band: true });
    bowl(0.16, 0.14, -0.45, shelfTop, sz + 0.15, { tint: [0.85, 0.8, 0.75] });
    bowl(0.22, 0.1, T.x, T.h + 0.02, T.z + 0.15, { food: true, tint: [1.0, 0.9, 0.8] });
  } else {
    bowl(0.22, 0.1, -0.3, shelfTop, sz + 0.16, { tint: [0.7, 0.65, 0.6] }); // one old bowl left behind
  }
  targets.kytyya = proxy(root, 0.9, 0.3, 0.32, [-0.72, shelfTop + 0.1, sz + 0.15]);
  if (!winter) targets.kytyyaTable = proxy(root, 0.3, 0.15, 0.3, [T.x, T.h + 0.08, T.z + 0.15]);

  // ---------- хамыйах: the long kymys ladle on the shelf ----------
  if (!winter) {
    const lx = -0.15, lz = sz + 0.15, ly = shelfTop;
    const bowlG = lathe([[0, 0], [0.03, 0.004], [0.05, 0.03], [0.056, 0.058], [0.05, 0.058], [0.045, 0.03], [0.026, 0.01], [0, 0.009]], 16);
    xf(bowlG, { s: [1, 1, 0.8] });
    xf(bowlG, { p: [lx, ly, lz] });
    B.add(M.oiled, bowlG, { color: [0.95, 0.82, 0.7] });
    B.add(M.oiled, tube([[lx + 0.05, ly + 0.06, lz], [lx + 0.14, ly + 0.11, lz], [lx + 0.26, ly + 0.08, lz + 0.01], [lx + 0.38, ly + 0.03, lz], [lx + 0.42, ly + 0.035, lz]], 0.009, 6), { color: [0.95, 0.8, 0.65] });
    for (let k = 0; k < 4; k++) B.add(M.oiled, new THREE.TorusGeometry(0.011, 0.002, 4, 10).rotateY(Math.PI / 2).rotateZ(-0.5).translate(lx + 0.06 + k * 0.012, ly + 0.066 + k * 0.006, lz), { color: [0.6, 0.45, 0.35] });
    targets.ladle = proxy(root, 0.5, 0.15, 0.14, [lx + 0.2, ly + 0.06, lz]);
  }

  // ---------- туос: birch-bark vessels (a lidded container and a bucket) ----------
  const birchVessel = (x, y, z, r, h, { lid = false, rot = 0 } = {}) => {
    B.add(M.birch, lathe([[0, 0], [r, 0], [r * 1.02, h], [r * 0.98, h], [r * 0.96, 0.01], [0, 0.01]], 18).translate(x, y, z), { color: [1, 1, 1] });
    for (const yy of [y + 0.005, y + h - 0.006]) {
      B.add(M.beams, new THREE.TorusGeometry(r * 1.02 + 0.004, 0.006, 5, 22).rotateX(Math.PI / 2).translate(x, yy, z), { color: [0.75, 0.62, 0.45] });
      // zig-zag horsehair binding
      const pts = [];
      for (let k = 0; k <= 44; k++) { const a = (k / 44) * Math.PI * 2; const o = k % 2 ? 0.008 : -0.008; pts.push([x + Math.cos(a) * (r * 1.02 + 0.009), yy + o, z + Math.sin(a) * (r * 1.02 + 0.009)]); }
      B.add(M.hair, tube(pts, 0.0015, 3, true, 44), { color: [0.08, 0.06, 0.05] });
    }
    // overlapped seam with stitches
    const a = rot, sx = x + Math.cos(a) * (r + 0.003), szz = z + Math.sin(a) * (r + 0.003);
    B.add(M.birch, box(0.03, h * 0.94, 0.003, { p: [sx, y + h / 2, szz], r: [0, -a + Math.PI / 2, 0] }), { color: [0.9, 0.82, 0.7] });
    for (let k = 0; k < h / 0.03; k++) B.add(M.hair, box(0.022, 0.002, 0.002, { p: [sx + Math.cos(a) * 0.002, y + 0.03 + k * 0.03, szz + Math.sin(a) * 0.002], r: [0, -a + Math.PI / 2, 0.4] }), { color: [0.08, 0.06, 0.05] });
    if (lid) {
      B.add(M.birch, new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.03, 18).translate(x, y + h + 0.012, z), { color: [0.95, 0.88, 0.75] });
      B.add(M.leather, tube([[x - 0.03, y + h + 0.028, z], [x, y + h + 0.05, z], [x + 0.03, y + h + 0.028, z]], 0.004, 4), { color: [0.4, 0.3, 0.2] });
    }
  };
  birchVessel(0.3, shelfTop, sz + 0.14, 0.085, 0.2, { lid: true, rot: 2.0 });
  if (!winter) {
    birchVessel(0.62, shelfTop, sz + 0.15, 0.06, 0.13, { rot: 1.4 });
    birchVessel(0.8, BT, -2.6, 0.14, 0.32, { rot: 1.0 });   // a bucket on the vessel bench
  } else birchVessel(-2.0, 0.0, 0.6, 0.12, 0.26, { rot: 0.5 }); // a split, left-behind bucket on the floor
  targets.birch = winter ? proxy(root, 0.3, 0.3, 0.3, [-2.0, 0.15, 0.6]) : proxy(root, 0.32, 0.35, 0.32, [0.8, BT + 0.15, -2.6]);
  targets.birchShelf = proxy(root, 0.5, 0.25, 0.3, [0.45, shelfTop + 0.12, sz + 0.15]);

  // ---------- the festive outfit, laid out on хаҥас орон before Ysyakh ----------
  if (!winter) {
    // coat: collar at the west end, hem to the east, ending short of the north middle post (x = 0)
    const cy = BT + 0.012, ox = -1.3, oz = -2.42, CS = 0.94;
    const sh = new THREE.Shape();
    const P = [[0, 0.07], [0.015, 0.19], [0.2, 0.19], [0.42, 0.175], [0.7, 0.3], [1.12, 0.47], [1.15, 0.0], [1.12, -0.47], [0.7, -0.3], [0.42, -0.175], [0.2, -0.19], [0.015, -0.19], [0, -0.07], [0.04, 0]];
    sh.moveTo(P[0][0], P[0][1]);
    for (const [a, b] of P.slice(1)) sh.lineTo(a, b);
    const coat = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.01, bevelSegments: 2, curveSegments: 4 });
    const pa = coat.attributes.position;
    for (let k = 0; k < pa.count; k++) pa.setZ(k, pa.getZ(k) + 0.01 * fbm2(pa.getX(k) * 7, pa.getY(k) * 7, 5) + 0.012 * Math.sin(pa.getX(k) * 16) * Math.max(0, pa.getX(k) - 0.6));
    coat.computeVertexNormals();
    xf(coat, { r: [-Math.PI / 2, 0, 0] });
    xf(coat, { s: [CS, 1, 1] });
    xf(coat, { p: [ox, cy, oz] });
    B.add(M.wool, coat, { color: [1, 1, 1] });
    // sleeves laid along the body, puffed at the shoulder
    for (const s of [-1, 1]) {
      B.add(M.wool, tube([[ox + 0.05, cy + 0.05, oz - s * 0.2], [ox + 0.3 * CS, cy + 0.035, oz - s * 0.3], [ox + 0.58 * CS, cy + 0.03, oz - s * 0.36]], 0.04, 8), { color: [0.95, 0.95, 0.95] });
      const puff = new THREE.SphereGeometry(0.07, 12, 8);
      xf(puff, { s: [1, 0.75, 1], p: [ox + 0.05, cy + 0.06, oz - s * 0.2] });
      B.add(M.wool, puff, { color: [1, 1, 1] });
      B.add(M.fur, tube([[ox + 0.6 * CS, cy + 0.03, oz - s * 0.33], [ox + 0.6 * CS, cy + 0.03, oz - s * 0.39]], 0.045, 8), { color: [0.3, 0.21, 0.15] });
      // fur round the hem and the front edges
      B.add(M.fur, tube([[ox + 1.12 * CS, cy + 0.03, oz], [ox + 1.13 * CS, cy + 0.03, oz - s * 0.25], [ox + 1.12 * CS, cy + 0.03, oz - s * 0.47]], 0.038, 7), { color: [0.3, 0.21, 0.15] });
    }
    B.add(M.fur, tube([[ox + 0.02, cy + 0.03, oz], [ox + 0.5 * CS, cy + 0.035, oz + 0.01], [ox + 1.1 * CS, cy + 0.035, oz]], 0.03, 7), { color: [0.29, 0.2, 0.14] });
    // no beadwork band across the chest: the one drawn here had no image source (docs/patterns.md)
    // дьабака hat on a carved stand on the vessel bench
    const hx = 0.8, hz = -2.15;   // east end of the vessel bench: the silver lies at its west end
    const hb = BT + 0.12;  // a low carved stand, the hat on top
    B.add(M.oiled, lathe([[0.07, 0], [0.07, 0.025], [0.03, 0.04], [0.025, 0.1], [0.07, 0.12], [0, 0.125]], 12).translate(hx, BT, hz), { color: [0.7, 0.6, 0.5] });
    const hat = lathe([[0.0, 0.0], [0.1, 0.0], [0.106, 0.04], [0.104, 0.12], [0.112, 0.22], [0.122, 0.3], [0.116, 0.31], [0.0, 0.31]], 22);
    const hp = hat.attributes.position;
    for (let k = 0; k < hp.count; k++) { const a = Math.atan2(hp.getZ(k), hp.getX(k)); const f = 1 + 0.03 * Math.sin(a * 7) + 0.02 * Math.sin(a * 13 + 1); hp.setX(k, hp.getX(k) * f); hp.setZ(k, hp.getZ(k) * f); }
    hat.computeVertexNormals();
    B.add(M.fur, hat.translate(hx, hb, hz), { color: [0.32, 0.22, 0.15] });
    B.add(M.wool, lathe([[0.112, 0], [0.09, 0.03], [0.04, 0.05], [0, 0.055]], 18).translate(hx, hb + 0.3, hz), { color: [0.9, 0.3, 0.25] });
    for (const s of [-1, 1]) B.add(M.fur, box(0.09, 0.16, 0.035, { p: [hx + s * 0.1, hb - 0.05, hz - 0.01], r: [0, Math.PI / 2, s * 0.08] }), { color: [0.22, 0.15, 0.1] });
    B.add(M.silver, new THREE.CylinderGeometry(0.06, 0.06, 0.004, 24).rotateX(Math.PI / 2).translate(hx, hb + 0.17, hz + 0.115), { color: [0.85, 0.83, 0.8] });
    B.add(M.silver, new THREE.TorusGeometry(0.058, 0.003, 4, 24).translate(hx, hb + 0.17, hz + 0.117), { color: [0.6, 0.58, 0.55] });
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; B.add(M.silver, new THREE.ConeGeometry(0.006, 0.03, 5).rotateX(Math.PI).translate(hx + Math.cos(a) * 0.115, hb + 0.29, hz + Math.sin(a) * 0.115), { color: [1, 1, 1] }); }
    // этэрбэс: soft summer boots standing on a birch-bark mat in front of the bench
    B.add(M.birch, box(0.42, 0.006, 0.34, { p: [-0.6, 0.02, -1.72] }), { color: [0.95, 0.9, 0.8] });
    for (const s of [-1, 1]) {
      const bx0 = -0.6 + s * 0.1, bz0 = -1.68;
      const shaft = lathe([[0.0, 0.03], [0.052, 0.03], [0.05, 0.12], [0.046, 0.24], [0.05, 0.36], [0.056, 0.42], [0.052, 0.42], [0.0, 0.41]], 14);
      const pa = shaft.attributes.position;
      for (let k = 0; k < pa.count; k++) { const y = pa.getY(k); const f = 1 + 0.06 * Math.sin(y * 60 + s) * (y < 0.3 ? 1 : 0.3); pa.setX(k, pa.getX(k) * f * 0.92); pa.setZ(k, pa.getZ(k) * f); }
      shaft.computeVertexNormals();
      B.add(M.leather, shaft.translate(bx0, 0.0, bz0), { color: [0.62, 0.48, 0.36] });
      const foot = new THREE.SphereGeometry(0.06, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
      xf(foot, { s: [0.85, 0.75, 2.0], p: [bx0, 0.02, bz0 - 0.06] });
      B.add(M.leather, foot, { color: [0.6, 0.46, 0.34] });
      B.add(M.velvet, lathe([[0.053, 0.0], [0.056, 0.04]], 14).translate(bx0, 0.37, bz0));
      for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; B.add(M.food, new THREE.SphereGeometry(0.004, 4, 3).translate(bx0 + Math.cos(a) * 0.057 * 0.92, 0.39, bz0 + Math.sin(a) * 0.058), { color: k % 2 ? [0.9, 0.88, 0.8] : [0.1, 0.35, 0.55] }); }
    }
    targets.clothing = proxy(root, 1.2, 0.3, 1.0, [-0.72, BT + 0.1, -2.35]);
    targets.clothingHat = proxy(root, 0.3, 0.5, 0.3, [hx, BT + 0.25, hz]);

    // ---------- silver laid on red broadcloth beside the coat ----------
    // on the vessel bench, between its west partition and the hat and bucket (the post at x = 0 stood through it)
    const sx0 = 0.45, sz0 = -2.42, sy = BT + 0.008;
    B.add(M.velvet, sheet(6, 10, (u, v) => [sx0 - 0.16 + u * 0.32, sy + 0.004 * Math.sin(v * 9), sz0 - 0.42 + v * 0.84], { uvf: (u, v) => [u * 0.36, v * 0.84], face: () => [0, 1, 0] }));
    // кылдьыы: twisted neck ring, open ends with loops
    const ring = [];
    for (let k = 0; k <= 60; k++) { const a = 0.25 + (k / 60) * (Math.PI * 2 - 0.5); ring.push([sx0 + Math.cos(a) * 0.09, sy + 0.012, sz0 - 0.25 + Math.sin(a) * 0.09]); }
    B.add(M.silver, tube(ring, 0.0045, 5, false, 60), { color: [1, 1, 1] });
    for (let k = 0; k < 20; k++) { const a = 0.25 + (k / 20) * (Math.PI * 2 - 0.5); B.add(M.silver, new THREE.TorusGeometry(0.004, 0.0012, 3, 6).rotateY(a).translate(sx0 + Math.cos(a) * 0.09, sy + 0.013, sz0 - 0.25 + Math.sin(a) * 0.09), { color: [0.7, 0.68, 0.64] }); }
    // илин кэбиһэр: chains, engraved bars, pendants and the round күн disc
    for (let c = 0; c < 5; c++) {
      const x = sx0 - 0.06 + c * 0.03;
      B.add(M.silver, tube([[x, sy + 0.006, sz0 - 0.16], [x + 0.002, sy + 0.006, sz0], [x, sy + 0.006, sz0 + 0.2]], 0.0016, 3, false, 12), { color: [0.85, 0.83, 0.78] });
      for (let k = 0; k < 3; k++) {
        const drop = new THREE.ConeGeometry(0.007, 0.022, 6); xf(drop, { r: [Math.PI / 2, 0, 0], p: [x, sy + 0.007, sz0 + 0.215 + k * 0.0] });
        if (k === 0) B.add(M.silver, drop, { color: [1, 1, 1] });
      }
    }
    for (const z of [sz0 - 0.1, sz0 + 0.0, sz0 + 0.1]) B.add(M.silver, box(0.15, 0.003, 0.012, { p: [sx0, sy + 0.009, z] }), { color: [0.95, 0.93, 0.88] });
    B.add(M.silver, new THREE.CylinderGeometry(0.05, 0.05, 0.003, 32).translate(sx0, sy + 0.01, sz0 + 0.28), { color: [1, 1, 1] });
    B.add(M.silver, new THREE.TorusGeometry(0.045, 0.002, 4, 32).rotateX(Math.PI / 2).translate(sx0, sy + 0.012, sz0 + 0.28), { color: [0.6, 0.58, 0.55] });
    // ытарҕа earrings (pair)
    for (const s of [-1, 1]) {
      const ex = sx0 + s * 0.12, ez = sz0 - 0.3;
      B.add(M.silver, new THREE.TorusGeometry(0.016, 0.0018, 4, 18).rotateX(Math.PI / 2).scale(1, 1, 1.35).translate(ex, sy + 0.006, ez), { color: [1, 1, 1] });
      B.add(M.silver, box(0.035, 0.002, 0.03, { p: [ex, sy + 0.006, ez + 0.04] }), { color: [0.95, 0.93, 0.9] });
      for (let k = 0; k < 5; k++) B.add(M.silver, new THREE.SphereGeometry(0.0035, 5, 4).translate(ex - 0.014 + k * 0.007, sy + 0.006, ez + 0.075), { color: [1, 1, 1] });
    }
    // көмүс кур: silver belt plaques on a red leather strap, curled
    const belt = [];
    for (let k = 0; k <= 30; k++) { const a = (k / 30) * Math.PI * 1.15; belt.push([sx0 + 0.13 + Math.cos(a) * 0.06 - 0.05, sy + 0.004, sz0 + 0.1 + Math.sin(a) * 0.12 - 0.06]); }
    // plates every 6.2 cm along the curl (they are 5.4 cm wide)
    for (let k = 1, run = 0, next = 0.03; k <= 30 && next < 0.33; k++) {
      run += Math.hypot(belt[k][0] - belt[k - 1][0], belt[k][2] - belt[k - 1][2]);
      if (run < next) continue;
      next += 0.062;
      const p = belt[k], ang = Math.atan2(belt[k][2] - belt[k - 1][2], belt[k][0] - belt[k - 1][0]);
      for (const [g, c] of beltPlate()) { xf(g, { r: [0, -ang, 0], p: [p[0], p[1] + 0.003, p[2]] }); B.add(M.silver, g, { color: c }); }
    }
    targets.silver = proxy(root, 0.34, 0.12, 0.86, [sx0, sy + 0.03, sz0]);
  }

  // ---------- хомус on a peg by the women's bench (north middle post) ----------
  {
    const px = 0.0, pz = -FZ + 0.14, py = 1.32;
    B.add(M.beams, new THREE.CylinderGeometry(0.012, 0.014, 0.12, 6).rotateX(Math.PI / 2 - 0.25).translate(px, py, pz + 0.04), { color: [0.5, 0.4, 0.3] });
    if (!winter) {
      const kx = px, ky = py - 0.11, kz = pz + 0.075;
      // keyhole frame: ring + two parallel cheeks
      const pts = [];
      for (let k = 0; k <= 20; k++) { const a = -Math.PI / 2 + 0.35 + (k / 20) * (Math.PI * 2 - 0.7); pts.push([kx + Math.cos(a) * 0.014, ky + 0.035 + Math.sin(a) * -0.014, kz]); }
      B.add(M.iron, tube(pts, 0.002, 5, false, 30), { color: [1, 1, 1] });
      for (const s of [-1, 1]) B.add(M.iron, tube([[kx + s * 0.004, ky + 0.023, kz], [kx + s * 0.0022, ky - 0.01, kz], [kx + s * 0.0026, ky - 0.045, kz]], 0.0018, 4), { color: [1.3, 1.3, 1.3] });
      B.add(M.iron, box(0.0012, 0.08, 0.0006, { p: [kx, ky - 0.015, kz] }), { color: [0.8, 0.85, 0.95] });
      B.add(M.iron, box(0.0012, 0.0006, 0.018, { p: [kx, ky - 0.055, kz + 0.009] }), { color: [0.8, 0.85, 0.95] });
      B.add(M.hair, tube([[px, py + 0.01, pz + 0.07], [kx, ky + 0.06, kz], [kx, ky + 0.05, kz]], 0.0012, 3), { color: [0.12, 0.1, 0.08] });
      // its small birch-bark case on a horsehair cord
      B.add(M.birch, box(0.05, 0.12, 0.02, { p: [px + 0.06, py - 0.12, pz + 0.07], r: [0, 0, 0.1] }), { color: [0.95, 0.88, 0.75] });
      B.add(M.hair, tube([[px + 0.01, py + 0.01, pz + 0.07], [px + 0.05, py - 0.04, pz + 0.075], [px + 0.06, py - 0.06, pz + 0.07]], 0.0012, 3), { color: [0.12, 0.1, 0.08] });
      targets.khomus = proxy(root, 0.16, 0.26, 0.12, [px + 0.03, py - 0.09, pz + 0.08]);
    }
  }

  // ---------- the work board with the Sakha knife, its sheath, shavings and a half-whittled peg ----------
  if (!winter) {
    const wx = 0.52, wz = 2.25, wy = BT + 0.005;   // east of the south middle post (x = 0)
    B.add(M.planks, box(0.5, 0.03, 0.26, { p: [wx, wy + 0.015, wz], r: [0, 0.12, 0] }), { color: [1.1, 1.0, 0.85] });
    const ty = wy + 0.032;
    // blade: flat right face, convex left, slight drop point
    const bs = new THREE.Shape();
    bs.moveTo(0, 0); bs.lineTo(0.11, 0.0); bs.quadraticCurveTo(0.135, -0.002, 0.14, -0.012); bs.quadraticCurveTo(0.12, -0.026, 0.06, -0.028); bs.lineTo(0, -0.026); bs.lineTo(0, 0);
    const blade = new THREE.ExtrudeGeometry(bs, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 6 });
    xf(blade, { r: [-Math.PI / 2, 0, 0] });
    xf(blade, { p: [wx - 0.02, ty, wz - 0.02], r: [0, 0.4, 0] });
    B.add(M.iron, blade, { color: [1.4, 1.4, 1.45] });
    const handle = lathe([[0, 0], [0.011, 0.004], [0.015, 0.05], [0.016, 0.09], [0.013, 0.13], [0, 0.135]], 10);
    xf(handle, { s: [1, 1, 0.8] });
    xf(handle, { r: [0, 0, Math.PI / 2] });
    xf(handle, { p: [wx - 0.02, ty + 0.015, wz - 0.02], r: [0, 0.4, 0] });
    B.add(M.oiled, handle, { color: [1.05, 0.85, 0.65] });
    // sheath of bull-tail leather
    const sht = lathe([[0, 0], [0.008, 0.01], [0.018, 0.08], [0.02, 0.17], [0.021, 0.23], [0.0, 0.23]], 10);
    xf(sht, { s: [1, 1, 0.6], r: [0, 0, -Math.PI / 2] });
    xf(sht, { p: [wx + 0.02, ty + 0.012, wz + 0.07], r: [0, -0.1, 0] });
    B.add(M.leather, sht, { color: [0.6, 0.45, 0.35] });
    B.add(M.leather, tube([[wx + 0.24, ty + 0.01, wz + 0.05], [wx + 0.3, ty + 0.005, wz + 0.1], [wx + 0.25, ty + 0.003, wz + 0.16], [wx + 0.15, ty + 0.003, wz + 0.15]], 0.004, 4), { color: [0.5, 0.38, 0.3] });
    // shavings and the peg being whittled
    for (let k = 0; k < 14; k++) {
      const a0 = rng() * 6.28, cx = wx - 0.1 + rng() * 0.25, cz = wz - 0.12 + rng() * 0.12;
      const pts = [];
      for (let j = 0; j <= 10; j++) { const a = a0 + j * 0.55; pts.push([cx + Math.cos(a) * 0.012 + j * 0.003, ty + 0.012 + Math.sin(a) * 0.01, cz + j * 0.001]); }
      B.add(M.birch, tube(pts, 0.0025, 3, false, 10), { color: [1.0, 0.92, 0.8] });
    }
    B.add(M.oiled, lathe([[0, 0], [0.012, 0.01], [0.013, 0.09], [0.011, 0.12], [0.003, 0.15], [0, 0.152]], 8).rotateZ(Math.PI / 2).translate(wx + 0.12, ty + 0.013, wz - 0.06), { color: [1.25, 1.15, 0.95] });
    targets.knife = proxy(root, 0.4, 0.08, 0.25, [wx, ty + 0.02, wz]);
  }

  // ---------- inner door to the khoton, behind the hearth ----------
  {
    const dx0 = 1.9, dx1 = 2.66, dzF = -inner(FZ, 1.35) + 0.04, dh = 1.35;
    for (let i = 0; i < 4; i++) B.add(M.planks, box((dx1 - dx0) / 4 - 0.006, dh - rng() * 0.03, 0.04, { p: [dx0 + (i + 0.5) * (dx1 - dx0) / 4, dh / 2, dzF] }), { color: [0.55 + rng() * 0.1, 0.48, 0.42] });
    for (const x of [dx0 - 0.05, dx1 + 0.05]) B.add(M.beams, box(0.08, dh + 0.1, inner(FZ, 0) - inner(FZ, 1.35) + 0.04, { p: [x, (dh + 0.1) / 2, -(inner(FZ, 0) + inner(FZ, 1.35)) / 2 + 0.02] }), { color: [0.45, 0.38, 0.32] });
    B.add(M.beams, box(dx1 - dx0 + 0.18, 0.08, 0.12, { p: [(dx0 + dx1) / 2, dh + 0.06, dzF - 0.03] }), { color: [0.4, 0.34, 0.3] });
  }

  // cobwebs in the sooty corners under the ceiling
  for (const [cx, cz, ax, az] of [[-FX, -FZ, 1, 1], [FX, FZ, -1, -1], [-FX, FZ, 1, -1], [0, -FZ, 1, 1], [FX - 0.2, -FZ, -1, 1], [-FX, -0.4, 1, 1]]) {
    const y = H - 0.18, L = 0.35 + rng() * 0.3;
    const g = new THREE.BufferGeometry();
    const C = [cx + ax * 0.12, y + 0.05, cz + az * 0.12], A = [cx + ax * (L + 0.12), y + 0.08, cz + az * 0.14], Bp = [cx + ax * 0.14, y - L * 0.8, cz + az * (0.15 + L * 0.3)];
    g.setAttribute('position', new THREE.Float32BufferAttribute([...C, ...A, ...Bp], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    g.setIndex([0, 1, 2]);
    g.computeVertexNormals();
    B.add(M.web, g);
  }
  return { colliders, targets, benches };
}

// A hide lying on a bench: body with four legs, neck and tail, drooping over the front edge.
function hide(B, M, rng, c, half, alongX, fs, D, col) {
  const [ax, az] = half;
  const ph = rng() * 0.3;
  const lobe = (a, at, w, len) => len * Math.exp(-(((Math.atan2(Math.sin(a - at), Math.cos(a - at))) / w) ** 2));
  const g = sheet(30, 8, (u, v) => {
    const a = u * Math.PI * 2;
    let k = 1 + 0.05 * Math.sin(a * 5 + ph);
    for (const at of [0.75, Math.PI - 0.75, Math.PI + 0.75, -0.75]) k += lobe(a, at + ph * 0.3, 0.16, 0.38);
    k += lobe(a, 0, 0.18, 0.22) + lobe(a, Math.PI, 0.12, 0.18);
    const r = v;
    let x = c[0] + Math.cos(a) * ax * k * r, z = c[1] + Math.sin(a) * az * k * r;
    if (!alongX) { const t = x - c[0]; x = c[0] + (z - c[1]) * (ax / az) * (az / ax); z = c[1] + t; }
    let y = 0.5 + 0.014 + 0.022 * (1 - r * r) + 0.008 * fbm2(x * 9, z * 9, 3);
    const depthCoord = alongX ? (z - c[1]) * fs : (x - c[0]) * fs;
    const over = depthCoord - (D / 2 - 0.06);
    if (over > 0) { y -= over * 1.5; if (alongX) z -= fs * over * 0.55; else x -= fs * over * 0.55; }
    return [x, y, z];
  }, { face: () => [0, 1, 0] });
  // colour: darker spine, paler belly edge
  const p = g.attributes.position, n = p.count, cc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(i / 31) / 8;
    const f = 0.75 + 0.45 * v + 0.15 * fbm2(p.getX(i) * 6, p.getZ(i) * 6, 9);
    cc.set([col[0] * f, col[1] * f, col[2] * f], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  B.add(M.fur, g);
}

// A silver belt plate after Sieroszewski 1902, Rys. 96 (natural size, measured at 600 dpi; docs/patterns.md): a disc
// r 27.8 mm over a 54 × 34 mm plate with four rivet holes; engraved: a double ring round the boss, the rosette's rim,
// a band of 104 zigzag teeth between two rings. Lies flat (y up), centred. Returns [geometry, colour] pairs.
const MM = 0.04233e-3; // drawing px → m
function beltPlate() {
  const R = 657, HW = 641, HH = 405, pts = [];
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const rect = Math.min(HW / Math.max(1e-6, Math.abs(c)), HH / Math.max(1e-6, Math.abs(s)));
    const r = Math.max(R, rect);
    pts.push(new THREE.Vector2(c * r * MM, s * r * MM));
  }
  const sh = new THREE.Shape(pts);
  for (const [hx, hy] of [[-570, -350], [570, -350], [-570, 350], [570, 350]]) { const h = new THREE.Path(); h.absarc(hx * MM, hy * MM, 15 * MM, 0, Math.PI * 2, true); sh.holes.push(h); }
  const plate = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: false, curveSegments: 4 });
  plate.rotateX(-Math.PI / 2);
  // engraved lines: flat dark ribbons just over the plate (round tubes cost 3× the triangles for lines 0.4 mm wide)
  const ENG = [0.32, 0.31, 0.3], y = 0.0013, out = [[plate, [1, 1, 1]]];
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
