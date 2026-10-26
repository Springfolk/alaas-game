// Ампаар: the log storehouse. A 4 × 4 m cell of round larch logs notched "в обло" (corners project
// ~27 cm), nine courses on low larch sill blocks, a flat roof of ceiling poles on three beams under
// ~40 cm of grassed earth. A low plank door (0.75 × 1.38 m) over a raised log threshold faces +X;
// it opens inward (act, toggles). Earth floor inside. Along the back wall a pole platform ~0.9 m up
// with birch-bark boxes and rolled hides; on the floor the tar tub (суорат/тар, act: lift the lid),
// a low shelf with cream and the küörchekh whisk, tools on pegs and against the walls.
import * as THREE from 'three/webgpu';
import { texture, vec3, float, mix, smoothstep, positionWorld, normalWorld, mx_noise_float, normalMap } from 'three/tsl';
import { turned, logProfile, bow, tube, orient, board, merge } from './yard/geo.js';
import { larch, birchBark, hide, plain, grass, rope } from './yard/mat.js';
import { groundOf, grassClump, noSway, tween, ease, troddenPatch, blob } from './yard/bits.js';
import { trodden } from './yard/mat.js';
import { section } from '../load/geocache.js';

const TAU = Math.PI * 2;
const HW = 1.9;            // wall centre lines at ±HW
const OVER = 0.27;         // corner projection
const Y0 = 0.08;           // sill block height
const STEP = 0.2;          // course spacing
const COURSES = 9;
const DOOR = { z0: -0.38, z1: 0.38 };

