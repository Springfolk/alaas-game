// The smith's lean-to (кыһа): pole frame under larch-bark slabs, open to the yard; a clay trench forge
// on a log crib, twin leather bag-bellows with a Y nozzle, the anvil iron set in a larch stump,
// tongs, hammer, a knife blank, the quench tub, a basket of charcoal, ore and slag by the door.
// The smith is away. Pumping the bellows (the act) makes the coals flare.
import * as THREE from 'three/webgpu';
import { addLog, blob, boxUV, decalMat, frame, geoPiece, jitterTint, lathe, logGeo, mtx, patchGeo, sheetGeo, sleep, TAU } from './kit.js';
import { water } from './pieces.js';

export function smithy(K, x, z, yaw) {
  const { M, rng } = K;
  const F = frame(K.b, x, z, yaw);
  const g = F.ground;
  const W = (lx, lz, dy = 0) => { const [wx, wz] = F.tw(lx, lz); return [wx, K.b.ground(wx, wz) + dy, wz]; };
  const Wy = (lx, y, lz) => { const [wx, wz] = F.tw(lx, lz); return [wx, y, wz]; };
  const y0 = g(0, 0);

  geoPiece(K, () => {
    // ground blackened by charcoal and ash under the roof, trodden in front
    K.b.add(patchGeo(g, 0, 0, 2.3, 2.1, 0, 18).applyMatrix4(F.F), decalMat('burned_ground_01', { scale: 1.4, tint: 0x8d8780 }));

    // frame: tall posts at the open front (−x), low posts at the back
    const FH = y0 + 2.25, BH = y0 + 1.6;
    for (const [px, pz, top] of [[-1.5, -1.5, FH], [-1.5, 1.5, FH], [1.5, -1.5, BH], [1.5, 1.5, BH], [1.5, 0, BH]]) {
      addLog(K.b, W(px, pz, -0.3), Wy(px + (rng() - 0.5) * 0.04, top, pz + (rng() - 0.5) * 0.04), 0.085, 0.07, rng, M.wood, M.end, { seg: 9 });
      K.colliders.push(F.col({ x: px, z: pz, r: 0.12 }));
    }
    // forked tops carry the beams
    addLog(K.b, Wy(-1.55, FH - 0.04, -1.85), Wy(-1.55, FH - 0.02, 1.85), 0.075, 0.065, rng, M.wood, M.end, { seg: 9 });
    addLog(K.b, Wy(1.55, BH - 0.04, -1.85), Wy(1.55, BH - 0.03, 1.85), 0.07, 0.06, rng, M.wood, M.end, { seg: 9 });
    // rafters, front to back, then bark slabs, then weight poles
    for (let i = 0; i < 9; i++) {
      const rz = -1.75 + i * 3.5 / 8 + (rng() - 0.5) * 0.08;
      addLog(K.b, Wy(-1.72, FH + 0.07, rz), Wy(1.75, BH + 0.06, rz), 0.045, 0.038, rng, M.wood, M.end, { seg: 7 });
    }
    const slope = Math.atan2(FH - BH, 3.6);
    for (let i = 0; i < 8; i++) {
      const sz = -1.75 + i * 0.5 + (rng() - 0.5) * 0.05;
      const sl = sheetGeo(3.75, 0.56, rng, { curl: 0, warp: 0.02, res: 10 });
      // curl across the slab (bark dries cupped)
      const p = sl.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, p.getY(k) - 0.06 * (p.getZ(k) / 0.28) ** 2 + 0.03);
      sl.computeVertexNormals();
      F.add(sl, M.barkSlab, mtx([0, (FH + BH) / 2 + 0.11 + (i % 2) * 0.03, sz], [0, (rng() - 0.5) * 0.04, 0]).multiply(new THREE.Matrix4().makeRotationZ(-slope)), jitterTint(rng, 0.12));
    }
    for (const wz of [-1.0, 0.6]) addLog(K.b, Wy(-1.8, FH + 0.2, wz), Wy(1.8, BH + 0.2, wz + 0.1), 0.05, 0.045, rng, M.darkwood, M.end, { seg: 7 });
    // back wall of close-set poles; a half wall on the north side
    for (let i = 0; i < 17; i++) {
      const wz = -1.45 + i * 2.9 / 16;
      addLog(K.b, W(1.62, wz, -0.25), Wy(1.62 + (rng() - 0.5) * 0.05, BH - 0.05 + rng() * 0.1, wz), 0.05 + rng() * 0.015, 0.04, rng, M.wood, M.end, { seg: 7, step: 0.35 });
    }
    K.colliders.push(F.col({ x: 1.62, z: 0, hw: 0.08, hd: 1.55 }));
    for (let i = 0; i < 9; i++) {
      const wx = 1.4 - i * 0.32, top = BH + (FH - BH) * (1.5 - wx) / 3 - 0.05;
      if (wx < -0.6) break;
      addLog(K.b, W(wx, -1.62, -0.25), Wy(wx, top - rng() * 0.15, -1.62), 0.05, 0.04, rng, M.wood, M.end, { seg: 7, step: 0.35 });
    }
    K.colliders.push(F.col({ x: 0.45, z: -1.62, hw: 1.0, hd: 0.08 }));
  });

  // ---- the forge: log crib, clay hearth bench 60 cm high, trench 70 × 9 × 8 cm ----
  const FX = 0.6, FL = 1.2, FD = 0.72, FTOP = 0.62;
  const fy = Math.max(g(FX - FD / 2, -FL / 2), g(FX + FD / 2, FL / 2), g(FX, 0));
  geoPiece(K, () => {
    for (let layer = 0; layer < 3; layer++) {
      const ly = fy - 0.04 + layer * 0.13 + 0.065;
      if (layer % 2 === 0) for (const sx of [-1, 1]) addLog(K.b, Wy(FX + sx * 0.3, ly, -FL / 2 - 0.12), Wy(FX + sx * 0.3, ly, FL / 2 + 0.12), 0.075, 0.07, rng, M.darkwood, M.end, { seg: 8 });
      else for (const sz of [-1, 1]) addLog(K.b, Wy(FX - FD / 2 - 0.1, ly, sz * 0.52), Wy(FX + FD / 2 + 0.1, ly, sz * 0.52), 0.075, 0.07, rng, M.darkwood, M.end, { seg: 8 });
    }
    // clay body: a rounded block over the crib, slumped, rain-streaked; soot climbs its front
    {
      const body = new THREE.BoxGeometry(FD, FTOP, FL, 8, 6, 12);
      const p = body.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let bx = p.getX(i), by = p.getY(i) + FTOP / 2, bz = p.getZ(i);
        const t = by / FTOP;
        // rounded vertical edges and a slumped, wider foot
        const ex = Math.abs(bx) / (FD / 2), ez = Math.abs(bz) / (FL / 2);
        const corner = Math.max(0, ex - 0.7) * Math.max(0, ez - 0.7) / 0.09;
        const foot = 1 + 0.08 * (1 - t) ** 2;
        const round = 1 - corner * 0.08 - Math.max(0, t - 0.85) * Math.max(ex, ez) * 0.5;
        bx *= foot * round; bz *= foot * round;
        bx += 0.012 * Math.sin(bz * 13 + by * 7); bz += 0.012 * Math.sin(bx * 11 + by * 9);
        p.setXYZ(i, bx, Math.min(by, FTOP - 0.012), bz);
      }
      body.computeVertexNormals(); boxUV(body);
      const col = new Float32Array(p.count * 3).fill(1);
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / FTOP, front = Math.max(0, -p.getX(i) / (FD / 2));
        const k = Math.min(1, Math.max(0, (t - 0.55) * 2.2)) * (0.5 + 0.5 * front);
        col[i * 3] = 1 - k * 0.6; col[i * 3 + 1] = 1 - k * 0.64; col[i * 3 + 2] = 1 - k * 0.66;
      }
      body.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      F.add(body, M.clay, mtx([FX, fy - 0.02, 0]));
    }
    // the top: a heightfield with the trench, soot-black and glazed near it, reddish further out
    {
      const nx = 22, nz = 30;
      const top = new THREE.PlaneGeometry(FD, FL, nx, nz);
      top.rotateX(-Math.PI / 2);
      const p = top.attributes.position, uvA = top.attributes.uv;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const tx = p.getX(i), tz = p.getZ(i);
        const dt = Math.max(Math.abs(tx) / 0.045, Math.abs(tz) / 0.35);
        let y = 0;
        if (dt < 1) y = -0.08 * (1 - dt ** 6);
        const ex = Math.max(Math.abs(tx) / (FD / 2), Math.abs(tz) / (FL / 2));
        y -= Math.max(0, ex - 0.8) ** 2 * 1.2; // rounded rim
        y += (rng() - 0.5) * 0.006;
        p.setY(i, y);
        uvA.setXY(i, tx, tz);
        const d = Math.max(0, 1 - Math.hypot(tx / 0.16, tz / 0.5));
        const red = Math.max(0, 1 - Math.hypot(tx / 0.32, tz / 0.62)) * (1 - d);
        col[i * 3] = (1 - d * 0.88) * (1 + red * 0.15); col[i * 3 + 1] = (1 - d * 0.9) * (1 - red * 0.2); col[i * 3 + 2] = (1 - d * 0.9) * (1 - red * 0.35);
      }
      top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      top.computeVertexNormals();
      F.add(top, M.clay, mtx([FX, fy + FTOP - 0.01, 0]));
    }
    const ty = fy + FTOP - 0.01;
    // coals heaped in the trench
    for (let i = 0; i < 46; i++) {
      const cx = FX + (rng() - 0.5) * 0.08, cz = (rng() - 0.5) * 0.66, s = 0.018 + rng() * 0.02;
      F.add(blob(s, s * 0.8, s * 1.2, rng, { detail: 0, rough: 0.3 }), M.coal, mtx([cx, ty - 0.07 + rng() * 0.08, cz], [rng(), rng() * TAU, rng()]));
    }
    for (let i = 0; i < 14; i++) {
      const cx = FX + (rng() < 0.5 ? -1 : 1) * (0.07 + rng() * 0.12), cz = (rng() - 0.5) * 0.8, s = 0.015 + rng() * 0.02;
      F.add(blob(s, s * 0.7, s * 1.3, rng, { detail: 0, rough: 0.3 }), M.charcoal, mtx([cx, ty - 0.005, cz], [0, rng() * TAU, 0]));
    }
    K.colliders.push(F.col({ x: FX, z: 0, hw: FD / 2 + 0.1, hd: FL / 2 + 0.15 }));
  });

  // ---- the bellows: two whole-hide bags lying in front, mouths with hand slats at the back,
  //      necks joined by a birch Y-nozzle that enters the forge front under the trench ----
  const mk = (geo, mat, c = 1, gr = 0.2) => {
    const n = geo.attributes.position.count;
    if (!geo.attributes.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(c), 3));
    geo.setAttribute('grime', new THREE.Float32BufferAttribute(new Float32Array(n).fill(gr), 1));
    const m = new THREE.Mesh(geo, mat);
    return m;
  };
  const bagGeo = () => {
    const gg = new THREE.SphereGeometry(1, 24, 14);
    const p = gg.attributes.position;
    const f = rng() * 9;
    for (let i = 0; i < p.count; i++) {
      const bx = p.getX(i), by = p.getY(i), bz = p.getZ(i);
      const t = (bx + 1) / 2; // 0 mouth … 1 neck
      const w = t > 0.7 ? 1 - ((t - 0.7) / 0.3) ** 1.5 * 0.82 : 1 - (0.7 - t) * 0.25;
      const wr = 1 + 0.045 * Math.sin(bx * 19 + bz * 5 + f) * Math.sin(by * 9 + f) + 0.02 * Math.sin(bz * 27 + bx * 8);
      let y = (by + 1) / 2 * 0.24 * w * wr;
      if (by < -0.5) y = (by + 1) / 2 * 0.24 * 0.6; // flat on the ground
      p.setXYZ(i, bx * 0.33, y, bz * 0.19 * w * wr);
    }
    gg.computeVertexNormals(); boxUV(gg, 1);
    return gg;
  };
  const bags = [];
  for (const side of [-1, 1]) {
    const grp = new THREE.Group();
    const [bx, bz] = F.tw(-0.92, side * 0.22);
    grp.position.set(bx, K.b.ground(bx, bz) + 0.005, bz);
    grp.rotation.y = yaw + side * 0.06;
    const bag = mk(bagGeo(), M.leather, 1, 0.15);
    const slatG = () => boxUV(new THREE.BoxGeometry(0.035, 0.022, 0.36), 4);
    const lower = mk(slatG(), M.wood, 0.8, 0.05), upper = mk(slatG(), M.wood, 0.8, 0.3);
    lower.position.set(-0.32, 0.03, 0); upper.position.set(-0.32, 0.15, 0);
    // leather hand loop on the upper slat
    const loop = mk(new THREE.TorusGeometry(0.04, 0.007, 5, 12, Math.PI), M.leather, 0.7, 0.3);
    loop.position.set(0, 0.012, 0); loop.rotation.set(0, Math.PI / 2, 0);
    upper.add(loop);
    loop.castShadow = false;
    grp.add(bag, lower, upper);
    K.group.add(grp);
    bags.push({ bag, upper, phase: side > 0 ? 0 : Math.PI });
  }
  geoPiece(K, () => {
    // Y nozzle: the necks slip over two birch pipes that meet in a block, which enters the clay
    const NY = fy + 0.26, NX = FX - FD / 2;
    for (const side of [-1, 1]) addLog(K.b, Wy(-0.6, fy + 0.07, side * 0.21), Wy(NX - 0.3, NY - 0.04, side * 0.045), 0.032, 0.026, rng, M.wood, M.end, { seg: 7, bend: 0 });
    {
      const pitch = Math.atan2(0.1, 0.5);
      const blk = boxUV(new THREE.BoxGeometry(0.26, 0.075, 0.14, 2, 1, 2));
      F.add(blk, M.wood, mtx([NX - 0.14, NY, 0], [0, 0, pitch]), [0.85, 0.78, 0.7]);
      F.add(blob(0.07, 0.09, 0.11, rng, { detail: 2, rough: 0.1 }), M.clay, mtx([NX + 0.01, NY - 0.07, 0]), [0.5, 0.45, 0.42]);
      // neck binding: rawhide wraps
      for (const side of [-1, 1]) F.add(new THREE.TorusGeometry(0.035, 0.009, 5, 12), M.leather, mtx([-0.58, fy + 0.075, side * 0.21], [0, Math.PI / 2, 0.3]), [0.7, 0.6, 0.5]);
    }

    // ---- anvil, stool, tools ----
    {
      const [ax, az] = F.tw(-0.5, 0.95);
      const ay = K.b.ground(ax, az);
      const st = logGeo(0.42, 0.21, 0.2, rng, { seg: 12, caps: true, wob: 0.05 });
      K.b.add(st.side, M.darkwood, mtx([ax, ay - 0.03, az])); K.b.add(st.caps, M.end, mtx([ax, ay - 0.03, az]), [0.55, 0.5, 0.46]);
      const top = ay + 0.39;
      F.add(boxUV(new THREE.BoxGeometry(0.12, 0.1, 0.08), 4), M.iron, mtx([-0.5, top + 0.02, 0.95], [0, 0.2, 0]), [0.65, 0.65, 0.68]);
      // knife blank cooling on the anvil
      const kb = new THREE.BoxGeometry(0.17, 0.005, 0.024, 6, 1, 1);
      const kp = kb.attributes.position;
      for (let i = 0; i < kp.count; i++) { const t = (kp.getX(i) + 0.085) / 0.17; kp.setZ(i, kp.getZ(i) * (1 - 0.7 * t ** 2) + 0.004 * t ** 2); }
      kb.computeVertexNormals();
      F.add(boxUV(kb, 6), M.iron, mtx([-0.47, top + 0.075, 0.93], [0, 1.1, 0]), [0.55, 0.5, 0.48]);
      // hammer (head like a small axe with a heavy poll) lying on the stump
      F.add(boxUV(new THREE.BoxGeometry(0.1, 0.034, 0.034), 6), M.iron, mtx([-0.36, top + 0.02, 1.08], [0, -0.4, 0]));
      addLog(K.b, Wy(-0.36, top + 0.02, 1.08), Wy(-0.5, top - 0.1, 1.41), 0.014, 0.012, rng, M.fresh, null, { seg: 6, step: 0.1 }, [0.6, 0.5, 0.42]);
      K.colliders.push({ x: ax, z: az, r: 0.27 });
      // low stool for the smith
      const [sx, sz] = F.tw(-1.0, 0.55);
      const sg = logGeo(0.25, 0.16, 0.155, rng, { seg: 10, caps: true });
      K.b.add(sg.side, M.darkwood, mtx([sx, K.b.ground(sx, sz) - 0.02, sz])); K.b.add(sg.caps, M.end, mtx([sx, K.b.ground(sx, sz) - 0.02, sz]), [0.7, 0.65, 0.6]);
    }
    // tongs (long reins, blackened jaws) leaning on the forge
    for (const s of [-1, 1]) addLog(K.b, Wy(-0.05, fy + 0.005, 0.72 + s * 0.02), Wy(FX - FD / 2 - 0.02, fy + 0.58, 0.55 - s * 0.02), 0.007, 0.006, rng, M.soot, null, { seg: 5, step: 0.2, bend: 0.01 });
    // a second pair and a file hung on pegs on the back wall
    for (const s of [-1, 1]) addLog(K.b, Wy(1.5, fy + 0.7, -0.75 + s * 0.015), Wy(1.52, fy + 1.25, -0.72 - s * 0.015), 0.007, 0.006, rng, M.soot, null, { seg: 5, step: 0.2 });
    addLog(K.b, Wy(1.48, fy + 1.27, -0.75), Wy(1.3, fy + 1.27, -0.75), 0.012, 0.012, rng, M.wood, null, { seg: 5 });
    F.add(boxUV(new THREE.BoxGeometry(0.012, 0.3, 0.02), 6), M.iron, mtx([1.5, fy + 0.95, -0.45], [0, 0, 0.08]), [0.7, 0.7, 0.72]);
    // quench tub (birch bark) with water
    {
      const tub = lathe([[0.19, 0], [0.2, 0.15], [0.205, 0.28], [0.19, 0.28], [0.185, 0.03]], 22, rng, 0.02);
      F.add(tub, K.barkCraft, mtx([-0.25, g(-0.25, -0.85), -0.85]), [0.75, 0.65, 0.55]);
      F.add(new THREE.CircleGeometry(0.19, 20).rotateX(-Math.PI / 2), water, mtx([-0.25, g(-0.25, -0.85) + 0.22, -0.85]));
      for (const hy of [0.03, 0.26]) F.add(new THREE.TorusGeometry(0.203, 0.006, 4, 24), M.willow, mtx([-0.25, g(-0.25, -0.85) + hy, -0.85], [Math.PI / 2, 0, 0]), [0.8, 0.75, 0.7]);
      K.colliders.push(F.col({ x: -0.25, z: -0.85, r: 0.25 }));
    }
    // birch-bark basket of charcoal by the back corner
    {
      const bx = 1.05, bz = -1.05, by = g(bx, bz);
      F.add(lathe([[0.17, 0], [0.22, 0.28], [0.21, 0.28], [0.165, 0.02]], 20, rng, 0.03), K.barkCraft, mtx([bx, by, bz]), [0.55, 0.5, 0.45]);
      for (let i = 0; i < 26; i++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * 0.18, s = 0.022 + rng() * 0.02;
        F.add(blob(s, s * 0.8, s * 1.2, rng, { detail: 0, rough: 0.3 }), M.charcoal, mtx([bx + Math.cos(a) * r, by + 0.27 + (0.18 - r) * 0.3, bz + Math.sin(a) * r], [rng(), rng() * TAU, 0]));
      }
    }
    // outside: a heap of rust-brown bog ore, glassy slag cakes by the door
    for (let i = 0; i < 30; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * 0.45, s = 0.035 + rng() * 0.035;
      const lx = -2.3 + Math.cos(a) * r, lz = 1.6 + Math.sin(a) * r;
      F.add(blob(s, s * 0.85, s, rng, { detail: 1, rough: 0.35 }), M.ore, mtx([lx, g(lx, lz) + (0.45 - r) * 0.35, lz], [rng(), rng() * TAU, 0]), jitterTint(rng, 0.15));
    }
    for (let i = 0; i < 6; i++) {
      const lx = -2.1 + (rng() - 0.5) * 0.9, lz = -1.4 + (rng() - 0.5) * 0.6, s = 0.07 + rng() * 0.05;
      F.add(blob(s, s * 0.4, s * 0.8, rng, { detail: 1, rough: 0.3 }), M.slag, mtx([lx, g(lx, lz), lz], [0, rng() * TAU, (rng() - 0.5) * 0.4]));
    }
  });

  // light from the coals
  const light = new THREE.PointLight(0xff7a33, 0, 5.5, 2);
  light.position.set(...Wy(FX, fy + FTOP + 0.15, 0));
  light.castShadow = false;
  K.group.add(light);

  // ---- animation: idle smoulder; pumping alternates the bags and the coals flare ----
  let pumping = 0, energy = 0;
  K.ups.push((dt) => {
    pumping = Math.max(0, pumping - dt);
    const target = pumping > 0 ? 1 : 0;
    energy += (target - energy) * (1 - Math.exp(-(target ? 1.6 : 0.35) * dt));
    for (const b of bags) {
      if (pumping > 0) b.phase += dt * TAU * 0.75;
      const s = pumping > 0 ? 0.62 + 0.38 * Math.sin(b.phase) : 0.55 + (b.bag.scale.y - 0.55) * Math.exp(-3 * dt);
      b.bag.scale.set(1, s, 0.85 + 0.15 * s);
      b.upper.position.y = 0.035 + 0.13 * s;
    }
    K.M.glow.value = 0.22 + energy * 2.4 + energy * 0.4 * Math.sin(bags[0].phase * 2);
    light.intensity = 0.15 + energy * 9;
  });
  const target = K.proxy(...Wy(0.1, fy + 0.4, 0), 1.9, 0.85, 1.5, yaw);
  const pos = new THREE.Vector3(...Wy(-0.6, fy + 0.3, 0));
  const act = {
    id: 'bellows',
    label: { sah: 'Күөрдү үр', en: 'Pump the bellows', ru: 'Покачать мехи' },
    run: async (game) => {
      const wpos = pos.clone();
      K.group.localToWorld(wpos);
      game.audio?.play('bellows', wpos);
      pumping = 4.2;
      await sleep(3600);
    },
  };
  return { target, act };
}
