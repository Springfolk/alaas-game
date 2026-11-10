// Carrying: one thing in the hands at a time (the water pail, a tool, or firewood: up to an armful of
// ARMFUL billets). Take it, set it down in front of you, fill the pail at the lake (or pour it back), lay a
// billet in a hearth, stack an armful back on the woodpile. Nothing here blocks the player: the things fly
// between hands and ground while you keep walking. Work (src/interact/work/) registers its tools with
// `addKind` / `addThing` and may drive the held thing's pose (`pose`).
import * as THREE from 'three/webgpu';
import { fwdX, fwdZ, clamp, ease } from '../util.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();

// where a thing sits in view while carried (camera space: x right, y up, −z ahead)
const HOLD = {
  pail: { p: [0.27, -0.72, -0.62], r: [0.08, 0.5, 0.05] },
  log: { p: [0.3, -0.46, -0.6], r: [0.1, 0, Math.PI / 2 - 0.15] },
};
// how a set-down thing lies: lift above the ground, clearance radius, its quaternion for the player's yaw
const LIE = {
  pail: { r: 0.17, lift: 0, q: () => _q.setFromEuler(_e.set(0, Math.random() * 6.28, 0)).clone(), sound: 'wood-lay-2' },
  log: { r: 0.2, lift: 0.045, pivot: -0.25, q: (yaw) => _q.setFromEuler(_e.set(Math.PI / 2, yaw + Math.PI / 2 + (Math.random() - 0.5) * 0.6, 0, 'YXZ')).clone(), sound: 'wood-lay' },
};
export const ARMFUL = 4; // billets carried at once
// the 2nd…4th billet of an armful, relative to the first (camera space, metres)
const ARM = [[0, 0, 0], [0.02, 0.085, 0.07], [-0.03, 0.09, -0.07], [0.0, 0.175, 0.0]];
const L = (sah, en, ru) => ({ sah, en, ru });
const ACT = {
  take: L('ыл', 'pick it up', 'взять'),
  takeLog: L('мас ыл', 'take a billet', 'взять полено'),
  down: L('уур', 'set it down', 'поставить'),
  downLog: L('сиргэ уур', 'put it down', 'положить'),
  stack: L('кыстаа', 'stack it on the pile', 'сложить в поленницу'),
  fill: L('уу ыл', 'scoop up water', 'зачерпнуть воды'),
  pourBack: L('ууну күөлгэ төттөрү кут', 'pour the water back', 'вылить воду обратно в озеро'),
  lay: L('уокка мас бырах', 'lay the billet on the fire', 'подложить полено в огонь'),
};

export class Hands {
  constructor(game, parts, find) {
    this.game = game;
    this.held = null; // { kind, obj, it }
    this.moves = []; // flights between pose A and pose B (hands ↔ ground ↔ fire)
    this.burning = []; // { obj, it, t, upright }
    const scene = game.engine.scene;
    // movable things live in world space
    const pail = parts.pail;
    scene.attach(pail);
    this.pail = { kind: 'pail', obj: pail, it: find(pail), full: false, water: pail.userData.water, name: L('мас ыаҕас', 'water pail', 'ведро') };
    this.logs = parts.logs.map((obj) => { scene.attach(obj); return { kind: 'log', obj, it: find(obj), state: 'pool', t: 0, name: L('оттук мас', 'firewood', 'дрова') }; });
    for (const l of this.logs) l.pool = true; // the woodpile's own billets
    this.pile = parts.pile;
    this.pileIt = find(parts.pile);
    this.dip = 0; // the pail's scoop / pour animation offset (0..1)
    this.more = []; // the rest of an armful of billets (held = the first)
    this.pose = null; // (dt, cam) => { p: Vector3, q: Quaternion } in camera space, or null: work animating the held tool
    this.stacked = 0;
  }

