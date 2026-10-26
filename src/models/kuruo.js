// Хаһаа: the cattle pen, 15 × 20 m, fenced with the Sakha pole fence (күрүө / сигиэһин күрүө):
// pairs of larch stakes every ~3 m, three rails (0.4 / 0.8 / 1.2 m) resting in twisted willow-bark
// lashings (сигэ), rail ends overlapping at the pairs, rails sagging, a few freshly replaced.
// The gate (сүрдьүгэс) on the west side, towards the yard: two thick posts with mortise holes and
// three rails through them; the player slides the rails out and swings them aside (act, toggles).
// Inside: trodden, hoof-pocked earth and dung; uncut grass along the fence feet.
import * as THREE from 'three/webgpu';
import { turned, logProfile, bow, tube, merge, tris } from './yard/geo.js';
import { larch, barkPole, rope, trodden, grass, plain } from './yard/mat.js';
import { groundOf, troddenPatch, grassClump, noSway, tween, ease } from './yard/bits.js';
import { section } from '../load/geocache.js';

const TAU = Math.PI * 2;
const W = 7.5, D = 10;           // half sizes (x: 15 m, z: 20 m)
const GATE = { x: -W, z0: 3.2, z1: 5.9 }; // gate gap on the west side
const RAILS = [0.42, 0.82, 1.2];
const HOLE_R = 0.06; // gate-post mortise radius (gate rails 0.047)
const SIDE = 0.15;  // fence rails run along the gate posts' inner face, this far from their axis
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export default async function build(ctx, placement) {
  const { rng } = ctx;
  const ground = groundOf(ctx, placement);
  const object = new THREE.Group();
  object.name = 'kuruo';

  // ── the fence line: a closed loop of stake pairs, with the gate gap ──
  const corners = [[-W, -D], [W, -D], [W, D], [-W, D]];
  const nodes = []; // { x, z, dir: [dx,dz] along the fence, gate? }
  for (let s = 0; s < 4; s++) {
    const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
    const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 3);
    for (let i = 0; i < n; i++) {
      const t = i / n + (i ? (rng() - 0.5) * 0.04 : 0);
      nodes.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, side: s, dir: [(bx - ax) / L, (bz - az) / L], corner: i === 0 });
    }
  }
  // the west side (s = 3) runs from (−W, D) to (−W, −D): put the gate posts in it
  const west = nodes.filter((n) => n.side === 3 && !n.corner);
  for (const n of west) if (n.z > GATE.z0 - 1.4 && n.z < GATE.z1 + 1.4) n.drop = true;
  const loop = nodes.filter((n) => !n.drop);
  const gi = loop.findIndex((n) => n.side === 3 && n.z < GATE.z0); // first west node south of the gate (going north→south)
  const gN = { x: -W, z: GATE.z1, gate: true, side: 3, dir: [0, -1] }, gS = { x: -W, z: GATE.z0, gate: true, side: 3, dir: [0, -1] };
  loop.splice(gi, 0, gN, gS);

  // the geometry runs in section()s, which a bake stands in for (src/load/geocache.js)
  for (const n of loop) n.gy = ground(n.x, n.z);
  const fence = section(() => {
    const stakes = [], rails = [], railsFresh = [], lashes = [], gateWood = [];
    const stakeTone = (k) => (y, a, c) => { const d = Math.max(0, Math.min(1, (0.2 - y) / 0.25)); c[0] = 0.95 * k * (1 - d * 0.4); c[1] = 0.88 * k * (1 - d * 0.45); c[2] = 0.78 * k * (1 - d * 0.5); };

    for (const n of loop) {
      if (n.gate) {
        // thick mortised gate post, 18 cm, 1.55 m
        // the rails' mortises are cut into the post (a dark recess at each rail on both faces), not
        // tubes stuck on it; the post is nearly straight so the gate rails run true through both
        const H = 1.55, tone = stakeTone(0.92);
        const holeY = RAILS.map((h) => 0.35 + h), extra = holeY.flatMap((y) => [-0.075, -0.05, -0.03, -0.012, 0, 0.012, 0.03, 0.05, 0.075].map((d) => y + d));
        const hole = (y, a, r) => Math.min(...holeY.map((yh) => Math.hypot(Math.cos(a) * r / HOLE_R, (y - yh) / HOLE_R)));
        const g = turned(logProfile(H + 0.3, 0.095, 0.08, { step: 0.12, extra }), {
          radial: 28, rng, noise: 0.03, oval: 0.03, bend: bow(rng, H, 0.006), capTop: true,
          carve: (y, a, r) => -0.035 * smooth(1, 0.7, hole(y, a, r)),
          color: (y, a, c) => { tone(y, a, c); const k = smooth(1.25, 0.9, hole(y, a, 0.09)); for (let i = 0; i < 3; i++) c[i] += (0.09 - c[i]) * k; },
        });
        g.translate(n.x, n.gy - 0.3, n.z);
        gateWood.push(g);
        continue;
      }
      // a pair of stakes either side of the rail line, leaning a little towards each other
      const px = -n.dir[1], pz = n.dir[0]; // perpendicular
      const sp = n.corner ? 0.14 : 0.11;
      for (const sgn of [-1, 1]) {
        const H = 1.42 + rng() * 0.18, r0 = 0.05 + rng() * 0.014;
        const g = turned(logProfile(H + 0.25, r0, r0 * 0.78, { step: 0.3 }), { radial: 9, rng, noise: 0.07, oval: 0.07, bend: bow(rng, H, 0.03), color: stakeTone(0.85 + rng() * 0.2), capTop: true });
        g.translate(0, -0.25, 0);
        // lean towards the partner stake (~3°) plus a random wobble, about the fence direction
        const sx = n.x + px * sp * sgn, sz = n.z + pz * sp * sgn;
        g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(n.dir[0], 0, n.dir[1]), sgn * 0.05 + (rng() - 0.5) * 0.03));
        g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(px, 0, pz), (rng() - 0.5) * 0.06));
        g.translate(sx, ground(sx, sz), sz);
        stakes.push(g);
      }
    }

    // ── rails: one per height per span, ends overlapping into the next pair ──
    const spans = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      if (a.gate && b.gate) { spans.push({ a, b, gate: true }); continue; }
      spans.push({ a, b });
    }
    for (const sp of spans) {
      if (sp.gate) continue;
      const { a, b } = sp;
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
      for (let h = 0; h < 3; h++) {
        if (rng() < 0.03) continue; // one or two rails missing — knocked down
        const over0 = a.gate ? 0.14 : 0.25 + rng() * 0.3, over1 = b.gate ? 0.14 : 0.25 + rng() * 0.3;
        const r = 0.042 + rng() * 0.016;
        const stack = (h % 2 ? 1 : -1) * 0.02; // overlapping ends ride on each other
        const ya = a.gy + RAILS[h] + stack + (rng() - 0.5) * 0.06, yb = b.gy + RAILS[h] - stack + (rng() - 0.5) * 0.06;
        const len = L + over0 + over1;
        const sag = 0.03 + L * 0.008;
        const fresh = rng() < 0.08;
        const g = turned(logProfile(len, r, r * 0.8, { step: 0.4 }), {
          radial: 9, rng, noise: 0.06, oval: 0.08, capTop: true, capBottom: true,
          bend: (y) => { const t = y / len; return [Math.sin(Math.PI * t) * sag * 0.3, 0]; },
          color: (y, ang, c) => { const k = fresh ? 1.1 : 0.85 + rng() * 0.002; c[0] = fresh ? 0.95 : 0.9 * k; c[1] = fresh ? 0.86 : 0.86 * k; c[2] = fresh ? 0.66 : 0.8 * k; },
        });
        // sag: bow downward (bend x is in the rail's local frame → after orient points down if roll fits)
        // rails meeting a gate post run past its inner face, lashed to it, clear of the sliding gate rails
        const ia = a.gate ? SIDE : 0, ib = b.gate ? SIDE : 0;
        const p0 = [a.x - ux * over0 + ia, ya, a.z - uz * over0], p1 = [b.x + ux * over1 + ib, yb, b.z + uz * over1];
        orientRail(g, p0, p1, sag);
        (fresh ? railsFresh : rails).push(g);
        // lashing loops at both ends (around both stakes of the pair), under the rail
        for (const [n, end] of [[a, 0], [b, 1]]) {
          if (n.gate) { lashes.push(postLashing(rng, n, end ? yb : ya, end ? r * 0.8 : r)); continue; }
          if (end === 1 && h % 2 === 0) continue; // one lashing per height per pair
          lashes.push(lashing(rng, n, (end ? yb : ya) - r - 0.01));
        }
      }
    }
    return { stakes: merge([...stakes, ...gateWood]), rails: merge(rails), fresh: merge(railsFresh), lashes: merge(lashes.map(noSway)) };
  });

  // ── the gate: three rails through the mortises, as one group that slides and swings ──
  const gLen = GATE.z1 - GATE.z0 + 0.7;
  const gate = new THREE.Group();
  gate.name = 'gate';
  // pivot at the north post (gN); rails run south through the south post
  gate.position.set(gN.x, 0, gN.z);
  const gateGeo = section(() => {
    const gateRails = [];
    for (let h = 0; h < 3; h++) {
      const r = 0.045;
      const g = turned(logProfile(gLen, r * 1.05, r * 0.85, { step: 0.35 }), { radial: 10, rng, noise: 0.05, oval: 0.06, capTop: true, capBottom: true, color: (y, a, c) => { c[0] = 0.93; c[1] = 0.86; c[2] = 0.76; } });
      const y0 = gN.gy + RAILS[h] + 0.05, y1 = gS.gy + RAILS[h] + 0.05;
      orientRail(g, [0, y0, 0.35], [0, y1, 0.35 - gLen], 0.01);
      gateRails.push(g);
    }
    return merge(gateRails);
  });
  const gateMesh = new THREE.Mesh(gateGeo, barkPole(ctx));
  gate.add(gateMesh);
  object.add(gate);
  // ── meshes ──
  const add = (g, m, name, cast = true) => { if (!g) return null; const o = new THREE.Mesh(g, m); o.name = name; o.castShadow = cast; object.add(o); return o; };
  const stakeMesh = add(fence.stakes, larch(ctx, { key: 'larch-fence', lichen: 0.5 }), 'stakes');
  const railMesh = add(fence.rails, barkPole(ctx), 'rails');
  add(fence.fresh, larch(ctx, { key: 'larch-fresh', tint: 0xfff0d0, lichen: 0 }), 'rails-fresh');
  add(fence.lashes, rope({ key: 'willow', colors: [0x8d7c62, 0x6e5f4a], plies: 2, pitch: 0.03, radius: 0.006, sheen: 0.2 }), 'lashings', false);

  // trodden earth inside the pen, spilling out through the gate; dung pats
  const shape = (x, z) => {
    const inside = Math.min(W - Math.abs(x), D - Math.abs(z));
    let c = 0.35 + inside * 0.6 + Math.sin(x * 0.7 + z * 0.3) * 0.15;
    const gx = x + W, gz = z - (GATE.z0 + GATE.z1) / 2;
    c = Math.max(c, 1.2 - Math.hypot(gx * 0.5 + 0.2, gz * 0.7) * 0.35);
    return c;
  };
  const yard = section(() => {
    const tg = troddenPatch(ground, -W - 5, W + 0.6, -D - 0.6, D + 0.6, shape, { step: 0.5, lift: 0.03 });
    const pats = [];
    for (let i = 0; i < 22; i++) {
      const x = (rng() - 0.5) * (2 * W - 1.5), z = (rng() - 0.5) * (2 * D - 1.5);
      const r = 0.11 + rng() * 0.08, age = rng();
      const g = new THREE.SphereGeometry(r, 12, 5, 0, TAU, 0, Math.PI / 2);
      g.scale(1, 0.18 + rng() * 0.1, 0.8 + rng() * 0.3);
      g.rotateY(rng() * TAU);
      g.translate(x, ground(x, z) + 0.005, z);
      const col = age < 0.5 ? [0.09, 0.07, 0.04] : [0.22, 0.19, 0.14];
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(col).flat(), 3));
      pats.push(g);
    }
    // uncut grass at the stake feet, outside the pen (inside it is grazed and trodden)
    const gr = [];
    for (const n of loop) {
      const ox = n.side === 0 ? 0 : n.side === 1 ? 0.25 : n.side === 2 ? 0 : -0.25, oz = n.side === 0 ? -0.25 : n.side === 2 ? 0.25 : 0;
      gr.push(grassClump(rng, ground, n.x + ox, n.z + oz, { n: 40, r: 0.3, h: 0.5 }));
    }
    return { tg, pats: merge(pats), grass: merge(gr) };
  });
  const earth = add(yard.tg, trodden(ctx, { key: 'trodden-pen', hoof: 1.3 }), 'earth', false);
  earth.receiveShadow = true; earth.renderOrder = -1;
  add(yard.pats, plain('dung', { roughness: 0.88, bump: 0.003, bumpFreq: 30 }), 'dung', false);
  add(yard.grass, grass(), 'grass', false);

  // ── colliders: the four sides as thin boxes, the west side split at the gate ──
  const colliders = [
    { x: 0, z: -D, hw: W + 0.1, hd: 0.12 },
    { x: 0, z: D, hw: W + 0.1, hd: 0.12 },
    { x: W, z: 0, hw: 0.12, hd: D + 0.1 },
    { x: -W, z: (-D + GATE.z0) / 2, hw: 0.12, hd: (GATE.z0 + D) / 2 },
    { x: -W, z: (GATE.z1 + D) / 2, hw: 0.12, hd: (D - GATE.z1) / 2 },
  ];
  const gateClosed = { x: -W, z: (GATE.z0 + GATE.z1) / 2, hw: 0.12, hd: (GATE.z1 - GATE.z0) / 2 };
  colliders.push(gateClosed);

  // ── the gate act: slide the rails out of the south post, swing them outward about the north post ──
  const SWING = 1.25; // radians about the north post; positive swings the free ends outward (−X)
  const SLIDE = 0.5;
  let open = false, busy = false, gateCol = null;
  const tw = (x, z) => {
    const c = Math.cos(placement.yaw || 0), s = Math.sin(placement.yaw || 0);
    return { x: placement.x + x * c + z * s, z: placement.z - x * s + z * c };
  };
  const findCollider = (game) => {
    if (gateCol || !game?.world?.colliders) return gateCol;
    const w = tw(gateClosed.x, gateClosed.z);
    gateCol = game.world.colliders.find((k) => k.kind === 'box' && k.hw === gateClosed.hw && k.hd === gateClosed.hd && Math.abs(k.x - w.x) < 1e-6 && Math.abs(k.z - w.z) < 1e-6) || null;
    return gateCol;
  };
  const setCollider = (game, isOpen) => {
    const k = findCollider(game);
    if (!k) return;
    // open: the rails lie outward from the north post at the swing angle
    const ang = isOpen ? SWING : 0, half = (GATE.z1 - GATE.z0) / 2;
    const mx = isOpen ? gN.x - half * Math.sin(ang) : gateClosed.x, mz = isOpen ? gN.z - half * Math.cos(ang) : gateClosed.z;
    const w = tw(mx, mz), a = (placement.yaw || 0) + ang;
    k.x = w.x; k.z = w.z; k.c = Math.cos(a); k.s = Math.sin(a);
  };
  const pose = (slide, swing) => {
    gateMesh.position.set(0, 0, slide);
    gate.rotation.y = swing;
  };
  const act = {
    id: 'gate', thenCard: false,
    label: { sah: 'сүрдьүгэһи ас', en: 'open the gate rails', ru: 'отодвинуть жерди ворот' },
    run: async (game, it) => {
      if (busy) return;
      busy = true;
      const to = !open;
      game?.audio?.play('gate', object.localToWorld(new THREE.Vector3(gN.x, 1, (GATE.z0 + GATE.z1) / 2)));
      if (to) {
        await tween(0.9, (t) => pose(SLIDE * ease(t), 0));
        await tween(1.1, (t) => pose(SLIDE, SWING * ease(t)));
      } else {
        await tween(1.1, (t) => pose(SLIDE, SWING * (1 - ease(t))));
        await tween(0.9, (t) => pose(SLIDE * (1 - ease(t)), 0));
      }
      open = to;
      setCollider(game, open);
      act.label = open ? { sah: 'сүрдьүгэһи сап', en: 'close the gate rails', ru: 'задвинуть жерди ворот' } : { sah: 'сүрдьүгэһи ас', en: 'open the gate rails', ru: 'отодвинуть жерди ворот' };
      if (game) game.focus = undefined; // refresh the prompt
      busy = false;
    },
  };

  const fenceTarget = new THREE.Group();
  fenceTarget.name = 'kuruo-fence';
  for (const m of [stakeMesh, railMesh]) { object.remove(m); fenceTarget.add(m); }
  object.add(fenceTarget);

  object.userData.info = { tris: [stakeMesh, railMesh, gateMesh].reduce((s, m) => s + tris(m.geometry), 0) };
  return {
    object,
    colliders,
    floors: [],
    interactables: [
      { entry: 'kuruo', target: gate, act, label: { sah: 'сүрдьүгэс', en: 'gate rails (сүрдьүгэс)', ru: 'жердевые ворота (сүрдьүгэс)' } },
      { entry: 'kuruo', target: fenceTarget },
    ],
  };
}

