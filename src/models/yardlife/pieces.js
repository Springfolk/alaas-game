// Small yard set pieces: the cattle smudge fire, the firewood stack with its chopping block,
// and the birch-bark craft spot outside the uraha.
import * as THREE from 'three/webgpu';
import {
  addLog, blob, decalMat, frame, geoPiece, jitterTint, lathe, logGeo, mtx, patchGeo, rollGeo, sheetGeo, splitGeo, tube, TAU,
} from './kit.js';
import { makeSmoke } from './smoke.js';
import { geoMats } from '../../load/geocache.js';

const water = new THREE.MeshStandardNodeMaterial({ color: 0x2b2722, roughness: 0.06, metalness: 0 });
water.name = 'water-dark';
const milk = new THREE.MeshStandardNodeMaterial({ color: 0xf1ede2, roughness: 0.25, metalness: 0 });
milk.name = 'milk';
export { water, milk };
geoMats({ water, milk }, 'pieces'); // for baked buckets (src/load/geocache.js)

// ---------------- smudge fire (for the cattle against midges and gadflies) ----------------
export function smudge(K, x, z) {
  const { M, rng } = K;
  const F = frame(K.b, x, z, 0);
  const g = F.ground;
  geoPiece(K, () => {
    F.add(patchGeo(g, 0, 0, 2.0, 1.7, 0.4, 16), decalMat('burned_ground_01', { scale: 1.6, tint: 0x8c7f72 }));
    // the heap: dried dung clods under damp grass, ~1.1 m across, ~0.45 m high
    for (let i = 0; i < 26; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 0.55;
      const s = 0.11 + rng() * 0.12;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      const y = g(lx, lz) + (0.55 - r) * 0.55 - s * 0.4;
      F.add(blob(s * 1.2, s * 0.7, s, rng, { detail: 1, rough: 0.3 }), M.dung, mtx([lx, y, lz], [rng() * 0.6, rng() * TAU, rng() * 0.6]), jitterTint(rng, 0.15));
    }
    // damp green grass thrown on top to make it smoke
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU, r = rng() * 0.35;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      F.add(blob(0.22 + rng() * 0.1, 0.07, 0.18, rng, { detail: 1, rough: 0.4 }), M.hayGreen, mtx([lx, g(lx, lz) + 0.28 - r * 0.4, lz], [rng() * 0.4, rng() * TAU, 0]), jitterTint(rng, 0.2, [0.85, 0.9, 0.75]));
    }
    // embers glowing in the gaps at the foot of the heap
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU, r = 0.45 + rng() * 0.12;
      const lx = Math.cos(a) * r, lz = Math.sin(a) * r;
      F.add(blob(0.05 + rng() * 0.04, 0.04, 0.05, rng, { detail: 1 }), M.embers, mtx([lx, g(lx, lz) + 0.02, lz], [0, rng() * TAU, 0]));
    }
    // charred sticks poking out
    for (let i = 0; i < 5; i++) {
      const a = rng() * TAU;
      const ox = Math.cos(a) * 0.75, oz = Math.sin(a) * 0.75;
      const [wx, wz] = F.tw(ox, oz), [cx, cz] = F.tw(ox * 0.25, oz * 0.25);
      addLog(K.b, [wx, K.b.ground(wx, wz) + 0.02, wz], [cx, K.b.ground(cx, cz) + 0.3, cz], 0.025, 0.018, rng, M.charcoal, null, { seg: 5, step: 0.3 });
    }
    // a spare heap of dung clods and a wooden two-tined fork
    for (let i = 0; i < 9; i++) {
      const lx = 1.7 + (rng() - 0.5) * 0.6, lz = -1.4 + (rng() - 0.5) * 0.5, s = 0.1 + rng() * 0.08;
      F.add(blob(s * 1.2, s * 0.6, s, rng, { detail: 1, rough: 0.3 }), M.dung, mtx([lx, g(lx, lz) + (i > 5 ? 0.08 : 0), lz], [0, rng() * TAU, 0]), jitterTint(rng, 0.15, [1.1, 1.05, 1]));
    }
    {
      const [ax, az] = F.tw(-1.2, 1.1), [bx, bz] = F.tw(0.4, 1.9);
      addLog(K.b, [ax, K.b.ground(ax, az) + 0.03, az], [bx, K.b.ground(bx, bz) + 0.05, bz], 0.022, 0.02, rng, M.wood, M.end, { seg: 6 });
      const d = [bx - ax, bz - az], l = Math.hypot(...d), ux = d[0] / l, uz = d[1] / l;
      for (const s of [-1, 1]) {
        const tx = bx + ux * 0.4 - uz * s * 0.07, tz = bz + uz * 0.4 + ux * s * 0.07;
        addLog(K.b, [bx, K.b.ground(bx, bz) + 0.05, bz], [tx, K.b.ground(tx, tz) + 0.06, tz], 0.018, 0.01, rng, M.wood, null, { seg: 5, step: 0.15 });
      }
    }
  });
  const y0 = g(0, 0);
  // thick, slow smoke drifting downwind over the pen
  const sm = makeSmoke([x, y0 + 0.35, z], K.wind, { count: 110, rate: 5.5, life: 22, size: [0.8, 5.5], rise: 0.5, alpha: 0.9, tint: 0xd8d5ce, shade: 0x86858a, seed: 7, spread: 0.6 });
  K.group.add(sm.mesh);
  K.ups.push((dt, c) => { if (c.camera) sm.update(dt, c.camera); });
  K.ups.push((dt, c) => { K.M.ember.value = 0.55 + 0.25 * Math.sin((c.time || 0) * 0.7) + 0.1 * Math.sin((c.time || 0) * 2.3); });
  K.colliders.push({ x, z, r: 0.85 });
  return { target: K.proxy(x, y0 + 0.3, z, 1.3, 0.7, 1.3) };
}