export default async function build(ctx, placement) {
  const { rng } = ctx;
  const ground = groundOf(ctx, placement);
  const object = new THREE.Group();
  object.name = 'ampaar';
  const g0 = ground(0, 0);

  // the geometry runs in section()s, which a bake stands in for (src/load/geocache.js)
  const house = section(() => {
    const logs = [];
    const logTone = (k, y0) => (y, a, c) => {
      // logs are built along +Y; tone by the world height of the course (damp and splash near the ground)
      const d = Math.max(0, Math.min(1, (0.45 - y0) / 0.4));
      c[0] = 0.95 * k * (1 - d * 0.3); c[1] = 0.88 * k * (1 - d * 0.34); c[2] = 0.77 * k * (1 - d * 0.38);
    };
    const addLog = (p0, p1, r, { caps = true, k = 0.85 + rng() * 0.22 } = {}) => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const g = turned(logProfile(L, r, r * 0.86, { step: 0.3 }), {
        radial: 14, rng, noise: 0.05, oval: 0.05, bend: bow(rng, L, 0.025), capTop: caps, capBottom: caps,
        color: logTone(k, (p0[1] + p1[1]) / 2 - g0),
      });
      orient(g, p0, p1, rng() * TAU);
      logs.push(g);
    };

    // courses: front/back walls (logs along z at x = ±HW) on whole steps, side walls (along x) half a step up
    let lintelY = 0, thresholdY = 0;
    for (let i = 0; i < COURSES; i++) {
      for (const sx of [-1, 1]) {
        const r = 0.105 + rng() * 0.02, y = g0 + Y0 + 0.11 + i * STEP;
        const zA = -HW - OVER - rng() * 0.05, zB = HW + OVER + rng() * 0.05;
        const x = sx * HW + (rng() - 0.5) * 0.02;
        if (sx > 0 && y - r < 1.66 + g0 && y > g0 + 0.3 && i > 0) {
          // the door opening: the course is two logs with sawn ends at the jambs
          addLog([x, y, zA], [x, y, DOOR.z0 - 0.06], r);
          addLog([x, y, DOOR.z1 + 0.06], [x, y, zB], r);
        } else {
          if (sx > 0 && i === 0) thresholdY = y + r * 0.9 - g0;
          if (sx > 0 && !lintelY && i > 0) lintelY = y - r * 0.85 - g0;
          addLog([x, y, zA], [x, y, zB], r);
        }
      }
      for (const sz of [-1, 1]) {
        const r = 0.105 + rng() * 0.02, y = g0 + Y0 + 0.11 + (i + 0.5) * STEP;
        addLog([-HW - OVER - rng() * 0.05, y, sz * HW + (rng() - 0.5) * 0.02], [HW + OVER + rng() * 0.05, y, sz * HW], r);
      }
    }
    const topY = Y0 + 0.11 + (COURSES - 0.5) * STEP + 0.11; // top of the side walls
    // plate logs: a last half course on the front/back walls so the ceiling poles bear on all four walls
    for (const sx of [-1, 1]) addLog([sx * HW, g0 + topY - 0.02, -HW - OVER], [sx * HW, g0 + topY - 0.02, HW + OVER], 0.1);
    // sill beams under the side walls and corner sill blocks
    const sills = [];
    for (const sz of [-1, 1]) {
      const b = board(4.5, 0.2, 0.22, { color: [0.62, 0.58, 0.52] });
      b.translate(0, g0 + 0.1, sz * HW);
      sills.push(b);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const b = turned(logProfile(0.28, 0.16, 0.15, { step: 0.14 }), { radial: 12, rng, noise: 0.06, capTop: true, color: (y, a, c) => { c[0] = 0.55; c[1] = 0.5; c[2] = 0.44; } });
      b.translate(sx * HW, g0 - 0.2 + Y0, sz * HW);
      sills.push(b);
    }
    // door jambs (hewn boards) and the hanging door
    const jambs = [];
    for (const z of [DOOR.z0 - 0.04, DOOR.z1 + 0.04]) {
      const b = board(0.22, lintelY - thresholdY + 0.12, 0.08, { color: [0.82, 0.76, 0.68] });
      b.translate(HW, g0 + (lintelY + thresholdY) / 2, z);
      jambs.push(b);
    }

    // ceiling: three beams across (along x) resting on the front/back walls; poles along z on them
    const beamY = g0 + topY - 0.1; // beams notched half into the top course of the front/back walls
    for (const z of [-1.2, 0, 1.2]) addLog([-HW - 0.35, beamY, z + (rng() - 0.5) * 0.1], [HW + 0.35, beamY + 0.01, z], 0.1);
    const poleY = beamY + 0.14;
    for (let z = -HW - 0.25; z <= HW + 0.25; z += 0.125) {
      const r = 0.055 + rng() * 0.015;
      addLog([z, poleY + (rng() - 0.5) * 0.02, -HW - 0.3 - rng() * 0.15], [z + (rng() - 0.5) * 0.04, poleY, HW + 0.3 + rng() * 0.15], r, { k: 0.7 + rng() * 0.2 });
    }
    return { walls: merge([...logs, ...sills, ...jambs]), lintelY, thresholdY, poleY };
  });

  const { lintelY, thresholdY, poleY } = house;
  const wallMesh = new THREE.Mesh(house.walls, larch(ctx, { key: 'larch-ampaar', lichen: 0.7 }));
  wallMesh.name = 'ampaar-logs';
  const walls = new THREE.Group();
  walls.name = 'ampaar';
  walls.add(wallMesh);
  object.add(walls);

  // ── earth roof: a lumpy mound on the poles, grass on top, bare crumbling earth at the edges ──
  const roofY = poleY + 0.06;
  const roof = earthRoof(ctx, rng, roofY, 2.12, 0.36);
  walls.add(roof.mesh);
  const roofGrass = new THREE.Mesh(roof.grass, grass());
  roofGrass.castShadow = false;
  object.add(roofGrass);

  // ── the door: three planks on two battens, a leather pull; hinged at the north jamb, opens inward ──
  const doorW = DOOR.z1 - DOOR.z0 + 0.04, doorH = lintelY - thresholdY + 0.02;
  const door = new THREE.Group();
  door.name = 'ampaar-door';
  door.position.set(HW - 0.02, g0 + thresholdY, DOOR.z0 - 0.02);
  const doorGeo = section(() => {
    const planks = [];
    let z = 0;
    for (let i = 0; i < 3; i++) {
      const w = doorW / 3 + (rng() - 0.5) * 0.02;
      const b = board(0.045, doorH - rng() * 0.015, w - 0.006, { color: [0.82 + rng() * 0.1, 0.78, 0.7] });
      b.translate(0, doorH / 2, z + w / 2);
      planks.push(b);
      z += w;
    }
    for (const y of [0.25, doorH - 0.25]) { const b = board(0.04, 0.12, doorW - 0.06, { color: [0.75, 0.7, 0.62] }); b.translate(-0.042, y, doorW / 2); planks.push(b); }
    return merge(planks.map(uvMetres));
  });
  const doorMat = larch(ctx, { key: 'larch-door', lichen: 0.3 });
  const doorMesh = new THREE.Mesh(doorGeo, doorMat);
  door.add(doorMesh);
  // leather pull loop
  const pull = tube([[0.03, doorH * 0.55, doorW - 0.1], [0.07, doorH * 0.5, doorW - 0.1], [0.07, doorH * 0.44, doorW - 0.1], [0.03, doorH * 0.42, doorW - 0.1]], 0.007, { radial: 6 });
  const pullMesh = new THREE.Mesh(noSway(pull), plain('leather-dark', { roughness: 0.55 }));
  pull.attributes.color.array.fill(0.12);
  door.add(pullMesh);
  object.add(door);

  // ── the inside ──
  const inside = new THREE.Group();
  inside.name = 'ampaar-inside';
  object.add(inside);
  const props = { wood: [], bark: [], hides: [], iron: [], stone: [], food: [], cord: [] };
  platform(rng, g0, props);
  const tar = tarTub(ctx, rng, g0, props, inside);
  const cream = creamShelf(rng, g0, props, inside);
  tools(rng, g0, props);
  const pm = {
    wood: larch(ctx, { key: 'larch-props', lichen: 0, normalScale: 0.6 }),
    bark: birchBark('birch-ampaar'),
    hides: hide('hide'),
    iron: plain('iron', { roughness: 0.72, metal: 0.5 }),
    stone: plain('stone', { roughness: 0.85, bump: 0.002, bumpFreq: 20 }),
    food: plain('food', { roughness: 0.4 }),
    cord: rope({ key: 'tether', colors: [0x231c15, 0x3a2e22, 0x15110d], plies: 3, pitch: 0.035, radius: 0.006 }),
  };
  for (const [k, list] of Object.entries(props)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(merge(k === 'cord' ? list.map(noSway) : list), pm[k]);
    m.name = 'props-' + k;
    inside.add(m);
  }

  // trodden earth before the door and round the house; the earth floor inside the walls (|x|, |z| < HW + 0.1: the
  // x test once had no lower bound, so the floor ran out past the back wall)
  const eg = section(() => {
    const tg = troddenPatch(ground, -2.8, 4.6, -2.8, 2.8, (x, zz) => Math.max(blob(3.0, 0, 1.6, 1.2, 4)(x, zz), Math.abs(x) < HW + 0.1 && Math.abs(zz) < HW + 0.1 ? 1.2 : blob(0, 0, 2.6, 2.6, 6, 0.6)(x, zz) * 0.6), { step: 0.35 });
    const gr = [];
    for (let i = 0; i < 26; i++) {
      const s = rng() * 4 - 2, side = Math.floor(rng() * 4);
      const x = side === 0 ? -HW - 0.2 : side === 1 ? HW + 0.2 : s * 1.1, zz = side === 2 ? -HW - 0.2 : side === 3 ? HW + 0.2 : s * 1.1;
      if (side === 1 && Math.abs(zz) < 0.9) continue;
      gr.push(grassClump(rng, ground, x, zz, { n: 30, r: 0.3, h: 0.4 }));
    }
    return { tg, grass: merge(gr) };
  });
  const earth = new THREE.Mesh(eg.tg, trodden(ctx, { key: 'trodden-ampaar', hoof: 0.2 }));
  earth.castShadow = false; earth.renderOrder = -1;
  object.add(earth);
  const grassMesh = new THREE.Mesh(eg.grass, grass()); // grass along the foot of the walls
  grassMesh.castShadow = false;
  object.add(grassMesh);

  // ── colliders, floors ──
  const T = 0.14;
  const colliders = [
    { x: -HW, z: 0, hw: T, hd: HW + T },
    { x: 0, z: -HW, hw: HW + T, hd: T },
    { x: 0, z: HW, hw: HW + T, hd: T },
    { x: HW, z: (-HW - T + DOOR.z0) / 2, hw: T, hd: (DOOR.z0 + HW + T) / 2 },
    { x: HW, z: (DOOR.z1 + HW + T) / 2, hw: T, hd: (HW + T - DOOR.z1) / 2 },
    { x: -HW + 0.5, z: 0, hw: 0.36, hd: 1.62 },           // the platform
    { x: tar.x, z: tar.z, r: 0.27 },
    { x: cream.x, z: cream.z, hw: 0.22, hd: 0.45 },
  ];
  const doorCol = { x: HW, z: (DOOR.z0 + DOOR.z1) / 2, hw: T, hd: (DOOR.z1 - DOOR.z0) / 2 };
  colliders.push(doorCol);
  const floors = [{ x: HW, z: 0, hw: 0.13, hd: (DOOR.z1 - DOOR.z0) / 2, h: thresholdY }];
  const lows = [{ x: HW, z: 0, hw: T + 0.05, hd: (DOOR.z1 - DOOR.z0) / 2, h: lintelY }]; // stoop through the low door

  // ── door act ──
  let open = false, busy = false, doorK = null;
  const c0 = Math.cos(placement.yaw || 0), s0 = Math.sin(placement.yaw || 0);
  const tw = (x, z2) => ({ x: placement.x + x * c0 + z2 * s0, z: placement.z - x * s0 + z2 * c0 });
  const toLocal = (wx, wz) => { const dx = wx - placement.x, dz = wz - placement.z; return [dx * c0 - dz * s0, dx * s0 + dz * c0]; };
  const findDoor = (game) => {
    if (doorK || !game?.world?.colliders) return doorK;
    const w = tw(doorCol.x, doorCol.z);
    doorK = game.world.colliders.find((k) => k.kind === 'box' && k.hw === doorCol.hw && k.hd === doorCol.hd && Math.abs(k.x - w.x) < 1e-6 && Math.abs(k.z - w.z) < 1e-6) || null;
    return doorK;
  };
  const OPEN = -1.75; // radians: swung inward against the north wall
  const doorAct = {
    id: 'door', thenCard: false,
    label: { sah: 'аанны ас', en: 'open the door', ru: 'открыть дверь' },
    run: async (game) => {
      if (busy) return;
      busy = true;
      const to = !open;
      game?.audio?.play('door', object.localToWorld(new THREE.Vector3(HW, 1, 0)));
      await tween(1.4, (t) => { const e = ease(t); door.rotation.y = to ? OPEN * e : OPEN * (1 - e); });
      open = to;
      const k = findDoor(game);
      if (k) { k.y0 = open ? 1e5 : undefined; k.y1 = open ? 1e5 + 1 : undefined; }
      doorAct.label = open ? { sah: 'аанны сап', en: 'close the door', ru: 'закрыть дверь' } : { sah: 'аанны ас', en: 'open the door', ru: 'открыть дверь' };
      if (game) game.focus = undefined;
      busy = false;
    },
  };

  // ── tar tub act: lift the lid aside (stays off; remembered) ──
  const lidAct = {
    id: 'lid', once: true,
    label: { sah: 'бүрүйэтин арый', en: 'lift the lid', ru: 'поднять крышку' },
    run: async (game) => {
      game?.audio?.play('door', object.localToWorld(new THREE.Vector3(tar.x, 0.6, tar.z)));
      await tween(1.1, (t) => tar.liftPose(ease(t)));
    },
  };

  // casters (three starts every mesh at castShadow = false): all but the earth and grass round the house
  for (const g of [walls, door, inside]) g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  let restored = false, wasIn = false;
  return {
    object,
    colliders,
    lows,
    floors,
    interactables: [
      { entry: 'ampaar', target: door, act: doorAct, label: { sah: 'ампаар аана', en: 'ampaar door', ru: 'дверь амбара' } },
      { entry: 'ampaar', target: walls },
      { entry: 'dairy-suorat-tar', target: tar.group, act: lidAct },
      { entry: 'dairy-cream', target: cream.group },
    ],
    update: (dt, { game, camera }) => {
      if (!game) return;
      if (!restored) { restored = true; if (game.done?.has('dairy-suorat-tar:lid')) tar.liftPose(1); }
      const [lx, lz] = toLocal(camera.position.x, camera.position.z);
      const isIn = Math.abs(lx) < HW - 0.05 && Math.abs(lz) < HW - 0.05;
      if (isIn !== wasIn) { game.engine.exposureTarget = isIn ? 1.5 : 0.62; wasIn = isIn; }
    },
  };
}

