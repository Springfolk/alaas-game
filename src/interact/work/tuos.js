// Туос үлэтэ: a тордуйа, the birch-bark vessel made without sewing. Take the sheet from the craft spot's hide,
// warm it at a hearth fire until it bends without cracking (hold E: the gauge; too long and it scorches and
// stiffens again), lay it back on the hide, fold up its four walls and pin the corners with pegs. The finished
// vessel is carried, and wild strawberries picked while it is in the hands go into it.
// Props: src/models/barkwork.js. Softening by warming at the fire is attested; boiling is not (docs/content.md).
import * as THREE from 'three/webgpu';
import { ease } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  sheet: L('туос', 'birch bark', 'береста'),
  vessel: L('тордуйа', 'тордуйа', 'тордуйа'),
  take: L('ыл', 'take it', 'взять'),
  warm: L('туоһу уокка сылыт (E-ни тутан тур)', 'warm the bark at the fire (hold E)', 'согреть бересту у огня (удерживайте E)'),
  warmTap: L('туоһу уокка сылыт', 'warm the bark at the fire', 'согреть бересту у огня'),
  lay: L('тириигэ тэлгээ', 'lay it on the hide', 'расстелить на шкуре'),
  fold: L('кытыытын бүк', 'fold a side up', 'загнуть стенку'),
  pin: L('муннугун тоһоҕоһунан хатаа', 'fold the end and pin its corners', 'загнуть торец и сколоть углы'),
  stiff: L('Туос кытаанах: бүктэххэ хайдыа. Уокка сылыт.', 'The bark is stiff: folded now, it would crack. Warm it at a fire.', 'Береста жёсткая: согнёшь — треснет. Согрейте её у огня.'),
  soft: L('Туос сымнаата. Сойуон иннинэ бүк.', 'The bark has softened. Fold it before it cools.', 'Береста размягчилась. Сгибайте, пока не остыла.'),
  scorched: L('Наһаа итийдэ: туос хатан кытаатта. Саҥаттан сылыт.', 'Too hot: the bark has dried hard. Warm it again, more gently.', 'Перегрели: береста пересохла и затвердела. Согрейте снова, осторожнее.'),
  cold: L('Туос сойон кытаатта. Хат сылыт.', 'The bark has cooled and stiffened. Warm it again.', 'Береста остыла и затвердела. Согрейте ещё раз.'),
  done: L('Тордуйа бэлэм.', 'The тордуйа is made.', 'Тордуйа готова.'),
  doneBy: L('тигиитэ суох, түөрт муннуга тоһоҕостоох туос иһит', 'a bark vessel without a stitch, pegged at its four corners', 'берестяной сосуд без единого шва, сколотый по четырём углам'),
  berries: L('дьэдьэн тордуйаҕа', 'дьэдьэн in the тордуйа', 'дьэдьэн в тордуйе'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CARRY = { p: [0.2, -0.36, -0.5], q: basisQ(V(0, 0.92, 0.38), V(1, 0, 0)) }; // held level, a little tipped to the eye
const TOFIRE = { p: V(0.05, -0.3, -0.62), q: basisQ(V(0, 0.55, 0.83), V(1, 0, 0)) }; // its inner side turned to the heat
const SOFT = [0.55, 0.88], KEEP = 150; // the gauge's good band; s the warmth lasts

export class Tuos {
  constructor(work, parts, find) {
    this.work = work;
    const hands = this.hands = work.hands;
    this.game = work.game;
    this.parts = parts;
    hands.addKind('tuos', CARRY, { r: 0.2, lift: 0.045, sound: 'wood-lay-2', q: (yaw) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)) });
    this.thing = hands.addThing({ kind: 'tuos', obj: parts.vessel, it: find(parts.vessel), name: TXT.sheet });
    this.thing.it.thing = this.thing;
    this.rest = { p: parts.vessel.position.clone(), q: parts.vessel.quaternion.clone() };
    this.fold = [0, 0, 0, 0];
    this.step = 0;      // folds done (4: a vessel)
    this.warm = 0;      // s of softness left
    this.onHide = true; // lying on the work hide (it can be folded there)
    this.n = 0;         // berries in it
    this.pose = null;
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
      if (this.warm <= 0) return this.hands.takeAct; // to the fire with it
      return this.step < 2 ? this.foldAct : this.pinAct;
    }
    if (this.held && !this.made && it.fireplace && !this.busy) return this.game.input.touchMode ? this.warmTapAct : this.warmAct;
    if (this.held && !this.made && it.entry === 'birch-bark' && !this.busy && this.game.player.pos.distanceTo(this.rest.p) < 4) return this.layAct; // the craft spot
    return undefined;
  }
  idleAct() { return this.busy && this.held ? this.noAct : null; }
  noAct = { id: 'none', label: L('', '', ''), thenCard: false, run: async () => {} };

  warmAct = { id: 'warm-bark', label: TXT.warm, thenCard: false, run: () => this.warmIt() };
  warmTapAct = { id: 'warm-bark', label: TXT.warmTap, thenCard: false, run: () => this.warmIt() };
  // hold E: the sheet is turned to the fire and takes heat; let go inside the band
  async warmIt() {
    if (!this.held || this.busy) return;
    const g = this.game, inp = g.input;
    this.busy = true;
    const from = { p: V(...CARRY.p), q: CARRY.q.clone() }, P = this.pose = { p: from.p.clone(), q: from.q.clone() };
    const hold = inp.down('KeyE');
    let k = 0, t = 0, first = true;
    await new Promise((res) => {
      this.tick = (dt) => {
        t += dt; k = Math.min(1, k + dt / 3.2);
        const e = ease(Math.min(1, t / 0.4));
        P.p.lerpVectors(from.p, TOFIRE.p, e); P.q.slerpQuaternions(from.q, TOFIRE.q, e);
        this.work.meter(k, SOFT[0], SOFT[1]);
        const go = hold ? !inp.down('KeyE') && t > 0.2 : !first && inp.hit('KeyE');
        first = false;
        if (go || k >= 1) res();
      };
    });
    this.tick = null; this.work.meter(null);
    this.pose = null; this.busy = false;
    if (k < SOFT[0]) this.work.hint('tuos-stiff', TXT.stiff, 3);
    else if (k > SOFT[1]) { this.warm = 0; this.work.hint('tuos-scorched', TXT.scorched, 3); } else { this.warm = KEEP; this.work.say(TXT.soft); }
    g.promptKey = null;
  }

  layAct = {
    id: 'lay-bark', label: TXT.lay, thenCard: false,
    run: async (game) => {
      if (!this.held) return;
      const t = this.hands.letGo();
      await this.hands.fly(t, this.rest.p, this.rest.q, 0.5);
      game.audio?.play('wood-lay-2', this.rest.p);
      t.it.off = false; t.obj.userData.sphere = undefined;
      this.onHide = true;
      if (this.warm <= 0) this.work.hint('tuos-stiff', TXT.stiff, 3);
      game.promptKey = null;
    },
  };
  foldAct = { id: 'fold-bark', label: TXT.fold, thenCard: false, run: () => this.foldNext() };
  pinAct = { id: 'pin-bark', label: TXT.pin, thenCard: false, run: () => this.foldNext() };
  async foldNext() {
    if (this.busy || this.made || this.warm <= 0) return;
    const g = this.game, i = this.step;
    this.busy = true;
    g.audio?.play('ribbon', this.thing.obj.position);
    await new Promise((res) => { let k = 0; this.tick = (dt) => { k = Math.min(1, k + dt / 0.6); this.fold[i] = ease(k); this.parts.setFold(this.fold); if (k >= 1) res(); }; });
    this.tick = null;
    if (i >= 2) g.audio?.play('wood-take', this.thing.obj.position); // the pegs go in
    this.step++;
    this.busy = false;
    if (this.made) {
      this.thing.name = TXT.vessel; this.thing.it.label = { sah: 'тордуйа', en: 'тордуйа (a pegged bark vessel)', ru: 'тордуйа (берестяной сосуд на колышках)' };
      this.work.count('torduya');
      this.work.say(TXT.done, TXT.doneBy);
    }
    g.promptKey = null;
  }

  // called by the berry picking (src/interact/index.js): a handful into the vessel, if it is in the hands
  picked(handful) {
    if (!this.held || !this.made) return false;
    this.n = Math.min(this.parts.max, this.n + handful);
    this.parts.berries.userData.show(this.n);
    const all = this.work.count('berries', handful);
    this.game.ui.toast(`<small>${this.game.ui.t(TXT.berries)}</small><b>${all}</b>`, 2600);
    return true;
  }

  update(dt) {
    this.tick?.(dt);
    if (this.warm > 0 && !this.made) {
      this.warm -= dt;
      if (this.warm <= 0) { this.work.hint('tuos-cold', TXT.cold, 3); this.game.promptKey = null; }
    }
  }
}
