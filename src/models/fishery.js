// The fishing place in the lake's shallows (logic: src/interact/work/fish.js): a weir (быһыт) of stakes and
// lath mats (сибиэ) run out from the shore with one gap, the wicker trap (туу) that is set in it, and the
// bark carrier (тымтай) for the catch. Local frame: origin at the water's edge, the water lies south (+z).
// Sources: docs/content.md (`tuu`).
import { Bucket, addLog, lathe, mtx, tube, TAU } from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { LAKE } from '../world/terrain.js';

export const TUU = { len: 1.15, r: 0.21 }; // along +Y: the mouth at y 0, the clamped tail at `len`
const GAP = [3.7, 4.35]; // the weir's opening, metres out from the edge
const FISH = { trap: 14, basket: 60 };

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const hf = terrain.heightFast ? terrain.heightFast.bind(terrain) : terrain.height;
  const isViewer = !terrain.addPad;
  const waterY = isViewer ? -0.3 : LAKE.level - py;
  // the frame's origin sits on the water's edge
  let z0 = 0;
  if (!isViewer) { for (z0 = -8; z0 < 12; z0 += 0.1) if (hf(px, pz + z0) - py < waterY + 0.02) break; }
  const ground = (x, z) => (isViewer ? Math.min(0, -z * 0.09) : hf(px + x, pz + z0 + z) - py);
  const M = yardMats();
  const object = new T.Group();
  object.name = 'fishery';
  const colliders = [], interactables = [];
  const hidden = new T.MeshBasicMaterial({ visible: false });
  const proxy = (w, h, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), hidden); m.position.set(x, y, z0 + z); m.castShadow = false; object.add(m); return m; };
  const B = new Bucket((x, z) => ground(x, z - z0));
  const P = (x, y, z) => [x, y, z0 + z];

  // ── the weir: paired stakes, three withy rails, lath mats down to the bed; one gap ──
  const top = waterY + 0.5;
  for (let z = -0.7; z < 6.5; z += 0.42) {
    if (z > GAP[0] - 0.2 && z < GAP[1] + 0.2) continue;
    const zz = z + (rng() - 0.5) * 0.06, gy = ground(0, zz);
    addLog(B, P(0.02 * (rng() - 0.5), gy - 0.35, zz), P((rng() - 0.5) * 0.05, top + 0.25 + rng() * 0.2, zz + (rng() - 0.5) * 0.04), 0.03, 0.022, rng, M.wood, M.end, { seg: 6, step: 0.5 });
  }
  for (const zg of GAP) { // the gap's own posts: stouter, taller
    const gy = ground(0, zg);
    addLog(B, P(0, gy - 0.4, zg), P((rng() - 0.5) * 0.04, top + 0.55, zg), 0.045, 0.035, rng, M.wood, M.end, { seg: 7, step: 0.5 });
  }
  for (const [a, b] of [[-0.75, GAP[0]], [GAP[1], 6.5]]) {
    for (const h of [0.42, 0.18, -0.08]) for (const s of [-1, 1]) {
      addLog(B, P(s * 0.035, waterY + h, a - 0.1), P(s * 0.035, waterY + h + (rng() - 0.5) * 0.04, b + 0.1), 0.014, 0.011, rng, M.willow, M.willow, { seg: 5, step: 0.6, bend: 0.01 }, [0.62, 0.56, 0.48]);
    }
    for (let z = a; z < b; z += 0.062) {
      const gy = Math.min(ground(0, z), waterY - 0.02);
      addLog(B, P((rng() - 0.5) * 0.012, gy - 0.05, z), P((rng() - 0.5) * 0.012, top - rng() * 0.07, z + (rng() - 0.5) * 0.01), 0.008, 0.007, rng, M.fresh, M.fresh, { seg: 4, step: 0.6, bend: 0.004 }, [0.6 + rng() * 0.12, 0.55 + rng() * 0.1, 0.47 + rng() * 0.08]);
    }
    colliders.push({ x: 0, z: z0 + (a + b) / 2, hw: 0.12, hd: (b - a) / 2 });
  }
  // lashings where rails cross the gap posts
  for (const zg of GAP) for (const h of [0.42, 0.18]) B.add(new T.TorusGeometry(0.05, 0.007, 4, 10).rotateX(Math.PI / 2), M.lash, mtx(P(0, waterY + h, zg)));
  for (const m of B.build(object)) m.castShadow = true;

  // ── the trap (туу): larch laths on four hoops, an inner funnel at the mouth, the tail shut by a clamp of two sticks ──
  const trap = new T.Group(); trap.name = 'tuu';
  // by two hoops, on the side that is up and towards the body when it is carried
  const gr = (hand, y, k) => ({ hand, p: [0.6 * (TUU.r * k + 0.006), y, -0.8 * (TUU.r * k + 0.006)], axis: [0.8, 0, 0.6], r: 0.0075, out: [0.6, 0, -0.8] });
  trap.userData.grips = [gr('L', 0.32, 1), gr('R', 0.62, 0.82)];
  {
    const Bt = new Bucket(() => -1);
    const L = TUU.len, prof = [[TUU.r, 0], [TUU.r * 0.98, 0.3], [TUU.r * 0.82, 0.6], [TUU.r * 0.5, 0.88], [0.05, L - 0.06], [0.04, L]];
    const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const k = (y - prof[i - 1][1]) / (prof[i][1] - prof[i - 1][1]); return prof[i - 1][0] + (prof[i][0] - prof[i - 1][0]) * k; } return prof[prof.length - 1][0]; };
    const N = 30;
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU + (rng() - 0.5) * 0.03;
      Bt.add(tube(prof.map(([r, y]) => [Math.cos(a) * r, y, Math.sin(a) * r]), 0.0045, 4, false, 10), M.fresh, null, [0.66 + rng() * 0.14, 0.58 + rng() * 0.12, 0.46 + rng() * 0.1]);
    }
    for (const y of [0.012, 0.32, 0.62, 0.9]) {
      Bt.add(new T.TorusGeometry(rAt(y) + 0.006, 0.0075, 5, 26).rotateX(Math.PI / 2), M.willow, mtx([0, y, 0]), [0.55, 0.48, 0.4]);
      Bt.add(new T.TorusGeometry(rAt(y) - 0.004, 0.003, 3, 26).rotateX(Math.PI / 2), M.lash, mtx([0, y + 0.012, 0])); // the root binding
    }
    // the inner funnel: fish find their way in, not out
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * TAU;
      Bt.add(tube([[Math.cos(a) * (TUU.r - 0.012), 0.005, Math.sin(a) * (TUU.r - 0.012)], [Math.cos(a) * 0.12, 0.17, Math.sin(a) * 0.12], [Math.cos(a) * 0.05, 0.34, Math.sin(a) * 0.05]], 0.004, 4, false, 6), M.fresh, null, [0.6, 0.54, 0.44]);
    }
    Bt.add(new T.TorusGeometry(0.052, 0.004, 4, 14).rotateX(Math.PI / 2), M.lash, mtx([0, 0.34, 0]));
    // the tail clamp (тылбыы)
    for (const s of [-1, 1]) Bt.add(new T.CylinderGeometry(0.008, 0.008, 0.2, 5).rotateZ(Math.PI / 2), M.wood, mtx([0, L - 0.03, s * 0.045]));
    for (const s of [-1, 1]) Bt.add(new T.TorusGeometry(0.047, 0.004, 4, 10).rotateY(Math.PI / 2), M.lash, mtx([s * 0.07, L - 0.03, 0]));
    for (const m of Bt.build(trap)) m.castShadow = true;
  }
  trap.position.set(1.5, ground(1.5, -1.5) + TUU.r * 0.82, z0 - 1.5 + 0.5);
  trap.rotation.set(Math.PI / 2, 0, 0.35, 'YXZ');
  trap.userData.dynamic = true;
  object.add(trap);
  interactables.push({ target: trap, tuu: true, entry: 'tuu', label: { sah: 'туу', en: 'fish trap (туу)', ru: 'верша (туу)' } });

  // ── the carrier (тымтай): an oval birch-bark basket with a willow rim and a shoulder cord ──
  const basket = new T.Group(); basket.name = 'tymtay';
  const bark = M.birch;
  {
    const Bb = new Bucket(() => -1);
    const g = lathe([[0.16, 0], [0.19, 0.1], [0.2, 0.2], [0.19, 0.202], [0.18, 0.1], [0.15, 0.012], [0, 0.012]], 26, rng, 0.015);
    Bb.add(g, bark, mtx([0, 0, 0], [0, 0, 0], [1.25, 1, 0.82]), [0.82, 0.68, 0.5]);
    Bb.add(new T.TorusGeometry(0.2, 0.008, 5, 30).rotateX(Math.PI / 2), M.willow, mtx([0, 0.197, 0], [0, 0, 0], [1.25, 1, 0.82]), [0.6, 0.52, 0.42]);
    Bb.add(new T.TorusGeometry(0.168, 0.006, 5, 30).rotateX(Math.PI / 2), M.willow, mtx([0, 0.03, 0], [0, 0, 0], [1.25, 1, 0.82]), [0.6, 0.52, 0.42]);
    Bb.add(tube([[-0.25, 0.195, 0], [-0.3, 0.12, 0.08], [-0.26, 0.02, 0.2], [0, 0.01, 0.3], [0.26, 0.02, 0.2], [0.3, 0.12, 0.08], [0.25, 0.195, 0]], 0.005, 5), M.hair);
    for (const m of Bb.build(basket)) m.castShadow = true;
  }
  basket.position.set(-1.3, ground(-1.3, -1.2), z0 - 1.2);
  basket.rotation.y = 0.4;
  basket.userData.dynamic = true;
  object.add(basket);
  interactables.push({ target: basket, tymtay: true, entry: 'tuu', label: { sah: 'тымтай', en: 'fish carrier (тымтай)', ru: 'короб для рыбы (тымтай)' } });

  // ── мунду (lake minnow, a hand's breadth long): one small fish, instanced in the trap and in the carrier ──
  const fishGeo = minnow(T);
  const fishMat = new T.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.38, metalness: 0 });
  fishMat.name = 'mundu';
  const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  const shoal = (n, place) => {
    const im = new T.InstancedMesh(fishGeo, fishMat, n);
    im.castShadow = false; im.frustumCulled = false; im.name = 'mundu';
    const full = [];
    for (let i = 0; i < n; i++) { place(i); full.push(m4.compose(p, q.setFromEuler(e), s).clone()); im.setMatrixAt(i, zero); }
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.userData.show = (k) => { for (let i = 0; i < n; i++) im.setMatrixAt(i, i < k ? full[i] : zero); im.instanceMatrix.needsUpdate = true; };
    return im;
  };
  // in the trap: lying along the laths towards the tail
  const inTrap = shoal(FISH.trap, (i) => {
    const a = rng() * TAU, y = 0.45 + rng() * 0.45, r = (TUU.r * (1 - y / TUU.len) * 0.75) * Math.sqrt(rng());
    p.set(Math.cos(a) * r, y, Math.sin(a) * r); e.set(rng() * 0.6 - 0.3, rng() * TAU, Math.PI / 2 + rng() * 0.6 - 0.3, 'XYZ'); s.setScalar(0.85 + rng() * 0.4);
  });
  trap.add(inTrap);
  // in the carrier: a heap that grows
  const inBasket = shoal(FISH.basket, (i) => {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 0.15, lay = Math.floor(i / 12);
    p.set(Math.cos(a) * r * 1.25, 0.028 + lay * 0.024 + rng() * 0.012, Math.sin(a) * r * 0.82); e.set(Math.PI / 2 + rng() * 0.5 - 0.25, rng() * TAU, rng() * 0.3 - 0.15, 'YXZ'); s.setScalar(0.85 + rng() * 0.4); // on their sides
  });
  basket.add(inBasket);

  // look-at boxes: the gap (where the trap goes) and the weir
  const gz = (GAP[0] + GAP[1]) / 2;
  const gap = proxy(0.5, 0.7, GAP[1] - GAP[0], 0, waterY + 0.15, gz);
  gap.name = 'weir-gap';
  interactables.push({ target: gap, gap: true, entry: 'tuu', label: { sah: 'быһыт аана', en: 'the gap in the weir', ru: 'проход в запруде' } });
  const weir = proxy(0.3, 0.9, 4, 0, waterY + 0.2, 1.6);
  interactables.push({ entry: 'tuu', target: weir, label: { sah: 'быһыт', en: 'fish weir (быһыт)', ru: 'запруда (быһыт)' } });

  // the working shore is trodden short, so the trap and the carrier show
  object.userData.mown = [{ x: 0.1, z: z0 - 1.5, rx: 3.4, rz: 1.9 }];
  object.userData.work = {
    job: 'fish', object, trap, basket, inTrap, inBasket, max: FISH, len: TUU.len,
    gap: new T.Vector3(0, waterY - 0.1, z0 + gz), // the middle of the opening, a little under the surface
  };
  return { object, colliders, floors: [], interactables };
}