// boards get uv in metres for the plank texture (grain vertical)
function uvMetres(g) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    uv.setXY(i, (ax > 0.5 ? p.getZ(i) : p.getX(i) + p.getZ(i)) * 0.9, p.getY(i) * 0.9);
  }
  return g;
}

// A lumpy earth mound on the ceiling poles; returns the mesh and grass blades for its top.
function earthRoof(ctx, rng, y0, half, depth) {
  const n = 28;
  const pos = [], idx = [], col = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = -half + (i / n) * 2 * half, z = -half + (j / n) * 2 * half;
    const e = Math.max(Math.abs(x), Math.abs(z)) / half; // 0 centre → 1 edge
    const shoulder = Math.min(1, (1 - e) / 0.14);
    const lump = Math.sin(x * 2.1 + 1.3) * Math.sin(z * 1.7) * 0.04 + Math.sin(x * 5.3 + z * 3.1) * 0.015;
    const y = y0 + (depth + lump) * Math.pow(Math.max(0, shoulder), 0.45) + (e >= 0.999 ? -0.03 : 0);
    pos.push(x, y, z);
    col.push(1, 1, 1);
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + n + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.filter((_, k) => k % 3 !== 1), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mud = ctx.maps('brown_mud_dry'), turf = ctx.maps('leafy_grass');
  const w = positionWorld.xz;
  const top = smoothstep(0.6, 0.8, normalWorld.y).mul(smoothstep(-0.3, 0.1, mx_noise_float(w.mul(1.3)).add(0.3)));
  const mat = new THREE.MeshStandardNodeMaterial();
  mat.colorNode = mix(texture(mud.diff, w.mul(0.6)).rgb.mul(vec3(0.7, 0.62, 0.55)), texture(turf.diff, w.mul(0.5)).rgb.mul(0.85), top);
  mat.roughnessNode = float(0.95);
  mat.metalnessNode = float(0);
  mat.normalNode = normalMap(texture(mud.nor, w.mul(0.6)));
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ampaar-roof';
  // grass: clumps scattered on the flat top, thinner towards the edges
  const parts = [];
  const surf = (x, z) => {
    const e = Math.max(Math.abs(x), Math.abs(z)) / half, shoulder = Math.min(1, (1 - e) / 0.14);
    const lump = Math.sin(x * 2.1 + 1.3) * Math.sin(z * 1.7) * 0.04 + Math.sin(x * 5.3 + z * 3.1) * 0.015;
    return y0 + (depth + lump) * Math.pow(Math.max(0, shoulder), 0.45);
  };
  for (let k = 0; k < 130; k++) {
    const x = (rng() - 0.5) * 2 * (half - 0.25), z = (rng() - 0.5) * 2 * (half - 0.25);
    parts.push(grassClump(rng, surf, x, z, { n: 40, r: 0.32, h: 0.38 }));
  }
  return { mesh, grass: merge(parts) };
}

