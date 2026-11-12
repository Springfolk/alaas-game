// Туу: the wicker fish trap in the lake's shallows. Carry the trap out to the weir (быһыт), set it in the gap,
// leave it: мунду (lake minnow) find their way in over a few minutes, and show through the wicker. Lift it out
// (each tap brings it up a third, heavy with water), carry it to the carrier (тымтай) on the shore and tip it over
// it: each tap slides a third of the catch out. Every step works from anywhere near the weir or the carrier.
// Then it can be set again. Nothing is told in words: the fish in the trap and in the carrier are the count.
// Props: src/models/fishery.js.
import * as THREE from 'three/webgpu';
import { ease } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  tuu: L('туу', 'fish trap', 'верша'),
  take: L('ыл', 'pick it up', 'взять'),
  set: L('быһыт ааныгар ук', 'set it in the gap of the weir', 'поставить в проход запруды'),
  lift: L('тууну таһаар', 'lift the trap out', 'вынуть вершу'),
  pour: L('тылбыытын ас, тымтайга сүөкээ', 'open the tail and tip the catch in', 'открыть хвост и высыпать улов'),
  proverb: L('Оннооҕор туу сүрэхтээх.', '“Even a fish trap has a heart.”', '«Даже у верши есть сердце».'),
  proverbBy: L('өс хоһооно', 'a Sakha saying', 'якутская пословица'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Vector3();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
// camera-space poses (the trap's origin is its mouth): carried across the body, and tipped tail-down to pour
const CARRY = { p: [-0.42, -0.46, -0.62], q: basisQ(new THREE.Vector3(0.95, 0.12, -0.25), new THREE.Vector3(0, 1, 0)) };
const TIP = { p: new THREE.Vector3(0, -0.18, -0.9), q: basisQ(new THREE.Vector3(0.03, -0.75, -0.66), new THREE.Vector3(1, 0, 0)) }; // held out by the mouth, the tail down over the carrier
const FULL = 110; // s for the trap to fill to ~2/3 of what it can hold

export class Fish {
  constructor(work, parts, find) {
    this.work = work;
    const game = this.game = work.game, hands = this.hands = work.hands;
    this.parts = parts;
    hands.addKind('tuu', CARRY, {
      r: 0.3, lift: 0.18, sound: 'wood-lay-2',
      q: (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, yaw + Math.PI / 2, 0, 'YXZ')),
    });
    this.trap = hands.addThing({ kind: 'tuu', obj: parts.trap, it: find(parts.trap), name: TXT.tuu });
    this.trap.it.thing = this.trap;
    this.gap = parts.object.localToWorld(parts.gap.clone());
    this.gapIt = game.world.interactables.find((i) => i.gap);
    this.state = 'shore'; // 'shore' | 'set' | 'lifting'
    this.t = 0; this.n = 0; this.luck = 1;
    this.total = 0;
    this.pose = null;
    const own = hands.pose;
    hands.pose = (dt, cam) => (hands.held === this.trap ? this.pose : own?.(dt, cam)); // (the axe's swing keeps its own)
  }
  get held() { return this.hands.held === this.trap; }

  actFor(it) {
    const h = this.hands.held;
    if (it.tuu) {
      if (this.state === 'set' || this.state === 'lifting') return h ? null : this.liftAct;
      if (this.busy) return null;
      return h ? null : this.hands.takeAct;
    }
    if (it.gap) return this.held && !this.busy ? this.setAct : null;
    if (it.tymtay) return this.held && !this.busy ? this.pourAct : undefined;
    return undefined;
  }
  // from anywhere near: the trap to the weir's gap, the set trap out, the catch into the carrier
  idleAct() {
    if (this.busy && this.held) return this.noAct;
    const pl = this.game.player.pos, near = (p, r) => Math.hypot(p.x - pl.x, p.z - pl.z) < r;
    if (this.held) {
      if (this.state === 'shore' && near(this.gap, 3.2)) return this.setAct;
      const ty = this.tyIt ||= this.game.world.interactables.find((i) => i.tymtay);
      if (this.n > 0 && ty && near(ty.target.getWorldPosition(_v), 2.6)) return this.pourAct;
      return null;
    }
    if (!this.hands.held && (this.state === 'set' || this.state === 'lifting') && near(this.trap.obj.position, 3.2)) return this.liftAct;
    return null;
  }
  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };

  setAct = {
    id: 'set-tuu', label: TXT.set,
    run: async (game) => {
      if (!this.held) return;
      const t = this.hands.letGo();
      // across the gap, the mouth towards the open water on the weir's east side, all but its back under water
      const q = basisQ(_v.set(-1, 0, 0).clone(), new THREE.Vector3(0, 1, 0));
      const p = this.gap.clone().add(new THREE.Vector3(0.5, 0, 0));
      await this.hands.fly(t, p, q, 0.7);
      game.audio?.play('water-pour-2', p);
      this.state = 'set'; this.t = 0; this.n = 0; this.pour0 = 0; this.luck = 0.75 + Math.random() * 0.4;
      t.it.off = false; t.obj.userData.sphere = undefined;
      game.promptKey = null;
    },
  };

  // a tap: the trap comes up a third (a full one more slowly); taps during it are the next pulls
  liftAct = { id: 'lift-tuu', label: TXT.lift, run: () => this.lift(), tap: () => { this.pulls = (this.pulls || 0) + 1; } };
  async lift() {
    if ((this.state !== 'set' && this.state !== 'lifting') || this.hands.held) return;
    const g = this.game, o = this.trap.obj;
    if (this.state === 'set') { this.state = 'lifting'; this.lk = 0; this.y0 = o.position.y; }
    this.pulls = 1;
    while (this.pulls > 0 && this.lk < 1) {
      this.pulls--;
      g.audio?.play('water-pour', o.position);
      const from = this.lk, to = Math.min(1, Math.round((from + 1 / 3) * 3) / 3), dur = 0.4 + 0.25 * Math.min(1, this.n / this.parts.max.trap);
      await this.tween(dur, (k) => { this.lk = from + (to - from) * ease(k); o.position.y = this.y0 + ease(this.lk) * 0.55; o.rotation.z = Math.sin(k * Math.PI) * 0.04; o.userData.sphere = undefined; });
    }
    if (this.lk < 1) { g.promptKey = null; return; }
    this.state = 'shore';
    this.hands.hold(this.trap);
    this.hands.weigh(0.3 + 0.6 * Math.min(1, this.n / this.parts.max.trap));
    g.promptKey = null;
  }

  // a tap tips it tail-down over the carrier: a third of the catch slides out
  pourAct = {
    id: 'pour-tuu', label: TXT.pour,
    run: async (game) => {
      if (!this.held || this.busy) return;
      this.busy = true;
      const from = { p: new THREE.Vector3(...CARRY.p), q: CARRY.q.clone() };
      const P = this.pose = { p: from.p.clone(), q: from.q.clone() };
      const per = Math.max(1, Math.ceil((this.pour0 ||= this.n) / 3));
      let out = 0;
      const tip = (k) => { P.p.lerpVectors(from.p, TIP.p, ease(k)); P.q.slerpQuaternions(from.q, TIP.q, ease(k)); this.overGround(P); };
      await this.tween(0.4, tip);
      game.audio?.play('water-pour-2', this.tyIt?.target.getWorldPosition(_v) || game.engine.camera.position);
      for (let i = 0; i < per && this.n > 0; i++) {
        await this.tween(0.12, () => {});
        this.n--; out++; this.total++;
        this.parts.inTrap.userData.show(Math.min(this.n, this.parts.max.trap));
        this.parts.inBasket.userData.show(Math.min(this.parts.max.basket, this.total));
      }
      await this.tween(0.35, (k) => tip(1 - k));
      this.pose = null; this.busy = false; this.shown = this.n;
      if (this.n <= 0) this.pour0 = 0;
      if (out) { const all = this.work.count('mundu', out); if (all === out) this.work.say(TXT.proverb, TXT.proverbBy); }
      game.promptKey = null;
    },
  };
  // a pose (camera space) raised so the trap's tail stays over the ground as drawn (looking down a slope it went in)
  overGround(P) {
    const cam = this.game.engine.camera, o = this.trap.obj;
    if (this.len === undefined) { let y = 0; o.traverse((m) => { if (m.geometry?.attributes.position) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); y = Math.max(y, m.geometry.boundingBox.max.y); } }); this.len = y; }
    const t = cam.localToWorld(_w.set(0, this.len, 0).applyQuaternion(P.q).add(P.p));
    const lack = this.game.world.drawnAt(t.x, t.z) + 0.08 - t.y;
    if (lack > 0) P.p.add(_w.set(0, lack, 0).transformDirection(cam.matrixWorldInverse).multiplyScalar(lack));
  }
  tween(dur, step) { return new Promise((res) => { (this.tweens ||= []).push({ dur, k: 0, step, res }); }); }

  update(dt) {
    for (const t of [...(this.tweens || [])]) {
      t.k = Math.min(1, t.k + dt / t.dur); t.step(t.k);
      if (t.k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res(); }
    }
    this.step?.(dt);
    if (this.state === 'set') {
      // they come in quickly at first, then ever more slowly as the trap fills
      this.t += dt;
      this.n = Math.floor(this.parts.max.trap * 1.6 * (1 - Math.exp(-this.t / FULL)) * this.luck);
      if (this.n !== this.shown) { this.shown = this.n; this.parts.inTrap.userData.show(Math.min(this.n, this.parts.max.trap)); } // they show through the wicker
    }
    const off = !(this.held || this.state === 'shore' && !this.hands.held);
    if (this.gapIt.off !== off) { this.gapIt.off = off; this.game.promptKey = null; }
  }
}
