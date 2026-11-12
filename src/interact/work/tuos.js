// Туос үлэтэ: a тордуйа, the birch-bark vessel folded from one sheet and pegged at its corners. Take the sheet
// from the craft spot's hide and pass it over a hearth fire: each tap is one pass, and its long edges lift a little
// more each time; after three it is soft (the edges stand up, it steams) and stays so for KEEP s. Then each tap
// folds the next wall, in the hands or laid on the hide: the two long sides, then each end with its corner flaps
// and its peg. Seven taps: a vessel, carried, and wild strawberries picked while it is in the hands go into it.
// Stiff bark does not fold: a tap on it at the hide takes it up. Nothing is told in words: the bark's bend says it.
// Props: src/models/barkwork.js. Softening by warming at the fire is attested; boiling is not (docs/content.md).
import * as THREE from 'three/webgpu';
import { ease } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  sheet: L('туос', 'birch bark', 'береста'),
  vessel: L('тордуйа', 'тордуйа', 'тордуйа'),
  take: L('ыл', 'take it', 'взять'),
  warm: L('туоһу уокка сылыт', 'warm the bark at the fire', 'согреть бересту у огня'),
  lay: L('тириигэ тэлгээ', 'lay it on the hide', 'расстелить на шкуре'),
  fold: L('кытыытын бүк', 'fold a side up', 'загнуть стенку'),
  pin: L('муннугун тоһоҕоһунан хатаа', 'fold the end and pin its corners', 'загнуть торец и сколоть углы'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CARRY = { p: [0.2, -0.36, -0.5], q: basisQ(V(0, 0.92, 0.38), V(1, 0, 0)) }; // held level, a little tipped to the eye
const TOFIRE = { p: V(0.05, -0.3, -0.62), q: basisQ(V(0, 0.55, 0.83), V(1, 0, 0)) }; // its inner side turned to the heat
const PASSES = 3, KEEP = 300; // passes over the fire that make it soft; s the softness lasts

export class Tuos {
  constructor(work, parts, find) {
    this.work = work;
    const hands = this.hands = work.hands;
    this.game = work.game;
    this.parts = parts;
    hands.addKind('tuos', CARRY, { r: 0.2, lift: 0.045, sound: 'wood-lay-2', q: (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)) });
    this.thing = hands.addThing({ kind: 'tuos', obj: parts.vessel, it: find(parts.vessel), name: TXT.sheet });
    this.thing.it.thing = this.thing;
    this.thing.put = () => (!this.made && !this.busy && this.game.player.pos.distanceTo(this.rest.p) < 2.6 ? this.layAct : undefined); // by the hide: laid on it
    this.rest = { p: parts.vessel.position.clone(), q: parts.vessel.quaternion.clone() };
    this.fold = [0, 0, 0, 0];
    this.step = 0;      // folds done (4: a vessel)
    this.warm = 0;      // s of softness left
    this.heat = 0;      // passes over the fire (of PASSES), slowly lost away from it
    this.onHide = true; // lying on the work hide (it can be folded there)
    this.n = 0;         // berries in it
    this.pose = null; this.folding = -1;
    const own = hands.pose;
    hands.pose = (dt, cam) => (hands.held === this.thing ? this.pose : own?.(dt, cam));
    this.thing.onDown = () => { this.onHide = this.thing.obj.position.distanceTo(this.rest.p) < 0.9; };
  }
  get held() { return this.hands.held === this.thing; }
  get made() { return this.step >= 4; }

  actFor(it) {
    const h = this.hands.held;
    if (it.bark) {
      if (h || this.busy) return null;
      if (this.made || !this.onHide) return this.hands.takeAct;
      return this.warm > 0 ? this.foldOf() : this.hands.takeAct; // stiff: taken up (to the fire)
    }
    if (this.held && !this.made && this.warm <= 0 && it.fireplace && !this.busy) return this.warmAct;
    if (this.held && !this.made && it.entry === 'birch-bark' && !this.busy && this.game.player.pos.distanceTo(this.rest.p) < 4) return this.layAct; // the craft spot
    return undefined;
  }
  // in the hands: soft, the next fold anywhere; stiff, a pass over any hearth fire within a few steps
  idleAct() {
    if (!this.held || this.made) return null;
    if (this.busy) return this.noAct;
    if (this.warm > 0) return this.foldOf();
    return this.nearFire() ? this.warmAct : null;
  }
  foldOf() { return this.step < 2 ? this.foldAct : this.pinAct; }
  nearFire() {
    const pl = this.game.player.pos;
    for (const i of this.game.world.interactables) {
      if (!i.fireplace) continue;
      const f = i.fireplace.pos();
      if (Math.hypot(f.x - pl.x, f.z - pl.z) < 3.2) return i;
    }
    return null;
  }
  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };

  warmAct = { id: 'warm-bark', label: TXT.warm, run: () => this.warmIt() };
  // one pass over the fire: out to the heat, turned, back; the long edges lift a step
  async warmIt() {
    if (!this.held || this.busy || this.warm > 0) return;
    const g = this.game;
    this.busy = true;
    const from = { p: V(...CARRY.p), q: CARRY.q.clone() }, P = this.pose = { p: from.p.clone(), q: from.q.clone() };
    const h0 = Math.floor(this.heat + 1e-3);
    await this.tween(0.85, (k) => {
      const e = Math.sin(k * Math.PI); // out and back
      P.p.lerpVectors(from.p, TOFIRE.p, e); P.q.slerpQuaternions(from.q, TOFIRE.q, e);
      P.p.x += Math.sin(k * Math.PI * 2) * 0.06 * e; // passed through the heat
      this.heat = h0 + k;
    });
    this.pose = null; this.busy = false;
    this.heat = h0 + 1;
    g.audio?.play('fire-feed', this.thing.obj.position) || g.audio?.play('ribbon', this.thing.obj.position);
    if (this.heat >= PASSES) { this.heat = 0; this.warm = KEEP; g.audio?.play('ribbon', this.thing.obj.position); } // soft
    g.promptKey = null;
  }
  tween(dur, step) { return new Promise((res) => { let k = 0; this.tick = (dt) => { k = Math.min(1, k + dt / dur); step(k); if (k >= 1) { this.tick = null; res(); } }; }); }
  // How the unfolded long walls stand by themselves: a step up with each pass, standing while it stays soft, flat
  // when stiff.
  bend() {
    if (this.made || this.step >= 2) return;
    const d = this.warm > 0 ? 0.28 : 0.25 * this.heat / PASSES;
    let changed = false;
    for (let i = this.step; i < 2; i++) if (i !== this.folding && Math.abs(this.fold[i] - d) > 1e-3) { this.fold[i] = d; changed = true; }
    if (changed) this.parts.setFold(this.fold);
  }

  layAct = {
    id: 'lay-bark', label: TXT.lay,
    run: async (game) => {
      if (!this.held) return;
      const t = this.hands.letGo();
      await this.hands.fly(t, this.rest.p, this.rest.q, 0.5);
      game.audio?.play('wood-lay-2', this.rest.p);
      t.it.off = false; t.obj.userData.sphere = undefined;
      this.onHide = true;
      game.promptKey = null;
    },
  };
  foldAct = { id: 'fold-bark', label: TXT.fold, run: () => this.foldNext() };
  pinAct = { id: 'pin-bark', label: TXT.pin, run: () => this.foldNext() };
  // a tap: the next wall comes up and stays (the ends take their pegs)
  async foldNext() {
    if (this.busy || this.made || this.warm <= 0) return;
    const g = this.game, i = this.step;
    this.busy = true; this.folding = i;
    const f0 = this.fold[i];
    g.audio?.play('ribbon', this.thing.obj.position);
    await this.tween(0.5, (k) => { this.fold[i] = f0 + (1 - f0) * ease(k); this.parts.setFold(this.fold); });
    this.folding = -1; this.busy = false;
    if (i >= 2) g.audio?.play('wood-take', this.thing.obj.position); // the peg goes in
    this.step++;
    if (this.made) {
      this.thing.name = TXT.vessel; this.thing.it.label = { sah: 'тордуйа', en: 'pegged bark vessel', ru: 'берестяной сосуд на колышках' };
      this.work.count('torduya');
    }
    g.promptKey = null;
  }

  // called by the berry picking (src/interact/index.js): each berry into the vessel, if it is in the hands;
  // `gathered` once the hands leave the patch
  picked(n) {
    if (!this.held || !this.made) return false;
    this.n = Math.min(this.parts.max, this.n + n);
    this.parts.berries.userData.show(this.n);
    return true;
  }
  gathered(n) { if (n && this.held && this.made) this.work.count('berries', n); }

  update(dt) {
    this.tick?.(dt);
    if (!this.tick && this.heat > 0 && !this.nearFire()) this.heat = Math.max(0, this.heat - dt / 40); // away from the fire it slowly gives the heat up
    if (this.warm > 0 && !this.made && (this.warm -= dt) <= 0) this.game.promptKey = null;
    this.bend();
  }
}
