// The smith's lean-to (кыһа): pole frame under larch-bark slabs, open to the yard; a clay trench forge
// on a log crib, twin leather bag-bellows with a Y nozzle, the anvil iron set in a larch stump,
// tongs, hammer, a knife blank, the quench tub, a basket of charcoal, ore and slag by the door.
// The smith is away. Pumping the bellows (the act) makes the coals flare.
import * as THREE from 'three/webgpu';
import { addLog, blob, boxUV, decalMat, fillLathe, frame, geoPiece, jitterTint, lathe, logGeo, mtx, patchGeo, sheetGeo, sleep, TAU } from './kit.js';
import { water } from './pieces.js';
import { uniform, color, mix } from 'three/tsl';

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
      const sl = sheetGeo(3.75, 0.56, rng, { curl: 0, warp: 0.02, res: 10, thick: 0.015 });
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
      // (the knife blank and the hammer are separate things now: the forge work below)
      K.colliders.push({ x: ax, z: az, r: 0.27 });
      // low stool for the smith
      const [sx, sz] = F.tw(-1.0, 0.55);
      const sg = logGeo(0.25, 0.16, 0.155, rng, { seg: 10, caps: true });
      K.b.add(sg.side, M.darkwood, mtx([sx, K.b.ground(sx, sz) - 0.02, sz])); K.b.add(sg.caps, M.end, mtx([sx, K.b.ground(sx, sz) - 0.02, sz]), [0.7, 0.65, 0.6]);
    }
    // tongs (long reins, blackened jaws) leaning on the forge
    for (const s of [-1, 1]) addLog(K.b, Wy(-0.05, fy + 0.005, 0.72 + s * 0.02), Wy(FX - FD / 2 - 0.02, fy + 0.58, 0.55 - s * 0.02), 0.007, 0.006, rng, M.soot, M.soot, { seg: 5, step: 0.2, bend: 0.01 });
    // a second pair and a file hung on pegs on the back wall
    for (const s of [-1, 1]) addLog(K.b, Wy(1.5, fy + 0.7, -0.75 + s * 0.015), Wy(1.52, fy + 1.25, -0.72 - s * 0.015), 0.007, 0.006, rng, M.soot, M.soot, { seg: 5, step: 0.2 });
    addLog(K.b, Wy(1.48, fy + 1.27, -0.75), Wy(1.3, fy + 1.27, -0.75), 0.012, 0.012, rng, M.wood, M.end, { seg: 5 });
    F.add(boxUV(new THREE.BoxGeometry(0.012, 0.3, 0.02), 6), M.iron, mtx([1.5, fy + 0.95, -0.45], [0, 0, 0.08]), [0.7, 0.7, 0.72]);
    // quench tub (birch bark) with water
    {
      const tub = lathe([[0.19, 0], [0.2, 0.15], [0.205, 0.28], [0.19, 0.28], [0.185, 0.03]], 22, rng, 0.02);
      const surf = fillLathe(tub, 22, 4, 3, 0.76, { rings: 1 }); // the water meets the wobbled wall all round
      F.add(tub, K.barkCraft, mtx([-0.25, g(-0.25, -0.85), -0.85]), [0.75, 0.65, 0.55]);
      F.add(surf, water, mtx([-0.25, g(-0.25, -0.85), -0.85]));
      for (const hy of [0.03, 0.26]) F.add(new THREE.TorusGeometry(0.203, 0.006, 4, 24), M.willow, mtx([-0.25, g(-0.25, -0.85) + hy, -0.85], [Math.PI / 2, 0, 0]), [0.8, 0.75, 0.7]);
      K.colliders.push(F.col({ x: -0.25, z: -0.85, r: 0.25 }));
    }
    // birch-bark basket of charcoal by the back corner
    {
      const bx = 1.05, bz = -1.05, by = g(bx, bz);
      const bk = lathe([[0.17, 0], [0.22, 0.28], [0.21, 0.28], [0.165, 0.02]], 20, rng, 0.03);
      // the charcoal fill: a low mound out to the inner wall, under the loose lumps (an empty basket showed through)
      const coal = fillLathe(bk, 20, 3, 2, 0.9, { mound: 0.035, lump: 0.008 });
      F.add(bk, K.barkCraft, mtx([bx, by, bz]), [0.55, 0.5, 0.45]);
      F.add(coal, M.charcoal, mtx([bx, by, bz]));
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
  // ---- the forge work (docs/interactions.md): the helper's part. One bag pressed per E; an even beat builds the
  // blast (the gauge), the blank in the coals takes heat from it, is carried to the anvil with the tongs and
  // forged in three passes while it glows, back to the fire whenever it cools, then quenched in the tub.
  const L3 = (sah, en, ru) => ({ sah, en, ru });
  const TXT = {
    role: L3('Уус суох. Көмөлөһөөччүтүн курдук, кини хаалларбыт быһах тимирин таптай.', 'The smith is away. Finish the knife blank he left, as his helper would.', 'Кузнеца нет. Докуйте оставленную им заготовку ножа, как сделал бы его подручный.'),
    beat: L3('Күөрдү биир тэҥник үр: уот күүһүрдэҕинэ тимир кытарар.', 'Keep the bellows even: the iron reddens as the fire grows.', 'Качайте мехи ровно: когда огонь наберёт силу, железо покраснеет.'),
    burn: L3('Наһаа күүстээх күөрт кыра тимири сиэтэр.', 'Too strong a blast burns a small piece.', 'Слишком сильное дутьё сжигает мелкую вещь.'),
    cold: L3('Тимир сойдо: кытаран турдаҕына эрэ таптайыллар.', 'The iron has cooled: it is forged only while it glows.', 'Железо остыло: куют, только пока оно светится.'),
    toAnvil: L3('кытаҕаһынан кыстыкка уур', 'carry it to the anvil with the tongs', 'перенести клещами на наковальню'),
    strike: L3('өтүйэнэн оҕус', 'strike with the hammer', 'ударить молотом'),
    toFire: L3('уокка төттөрү уур', 'back into the coals', 'вернуть в угли'),
    quench: L3('ууга уг', 'quench it in the tub', 'опустить в воду'),
    wait: L3('итийэ илик', 'not hot yet', 'ещё не нагрелось'),
    blank: L3('быһах тимирэ', 'knife blank', 'заготовка ножа'),
    stages: [L3('Уһугун тардыы', 'Drawing out the point', 'Оттягивание острия'), L3('Хаптатыы', 'Flattening', 'Расплющивание'), L3('Биитин таптайыы', 'Forging the edge', 'Проковка лезвия')],
    stage: L3('уус үлэтэ', 'the smith’s pass', 'кузнечный приём'),
    done: L3('Быһах тимирэ таптайылынна.', 'The blade is forged.', 'Клинок откован.'),
    soft: L3('Саха тимирэ сымнаҕас, иэҕиллэҕэс.', 'Sakha iron is soft and springy.', 'Якутское железо мягкое и гибкое.'),
  };
  const heatU = uniform(0);
  const hot = new THREE.MeshStandardNodeMaterial({ color: 0x3a3836, roughness: 0.7, metalness: 0.6 });
  hot.name = 'hot-iron';
  hot.emissiveNode = mix(color(0.5, 0.02, 0.0), color(1.0, 0.55, 0.12), heatU.smoothstep(0.35, 1)).mul(heatU.smoothstep(0.18, 0.9).pow(1.6)).mul(3.2);
  // the blank's four shapes along +X: bar, pointed, flattened, blade (straight spine, the edge drawn thin)
  const blank = new THREE.Group(); blank.name = 'knife-blank';
  const shape = (len, thick, wide, f) => {
    const g = new THREE.BoxGeometry(len, thick, wide, 10, 1, 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const t = (p.getX(i) + len / 2) / len, [ky, kz, dz] = f(t, p.getZ(i) / (wide / 2)); p.setY(i, p.getY(i) * ky); p.setZ(i, p.getZ(i) * kz + dz); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, hot); m.castShadow = true; m.visible = false; blank.add(m);
    return m;
  };
  const tang = (t) => (t < 0.22 ? 0.55 : 1);
  const shapes = [
    shape(0.17, 0.013, 0.016, () => [1, 1, 0]),
    shape(0.19, 0.012, 0.016, (t) => [t > 0.6 ? 1 - (t - 0.6) / 0.4 * 0.7 : 1, (t > 0.6 ? 1 - (t - 0.6) / 0.4 * 0.75 : 1) * tang(t), 0]),
    shape(0.2, 0.006, 0.025, (t) => [1, (t > 0.7 ? 1 - ((t - 0.7) / 0.3) ** 1.5 * 0.8 : 1) * tang(t), 0]),
    shape(0.21, 0.0055, 0.026, (t, z) => [z > 0 ? 0.25 : 1, (t > 0.62 ? 1 - ((t - 0.62) / 0.38) ** 1.6 * 0.9 : 1) * tang(t), t > 0.62 ? -(((t - 0.62) / 0.38) ** 1.6) * 0.011 : 0]),
  ];
  shapes[0].visible = true;
  const [ax, az] = F.tw(-0.5, 0.95), anvilY = K.b.ground(ax, az) + 0.39 + 0.075;
  const SPOT = {
    fire: { p: new THREE.Vector3(...Wy(FX, fy + FTOP - 0.035, 0.08)), yaw: yaw + Math.PI / 2 + 0.2 },
    anvil: { p: new THREE.Vector3(ax, anvilY, az), yaw: yaw + 1.1 },
    tub: { p: new THREE.Vector3(...Wy(-0.25, g(-0.25, -0.85) + 0.19, -0.85)), yaw: yaw + 0.4 },
  };
  blank.position.copy(SPOT.fire.p); blank.rotation.y = SPOT.fire.yaw;
  blank.userData.dynamic = true;
  K.group.add(blank);
  // the hammer (өтүйэ): a small heavy head on a short haft, lying on the stump; it rises and falls by itself with each blow
  const hammer = new THREE.Group(); hammer.name = 'hammer';
  {
    const head = new THREE.Mesh(boxUV(new THREE.BoxGeometry(0.1, 0.034, 0.034), 6), M.iron);
    head.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(head.geometry.attributes.position.count * 3).fill(1), 3));
    head.geometry.setAttribute('grime', new THREE.Float32BufferAttribute(new Float32Array(head.geometry.attributes.position.count).fill(1), 1));
    head.position.set(0, 0.3, 0); head.castShadow = true;
    const hg = logGeo(0.3, 0.013, 0.012, rng, { seg: 6, step: 0.1 }).side;
    hg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(hg.attributes.position.count * 3).fill(0.6), 3));
    hg.setAttribute('grime', new THREE.Float32BufferAttribute(new Float32Array(hg.attributes.position.count).fill(1), 1));
    const haft = new THREE.Mesh(hg, M.fresh); haft.castShadow = true;
    hammer.add(head, haft);
  }
  const hamRest = { p: new THREE.Vector3(ax + 0.16, anvilY - 0.055, az + 0.12), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, yaw + 0.5, 0, 'YXZ')) };
  hammer.position.copy(hamRest.p); hammer.quaternion.copy(hamRest.q);
  hammer.userData.dynamic = true;
  K.group.add(hammer);

  const Wk = { at: 'fire', heat: 0, stage: 0, blows: 0, blast: 0, since: 9, side: 0, hot: 0, fly: null, swing: 0, busy: false, live: false };
  const BEAT = [0.1, 1.25], NEED = 0.58, BLOWS = 5; // s between bag strokes that keep the beat; forging heat; blows a pass
  const world = (v) => K.group.localToWorld(v.clone());
  const sound = (game, name, v) => game.audio?.play(name, world(v));
  const setShape = (i) => shapes.forEach((m, k) => { m.visible = k === i; });
  const move = (to, dur = 0.7) => new Promise((res) => { Wk.fly = { from: blank.position.clone(), to: SPOT[to].p, y0: blank.rotation.y, y1: SPOT[to].yaw, k: 0, dur, res }; Wk.at = to; });
  let pumpT = 0, energy = 0;
  K.ups.push((dt, c) => {
    const game = c?.game;
    // the bags: the one just pressed empties and fills again
    pumpT = Math.max(0, pumpT - dt);
    Wk.since += dt;
    Wk.blast = Math.max(0, Wk.blast - dt * 0.06);
    energy += (Math.min(1, Wk.blast * 1.15) - energy) * (1 - Math.exp(-2.2 * dt));
    bags.forEach((b, i) => {
      const pressed = pumpT > 0 && i === Wk.side ? Math.sin((1 - pumpT / 0.5) * Math.PI) : 0;
      const sc = 0.62 + 0.3 * (1 - pressed) - 0.07;
      b.bag.scale.set(1, sc, 0.85 + 0.15 * sc);
      b.upper.position.y = 0.035 + 0.13 * sc;
    });
    K.M.glow.value = 0.22 + energy * 2.6 + pumpT * 0.9;
    light.intensity = 0.15 + energy * 9;
    // the blank: heats in the coals with the blast, cools in the air
    if (Wk.at === 'fire' && !Wk.fly) {
      Wk.heat += (Wk.blast * 1.12 - Wk.heat) * (1 - Math.exp(-0.6 * dt));
      Wk.hot = Wk.blast > 0.93 && Wk.heat > 0.9 ? Wk.hot + dt : 0;
      if (Wk.hot > 2.2 && Wk.stage > 0) { Wk.hot = 0; Wk.blows = 0; game?.work?.hint('forge-burn', TXT.burn, 3); } // a pass to do again
    } else Wk.heat = Math.max(0, Wk.heat - dt * (Wk.at === 'tub' ? 2.5 : 0.045));
    heatU.value = Wk.heat;
    if (Wk.fly) {
      const f = Wk.fly; f.k = Math.min(1, f.k + dt / f.dur);
      const e = f.k * f.k * (3 - 2 * f.k);
      blank.position.lerpVectors(f.from, f.to, e); blank.position.y += Math.sin(f.k * Math.PI) * 0.18;
      blank.rotation.y = f.y0 + (f.y1 - f.y0) * e;
      blank.userData.sphere = undefined;
      if (f.k >= 1) { Wk.fly = null; f.res(); }
    }
    // the hammer's blow
    if (Wk.swing > 0) {
      Wk.swing = Math.max(0, Wk.swing - dt / 0.32);
      const k = 1 - Wk.swing, up = k < 0.6 ? Math.sin(k / 0.6 * Math.PI / 2) : 1 - ((k - 0.6) / 0.4) ** 2;
      hammer.position.set(ax - 0.02, anvilY + 0.02 + up * 0.32, az + 0.3);
      hammer.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25 + up * 0.9, yaw + 0.1, 0, 'YXZ'));
      if (Wk.swing === 0) { hammer.position.copy(hamRest.p); hammer.quaternion.copy(hamRest.q); }
    }
    // the gauge: the blast while you blow, the iron's heat while you forge
    const w = game?.work;
    if (w && Wk.live) {
      if (Wk.at === 'fire' && Wk.since < 2.5) w.meter(Math.min(1, Wk.blast), NEED, 0.93);
      else if (Wk.at === 'anvil' && !Wk.fly) w.meter(Math.min(1, Wk.heat), 0.34, 1);
      else { w.meter(null); if (Wk.since > 2.5 && Wk.at !== 'anvil') Wk.live = false; }
    }
  });

  const target = K.proxy(...Wy(0.1, fy + 0.4, 0), 1.9, 0.85, 1.5, yaw);
  const pos = new THREE.Vector3(...Wy(-0.6, fy + 0.3, 0));
  const act = {
    id: 'bellows', thenCard: false,
    label: { sah: 'Күөрдү үр', en: 'Pump the bellows', ru: 'Покачать мехи' },
    run: async (game) => {
      game.work?.hint('forge-role', TXT.role, 2);
      const even = Wk.since > BEAT[0] && Wk.since < BEAT[1];
      if (Wk.live && !even && Wk.since < 2.5) game.work?.hint('forge-beat', TXT.beat);
      Wk.blast = Math.min(1, Wk.blast + (even || !Wk.live ? 0.11 : 0.04));
      Wk.live = true; Wk.since = 0; Wk.side = 1 - Wk.side; pumpT = 0.5;
      if (Wk.at === 'rest') { Wk.at = 'fire'; Wk.stage = 0; Wk.blows = 0; setShape(0); blank.position.copy(SPOT.fire.p); blank.rotation.y = SPOT.fire.yaw; blank.userData.sphere = undefined; } // a new blank
      sound(game, 'bellows', pos);
      await sleep(260);
    },
  };
  // the blank's own act follows where it lies and how hot it is
  const acts = {
    wait: { id: 'forge-wait', label: TXT.wait, thenCard: false, run: async () => {} },
    toAnvil: { id: 'to-anvil', label: TXT.toAnvil, thenCard: false, run: async (game) => { Wk.live = true; await move('anvil'); sound(game, 'wood-lay-2', SPOT.anvil.p); game.work?.say(TXT.stages[Wk.stage], TXT.stage); game.promptKey = null; } },
    toFire: { id: 'to-fire', label: TXT.toFire, thenCard: false, run: async (game) => { await move('fire'); Wk.since = 0; game.promptKey = null; } },
    strike: {
      id: 'hammer', label: TXT.strike, thenCard: false,
      run: async (game) => {
        if (Wk.busy) return;
        Wk.busy = true; Wk.swing = 1;
        await sleep(200);
        sound(game, 'anvil', SPOT.anvil.p) || sound(game, 'chop-stuck', SPOT.anvil.p);
        game.player.springV -= 0.5;
        if (Wk.heat > 0.34) {
          Wk.heat -= 0.035;
          if (++Wk.blows >= BLOWS) {
            Wk.blows = 0; Wk.stage++; setShape(Wk.stage);
            if (Wk.stage < 3) game.work?.say(TXT.stages[Wk.stage], TXT.stage);
          }
          game.work?.count('hammer');
        } else game.work?.hint('forge-cold', TXT.cold, 3);
        await sleep(160);
        Wk.busy = false; game.promptKey = null;
      },
    },
    quench: {
      id: 'quench', label: TXT.quench, thenCard: false,
      run: async (game) => {
        await move('tub', 0.8);
        sound(game, 'quench', SPOT.tub.p) || sound(game, 'water-pour', SPOT.tub.p);
        await sleep(1500);
        await move('anvil', 0.8);
        Wk.at = 'rest'; Wk.live = false; game.work?.meter(null);
        game.work?.count('blades');
        game.work?.say(TXT.done, TXT.soft);
        game.promptKey = null;
      },
    },
  };
  blank.userData.forge = Wk; // (tools: the work's state)
  const blankIt = {
    target: blank, label: TXT.blank, entry: 'knife',
    live: () => { // (src/interact/index.js asks it for the act of the moment)
      if (Wk.fly || Wk.at === 'tub' || Wk.at === 'rest') return null;
      if (Wk.at === 'fire') return Wk.heat >= NEED ? acts.toAnvil : acts.wait;
      if (Wk.stage >= 3) return acts.quench;
      return Wk.heat > 0.34 ? acts.strike : acts.toFire;
    },
  };
  return { target, act, extra: [blankIt] };
}
