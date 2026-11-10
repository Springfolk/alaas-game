// The mowing place at the edge of the uncut hay meadow (logic: src/interact/work/hay.js): a forked post with the
// old Sakha scythe (саха хотуура) hung on it, and the cut grass that will lie in the swaths (instanced, shown
// as the mower goes). The scythe after the museum pieces described in docs/content.md (`hay-making`): an iron
// blade about 75 cm long and two fingers wide, curved, set at an open angle on a straight handle of about
// 73 cm whose end bends a fist's length for the left hand and is wrapped in birch bark.
import { Bucket, addLog, boxUV, logGeo, mtx } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';

export const SCYTHE = { handle: 0.73, blade: 0.75 }; // the handle along +Y from the grip's end; the blade runs on from its top towards +X
const SWATH = 360;

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'hayfield';
  const interactables = [], colliders = [];

  // ── the post: a larch stake with a fork, its foot trodden bare ──
  const B = new Bucket(ground);
  const g0 = ground(0, 0);
  addLog(B, [0, g0 - 0.4, 0], [0.03, g0 + 1.5, 0.02], 0.055, 0.045, rng, M.wood, M.end, { seg: 8 });
  addLog(B, [0.02, g0 + 1.22, 0.01], [0.2, g0 + 1.52, 0.06], 0.03, 0.022, rng, M.wood, M.end, { seg: 6, step: 0.2 });
  for (const m of B.build(object)) m.castShadow = true;
  colliders.push({ x: 0, z: 0, r: 0.12 });

  // ── the scythe ──
  const scythe = new T.Group(); scythe.name = 'khotuur';
  {
    const S = new Bucket(() => -1);
    const H = SCYTHE.handle;
    // the handle: straight, swelling at the grip's end, which turns a fist's length aside
    const h = logGeo(H, 0.017, 0.015, rng, { seg: 8, step: 0.1, bend: 0.006, wob: 0.03, caps: true });
    S.add(h.side, M.fresh, null, [0.66, 0.56, 0.44]); S.add(h.caps, M.end, null, [0.7, 0.6, 0.5]);
    const grip = logGeo(0.11, 0.019, 0.021, rng, { seg: 8, step: 0.05, caps: true });
    const gm = mtx([0, 0.012, 0], [0, 0, Math.PI / 2 + 0.5]);
    S.add(grip.side, M.birch, gm, [0.86, 0.78, 0.62]); S.add(grip.caps, M.end, gm); // wrapped in a thin layer of birch bark
    // the blade: a curved strip, thick at the spine, the edge on the inside of the curve; a tang bound on with willow
    const L = SCYTHE.blade, N = 18, pos = [], uv = [], idx = [], col = [];
    const a0 = 0.72; // the blade leaves the handle's line by this much (an open angle of about 140°)
    for (let i = 0; i <= N; i++) {
      const t = i / N, bend = a0 + t * 0.55; // curving on towards the point
      // integrate the centre line
      const ang = bend, w = 0.028 * (1 - 0.75 * t ** 2.2) + 0.004; // two fingers wide, narrowing to the point
      const x = (i ? pos[(i - 1) * 12] : 0), y = (i ? pos[(i - 1) * 12 + 1] : H);
      const nx = i ? x + Math.sin(ang) * L / N : 0, ny = i ? y + Math.cos(ang) * L / N : H;
      const ex = Math.cos(ang), ey = -Math.sin(ang); // across the blade, towards the edge (inside of the curve)
      for (const [o, z, c] of [[0, 0.0022, 0.55], [0, -0.0022, 0.55], [w, 0.0003, 1.5], [w, -0.0003, 1.5]]) {
        pos.push(nx + ex * o, ny + ey * o, z); uv.push(t * L * 3, o * 3); col.push(c, c, c * 1.02);
      }
    }
    for (let i = 0; i < N; i++) { const a = i * 4, b = a + 4; idx.push(a, b, a + 2, a + 2, b, b + 2, a + 1, a + 3, b + 1, b + 1, a + 3, b + 3, a, a + 1, b, b, a + 1, b + 1); }
    const blade = new T.BufferGeometry();
    blade.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); blade.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); blade.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    blade.setIndex(idx); blade.computeVertexNormals();
    S.add(blade, M.iron, null);
    for (const y of [H - 0.02, H - 0.055, H - 0.09]) S.add(new T.TorusGeometry(0.02, 0.004, 4, 12).rotateX(Math.PI / 2), M.lash, mtx([0, y, 0]));
    S.add(boxUV(new T.BoxGeometry(0.008, 0.05, 0.012), 8), M.end, mtx([-0.014, H - 0.03, 0]), [0.6, 0.5, 0.42]); // the wedge (ытаһа)
    for (const m of S.build(scythe)) m.castShadow = true;
    scythe.userData.tip = new T.Vector3(pos[N * 12], pos[N * 12 + 1], 0);
  }
  // hung in the fork, the blade over it, the handle down along the post
  scythe.position.set(0.1, g0 + 1.4 - SCYTHE.handle, 0.07);
  scythe.rotation.set(0, -0.3, 0.06);
  scythe.userData.dynamic = true;
  object.add(scythe);
  interactables.push({ target: scythe, khotuur: true, entry: 'hay-making', label: { sah: 'саха хотуура', en: 'Sakha scythe (саха хотуура)', ru: 'якутская коса (саха хотуура)' } });
  const hidden = new T.MeshBasicMaterial({ visible: false });
  const post = new T.Mesh(new T.BoxGeometry(0.3, 1.5, 0.3), hidden);
  post.position.set(0, g0 + 0.75, 0); post.castShadow = false; object.add(post);
  interactables.push({ target: post, rack: true, entry: 'hay-making', label: { sah: 'хотуур баҕаната', en: 'the scythe post', ru: 'столб для косы' } });

  // ── cut grass: a flat wisp of a dozen blades, laid where the scythe went ──
  const wisp = (() => {
    const pos = [], col = [], idx = [];
    for (let b = 0; b < 12; b++) {
      const len = 0.38 + rng() * 0.3, o = (rng() - 0.5) * 0.16, a = (rng() - 0.5) * 0.5, y = 0.012 + rng() * 0.05, w = 0.006 + rng() * 0.004, s = (rng() - 0.5) * 0.3;
      const dx = Math.cos(a), dz = Math.sin(a), k = pos.length / 3, g = 0.7 + rng() * 0.5;
      for (const [t, lift] of [[0, 0], [0.5, 0.012 * (rng() - 0.3)], [1, 0]]) {
        const cx = s + dx * len * t, cz = o + dz * len * t, ww = w * (1 - t * 0.8);
        pos.push(cx - dz * ww, y + lift, cz + dx * ww, cx + dz * ww, y + lift, cz - dx * ww);
        const c = [0.24 * g, 0.3 * g, 0.1 * g]; col.push(...c, ...c);
      }
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3, k + 2, k + 4, k + 3, k + 3, k + 4, k + 5);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // lit as the ground is
    return g;
  })();
  const swath = new T.InstancedMesh(wisp, new T.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: T.DoubleSide }), SWATH);
  swath.material.name = 'cut-grass';
  swath.name = 'swath'; swath.castShadow = false; swath.frustumCulled = false;
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SWATH; i++) swath.setMatrixAt(i, zero);
  swath.instanceMatrix.setUsage(T.DynamicDrawUsage);
  swath.userData.dynamic = true;
  object.add(swath);

  object.userData.mown = [{ x: 0, z: 0, rx: 1.3, rz: 1.3 }];
  object.userData.work = { job: 'hay', object, scythe, swath, max: SWATH };
  return { object, colliders, floors: [], interactables };
}