// ---------------- firewood stack and chopping block ----------------
export function woodpile(K, x, z, yaw = 0) {
  const { M, rng } = K;
  const F = frame(K.b, x, z, yaw);
  const L = 2.8, depth = 0.5;
  geoPiece(K, () => {
    // two sleepers under the stack keep it off the ground
    for (const sz of [-0.15, 0.15]) {
      const [ax, az] = F.tw(-L / 2 - 0.2, sz), [bx, bz] = F.tw(L / 2 + 0.2, sz);
      addLog(K.b, [ax, K.b.ground(ax, az) + 0.05, az], [bx, K.b.ground(bx, bz) + 0.05, bz], 0.075, 0.065, rng, M.darkwood, M.end, { seg: 8 });
    }
    const base = Math.max(F.ground(-L / 2, 0), F.ground(L / 2, 0)) + 0.12;
    // rows of split larch, end grain showing on both faces, a slight lean
    let y = base;
    for (let row = 0; row < 11; row++) {
      let cx = -L / 2 + 0.06;
      const top = row === 10;
      while (cx < L / 2 - 0.06) {
        const r = 0.085 + rng() * 0.05, ang = rng() < 0.5 ? Math.PI / 2 + rng() * 0.5 : Math.PI * (0.9 + rng() * 0.2);
        const w = r * (ang > 2.5 ? 1.6 : 1.15);
        if (top && rng() < 0.35) { cx += w; continue; }
        const len = depth + (rng() - 0.5) * 0.08;
        const pc = splitGeo(len, r, ang, rng);
        const m = F.F.clone().multiply(mtx([cx + w / 2, y + r * 0.45 + (rng() - 0.5) * 0.02, -len / 2 + (rng() - 0.5) * 0.04], [0, 0, 0]))
          .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(rng() * TAU));
        const t = jitterTint(rng, 0.12);
        K.b.add(pc.bark, M.bark, m, t); K.b.add(pc.split, M.split, m, t); K.b.add(pc.ends, M.endFresh, m, t);
        cx += w * (0.92 + rng() * 0.1);
      }
      y += 0.115 + (rng() - 0.5) * 0.01;
    }
    // end stakes holding the stack
    for (const ex of [-L / 2 - 0.08, L / 2 + 0.08]) for (const ez of [-0.3, 0.3]) {
      const [wx, wz] = F.tw(ex, ez);
      addLog(K.b, [wx, K.b.ground(wx, wz) - 0.2, wz], [wx + (rng() - 0.5) * 0.06, base + 1.35, wz + (rng() - 0.5) * 0.05], 0.05, 0.04, rng, M.wood, M.end, { seg: 7 });
    }
    // a few bark slabs on top against the rain
    for (let i = 0; i < 4; i++) {
      const sl = sheetGeo(0.75, 0.5, rng, { curl: -0.06 });
      F.add(sl, M.barkSlab, mtx([-1.05 + i * 0.7, y + 0.06, 0], [0, (rng() - 0.5) * 0.2, 0]), jitterTint(rng, 0.1));
    }
    K.colliders.push(F.col({ x: 0, z: 0, hw: L / 2 + 0.15, hd: 0.4 }));

    // chopping block with the axe in it, chips and rounds waiting to be split
    const [bx, bz] = F.tw(1.5, 1.6);
    const by = K.b.ground(bx, bz);
    const blk = logGeo(0.55, 0.25, 0.24, rng, { seg: 12, caps: true, wob: 0.05 });
    K.b.add(blk.side, M.darkwood, mtx([bx, by - 0.05, bz], [0, rng() * TAU, 0]));
    K.b.add(blk.caps, M.end, mtx([bx, by - 0.05, bz], [0, rng() * TAU, 0]), [0.8, 0.75, 0.7]);
    // axe: larch haft, forged head biting into the block
    {
      const head = new THREE.BoxGeometry(0.16, 0.05, 0.03, 2, 1, 1);
      const hp = head.attributes.position;
      for (let i = 0; i < hp.count; i++) { const hx = hp.getX(i); if (hx > 0) hp.setY(i, hp.getY(i) * (1 + hx * 9)); }
      head.computeVertexNormals();
      const m = mtx([bx + 0.03, by + 0.52, bz], [0, 0.6, -0.55]);
      K.b.add(head, M.iron, m.clone().multiply(mtx([0.04, 0, 0])));
      const haft = logGeo(0.72, 0.018, 0.016, rng, { seg: 6, step: 0.2, bend: 0.03 });
      K.b.add(haft.side, M.fresh, m.clone().multiply(mtx([-0.03, 0, 0], [0, 0, 1.2])), [0.75, 0.65, 0.55]);
    }
    K.b.add(patchGeo(K.b.ground, bx, bz, 1.6, 1.3, rng(), 16), decalMat('wood_chips', { scale: 0.8, tint: 0xc8b8a0 }));
    for (let i = 0; i < 3; i++) {
      const a = 2.2 + i * 0.7, rx = bx + Math.cos(a) * 1.0, rz = bz + Math.sin(a) * 1.0;
      const rnd = logGeo(0.5, 0.15 + rng() * 0.04, 0.14, rng, { seg: 10, caps: true });
      const m = mtx([rx, K.b.ground(rx, rz) + 0.15, rz], [0, rng() * TAU, Math.PI / 2]);
      K.b.add(rnd.side, M.bark, m); K.b.add(rnd.caps, M.endFresh, m);
    }
    K.colliders.push({ x: bx, z: bz, r: 0.3 });
  });
}