// Pole platform along the back wall: forked posts, two rails, poles across; boxes and hides on it.
function platform(rng, g0, P) {
  const x0 = -HW + 0.14, x1 = -HW + 0.82, H = 0.88;
  for (const z of [-1.5, 0, 1.5]) P.wood.push(post(rng, [x1, g0, z], H, 0.05));
  P.wood.push(pole(rng, [x1, g0 + H, -1.72], [x1, g0 + H, 1.72], 0.045));
  P.wood.push(pole(rng, [x0, g0 + H, -1.72], [x0, g0 + H, 1.72], 0.045)); // rests on pegs in the wall
  for (let x = x0 - 0.03; x <= x1 + 0.05; x += 0.085) P.wood.push(pole(rng, [x, g0 + H + 0.085, -1.74], [x + (rng() - 0.5) * 0.03, g0 + H + 0.085, 1.74], 0.035 + rng() * 0.008));
  const top = g0 + H + 0.12;
  // birch-bark boxes (туос иһит): cylinders with lids, some stacked
  const boxes = [[-1.45, 0.22, 0.32], [-1.0, 0.16, 0.24], [-1.05, 0.12, 0.2, 0.24], [-0.35, 0.19, 0.38], [0.35, 0.13, 0.22]];
  for (const [z, r, h, lift = 0] of boxes) {
    const x = (x0 + x1) / 2 + (rng() - 0.5) * 0.1;
    P.bark.push(barkBox(rng, [x, top + lift, z], r, h));
  }
  // rolled hides at the north end, a folded one at the south end
  for (let i = 0; i < 3; i++) {
    const g = new THREE.CylinderGeometry(0.11 + rng() * 0.03, 0.12 + rng() * 0.03, 0.62, 18, 1);
    g.rotateX(Math.PI / 2); g.rotateY(Math.PI / 2 + (rng() - 0.5) * 0.3);
    g.translate((x0 + x1) / 2 + (rng() - 0.5) * 0.05, top + 0.12 + (i === 2 ? 0.2 : 0), 0.95 + (i === 1 ? 0.24 : 0) + (i === 2 ? 0.12 : 0));
    P.hides.push(coat(g, i === 1 ? [0.05, 0.04, 0.03] : [0.15, 0.08, 0.045]));
  }
  const fold = new THREE.BoxGeometry(0.62, 0.12, 0.52, 6, 2, 6);
  const p = fold.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 7) * 0.012 + Math.cos(p.getZ(i) * 9) * 0.01 - Math.abs(p.getX(i)) * 0.05);
  fold.computeVertexNormals();
  fold.translate((x0 + x1) / 2, top + 0.05, 1.55 - 0.3);
  P.hides.push(coat(fold, [0.12, 0.1, 0.09]));
}

