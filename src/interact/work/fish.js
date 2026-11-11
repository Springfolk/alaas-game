// Туу: the wicker fish trap in the lake's shallows. Carry the trap out to the weir (быһыт), set it in the gap,
// leave it: мунду (lake minnow) find their way in over a few minutes. Lift it out (hold E), carry it to the
// carrier (тымтай) on the shore, open the tail clamp and tip the catch in. Then it can be set again.
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
  needTrap: L('туу наада', 'you need the trap', 'нужна верша'),
  isSet: L('Туу угулунна. Мунду киириэр диэри атын үлэҕин гын.', 'The trap is set. Do your other work while the мунду come.', 'Верша поставлена. Займитесь другим делом, пока заходит мунду.'),
  empty: L('Туу кураанах. Мунду киирэ илик — кэтэс.', 'The trap is empty. The мунду have not come yet: give it time.', 'Верша пуста. Мунду ещё не зашла — подождите.'),
  few: L('Аҕыйах мунду. Өр турбута буоллар элбэх буолуо этэ.', 'A few мунду. Left longer, it would hold more.', 'Немного мунду. Постояла бы дольше — было бы больше.'),
  catch: L('мунду тымтайга', 'мунду in the carrier', 'мунду в коробе'),
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
    if (it.gap) return this.held && !this.busy ? this.setAct : this.state === 'set' ? null : h ? null : this.needAct;
    if (it.tymtay) return this.held && !this.busy ? this.pourAct : undefined;
    return undefined;
  }
  idleAct() { return this.busy && this.held ? this.noAct : null; }
  noAct = { id: 'none', label: L('', '', ''), thenCard: false, run: async () => {} };
  needAct = { id: 'need-tuu', label: TXT.needTrap, thenCard: false, run: async () => {} };

  setAct = {
    id: 'set-tuu', label: TXT.set, thenCard: false,
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
      this.work.hint('tuu-set', TXT.isSet, 2);
      game.promptKey = null;
    },
  };

  liftAct = { id: 'lift-tuu', label: TXT.lift, thenCard: false, run: () => this.lift() };
  // hold E: the trap comes up heavy with water; let go early and it settles back
  async lift() {
    if (this.state !== 'set' || this.hands.held) return;
    const g = this.game, inp = g.input, o = this.trap.obj, y0 = o.position.y;
    this.state = 'lifting';
    const hold = inp.doing;
    let k = 0;
    g.audio?.play('water-pour', o.position);
    await new Promise((res) => {
      this.step = (dt) => {
        const pull = hold ? inp.doing : true; // a tap (touch): it comes up by itself
        k = Math.max(0, Math.min(1, k + (pull ? dt / 1.5 : -dt / 0.6)));
        o.position.y = y0 + ease(k) * 0.55;
        o.rotation.z = Math.sin(k * 9) * 0.03 * (1 - k);
        this.work.meter(k, 0.97, 1);
        if (k >= 1 || (k <= 0 && !pull)) res();
      };
    });
    this.step = null;
    this.work.meter(null);
    if (k < 1) { o.position.y = y0; this.state = 'set'; return; }
    this.parts.inTrap.userData.show(Math.min(this.n, this.parts.max.trap));
    this.state = 'shore';
    this.hands.hold(this.trap);
    if (this.n === 0) this.work.hint('tuu-empty', TXT.empty, 4);
    g.promptKey = null;
  }

  pourAct = {
    id: 'pour-tuu', label: TXT.pour, thenCard: false,
    run: async (game, it) => {
      if (!this.held || this.busy) return;
      this.busy = true;
      const n = this.n, from = { p: new THREE.Vector3(...CARRY.p), q: CARRY.q.clone() };
      const P = this.pose = { p: from.p.clone(), q: from.q.clone() };
      await this.tween(0.6, (k) => { P.p.lerpVectors(from.p, TIP.p, ease(k)); P.q.slerpQuaternions(from.q, TIP.q, ease(k)); });
      if (n) game.audio?.play('water-pour-2', it.target.getWorldPosition(_v));
      const had = this.total;
      await this.tween(0.25 + Math.min(1.4, n * 0.06), (k) => {
        const out = Math.round(n * k);
        this.parts.inTrap.userData.show(Math.max(0, Math.min(n, this.parts.max.trap) - out));
        this.parts.inBasket.userData.show(Math.min(this.parts.max.basket, had + out));
      });
      this.total = had + n; this.n = 0;
      await this.tween(0.5, (k) => { P.p.lerpVectors(TIP.p, from.p, ease(k)); P.q.slerpQuaternions(TIP.q, from.q, ease(k)); });
      this.pose = null; this.busy = false;
      if (n) {
        const all = this.work.count('mundu', n);
        game.ui.toast(`<small>${game.ui.t(TXT.catch)}</small><b>${n}</b>`, 3600);
        if (all === n) this.work.say(TXT.proverb, TXT.proverbBy);
        else if (n < 6) this.work.hint('tuu-few', TXT.few, 2);
      } else this.work.hint('tuu-empty', TXT.empty, 4);
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
    }
    const off = !(this.held || this.state === 'shore' && !this.hands.held);
    if (this.gapIt.off !== off) { this.gapIt.off = off; this.game.promptKey = null; }
  }
}
