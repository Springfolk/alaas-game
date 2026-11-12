// The hay crew's base by the winter place (кыстык), at the edge of its hay meadows: a fire ring of stones with
// cold ashes and charred ends, the soot-black tea kettle (чаанньык) on its hook pole, a log to sit on, the wooden
// hay forks (атырдьах) and rakes (кыраабыл) leaning on a rail between two forked stakes, and the long poles for the stacks
// laid on two sleepers. The scythe post stands beside it (src/models/hayfield.js). Local frame: +X east.
import { Bucket, addLog, logGeo, lathe, tube, blob, mtx, along, patchGeo, decalMat, jitterTint } from './yardlife/kit.js';
import { grainAlong } from './yardlife/forged.js';
import { yardMats } from './yardlife/mats.js';

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'haybase';
  const interactables = [], colliders = [];
  const B = new Bucket(ground);

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

  // ── the kettle (чаанньык): squat, soot-black below, a domed lid with a knob, a spout and a wire bail; on the
  //    stones at the fire's edge, put down cold after the last tea ──
  const kettle = (x, z, yaw) => {
    const y = ground(x, z) + 0.035;
    const body = lathe([[0, 0], [0.085, 0.004], [0.1, 0.03], [0.104, 0.075], [0.096, 0.12], [0.07, 0.145], [0.055, 0.152], [0.054, 0.158]], 22);
    B.add(body, M.soot, mtx([x, y, z], [0, yaw, 0]), [1, 1, 1]);
    B.add(lathe([[0.056, 0], [0.05, 0.012], [0.03, 0.022], [0.012, 0.026], [0.012, 0.04], [0, 0.042]], 16), M.iron, mtx([x, y + 0.155, z], [0, yaw, 0]), [0.55, 0.52, 0.5]);
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    B.add(tube([P(0.09, 0.05, 0), P(0.14, 0.08, 0), P(0.175, 0.13, 0), P(0.19, 0.155, 0)], 0.014, 7, false, 10), M.soot, null, [1, 1, 1]);
    const bail = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); bail.push(P(0, 0.15 + Math.sin(a) * 0.11, Math.cos(a) * 0.098)); }
    B.add(tube(bail, 0.003, 4, false, 18), M.iron, null, [0.6, 0.58, 0.55]);
  };
  kettle(FX + 0.4, FZ - 0.3, 0.6);
  const kettleT = proxy(T, object, 0.32, 0.26, 0.28, [FX + 0.42, ground(FX + 0.4, FZ - 0.3) + 0.12, FZ - 0.3]);

  // ── a log to sit on, and two birch-bark cups on it ──
  addLog(B, [FX - 0.9, ground(FX - 0.9, FZ + 0.85) + 0.13, FZ + 0.85], [FX + 0.7, ground(FX + 0.7, FZ + 1.0) + 0.13, FZ + 1.0], 0.15, 0.13, rng, M.wood, M.end, { seg: 10, step: 0.3 });
  colliders.push({ x: FX - 0.1, z: FZ + 0.93, hw: 0.82, hd: 0.17, rot: -0.09 });
  for (const [cx, cz] of [[FX + 0.25, FZ + 0.96], [FX + 0.4, FZ + 0.99]]) {
    const cy = ground(cx, cz) + 0.27;
    B.add(lathe([[0, 0], [0.034, 0], [0.04, 0.055], [0.037, 0.056], [0.031, 0.004], [0, 0.004]], 12), M.birch, mtx([cx, cy, cz]), [0.95, 0.92, 0.85]);
  }

  // ── the rail for forks and rakes: two forked stakes and a pole across their forks ──
  const RX = 2.6, RZ = -1.6, RA = 0.25; // rail centre and its turn
  const ra = [Math.cos(RA), -Math.sin(RA)], rp = (t, off = 0) => [RX + ra[0] * t - ra[1] * off, RZ + ra[1] * t + ra[0] * off];
  const railY = 1.32;
  for (const t of [-1.2, 1.2]) {
    const [x, z] = rp(t), gy = ground(x, z);
    addLog(B, [x, gy - 0.3, z], [x, gy + railY + 0.04, z], 0.045, 0.038, rng, M.wood, M.end, { seg: 7 });
    addLog(B, [x, gy + railY - 0.08, z], [x + 0.06, gy + railY + 0.16, z + 0.05], 0.022, 0.018, rng, M.wood, M.end, { seg: 5 });
    colliders.push({ x, z, r: 0.1 });
  }
  { const [cx, cz] = rp(0, 0.42); colliders.push({ x: cx, z: cz, hw: 1.5, hd: 0.52, rot: RA }); } // the rail and the tools leaning on it: walked round, not through
  const [ax, az] = rp(-1.45), [bx, bz] = rp(1.45);
  addLog(B, [ax, ground(ax, az) + railY + 0.04, az], [bx, ground(bx, bz) + railY + 0.04, bz], 0.035, 0.03, rng, M.wood, M.end, { seg: 7, step: 0.3 });
  // forks (атырдьах): a straight haft that splits into two long tines, bound below the fork; rakes: a head
  // with a row of wooden teeth on a long haft. Both lean on the rail, heads up, their feet out on the meadow side.
  const lean = (t, h, len, kind) => {
    const [x, z] = rp(t), top = [x, ground(x, z) + railY + 0.07, z];
    const [fx, fz] = rp(t + (rng() - 0.5) * 0.2, 0.75 + rng() * 0.15), foot = [fx, ground(fx, fz) + 0.01, fz];
    const d = new T.Vector3(top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]).normalize();
    const end = [foot[0] + d.x * len, foot[1] + d.y * len, foot[2] + d.z * len];
    const hg = logGeo(len, 0.017, 0.015, rng, { seg: 7, step: 0.2, bend: 0.01, wob: 0.03, caps: true });
    const m = along(foot, end, rng() * 6);
    B.add(grainAlong(hg.side), M.wood, m, [0.7, 0.66, 0.6]); B.add(hg.caps, M.end, m);
    const across = new T.Vector3(-ra[1], 0, ra[0]).cross(d).normalize(); // along the rail, square to the haft
    const side = new T.Vector3().crossVectors(across, d).normalize();      // the way the tool's face looks
    if (kind === 'fork') {
      // the haft's own pointed end is one tine; a pointed branch of ~30 cm is bound beside it with willow
      // (the атырдьах as the dictionary describes it: dry larch, the second tine tied on parallel)
      const tip = [end[0] + d.x * 0.32, end[1] + d.y * 0.32, end[2] + d.z * 0.32];
      B.add(tube([end, [end[0] + d.x * 0.16, end[1] + d.y * 0.16, end[2] + d.z * 0.16], tip], 0.012, 5, false, 6), M.wood, null, [0.7, 0.66, 0.6]);
      const o = across.clone().multiplyScalar(0.045), s0 = [end[0] - d.x * 0.14 + o.x * 0.5, end[1] - d.y * 0.14 + o.y * 0.5, end[2] - d.z * 0.14 + o.z * 0.5];
      B.add(tube([s0, [end[0] + o.x, end[1] + o.y, end[2] + o.z], [tip[0] + o.x * 1.2 - d.x * 0.03, tip[1] + o.y * 1.2 - d.y * 0.03, tip[2] + o.z * 1.2 - d.z * 0.03]], 0.011, 5, false, 6), M.wood, null, [0.68, 0.64, 0.58]);
      for (const k of [-0.1, -0.02]) B.add(new T.TorusGeometry(0.03, 0.005, 4, 10).scale(1.1, 0.7, 1), M.lash, new T.Matrix4().makeBasis(across, side, d).setPosition(end[0] + d.x * k + o.x * 0.45, end[1] + d.y * k + o.y * 0.45, end[2] + d.z * k + o.z * 0.45));
    } else {
      // the rake's head: a bar 55 cm across with 12 teeth on its far side, two braces from the haft
      const c = new T.Vector3(...end), hw = 0.28;
      const bar = new T.BoxGeometry(2 * hw, 0.035, 0.03);
      B.add(bar, M.wood, new T.Matrix4().makeBasis(across, d, side).setPosition(c), [0.7, 0.66, 0.6]);
      for (let k = 0; k < 12; k++) {
        const o = -hw + 0.02 + (k / 11) * (2 * hw - 0.04), p = c.clone().addScaledVector(across, o).addScaledVector(side, 0.015);
        B.add(new T.CylinderGeometry(0.006, 0.0045, 0.085, 5).translate(0, 0.04, 0), M.wood, new T.Matrix4().makeBasis(across, side, d.clone().negate()).setPosition(p), [0.74, 0.7, 0.64]);
      }
      for (const s of [-1, 1]) {
        const a = c.clone().addScaledVector(across, s * 0.15), b = c.clone().addScaledVector(d, -0.22);
        B.add(tube([a.toArray(), a.clone().lerp(b, 0.5).toArray(), b.toArray()], 0.007, 4, false, 4), M.wood, null, [0.7, 0.66, 0.6]);
      }
    }
    return end;
  };
  const tools = [[-0.95, 'fork'], [-0.55, 'rake'], [-0.2, 'fork'], [0.2, 'rake'], [0.55, 'fork'], [0.95, 'rake']];
  for (const [t, kind] of tools) lean(t, railY, kind === 'fork' ? 1.75 + rng() * 0.15 : 1.95 + rng() * 0.15, kind);
  const toolsT = proxy(T, object, 2.9, 1.8, 1.2, [...rp(0, 0.35).slice(0, 1), ground(RX, RZ) + 0.9, rp(0, 0.35)[1]], [0, RA, 0]);

  // ── the stack poles: long thin larch poles (stack poles and carrying poles) laid side by side on two sleepers ──
  const SX = -1.4, SZ = -2.6, SA = -0.15;
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

  interactables.push({ entry: 'hay-making', target: toolsT, label: { sah: 'атырдьахтар, кыраабыллар', en: 'hay forks and rakes', ru: 'вилы и грабли' } });
  interactables.push({ entry: 'hay-making', target: polesT, label: { sah: 'кэбиһии мастара', en: 'stack poles', ru: 'жерди для стогов' } });
  interactables.push({ entry: 'otuu', target: kettleT, label: { sah: 'чаанньык', en: 'tea kettle (chaanniyk)', ru: 'чайник' } });

  // trodden ground round the fire and from it to the rail and the poles; the grass short where the crew sat
  object.userData.mown = [{ x: 0.6, z: -0.4, rx: 3.2, rz: 2.6 }];
  object.userData.bare = [{ x: FX, z: FZ, r: 0.6 }];
  object.userData.paths = [{ w: 0.9, pts: [[FX + 4, FZ + 1.5], [FX + 0.8, FZ + 0.4], [RX, RZ + 0.6]] }];
  return { object, colliders, floors: [], interactables };
}

// invisible ray target
function proxy(T, root, w, h, d, p, r = [0, 0, 0]) {
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ visible: false }));
  m.position.set(...p); m.rotation.set(...r); m.castShadow = false;
  root.add(m);
  return m;
}