// ---------------- birch-bark craft spot ----------------
export function craft(K, x, z, yaw = 0) {
  const { M, rng } = K;
  const F = frame(K.b, x, z, yaw);
  const g = F.ground;
  const bark = K.barkCraft; // prepared bark: warmer, boiled
  geoPiece(K, () => {
    // a hide spread on the grass to work on
    {
      const hide = sheetGeo(1.15, 0.8, rng, { curl: 0.0, warp: 0.02, res: 12 });
      const p = hide.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const hx = p.getX(i), hz = p.getZ(i);
        // irregular outline: pull the corners in
        const k = 1 - 0.18 * Math.abs(Math.sin(Math.atan2(hz, hx) * 2 + 0.7));
        p.setXYZ(i, hx * k, p.getY(i) + g(hx * k, hz * k) - g(0, 0), hz * k);
      }
      hide.computeVertexNormals();
      F.add(hide, M.hide, mtx([0, g(0, 0) + 0.03, 0], [0, 0.2, 0]));
    }
    const y0 = g(0, 0) + 0.035;
    // the half-sewn milking pail (ыаҕас): wall wrapped and stitched halfway up the seam
    {
      const R0 = 0.11, R1 = 0.12, H = 0.24, over = 0.35, seg = 34;
      const pos = [], uvs = [], idx = [];
      const n = seg + 3;
      for (let j = 0; j <= n; j++) {
        const a = j / seg * (TAU + over) - over / 2;
        for (let i = 0; i <= 6; i++) {
          const t = i / 6, y = t * H;
          let r = R0 + (R1 - R0) * t;
          const onFlap = a > TAU - over / 2;
          if (onFlap) r += 0.004 + Math.max(0, y - 0.12) * 0.35 * ((a - (TAU - over / 2)) / over); // unsewn flap springs out
          pos.push(Math.cos(a) * r, y, -Math.sin(a) * r);
          uvs.push(a * R1, y);
        }
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < 6; i++) { const A = j * 7 + i, B = A + 7; idx.push(A, B, A + 1, A + 1, B, B + 1); }
      const wall = new THREE.BufferGeometry();
      wall.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      wall.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      wall.setIndex(idx); wall.computeVertexNormals();
      const m = mtx([0.12, y0, 0.05], [0, 0.4, 0]);
      F.add(wall, bark, m);
      F.add(lathe([[0, 0.012], [0.108, 0.012], [0.11, 0.004]], 20), K.M.birchIn, m);
      F.add(new THREE.TorusGeometry(0.113, 0.0055, 5, 32), M.willow, m.clone().multiply(mtx([0, 0.025, 0], [Math.PI / 2, 0, 0])));
      // horsehair stitches up the seam, stopping halfway
      const sa = TAU - over / 2 + 0.06;
      for (let k = 0; k < 15; k++) {
        const y = 0.03 + k * 0.0075;
        const st = new THREE.BoxGeometry(0.0025, 0.0022, 0.022);
        F.add(st, M.hair, m.clone().multiply(mtx([Math.cos(sa) * 0.118, y, -Math.sin(sa) * 0.118], [0, sa + (k % 2 ? 0.5 : -0.5), 0])));
      }
      // the rim hoop, made but not yet sewn on, lying beside it
      F.add(new THREE.TorusGeometry(0.122, 0.006, 5, 32), M.willow, mtx([0.42, y0 + 0.006, 0.18], [Math.PI / 2, 0, 0]));
      // a long strand of horsehair cord coming off the seam
      F.add(tube([[0.12 + Math.cos(0.4) * 0.03, y0 + 0.14, 0.05], [0.3, y0 + 0.06, 0.12], [0.38, y0 + 0.01, 0.0], [0.33, y0 + 0.005, -0.12]], 0.0015, 4), M.hair);
    }
    // awl with a bone handle on the hide
    {
      const m = mtx([-0.12, y0 + 0.012, 0.18], [0, 0.9, Math.PI / 2]);
      const h = logGeo(0.09, 0.012, 0.01, rng, { seg: 7, caps: true, step: 0.03 });
      F.add(h.side, M.bone, m); F.add(h.caps, M.bone, m);
      F.add(new THREE.ConeGeometry(0.003, 0.07, 6).translate(0, 0.125, 0), M.iron, m);
    }
    // coil of dark horsehair cord
    for (let k = 0; k < 5; k++) F.add(new THREE.TorusGeometry(0.075 + k * 0.004, 0.0035, 4, 24), M.hair, mtx([-0.32 + k * 0.003, y0 + 0.005 + k * 0.006, -0.18], [Math.PI / 2 + (rng() - 0.5) * 0.2, 0, rng()]));
    // bark rolls tied with a strip, one lying, one standing
    const roll = (p, r, tied = true) => {
      const h = 0.55 + rng() * 0.1;
      const gg = rollGeo(h, 0.035, 3.2, 0.012);
      F.add(gg, bark, mtx(p, r));
      if (tied) for (const ty of [0.15, h - 0.15]) F.add(new THREE.TorusGeometry(0.078, 0.004, 4, 20), M.lash, mtx(p, r).multiply(mtx([0, ty, 0], [Math.PI / 2, 0, 0])));
    };
    roll([-0.95, g(-0.95, 0.45) + 0.075, 0.45], [0, 0.3, Math.PI / 2]);
    roll([-0.75, g(-0.75, 0.75) + 0.075, 0.7], [0, -0.2, Math.PI / 2 + 0.05]);
    roll([0.95, g(0.95, -0.45), -0.45], [0.06, 0, 0.04]);
    // flat sheets pressed under a stone
    {
      let yy = g(0.85, 0.6) + 0.01;
      for (let k = 0; k < 5; k++) {
        F.add(sheetGeo(0.62, 0.4, rng, { curl: 0.05 - k * 0.012, warp: 0.006 }), bark, mtx([0.85 + (rng() - 0.5) * 0.06, yy, 0.6 + (rng() - 0.5) * 0.06], [0, 0.3 + (rng() - 0.5) * 0.3, 0]));
        yy += 0.006;
      }
      F.add(blob(0.16, 0.11, 0.13, rng, { detail: 2, rough: 0.12 }), M.stone, mtx([0.85, yy - 0.01, 0.6], [0, rng() * TAU, 0]));
    }
    // a small soot-black cauldron on three stones over a cold fire, softening bark
    {
      const cx = -0.15, cz = 1.15, gy = g(cx, cz);
      K.b.add(patchGeo(K.b.ground, ...F.tw(cx, cz), 0.65, 0.55, rng(), 10), decalMat('burned_ground_01', { scale: 1.2, tint: 0x8c7f72 }));
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * TAU + 0.3;
        F.add(blob(0.12, 0.13, 0.1, rng, { detail: 2, rough: 0.15 }), M.stone, mtx([cx + Math.cos(a) * 0.17, gy - 0.02, cz + Math.sin(a) * 0.17], [0, rng() * TAU, 0]), [0.85, 0.82, 0.78]);
      }
      for (let k = 0; k < 4; k++) {
        const a = rng() * TAU;
        const [ax, az] = F.tw(cx + Math.cos(a) * 0.35, cz + Math.sin(a) * 0.35), [bx, bz] = F.tw(cx - Math.cos(a) * 0.05, cz - Math.sin(a) * 0.05);
        addLog(K.b, [ax, K.b.ground(ax, az) + 0.02, az], [bx, K.b.ground(bx, bz) + 0.05, bz], 0.02, 0.015, rng, M.charcoal, null, { seg: 5, step: 0.2 });
      }
      const pot = lathe([[0.0, 0.0], [0.07, 0.006], [0.14, 0.04], [0.175, 0.1], [0.18, 0.16], [0.172, 0.2], [0.19, 0.21], [0.188, 0.22], [0.165, 0.215], [0.158, 0.16], [0.15, 0.1], [0.12, 0.05], [0.0, 0.03]], 24);
      F.add(pot, M.soot, mtx([cx, gy + 0.11, cz]));
      F.add(new THREE.CircleGeometry(0.155, 20).rotateX(-Math.PI / 2), water, mtx([cx, gy + 0.11 + 0.17, cz]));
      // a strip of bark curling out of the water
      F.add(sheetGeo(0.32, 0.07, rng, { curl: 0.1, res: 6 }), bark, mtx([cx + 0.08, gy + 0.11 + 0.22, cz], [0, 0.5, -0.9]));
      F.add(blob(0.12, 0.08, 0.1, rng), M.stone, mtx([cx + 0.17, gy, cz - 0.17]), [0.4, 0.38, 0.36]);
      K.colliders.push(F.col({ x: cx, z: cz, r: 0.3 }));
    }
    // a bundle of peeled willow rods, tied at two points
    {
      const [ax, az] = F.tw(-1.25, -0.45), [bx, bz] = F.tw(0.15, -0.95);
      const d = [bx - ax, bz - az], l = Math.hypot(...d), nx = -d[1] / l, nz = d[0] / l;
      for (let k = 0; k < 18; k++) {
        const o = (rng() - 0.5) * 0.09, oy = rng() * 0.05, sl = (rng() - 0.5) * 0.25;
        addLog(K.b, [ax + nx * o + d[0] / l * sl, K.b.ground(ax, az) + 0.01 + oy, az + nz * o + d[1] / l * sl],
          [bx + nx * o * 2.6, K.b.ground(bx, bz) + 0.01 + oy * 0.5, bz + nz * o * 2.6], 0.009, 0.005, rng, M.willow, null, { seg: 4, step: 0.35, bend: 0.01 });
      }
      for (const t of [0.3, 0.65]) {
        const px = ax + d[0] * t, pz = az + d[1] * t;
        K.b.add(new THREE.TorusGeometry(0.04, 0.005, 4, 12), M.lash, mtx([px, K.b.ground(px, pz) + 0.035, pz], [0, -Math.atan2(d[1], d[0]), 0]).multiply(mtx([0, 0, 0], [0, Math.PI / 2, 0])));
      }
    }
    // a log to sit on
    {
      const [ax, az] = F.tw(-0.6, -1.0), [bx, bz] = F.tw(0.7, -1.25);
      addLog(K.b, [ax, K.b.ground(ax, az) + 0.13, az], [bx, K.b.ground(bx, bz) + 0.13, bz], 0.16, 0.14, rng, M.bark, M.end, { seg: 11, flat: 0.3 });
      K.colliders.push(F.col({ x: 0.05, z: -1.12, hw: 0.7, hd: 0.18, rot: 0.19 }));
    }
    // scraps of bark trimmed off
    for (let k = 0; k < 10; k++) {
      const lx = (rng() - 0.5) * 1.8, lz = (rng() - 0.5) * 1.4;
      F.add(sheetGeo(0.06 + rng() * 0.12, 0.03 + rng() * 0.05, rng, { curl: 0.02 + rng() * 0.03, res: 3 }), bark, mtx([lx, g(lx, lz) + 0.012, lz], [0, rng() * TAU, rng() < 0.4 ? Math.PI : 0]));
    }
  });
  const [tx, tz] = F.tw(0, 0.1);
  return { target: K.proxy(tx, K.b.ground(tx, tz) + 0.3, tz, 2.0, 0.6, 2.0) };
}
