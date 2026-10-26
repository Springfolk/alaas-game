// Props for the everyday hands-on chores (logic in src/interact/): the wooden water pail (мас ыаҕас)
// by the uraha door, a pool of split firewood billets taken from the woodpile, the woodpile's look-at
// box, and wild-strawberry (дьэдьэн) patches on the dry meadow around the homestead.
// Placed at the homestead centre (HOME); everything that moves is reparented to the scene by
// src/interact/index.js, which finds the parts in `object.userData.chores`.
import { Bucket, boxUV, lathe, tube, splitGeo, jitterTint } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { DOOR } from './urasa/frame.js';
import { PLACEMENTS } from '../world/layout.js';
import { HOME } from '../world/terrain.js';

const LOGS = 6; // billets that can be out of the woodpile at once (oldest is reused)
const WOODPILE = [-6.5, -11, 0.12]; // matches yardlife's PLACES.woodpile (local to HOME)
const PAIL_AT = [PLACEMENTS.find((p) => p.model === 'urasa').x - HOME.x + DOOR.r + 0.45, 1.35]; // by the uraha door
// дьэдьэн patches (local x, z): sunny, dry ground off the paths
const BERRIES = [[-9, 13], [-4.5, 25], [13.5, 27.5], [-14, 20.5], [19, 34], [-1.5, 37], [-14, -9], [18.5, -14.5]];

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'chores';
  const interactables = [];
  const hidden = new T.MeshBasicMaterial({ visible: false });
  const proxy = (w, h, d, x, y, z, yaw = 0) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), hidden);
    m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = false; m.receiveShadow = false;
    object.add(m);
    return m;
  };

  // ── the water pail (мас ыаҕас): coopered larch staves, two willow hoops, a rawhide-rope handle ──
  const pail = new T.Group(); pail.name = 'pail';
  {
    const B = new Bucket(() => 0);
    const H = 0.3, R0 = 0.125, R1 = 0.15, W = 0.012;
    // one surface: outside up, over the rim, down the inside to the floor
    B.add(lathe([[R0, 0.0], [R0 + (R1 - R0) * 0.5, H * 0.5], [R1, H], [R1 - W, H + 0.004], [R1 - W - 0.002, H * 0.5], [R0 - W, 0.035], [R0 - W - 0.004, 0.035]], 28, rng, 0.012), M.fresh, null, [0.92, 0.86, 0.78]);
    // the floor: a disc with flat uvs in metres (lathed to the axis, its grain pinched into a wedge at the middle)
    const fl = new T.CircleGeometry(R0 - W + 0.001, 28).rotateX(-Math.PI / 2).translate(0, 0.0352, 0);
    { const fp = fl.attributes.position, fu = fl.attributes.uv; for (let i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i), fp.getZ(i)); }
    B.add(fl, M.fresh, null, [0.8, 0.74, 0.66]);
    B.add(new T.CircleGeometry(R0, 20).rotateX(Math.PI / 2), M.darkwood); // the underside
    for (const [y, r] of [[0.06, R0 + (R1 - R0) * 0.2 + 0.004], [H - 0.05, R1 - (R1 - R0) * 0.17 + 0.004]]) {
      B.add(new T.TorusGeometry(r, 0.008, 5, 36).rotateX(Math.PI / 2).translate(0, y, 0), M.lash);
    }
    // the handle: lugs on two staves, a rope arching over
    for (const s of [-1, 1]) B.add(boxUV(new T.BoxGeometry(0.03, 0.07, 0.02).translate(0, H + 0.02, s * (R1 - 0.004))), M.fresh); // uv in metres, not 0…1 per face
    B.add(tube([[0, H + 0.04, -R1], [0, H + 0.2, -R1 * 0.75], [0, H + 0.27, 0], [0, H + 0.2, R1 * 0.75], [0, H + 0.04, R1]], 0.007, 5), M.rope);
    for (const m of B.build(pail)) m.castShadow = true;
    // water, shown when filled (built now so its shader is warmed with the rest)
    const water = new T.Mesh(new T.CircleGeometry(R1 - W - 0.0015, 28).rotateX(-Math.PI / 2),
      new T.MeshStandardNodeMaterial({ color: 0x24302c, roughness: 0.04, metalness: 0 }));
    water.position.y = H - 0.05; water.visible = false; water.castShadow = false; water.name = 'pail-water';
    pail.add(water);
    pail.userData.water = water;
  }
  pail.position.set(PAIL_AT[0], ground(...PAIL_AT), PAIL_AT[1]);
  pail.rotation.y = 0.6;
  object.add(pail);
  interactables.push({ entry: 'mas-yagas', target: pail, take: 'pail', label: { sah: 'мас ыаҕас', en: 'wooden water pail (мас ыаҕас)', ru: 'деревянное ведро (мас ыаҕас)' } });

  // ── firewood billets: split larch, built along +Y (base at 0), hidden until taken from the pile ──
  const logs = [];
  for (let i = 0; i < LOGS; i++) {
    const g = new T.Group(); g.name = 'billet';
    const B = new Bucket(() => 0);
    const pc = splitGeo(0.48 + rng() * 0.06, 0.07 + rng() * 0.02, Math.PI * (0.55 + rng() * 0.3), rng);
    const t = jitterTint(rng, 0.12);
    B.add(pc.bark, M.bark, null, t); B.add(pc.split, M.split, null, t); B.add(pc.ends, M.endFresh, null, t);
    B.build(g);
    g.visible = false;
    object.add(g);
    logs.push(g);
    interactables.push({ target: g, take: 'log', off: true, label: { sah: 'оттук мас', en: 'firewood', ru: 'дрова' } });
  }

  // ── the woodpile (built by yardlife): a box to look at, where billets come from ──
  const [wx, wz, wyaw] = WOODPILE;
  const pile = proxy(2.9, 1.45, 0.7, wx, ground(wx, wz) + 0.72, wz, wyaw);
  pile.name = 'woodpile';
  interactables.push({ entry: 'ottuk-mas', target: pile, take: 'woodpile', label: { sah: 'кыстаммыт мас', en: 'the woodpile', ru: 'поленница' } });

  // ── дьэдьэн: trefoil leaves on stalks and tiny red berries hanging below them, instanced per patch ──
  const leafGeo = strawberryLeaf(T), berryGeo = strawberryBerry(T);
  const leafMat = new T.MeshStandardNodeMaterial({ color: 0x3d6428, roughness: 0.75, side: T.DoubleSide, vertexColors: true });
  const berryMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.32, vertexColors: true });
  const LEAVES = 24, PER = 18;
  const leaves = new T.InstancedMesh(leafGeo, leafMat, BERRIES.length * LEAVES);
  const berries = new T.InstancedMesh(berryGeo, berryMat, BERRIES.length * PER);
  leaves.name = 'dyedyen-leaves'; berries.name = 'dyedyen';
  leaves.castShadow = false; berries.castShadow = false;
  const berryM = []; // per patch: the berries' full matrices
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
  let li = 0, bi = 0;
  const mown = [];
  BERRIES.forEach(([cx, cz], k) => {
    for (let j = 0; j < LEAVES; j++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.32;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      // one trefoil: its stalk (built down to y = -STALK) stands on the ground
      const k = 0.75 + rng() * 0.6;
      e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3, 'YXZ');
      p.set(x, ground(x, z) + STALK * k - 0.005, z);
      leaves.setMatrixAt(li++, m4.compose(p, q.setFromEuler(e), s.setScalar(k)));
    }
    const list = [];
    for (let j = 0; j < PER; j++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.3;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      p.set(x, ground(x, z) + 0.012 + rng() * 0.035, z); // hanging low under the leaves, as they grow
      e.set((rng() - 0.5) * 0.6, rng() * Math.PI * 2, (rng() - 0.5) * 0.6);
      s.setScalar(0.75 + rng() * 0.5);
      const mm = new T.Matrix4().compose(p, q.setFromEuler(e), s);
      berries.setMatrixAt(bi, mm);
      list.push([bi++, mm]);
    }
    berryM.push(list);
    const t = proxy(0.75, 0.25, 0.75, cx, ground(cx, cz) + 0.1, cz);
    t.name = 'dyedyen-patch';
    interactables.push({ entry: 'dyedyen', target: t, berries: k, label: { sah: 'дьэдьэн', en: 'wild strawberries (дьэдьэн)', ru: 'земляника (дьэдьэн)' } });
    mown.push({ x: cx, z: cz, rx: 0.65, rz: 0.65 }); // grass kept short so the patch shows
  });
  leaves.instanceMatrix.needsUpdate = true; berries.instanceMatrix.needsUpdate = true;
  leaves.computeBoundingSphere(); berries.computeBoundingSphere();
  object.add(leaves, berries);
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  // k: patch, n: how many berries stay (0 … PER)
  const setPatch = (k, n) => {
    berryM[k].forEach(([i, mm], j) => berries.setMatrixAt(i, j < n ? mm : zero));
    berries.instanceMatrix.needsUpdate = true;
  };

  object.userData.mown = mown;
  object.userData.chores = { pail, logs, pile, setPatch, perPatch: PER };
  return { object, colliders: [], floors: [], interactables };
}