  // a new kind of thing to carry: its hold pose and how it lies when set down
  addKind(kind, hold, lie) { HOLD[kind] = hold; LIE[kind] = lie; }
  // a movable thing: { kind, obj, it, name } (a billet also joins `logs`)
  addThing(t) { this.game.engine.scene.attach(t.obj); if (t.kind === 'log') this.logs.push(t); return t; }

  get name() {
    if (!this.held) return null;
    const n = this.game.ui.t(this.held.name);
    return this.more.length ? `${n} × ${this.more.length + 1}` : n;
  }

  // The act E does on `it` while the hands are (or aren't) busy. undefined = leave it to `it.act`.
  actFor(it) {
    const h = this.held;
    if (it.take) {
      if (h?.kind === 'log' && it.take === 'woodpile') return this.stackAct;
      if (h?.kind === 'log' && it.take === 'log' && this.more.length + 1 < ARMFUL && !this.busy) return this.takeAct; // an armful
      if (h) return null; // hands full: just read it
      return it.take === 'woodpile' ? this.takeLogAct : this.takeAct;
    }
    if (h?.kind === 'log' && it.fireplace) return this.layAct;
    return undefined;
  }
  // E with nothing in focus
  idleAct() {
    const h = this.held;
    if (!h || this.busy) return null;
    const w = this.waterAhead();
    if (h.kind === 'pail' && w) return h.full ? this.pourAct : this.fillAct;
    if (w) return null; // nothing goes into the lake
    return h.kind === 'pail' ? this.downAct : this.downLogAct;
  }

  // a spot of open water within reach in front of the player, when looking down at it
  waterAhead() {
    const g = this.game, pl = g.player, terrain = g.world.terrain;
    if (pl.pitch > -0.12) return null;
    for (const d of [0.7, 1.2, 1.8]) {
      const x = pl.pos.x + fwdX(pl.yaw) * d, z = pl.pos.z + fwdZ(pl.yaw) * d;
      const gy = terrain.height(x, z), wy = terrain.water(x, z, gy);
      if (wy !== null && wy - gy > 0.05) return _v.set(x, wy, z).clone();
    }
    return null;
  }

