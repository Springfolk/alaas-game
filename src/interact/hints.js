// The next thing to do, told by the world itself (docs/interactions.md "Hints"): while a job is under way or something
// is carried, the thing the hands should go to next answers as it would in life: the axe's edge catches the sun,
// resin on the rounds and billets or the bark's satin glints, a fish rises where the trap goes, the hearth's fire
// settles with a knock and a lift of sparks, grasshoppers chirr in the standing grass, a thrush calls from the ripe
// berries. No mark, no sentence. One table of rules (`next()`), read from the jobs' own state. The glint sprite is
// made before the warm-up; only its uniforms, transform and `visible` change in play; the ripples are the lake's own
// (`world.life.water.ring`), the fire's lift its own flare (`fireplace.stir`).
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { LAKE } from '../world/terrain.js';
import { glintMaterial, lightMaterial } from './glint.js';

const FAR = 45; // m: glints show within this
const NEAR = 14; // m: farther off (the hearth: 7 m) the light at the thing rises as a shaft, seen over roofs and trees
const C = (r, g, b, k) => new THREE.Color(r, g, b).multiplyScalar(k);
// each hint's light: `px` its glint's least size on screen, `col` its colour (HDR), `glow` the bloom at the thing
// (`m` across in metres, `asp` height/width, `ring` a halo's ring), `sparks` glints per beat
const LOOK = {
  glint: { px: 34, col: C(1, 0.95, 0.84, 12), glow: { m: 0.5, col: C(1, 0.93, 0.8, 1.6) } }, // metal
  sheen: { px: 30, col: C(1, 0.9, 0.7, 9), glow: { m: 0.7, col: C(1, 0.85, 0.6, 1.3) }, sparks: 2 }, // resin, bark, wet wicker
  berries: { px: 26, col: C(1, 0.88, 0.82, 8), glow: { m: 0.9, col: C(1, 0.75, 0.62, 1.2) }, sparks: 2 }, // a ripe berry's skin
  ember: { px: 28, col: C(1, 0.5, 0.16, 9), glow: { m: 0.6, col: C(1, 0.45, 0.15, 2) } }, // a spit off hot iron
  fire: { glow: { m: 2.4, col: C(1, 0.55, 0.25, 1.4), ring: 1 }, near: 7 }, // the hearth's light swelling in the smoke
  ripple: { px: 30, col: C(1, 0.96, 0.88, 10), glow: { m: 1.8, asp: 0.35, col: C(1, 0.95, 0.85, 1.1) } }, // the sun on the risen water
  splash: { px: 30, col: C(1, 0.96, 0.88, 10), glow: { m: 1.8, asp: 0.35, col: C(1, 0.95, 0.85, 1.1) }, sparks: 2 },
  dew: { px: 24, col: C(1, 0.97, 0.9, 9), glow: { m: 6, asp: 0.2, col: C(1, 0.95, 0.8, 1) }, sparks: 4 }, // dew on the standing grass
};
// seconds between a hint's beats
const BEAT = { glint: [1.8, 3.2], sheen: [1.4, 2.6], ember: [1.2, 2.4], ripple: [1.6, 3], splash: [1.1, 2.4], fire: [2.4, 3.6], dew: [1.8, 3], berries: [1.6, 2.8] };
const SWELL = 1.8; // s: a bloom's swell and fade
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _b = new THREE.Box3(), _ray = new THREE.Raycaster();
const rand = (a, b) => a + Math.random() * (b - a);

