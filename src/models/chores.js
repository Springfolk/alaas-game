// Props for the everyday hands-on chores (logic in src/interact/): the wooden water pail (мас ыаҕас)
// by the uraha door, a pool of split firewood billets taken from the woodpile, the woodpile's look-at
// box, and the wild-strawberry (дьэдьэн) carpets (chores/dyedyen.js).
// Placed at the homestead centre (HOME); everything that moves is reparented to the scene by
// src/interact/index.js, which finds the parts in `object.userData.chores`.
import { Bucket, boxUV, lathe, tube, splitGeo, jitterTint } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { buildDyedyen } from './chores/dyedyen.js';
import { DOOR } from './urasa/frame.js';
import { PLACEMENTS } from '../world/layout.js';
import { HOME } from '../world/terrain.js';

const LOGS = 6; // billets that can be out of the woodpile at once (oldest is reused)
const WOODPILE = [-6.5, -11, 0.12]; // matches yardlife's PLACES.woodpile (local to HOME)
const PAIL_AT = [PLACEMENTS.find((p) => p.model === 'urasa').x - HOME.x + DOOR.r + 0.45, 1.35]; // by the uraha door

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
    // the water running out of the tipped pail: a thin falling strand from the rim (placed and stretched by src/interact/hands.js)
    const stream = new T.Mesh(new T.CylinderGeometry(0.009, 0.02, 1, 7, 1, true).translate(0, -0.5, 0), water.material);
    stream.visible = false; stream.castShadow = false; stream.name = 'pail-stream'; stream.userData.dynamic = true;
    object.add(stream);
    pail.userData.stream = stream; pail.userData.rim = [R1 - W, H];
  }
  pail.position.set(PAIL_AT[0], ground(...PAIL_AT), PAIL_AT[1]);
  pail.rotation.y = 0.6;
  object.add(pail);
  interactables.push({ entry: 'mas-yagas', target: pail, take: 'pail', label: { sah: 'мас ыаҕас', en: 'wooden water pail (mas yaghas)', ru: 'деревянное ведро (мас ыаҕас)' } });

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
    interactables.push({ target: g, take: 'log', off: true, label: { sah: 'хардаҕас', en: 'billet', ru: 'полено' } });
  }

  // ── the woodpile (built by yardlife): a box to look at, where billets come from ──
  const [wx, wz, wyaw] = WOODPILE;
  const pile = proxy(2.9, 1.45, 0.7, wx, ground(wx, wz) + 0.72, wz, wyaw);
  pile.name = 'woodpile';
  interactables.push({ entry: 'ottuk-mas', target: pile, take: 'woodpile', label: { sah: 'кыстаммыт мас', en: 'the woodpile', ru: 'поленница' } });

  // ── дьэдьэн colonies (chores/dyedyen.js): each crown a thing to pick from ──
  const dy = buildDyedyen(T, { ground, forest: terrain.forest ? (x, z) => terrain.forest(px + x, pz + z) : null });
  object.add(...dy.meshes);
  dy.patches.forEach((P, k) => {
    const t = proxy(P.R * 1.8, 0.2, P.R * 1.8, P.cx, ground(P.cx, P.cz) + 0.1, P.cz);
    t.name = 'dyedyen-patch';
    interactables.push({ entry: 'dyedyen', target: t, berries: k, label: { sah: 'дьэдьэн', en: 'wild strawberries (djedjen)', ru: 'земляника (дьэдьэн)' } });
  });
  const mown = dy.colonies.flatMap((C) => C.short); // grass kept short so the colony shows

  object.userData.mown = mown;
  object.userData.chores = { pail, logs, pile, setPatch: dy.setPatch, perPatch: dy.perPatch };
  const update = (dt, { camera }) => dy.cull(camera.position.x - px, camera.position.z - pz);
  return { object, colliders: [], floors: [], interactables, update };
}