// A strawberry trefoil (Fragaria): three obovate, coarsely toothed leaflets, ~4 × 2.7 cm, folded a little
// along the midrib, on a thin stalk running down to y = -STALK. Vertex colours: darker, glossy-green tops.
const STALK = 0.085;
function strawberryLeaf(T) {
  const pos = [], col = [], idx = [];
  const L = 0.04, W = 0.0135, TEETH = 5;
  const leaflet = (yaw, tilt) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), base = pos.length / 3;
    const put = (x, z, g) => {
      const y = Math.abs(x) * 0.35 + z * Math.sin(tilt);           // V-fold along the midrib, raised outward
      const zz = z * Math.cos(tilt) + 0.004;
      pos.push(x * c + zz * sn, y, -x * sn + zz * c); col.push(0.5 * g, 0.62 * g, 0.42 * g);
    };
    put(0, L * 0.45, 1);                                              // fan centre
    const edge = [];
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= TEETH * 2; i++) {
        const u = i / (TEETH * 2);
        let w = W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.92 + 0.04)), 0.7) * (0.75 + 0.5 * u * (1 - u) * 2);
        if (u > 0.25 && i % 2 === 1) w *= 1.14;                       // the teeth
        else if (u > 0.25) w *= 0.94;
        pts.push([side * w, L * u]);
      }
      edge.push(side > 0 ? pts : pts.reverse());
    }
    const ring = [...edge[0], ...edge[1].slice(1)];
    for (const [x, z] of ring) put(x, z, 0.85 + 0.15 * (z / L));
    for (let i = 1; i < ring.length; i++) idx.push(base, base + i, base + i + 1);
    idx.push(base, base + ring.length, base + 1);                   // close the base
  };
  for (const [yaw, tilt] of [[0, 0.15], [1.05, 0.05], [-1.05, 0.05]]) leaflet(yaw, tilt);
  // the stalk: two crossed thin strips down to the ground, bending a little
  for (const a of [0, Math.PI / 2]) {
    const b = pos.length / 3, dx = Math.cos(a) * 0.0012, dz = Math.sin(a) * 0.0012;
    for (const [y, o] of [[0.002, 0], [-STALK * 0.5, 0.006], [-STALK, 0.004]]) {
      pos.push(-dx + o, y, -dz, dx + o, y, dz); col.push(0.5, 0.55, 0.35, 0.5, 0.55, 0.35);
    }
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3, b + 2, b + 4, b + 3, b + 3, b + 4, b + 5);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A wild strawberry: tiny (about 1–1.5 cm), conical, hanging tip-down from a green calyx on a thin
// stalk that rises ~3 cm towards the leaves. Origin = the berry's centre.
function strawberryBerry(T) {
  const R = 0.006;
  const berry = new T.SphereGeometry(R, 6, 5); // 1–1.5 cm
  const bp = berry.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i) / R, w = 1 - 0.45 * Math.max(0, -y); // -1 tip … 1 calyx
    bp.setXYZ(i, bp.getX(i) * w, bp.getY(i) * 1.3, bp.getZ(i) * w);
  }
  berry.computeVertexNormals();
  const parts = [[berry.toNonIndexed(), [0.45, 0.008, 0.014]]];
  // calyx: five sepals spread flat over the shoulder
  const sep = [];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, a1 = a + 0.3, a2 = a - 0.3, y = R * 1.25;
    sep.push(0, y + 0.001, 0, Math.cos(a1) * R * 0.5, y, Math.sin(a1) * R * 0.5, Math.cos(a) * R * 1.4, y - 0.002, Math.sin(a) * R * 1.4);
    sep.push(0, y + 0.001, 0, Math.cos(a) * R * 1.4, y - 0.002, Math.sin(a) * R * 1.4, Math.cos(a2) * R * 0.5, y, Math.sin(a2) * R * 0.5);
  }
  const calyx = new T.BufferGeometry();
  calyx.setAttribute('position', new T.Float32BufferAttribute(sep, 3));
  calyx.computeVertexNormals();
  parts.push([calyx, [0.04, 0.09, 0.02]]);
  const stem = new T.CylinderGeometry(0.0006, 0.0008, 0.032, 3, 1, true).translate(0.003, R * 1.25 + 0.016, 0).toNonIndexed();
  stem.rotateZ(0.2);
  parts.push([stem, [0.09, 0.13, 0.04]]);
  const pos = [], nor = [], col = [];
  for (const [g, c] of parts) {
    const a = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(...c); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return g;
}
