// Ытык мас — the great lone birch at the alaas edge, revered as the home of the spirit of the place.
// ~17 m, trunk 43 cm at chest height, dark fissured bark at the foot, low drooping limbs.
// On it: a салама (two-ply white/black horsehair rope) wrapped at 1.7 m with seven hangings
// (3 white hair tufts, 2 ribbons, a birch-bark horse, a duck feather), and faded cloth strips tied
// on the low branches at 1.8–2.5 m. Exposed root flares at the foot (Aal Luuk Mas: roots to the
// Lower World). Act: greet the tree (a slight bow, a short silence) and tie one ribbon.
import * as THREE from 'three/webgpu';
import { makeTree } from '../nature/trees/gen.js';
import { barkMaterial, leafMaterial, U } from '../nature/trees/materials.js';
import { tube, merge, tris } from './yard/geo.js';
import { rope, hair, cloth, plain } from './yard/mat.js';
import { tuft, ribbon, choose, tween, ease, setColor, noSway } from './yard/bits.js';
import { section } from '../load/geocache.js';

const RIBBONS = {
  white: { c: [0.86, 0.86, 0.82], swatch: '#f1efe8', label: { sah: 'үрүҥ', en: 'white', ru: 'белая' } },
  blue: { c: [0.38, 0.6, 0.86], swatch: '#8fb9e6', label: { sah: 'халлаан күөҕэ', en: 'light blue', ru: 'голубая' } },
  green: { c: [0.2, 0.5, 0.18], swatch: '#6fa860', label: { sah: 'от күөҕэ', en: 'green', ru: 'зелёная' } },
};
// old, sun-faded strips already on the tree
const FADED = [[0.8, 0.79, 0.74], [0.56, 0.66, 0.76], [0.5, 0.6, 0.45], [0.82, 0.78, 0.6], [0.78, 0.77, 0.72], [0.6, 0.7, 0.8], [0.55, 0.62, 0.5]];

// tree attributes for meshes that use the tree materials (roots)
function treeAttrs(g, ao = 0.85) {
  const n = g.attributes.position.count;
  const info = new Float32Array(n * 4), wnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { info[i * 4] = ao; info[i * 4 + 2] = g.attributes.position.getY(i); }
  g.setAttribute('info', new THREE.BufferAttribute(info, 4));
  g.setAttribute('wnd', new THREE.BufferAttribute(wnd, 4));
  return g;
}

