// Dry wood at the forest's edge north of the homestead (logic: src/interact/work/gather.js): dead larch
// branches lying on the forest floor, each one a thing to carry (the carrying code's 'log': an armful of four
// goes to the woodpile or a fire). Local frame: HOME.
import { Bucket, logGeo, mtx } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';

const N = 9;

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.height(px + x, pz + z) - py;
  const M = yardMats();
  const object = new T.Group();
  object.name = 'drywood';
  const interactables = [], sticks = [];
  for (let i = 0, tries = 0; i < N && tries < 400; tries++) {
    // among the first trees, not out on the meadow (the viewer's flat terrain has no forest: a row)
    const x = terrain.forest ? -34 + rng() * 68 : -4 + i, z = terrain.forest ? -84 - rng() * 40 : 0;
    if (terrain.forest && (terrain.forest(px + x, pz + z) < 0.45 || terrain.forest(px + x, pz + z) > 0.9)) continue;
    if (sticks.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
    // a branch along +Y (base at 0): the bough, a fork, a few broken twigs; bark gone, weathered grey
    const g = new T.Group(); g.name = 'dry-branch';
    const B = new Bucket(() => -1);
    const len = 0.7 + rng() * 0.22, r = 0.03 + rng() * 0.014, tint = [0.98 + rng() * 0.1, 0.95 + rng() * 0.08, 0.88 + rng() * 0.08];
    const main = logGeo(len, r, r * 0.6, rng, { seg: 6, step: 0.12, bend: 0.05, wob: 0.12, caps: true });
    B.add(main.side, M.wood, null, tint); B.add(main.caps, M.end, null, tint);
    for (let k = 0; k < 3; k++) {
      const y = len * (0.3 + rng() * 0.5), a = Math.PI / 2 + rng() * Math.PI, l = 0.12 + rng() * 0.2; // up or sideways, never into the ground
      const tw = logGeo(l, r * 0.45, r * 0.2, rng, { seg: 4, step: 0.1, bend: 0.06, wob: 0.1 });
      B.add(tw.side, M.wood, mtx([0, y, 0], [0.7 + rng() * 0.5, a, 0]), tint);
    }
    // a second, thinner bough beside it (one armload piece)
    // lying beside the bough, its underside level with the bough's (local +z is down once the branch lies), spreading from it
    const side = logGeo(len * 0.8, r * 0.7, r * 0.4, rng, { seg: 5, step: 0.12, bend: 0.03, wob: 0.12, caps: true });
    rng(); // (a draw kept: the branches after this one stay as they were)
    const sm = mtx([r * 2.2, 0.04, r * 0.3], [0, 0, -0.08]);
    B.add(side.side, M.wood, sm, tint); B.add(side.caps, M.end, sm, tint);
    for (const m of B.build(g)) m.castShadow = true;
    const home = { x, z, yaw: rng() * 6.28 };
    // lying along the slope: the tip on the ground as well as the butt
    const tilt = Math.atan2(ground(x + Math.sin(home.yaw) * len, z + Math.cos(home.yaw) * len) - ground(x, z), len);
    g.position.set(x, ground(x, z) + r + 0.01, z);
    g.rotation.set(Math.PI / 2 - tilt, home.yaw, 0, 'YXZ');
    g.userData.dynamic = true; g.userData.len = len; // (src/interact/work/gather.js lays it on the drawn ground)
    object.add(g);
    sticks.push({ obj: g, x, z });
    interactables.push({ target: g, take: 'log', drywood: i, label: { sah: 'хаппыт мас', en: 'dry wood', ru: 'сушняк' } });
    i++;
  }
  object.userData.work = { job: 'gather', object, sticks };
  return { object, colliders: [], floors: [], interactables };
}