// Cylinders/boxes get a coat colour and uv in metres.
function coat(g, c) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(c).flat(), 3));
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < n; i++) uv.setXY(i, p.getX(i) + p.getZ(i), p.getY(i) + p.getZ(i) * 0.5);
  return g;
}

function post(rng, base, H, r) {
  const g = turned(logProfile(H + 0.05, r, r * 0.85, { step: 0.3 }), { radial: 9, rng, noise: 0.06, capTop: true, color: (y, a, c) => { c[0] = 0.85; c[1] = 0.78; c[2] = 0.68; } });
  g.translate(base[0], base[1] - 0.05, base[2]);
  return g;
}
function pole(rng, a, b, r) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const g = turned(logProfile(L, r, r * 0.85, { step: 0.4 }), { radial: 8, rng, noise: 0.06, bend: bow(rng, L, 0.015), capTop: true, capBottom: true, color: (y, ang, c) => { const k = 0.75 + rng() * 0.01; c[0] = 0.9 * k; c[1] = 0.83 * k; c[2] = 0.72 * k; } });
  orient(g, a, b, rng() * TAU);
  return g;
}

// A birch-bark box: wall with a seam, a fitted lid with a rim.
function barkBox(rng, at, r, h) {
  const wall = turned([[0, r], [h * 0.5, r * 1.01], [h, r], [h, r - 0.004], [0.012, r - 0.004], [0.01, 0]], { radial: 28, rng, noise: 0.01, oval: 0.04, tileU: 10, tileV: 1 });
  const lid = turned([[h - 0.04, r + 0.004], [h + 0.006, r + 0.004], [h + 0.012, r * 0.9], [h + 0.014, 0]], { radial: 28, rng, noise: 0.01, oval: 0.04, tileU: 10, tileV: 1, color: (y, a, c) => { c[0] = 0.85; c[1] = 0.8; c[2] = 0.75; } });
  const g = merge([wall, lid]);
  g.rotateY(rng() * TAU);
  g.translate(at[0], at[1], at[2]);
  return g;
}