// Lay a rail (built along +Y) from p0 to p1, rolled so its bend sags downward.
function orientRail(g, p0, p1, sag) {
  // turned() bends along +X in local space; rotate so +X maps to world down after aligning Y → axis
  const A = new THREE.Vector3(...p0), B = new THREE.Vector3(...p1);
  const axis = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const xAfter = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const down = new THREE.Vector3(0, -1, 0).sub(axis.clone().multiplyScalar(-axis.y)).normalize();
  let roll = Math.atan2(xAfter.clone().cross(down).dot(axis), xAfter.dot(down));
  const m = new THREE.Matrix4().makeRotationY(roll);
  m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
  m.premultiply(new THREE.Matrix4().makeTranslation(A.x, A.y, A.z));
  g.applyMatrix4(m);
  void sag;
}

// Twisted willow-bark band wrapped around both stakes of a pair at height y (two turns).
function lashing(rng, n, y) {
  const px = -n.dir[1], pz = n.dir[0];
  const sp = n.corner ? 0.14 : 0.11;
  const pts = [];
  const N = 22;
  for (let k = 0; k <= N * 2; k++) {
    const t = k / N, a = t * TAU;
    // a stadium around the two stakes: long axis across the fence
    const ex = Math.cos(a) * (sp + 0.065), ez = Math.sin(a) * 0.075;
    pts.push(new THREE.Vector3(n.x + px * ex + n.dir[0] * ez, y + t * 0.025 + (rng() - 0.5) * 0.004, n.z + pz * ex + n.dir[1] * ez));
  }
  return tube(pts, 0.007, { radial: 4 });
}

// Willow band binding a fence rail to a gate post's inner face: two turns around the post, one
// over the rail and one under it, so the rail hangs in the band. yc / rr: the rail's axis height and radius.
function postLashing(rng, n, yc, rr) {
  const west = -0.118, cu = (SIDE + west) / 2, eu = (SIDE - west) / 2, ev = 0.125, R = rr * 1.22 + 0.009;
  const pts = [], N = 26;
  for (let k = 0; k <= N * 2; k++) {
    const t = k / N, a = Math.PI + t * TAU, s = t < 1 ? 1 : -1; // turns start and swap behind the post
    const u = cu + Math.cos(a) * eu, v = Math.sin(a) * ev;
    const y = yc + s * Math.sqrt(Math.max(0, R * R - (u - SIDE) ** 2)) + (rng() - 0.5) * 0.004;
    pts.push(new THREE.Vector3(n.x + u, y, n.z + v));
  }
  return tube(pts, 0.007, { radial: 4 });
}