  // ── acts (stable objects: main.js compares prompts by label) ──
  takeAct = {
    id: 'take', label: ACT.take, thenCard: false,
    run: async (game, it) => {
      const t = it.thing || (it.take === 'pail' ? this.pail : this.logs.find((l) => l.obj === it.target));
      if (!t || (this.held && !(this.held.kind === 'log' && t.kind === 'log' && this.more.length + 1 < ARMFUL))) return;
      this.takeAct.thenCard = !!it.entry && !game.state.found.has(it.entry); // the card once, the first time
      if (t.kind === 'log') t.state = 'held';
      if (this.held) { this.more.push(t); this.grab(t); } else this.hold(t);
      game.audio?.play('wood-take', t.obj.position); // the pail is wood too: a handle knock
    },
  };
  takeLogAct = {
    id: 'take-log', label: ACT.takeLog, thenCard: false,
    run: async (game) => {
      if (this.held) return;
      // a billet from the pool, or the one set down longest ago
      let t = this.logs.find((l) => l.pool && l.state === 'pool');
      if (!t) t = this.logs.filter((l) => l.pool && l.state === 'ground').sort((a, b) => a.t - b.t)[0];
      if (!t) return;
      t.state = 'held';
      const o = t.obj;
      o.position.copy(this.pile.getWorldPosition(_p)).add(_v.set(0, 0.45, 0));
      o.quaternion.setFromEuler(_e.set(Math.PI / 2, this.pile.rotation.y, 0));
      o.scale.setScalar(1);
      o.visible = true;
      this.hold(t);
      game.audio?.play('wood-take', o.position);
    },
  };
  downAct = { id: 'down', label: ACT.down, thenCard: false, run: () => this.setDown() };
  downLogAct = { id: 'down', label: ACT.downLog, thenCard: false, run: () => this.setDown() };
  // the whole armful back onto the woodpile, billet by billet
  stackAct = {
    id: 'stack', label: ACT.stack, thenCard: false,
    run: async (game) => {
      if (this.held?.kind !== 'log' || this.busy) return;
      this.busy = true;
      const all = [this.held, ...this.more];
      this.held = null; this.more = [];
      const at = this.pile.getWorldPosition(new THREE.Vector3()).add(_v.set(0, 0.5, 0));
      const q = new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, this.pile.rotation.y, 0));
      for (const t of all.reverse()) {
        await this.fly(t, at.clone().add(_v.set((Math.random() - 0.5) * 1.6, 0, 0).applyAxisAngle(_p.set(0, 1, 0), this.pile.rotation.y)), q, 0.32);
        game.audio?.play('wood-lay', at);
        this.free(t);
        this.stacked++;
        game.work?.count('stacked');
      }
      this.busy = false;
      game.promptKey = null;
    },
  };
  fillAct = {
    id: 'fill', label: ACT.fill, thenCard: false,
    run: async (game) => {
      const w = this.waterAhead();
      if (!w || !this.held) return;
      this.busy = true;
      const t = this.held;
      this.held = null;
      // down to the water and back up into the hands
      await this.fly(t, w.clone().add(_v.set(0, -0.14, 0)), new THREE.Quaternion().setFromEuler(_e.set(0.35, game.player.yaw, 0, 'YXZ')), 0.6);
      game.audio?.play('water-pour', w);
      this.pail.full = true; this.pail.water.visible = true;
      await this.anim(0.5, () => {});
      this.hold(t);
      this.busy = false;
    },
  };
  pourAct = {
    id: 'pour', label: ACT.pourBack, thenCard: false,
    run: async (game) => {
      const w = this.waterAhead();
      if (!w || !this.held) return;
      this.busy = true;
      await this.anim(0.5, (k) => { this.dip = -ease(k); });
      game.audio?.play('water-pour-2', w);
      this.pail.full = false; this.pail.water.visible = false;
      await this.anim(0.9, () => {});
      await this.anim(0.5, (k) => { this.dip = -1 + ease(k); });
      this.busy = false;
    },
  };
  layAct = {
    id: 'lay', label: ACT.lay, thenCard: false,
    run: async (game, it) => {
      const fp = it.fireplace;
      if (this.held?.kind !== 'log') return;
      const t = this.letGo();
      t.state = 'fire';
      const at = fp.pos();
      const yaw = Math.random() * Math.PI * 2;
      // upright in a balagan's open mouth; across the embers on an uraha's hearth
      const q = fp.upright ? new THREE.Quaternion().setFromEuler(_e.set(0.12, yaw, 0.05)) : new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, yaw, 0, 'YXZ'));
      const to = at.clone().add(fp.upright ? _v.set(0, -0.32, 0) : _v.set(0, 0.06, 0));
      if (!fp.upright) to.add(_v.set(0, -0.25, 0).applyQuaternion(q)); // centre the billet on the fire
      await this.fly(t, to, q, 0.7);
      game.audio?.play('wood-lay', at);
      fp.fuel();
      setTimeout(() => game.audio?.play('fire-feed', at), 350);
      this.burning.push({ log: t, t: 0, upright: fp.upright, base: to.clone() });
    },
  };

  hold(t) {
    this.held = t;
    this.grab(t);
  }
  grab(t) {
    t.it.off = true;
    t.obj.visible = true;
    t.blend = 0;
    t.from = { p: t.obj.position.clone(), q: t.obj.quaternion.clone() };
    this.game.promptKey = null;
  }
  // the thing to act with leaves the hands: the last billet of an armful, else the held thing
  letGo() {
    const t = this.more.pop() || this.held;
    if (t === this.held) this.held = null;
    this.game.promptKey = null;
    return t;
  }
  // a billet is used up (burnt, stacked): back to where it came from
  free(t) {
    t.obj.visible = false; t.obj.scale.setScalar(1);
    t.state = 'pool'; t.it.off = true;
    t.release?.();
  }

  async setDown() {
    const g = this.game, pl = g.player;
    if (!this.held) return;
    const t = this.letGo(), lie = LIE[t.kind];
    const d = 0.75;
    let x = pl.pos.x + fwdX(pl.yaw) * d, z = pl.pos.z + fwdZ(pl.yaw) * d;
    ({ x, z } = g.world.collide(x, z, lie.r, pl.pos.y));
    const y = g.world.groundAt(x, z);
    const q = lie.q(pl.yaw);
    const to = new THREE.Vector3(x, y + lie.lift, z);
    if (lie.pivot) to.add(_v.set(0, lie.pivot, 0).applyQuaternion(q).setY(0)); // pivot is the billet's end
    await this.fly(t, to, q, 0.45);
    g.audio?.play(lie.sound || 'wood-lay', to);
    if (t.kind === 'log') { t.state = 'ground'; t.t = performance.now(); }
    t.it.off = false;
    t.obj.userData.sphere = undefined; // main.js caches look-at bounds
    t.onDown?.();
  }

  // fly a thing from its current pose to (p, q) over dur s
  fly(t, p, q, dur) {
    return new Promise((res) => {
      this.moves = this.moves.filter((m) => m.t !== t);
      this.moves.push({ t, from: { p: t.obj.position.clone(), q: t.obj.quaternion.clone() }, p, q, k: 0, dur, res });
    });
  }
  anim(dur, step) {
    return new Promise((res) => this.moves.push({ dur, k: 0, step, res }));
  }

  update(dt) {
    const cam = this.game.engine.camera;
    for (const m of [...this.moves]) {
      m.k = Math.min(1, m.k + dt / m.dur);
      const e = ease(m.k);
      if (m.step) m.step(m.k);
      else {
        const o = m.t.obj;
        o.position.lerpVectors(m.from.p, m.p, e);
        if (m.k < 1) o.position.y += Math.sin(m.k * Math.PI) * 0.12; // a little arc
        o.quaternion.slerpQuaternions(m.from.q, m.q, e);
      }
      if (m.k >= 1) { this.moves.splice(this.moves.indexOf(m), 1); m.res(); }
    }
    const h = this.held;
    if (h) {
      const P = HOLD[h.kind], dip = this.dip;
      const posed = this.pose?.(dt, cam);
      for (let i = 0; i <= this.more.length; i++) {
        const t = i ? this.more[i - 1] : h;
        t.blend = Math.min(1, t.blend + dt / 0.4);
        const world = posed?.world && !i;
        if (posed && !i) { _p.copy(posed.p); _q.copy(posed.q); } else {
          _p.set(P.p[0] - Math.abs(dip) * 0.05 + ARM[i][0], P.p[1] + (h.full ? -0.02 : 0) + ARM[i][1], P.p[2] - Math.abs(dip) * 0.2 + ARM[i][2]);
          if (P.q) _q.copy(P.q); else _q.setFromEuler(_e.set(P.r[0] + dip * 1.5, P.r[1], P.r[2], 'YXZ')); // dip < 0: tipped forward to pour
        }
        if (!world) { _p.applyQuaternion(cam.quaternion).add(cam.position); _q.premultiply(cam.quaternion); }
        const e = ease(t.blend);
        t.obj.position.lerpVectors(t.from.p, _p, e);
        t.obj.quaternion.slerpQuaternions(t.from.q, _q, e);
        if (e < 1) t.obj.position.y += Math.sin(e * Math.PI) * 0.1;
      }
    }
    // billets burning down in a hearth
    for (const b of [...this.burning]) {
      b.t += dt / 60;
      const k = clamp(b.t, 0, 1), o = b.log.obj;
      if (b.upright) o.scale.set(1 - k * 0.3, Math.max(0.05, 1 - k), 1 - k * 0.3);
      else { o.scale.setScalar(Math.max(0.05, 1 - k * 0.8)); o.position.y = b.base.y - k * 0.04; }
      if (k >= 1) {
        this.free(b.log);
        this.burning.splice(this.burning.indexOf(b), 1);
      }
    }
  }
}