export default async function build(ctx, placement) {
  const { rng } = ctx;
  const object = new THREE.Group();
  object.name = 'sacred-birch';

  // ── the tree ──
  // the tree's geometry and the skeleton points used below (baked: src/load/geocache.js)
  const v = section(() => {
    const t = makeTree('birch', 9241, {
      H: 17.2, r0: 0.215, crownBaseM: 3.4, limbs: 30, spread: 1.5, lean: 0.006, density: 3.6, cardScale: 0.66, envelope: 1.3,
      lowLimbs: [
        { y: 2.75, az: 0.15, L: 3.8, elev: -0.02, droop: 0.12 },
        { y: 2.95, az: 1.35, L: 3.4, elev: 0.02, droop: 0.12 },
        { y: 2.65, az: -1.15, L: 3.6, elev: -0.06, droop: 0.1 },
        { y: 3.15, az: 2.55, L: 3.2, elev: 0.08 },
        { y: 3.05, az: -2.45, L: 3.4, elev: 0.04 },
        { y: 3.3, az: 0.75, L: 3.0, elev: 0.12 },
      ],
    });
    const pts = (l) => l.pts.map(({ p, r }) => ({ p, r }));
    return { lod0: t.lod0, skeleton: { trunk: { pts: pts(t.skeleton.trunk) }, low: t.skeleton.low.map((l) => ({ pts: pts(l) })) } };
  });
  const bark = new THREE.Mesh(v.lod0.bark, barkMaterial('birch', { lod: false }));
  const leaves = new THREE.Mesh(v.lod0.leaves, leafMaterial('birch', { lod: false }));
  bark.name = 'sacred-birch-trunk'; leaves.name = 'sacred-birch-leaves';
  object.add(bark, leaves);

  const trunk = v.skeleton.trunk.pts;
  const trunkAt = (y) => {
    for (let k = 0; k < trunk.length - 1; k++) {
      const a = trunk[k], b = trunk[k + 1];
      if (y <= b.p.y) { const t = (y - a.p.y) / (b.p.y - a.p.y); return { p: a.p.clone().lerp(b.p, t), r: a.r + (b.r - a.r) * t }; }
    }
    return { p: trunk[trunk.length - 1].p.clone(), r: 0.01 };
  };

  // ── roots: flared root buttresses running into the ground ──
  const rootGeo = section(() => {
    const rootGeos = [];
    for (let i = 0; i < 7; i++) {
      const az = (i / 7) * Math.PI * 2 + rng() * 0.5;
      const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const L = 0.25 + rng() * 0.3, c = trunkAt(0.3);
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(c.p.clone().addScaledVector(dir, c.r * 0.55 + L * t).add(new THREE.Vector3((rng() - 0.5) * 0.02, 0.22 - 0.36 * Math.pow(t, 0.6), (rng() - 0.5) * 0.02)));
      }
      rootGeos.push(tube(pts, (t) => 0.1 * (1 - t) + 0.035, { radial: 7 }));
    }
    return treeAttrs(merge(rootGeos), 0.8);
  });
  const roots = new THREE.Mesh(rootGeo, barkMaterial('birch', { lod: false, wind: false }));
  roots.name = 'sacred-birch-roots';
  const rootsGroup = new THREE.Group(); rootsGroup.add(roots); object.add(rootsGroup);

  // ── salama: one loose loop around the trunk at 1.7 m, sagging on the meadow side (+X) ──
  const front = 0.25; // azimuth the swag hangs towards
  const loop = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const a = front + Math.PI + (i / N) * Math.PI * 2; // start at the back, around, back again
    const sag = Math.pow((1 + Math.cos(a - front)) / 2, 2.2);
    const y = 1.76 - 0.3 * sag;
    const c = trunkAt(y);
    const r = c.r + 0.004 + 0.1 * sag;
    loop.push(new THREE.Vector3(c.p.x + Math.cos(a) * r, y, c.p.z + Math.sin(a) * r));
  }
  // the knot's two free ends hang at the back
  const knot = loop[0].clone();
  const ends = [];
  for (const side of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push(knot.clone().add(new THREE.Vector3(Math.cos(front + Math.PI + side * 0.4) * 0.02 * k, -0.04 * k, Math.sin(front + Math.PI + side * 0.4) * 0.02 * k)));
    ends.push(tube(pts, 0.0028, { radial: 6 }));
  }
  const ropeGeo = merge([tube(loop, 0.0029, { radial: 7 }), ...ends]);
  const salamaRope = new THREE.Mesh(ropeGeo, rope({ key: 'salama-rope', colors: [0xe9e4d6, 0x18150f], plies: 2, pitch: 0.02, radius: 0.003 }));
  salamaRope.castShadow = false;
  const salama = new THREE.Group(); salama.name = 'salama';
  salama.add(salamaRope);

  // seven hangings on the front half, ~25 cm apart: tuft, ribbon, tuft, horse, tuft, ribbon, feather
  const hangAt = (i) => loop[Math.round(N / 2 + (i - 3) * 5.5)].clone();
  const hairParts = [], clothParts = [];
  const order = ['tuft', 'ribbonW', 'tuft', 'horse', 'tuft', 'ribbonB', 'feather'];
  const thread = [];
  order.forEach((kind, i) => {
    const at = hangAt(i);
    if (kind === 'tuft') hairParts.push(...tuft(rng, at.toArray(), { len: 0.15, locks: 12, color: [0.86, 0.84, 0.78] }));
    if (kind === 'ribbonW') clothParts.push(ribbon(rng, at.toArray(), { len: 0.2, width: 0.025, color: [0.84, 0.83, 0.78] }));
    if (kind === 'ribbonB') clothParts.push(ribbon(rng, at.toArray(), { len: 0.2, width: 0.025, color: [0.5, 0.64, 0.78] }));
    if (kind === 'horse' || kind === 'feather') thread.push({ at, kind });
  });
  const hairMesh = new THREE.Mesh(merge(hairParts), hair('salama-hair', 0.02));
  const clothMesh = new THREE.Mesh(merge(clothParts), cloth('salama-cloth', 0.03));
  hairMesh.castShadow = clothMesh.castShadow = false;
  salama.add(hairMesh, clothMesh);

  // birch-bark horse (~6 cm, pale bark side out) and a duck feather, each on a short hair thread
  const smalls = [];
  for (const { at, kind } of thread) {
    const low = at.clone().add(new THREE.Vector3(0, -0.07, 0));
    smalls.push(noSway(setColor(tube([at, low], 0.0008, { radial: 4 }), [0.7, 0.68, 0.62])));
    const sh = new THREE.Shape();
    if (kind === 'horse') { // side-view horse silhouette, 6 cm nose to tail
      const P = [[-0.03, 0], [-0.027, 0.012], [-0.031, 0.02], [-0.022, 0.016], [0.012, 0.017], [0.02, 0.026], [0.031, 0.027], [0.03, 0.02], [0.02, 0.016], [0.018, 0.0], [0.014, -0.012], [0.011, -0.001], [-0.012, -0.001], [-0.016, -0.013], [-0.02, -0.001]];
      sh.moveTo(...P[0]); for (const p of P.slice(1)) sh.lineTo(...p);
    } else { // feather: 7 cm, slim vane
      sh.moveTo(0, 0); sh.quadraticCurveTo(0.012, -0.025, 0.004, -0.07); sh.quadraticCurveTo(-0.008, -0.03, 0, 0);
    }
    const g = new THREE.ShapeGeometry(sh);
    const pos = g.attributes.position;
    const nrm = new Float32Array(pos.count * 3), col = new Float32Array(pos.count * 3);
    const c = kind === 'horse' ? [0.78, 0.7, 0.56] : [0.42, 0.37, 0.3];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setXYZ(i, low.x, low.y + (kind === 'horse' ? y - 0.012 : y), low.z + x);
      nrm.set([1, 0, 0], i * 3); col.set(c, i * 3);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
    smalls.push(noSway(g));
  }
  const smallMesh = new THREE.Mesh(merge(smalls), plain('sacred-birch-small', { side: THREE.DoubleSide, roughness: 0.75 }));
  smallMesh.castShadow = false;
  salama.add(smallMesh);
  object.add(salama);

  // ── faded cloth strips tied on the low branches between 1.8 and 2.5 m ──
  const spots = [];
  for (const limb of v.skeleton.low) for (const pt of limb.pts) {
    const d = Math.hypot(pt.p.x, pt.p.z);
    if (pt.p.y > 1.85 && pt.p.y < 2.55 && d > 0.9) spots.push(pt);
  }
  // fall back to the lowest points of the low limbs when the droop keeps them higher
  if (spots.length < 8) for (const limb of v.skeleton.low) spots.push(limb.pts[limb.pts.length - 2], limb.pts[limb.pts.length - 3]);
  spots.sort((a, b) => Math.atan2(a.p.z, a.p.x) - Math.atan2(b.p.z, b.p.x));
  const stripParts = [], knots = [];
  const used = [];
  const pickSpot = (pref) => {
    let best = null, bd = 1e9;
    for (const s of spots) {
      if (used.includes(s)) continue;
      const a = Math.atan2(s.p.z, s.p.x), d = Math.abs(Math.atan2(Math.sin(a - pref), Math.cos(a - pref)));
      if (d < bd) { bd = d; best = s; }
    }
    if (best) used.push(best);
    return best;
  };
  const tie = (spot, color, g = stripParts) => {
    const at = spot.p.clone().add(new THREE.Vector3(0, -spot.r - 0.004, 0));
    knots.push(setColor(tube([at.clone().add(new THREE.Vector3(-0.012, 0.012, 0)), at.clone().add(new THREE.Vector3(0.012, 0.01, 0.004))], spot.r + 0.006, { radial: 6 }), color));
    g.push(ribbon(rng, at.toArray(), { len: 0.28 + rng() * 0.14, width: 0.032 + rng() * 0.01, color }));
    g.push(ribbon(rng, at.clone().add(new THREE.Vector3(0.01, 0, 0.004)).toArray(), { len: 0.2 + rng() * 0.12, width: 0.03, color }));
  };
  const prefs = [0.0, 0.5, -0.6, 1.3, -1.2, 2.2, -2.3];
  prefs.forEach((pref, i) => { const s = pickSpot(pref); if (s) tie(s, FADED[i % FADED.length]); });
  const strips = new THREE.Mesh(merge([...stripParts, ...knots.map(noSway)]), cloth('sacred-birch-strips', 0.04));
  strips.castShadow = false;
  object.add(strips);

  // the player's ribbon: tied at the free spot nearest the meadow side, hidden until the act
  const mineSpot = pickSpot(0.3) || spots[0];
  const mineParts = [];
  tie(mineSpot, [1, 1, 1], mineParts);
  const mineGeo = merge([...mineParts, noSway(knots.pop())]);
  const mineBase = Float32Array.from(mineGeo.attributes.color.array);
  const mine = new THREE.Mesh(mineGeo, cloth('sacred-birch-mine', 0.045));
  mine.visible = false; mine.castShadow = false;
  object.add(mine);
  const paint = (c) => {
    const a = mineGeo.attributes.color;
    for (let i = 0; i < a.count; i++) a.setXYZ(i, mineBase[i * 3] * c[0], mineBase[i * 3 + 1] * c[1], mineBase[i * 3 + 2] * c[2]);
    a.needsUpdate = true;
  };
  const mineAt = mineSpot.p.clone();

  // ── interactions ──
  const trunkTarget = new THREE.Group(); trunkTarget.name = 'sacred-birch-target';
  object.remove(bark); trunkTarget.add(bark); object.add(trunkTarget);

  const doneKey = 'sacred-birch:ribbon';
  const greet = {
    id: 'ribbon', once: true, freeze: true, // the bow moves the view
    label: { sah: 'эҕэрдэлээ, лиэнтэ баай', en: 'greet the tree and tie a ribbon', ru: 'поприветствовать дерево и повязать ленточку' },
    run: async (game) => {
      const pl = game?.player;
      // a slight bow and a short silence
      const p0 = pl ? pl.pitch : 0;
      if (pl) await tween(1.1, (t) => { pl.pitch = p0 + (-0.32 - p0) * ease(t); });
      await tween(1.6, () => {});
      if (pl) await tween(0.9, (t) => { pl.pitch = -0.32 + (Math.min(p0, 0.15) + 0.32) * ease(t); });
      const pick = await choose(game, { sah: 'Ханнык өҥнөөх лиэнтэни баайаҕын?', en: 'Which ribbon will you tie?', ru: 'Какую ленточку повязать?' },
        Object.entries(RIBBONS).map(([id, r]) => ({ id, label: r.label, swatch: r.swatch })));
      if (!pick) { setTimeout(() => { game?.done?.delete(doneKey); game?.persist?.(); }, 0); return; }
      paint(RIBBONS[pick].c);
      mine.visible = true;
      game?.audio?.play('ribbon', object.localToWorld(mineAt.clone()));
      // the strip unrolls down from the knot
      await tween(1.3, (t) => {
        const e = Math.max(0.02, ease(t));
        mine.scale.set(1, e, 1);
        mine.position.set(0, mineAt.y * (1 - e), 0);
      });
      mine.scale.setScalar(1); mine.position.set(0, 0, 0);
      if (game?.save) { game.save.sacredBirch = { ribbon: pick }; game.persist?.(); }
    },
  };

  let restored = false;
  const update = (dt, { game }) => {
    if (!ctx.world?.forest) U.time.value += dt; // the forest ticks the shared wind clock when it exists
    if (!restored && game) {
      restored = true;
      const c = game.save?.sacredBirch?.ribbon;
      if (c && RIBBONS[c]) { paint(RIBBONS[c].c); mine.visible = true; }
    }
  };

  object.userData.info = { tris: tris(v.lod0.bark) + tris(v.lod0.leaves) + tris(rootGeo) + tris(ropeGeo) };
  const base = trunkAt(0.3);
  return {
    object,
    colliders: [{ x: base.p.x, z: base.p.z, r: 0.3 }],
    floors: [],
    interactables: [
      { entry: 'sacred-birch', target: trunkTarget, act: greet },
      { entry: 'salama', target: salama },
      { entry: 'aal-luuk-mas', target: rootsGroup, label: { sah: 'Аал Луук Мас — силистэр', en: 'the roots — Aal Luuk Mas', ru: 'корни — Аал Луук Мас' } },
    ],
    update,
  };
}
