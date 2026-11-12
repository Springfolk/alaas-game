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
import { glintMaterial } from './glint.js';

const FAR = 45; // m: glints show within this
// a glint by what it is off: size on screen (px), colour (HDR)
const LOOK = {
  glint: { px: 34, col: new THREE.Color(1, 0.95, 0.84).multiplyScalar(12) }, // metal
  sheen: { px: 28, col: new THREE.Color(1, 0.9, 0.7).multiplyScalar(9) }, // resin, bark, wet wicker
  berries: { px: 24, col: new THREE.Color(1, 0.88, 0.82).multiplyScalar(8) }, // a ripe berry's skin
  ember: { px: 26, col: new THREE.Color(1, 0.5, 0.16).multiplyScalar(9) }, // a spit off hot iron
};
// seconds between a hint's beats (a glint, a rise, a settle of the fire, a call)
const BEAT = { glint: [1.8, 3.2], sheen: [1.4, 2.6], ember: [1.2, 2.4], ripple: [1.6, 3], splash: [1.1, 2.4], fire: [3, 5], chirr: [2.6, 4.2], berries: [1.6, 2.8] };
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
    const scene = game.engine.scene, home = this.heap ? this.centre(this.heap) : new THREE.Vector3();
    // the glint: a sun star off metal, resin, bark or a ripe berry (an ember's spit off hot iron)
    this.gOp = uniform(0); this.gCol = uniform(LOOK.glint.col.clone());
    const s = this.glint = new THREE.Sprite(glintMaterial(this.gOp, this.gCol));
    s.position.copy(home); s.castShadow = s.receiveShadow = false; s.renderOrder = 10; s.userData.dynamic = true;
    s.visible = false; scene.add(s);
    this.cur = null; this.t = 0; this.beat = 0.5; this.flash = -1; this.again = 0;
    this.at = new THREE.Vector3(); this.spot = new THREE.Vector3();
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
  fireHint(it) { return it ? { kind: 'fire', it, at: it.fireplace.pos?.() || this.centre(it) } : null; }
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
      if (mask?.tall && !mask.tall(P.x, P.z)) { const at = this.meadow(H, mask); return at && { kind: 'chirr', at }; }
      return null;
    }
    const T = this.tuos;
    if (T && !T.busy) {
      if (T.held && !T.made) return T.warm > 0 ? { kind: 'sheen', at: T.rest.p.clone().setY(T.rest.p.y + 0.02) } : this.fireHint(this.hearth()); // warm: the hide
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
      return this.blank.live() ? { kind: 'ember', at: this.blank.target.getWorldPosition(new THREE.Vector3()) } : this.sheen(this.forge.target); // the iron spits when it is ready for the hands, else the bellows
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
    const g = this.game, a = g.audio, water = g.world.life?.water;
    switch (c.kind) {
      case 'glint': case 'ember': this.flash = 0; this.place(c); break;
      case 'sheen': case 'berries': this.flash = 0; this.place(c); this.again = 0.45; break; // resin, bark, berries: a glitter of two
      case 'ripple': water?.ring(c.at.x + rand(-0.4, 0.4), c.at.z + rand(-0.4, 0.4), 1, Math.random() < 0.3 ? 2 : 1); break; // a fish rises, now and then jumps
      case 'splash': water?.ring(c.at.x + rand(-0.3, 0.3), c.at.z + rand(-0.3, 0.3), 1, Math.random() < 0.6 ? 2 : 1); break;
      case 'fire': c.it.fireplace.stir?.(0.45); a?.shot('wood-lay', c.at, 0.22, 1.5, a.near, rand(0.7, 0.85)); break; // a log settles: a knock, a lift of sparks
      case 'chirr': this.sound('insects', c.at, 0.9, 2.2); break;
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
  // ~15 cm proud of it towards the eye (clear of its own surface, still behind walls); a point thing (`at` only) as it is
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
    }
    this.glint.position.copy(this.spot).addScaledVector(_w.subVectors(cam.position, this.spot).normalize(), Math.min(0.18, this.spot.distanceTo(cam.position) * 0.1));
  }

  update(dt) {
    const g = this.game;
    if ((this.t -= dt) <= 0) {
      this.t = 0.2;
      const live = !g.title && !g.paused && !g.ui.modal && !g.stage?.on;
      const c = live ? this.next() : null;
      if (c?.kind !== this.cur?.kind) { this.beat = c?.kind === 'fire' ? 0.6 : 0.3; this.call = 0; }
      this.cur = c;
      if (c) this.at.copy(c.at);
    }
    const c = this.cur, cam = g.engine.camera;
    if (c && (this.beat -= dt) <= 0) { const [lo, hi] = BEAT[c.kind]; this.beat = rand(lo, hi); this.pulse(c); }
    if (c && this.again > 0 && (this.again -= dt) <= 0) { this.flash = 0; this.place(c); }
    // the glint: a quick rise, a flicker and out (~0.5 s), on the thing's surface seen from here
    if (this.flash < 0) return;
    this.flash += dt;
    const k = this.flash / 0.5, L = LOOK[c?.kind], d = cam.position.distanceTo(this.spot);
    if (k >= 1 || !L || d > FAR) { this.flash = -1; this.glint.visible = false; return; }
    this.gCol.value.copy(L.col);
    this.gOp.value = Math.sin(Math.PI * k) ** 2 * (0.75 + 0.25 * Math.sin(this.flash * 70));
    const s = d * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * L.px * THREE.MathUtils.clamp(5 / d, 1, 1.8) / innerHeight; // larger close by
    this.glint.scale.set(s, s, 1);
    this.glint.visible = true;
  }
}
