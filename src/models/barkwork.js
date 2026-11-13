// The birch-bark work by the craft spot (logic: src/interact/work/tuos.js): one sheet of bark that is warmed
// at a fire, folded and pinned into a тордуйа — the quick vessel made without sewing, a sheet bent up at its
// four corners and held by wooden pegs (docs/content.md `birch-bark`). The same object is the flat sheet and
// the finished vessel: four hinged walls round a base, corner flaps on the short walls, a peg through each.
// Local frame: HOME; it lies on the hide of yardlife's craft spot.
import { pmat } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { drawnBy } from '../world/ground-data.js';
import { TIER } from '../engine/tier.js';

const BASE = [0.2, 0.12], WALL = 0.07, UP = 1.36; // base (x, z), wall height, how far a wall is raised (rad)
const AT = [0.75, -7.81, 0.25]; // on the craft spot's hide, clear of the pail and the coil (yardlife PLACES.craft + its yaw)
const BERRIES = 42;

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const M = yardMats();
  const bark = pmat('canvas:birch', { scale: 0.5, back: 'birchIn', double: true, dirt: 0.4, tint: 0xecd3a6 }); // the craft spot's prepared bark
  const object = new T.Group();
  object.name = 'barkwork';
  // a flat panel in the XZ plane from (x0, z0) to (x1, z1), uv in metres, with the kit's vertex attributes
  const panel = (x0, z0, x1, z1) => {
    const g = new T.PlaneGeometry(x1 - x0, z1 - z0, 2, 2).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const p = g.attributes.position, n = p.count, uv = g.attributes.uv;
    for (let i = 0; i < n; i++) uv.setXY(i, p.getX(i) + 3.1, p.getZ(i) + 1.7);
    g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('grime', new T.Float32BufferAttribute(new Float32Array(n).fill(1), 1));
    const m = new T.Mesh(g, bark); m.castShadow = true;
    return m;
  };
  const vessel = new T.Group(); vessel.name = 'torduya';
  vessel.add(panel(-BASE[0] / 2, -BASE[1] / 2, BASE[0] / 2, BASE[1] / 2));
  // a wall hinged on a base edge: built as the +X one (out along +x), turned to its side by `yaw`
  const walls = [];
  const wall = (yaw, half, len, flaps) => {
    const turn = new T.Group(); turn.rotation.y = yaw;
    const hinge = new T.Group(); hinge.position.x = half;
    hinge.add(panel(0, -len / 2, WALL, len / 2));
    const w = { hinge, flaps: [], pegs: [] };
    if (flaps) for (const s of [-1, 1]) {
      const fh = new T.Group(); fh.position.set(0, 0.0015, s * (len / 2 + 0.0015));
      fh.add(s > 0 ? panel(0, 0, WALL, WALL) : panel(0, -WALL, WALL, 0));
      // the peg (тоһоҕос): a split of willow pushed through flap and wall near the rim
      const peg = new T.Mesh(new T.CylinderGeometry(0.0028, 0.0018, 0.05, 5).rotateX(Math.PI / 2).rotateZ(0.5), M.willow);
      peg.geometry.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(peg.geometry.attributes.position.count * 3).fill(0.8), 3));
      peg.geometry.setAttribute('grime', new T.Float32BufferAttribute(new Float32Array(peg.geometry.attributes.position.count).fill(1), 1));
      peg.position.set(WALL * 0.72, 0, s * WALL * 0.45); peg.visible = false; peg.castShadow = false;
      fh.add(peg);
      hinge.add(fh);
      w.flaps.push({ g: fh, s }); w.pegs.push(peg);
    }
    turn.add(hinge); vessel.add(turn);
    walls.push(w);
  };
  wall(-Math.PI / 2, BASE[1] / 2, BASE[0], false); // +Z long wall
  wall(Math.PI / 2, BASE[1] / 2, BASE[0], false);  // −Z long wall
  wall(0, BASE[0] / 2, BASE[1], true);              // +X short wall with its corner flaps
  wall(Math.PI, BASE[0] / 2, BASE[1], true);        // −X
  // how far each of the four folds has gone (0 flat … 1 up); the flaps wrap and the pegs go in with the short walls
  const setFold = (f) => walls.forEach((w, i) => {
    const k = Math.min(1, Math.max(0, f[i]));
    w.hinge.rotation.z = k * UP;
    for (const fl of w.flaps) fl.g.rotation.x = -fl.s * k * Math.PI / 2;
    for (const p of w.pegs) p.visible = k >= 1;
  });
  setFold([0, 0, 0, 0]);
  // berries gathered into it (дьэдьэн)
  const berryMat = new T.MeshStandardNodeMaterial({ color: 0x8a0a12, roughness: 0.35 });
  berryMat.name = 'berries';
  const berries = new T.InstancedMesh(new T.SphereGeometry(0.0065, 6, 5).scale(1, 1.25, 1), berryMat, BERRIES);
  berries.castShadow = false; berries.frustumCulled = false; berries.name = 'dyedyen-picked';
  const full = [], m4 = new T.Matrix4(), zero = new T.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < BERRIES; i++) {
    full.push(m4.clone().makeTranslation((rng() - 0.5) * (BASE[0] - 0.03), 0.008 + Math.floor(i / 20) * 0.009 + rng() * 0.004, (rng() - 0.5) * (BASE[1] - 0.03)));
    berries.setMatrixAt(i, zero);
  }
  berries.instanceMatrix.setUsage(T.DynamicDrawUsage);
  berries.userData.show = (n) => { for (let i = 0; i < BERRIES; i++) berries.setMatrixAt(i, i < n ? full[i] : zero); berries.instanceMatrix.needsUpdate = true; };
  vessel.add(berries);

  // on the hide (1.0–1.4 cm over the ground as this tier draws it: world/settle.js), tipped to the ground's plane under the sheet
  const drawn = drawnBy(terrain, TIER.ground), hg = (a, b) => drawn(px + AT[0] + a, pz + AT[1] + b) - py;
  const sx = (hg(0.18, 0) - hg(-0.18, 0)) / 0.36, sz = (hg(0, 0.15) - hg(0, -0.15)) / 0.3;
  const lift = Math.max(0, ...[[0.18, 0.15], [-0.18, 0.15], [0.18, -0.15], [-0.18, -0.15]].map(([a, b]) => hg(a, b) - (hg(0, 0) + sx * a + sz * b)));
  vessel.position.set(AT[0], hg(0, 0) + lift + 0.016, AT[1]);
  vessel.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(-sx, 1, -sz).normalize()).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), AT[2] + 0.5));
  vessel.userData.dynamic = true;
  object.add(vessel);
  const interactables = [{ target: vessel, bark: true, entry: 'birch-bark', label: { sah: 'туос', en: 'a sheet of birch bark (tuos)', ru: 'лист бересты (туос)' } }];
  object.userData.work = { job: 'tuos', object, vessel, setFold, berries, max: BERRIES, rest: { p: vessel.position.clone(), yaw: vessel.rotation.y } };
  return { object, colliders: [], floors: [], interactables };
}