export class Hints {
  constructor(game) {
    this.game = game;
    const its = game.world.interactables, jobs = game.work?.jobs || [];
    this.hands = game.interact.hands;
    this.split = jobs.find((j) => j.axe); this.fish = jobs.find((j) => j.trap); this.hay = jobs.find((j) => j.scythe); this.tuos = jobs.find((j) => j.rest && j.thing);
    this.fires = its.filter((i) => i.fireplace);
    this.heap = its.find((i) => i.rounds); this.tymtay = its.find((i) => i.tymtay); this.stone = its.find((i) => i.offering);
    this.blank = its.find((i) => i.target?.userData.forge); this.forge = its.find((i) => i.act?.id === 'bellows');
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
    this.lit = null; this.spot = new THREE.Vector3();
    this.gain = { bloom: 2.5, shaft: 0.6, edge: 2.5 }; // the lights' strengths
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
  fireHint(it) { return it ? { kind: 'fire', it, at: it.fireplace.pos?.() || this.centre(it), top: it.fireplace.top?.() } : null; }
  sheen(obj, at) { return { kind: 'sheen', obj, at: at || _b.setFromObject(obj).getCenter(new THREE.Vector3()) }; }

  // What the hands should go to next, and how the world says it: { at, kind, … } or null. The rules, job by job.
  next() {
    const g = this.game, h = this.hands, held = h?.held, P = g.player.pos;
    if (!h || g.acting || g.interact.seat.on || g.choosing) return null;
    for (const r of g.interact.rites) {
      if (!r.held) continue;
      if (r.fillAct) return this.fireHint(this.hearth()); // the guest's choron: the first drops are the fire's
      if (r.pourAct) return r.milk > 0 ? { kind: 'ripple', at: this.shore(this.centre(this.stone)) } : null; // the lake's milk: to the water
      return null;
    }
    const S = this.split;
    if (S && !S.sw) {
      const c = S.onBlock;
      if (S.axeHeld) {
        if (c) { if (c.state === 'block') return this.sheen(c.pieces[0].obj); } else {
          const rest = this.nearest(S.chunks.filter((x) => x.state === 'rest'), (x) => x.pos);
          if (rest) return this.sheen(rest.pieces[0].obj); // a half lies there: back onto the block
          if (S.freeRound() !== undefined) return this.sheen(this.heap.target);
          const loose = this.nearest(S.pieces.filter((p) => p.state === 'ground'), (p) => p.obj.position); // every round is in billets: carry them off
          if (loose) return this.sheen(loose.obj);
        }
      } else if (!held && P.distanceTo(S.block) < 8) {
        if (c?.state === 'block') return { kind: 'glint', at: S.axe.obj.localToWorld(new THREE.Vector3(0.02, 0.66, 0)) }; // a round stands ready: the sun on the axe's edge
        const rest = !c && this.nearest(S.chunks.filter((x) => x.state === 'rest'), (x) => x.pos);
        if (rest) return this.sheen(rest.pieces[0].obj);
      }
    }
    const F = this.fish;
    if (F && !F.busy) {
      if (F.held) return F.n > 0 ? this.sheen(this.tymtay.target) : { kind: 'ripple', at: this.wet(F.gap.clone().add(_v.set(0.5, 0, 0))), lap: true }; // fish rising where the trap goes
      if (F.state === 'set' && F.n >= 3 && !held && P.distanceTo(F.trap.obj.position) < 45) return { kind: 'splash', at: this.wet(F.trap.obj.position.clone()), lap: true }; // the catch thrashing in the trap
    }
    const H = this.hay;
    if (H?.held && !H.sw) {
      const mask = H.mask;
      if (mask?.tall && !mask.tall(P.x, P.z)) { const at = this.meadow(H, mask); return at && { kind: 'dew', at }; }
      return null;
    }
    const T = this.tuos;
    if (T && !T.busy) {
      if (T.held && !T.made) return T.warm > 0 ? null : this.fireHint(this.hearth()); // soft: it is folded in the hands, the bark shows it
      if (T.held && T.made) { // a тордуйа in the hands: the nearest ripe berries
        const full = this.nearest(this.patches.filter((i) => (g.interact.patches.get(i.berries)?.n ?? 1) > 0), (i) => this.centre(i));
        const at = full && this.centre(full);
        return at && at.distanceTo(P) < 80 ? { kind: 'berries', obj: full.target, at } : null;
      }
      if (!held && !T.made && T.onHide && T.warm > 0 && P.distanceTo(T.rest.p) < 20) return this.sheen(T.thing.obj);
    }
    const W = this.blank?.target.userData.forge;
    if (W && W.at !== 'rest' && !held && this.forge && P.distanceTo(this.centre(this.forge)) < 14) {
      if (W.fly || W.busy || W.at === 'tub') return null;
      return this.blank.live()?.id !== 'bellows' ? { kind: 'ember', at: this.blank.target.getWorldPosition(new THREE.Vector3()) } : this.sheen(this.forge.target); // the iron spits when it is ready for the hands, else the bellows
    }
    if (held?.kind === 'log') {
      const pile = h.pile.getWorldPosition(new THREE.Vector3()), fire = this.hearth(), fp = fire && (fire.fireplace.pos?.() || this.centre(fire));
      return fp && fp.distanceTo(P) < pile.distanceTo(P) ? this.fireHint(fire) : this.sheen(this.pile.target);
    }
    if (held === h.pail && h.pail.level < 0.02) return { kind: 'ripple', at: this.shore(P) };
    return null;
  }
  // standing grass nearest the mower: looked for round the scythe's post
  meadow(H, mask) {
    const P = this.game.player.pos, c = H.home.p;
    let best = null, bd = Infinity;
    for (let r = 4; r <= 28; r += 4) for (let a = 0; a < 12; a++) {
      const x = c.x + Math.cos(a * Math.PI / 6) * r, z = c.z + Math.sin(a * Math.PI / 6) * r;
      if (!mask.tall(x, z)) continue;
      const d = (x - P.x) ** 2 + (z - P.z) ** 2;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    return best ? new THREE.Vector3(best[0], this.game.world.groundAt(best[0], best[1]) + 0.4, best[1]) : null;
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
  // ~15 cm proud of it towards the eye (clear of its own surface, still behind walls); dew: anywhere on the grass
  // round it; water: round the rise; a point thing (`at` only) as it is
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
    } else if (c.kind === 'dew' || c.kind === 'ripple' || c.kind === 'splash') {
      const r = c.kind === 'dew' ? 2.2 : 0.6, a = rand(0, 7), q = Math.sqrt(Math.random()) * r;
      this.spot.x += Math.cos(a) * q; this.spot.z += Math.sin(a) * q;
      if (c.kind === 'dew') this.spot.y = this.game.world.groundAt(this.spot.x, this.spot.z) + rand(0.25, 0.5);
    }
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
      try { c = live ? this.next() : null; } catch (e) { if (!this.warned) { this.warned = true; console.warn('hints: a rule no longer fits its job', e); } } // a job reworked under the table never stops the frame
      if (c?.kind !== this.cur?.kind) { this.beat = c?.kind === 'fire' ? 0.6 : 0.3; this.call = 0; this.left = 0; }
      this.cur = c;
    }
    const c = this.cur, cam = g.engine.camera, H = innerHeight;
    if (c && BEAT[c.kind] && (this.beat -= dt) <= 0) { const [lo, hi] = BEAT[c.kind]; this.beat = rand(lo, hi); this.pulse(c); }
    const lit = this.lit, L = lit && LOOK[lit.kind];
    if (lit && this.left > 0 && (this.again -= dt) <= 0) { this.left--; this.again = rand(0.3, 0.6); this.flash = 0; this.place(lit); }
    // the glint: a quick rise, a flicker and out (~0.5 s), on the thing's surface seen from here
    if (this.flash >= 0) {
      this.flash += dt;
      const k = this.flash / 0.5, d = cam.position.distanceTo(this.spot);
      if (k >= 1 || !L?.px || d > FAR) { this.flash = -1; this.glint.visible = false; } else {
        this.gCol.value.copy(L.col);
        this.gOp.value = Math.sin(Math.PI * k) ** 2 * (0.75 + 0.25 * Math.sin(this.flash * 70));
        const s = this.m(Math.max(L.px, 0.055 * H), d) * THREE.MathUtils.clamp(5 / d, 1, 1.8); // larger close by
        this.glint.scale.set(s, s, 1);
        this.glint.visible = true;
      }
    }
    // the bloom at the thing and the glare at the view's edge: a slow swell and fade with each beat
    let env = 0;
    if (this.swell >= 0) { this.swell += dt; const k = this.swell / SWELL; if (k >= 1 || !L?.glow) this.swell = -1; else env = Math.sin(Math.PI * Math.sqrt(k)) ** 2; }
    this.bloom.visible = this.edge.visible = false;
    if (env <= 0) return;
    const G = L.glow, far = cam.position.distanceTo(lit.at) > (L.near ?? NEAR), top = far && lit.top;
    const at = top || lit.at, d = cam.position.distanceTo(at); // a hearth from afar: its light in the smoke over the roof
    if (far && !top) { // a shaft of sunlight falling on it
      const w = Math.max(5, this.m(0.15 * H, d));
      _w.copy(g.engine.sun.position).transformDirection(cam.matrixWorldInverse); // the sun's side of the view
      this.bRot.value = THREE.MathUtils.clamp(-_w.x * 0.6, -0.35, 0.35);
      this.bloom.scale.set(w, w * 3, 1); this.bloom.center.set(0.5, 0.03); this.bloom.position.copy(at);
      this.bShaft.value = 1; this.bOp.value = env * this.gain.shaft;
    } else {
      const w = Math.max(G.m, this.m(0.1 * H, d) * (G.asp ? 1.6 : 1));
      this.bloom.scale.set(w, w * (G.asp || 1), 1); this.bloom.center.set(0.5, 0.5); this.bRot.value = 0;
      this.bloom.position.copy(at).addScaledVector(_w.subVectors(cam.position, at).normalize(), Math.min(0.3, d * 0.1));
      if (G.asp) this.bloom.position.y += w * G.asp * 0.3; // lying on the water or the grass, not sunk in it
      this.bShaft.value = 0; this.bOp.value = env * this.gain.bloom;
    }
    this.bCol.value.copy(G.col); this.bRing.value = G.ring || 0;
    this.bloom.visible = true;
    // out of view: sunlight flaring in at the edge of the view on its side
    _v.copy(lit.at).applyMatrix4(cam.matrixWorldInverse);
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), th = tv * cam.aspect;
    if (_v.z < 0 && Math.abs(_v.x / -_v.z) < th * 0.95 && Math.abs(_v.y / -_v.z) < tv * 0.95) return;
    let ex = _v.x / th, ey = _v.y * 0.35 / tv;
    if (_v.z > 0 && Math.abs(ex) < 0.2 * Math.abs(_v.z / th)) ex = Math.sign(ex || 1) * Math.abs(_v.z / th); // right behind: the nearer shoulder
    const n = Math.max(Math.abs(ex), Math.abs(ey)) || 1;
    ex /= n; ey /= n;
    this.edge.position.set(ex * th * 1.02, ey * tv * 1.02, -1).applyMatrix4(cam.matrixWorld);
    const eh = Math.min(tv, th) * 2 * 0.95, side = Math.abs(ex) > Math.abs(ey); // by the view's short side (a portrait phone)
    this.edge.scale.set(eh * (side ? 0.5 : 2.4), eh * (side ? 1.6 : 0.5), 1); // a band of light along that edge
    this.eOp.value = env * this.gain.edge;
    this.edge.visible = true;
  }
}
