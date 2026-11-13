// The hay crew's camp (отуу) by the winter place (кыстык), at the edge of its hay meadows, as Sieroszewski saw the
// mowers live out on the meadow: a conical hut of poles thatched with hay (от отуу) with a hay bed inside, a fire ring
// of stones with cold ashes and charred ends, its hook pole, the sooty tea kettle (чаанньык) put down by it, a log to
// sit on with the whetstone (аҕаан) and birch-bark cups, a birch-bark pail (ыаҕас) of water; a stack begun round its
// pole (кэбиһии) on a bed of poles, the wooden hay forks (атырдьах) and rakes (кыраабыл) leaning on its pole and the
// hut, cocks (бугул) and raked windrows on the mown strip beyond, and the long poles for the stacks laid on two
// sleepers. The scythe post stands beside it (src/models/hayfield.js). Local frame: +X east.
import { Bucket, addLog, logGeo, lathe, tube, blob, mtx, along, patchGeo, decalMat, jitterTint, wobbler } from './yardlife/kit.js';
import { kettle } from './yardlife/kettle.js';
import { grainAlong } from './yardlife/forged.js';
import { yardMats } from './yardlife/mats.js';
import { roundStack, windrow, strawFringe, stackColors, HAY } from './yardlife/hay.js';

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'haybase';
  const interactables = [], colliders = [];
  const B = new Bucket(ground, { drape: true });

  // ── the fire ring: nine stones round cold ashes, the ends of the last fire charred black ──
  const FX = 0, FZ = 0, g0 = ground(FX, FZ);
  B.add(patchGeo(ground, FX, FZ, 0.62, 0.58, 0.4, 14, 0.012), decalMat('burned_ground_01', { scale: 1.2, tint: 0x9a948c }));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rng() * 0.3, r = 0.42 + rng() * 0.05, x = FX + Math.cos(a) * r, z = FZ + Math.sin(a) * r;
    const s = 0.07 + rng() * 0.04;
    B.add(blob(s * 1.2, s * 0.8, s, rng, { detail: 1, rough: 0.25 }), M.stone, mtx([x, ground(x, z) - 0.02, z], [0, rng() * 6, 0]), jitterTint(rng, 0.12));
  }
  // ash: a low grey mound, and the charred ends of four sticks laid as a star
  B.add(blob(0.3, 0.035, 0.28, rng, { detail: 2, rough: 0.12 }), M.earth, mtx([FX, g0 - 0.005, FZ]), [0.72, 0.7, 0.68]);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3 + rng() * 0.4, r0 = 0.06, r1 = 0.36 + rng() * 0.18;
    const p0 = [FX + Math.cos(a) * r0, g0 + 0.03, FZ + Math.sin(a) * r0], p1 = [FX + Math.cos(a) * r1, ground(FX + Math.cos(a) * r1, FZ + Math.sin(a) * r1) + 0.03, FZ + Math.sin(a) * r1];
    addLog(B, p0, p1, 0.025, 0.03, rng, M.charcoal, M.charcoal, { seg: 5 });
  }
  // the hook pole (a birch pole driven slanting into the ground beyond the fire, a stub of a branch left as the hook)
  const hp0 = [FX - 1.15, ground(FX - 1.15, FZ + 0.1) - 0.25, FZ + 0.1], hp1 = [FX + 0.12, g0 + 1.05, FZ];
  addLog(B, hp0, hp1, 0.035, 0.022, rng, M.wood, M.end, { seg: 6, step: 0.25 });
  addLog(B, [FX + 0.06, g0 + 1.02, FZ], [FX + 0.12, g0 + 0.9, FZ + 0.01], 0.012, 0.01, rng, M.wood, M.end, { seg: 5 });
  // a fork stake holding it up
  { // its top just under the pole where it crosses it
    const k = (FX - 0.58 - hp0[0]) / (hp1[0] - hp0[0]), y = hp0[1] + (hp1[1] - hp0[1]) * k - 0.035, z = hp0[2] + (hp1[2] - hp0[2]) * k;
    addLog(B, [FX - 0.62, ground(FX - 0.62, z) - 0.2, z], [FX - 0.58, y, z], 0.025, 0.02, rng, M.wood, M.end, { seg: 5 });
  }
  colliders.push({ x: FX, z: FZ, r: 0.5 });

  // ── the kettle (чаанньык): a trade kettle of tinned sheet iron, put down cold on the trodden ground by the ring
  //    after the last tea (yardlife/kettle.js) ──
  const KX = FX + 0.62, KZ = FZ - 0.42;
  kettle(T, B, M, mtx([KX, ground(KX, KZ), KZ], [0, 2.4, 0]));
  const kettleT = proxy(T, object, 0.34, 0.3, 0.3, [KX, ground(KX, KZ) + 0.14, KZ]);

  // ── a log to sit on, and two birch-bark cups on it ──
  addLog(B, [FX - 0.9, ground(FX - 0.9, FZ + 0.85) + 0.13, FZ + 0.85], [FX + 0.7, ground(FX + 0.7, FZ + 1.0) + 0.13, FZ + 1.0], 0.15, 0.13, rng, M.wood, M.end, { seg: 10, step: 0.3 });
  colliders.push({ x: FX - 0.1, z: FZ + 0.93, hw: 0.82, hd: 0.17, rot: -0.09 });
  for (const [cx, cz] of [[FX + 0.25, FZ + 0.96], [FX + 0.4, FZ + 0.99]]) {
    const cy = ground(cx, cz) + 0.27;
    B.add(lathe([[0, 0], [0.034, 0], [0.04, 0.055], [0.037, 0.056], [0.031, 0.004], [0, 0.004]], 12), M.birch, mtx([cx, cy, cz]), [0.95, 0.92, 0.85]);
  }

  // ── tools: forks (атырдьах): a straight haft whose pointed end is one tine, a pointed branch of ~30 cm bound
  //    beside it with willow (the dictionary's атырдьах: dry larch, the second tine tied on parallel); rakes: a bar
  //    55 cm across with 12 wooden teeth on a long haft. `foot` = the haft's butt, `top` = where it leans ──
  const tool = (foot, top, len, kind) => {
    const d = new T.Vector3(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]).normalize();
    const end = [foot[0] + d.x * len, foot[1] + d.y * len, foot[2] + d.z * len];
    const hg = logGeo(len, 0.017, 0.015, rng, { seg: 7, step: 0.2, bend: 0.01, wob: 0.03, caps: true });
    const m = along(foot, end, rng() * 6);
    B.add(grainAlong(hg.side), M.wood, m, [0.7, 0.66, 0.6]); B.add(hg.caps, M.end, m);
    const across = new T.Vector3().crossVectors(d, new T.Vector3(0, 1, 0));
    if (across.lengthSq() < 1e-4) across.set(1, 0, 0);
    across.normalize();
    const side = new T.Vector3().crossVectors(across, d).normalize(); // the way the tool's face looks
    if (kind === 'fork') {
      const tip = [end[0] + d.x * 0.32, end[1] + d.y * 0.32, end[2] + d.z * 0.32];
      B.add(tube([end, [end[0] + d.x * 0.16, end[1] + d.y * 0.16, end[2] + d.z * 0.16], tip], 0.012, 5, false, 6), M.wood, null, [0.7, 0.66, 0.6]);
      const o = across.clone().multiplyScalar(0.045), s0 = [end[0] - d.x * 0.14 + o.x * 0.5, end[1] - d.y * 0.14 + o.y * 0.5, end[2] - d.z * 0.14 + o.z * 0.5];
      B.add(tube([s0, [end[0] + o.x, end[1] + o.y, end[2] + o.z], [tip[0] + o.x * 1.2 - d.x * 0.03, tip[1] + o.y * 1.2 - d.y * 0.03, tip[2] + o.z * 1.2 - d.z * 0.03]], 0.011, 5, false, 6), M.wood, null, [0.68, 0.64, 0.58]);
      for (const k of [-0.1, -0.02]) B.add(new T.TorusGeometry(0.03, 0.005, 4, 10).scale(1.1, 0.7, 1), M.lash, new T.Matrix4().makeBasis(across, side, d).setPosition(end[0] + d.x * k + o.x * 0.45, end[1] + d.y * k + o.y * 0.45, end[2] + d.z * k + o.z * 0.45));
    } else {
      const c = new T.Vector3(...end), hw = 0.28;
      B.add(new T.BoxGeometry(2 * hw, 0.035, 0.03), M.wood, new T.Matrix4().makeBasis(across, d, side).setPosition(c), [0.7, 0.66, 0.6]);
      for (let k = 0; k < 12; k++) {
        const o = -hw + 0.02 + (k / 11) * (2 * hw - 0.04), p = c.clone().addScaledVector(across, o).addScaledVector(side, 0.015);
        B.add(new T.CylinderGeometry(0.006, 0.0045, 0.085, 5).translate(0, 0.04, 0), M.wood, new T.Matrix4().makeBasis(across, side, d.clone().negate()).setPosition(p), [0.74, 0.7, 0.64]);
      }
      for (const s of [-1, 1]) {
        const a = c.clone().addScaledVector(across, s * 0.15), b = c.clone().addScaledVector(d, -0.22);
        B.add(tube([a.toArray(), a.clone().lerp(b, 0.5).toArray(), b.toArray()], 0.007, 4, false, 4), M.wood, null, [0.7, 0.66, 0.6]);
      }
    }
  };
  const at = (x, z, h = 0) => [x, ground(x, z) + h, z];

  // ── the hut (от отуу): a cone of poles thatched with hay, its low door towards the fire, a hay bed inside ──
  const HX = -2.9, HZ = -1.1, HR = 1.35, HH = 2.55, HYAW = Math.atan2(-(FZ - HZ), FX - HX); // door (+X of the hut) to the fire
  {
    const hm = mtx([HX, ground(HX, HZ), HZ], [0, HYAW, 0]);
    const { shell, edges } = hutShell(T, HR, HH, rng);
    stackColors(shell, rng, 0.45); B.add(shell, M.hay, hm);
    edges.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(edges.attributes.position.count * 3).fill(1), 3));
    B.add(edges, M.hay, hm, HAY.map((v) => v * 0.8));
    B.add(strawFringe(shell, 900, 211, { len: 0.36, out: 0.1 }), M.hay, hm);
    // the poles: crossed at the top and standing out of the thatch
    const apex = new T.Vector3(0, HH - 0.12, 0).applyMatrix4(hm);
    for (let k = 0; k < 9; k++) {
      const a = 0.5 + (k / 9) * (Math.PI * 2 - 1.0) + (rng() - 0.5) * 0.15, r = HR - 0.24;
      const f = new T.Vector3(Math.cos(a) * r, -0.15, -Math.sin(a) * r).applyMatrix4(hm);
      const dir = apex.clone().sub(f).normalize(), top = apex.clone().addScaledVector(dir, 0.35 + rng() * 0.25);
      top.x += (rng() - 0.5) * 0.08; top.z += (rng() - 0.5) * 0.08;
      addLog(B, f.toArray(), top.toArray(), 0.032, 0.02, rng, M.wood, M.end, { seg: 6, step: 0.4, bend: 0.01 });
    }
    // the bed: hay spread thick on the floor, a hollow where a mower slept
    B.add(blob(0.75, 0.13, 0.62, rng, { detail: 2, rough: 0.25 }), M.hay, mtx([HX + 0.12 * Math.cos(HYAW + Math.PI), ground(HX, HZ) - 0.03, HZ - 0.12 * Math.sin(HYAW + Math.PI)], [0, HYAW, 0]), HAY.map((v) => v * 0.9));
  }
  colliders.push({ x: HX, z: HZ, r: HR + 0.05 });
  const hutT = proxy(T, object, HR * 1.9, HH, HR * 1.9, [HX, ground(HX, HZ) + HH / 2, HZ], [0, HYAW, 0]);

  let pailT;
  // ── the whetstone (аҕаан) on the seat log, and the birch-bark pail (ыаҕас) of water by its end ──
  {
    const lx0 = FX - 0.9, lz0 = FZ + 0.85, lx1 = FX + 0.7, lz1 = FZ + 1.0, wx = FX - 0.35, k = (wx - lx0) / (lx1 - lx0), wz = lz0 + (lz1 - lz0) * k;
    const top = ground(lx0, lz0) + (ground(lx1, lz1) - ground(lx0, lz0)) * k + 0.13 + 0.15 + (0.13 - 0.15) * k;
    B.add(blob(0.11, 0.016, 0.026, rng, { detail: 1, rough: 0.08 }), M.stone, mtx([wx, top - 0.004, wz], [0, 0.35, 0]), [0.55, 0.55, 0.56]);
    const YX = FX - 1.25, YZ = FZ + 1.35, yg = ground(YX, YZ);
    B.add(lathe([[0, 0.004], [0.125, 0.004], [0.13, 0.01], [0.145, 0.27], [0.15, 0.285], [0.142, 0.286], [0.137, 0.27], [0.122, 0.014], [0, 0.014]], 18), M.birch, mtx([YX, yg, YZ]), [0.8, 0.76, 0.66]);
    for (const y of [0.03, 0.255]) B.add(new T.TorusGeometry(0.13 + y * 0.06, 0.006, 4, 18).rotateX(Math.PI / 2), M.birch, mtx([YX, yg + y, YZ]), [0.62, 0.52, 0.4]);
    B.add(blob(0.135, 0.004, 0.135, rng, { detail: 2, rough: 0.02 }), M.charcoal, mtx([YX, yg + 0.25, YZ]), [1.6, 1.7, 1.8]); // the water, dark in the bark
    B.add(tube([[YX - 0.145, yg + 0.27, YZ], [YX - 0.09, yg + 0.42, YZ + 0.02], [YX + 0.09, yg + 0.42, YZ + 0.02], [YX + 0.145, yg + 0.27, YZ]], 0.006, 4, false, 12), M.lash, null, [0.45, 0.4, 0.36]);
    pailT = proxy(T, object, 0.34, 0.4, 0.34, [YX, yg + 0.2, YZ]);
  }

  // ── the stack begun (кэбиһии): a bed of poles, the stack pole, hay built ~2.4 m up round it in courses; forks and rakes
  //    leaning on the pole, one fork left standing in the hay ──
  const KX2 = 3.3, KZ2 = -1.4, BR = 1.1, KR = 1.0, KH = 2.45, kg = ground(KX2, KZ2);
  for (let k = 0; k < 6; k++) { // the bed: poles laid side by side, keeping the hay off the damp
    const o = (-1 + k * 0.4) * BR + (rng() - 0.5) * 0.08, L = Math.sqrt(BR * BR - o * o * 0.8) + 0.2 + rng() * 0.25;
    const a = [KX2 + o, 0, KZ2 - L], b = [KX2 + o + (rng() - 0.5) * 0.2, 0, KZ2 + L];
    addLog(B, at(a[0], a[2], 0.035), at(b[0], b[2], 0.035), 0.045, 0.038, rng, M.wood, M.end, { seg: 6, step: 0.4, bend: 0 }, jitterTint(rng, 0.08, [0.85, 0.82, 0.78]));
  }
  // the hay built up in forkfuls: three courses, each a little narrower and set a little off the last, loose
  // straw at every rim, and a loose heap trodden round the pole on top where the stacker stands
  for (const [k, [r, h, y, cone]] of [[1, 1.05, 0, 0.12], [0.97, 1, 0.55, 0.14], [0.92, 0.95, 1.1, 0.16], [0.68, 0.6, 1.75, 0.7]].entries()) {
    const { g } = roundStack(KR * r, h, rng, { seg: 32, rings: 12, cone, point: 0 });
    const sm = mtx([KX2 + (rng() - 0.5) * 0.08, kg + 0.02 + y, KZ2 + (rng() - 0.5) * 0.08], [0, rng() * 6.3, 0]);
    B.add(g, M.hay, sm, jitterTint(rng, 0.05, [1, 1, 1])); B.add(strawFringe(g, 260, 213 + k * 7, { len: 0.3, out: 0.12 }), M.hay, sm);
  }
  const pTop = [KX2 + 0.08, kg + 4.6, KZ2 - 0.05];
  addLog(B, [KX2, kg - 0.4, KZ2], pTop, 0.075, 0.04, rng, M.wood, M.end, { seg: 7, step: 0.45, bend: 0.008 });
  colliders.push({ x: KX2, z: KZ2, r: KR + 0.1 });
  const stackT = proxy(T, object, KR * 2, KH, KR * 2, [KX2, kg + KH / 2, KZ2]);
  // leaning on the hay, heads on its shoulder, feet out on the meadow (the tines a little into the hay)
  const onStack = (ang, kind) => {
    const fx = KX2 + Math.cos(ang) * (KR + 0.95), fz = KZ2 + Math.sin(ang) * (KR + 0.95), foot = [fx, ground(fx, fz) + 0.01, fz];
    const top = [KX2 + Math.cos(ang) * 0.88, kg + 1.55, KZ2 + Math.sin(ang) * 0.88];
    const l = Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
    tool(foot, top, kind === 'fork' ? l - 0.18 : l, kind);
  };
  onStack(0.25, 'rake'); onStack(0.62, 'fork'); onStack(-0.4, 'fork');
  { // a fork left standing in the hay by the pole, tines down
    const butt = [KX2 - 0.45, kg + KH + 1.3, KZ2 + 0.7], tip = [KX2 - 0.2, kg + KH - 0.3, KZ2 + 0.32];
    tool(butt, tip, Math.hypot(tip[0] - butt[0], tip[1] - butt[1], tip[2] - butt[2]) - 0.25, 'fork');
  }
  // and two lying back on the hut's thatch by its door
  for (const [da, kind] of [[0.62, 'rake'], [0.85, 'fork']]) {
    const a = HYAW + da, c = [Math.cos(a), -Math.sin(a)], hg = ground(HX, HZ);
    const fx = HX + c[0] * 1.95, fz = HZ + c[1] * 1.95, foot = [fx, ground(fx, fz) + 0.01, fz];
    const top = [HX + c[0] * 0.68, hg + 1.65, HZ + c[1] * 0.68], l = Math.hypot(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]);
    tool(foot, top, kind === 'fork' ? l - 0.25 : l, kind);
  }
  const toolsT = proxy(T, object, 3.6, 3.0, 3.6, [KX2 + 0.6, kg + 1.6, KZ2 + 0.3]);

  // ── the mown strip east: raked windrows drying, and cocks (бугул) raked up from them ──
  for (const [x0, z0, x1, z1] of [[7.2, -6.5, 7.8, 5.5], [9.6, -7, 10.1, 6.2], [12.1, -6.2, 12.4, 5.8]]) {
    B.add(windrow(ground, x0, z0, x1, z1, rng), M.hay, null, jitterTint(rng, 0.08, [2.5, 3.0, 2.0]));
  }
  const cocks = [[5.4, 1.4, 0.64, 1.3], [6.1, -2.6, 0.6, 1.22], [5.3, 4.2, 0.66, 1.34], [8.6, 3.5, 0.58, 1.18]];
  for (const [cx, cz, r, h] of cocks) {
    const { g } = roundStack(r, h, rng, { seg: 20, rings: 10, point: 0.2, cone: 1 });
    const cm = mtx([cx, ground(cx, cz) - 0.02, cz], [0, rng() * 6.3, 0]), ct = jitterTint(rng, 0.08, [0.98, 1.04, 0.96]);
    B.add(g, M.hay, cm, ct); B.add(strawFringe(g, 150, 217 + cx * 10, { len: 0.26, out: 0.1 }), M.hay, cm, ct);
    colliders.push({ x: cx, z: cz, r: r - 0.05 });
  }

  // ── the stack poles: long thin larch poles (stack poles and carrying poles) laid side by side on two sleepers ──
  const SX = 0.6, SZ = -4.2, SA = -0.15;
  const sp = (t, off) => [SX + Math.cos(SA) * t - Math.sin(SA) * off, SZ - Math.sin(SA) * t - Math.cos(SA) * off];
  const SL = [-1.3, 1.3], R0 = 0.08, R1 = 0.075; // the sleepers (along the poles), their radius at either end
  for (const t of SL) { const [a0, a1] = [sp(t, -0.5), sp(t, 0.5)]; addLog(B, [a0[0], ground(...a0) + 0.06, a0[1]], [a1[0], ground(...a1) + 0.06, a1[1]], R0, R1, rng, M.wood, M.end, { seg: 7, bend: 0 }); }
  const sleeperTop = (t, off) => { const k = off + 0.5, [a0, a1] = [sp(t, -0.5), sp(t, 0.5)]; return ground(...a0) + 0.06 + (ground(...a1) - ground(...a0)) * k + R0 + (R1 - R0) * k; };
  // each pole straight from its thick end (t0) to its thin one, its height at the sleepers `at` (axis), radius `r(t)`
  const pole = (off, L, sh, r0, r1, flip) => { const t0 = flip ? L / 2 + sh : -L / 2 + sh, t1 = flip ? -L / 2 + sh : L / 2 + sh; return { off, t0, t1, r: (t) => r0 + (r1 - r0) * (t - t0) / (t1 - t0), at: [] }; };
  const lay = (p) => {
    const y = (t) => p.at[0] + (p.at[1] - p.at[0]) * (t - SL[0]) / (SL[1] - SL[0]);
    let lift = 0; for (let k = 0; k <= 10; k++) { const t = p.t0 + (p.t1 - p.t0) * k / 10, [x, z] = sp(t, p.off); lift = Math.max(lift, ground(x, z) + p.r(t) - y(t)); } // never into the ground past the sleepers
    const [ax, az] = sp(p.t0, p.off), [bx, bz] = sp(p.t1, p.off);
    addLog(B, [ax, y(p.t0) + lift, az], [bx, y(p.t1) + lift, bz], p.r(p.t0), p.r(p.t1), rng, M.wood, M.end, { seg: 6, step: 0.35, bend: 0, wob: 0.03 }); // straight: they lie on each other
  };
  // six side by side on the sleepers, thick ends alternating, each clear of the next; three in the grooves between them
  const low = [];
  for (let k = 0, off = 0; k < 6; k++) {
    const L = 3.6 + rng() * 0.8, p = pole(off, L, (rng() - 0.5) * 0.5, 0.045 + rng() * 0.015, 0.03, k % 2 === 1);
    if (k) { const q = low[k - 1]; p.off = off = q.off + Math.max(...SL.map((t) => q.r(t) + p.r(t))) + 0.006 + rng() * 0.02; }
    low.push(p);
  }
  const mid = (low[0].off + low[5].off) / 2;
  for (const p of low) { p.off -= mid; p.at = SL.map((t) => sleeperTop(t, p.off) + p.r(t)); lay(p); }
  for (let k = 0; k < 3; k++) {
    const a = low[k], b = low[k + 1], p = pole((a.off + b.off) / 2, 3.6 + rng() * 0.8, (rng() - 0.5) * 0.5, 0.04 + rng() * 0.012, 0.028, k % 2 === 0);
    p.at = SL.map((t, i) => Math.max(...[a, b].map((q) => q.at[i] + Math.sqrt(Math.max(0, (q.r(t) + p.r(t)) ** 2 - (q.off - p.off) ** 2)))) + 0.006);
    lay(p);
  }
  colliders.push({ x: SX, z: SZ, hw: 2.1, hd: 0.55, rot: SA });
  const polesT = proxy(T, object, 4.2, 0.5, 1.2, [SX, ground(SX, SZ) + 0.2, SZ], [0, SA, 0]);

  for (const m of B.build(object)) m.castShadow = !/burned/.test(m.name);

  interactables.push({ entry: 'otuu', target: hutT });
  interactables.push({ entry: 'hay-making', target: stackT, label: { sah: 'кэбиһии', en: 'a stack begun', ru: 'начатый стог' } });
  interactables.push({ entry: 'ygas-bucket', target: pailT });
  interactables.push({ entry: 'hay-making', target: toolsT, label: { sah: 'атырдьахтар, кыраабыллар', en: 'hay forks and rakes', ru: 'вилы и грабли' } });
  interactables.push({ entry: 'hay-making', target: polesT, label: { sah: 'кэбиһии мастара', en: 'stack poles', ru: 'жерди для стогов' } });
  interactables.push({ entry: 'otuu', target: kettleT, label: { sah: 'чаанньык', en: 'tea kettle (chaanniyk)', ru: 'чайник' } });

  // trodden ground round the fire, the hut and the stack; the strip east mown; no grass in the hut or under the hay
  object.userData.mown = [{ x: 0.2, z: -0.8, rx: 5.2, rz: 4.2 }, { x: 9.6, z: -0.4, rx: 4.6, rz: 7.6 }];
  object.userData.bare = [{ x: FX, z: FZ, r: 0.6 }, { x: HX, z: HZ, r: HR - 0.1 }, { x: KX2, z: KZ2, r: KR }, ...cocks.map(([x, z, r]) => ({ x, z, r: r * 0.8 }))];
  object.userData.paths = [{ w: 0.9, pts: [[FX + 4, FZ + 1.5], [FX + 0.8, FZ + 0.4], [HX + 1.4, HZ + 0.3]] }, { w: 0.7, pts: [[FX + 0.5, FZ - 0.4], [KX2 - 1.4, KZ2 + 0.4]] }];
  return { object, colliders, floors: [], interactables };
}

