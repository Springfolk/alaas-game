// The next thing to do, told by the world itself (docs/interactions.md "Hints"): while a job is under way or something
// is carried, the thing the hands should go to next answers as it would in life: the axe's edge catches the sun,
// resin on the rounds and billets or the bark's satin glints, a fish rises where the trap goes, the hearth's fire
// settles with a knock and a lift of sparks, a thrush calls from the ripe berries. No mark, no sentence. Indoors
// (or with the thing indoors) the light leads to the doorway first. One table of rules (`next()`), read from the jobs' own state. The glint sprite is
// made before the warm-up; only its uniforms, transform and `visible` change in play; the ripples are the lake's own
// (`world.life.water.ring`), the fire's lift its own flare (`fireplace.stir`).
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { LAKE } from '../world/terrain.js';
import { glintMaterial, lightMaterial } from './glint.js';
import { DOOR as URASA_DOOR } from '../models/urasa/frame.js';
import { XD, ZD, KH, GAP, PL } from '../models/balagan/dims.js';

const FAR = 45; // m: glints show within this
const NEAR = 14; // m: farther off (the hearth: 7 m) the light at the thing rises as a shaft, seen over roofs and trees
const C = (r, g, b, k) => new THREE.Color(r, g, b).multiplyScalar(k);
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// rooms in a placement's local space (+X east): who is inside (x, z), the doorway's middle and its outward normal
const ROOMS = {
  urasa: [{ in: (x, z) => Math.hypot(x, z) < URASA_DOOR.r - 0.15, door: [URASA_DOOR.r, 0], n: [1, 0] }], // the door faces +X
  balagan: [
    { in: (x, z) => x > -3.7 && x < XD && Math.abs(z) < 3.15, door: [XD, ZD], n: [1, 0] },
    { in: (x, z) => Math.abs(x) < KH.hx + 0.6 && z < -3.3 && z > KH.zc - KH.hz, door: [KH.hx + GAP + 0.65 + PL + 0.05, -5.4], n: [1, 0] }, // the khoton's barn door (balagan/shell.js `kxd`, `KZD`)
  ],
  ampaar: [{ in: (x, z) => Math.abs(x) < 1.8 && Math.abs(z) < 1.8, door: [1.9, 0], n: [1, 0] }], // walls at ±1.9 (ampaar.js `HW`)
};
// each hint's light: `px` its glint's least size on screen, `col` its colour (HDR), `glow` the bloom at the thing
// (`m` across in metres, `asp` height/width, `ring` a halo's ring), `sparks` glints per beat
const LOOK = {
  glint: { px: 16, col: C(1, 0.95, 0.84, 5), glow: { m: 0.35, col: C(1, 0.93, 0.8, 0.8) } }, // metal
  sheen: { px: 14, col: C(1, 0.9, 0.7, 4), glow: { m: 0.5, col: C(1, 0.85, 0.6, 0.65) }, sparks: 2 }, // resin, bark, wet wicker
  berries: { px: 12, col: C(1, 0.88, 0.82, 3.5), glow: { m: 0.6, col: C(1, 0.75, 0.62, 0.6) }, sparks: 2 }, // a ripe berry's skin
  ember: { px: 14, col: C(1, 0.5, 0.16, 4), glow: { m: 0.4, col: C(1, 0.45, 0.15, 1) } }, // a spit off hot iron
  fire: { glow: { m: 1.6, col: C(1, 0.55, 0.25, 0.7), ring: 1 }, near: 7 }, // the hearth's light swelling in the smoke
  ripple: { px: 14, col: C(1, 0.96, 0.88, 4), glow: { m: 1.2, asp: 0.35, col: C(1, 0.95, 0.85, 0.55) } }, // the sun on the risen water
  splash: { px: 14, col: C(1, 0.96, 0.88, 4), glow: { m: 1.2, asp: 0.35, col: C(1, 0.95, 0.85, 0.55) }, sparks: 2 },
  door: { px: 14, col: C(1, 0.95, 0.86, 4), glow: { m: 0.9, tall: 1.9, col: C(1, 0.93, 0.8, 0.6) } }, // daylight in a doorway, the jambs catching it
};
// seconds between a hint's beats
const BEAT = { glint: [1.8, 3.2], sheen: [1.4, 2.6], ember: [1.2, 2.4], ripple: [1.6, 3], splash: [1.1, 2.4], fire: [2.4, 3.6], door: [1.6, 2.8], berries: [1.6, 2.8] };
const SWELL = 1.8; // s: a bloom's swell and fade
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _b = new THREE.Box3(), _ray = new THREE.Raycaster();
const rand = (a, b) => a + Math.random() * (b - a);

