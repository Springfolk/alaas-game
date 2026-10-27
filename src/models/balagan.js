// Балаҕан — the Sakha sloping-walled house with its khoton on the north wall.
// Default: the light summer balagan of the сайылык (door open, hearth alive, things in use).
// variant 'winter': the empty winter house (кыстык) across the alaas in summer: closed up, cold hearth,
// fuller plaster, door shut but openable, emptied of dishes and vessels, its barn yard and doors grown over with weeds.
// Parts live in ./balagan/: dims (sizes), geo (helpers), mats (TSL materials), shell, hearth, interior, plants.
import * as THREE from 'three/webgpu';
import { uniform, vec3, vec4, uv, length, smoothstep, mx_fractal_noise_float, time } from 'three/tsl';
import { makeMats } from './balagan/mats.js';
import { geoMats, section } from '../load/geocache.js';
import { Buckets, rrect } from './balagan/geo.js';
import { buildShell } from './balagan/shell.js';
import { buildHearth } from './balagan/hearth.js';
import { buildInterior } from './balagan/interior.js';
import { PlantBatch, sodRoof } from './balagan/plants.js';
import { groundOf, troddenPatch, blob } from './yard/bits.js';
import { trodden } from './yard/mat.js';
import { FX, FZ, H, ZD, DW, DH, XD, ROOF, HEARTH, WIN, KH, inner } from './balagan/dims.js';

