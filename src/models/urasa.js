// Ураһа — the birch-bark summer house of a well-off family, ~10 m across and ~11 m to the tie. A ring of
// 12 carved posts carries the lower hoop; 96 long poles lean on it, a third of them meeting at a lashed tie
// over the smoke hole; birch-bark rings wrap the cone from the bottom up; outer poles hold the second layer.
// Door (a bark curtain) on the east (+X).
// Inside: earth floor, clay hearth with a summer fire, benches round the wall, the kymys corner on the north.
import * as THREE from 'three/webgpu';
import { uv, vec3, mix, fract, float, step, min, abs, faceDirection, mx_fractal_noise_float } from 'three/tsl';
import { makeProfile, buildFrame, R_POST, POST_H, DOOR } from './urasa/frame.js';
import { buildCover, buildCurtain, CURTAIN_W } from './urasa/cover.js';
import { buildInterior, BENCH, HEARTH, floorAt } from './urasa/interior.js';
import { buildKymys, KYMYS } from './urasa/kymys.js';
import { buildFire } from './urasa/fire.js';
import { makeMats, smoothstep, uDoorOpen } from './urasa/mats.js';
import { merge, lathe } from './urasa/geom.js';
import { section } from '../load/geocache.js';
import { noSun, noLocalLights } from '../engine/master.js';
import { offerFrom, offerPath, offerTime } from './yard/offer.js';

const EXPO_IN = 1.5, EXPO_OUT = 0.62;

