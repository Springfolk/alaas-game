// Туос үлэтэ: a тордуйа, the birch-bark vessel folded from one sheet and pegged at its corners. Take the sheet
// from the craft spot's hide and carry it to a hearth; there one tap and it is made by the fire as the player
// watches (a framed view, src/interact/framed.js): three passes through the heat, the long edges lifting a little
// more each time until the bark is soft, then the two long walls folded up, then each end with its corner flaps
// and its peg; the vessel close up, then carried, and wild strawberries picked while it is in the hands go into it.
// The sheet is posed from a worker's eye by the fire (`hands.eye`). Leaving stops it at the next step.
// Props: src/models/barkwork.js. Softening by warming at the fire is attested; boiling is not (docs/content.md).
import * as THREE from 'three/webgpu';
import { ease } from '../../util.js';
import { fireLit } from '../../engine/master.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  sheet: L('туос', 'birch bark', 'береста'),
  vessel: L('тордуйа', 'torduya', 'тордуйа'),
  make: L('тордуйа оҥор', 'make a torduya by the fire', 'сделать тордуйу у огня'),
  lay: L('тириигэ тэлгээ', 'lay it on the hide', 'расстелить на шкуре'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CARRY = { p: [0.2, -0.36, -0.5], q: basisQ(V(0, 0.92, 0.38), V(1, 0, 0)) }; // held level, a little tipped to the eye
const WORK = { p: V(0, -0.3, -0.66), q: basisQ(V(0, 0.68, 0.73), V(1, 0, 0)) }; // being made: out before the eye, its inside turned up to it
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
    this.onHide = true; // lying on the work hide
    this.n = 0;         // berries in it
    this.pose = null; this.folding = -1;
    const own = hands.pose;
    hands.pose = (dt, cam) => (hands.held === this.thing ? this.pose || (this.made ? null : WORK) : own?.(dt, cam));
    const fires = []; this.game.engine.scene.traverse((o) => { if (o.isLight && o.userData.fire) fires.push(o); });
    parts.vessel.traverse((o) => { if (o.material) fireLit(o.material, parts.vessel, fires, 20); }); // carried indoors: lit by the hearth, as the house is, its face to the eye by the room's glow
    this.thing.onDown = () => { this.onHide = this.thing.obj.position.distanceTo(this.rest.p) < 0.9; };
  }
  get held() { return this.hands.held === this.thing; }
  get made() { return this.step >= 4; }

  actFor(it) {
    const h = this.hands.held;
    if (it.bark) return h || this.busy ? null : this.hands.takeAct;
    if (this.held && !this.made && it.fireplace) return this.busy ? this.noAct : this.makeAct; // (the sheet in the hands: never the fire's own feeding)
    if (this.held && !this.made && it.entry === 'birch-bark' && !this.busy && this.game.player.pos.distanceTo(this.rest.p) < 4) return this.layAct; // the craft spot
    if (it.entry === 'birch-bark' && !h && this.onHide && it !== this.thing.it) return (this.takeSheet ||= { ...this.hands.takeAct, run: (game) => this.hands.takeAct.run(game, this.thing.it) }); // the craft spot: the sheet on it
    return undefined;
  }
  // in the hands, by any hearth fire within a few steps: made there
  idleAct() {
    if (!this.held || this.made) return null;
    if (this.busy) return this.noAct;
    return this.nearFire() ? this.makeAct : null;
  }
  nearFire() {
    const pl = this.game.player.pos, H = this.game.hints, room = H?.room(pl);
    for (const i of this.game.world.interactables) {
      if (!i.fireplace) continue;
      const f = i.fireplace.pos();
      if (Math.hypot(f.x - pl.x, f.z - pl.z) < 3.2 && (!H || H.room(f) === room)) return i; // (not through a wall)
    }
    return null;
  }
  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };

  makeAct = { id: 'make-bark', label: TXT.make, run: (g, it) => this.make(it?.fireplace ? it : null) }; // (the hearth aimed at, from wherever it is in reach)
  // Watched by the fire: held over the hearth's rim, its face to the viewer (world poses: `hands.pose`, with a
  // worker's eye there so it stays in the picture); the view frames it and the fire.
  async make(at = null) {
    const fire = at || this.nearFire();
    if (!fire || !this.held || this.busy || this.made) return;
    const g = this.game, F = g.framed, h = this.hands, fp = fire.fireplace.pos(), pl = g.player.pos;
    const away = Math.atan2(pl.x - fp.x, pl.z - fp.z), a = V(Math.sin(away), 0, Math.cos(away)), side = V(a.z, 0, -a.x); // from the fire towards the player; across
    const pose = (d, y, tilt) => ({ p: fp.clone().addScaledVector(a, d).add(V(0, y, 0)), q: basisQ(V(0, 1, 0).multiplyScalar(1 - tilt).addScaledVector(a, tilt), side), world: true });
    this.at = { work: pose(0.62, 0.32, 0.55), heat: pose(0.38, 0.42, 0.75) };
    this.busy = true;
    h.eye = { position: fp.clone().addScaledVector(a, 1).setY(fp.y + 0.7), quaternion: new THREE.Quaternion(), aspect: 1.6 }; // (keeps it in the picture)
    this.thing.blend = 0; this.thing.from = { p: this.thing.obj.position.clone(), q: this.thing.obj.quaternion.clone() }; // from the body's hands to the fire
    this.pose = { p: this.at.work.p.clone(), q: this.at.work.q.clone(), world: true };
    const work = this.at.work.p;
    if (await F.open({ c: work.clone().lerp(fp, 0.4).add(V(0, 0.08, 0)), r: 0.55, yaw: away + 0.6, el: 0.45, fov: 40 })) {
      await this.wait(0.5);
      while (F.on && this.warm <= 0) await this.warmIt(); // three passes: soft
      if (F.on) await this.wait(0.5); // the edges stand, it is soft
      F.aim({ c: work.clone().add(V(0, 0.03, 0)), r: 0.32, el: 0.7 });
      while (F.on && !this.made) { await this.foldNext(); await this.wait(0.25); }
      if (this.made) { F.aim({ c: this.centre(), r: 0.17 }); await this.wait(2.2); } // the vessel, close up
      const P = g.player; if (F.on) P.yaw = P.aimYaw = Math.atan2(P.pos.x - fp.x, P.pos.z - fp.z), P.pitch = P.aimPitch = -0.4; // back in the body: facing the fire, the vessel in the hands
      await F.close();
    }
    h.eye = null; this.pose = null; this.at = null;
    if (this.held) h.grab(this.thing); // back into the body's hands (eased)
    this.busy = false;
    g.promptKey = null;
  }
  wait(s) { return this.tween(s, () => {}); }
  // the middle of the vessel as drawn (its visible meshes only: the berries wait hidden inside)
  centre() {
    const b = new THREE.Box3(), m = new THREE.Box3();
    this.thing.obj.updateWorldMatrix(true, true);
    this.thing.obj.traverseVisible((o) => { if (o.isMesh) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(m.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld)); } });
    return b.getCenter(V(0, 0, 0));
  }
  // one pass through the heat: out over the fire's edge, along it, back; the long edges lift a step
  async warmIt() {
    const g = this.game, A = this.at, P = this.pose;
    const h0 = Math.floor(this.heat + 1e-3), side = V(0, 0, 0);
    side.set(1, 0, 0).applyQuaternion(A.heat.q);
    await this.tween(1.3, (k) => {
      const e = Math.sin(k * Math.PI); // out and back
      P.p.lerpVectors(A.work.p, A.heat.p, e).addScaledVector(side, Math.sin(k * Math.PI * 2) * 0.1 * e); // along the heat
      P.q.slerpQuaternions(A.work.q, A.heat.q, e);
      this.heat = h0 + k;
    });
    this.heat = h0 + 1;
    g.audio?.play('fire-feed', this.thing.obj.position) || g.audio?.play('ribbon', this.thing.obj.position);
    if (this.heat >= PASSES) { this.heat = 0; this.warm = KEEP; g.audio?.play('ribbon', this.thing.obj.position); } // soft
  }
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
  // the next wall comes up and stays (the ends take their pegs)
  async foldNext() {
    if (this.made || this.warm <= 0) return;
    const g = this.game, i = this.step;
    this.folding = i;
    const f0 = this.fold[i];
    g.audio?.play('ribbon', this.thing.obj.position);
    await this.tween(0.7, (k) => { this.fold[i] = f0 + (1 - f0) * ease(k); this.parts.setFold(this.fold); });
    this.folding = -1;
    if (i >= 2) g.audio?.play('wood-take', this.thing.obj.position); // the peg goes in
    this.step++;
    if (this.made) {
      this.thing.name = TXT.vessel; this.thing.it.label = { sah: 'тордуйа', en: 'pegged bark vessel', ru: 'берестяной сосуд на колышках' };
      this.work.count('torduya');
    }
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