const OUTSIDE_EXPOSURE = 0.62, INSIDE_EXPOSURE = 1.9;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function build(ctx, placement) {
  const winter = placement.variant === 'winter';
  const rng = ctx.rng;
  const Y = placement.y || 0;                  // collider heights are compared in world units
  const root = new THREE.Group();
  root.name = winter ? 'balagan-kystyk' : 'balagan';
  const M = makeMats(ctx.maps, { winter });
  geoMats(M); // baked buckets find their materials by name in M (src/load/geocache.js)
  M.floorMat = M.floor([HEARTH.x, HEARTH.z]);

  const shell = buildShell({ M, rng, winter, root });
  M.interior.push(M.floorMat);
  const B = new Buckets();
  const hearth = buildHearth({ B, M, rng, winter, root, chTop: shell.chim.chTop });
  const inside = buildInterior({ B, M, rng, winter, root });
  M.interior.push(M.clayMat);

  // ---------- sod: grass blades and fireweed on both roofs, the canopy and the berm ----------
  const { chim } = shell.chim;
  const kr = shell.kRoof;
  section(() => {
    const P = new PlantBatch();
    sodRoof(P, rng, { hx: ROOF.hx, hz: ROOF.hz, top: shell.roofTop, count: winter ? 240 : 200, fireweed: winter ? 12 : 7, avoid: (x, z) => Math.hypot(x - chim.x, z - chim.z) < 0.35 });
    sodRoof(P, rng, { hx: kr.hx, hz: kr.hz, cz: kr.cz, top: kr.top, count: winter ? 190 : 150, fireweed: winter ? 10 : 5, avoid: (x, z) => z > -ROOF.hz + 0.05 });
    const cn = shell.canopy;
    for (let k = 0; k < 150; k++) {
      const x = cn.x0 + 0.1 + rng() * (cn.x1 - cn.x0 - 0.2), z = cn.z0 + rng() * (cn.z1 - cn.z0);
      const edge = Math.min(x - cn.x0, cn.x1 - x, z - cn.z0, cn.z1 - z);
      if (edge > 0.25 && rng() < 0.45) continue;   // the canopy's middle is out of sight from the ground
      const y = cn.y - (x - cn.x0) / (cn.x1 - cn.x0) * 0.21 + 0.04;
      P.tuft(x, y, z, rng, edge < 0.15 ? { n: 5, h: 0.3, out: [x > cn.x1 - 0.2 ? 1 : 0, z < cn.z0 + 0.2 ? -1 : z > cn.z1 - 0.2 ? 1 : 0], droop: 0.8 } : { n: 5, h: 0.22 });
    }
    // berm: tufts along its top and outer slope (none in the door gap)
    const [bhx, bhz] = shell.berm.hb;
    for (let k = 0; k < (winter ? 240 : 180); k++) {
      const u = rng(), off = rng();
      const [x0, z0] = rrect(bhx - 0.5 + off * 0.5, bhz - 0.5 + off * 0.5, 0.55, u);
      const y = shell.berm.height(0.56 - off * 0.25, x0, z0);   // lower where the earth slumps to the door
      if (y < 0.15) continue;
      P.tuft(x0, y, z0, rng, { n: 5, h: 0.3 + rng() * 0.25, dry: 0.25 });
    }
    // winter: tall weeds round the berms' foot and before both doors, where no one has walked since spring
    if (winter) {
      const weed = (x, z) => (rng() < 0.3 ? P.fireweed(x, 0, z, rng) : P.tuft(x, 0, z, rng, { n: 9, h: 0.85 + rng() * 0.45, dry: 0.15, w: 1.6 }));
      for (let k = 0; k < 160; k++) {
        const [x, z] = rrect(bhx + 0.35 + rng() * 0.45, bhz + 0.35 + rng() * 0.45, 0.55, rng());
        if (z > -bhz + 0.6) weed(x, z);   // the north side lies inside the khoton
      }
      const [khx, khz] = shell.berm.kb, kcz = shell.berm.kcz;
      for (let k = 0; k < 120; k++) {
        const [x, z] = rrect(khx + 0.35 + rng() * 0.45, khz + 0.35 + rng() * 0.45, 0.55, rng());
        if (z + kcz < -3.3) weed(x, z + kcz);   // its bank ends inside the house berm
      }
      for (const [dx, dz] of [[XD + 0.25, ZD], [shell.berm.kxd + 0.25, shell.berm.KZD]]) {
        for (let k = 0; k < 16; k++) weed(dx + rng() * 1.3, dz + (rng() - 0.5) * 1.4);
      }
    }
    B.add(M.plants, P.geometry());
    // soil crumbs: fallen from the roof lip onto the berm, and loose on the roof edge itself
    const crumb = (x, y, z, r) => {
      const g = new THREE.OctahedronGeometry(r, 0);   // 8 faces: a crumb 2–5 cm across
      g.scale(1 + rng() * 0.6, 0.45 + rng() * 0.3, 1 + rng() * 0.6).rotateY(rng() * 6).translate(x, y, z);
      B.add(M.soil, g);
    };
    for (let k = 0; k < 140; k++) {
      const [x, z, nx, nz] = rrect(ROOF.hx - 0.02, ROOF.hz - 0.02, 0.45, rng());
      crumb(x - nx * rng() * 0.15, shell.roofTop(x, z) - 0.01, z - nz * rng() * 0.15, 0.015 + rng() * 0.035);
    }
    for (let k = 0; k < 90; k++) {
      const u = rng();
      const [x, z] = rrect(bhx - 0.35 - rng() * 0.25, bhz - 0.35 - rng() * 0.25, 0.55, u);
      const y = shell.berm.height(0.5, x, z);
      if (y < 0.15) continue;
      crumb(x, y, z, 0.02 + rng() * 0.03);
    }
  });
  B.build(root);

  // ---------- smoke from the хоро (summer only) ----------
  const smoke = [];
  if (!winter) {
    for (let i = 0; i < 7; i++) {
      const op = uniform(0);
      const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
      const d = length(uv().sub(0.5)).mul(2);
      const n = mx_fractal_noise_float(vec3(uv().mul(2.2), time.mul(0.12).add(i * 3.1)), 3, 2, 0.5).mul(0.5).add(0.5);
      m.colorNode = vec4(vec3(0.74, 0.73, 0.72), smoothstep(1.0, 0.15, d.add(n.mul(0.6)).sub(0.2)).mul(op));
      const s = new THREE.Sprite(m);
      s.castShadow = false;
      root.add(s);
      smoke.push({ s, op, age: i / 7 });
    }
  }

  // ---------- light shafts through the windows (rebuilt when the sun moves) ----------
  const shaftGeo = new THREE.BufferGeometry();
  const shaftPos = new Float32Array(shell.windows.length * 4 * 4 * 3), shaftUV = new Float32Array(shell.windows.length * 4 * 4 * 2);
  const shaftIdx = [];
  for (let w = 0; w < shell.windows.length; w++) for (let f = 0; f < 4; f++) { const a = (w * 4 + f) * 4; shaftIdx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  shaftGeo.setAttribute('position', new THREE.BufferAttribute(shaftPos, 3));
  shaftGeo.setAttribute('uv', new THREE.BufferAttribute(shaftUV, 2));
  shaftGeo.setIndex(shaftIdx);
  const shafts = new THREE.Mesh(shaftGeo, M.shaft);
  shafts.castShadow = false; shafts.receiveShadow = false; shafts.frustumCulled = false;
  root.add(shafts);
  const sunLocal = new THREE.Vector3(), qInv = new THREE.Quaternion();
  function rebuildShafts(sunDir) {
    shaftPos.fill(0);
    shell.windows.forEach((o, w) => {
      const n = new THREE.Vector3(...o.normal);
      if (sunDir.dot(n) < 0.05 || sunDir.y < 0.04) return;
      const L = sunDir.clone().negate();
      const lat = new THREE.Vector3(-n.z, 0, n.x);
      const c = new THREE.Vector3(...o.inner);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => c.clone().addScaledVector(lat, a * WIN * 0.48).add(new THREE.Vector3(0, b * WIN * 0.48, 0)));
      const land = corners.map((p) => {
        let yT = 0.53;
        let t = (yT - p.y) / L.y;
        const q = p.clone().addScaledVector(L, t);
        if (Math.abs(q.x) < 2.35 && Math.abs(q.z) < 1.85) { yT = 0.02; t = (yT - p.y) / L.y; }
        return p.clone().addScaledVector(L, t);
      });
      for (let f = 0; f < 4; f++) {
        const a = (w * 4 + f) * 4, i0 = f, i1 = (f + 1) % 4;
        const quad = [corners[i0], corners[i1], land[i0], land[i1]];
        quad.forEach((p, k) => { shaftPos.set([p.x, p.y, p.z], (a + k) * 3); shaftUV.set([k % 2, k < 2 ? 0 : 1], (a + k) * 2); });
      }
    });
    shaftGeo.attributes.position.needsUpdate = true;
    shaftGeo.attributes.uv.needsUpdate = true;
  }

  // ---------- butter offering morsel (shown while feeding the fire) ----------
  const morsel = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).scale(1.3, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0xf2d27a, roughness: 0.4 }));
  morsel.visible = false; morsel.castShadow = false;
  root.add(morsel);

  // ---------- colliders ----------
  const lift = (c) => (c.y0 !== undefined ? { ...c, y0: c.y0 + Y, y1: c.y1 + Y } : c);
  const colliders = [...shell.colliders, ...hearth.colliders, ...inside.colliders].map(lift);
  const DOOR_TAG = Y - 0.5 - 0.0137 * (winter ? 2 : 1);
  colliders.push({ x: XD, z: ZD, hw: 0.12, hd: DW / 2 + 0.02, y0: DOOR_TAG, y1: shell.door.open > 0.5 ? Y - 50 : Y + 3 });

  // ---------- ray targets (invisible proxies) and interactables ----------
  const proxy = (w, h, d, p, r = [0, 0, 0], parent = root) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial());
    m.position.set(...p); m.rotation.set(...r); m.visible = false; m.castShadow = false;
    parent.add(m); return m;
  };
  const houseT = new THREE.Group(); root.add(houseT);
  const tilt = Math.atan(OUTW());
  function OUTW() { return 0.75 / H; }
  for (const [x, , ry] of [[1, 0, 0], [-1, 0, Math.PI], [0, 1, -Math.PI / 2], [0, -1, Math.PI / 2]]) {
    const F = x ? FX : FZ, L = x ? FZ : FX;
    const d = inner(F, 1.1) + 0.15;
    const g = new THREE.Group(); g.rotation.y = ry; houseT.add(g);
    proxy(0.3, 2.4, 2 * L + 1.4, [d, 1.1, 0], [0, 0, tilt], g);
  }
  proxy(2 * ROOF.hx, 0.6, 2 * ROOF.hz, [0, ROOF.edge, 0], [0, 0, 0], houseT);
  const windowsT = new THREE.Group(); root.add(windowsT);
  for (const o of shell.windows) proxy(0.5, 0.42, 0.5, [o.inner[0] + o.normal[0] * 0.2, o.inner[1], o.inner[2] + o.normal[2] * 0.2], [0, 0, 0], windowsT);
  const khotonT = proxy(2 * kr.hx - 0.6, 2.4, 2 * kr.hz - 1.6, [0, 1.2, kr.cz - 0.4]);
  const hearthT = proxy(1.3, 2.0, 1.3, [HEARTH.x + 0.1, 1.0, HEARTH.z - 0.1], [0, Math.PI / 4, 0]);
  const doorT = proxy(0.08, DH, DW, [0, DH / 2, DW / 2], [0, 0, 0], shell.door.pivot);

  const T = inside.targets;
  const its = [];
  its.push({ entry: 'balagan', target: houseT });
  its.push({ entry: 'muus-tunnuk', target: windowsT });
  its.push({ entry: 'khoton', target: khotonT });
  for (const b of inside.benches) its.push({ entry: 'oron', target: b.target, label: b.label });
  its.push({ entry: 'khappakhchy', target: T.khappakhchy });
  its.push({ entry: 'toyon-baghana', target: T.toyon });
  its.push({ entry: 'sakha-calendar', target: T.calendar });
  if (!winter) {
    its.push({ entry: 'kytyya', target: T.kytyya });
    its.push({ entry: 'birch-bark', target: T.birchShelf });
    its.push({ entry: 'birch-bark', target: T.birch });
    its.push({ entry: 'kytyya', target: T.kytyyaTable });
    its.push({ entry: 'khamyiakh-ladle', target: T.ladle });
    its.push({ entry: 'clothing', target: T.clothing });
    its.push({ entry: 'clothing', target: T.clothingHat });
    its.push({ entry: 'silver-ornaments', target: T.silver });
    its.push({ entry: 'knife', target: T.knife });
  } else {
    its.push({ entry: 'sayylyk-kystyk', zone: { x: XD + 3.2, z: ZD, r: 3.2 } });
  }
  hearthT.userData.isHearth = true;
  const fire = hearth.fire;
  const world = (v) => root.localToWorld(v.clone());

  // the hearth: in the summer house the player may feed the fire (a pinch of butter, respectfully)
  let flare = 0, morselT = -1, fedOnce = false, fuel = 0;
  const hearthIt = { entry: 'ohokh', target: hearthT };
  if (!winter) {
    hearthIt.act = {
      id: 'feed', label: { sah: 'Уоту аһат', en: 'Feed the fire', ru: 'Покормить огонь' },
      run: async (game, it) => {
        it.act.thenCard = !fedOnce;
        morselT = 0; morsel.visible = true;
        await wait(650);
        flare = 1;
        game.audio?.play('fire-feed', world(fire.pos));
        await wait(1500);
        fedOnce = true;
      },
    };
  }
  // src/interact lays carried firewood here: it stands upright in the mouth and burns brighter for ~60 s
  if (!winter) hearthIt.fireplace = { pos: () => world(fire.pos), upright: true, fuel: () => { fuel = 1; flare = Math.max(flare, 0.6); } };
  its.push(hearthIt);

  // хомус: play it — but never after dark (the card explains the taboo)
  if (!winter) {
    let played = false;
    its.push({
      entry: 'khomus', target: T.khomus,
      act: {
        id: 'play', label: { sah: 'Хомустаа', en: 'Play the khomus', ru: 'Сыграть на хомусе' },
        run: async (game, it) => {
          const dark = (game.engine?.sunElev ?? 30) < 0;
          if (dark) { it.act.thenCard = true; return; }
          it.act.thenCard = !played;
          game.audio?.play('khomus', world(new THREE.Vector3(0, 1.2, -FZ + 0.2)));
          await wait(2600);
          played = true;
        },
      },
    });
  }

  // the door: open or shut it (the winter house stands shut)
  const door = shell.door;
  its.push({
    entry: 'balagan', target: doorT, label: { sah: 'Аан', en: 'Door', ru: 'Дверь' },
    act: {
      id: 'door', label: { sah: 'Ааны ас / сап', en: 'Open / shut the door', ru: 'Открыть / закрыть дверь' }, thenCard: false,
      run: async (game) => {
        door.target = door.target > 0.5 ? 0 : 1;
        game.audio?.play('door', world(new THREE.Vector3(XD, 1, ZD)));
        await wait(450);
      },
    },
  });

  // ---------- per-frame: eye adaptation, fire flicker, smoke, door, shafts ----------
  let wasInside = false, doorCol = null, shaftClock = 99, lastSun = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const engine = ctx.world?.engine;
  if (engine) M.setEnv(engine.scene.environment);
  function update(dt, { time: t, camera, game }) {
    const eng = game?.engine || engine;
    if (eng) M.setEnv(eng.scene.environment);
    // eye adaptation when stepping in / out
    if (camera) {
      camLocal.copy(camera.position);
      root.worldToLocal(camLocal);
      const isIn = (Math.abs(camLocal.x) < FX + 0.75 && Math.abs(camLocal.z) < FZ + 0.75 && camLocal.y < 2.5) ||
        (camLocal.x < XD && camLocal.x > 0 && Math.abs(camLocal.z - ZD) < DW / 2 && camLocal.y < DH);
      if (isIn !== wasInside && eng) eng.exposureTarget = isIn ? INSIDE_EXPOSURE : OUTSIDE_EXPOSURE;
      wasInside = isIn;
      // never toggle light.visible: a change in the scene's light set recompiles every material
    }
    // fire flicker and the offering's flare
    if (fire.light) {
      flare = Math.max(0, flare - dt * 0.55);
      fuel = Math.max(0, fuel - dt / 60);
      const fk = Math.min(1, fuel * 4);
      const f = 0.78 + 0.12 * Math.sin(t * 11.3) * Math.sin(t * 7.1 + 1) + 0.1 * Math.sin(t * 23.7 + Math.sin(t * 3));
      fire.light.intensity = 6 * f * (1 + flare * 1.6 + fk * 0.6);
      fire.fill.intensity = door.open > 0.5 ? 1.4 : 0.2;
      M.flare.value = Math.max(flare, fk * 0.45);
      if (morselT >= 0) {
        morselT += dt;
        const k = Math.min(1, morselT / 0.6);
        morsel.position.set(fire.pos.x + 0.25 * (1 - k) * -Math.SQRT1_2, fire.pos.y + 0.25 - k * k * 0.45, fire.pos.z + 0.25 * (1 - k) * Math.SQRT1_2);
        if (k >= 1) { morsel.visible = false; morselT = -1; }
      }
    }
    // smoke drifting off the chimney top
    for (const p of smoke) {
      p.age += dt / (7 + (1 + flare) * 0.5);
      if (p.age > 1) p.age -= 1;
      const a = p.age;
      p.s.position.set(chim.x + a * 1.6 + Math.sin(t * 0.4 + a * 5) * 0.1, shell.chim.chTop + 0.15 + a * 2.6, chim.z + a * 0.7);
      p.s.scale.setScalar(0.35 + a * 1.8);
      p.op.value = Math.min(1, a * 6) * (1 - a) * (0.75 + flare * 0.5);
    }
    // door swing (and its collider)
    if (Math.abs(door.open - door.target) > 1e-3) {
      door.open += Math.sign(door.target - door.open) * Math.min(Math.abs(door.target - door.open), dt * 1.8);
      const e = door.open * door.open * (3 - 2 * door.open);
      door.pivot.rotation.y = e * door.maxAngle;
    }
    if (game?.world && !doorCol) doorCol = game.world.colliders.find((c) => Math.abs((c.y0 ?? 1e9) - DOOR_TAG) < 1e-6);
    if (doorCol) doorCol.y1 = door.open > 0.6 ? Y - 50 : Y + 3;
    // sunbeams follow the sun
    shaftClock += dt;
    if (eng && shaftClock > 0.5) {
      shaftClock = 0;
      root.getWorldQuaternion(qInv).invert();
      sunLocal.copy(eng.sun.position).normalize().applyQuaternion(qInv);
      if (sunLocal.distanceToSquared(lastSun) > 1e-6) { lastSun.copy(sunLocal); rebuildShafts(sunLocal); }
    }
  }

  // dung-trodden apron outside the barn door: the yard's trodden earth, its frayed edge fading into the ground
  // (summer only: the winter barn's has grassed over since spring)
  if (!winter) {
    const ground = groundOf(ctx, placement);
    const { KZD: kz, kxd: kx } = shell.berm;
    const tg = section(() => troddenPatch(ground, kx, kx + 2.8, kz - 1.6, kz + 1.6, (x, z) => (x < kx + 0.05 ? 0 : Math.max(blob(kx + 0.8, kz, 1.5, 1.05, 7)(x, z), blob(kx + 0.25, kz, 0.5, 0.7, 9)(x, z))), { step: 0.3, lift: 0.02 }));
    const apron = new THREE.Mesh(tg, trodden(ctx, { key: 'trodden-khoton', hoof: 1.2 }));
    apron.receiveShadow = true; apron.castShadow = false; apron.renderOrder = -1;
    root.add(apron);
  }

  // grass hints: bare earth under the house (with its door passage) and the khoton; the barn's dung-trodden way in
  // (summer only: the winter barn has stood empty since spring and its way in has grown over)
  const { KZD, kxd } = shell.berm;
  root.userData.bare = [{ x: 0, z: 0, hw: XD + 0.05, hd: 3.4 }, { x: 0, z: KH.zc, hw: kxd, hd: KH.hz + 1.1 }];
  root.userData.paths = winter ? [] : [{ w: 1.6, pts: [[kxd + 1.7, KZD], [kxd - 0.5, KZD]] }];

  // the low door passage: the player stoops under its lintel
  const lows = [{ x: (XD + 0.15 + inner(FX, DH) - 0.1) / 2, z: ZD, hw: (XD + 0.15 - inner(FX, DH) + 0.1) / 2, hd: DW / 2 + 0.05, h: DH + 0.01 }];
  return { object: root, colliders, floors: [], lows, interactables: its, update };
}
