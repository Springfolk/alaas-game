// Туу: the wicker fish trap in the lake's shallows, in two short watched scenes (framed views, src/interact/framed.js).
// Setting: one tap at the weir (or the trap on the shore) and the trap is carried out and set in the gap of the weir
// (быһыт), its mouth to the open water. Then мунду (lake minnow) find their way in over a few minutes and show
// through the wicker. Lifting: one tap and it comes up out of the water streaming, the fish flapping in it, is
// carried over the carrier (тымтай) on the shore, its tail opened and the catch tipped in, and laid back on the
// shore, ready to be set again. Nothing is told in words: the fish in the trap and in the carrier are the count.
// Props: src/models/fishery.js.
import * as THREE from 'three/webgpu';
import { ease } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  set: L('быһыт ааныгар ук', 'set it in the gap of the weir', 'поставить в проход запруды'),
  lift: L('тууну таһаар', 'lift the trap out', 'вынуть вершу'),
  proverb: L('Оннооҕор туу сүрэхтээх.', '“Even a fish trap has a heart.”', '«Даже у верши есть сердце».'),
  proverbBy: L('өс хоһооно', 'a Sakha saying', 'якутская пословица'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Vector3();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const FULL = 110; // s for the trap to fill to ~2/3 of what it can hold
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class Fish {
  constructor(work, parts, find) {
    this.work = work;
    const game = this.game = work.game;
    this.hands = work.hands;
    this.parts = parts;
    const o = parts.trap;
    this.trap = { obj: o, it: find(o) };
    this.home = { p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()) }; // on the shore
    game.engine.scene.attach(o); // moved in world space
    this.gap = parts.object.localToWorld(parts.gap.clone());
    this.gapIt = game.world.interactables.find((i) => i.gap);
    this.tyIt = game.world.interactables.find((i) => i.tymtay);
    this.basket = parts.basket.getWorldPosition(new THREE.Vector3());
    this.sets = { p: this.gap.clone().add(V(0.5, 0, 0)), q: basisQ(V(-1, 0, 0), V(0, 1, 0)) }; // across the gap, the mouth to the open water on the weir's east side
    this.state = 'shore'; // 'shore' | 'set' | 'lifted'
    this.t = 0; this.n = 0; this.luck = 1;
    this.total = 0;
    this.drip = 0; // 0…1: water running off the trap
  }

  actFor(it) {
    if (!it.tuu && !it.gap) return undefined;
    return this.busy || this.hands.held ? null : this.state === 'set' ? this.liftAct : this.state === 'shore' ? this.setAct : null;
  }
  // free hands near the weir: the same
  idleAct() {
    if (this.busy || this.hands.held) return null;
    const pl = this.game.player.pos;
    return Math.hypot(this.gap.x - pl.x, this.gap.z - pl.z) < 3.2 ? this.actFor({ gap: true }) : null;
  }

  setAct = { id: 'set-tuu', label: TXT.set, run: (game) => this.setIt(game) };
  liftAct = { id: 'lift-tuu', label: TXT.lift, run: (game) => this.liftIt(game) };
  // the view, from the player's side of the weir
  view(c, r, el = 0.55) { return { c, r, yaw: Math.atan2(1, -0.7), el, fov: 42 }; } // from the shore east of the weir, clear of its stakes
  // the trap from where it is to (p, q) over `dur` s, lifted `arc` m on the way
  go(p, q, dur, arc = 0.25) {
    const o = this.trap.obj, p0 = o.position.clone(), q0 = o.quaternion.clone();
    return this.tween(dur, (k) => { const e = ease(k); o.position.lerpVectors(p0, p, e); o.position.y += Math.sin(k * Math.PI) * arc; o.quaternion.slerpQuaternions(q0, q, e); o.userData.sphere = undefined; });
  }

  async setIt(game) {
    if (this.busy || this.state !== 'shore') return;
    const F = game.framed;
    this.busy = true;
    if (await F.open(this.view(this.gap.clone().lerp(this.home.p, 0.4).add(V(0, 0.2, 0)), 1.2, 0.65))) {
      await this.go(this.sets.p.clone().add(V(0, 0.35, 0)), this.sets.q, 1.3, 0.3); // carried out over the gap
      F.aim(this.view(this.gap.clone().add(V(0.4, 0.15, 0)), 0.75, 0.55));
      await this.go(this.sets.p, this.sets.q, 0.6, 0); // into the water
      game.audio?.play('water-pour-2', this.sets.p);
      this.rings(this.sets.p, 3);
      this.state = 'set'; this.t = 0; this.n = 0; this.luck = 0.75 + Math.random() * 0.4;
      await this.wait(1.2);
      if (F.on) await F.close();
    } else if (this.trap.obj.position.distanceTo(this.home.p) > 0.01) await this.go(this.home.p, this.home.q, 0.6);
    this.busy = false;
    game.promptKey = null;
  }

  async liftIt(game) {
    if (this.busy || this.state !== 'set') return;
    const F = game.framed, o = this.trap.obj, P = this.parts;
    this.busy = true;
    if (!(await F.open(this.view(this.gap.clone().add(V(0.4, 0.35, 0)), 0.8, 0.4)))) { this.busy = false; return; }
    // up out of the water, heavy, streaming
    this.state = 'lifted'; this.n = Math.min(this.n, P.max.trap);
    game.audio?.play('water-pour', o.position);
    this.drip = 1; this.flap = 1;
    await this.go(this.sets.p.clone().add(V(0, 0.6, 0)), this.sets.q, 1.1, 0);
    this.rings(this.sets.p, 2);
    await this.wait(1.0); // it drains, they flap
    // over the carrier, the tail down: the catch slides out
    F.aim(this.view(this.basket.clone().add(V(0, 0.5, 0)), 0.75, 0.5));
    const tipQ = basisQ(V(0.15, -1, 0.1), V(1, 0, 0)), over = this.basket.clone().add(V(0, 0.48 + P.len, 0));
    await this.go(over, tipQ, 1.4, 0.25);
    game.audio?.play('water-pour-2', this.basket);
    let out = 0;
    while (this.n > 0) {
      await this.wait(0.11);
      this.n--; out++; this.total++;
      P.inTrap.userData.show(Math.min(this.n, P.max.trap));
      P.inBasket.userData.show(Math.min(P.max.basket, this.total));
    }
    this.flap = 0;
    await this.wait(0.8);
    this.state = 'shore';
    if (F.on) await F.close();
    await this.go(this.home.p, this.home.q, 0.9); // laid back on the shore
    this.drip = 0;
    if (out) { const all = this.work.count('mundu', out); if (all === out) this.work.say(TXT.proverb, TXT.proverbBy); }
    this.busy = false;
    game.promptKey = null;
  }
  rings(p, n) { const w = this.game.world.life?.water; for (let i = 0; i < n; i++) w?.ring(p.x + (Math.random() - 0.5) * 0.5, p.z + (Math.random() - 0.5) * 0.5, 1, 2); }
  wait(s) { return this.tween(s, () => {}); }
  tween(dur, step) { return new Promise((res) => { (this.tweens ||= []).push({ dur, k: 0, step, res }); }); }

  update(dt) {
    for (const t of [...(this.tweens || [])]) {
      t.k = Math.min(1, t.k + dt / t.dur); t.step(t.k);
      if (t.k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res(); }
    }
    const P = this.parts, o = this.trap.obj;
    if (this.state === 'set') {
      // they come in quickly at first, then ever more slowly as the trap fills
      this.t += dt;
      this.n = Math.floor(P.max.trap * 1.6 * (1 - Math.exp(-this.t / FULL)) * this.luck);
      if (this.n !== this.shown) { this.shown = this.n; P.inTrap.userData.show(Math.min(this.n, P.max.trap)); } // they show through the wicker
    }
    if (this.flap) P.inTrap.userData.flap(performance.now() / 1000, this.flap);
    // strands of water from the laths down to the lake (or the ground), thinning as it drains
    if (this.drip > 0) {
      this.drip = Math.max(0, this.drip - dt / 3.2);
      if ((this.ringT = (this.ringT || 0) - dt) < 0 && this.state === 'lifted' && o.position.distanceTo(this.sets.p) < 1) { this.ringT = 0.25; this.rings(this.sets.p, 1); } // drops on the water under it
      const terrain = this.game.world.terrain;
      for (const d of P.drips) {
        _w.copy(d.userData.at).applyQuaternion(o.quaternion).add(o.position);
        const gy = terrain.height(_w.x, _w.z), wy = terrain.water(_w.x, _w.z, gy) ?? gy, len = _w.y - wy;
        d.visible = len > 0.03 && Math.random() < 0.3 + this.drip;
        if (!d.visible) continue;
        P.object.worldToLocal(d.position.copy(_w));
        d.scale.set(0.4 + this.drip, len, 0.4 + this.drip);
        d.userData.sphere = undefined;
      }
    } else if (P.drips.some((d) => d.visible)) for (const d of P.drips) d.visible = false;
  }
}