// The tar tub: a larch stave barrel 55 cm × 45 cm, three willow hoops, a board lid weighted by a stone.
function tarTub(ctx, rng, g0, P, inside) {
  const x = -0.95, z = -1.35, H = 0.55, R = 0.225;
  const group = new THREE.Group();
  group.name = 'tar-tub';
  // staves: 14 slightly bulged boards
  const staves = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, w = (TAU * R) / n - 0.004;
    const prof = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; prof.push([t * H, R * (1 + 0.06 * Math.sin(Math.PI * t))]); }
    const s = turned(prof, { radial: 3, rng, noise: 0.0, oval: 0, tileU: 0.4, tileV: 0.6, color: (y, aa, c) => { const k2 = 0.6 + (i % 3) * 0.07; c[0] = 0.9 * k2; c[1] = 0.8 * k2; c[2] = 0.68 * k2; } });
    // keep only a wedge of the ring: scale the full ring into one stave by squashing angle → use as is, rotate
    s.scale(1, 1, 1);
    staves.push(staveFrom(s, a, w / R));
  }
  // inside wall darker, bottom
  const inner = turned([[0.04, R * 0.93], [H * 0.5, R * 0.98], [H - 0.005, R * 0.94]], { radial: 24, rng, noise: 0, oval: 0, color: (y, a, c) => { c[0] = 0.32; c[1] = 0.27; c[2] = 0.21; } });
  inner.index.array.reverse();
  inner.computeVertexNormals();
  staves.push(inner);
  // the contents: sour mass with a yellowish whey film
  const contents = new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.01, 28);
  contents.translate(0, H - 0.07, 0);
  coat(contents, [0.78, 0.74, 0.6]);
  const hoops = [];
  for (const y of [0.08, H * 0.5, H - 0.06]) {
    const pts = [];
    const rr = R * (1 + 0.06 * Math.sin(Math.PI * y / H)) + 0.008;
    for (let k = 0; k <= 40; k++) { const a = (k / 40) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * rr, y, -Math.sin(a) * rr)); }
    const h = tube(pts, 0.008, { radial: 5 });
    h.attributes.color.array.fill(0.58);
    hoops.push(h);
  }
  // lid: two boards with a batten, and a river stone on it
  const lid = new THREE.Group();
  const lb = [];
  for (const dz of [-0.1, 0.1]) { const b = board(0.5, 0.025, 0.2, { color: [0.7, 0.64, 0.56] }); b.translate(0, 0, dz); lb.push(b); }
  const bat = board(0.06, 0.03, 0.42, { color: [0.62, 0.57, 0.5] }); bat.translate(0.12, -0.027, 0); lb.push(bat);
  const lidMesh = new THREE.Mesh(merge(lb), larch(ctx, { key: 'larch-props', lichen: 0, normalScale: 0.6 }));
  lid.add(lidMesh);
  const st = new THREE.IcosahedronGeometry(0.075, 2);
  const sp = st.attributes.position;
  for (let i = 0; i < sp.count; i++) { const k = 1 + Math.sin(sp.getX(i) * 40) * 0.06 + Math.cos(sp.getZ(i) * 33) * 0.05; sp.setXYZ(i, sp.getX(i) * k * 1.2, sp.getY(i) * k * 0.7, sp.getZ(i) * k); }
  st.computeVertexNormals();
  st.translate(0, 0.06, 0);
  st.setAttribute('color', new THREE.Float32BufferAttribute(new Array(sp.count).fill([0.36, 0.34, 0.31]).flat(), 3));
  const stone = new THREE.Mesh(st, plain('stone', { roughness: 0.85, bump: 0.002, bumpFreq: 20 }));
  group.add(stone);
  stone.position.y = H + 0.015;
  lid.position.set(0, H + 0.013, 0);
  group.add(lid);
  group.position.set(x, g0, z);
  inside.add(group);
  P.wood.push(...staves.map((s) => { s.translate(x, g0, z); return s; }), ...hoops.map((h) => { h.translate(x, g0, z); return h; }));
  P.food.push(contents.translate(x, g0, z));
  // a hit volume for the tub (props are merged elsewhere)
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, H + 0.12, 10), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.position.y = (H + 0.12) / 2; hit.visible = false;
  group.add(hit);
  return {
    group, x, z,
    // lift the lid off and lean it against the tub (t 0..1)
    liftPose: (t) => {
      const up = Math.sin(Math.PI * Math.min(1, t * 1.2)) * 0.12;
      lid.position.set(0.0 + t * 0.36, H + 0.013 + up - t * (H * 0.55), t * 0.05);
      lid.rotation.set(0, t * 0.3, -t * 1.32);
      // the stone is set down on the floor first, beside the tub
      const ts = Math.min(1, t * 1.6);
      stone.position.set(-0.05 * ts, H + 0.015 - ts * (H + 0.005) + Math.sin(Math.PI * ts) * 0.08, -0.36 * ts);
    },
  };
}