// A lake minnow about 9 cm long, head towards +X: olive back, brassy sides, pale belly, a forked tail.
function minnow(T) {
  const g = new T.SphereGeometry(1, 8, 6);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const taper = x < 0 ? 1 - 0.55 * x * x : 1 - 0.25 * x * x; // slimmer towards the tail
    P.setXYZ(i, x * 0.04, y * 0.0105 * taper, z * 0.0062 * taper);
  }
  const body = g.toNonIndexed();
  body.setAttribute('color', new T.BufferAttribute(new Float32Array(body.attributes.position.count * 3), 3));
  {
    const bp = body.attributes.position, bc = body.attributes.color;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i) / 0.0105; const k = y > 0.35 ? [0.1, 0.11, 0.07] : y < -0.3 ? [0.55, 0.52, 0.4] : [0.3, 0.26, 0.13]; bc.setXYZ(i, ...k); }
  }
  const pos = [...body.attributes.position.array], c = [...body.attributes.color.array];
  const tri = (a, b, d, k) => { pos.push(...a, ...b, ...d, ...a, ...d, ...b); for (let i = 0; i < 6; i++) c.push(...k); };
  tri([-0.036, 0, 0], [-0.052, 0.013, 0], [-0.046, 0, 0], [0.3, 0.28, 0.16]); // tail, upper and lower lobe
  tri([-0.036, 0, 0], [-0.046, 0, 0], [-0.052, -0.013, 0], [0.3, 0.28, 0.16]);
  tri([0.0, 0.0095, 0], [-0.012, 0.0165, 0], [-0.016, 0.0085, 0], [0.24, 0.23, 0.14]); // back fin
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(c, 3));
  out.computeVertexNormals();
  return out;
}