export default async function build(ctx) {
  const { rng } = ctx;
  const engine = ctx.world?.engine;
  const P = makeProfile();
  const M = makeMats();
  const root = new THREE.Group();
  root.name = 'urasa';
  const mesh = (g, m, { cast = true } = {}) => { if (!g) return null; const o = new THREE.Mesh(g, m); o.userData.noShadow = !cast; root.add(o); return o; };

  // the shell's geometry and data (baked: src/load/geocache.js)
  const frame = section(() => buildFrame(rng, P));
  const cover = section(() => buildCover(rng, P));
  const inside = section(() => buildInterior(rng));
  const hole = P.at(cover.sTop), holeY = hole.y;
  const coneR = (y) => P.rAtY(Math.max(0, y)); // inner radius of the cone at height y
  const R0 = coneR(0);

  mesh(cover.outer, M.outer);
  mesh(cover.inner, M.inner);
  mesh(cover.bands, M.band, { cast: false });
  mesh(frame.geoms.post, M.post);
  mesh(merge([frame.geoms.poleIn, inside.geoms.poleIn]), M.poleIn);
  mesh(frame.geoms.poleOut, M.poleOut);
  mesh(merge([frame.geoms.hair, inside.geoms.hair]), M.hair, { cast: false });
  mesh(frame.geoms.timber, M.timber);
  mesh(inside.geoms.floor, M.floor, { cast: false });
  // benches, firewood and hides stand on the earth floor (built on level 0; world/settle.js)
  mesh(inside.geoms.plank, M.plank).userData.ground = 0;
  mesh(inside.geoms.clay, M.clay);
  mesh(inside.geoms.hide, M.hide).userData.ground = 0;

  // ---- the door curtain: bark edged with leather (its embroidery is not drawn: no traceable source yet, docs/patterns.md)
  const curtain = buildCurtain();
  const curtainM = M.vessel.clone();
  {
    const m = curtainM;
    const t = uv();
    const W = CURTAIN_W / 1.6;
    const u = t.x.sub(10).div(W), v = t.y; // 0..1 across, 0..1 up
    const edge = min(min(u, float(1).sub(u)), min(v, float(1).sub(v)));
    const leather = smoothstep(0.034, 0.028, edge);
    const base = M.vessel.colorNode;
    // smoke-darkened boiled bark: sooty at the top, grimy where hands push it aside, two sheets sewn down the middle
    const n = mx_fractal_noise_float(vec3(u.mul(6), v.mul(10), 3.0), 3, 2, 0.5).mul(0.5).add(0.5);
    let cb = base.mul(vec3(0.42, 0.31, 0.21)).mul(n.mul(0.4).add(0.75));
    cb = mix(cb, vec3(0.1, 0.07, 0.05), smoothstep(0.6, 1.0, v.add(n.mul(0.15))).mul(0.7));
    cb = mix(cb, cb.mul(0.6), smoothstep(0.22, 0.0, abs(u.sub(0.12))).mul(smoothstep(0.2, 0.55, v)).mul(smoothstep(0.85, 0.55, v)).mul(0.6));
    cb = mix(cb, cb.mul(vec3(0.6, 0.55, 0.5)), smoothstep(0.25, 0.0, v).mul(0.6));
    const seam = smoothstep(0.012, 0.0, abs(u.sub(0.5)));
    const st = seam.mul(step(0.5, fract(v.mul(140))));
    cb = mix(cb.mul(float(1).sub(seam.mul(0.35))), vec3(0.04, 0.03, 0.02), st);
    m.colorNode = mix(cb, vec3(0.07, 0.045, 0.03), leather).mul(faceDirection.lessThan(0).select(0.6, 1));
    m.roughnessNode = float(0.82);
    m.side = THREE.DoubleSide;
    m.aoNode = faceDirection.lessThan(0).select(0.035, 1); // inside face: only a little daylight comes through the bark
    const o = mesh(curtain.geom, m);
    o.frustumCulled = false;
  }

  // ---- kymys corner and fire
  const ky = buildKymys(rng, M);
  root.add(ky.group);
  // the kymys corner on the earth floor: the sack's platform and the chorons' board drop as one onto it, the
  // buckets (and the corner's horsehair) follow it (world/settle.js)
  ky.sackRoot.userData.rest = ky.boardRoot.userData.rest = true;
  for (const m of [...ky.buckets.children, ky.hair]) m.userData.ground = 0;
  // the fire asks the cone's radius for every puff every frame: from a table (2 cm steps) instead of the profile's search
  const coneTab = Float32Array.from({ length: Math.ceil(holeY / 0.02) + 2 }, (_, i) => coneR(i * 0.02));
  const coneRFast = (y) => { const f = Math.min(coneTab.length - 1.001, Math.max(0, y / 0.02)), i = f | 0; return coneTab[i] + (coneTab[i + 1] - coneTab[i]) * (f - i); };
  const fire = buildFire(rng, { holeY, holeR: hole.r, coneR: coneRFast });
  root.add(fire.group);
  root.traverse((o) => { if (o.isMesh) o.castShadow = !o.userData.noShadow && !o.material.transparent; });
  const BOUNCE = 0.13, bounce = new THREE.PointLight(0xffc9a0, 0, 7.5, 1);
  root.add(bounce);
  // Explicit light sets. Interior-only materials take the fire's light alone: the sun gets in only through the
  // door and the smoke hole, and shadow-map leaks would light thin lines along every pole and seam. The outside
  // takes the sun alone (the fire must not glow through the bark); the floor, door frame and curtain take both.
  // The other houses' fires cost nothing here either.
  // (Masks on the homestead's one light set, src/engine/master.js.)
  const indoor = new Set([M.inner, M.poleIn, M.post, M.plank, M.hide, M.hair, M.birch, M.kymys, M.leather, M.vessel, M.clay]);
  fire.group.traverse((o) => { if (o.isMesh && o.material.lights !== false) indoor.add(o.material); });
  for (const m of indoor) noSun(m);
  for (const m of [M.outer, M.band, M.poleOut]) noLocalLights(m);

  // ---- invisible proxies for looking at things
  const hidden = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const proxy = (g, name) => { const o = new THREE.Mesh(g, hidden); o.visible = false; o.name = name; root.add(o); return o; };
  const profPts = (off, step = 0.6) => { const pts = []; for (let s = 0; s <= P.L; s += step) { const q = P.at(s); pts.push([q.r + q.nr * off, q.y + q.ny * off]); } return pts; };
  const outerProxy = proxy(lathe(profPts(0.08), 16), 'urasa-outer');
  const lining = proxy(lathe(profPts(0.0).filter(([r]) => r > 0.4), 16), 'urasa-lining');
  // the lining answers from inside only: from outside it lies just behind the cover and, being smaller, won the
  // look-at ray (main.js pickFocus: the smallest target close behind the first hit), so the house read as "Birch bark"
  lining.material = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const frameProxy = new THREE.Group();
  root.add(frameProxy);
  for (const a of frame.postAngles) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, POST_H, 6), hidden);
    c.position.set(Math.cos(a) * R_POST, POST_H / 2, Math.sin(a) * R_POST); c.visible = false; frameProxy.add(c);
  }
  const hoopP = new THREE.Mesh(new THREE.TorusGeometry(R_POST, 0.09, 4, 32), hidden);
  hoopP.rotation.x = Math.PI / 2; hoopP.position.y = frame.hoopY1; hoopP.visible = false; frameProxy.add(hoopP);
  const doorProxy = proxy(new THREE.BoxGeometry(0.34, DOOR.h, DOOR.hw * 2), 'urasa-door');
  doorProxy.position.set((DOOR.r + DOOR.rTop) / 2 - 0.05, DOOR.h / 2, 0);
  const fireProxy = proxy(new THREE.BoxGeometry(HEARTH.half * 2 + 0.2, 0.9, HEARTH.half * 2 + 0.2), 'urasa-fire');
  fireProxy.position.y = 0.45;
  const benchProxy = new THREE.Group(); root.add(benchProxy);
  for (const b of inside.benchTargets) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(BENCH.rout - BENCH.rin, 0.5, 2 * b.mid * Math.sin(BENCH.hs)), hidden);
    o.position.set(Math.cos(b.c) * b.mid, 0.25, Math.sin(b.c) * b.mid); o.rotation.y = -b.c; o.visible = false; benchProxy.add(o);
  }

  // ---- colliders: posts, the wall ring (open at the door), benches, hearth, the kymys corner, door jambs
  const colliders = [...frame.colliders, ...inside.colliders, ...ky.colliders];
  // the wall: a ring of boxes on the poles at knee height, open across the door (the jambs close it)
  const WALL_R = coneR(0.4), NW = 64, half = Math.PI / NW, doorW = Math.asin(DOOR.hw / WALL_R);
  for (let k = 0; k < NW; k++) {
    const a = ((k + 0.5) / NW) * Math.PI * 2;
    const w = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(w) - half < doorW) continue;
    colliders.push({ x: Math.cos(a) * WALL_R, z: Math.sin(a) * WALL_R, hw: 0.12, hd: WALL_R * Math.sin(half) + 0.03, rot: -a });
  }
  for (const s of [-1, 1]) colliders.push({ x: DOOR.rAt(0.9), z: s * (DOOR.hw + 0.065), r: 0.1 });

  // ---- little animation runner for the hands-on actions
  const tweens = [];
  const tween = (dur, fn) => new Promise((res) => tweens.push({ t: 0, dur, fn, res }));
  const ease = (k) => k * k * (3 - 2 * k);
  const local = (v) => root.worldToLocal(v.clone());
  // Churning, watched: one tap on the sack and the view is framed on it (src/interact/framed.js); the хамнатар comes
  // up and plunges, stroke after stroke, a turn of the wrist each time, the sack swelling at each plunge, until the
  // froth rises over the collar (8 strokes: it foams over and stays 90 s, `save.work.kymys`). Leaving stops the
  // strokes; left alone the froth falls again.
  const churn = { up: 0, top: 0, fall: 0, lifting: false, t: 0, score: 0, idle: 9, bulge: 0, foamed: 0, base: ky.stirrer.position.y };
  const froth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 8).scale(1, 0.42, 1), M.kymys);
  { const uv = froth.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.9); } // all froth (uv.x: `kymys` in urasa/mats.js)
  froth.position.set(0, ky.neckY + 0.05, 0); froth.visible = false; froth.castShadow = false; froth.userData.dynamic = true;
  ky.sackRoot.add(froth);
  const sound = (game, name, obj) => { const p = new THREE.Vector3(); obj.getWorldPosition(p); game?.audio?.play(name, p); };
  const churnIt = async (game) => {
    const F = game?.framed;
    if (!F || churn.lifting || churn.fall > 0) return;
    const c = ky.sackRoot.localToWorld(new THREE.Vector3(0, ky.neckY + 0.08, 0)), pl = game.player.pos; // the collar: the sack below, the knob's stroke above
    if (!(await F.open({ c, r: 0.72, yaw: Math.atan2(pl.x - c.x, pl.z - c.z), el: 0.22, fov: 40 }))) return;
    await tween(0.3, () => {});
    while (F.on && !churn.foamed) {
      churn.lifting = true; churn.t = 0; churn.to = 0.85 + Math.random() * 0.15; churn.twist = -(churn.twist || 0.35);
      await new Promise((res) => { churn.res = res; });
      await tween(0.2 + Math.random() * 0.08, () => {}); // the beat: up, plunge, a breath
    }
    if (churn.foamed) await tween(1.8, () => {}); // it foams over the collar
    await F.close();
  };

  // milk-white drops for the sprinkling
  const drops = [];
  {
    const g = new THREE.IcosahedronGeometry(0.008, 1);
    const m = new THREE.MeshStandardNodeMaterial({ color: 0xece6d6, roughness: 0.25 });
    for (let i = 0; i < 14; i++) { const d = new THREE.Mesh(g, m); d.visible = false; d.userData.noShadow = true; root.add(d); drops.push({ o: d, v: new THREE.Vector3(), t: 0 }); }
  }
  const sprinkle = (from, dir) => {
    for (const d of drops) {
      d.o.position.copy(from);
      d.v.copy(dir).multiplyScalar(0.9 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4));
      d.t = 1.4; d.o.visible = true;
    }
  };
  // An offering put into the fire: n drops come up from low by the player and are set down slowly on the embers
  // (yard/offer.js): put, never thrown
  const offer = (fromW, toW, n) => {
    const from = local(fromW), to = local(toW), put = drops.slice(0, n), p = new THREE.Vector3();
    put.forEach((d, i) => { d.held = true; d.o.visible = true; d.o.scale.setScalar(0.01); d.off = new THREE.Vector3((i - 1) * 0.012, 0, ((i * 7) % 3 - 1) * 0.01); });
    return tween(offerTime(fromW, toW), (k) => {
      offerPath(from, to, k, p);
      for (const d of put) { d.o.position.copy(p).add(d.off); d.o.scale.setScalar(1.8 * ease(Math.min(1, k / 0.15))); }
      if (k >= 1) for (const d of put) { d.held = false; d.o.visible = false; d.o.scale.setScalar(1); }
    });
  };
  // The guest's choron (src/interact/rites.js takes it into the hands): the ladle fills it from the sack where it stands.
  const fillChoron = async (game) => {
    const hero = ky.hero, ladle = ky.ladle, kl = ky.heroKymys;
    root.updateMatrixWorld();
    const rootQi = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const at = local(hero.getWorldPosition(new THREE.Vector3()));
    const homeL = { parent: ladle.parent, p: ladle.position.clone(), q: ladle.quaternion.clone(), rp: local(ladle.getWorldPosition(new THREE.Vector3())), rq: rootQi.clone().multiply(ladle.getWorldQuaternion(new THREE.Quaternion())) };
    root.attach(ladle);
    const level = rootQi.clone().multiply(ky.sackRoot.getWorldQuaternion(new THREE.Quaternion())); // bowl upright, handle along the wall
    await flyTo(ladle, ladle.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 0.4);
    await flyTo(ladle, at.clone().add(new THREE.Vector3(-0.08, 0.37, 0)), 0.55, level);
    sound(game, 'pour', hero);
    const q1 = ladle.quaternion.clone(), q2 = q1.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9));
    await tween(0.35, (k) => ladle.quaternion.slerpQuaternions(q1, q2, ease(k)));
    const v0 = kl.vol, v1 = Math.max(v0, kl.volAt(KYMYS.full));
    await tween(0.6, (k) => { kl.vol = v0 + (v1 - v0) * ease(k); });   // the choron fills
    await tween(0.3, (k) => ladle.quaternion.slerpQuaternions(q2, q1, ease(k)));
    await flyTo(ladle, homeL.rp, 0.55, homeL.rq);
    homeL.parent.attach(ladle); ladle.position.copy(homeL.p); ladle.quaternion.copy(homeL.q);
  };
  ky.hero.userData.dynamic = true; ky.ladle.userData.dynamic = true;
  root.userData.guest = {
    hero: ky.hero, kymys: ky.heroKymys, KYMYS, fill: fillChoron,
    sprinkle: (fromW, dirW) => sprinkle(local(fromW), dirW.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert())),
    hearth: () => fire.group.localToWorld(new THREE.Vector3(0, HEARTH.top, 0)),
    flare: (game) => { sound(game, 'fire-feed', fire.group); fire.flare(); },
    inside: (p) => { const l = root.worldToLocal(p.clone()); return Math.hypot(l.x, l.z) < R0 - 0.2; },
  };

  // the ladle's motion (model space; the model only turns about +Y)
  const flyTo = async (obj, to, dur, quatTo, during) => {
    const from = obj.position.clone(), q0 = obj.quaternion.clone();
    await tween(dur, (k) => { const e = ease(k); obj.position.lerpVectors(from, to, e); if (quatTo) obj.quaternion.slerpQuaternions(q0, quatTo, e); during?.(e); });
  };

  const interactables = [
    { entry: 'urasa', target: outerProxy },
    { entry: 'urasa', target: frameProxy, label: { sah: 'Ураһа баҕаналара, курдуу', en: 'Uraha posts and hoop', ru: 'Столбы и обруч ураһы' } },
    { entry: 'birch-bark', target: lining, label: { sah: 'Туос', en: 'Birch bark', ru: 'Береста' } },
    { entry: 'hospitality', target: doorProxy, label: { sah: 'Аан (илин)', en: 'The door, facing east', ru: 'Дверь, обращённая на восток' } },
    { entry: 'hospitality', zone: { x: DOOR.r + 1.0, z: 0, r: 0.9 } },
    { entry: 'oron', target: benchProxy },
    {
      entry: 'uot-ichchite', target: fireProxy,
      // src/interact lays carried firewood here
      fireplace: {
        pos: () => fire.group.localToWorld(new THREE.Vector3(0, HEARTH.top, 0)), upright: false, fuel: fire.fuel, stir: fire.stir,
        // the bearing (world, rad from +x towards +z) of the next gap between the fire's leaning billets
        lean: (() => { let n = 0; return () => { const a = fire.gaps[n++ % fire.gaps.length], o = fire.group.localToWorld(new THREE.Vector3()), d = fire.group.localToWorld(new THREE.Vector3(Math.cos(a), 0, Math.sin(a))).sub(o); return Math.atan2(d.z, d.x); }; })(),
      },
      act: {
        // a pinch from low by the hand, set down slowly on the hearth; the fire takes it
        id: 'feed', empty: true, label: { sah: 'Уоту аһат', en: 'Feed the fire', ru: 'Покормить огонь' },
        run: async (game) => {
          const hearth = fire.group.localToWorld(new THREE.Vector3(0, HEARTH.top + 0.05, 0));
          await offer(offerFrom(game.engine.camera, hearth, new THREE.Vector3()), hearth, 3);
          sound(game, 'fire-feed', fire.group);
          fire.flare();
        },
      },
    },
    {
      entry: 'kymys', target: ky.sackRoot,
      act: {
        id: 'churn', label: { sah: 'Хамнат', en: 'Churn the kymys', ru: 'Покачать мутовку в кумысе' },
        run: (game) => churnIt(game),
      },
    },
    { entry: 'khamyiakh-ladle', target: ky.ladle },
    { entry: 'choron', target: ky.chorons },
    { entry: 'choron', target: ky.hero, guest: true, label: { sah: 'ыалдьыт чорооно', en: 'the guest’s choroon', ru: 'чороон гостя' } },
    { entry: 'ygas-bucket', target: ky.buckets },
  ];

  // ---- per-frame: curtain, exposure inside, fire, smoke, drops, tweens
  let open = 0, wasOpen = false, inside_ = false;
  const _kQ = new THREE.Quaternion(), _kUp = new THREE.Vector3(), kLast = { vol: -1, up: new THREE.Vector3() };
  const _p = new THREE.Vector3(), _lp = new THREE.Vector3(), _iq = new THREE.Quaternion(), _sun = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
  const update = (dt, c) => {
    // the dasher
    if (churn.lifting) {
      churn.t += dt; churn.up = Math.min(churn.to, churn.up + dt / 0.34);
      if (churn.up >= churn.to) { churn.lifting = false; churn.top = churn.up; churn.fall = 1; }
    } else if (churn.fall > 0) {
      churn.fall = Math.max(0, churn.fall - dt / (0.08 + 0.12 * churn.top));
      churn.up = churn.top * churn.fall * churn.fall;
      if (churn.fall === 0) { // the plunge
        sound(c.game, 'churn', ky.sack);
        churn.score = Math.min(12, churn.score + 1.5);
        churn.idle = 0; churn.bulge = 0.5 + 0.5 * churn.top;
        c.game?.work?.count('churn');
        if (churn.score >= 12 && !churn.foamed) { churn.foamed = 90; c.game?.work?.count('kymys'); }
        churn.res?.();
      }
    } else if ((churn.idle += dt) > 1.6 && !churn.foamed) churn.score = Math.max(0, churn.score - dt * 1.5); // left alone, the froth falls
    if (churn.foamed && (churn.foamed -= dt) <= 0) { churn.foamed = 0; churn.score = 0; }
    ky.stirrer.position.y = churn.base + 0.26 * ease(churn.up);
    ky.stirrer.rotation.y = (churn.twist || 0) * ease(churn.up); // a turn of the wrist as it rises
    churn.bulge = Math.max(0, churn.bulge - dt * 3);
    { const s = Math.sin(churn.bulge * Math.PI) * 0.03; ky.sack.scale.set(1 + s, 1 - s * 0.6, 1 + s); }
    const fk = churn.score / 12;
    froth.visible = fk > 0.04;
    if (froth.visible) { const k = (0.3 + 1.25 * fk) * (1 + 0.04 * Math.sin((c.time || 0) * 3.1)); froth.scale.set(k, k * (0.8 + 0.7 * fk), k); froth.position.y = ky.neckY + 0.05 + 0.025 * fk; } // full: it rises over the collar's rim
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    // the guest's choron keeps its kymys level in the world while it is lifted and tilted (re-fit on change only)
    const kl = ky.heroKymys;
    _kUp.set(0, 1, 0).applyQuaternion(ky.hero.getWorldQuaternion(_kQ).invert());
    if (kl.vol !== kLast.vol || _kUp.distanceToSquared(kLast.up) > 1e-8) { kl.fit(_kUp); kLast.vol = kl.vol; kLast.up.copy(_kUp); }
    root.updateMatrixWorld();
    root.getWorldQuaternion(_iq).invert();
    // who is where: the player's feet in the game, the camera in the viewer
    const pp = c.player ? _p.copy(c.player.pos) : _p.copy(c.camera.position);
    const lp = root.worldToLocal(_lp.copy(pp));
    const dDoor = Math.hypot(lp.x - (DOOR.r + 0.1), lp.z);
    const want = dDoor < 1.5 ? 1 : 0;
    open += (want - open) * (1 - Math.exp(-(want ? 5 : 2.2) * dt));
    if (want && !wasOpen) c.game?.audio?.play('door', root.localToWorld(new THREE.Vector3(DOOR.r, 1, 0)));
    wasOpen = !!want;
    // the breeze ripple (mm) can't be seen from afar: drape only near, or while it opens or closes
    if (dDoor < 30 || Math.abs(want - open) > 1e-3) curtain.drape(open, c.time || 0);
    uDoorOpen.value = open;
    const r = Math.hypot(lp.x, lp.z);
    const isIn = inside_ ? r < R0 - 0.05 : r < R0 - 0.3;
    if (isIn !== inside_ && engine) { engine.exposureTarget = isIn ? EXPO_IN : EXPO_OUT; inside_ = isIn; }
    // the fire's light thrown back by the pale bark: it travels with the eye, so a thing held up against the fire
    // (a choron in the hands) or looked at closely is not a black shape
    if (c.camera) root.worldToLocal(bounce.position.set(0.12, 0.3, 0.15).applyQuaternion(c.camera.quaternion).add(c.camera.position));
    bounce.intensity += ((inside_ ? BOUNCE : 0) - bounce.intensity) * (1 - Math.exp(-dt * 4));
    // fire, smoke facing the camera, the sun shaft
    if (engine) _sun.copy(engine.sun.position).normalize().applyQuaternion(_iq);
    else _sun.set(0.4, 0.8, 0.2).normalize();
    _r.set(1, 0, 0).applyQuaternion(c.camera.quaternion).applyQuaternion(_iq);
    _u.set(0, 1, 0).applyQuaternion(c.camera.quaternion).applyQuaternion(_iq);
    fire.update(dt, { sunLocal: _sun, sunElev: engine ? engine.sunElev : 40, camRight: _r, camUp: _u });
    for (const d of drops) {
      if (!d.o.visible || d.held) continue;
      d.t -= dt; d.v.y -= 9.8 * dt; d.o.position.addScaledVector(d.v, dt);
      if (d.t <= 0 || d.o.position.y < 0.02) d.o.visible = false;
    }
  };

  // grass hints: bare earth under the floor (no blade or flower pokes through), a trodden ring round the wall's foot
  const ringR = R0 - 0.7, ring = [];
  for (let k = 0; k <= 24; k++) ring.push([Math.cos((k / 24) * Math.PI * 2) * ringR, Math.sin((k / 24) * Math.PI * 2) * ringR]);
  root.userData.paths = [{ w: 2.6, pts: ring }];
  root.userData.bare = [{ x: 0, z: 0, r: R0 }];

  const rests = inside.rests.map((f) => (f.floor ? { ...f, y: floorAt } : f)); // the earth floor as drawn (a section bakes plain data only)
  return { object: root, colliders, floors: [], rests, interactables, update };
}