export class Hints {
  constructor(game) {
    this.game = game;
    const its = game.world.interactables, jobs = game.work?.jobs || [];
    this.hands = game.interact.hands;
    this.split = jobs.find((j) => j.axe); this.fish = jobs.find((j) => j.trap); this.tuos = jobs.find((j) => j.rest && j.thing);
    this.fires = its.filter((i) => i.fireplace);
    this.heap = its.find((i) => i.rounds); this.tymtay = its.find((i) => i.tymtay); this.stone = its.find((i) => i.offering);
    this.blank = its.find((i) => i.target?.userData.forge); this.forge = its.find((i) => i.act?.id === 'forge');
    this.patches = its.filter((i) => i.berries !== undefined); this.pile = its.find((i) => i.take === 'woodpile');
    const home = this.heap ? this.centre(this.heap) : new THREE.Vector3();
    // the pool, made before the warm-up (layer 1: not in the lake mirror or the shadows); in play only uniforms,
    // transforms and `visible` change: the glint (a sun star off metal, resin, bark, water, a berry), the bloom at
    // the thing (a halo, a sheen, a shaft of light), the glare at the view's edge on the side of a thing out of view
    this.gOp = uniform(0); this.gCol = uniform(LOOK.glint.col.clone());
    this.glint = this.sprite(glintMaterial(this.gOp, this.gCol), home, 10);
    this.bOp = uniform(0); this.bCol = uniform(new THREE.Color()); this.bRing = uniform(0); this.bShaft = uniform(0); this.bRot = uniform(0);
    this.bloom = this.sprite(lightMaterial(this.bOp, this.bCol, this.bRing, this.bShaft, false, this.bRot), home, 9);
    this.eOp = uniform(0); this.eCol = uniform(new THREE.Color(1, 0.84, 0.62));
    this.edge = this.sprite(lightMaterial(this.eOp, this.eCol, uniform(0), uniform(0), true), home, 11);
    this.cur = null; this.t = 0; this.beat = 0.5; this.flash = -1; this.again = 0; this.left = 0; this.swell = -1;
    this.lit = null; this.spot = new THREE.Vector3(); this.need = 1;
    this.gain = { bloom: 1, shaft: 0.25, edge: 0.8 }; // the lights' strengths
    this.rooms = [];
    for (const p of game.world.placed) for (const r of ROOMS[p.model] || []) {
      const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0), tw = (x, z) => new THREE.Vector3(p.x + x * c + z * s, 0, p.z - x * s + z * c);
      const at = (k) => { const v = tw(r.door[0] + r.n[0] * k, r.door[1] + r.n[1] * k); v.y = game.world.groundAt(v.x, v.z) + 1; return v; };
      this.rooms.push({ in: (v) => { const dx = v.x - p.x, dz = v.z - p.z; return r.in(dx * c - dz * s, dx * s + dz * c); }, doorIn: at(-0.45), doorOut: at(0.6) });
    }
  }
  room(v) { return this.rooms.find((r) => r.in(v)) || null; }
  // a thing in another room than the player: the way there, through the doorway (a hearth seen from afar keeps its
  // smoke over the roof)
  route(c) {
    if (!c) return c;
    const P = this.game.player.pos, rp = this.room(P), rt = this.room(c.at);
    if (rp === rt) return c;
    if (rp) return { kind: 'door', at: rp.doorIn, to: c };
    if (c.top && P.distanceTo(c.at) > LOOK.fire.near * 2) return c;
    return { kind: 'door', at: rt.doorOut, to: c };
  }
  sprite(m, at, order) {
    const s = new THREE.Sprite(m);
    s.position.copy(at); s.castShadow = s.receiveShadow = false; s.renderOrder = order; s.userData.dynamic = true;
    s.layers.set(1); s.visible = false; this.game.engine.scene.add(s);
    return s;
  }

  centre(it) { return _b.setFromObject(it.target).getCenter(new THREE.Vector3()); }
  nearest(list, pos = (x) => x) {
    const P = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const x of list) { const p = pos(x); if (!p) continue; const d = p.distanceToSquared(P); if (d < bd) { bd = d; best = x; } }
    return best;
  }
  hearth() { return this.nearest(this.fires, (i) => i.fireplace.pos?.() || this.centre(i)); }
  // open water ~1.5 m out from the lake's edge on the way from `from` to its middle
  shore(from) {
    const terrain = this.game.world.terrain, dx = LAKE.x - from.x, dz = LAKE.z - from.z, d = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < d; s += 1.5) {
      const x = from.x + dx / d * s, z = from.z + dz / d * s, gy = terrain.height(x, z), wy = terrain.water(x, z, gy);
      if (wy !== null && wy - gy > 0.08) return this.wet(new THREE.Vector3(x + dx / d * 1.5, wy, z + dz / d * 1.5));
    }
    return new THREE.Vector3(LAKE.x, LAKE.level, LAKE.z);
  }
  // `p` moved out into the water far enough for a ring (the lake's rings start 0.3 m in from its edge)
  wet(p) {
    const T = this.game.world.terrain, dx = LAKE.x - p.x, dz = LAKE.z - p.z, d = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < 6 && T.lakeDist(p.x, p.z) - LAKE.r > -0.5; s++) { p.x += dx / d * 0.25; p.z += dz / d * 0.25; }
    return p;
  }
  // a hearth, and where its smoke leaves the roof (the urasa's smoke hole, the balagan's chimney top)
  fireHint(it) {
    if (!it) return null;
    const at = it.fireplace.pos?.() || this.centre(it);
    return { kind: 'fire', it, at, top: at.clone().setY(at.y + (it.fireplace.upright ? 3.3 : 10.5)) };
  }
  sheen(obj, at) { return { kind: 'sheen', obj, at: at || _b.setFromObject(obj).getCenter(new THREE.Vector3()) }; }

  // What the hands should go to next, and how the world says it: { at, kind, … } or null. The rules, job by job.
  next() {
    const g = this.game, h = this.hands, held = h?.held, P = g.player.pos;
    if (!h || g.acting || g.interact.seat.on) return null;
    if (g.interact.rites.some((r) => r.held)) return null; // (the khomus)
    const S = this.split;
    if (S && !S.working && !held && P.distanceTo(S.block) < 8 && (S.restHalf() || S.freeRound() !== undefined)) return { kind: 'glint', at: S.axe.obj.localToWorld(new THREE.Vector3(0.02, 0.66, 0)) }; // wood waits: the sun on the axe's edge
    const F = this.fish;
    if (F && !F.busy && !held) {
      if (F.state === 'shore' && P.distanceTo(F.gap) < 12) return { kind: 'ripple', at: this.wet(F.gap.clone().add(_v.set(0.5, 0, 0))), lap: true }; // fish rising where the trap goes
      if (F.state === 'set' && F.n >= 3 && P.distanceTo(F.trap.obj.position) < 45) return { kind: 'splash', at: this.wet(F.trap.obj.position.clone()), lap: true }; // the catch thrashing in the trap
    }
    const T = this.tuos;
    if (T && !T.busy) {
      if (T.held && !T.made) return this.fireHint(this.hearth()); // made by a fire
      if (T.held && T.made) { // a тордуйа in the hands: the nearest ripe berries
        const full = this.nearest(this.patches.filter((i) => (g.interact.patches.get(i.berries)?.n ?? 1) > 0), (i) => this.centre(i));
        const at = full && this.centre(full);
        return at && at.distanceTo(P) < 80 ? { kind: 'berries', obj: full.target, at } : null;
      }
    }
    const W = this.blank?.target.userData.forge;
    if (W && W.at !== 'rest' && !held && this.forge && P.distanceTo(this.centre(this.forge)) < 14) {
      return W.heat > 0.3 ? { kind: 'ember', at: this.blank.target.getWorldPosition(new THREE.Vector3()) } : this.sheen(this.forge.target); // a knife begun: the iron spits while it is hot, else the bellows
    }
    if (held?.kind === 'log') {
      const pile = h.pile.getWorldPosition(new THREE.Vector3()), fire = this.hearth(), fp = fire && (fire.fireplace.pos?.() || this.centre(fire));
      return fp && fp.distanceTo(P) < pile.distanceTo(P) ? this.fireHint(fire) : this.sheen(this.pile.target);
    }
    if (held === h.pail && h.pail.level < 0.02) return { kind: 'ripple', at: this.shore(P) };
    return null;
  }
  // One beat of the hint `c`: what the world does now and then.
  pulse(c) {
    const g = this.game, a = g.audio, water = g.world.life?.water, L = LOOK[c.kind];
    this.lit = c; // (also a job's own beat, outside the rule table)
    if (L?.px) { this.flash = 0; this.place(c); this.left = (L.sparks || 1) - 1; this.again = 0.45; }
    if (L?.glow) this.swell = 0;
    switch (c.kind) {
      case 'ripple': water?.ring(c.at.x + rand(-0.4, 0.4), c.at.z + rand(-0.4, 0.4), 1, Math.random() < 0.3 ? 2 : 1); break; // a fish rises, now and then jumps
      case 'splash': water?.ring(c.at.x + rand(-0.3, 0.3), c.at.z + rand(-0.3, 0.3), 1, Math.random() < 0.6 ? 2 : 1); break;
      case 'fire': c.it?.fireplace.stir?.(0.45); a?.shot('wood-lay', c.at, 0.22, 1.5, a.near, rand(0.7, 0.85)); break; // a log settles: a knock, the fire lifts
    }
    if (c.lap && Math.random() < 0.5) this.sound('lake', c.at, 0.5, 1.8); // water lapping at the weir
    if (c.kind === 'berries' && (this.call = (this.call ?? 0) - 1) < 0) { this.call = 3; a?.shot(Math.random() < 0.5 ? 'thrush' : 'thrush-2', _v.copy(c.at).setY(c.at.y + 1.5), 0.25, 6, a.outside, rand(0.97, 1.04)); }
  }
  // `dur` s of a long recording from a point, faded in and out
  sound(name, at, gain, dur) {
    const a = this.game.audio, buf = a?.buffers[name];
    if (!buf) return;
    const src = a.shot(name, at, 0, 3, a.outside, rand(0.95, 1.05), rand(0, Math.max(0, buf.duration - dur - 1)));
    if (!src) return;
    const t = a.ctx.currentTime, gn = src.fade.gain;
    gn.setTargetAtTime(gain, t, 0.25); gn.setTargetAtTime(0, t + dur - 0.6, 0.2); src.stop(t + dur + 0.4);
  }

  // where this glint sits: a point of the thing's surface seen from the eye (its upper half, where the sun falls),
  // ~15 cm proud of it towards the eye (clear of its own surface, still behind walls);
  // water: round the rise; a doorway: along its jamb; a point thing (`at` only) as it is
  place(c) {
    const cam = this.game.engine.camera;
    this.spot.copy(c.at);
    if (c.obj) {
      _b.setFromObject(c.obj);
      for (let i = 0; i < 2; i++) { // two tries (a pick costs ≤ ~1 ms on a desktop); a miss: the middle
        _v.set(rand(_b.min.x, _b.max.x), rand((_b.min.y + _b.max.y) / 2, _b.max.y), rand(_b.min.z, _b.max.z));
        _ray.set(cam.position, _w.subVectors(_v, cam.position).normalize());
        const hit = _ray.intersectObject(c.obj, true)[0];
        if (hit) { this.spot.copy(hit.point); break; }
      }
    } else if (c.kind === 'ripple' || c.kind === 'splash') {
      const a = rand(0, 7), q = Math.sqrt(Math.random()) * 0.6;
      this.spot.x += Math.cos(a) * q; this.spot.z += Math.sin(a) * q;
    } else if (c.kind === 'door') this.spot.y += rand(-0.35, 0.55); // up and down the jamb
    this.glint.position.copy(this.spot).addScaledVector(_w.subVectors(cam.position, this.spot).normalize(), Math.min(0.18, this.spot.distanceTo(cam.position) * 0.1));
  }

  // metres across at distance `d` for `px` CSS pixels on screen
  m(px, d) { return d * 2 * Math.tan(THREE.MathUtils.degToRad(this.game.engine.camera.fov) / 2) * px / innerHeight; }

  update(dt) {
    const g = this.game;
    if ((this.t -= dt) <= 0) {
      this.t = 0.2;
      const live = !g.title && !g.paused && !g.ui.modal && !g.stage?.on;
      let c = null;
      try { c = live ? this.route(this.next()) : null; } catch (e) { if (!this.warned) { this.warned = true; console.warn('hints: a rule no longer fits its job', e); } } // a job reworked under the table never stops the frame
      if (c?.kind !== this.cur?.kind) { this.beat = c?.kind === 'fire' ? 0.6 : 0.3; this.call = 0; this.left = 0; }
      this.cur = c;
    }
    const c = this.cur, cam = g.engine.camera, H = innerHeight;
    if (c && BEAT[c.kind] && (this.beat -= dt) <= 0) { const [lo, hi] = BEAT[c.kind]; this.beat = rand(lo, hi); this.pulse(c); }
    const lit = this.lit, L = lit && LOOK[lit.kind];
    if (lit && this.left > 0 && (this.again -= dt) <= 0) { this.left--; this.again = rand(0.3, 0.6); this.flash = 0; this.place(lit); }
    // how much the hint is needed: full far off, fading on the way in, faint once the eye is on it (eased: no pop)
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), th = tv * cam.aspect;
    if (lit) {
      _v.copy(lit.at).applyMatrix4(cam.matrixWorldInverse);
      const aim = 1 - smooth(0.07, 0.22, Math.atan2(Math.hypot(_v.x, _v.y), -_v.z)); // within ~4–13° of the view's middle
      const far = lit.to ? cam.position.distanceTo(lit.to.at) : _v.length(); // a doorway on the way: as far as the thing
      const want = (0.3 + 0.7 * smooth(2, 18, far)) * (1 - 0.85 * aim);
      this.need += (want - this.need) * (1 - Math.exp(-dt / 0.4));
    }
    const need = this.need;
    // the glint: a quick rise, a flicker and out (~0.5 s), on the thing's surface seen from here
    if (this.flash >= 0) {
      this.flash += dt;
      const k = this.flash / 0.5, d = cam.position.distanceTo(this.spot);
      if (k >= 1 || !L?.px || d > FAR) { this.flash = -1; this.glint.visible = false; } else {
        this.gCol.value.copy(L.col);
        this.gOp.value = Math.sin(Math.PI * k) ** 2 * (0.75 + 0.25 * Math.sin(this.flash * 70)) * need;
        const s = this.m(Math.max(L.px, 0.025 * H), d) * THREE.MathUtils.clamp(5 / d, 1, 1.3); // larger close by
        this.glint.scale.set(s, s, 1);
        this.glint.visible = true;
      }
    }
    // the bloom at the thing and the glare at the view's edge: one light, a slow swell and fade with each beat
    let env = 0;
    if (this.swell >= 0) { this.swell += dt; const k = this.swell / SWELL; if (k >= 1 || !L?.glow) this.swell = -1; else env = Math.sin(Math.PI * Math.sqrt(k)) ** 2; }
    this.bloom.visible = this.edge.visible = false;
    if (env <= 0) return;
    env *= need;
    // where the thing is in the view: `inV` 1 well inside, 0 at the edge or out of it
    _v.copy(lit.at).applyMatrix4(cam.matrixWorldInverse);
    const sx = _v.x / -_v.z, sy = _v.y / -_v.z;
    const inV = _v.z < 0 ? 1 - smooth(0.45, 1.1, Math.max(Math.abs(sx) / th, Math.abs(sy) / tv)) : 0;
    const G = L.glow, far = cam.position.distanceTo(lit.at) > (L.near ?? NEAR), top = far && lit.top;
    const at = top || lit.at, d = cam.position.distanceTo(at); // a hearth from afar: its light in the smoke over the roof
    let bw; // the bloom's width (m)
    if (far && !top) { // a shaft of sunlight falling on it
      const w = bw = Math.max(3, this.m(0.09 * H, d));
      _w.copy(g.engine.sun.position).transformDirection(cam.matrixWorldInverse); // the sun's side of the view
      this.bRot.value = THREE.MathUtils.clamp(-_w.x * 0.6, -0.35, 0.35);
      this.bloom.scale.set(w, w * 2.5, 1); this.bloom.center.set(0.5, 0.03); this.bloom.position.copy(at);
      this.bShaft.value = 1; this.bOp.value = env * this.gain.shaft * inV;
    } else {
      const w = bw = Math.max(G.m, this.m(0.06 * H, d) * (G.asp ? 1.6 : 1));
      this.bloom.scale.set(w, w * (G.asp || G.tall || 1), 1); this.bloom.center.set(0.5, 0.5); this.bRot.value = 0;
      this.bloom.position.copy(at).addScaledVector(_w.subVectors(cam.position, at).normalize(), Math.min(0.3, d * 0.1));
      if (G.asp) this.bloom.position.y += w * G.asp * 0.3; // lying on the water or the grass, not sunk in it
      this.bShaft.value = 0; this.bOp.value = env * this.gain.bloom * inV;
    }
    this.bCol.value.copy(G.col); this.bRing.value = G.ring || 0;
    this.bloom.visible = inV > 0;
    if (inV >= 1) return;
    // out of view: the same light flaring in at the view's edge on its side; as the thing comes into view it slides
    // in from the edge onto the thing and shrinks to its bloom, handing over to it
    let ex = _v.x / th, ey = _v.y * 0.35 / tv;
    if (_v.z > 0 && Math.abs(ex) < 0.2 * Math.abs(_v.z / th)) ex = Math.sign(ex || 1) * Math.abs(_v.z / th); // right behind: the nearer shoulder
    const n = Math.max(Math.abs(ex), Math.abs(ey)) || 1;
    ex /= n; ey /= n;
    const k = inV * inV * (3 - 2 * inV);
    this.edge.position.set(THREE.MathUtils.lerp(ex * th * 1.02, sx, k), THREE.MathUtils.lerp(ey * tv * 1.02, sy, k), -1).applyMatrix4(cam.matrixWorld);
    const eh = Math.min(tv, th) * 2 * 0.95, side = Math.abs(ex) > Math.abs(ey); // by the view's short side (a portrait phone)
    const blob = Math.min(eh * 0.5, bw / d * 1.5);
    this.edge.scale.set(THREE.MathUtils.lerp(eh * (side ? 0.3 : 2.4), blob, k), THREE.MathUtils.lerp(eh * (side ? 1.6 : 0.3), blob, k), 1); // a band of light along that edge
    const top3 = Math.max(G.col.r, G.col.g, G.col.b) || 1;
    this.eCol.value.setRGB(G.col.r / top3, G.col.g / top3, G.col.b / top3); // the thing's own light
    this.eOp.value = env * this.gain.edge * (1 - k);
    this.edge.visible = true;
  }
}