// cut one stave out of a 3-segment turned ring: keep the first segment, rotate to angle a
function staveFrom(g, a, span) {
  const p = g.attributes.position;
  // remap the ring's angle range [0, 2π) to a narrow wedge [0, span]
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    let ang = Math.atan2(-z, x); if (ang < 0) ang += TAU;
    const j = i % 4; // radial 3 → 4 verts per ring
    const na = a + (j / 3) * span;
    p.setXYZ(i, Math.cos(na) * r, p.getY(i), -Math.sin(na) * r);
    void ang;
  }
  g.computeVertexNormals();
  return g;
}

// A low plank shelf by the south wall with the cream: a birch-bark cream vessel with the skimming
// spoon across it, a wooden kytyya of küörchekh, and the ribbed whisk.
function creamShelf(rng, g0, P, inside) {
  const x = 0.45, z = HW - 0.42;
  const group = new THREE.Group();
  group.name = 'cream';
  const H = 0.5;
  // shelf: a thick plank on two blocks
  const top = board(0.85, 0.05, 0.38, { color: [0.72, 0.66, 0.58] }); top.translate(x, g0 + H, z); P.wood.push(top);
  for (const dx of [-0.32, 0.32]) { const b = board(0.12, H - 0.025, 0.3, { color: [0.6, 0.55, 0.48] }); b.translate(x + dx, g0 + (H - 0.025) / 2, z); P.wood.push(b); }
  const sy = g0 + H + 0.025;
  // сүөгэй ыаҕас: birch-bark vessel, 22 cm, with cream
  const vx = x - 0.2;
  const vessel = turned([[0, 0.1], [0.18, 0.11], [0.2, 0.11], [0.2, 0.105], [0.03, 0.095], [0.028, 0]], { radial: 28, rng, noise: 0.01, oval: 0.04, tileU: 10, tileV: 1 });
  vessel.translate(vx, sy, z);
  P.bark.push(vessel);
  const creamTop = new THREE.CircleGeometry(0.104, 28); creamTop.rotateX(-Math.PI / 2); creamTop.translate(vx, sy + 0.17, z);
  P.food.push(coat(creamTop, [0.86, 0.76, 0.52]));
  // the flat skimming spoon across the rim
  const spoon = board(0.03, 0.008, 0.3, { color: [0.86, 0.8, 0.7] });
  spoon.rotateY(0.5); spoon.translate(vx, sy + 0.205, z);
  P.wood.push(spoon);
  // kytyya (wooden bowl) heaped with whipped küörchekh and a few bilberries
  const bx = x + 0.17;
  const bowl = turned([[0, 0.06], [0.02, 0.07], [0.07, 0.12], [0.1, 0.135], [0.103, 0.13], [0.09, 0.115], [0.04, 0.07], [0.025, 0]], { radial: 32, rng, noise: 0.006, oval: 0.02, tileU: 0.3, tileV: 0.3, color: (y, a, c) => { c[0] = 0.62; c[1] = 0.5; c[2] = 0.36; } });
  bowl.translate(bx, sy, z + 0.02);
  P.wood.push(bowl);
  const foam = new THREE.SphereGeometry(0.115, 24, 10, 0, TAU, 0, Math.PI / 2);
  const fp = foam.attributes.position;
  for (let i = 0; i < fp.count; i++) { const k = 1 + Math.sin(fp.getX(i) * 60) * 0.05 + Math.cos(fp.getZ(i) * 55 + fp.getY(i) * 40) * 0.05; fp.setXYZ(i, fp.getX(i) * k, fp.getY(i) * 0.55 * k, fp.getZ(i) * k); }
  foam.computeVertexNormals();
  foam.translate(bx, sy + 0.085, z + 0.02);
  P.food.push(coat(foam, [0.9, 0.87, 0.78]));
  for (let i = 0; i < 7; i++) {
    const a = rng() * TAU, d = rng() * 0.07;
    const b = new THREE.SphereGeometry(0.006, 6, 4);
    b.translate(bx + Math.cos(a) * d, sy + 0.085 + 0.06 * Math.sqrt(1 - (d / 0.115) ** 2) * 0.9, z + 0.02 + Math.sin(a) * d);
    P.food.push(coat(b, [0.03, 0.035, 0.09]));
  }
  // the küörchekh whisk: 45 cm shaft, an 8-ribbed disc, leaning in the bowl
  const shaft = turned(logProfile(0.45, 0.009, 0.008, { step: 0.15, extra: [0.44] }), { radial: 8, rng, noise: 0.02, capTop: true, color: (y, a, c) => { c[0] = 0.86; c[1] = 0.8; c[2] = 0.68; } });
  const disc = turned([[0, 0.0], [0.002, 0.04], [0.015, 0.04], [0.017, 0]], { radial: 16, rng, noise: 0, oval: 0, carve: (y, a) => (Math.cos(a * 8) > 0.6 ? 0.006 : -0.004), color: (y, a, c) => { c[0] = 0.86; c[1] = 0.8; c[2] = 0.68; } });
  const whisk = merge([shaft, disc]);
  whisk.rotateZ(-0.5); whisk.rotateY(0.3);
  whisk.translate(bx - 0.03, sy + 0.05, z + 0.03);
  P.wood.push(whisk);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.36), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.position.set(x, g0 + H + 0.17, z); hit.visible = false;
  group.add(hit);
  inside.add(group);
  return { group, x, z };
}

