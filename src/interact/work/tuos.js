// Туос үлэтэ: a тордуйа, the birch-bark vessel made without sewing. Take the sheet from the craft spot's hide and
// hold it to a hearth fire (the do input held): as it takes the heat its long edges begin to lift, which is the
// sign that it will bend without cracking; held on too long it curls up tight, dries hard and must be warmed
// again. Lay it back on the hide while it is soft and fold up its four walls: a wall rises for as long as it is
// held and stays once it is nearly up (let go sooner, it springs back; stiff bark gives a finger's width and no
// more). The ends are pinned with pegs as they come up. The finished vessel is carried, and wild strawberries
// picked while it is in the hands go into it. Nothing is told in words: the bark's own bend says it.
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
const SOFT = [0.4, 0.92], KEEP = 150; // the heat (0…1 over 3.2 s at the fire) between which it comes away soft; s the softness lasts

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
    this.heat = 0;      // what it has taken from the fire, falling again away from it
    this.curl = 0;      // scorched: curled up tight for a moment
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
      return this.warm > 0 ? (this.step < 2 ? this.foldAct : this.pinAct) : this.tryAct; // stiff: a tap takes it (to the fire), a hold tries a fold
    }
    if (this.held && !this.made && it.fireplace && !this.busy) return this.warmAct;
    if (this.held && !this.made && it.entry === 'birch-bark' && !this.busy && this.game.player.pos.distanceTo(this.rest.p) < 4) return this.layAct; // the craft spot
    return undefined;
  }
  idleAct() { return this.busy && this.held ? this.noAct : null; }
  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };

  warmAct = { id: 'warm-bark', label: TXT.warm, run: () => this.warmIt() };
  // held to the fire for as long as the do input is down: it takes heat, and its edges show how much
  async warmIt() {
    if (!this.held || this.busy) return;
    const g = this.game, inp = g.input;
    this.busy = true;
    const from = { p: V(...CARRY.p), q: CARRY.q.clone() }, P = this.pose = { p: from.p.clone(), q: from.q.clone() };
    let t = 0, k = 0;
    await new Promise((res) => {
      this.tick = (dt) => {
        t += dt;
        const on = (inp.doing || t < 0.25) && this.heat < 1.2;
        k = Math.max(0, Math.min(1, k + (on ? dt / 0.4 : -dt / 0.3)));
        if (on && k > 0.6) this.heat += dt / 3.2;
        P.p.lerpVectors(from.p, TOFIRE.p, ease(k)); P.q.slerpQuaternions(from.q, TOFIRE.q, ease(k));
        if (!on && k <= 0) res();
      };
    });
    this.tick = null; this.pose = null; this.busy = false;
    if (this.heat > SOFT[1]) { this.heat = 0; this.warm = 0; this.curl = 1; g.audio?.play('wood-take', this.thing.obj.position); } // scorched: it curls, dries hard
    else if (this.heat >= SOFT[0]) this.warm = KEEP;
    g.promptKey = null;
  }
  // How the unfolded long walls stand by themselves: lifting as the sheet takes heat, a little up while it stays
  // soft, curled tight for a moment when scorched, flat when stiff.
  bend(dt) {
    if (this.made || this.step >= 2) return;
    this.curl = Math.max(0, this.curl - dt / 1.4);
    const h = this.heat, soft = this.warm > 0 ? 0.08 + 0.12 * this.warm / KEEP : 0;
    const hot = h < SOFT[0] ? 0.08 * h / SOFT[0] : h <= SOFT[1] ? 0.08 + 0.17 * (h - SOFT[0]) / (SOFT[1] - SOFT[0]) : 0.25 + (h - SOFT[1]) * 1.6;
    const d = Math.max(soft, hot, 0.5 * ease(this.curl));
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
  tryAct = { id: 'try-bark', label: TXT.take, run: (game, it) => this.foldNext(it) };
  // A wall comes up for as long as the do input is held on the sheet; nearly up, it stays (the ends take their
  // pegs). Let go sooner and it springs back. Stiff bark gives a little and no more; a tap on it takes it up instead.
  async foldNext(it) {
    if (this.busy || this.made) return;
    const g = this.game, inp = g.input, i = this.step, soft = this.warm > 0, lim = soft ? 1 : 0.16;
    this.busy = true; this.folding = i;
    const f0 = this.fold[i];
    let k = f0, t = 0, creaked = false;
    await new Promise((res) => {
      this.tick = (dt) => {
        t += dt;
        const push = inp.doing || (soft && (t < 0.15 || k >= 0.75)); // nearly up: it goes the rest of the way
        k = push ? Math.min(lim, k + dt / 0.55) : Math.max(f0, k - dt / 0.22);
        if (push && !creaked && t > 0.12) { creaked = true; g.audio?.play(soft ? 'ribbon' : 'wood-take', this.thing.obj.position); }
        this.fold[i] = k; this.parts.setFold(this.fold);
        if (k >= 1 || (!push && k <= f0)) res();
      };
    });
    this.tick = null; this.folding = -1; this.busy = false;
    if (!soft && t < 0.22 && it) { await g.run(this.hands.takeAct, it); return; } // a tap on stiff bark: taken up
    if (k < 1) { g.promptKey = null; return; }
    if (i >= 2) g.audio?.play('wood-take', this.thing.obj.position); // the pegs go in
    this.step++;
    if (this.made) {
      this.thing.name = TXT.vessel; this.thing.it.label = { sah: 'тордуйа', en: 'тордуйа (a pegged bark vessel)', ru: 'тордуйа (берестяной сосуд на колышках)' };
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
    if (!this.tick) this.heat = Math.max(0, this.heat - dt / 9); // away from the fire it gives the heat up again
    if (this.warm > 0 && !this.made && (this.warm -= dt) <= 0) this.game.promptKey = null;
    this.bend(dt);
  }
}