// The hut's thatch: a cone of hay (base radius R, height H) with thickness, opened in a low triangular door at +X
// that closes at ~45% of the height. Returns { shell, edges } (edges = the cut faces of the door).
function hutShell(T, R, H, rng) {
  const nz = wobbler(rng, 5), n = 14, seg = 30, TAU = Math.PI * 2, door = 0.95, top = 0.45;
  const gap = (t) => (t < top ? door * (1 - t / top) : 0);
  const prof = []; // [r, y, inner] round the profile loop: outside up, inside down
  for (let i = 0; i <= n; i++) { const t = i / n; prof.push([R * Math.pow(1 - t, 0.82) * (1 + 0.06 * Math.sin(t * Math.PI)) + 0.04 + (i === 0 ? 0.05 : 0), H * t - (i === 0 ? 0.06 : 0), t, false]); }
  for (let i = n; i >= 0; i--) { const t = i / n, [ro, y] = prof[i]; prof.push([Math.max(0, ro - 0.2 * (1 - t) - 0.06), y - 0.08, t, true]); }
  const pos = [], uvs = [], idx = [], P = (k, j) => k * (seg + 1) + j;
  const point = (k, j) => {
    const [r, y, t] = prof[k], g = gap(t), a = g / 2 + (TAU - g) * j / seg;
    const d = 1 + 0.07 * nz(a * 2, t * 4) + 0.03 * Math.sin(a * 23 + t * 19) + 0.02 * Math.sin(a * 61 - t * 37);
    return [Math.cos(a) * r * d, y, -Math.sin(a) * r * d, a];
  };
  for (let k = 0; k < prof.length; k++) for (let j = 0; j <= seg; j++) { const [x, y, z, a] = point(k, j); pos.push(x, y, z); uvs.push(a * R, y * 1.2); }
  for (let k = 0; k < prof.length - 1; k++) for (let j = 0; j < seg; j++) idx.push(P(k, j), P(k, j + 1), P(k + 1, j), P(k, j + 1), P(k + 1, j + 1), P(k + 1, j));
  const shell = new T.BufferGeometry();
  shell.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  shell.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  shell.setIndex(idx); shell.computeVertexNormals();
  // the outside must face out
  { const nn = shell.attributes.normal, i = P(Math.floor(n / 3), seg / 2), [x, , z] = point(Math.floor(n / 3), seg / 2); if (nn.getX(i) * x + nn.getZ(i) * z < 0) { for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]]; shell.setIndex(idx); shell.computeVertexNormals(); } }
  // the door's cut faces: between the outside and inside rows at either edge
  const ep = [], eu = [], ei = [], N = prof.length - 1;
  for (const [j, w] of [[0, 1], [seg, -1]]) {
    for (let i = 0; i < n; i++) {
      if (gap(i / n) <= 0) break;
      const o0 = point(i, j), o1 = point(i + 1, j), i0 = point(N - i, j), i1 = point(N - i - 1, j), b = ep.length / 3;
      for (const q of [o0, o1, i1, i0]) { ep.push(q[0], q[1], q[2]); eu.push(Math.hypot(q[0], q[2]), q[1]); }
      if (w > 0) ei.push(b, b + 1, b + 2, b, b + 2, b + 3); else ei.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
  }
  const edges = new T.BufferGeometry();
  edges.setAttribute('position', new T.Float32BufferAttribute(ep, 3));
  edges.setAttribute('uv', new T.Float32BufferAttribute(eu, 2));
  edges.setIndex(ei); edges.computeVertexNormals();
  return { shell, edges };
}

// invisible ray target
function proxy(T, root, w, h, d, p, r = [0, 0, 0]) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ visible: false }));
  m.position.set(...p); m.rotation.set(...r); m.castShadow = false;
  root.add(m);
  return m;
}