// Tools: a wooden rake and a wooden shovel against the north wall, an axe in a chopping block,
// a horsehair rope coil and a scythe on pegs.
function tools(rng, g0, P) {
  const wallZ = -HW + 0.14;
  // rake: 1.7 m handle, head with teeth
  const rx = 0.6;
  P.wood.push(pole(rng, [rx, g0 + 0.02, wallZ + 0.25], [rx + 0.12, g0 + 1.66, wallZ + 0.02], 0.016));
  const head = board(0.5, 0.04, 0.035, { color: [0.82, 0.76, 0.66] }); head.translate(rx + 0.12, g0 + 1.7, wallZ + 0.02); P.wood.push(head);
  for (let i = 0; i < 9; i++) { const t = pole(rng, [rx + 0.12 - 0.22 + i * 0.055, g0 + 1.72, wallZ + 0.02], [rx + 0.12 - 0.22 + i * 0.055, g0 + 1.82, wallZ + 0.03], 0.005); P.wood.push(t); }
  // wooden shovel (larch, blade and handle in one)
  const sx = 1.05;
  P.wood.push(pole(rng, [sx, g0 + 0.32, wallZ + 0.2], [sx + 0.05, g0 + 1.45, wallZ + 0.03], 0.016));
  const blade = board(0.2, 0.32, 0.025, { color: [0.78, 0.72, 0.62] }); blade.rotateX(-0.17); blade.translate(sx - 0.01, g0 + 0.17, wallZ + 0.23); P.wood.push(blade);
  // chopping block with an axe
  const bx = 1.35, bz = -0.6;
  P.wood.push(turned(logProfile(0.42, 0.2, 0.19, { step: 0.21 }), { radial: 16, rng, noise: 0.05, capTop: true, color: (y, a, c) => { c[0] = 0.7; c[1] = 0.62; c[2] = 0.52; } }).translate(bx, g0, bz));
  const helve = pole(rng, [bx - 0.05, g0 + 0.44, bz + 0.02], [bx - 0.42, g0 + 0.68, bz + 0.12], 0.016);
  P.wood.push(helve);
  const axe = board(0.03, 0.12, 0.15, { color: [0.18, 0.17, 0.16] }); axe.rotateZ(0.6); axe.translate(bx - 0.02, g0 + 0.47, bz + 0.02);
  P.iron.push(axe);
  // pegs and a coiled rope on the north wall, near the door
  const px = 1.45, py = g0 + 1.35;
  P.wood.push(pole(rng, [px, py, -HW + 0.08], [px, py + 0.02, -HW + 0.25], 0.018));
  for (let l = 0; l < 6; l++) {
    const pts = [];
    for (let k = 0; k <= 30; k++) { const a = (k / 30) * TAU; pts.push(new THREE.Vector3(px + Math.sin(a) * (0.13 + l * 0.004), py - (1 - Math.cos(a)) * (0.2 + l * 0.01), -HW + 0.21 + l * 0.008)); }
    P.cord.push(tube(pts, 0.006, { radial: 6 }));
  }
  // a scythe hung on two pegs over the platform end
  const sy2 = g0 + 1.6;
  P.wood.push(pole(rng, [-0.2, sy2, -HW + 0.16], [0.95, sy2 + 0.08, -HW + 0.16], 0.016));
  const bl = [];
  for (let k = 0; k <= 12; k++) { const t = k / 12; bl.push(new THREE.Vector3(-0.2 - t * 0.02, sy2 - 0.02 - t * 0.04, -HW + 0.17 + Math.sin(t * 2.2) * 0.25)); }
  const bladeG = tube(bl, (t) => 0.004 + 0.014 * (1 - t), { radial: 4 });
  bladeG.scale(1, 1, 1);
  bladeG.attributes.color.array.fill(0.1);
  P.iron.push(bladeG);
}
