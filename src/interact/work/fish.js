// Туу: the wicker fish trap in the lake's shallows. Carry the trap out to the weir (быһыт), set it in the gap,
// leave it: мунду (lake minnow) find their way in over a few minutes, and show through the wicker. Lift it out
// (the do input held: it comes up heavy, and settles back if let go), carry it to the carrier (тымтай) on the shore
// and tip it for as long as it is held over it: the catch slides out, what is not yet out stays in the trap.
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
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
// camera-space poses (the trap's origin is its mouth): carried across the body, and tipped tail-down to pour
const CARRY = { p: [-0.42, -0.5, -0.62], q: basisQ(new THREE.Vector3(0.95, 0.12, -0.25), new THREE.Vector3(0, 1, 0)) };
const TIP = { p: new THREE.Vector3(-0.05, 0.2, -0.62), q: basisQ(new THREE.Vector3(0.05, -0.97, -0.2), new THREE.Vector3(1, 0, 0)) };
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
      if (this.state === 'set') return h ? null : this.liftAct;
      if (this.state === 'lifting' || this.busy) return null;
      return h ? null : this.hands.takeAct;
    }
    if (it.gap) return this.held && !this.busy ? this.setAct : null;
    if (it.tymtay) return this.held && !this.busy ? this.pourAct : undefined;
    return undefined;
  }
  idleAct() { return this.busy && this.held ? this.noAct : null; }
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
      this.state = 'set'; this.t = 0; this.n = 0; this.luck = 0.75 + Math.random() * 0.4;
      t.it.off = false; t.obj.userData.sphere = undefined;
      game.promptKey = null;
    },
  };

  liftAct = { id: 'lift-tuu', label: TXT.lift, run: () => this.lift() };
  // held: the trap comes up heavy with water; let go early and it settles back
  async lift() {
    if (this.state !== 'set' || this.hands.held) return;
    const g = this.game, inp = g.input, o = this.trap.obj, y0 = o.position.y;
    this.state = 'lifting';
    let k = 0, t = 0;
    g.audio?.play('water-pour', o.position);
    await new Promise((res) => {
      this.step = (dt) => {
        t += dt;
        const pull = inp.doing || t < 0.25;
        k = Math.max(0, Math.min(1, k + (pull ? dt / (1.1 + 0.5 * Math.min(1, this.n / this.parts.max.trap)) : -dt / 0.6))); // a full trap is slower to come
        o.position.y = y0 + ease(k) * 0.55;
        o.rotation.z = Math.sin(k * 9) * 0.03 * (1 - k);
        if (k >= 1 || (k <= 0 && !pull)) res();
      };
    });
    this.step = null;
    if (k < 1) { o.position.y = y0; this.state = 'set'; return; }
    this.state = 'shore';
    this.hands.hold(this.trap);
    this.hands.weigh(0.3 + 0.6 * Math.min(1, this.n / this.parts.max.trap));
    g.promptKey = null;
  }

  // tipped tail-down over the carrier for as long as it is held there: the catch slides out fish by fish
  pourAct = {
    id: 'pour-tuu', label: TXT.pour,
    run: async (game, it) => {
      if (!this.held || this.busy) return;
      this.busy = true;
      const inp = game.input, from = { p: new THREE.Vector3(...CARRY.p), q: CARRY.q.clone() };
      const P = this.pose = { p: from.p.clone(), q: from.q.clone() };
      let k = 0, t = 0, out = 0, flow = 0, sounded = false;
      await new Promise((res) => {
        this.step = (dt) => {
          t += dt;
          const tip = inp.doing || t < 0.3;
          k = Math.max(0, Math.min(1, k + (tip ? dt / 0.55 : -dt / 0.45)));
          P.p.lerpVectors(from.p, TIP.p, ease(k)); P.q.slerpQuaternions(from.q, TIP.q, ease(k));
          if (k > 0.85 && this.n > 0) {
            if (!sounded) { sounded = true; game.audio?.play('water-pour-2', it.target.getWorldPosition(_v)); }
            flow += dt * 7;
            while (flow >= 1 && this.n > 0) { flow--; this.n--; out++; this.total++; }
            this.parts.inTrap.userData.show(Math.min(this.n, this.parts.max.trap));
            this.parts.inBasket.userData.show(Math.min(this.parts.max.basket, this.total));
          }
          if (k <= 0 && !tip) res();
        };
      });
      this.step = null; this.pose = null; this.busy = false; this.shown = this.n;
      if (out) { const all = this.work.count('mundu', out); if (all === out) this.work.say(TXT.proverb, TXT.proverbBy); }
      game.promptKey = null;
    },
  };
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
