// Carrying: one thing in the hands at a time (the water pail, a tool, or firewood: up to an armful of
// ARMFUL billets). Take it, put it down (back in its own place when that is near), dip the pail in the lake
// for as long as the hands hold it there and tip it out again, lay a billet in a hearth, take billets off the
// woodpile and stack them back one by one. Nothing here blocks the player: the things fly between hands and
// ground while you keep walking, and what is carried has weight: it trails the turning view and the pail hangs
// lower the fuller it is. Work (src/interact/work/) registers its tools with `addKind` / `addThing` and may
// drive the held thing's pose (`pose`).
import * as THREE from 'three/webgpu';
import { fwdX, fwdZ, clamp, ease, damp, angleDiff } from '../util.js';
import { footprint, hullOf, restSpot } from './rest.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _e2 = new THREE.Vector3();

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
const ARM = [[0, 0, 0], [0.015, 0, -0.11], [-0.01, 0.095, -0.055], [0.01, 0.19, -0.055]]; // two side by side, two laid in the groove above
const L = (sah, en, ru) => ({ sah, en, ru });
const ACT = {
  take: L('ыл', 'pick it up', 'взять'),
  takeLog: L('хардаҕас ыл', 'take an armful of billets', 'взять охапку поленьев'),
  down: L('уур', 'set it down', 'поставить'),
  stack: L('кыстаа', 'stack it on the pile', 'сложить в поленницу'),
  fill: L('уу ыл', 'scoop up water', 'зачерпнуть воды'),
  pour: L('ууну кут', 'pour the water out', 'вылить воду'),
  back: L('төттөрү уур', 'put it back', 'вернуть на место'),
  lay: L('уокка хардаҕас уур', 'lay the billets on the fire', 'положить поленья в огонь'),
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
    this.pail = { kind: 'pail', obj: pail, it: find(pail), level: 0, water: pail.userData.water, name: L('мас ыаҕас', 'water pail', 'ведро') };
    this.waterY = pail.userData.water.position.y; // the full pail's surface (local)
    this.stream = pail.userData.stream; scene.attach(this.stream);
    this.logs = parts.logs.map((obj) => { scene.attach(obj); return { kind: 'log', obj, it: find(obj), state: 'pool', t: 0, name: L('хардаҕас', 'billet', 'полено') }; });
    for (const l of this.logs) l.pool = true; // the woodpile's own billets
    this.pile = parts.pile;
    this.pileIt = find(parts.pile);
    this.dip = 0; // the pail tipped forward to pour (0 … −1)
    this.lag = new THREE.Vector2(); this.lastYaw = null; this.lastPitch = 0; // the carried thing trails the turning view
    this.more = []; // the rest of an armful of billets (held = the first)
    this.pose = null; // (dt, cam) => { p: Vector3, q: Quaternion } in camera space, or null: work animating the held tool
    this.stacked = 0;
  }

  // a new kind of thing to carry: its hold pose and how it lies when set down
  addKind(kind, hold, lie) { HOLD[kind] = hold; LIE[kind] = lie; }
  // a movable thing: { kind, obj, it, name } (a billet also joins `logs`)
  addThing(t) { this.game.engine.scene.attach(t.obj); hullOf(t.obj); if (t.kind === 'log') this.logs.push(t); (this.things ||= []).push(t); return t; }
  // footprints of what lies set down on the ground (and what other code reports through `feetFrom`), but `but`
  lyingFeet(but) {
    const out = [];
    for (const t of [...this.logs, ...(this.things || []), this.pail]) {
      if (t === but || out.some((f) => f.t === t) || !t.obj.visible || this.held === t || this.more.includes(t) || this.moves.some((m) => m.t === t)) continue;
      if (!(t.down || (t.kind === 'log' && t.state === 'ground'))) continue;
      // kept while it lies where it was measured
      if (!t.foot || !t.foot.p.equals(t.obj.position)) {
        const f = t.foot = footprint(t.obj, t.obj.quaternion, t.obj.position.x, t.obj.position.z); f.t = t; f.p = t.obj.position.clone();
        let y0 = Infinity, y1 = -Infinity; for (const v of hullOf(t.obj)) { const y = _v.copy(v).applyQuaternion(t.obj.quaternion).y + t.obj.position.y; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        f.y0 = y0; f.y1 = y1;
      }
      out.push(t.foot);
    }
    for (const f of this.feetFrom || []) out.push(...f());
    return out;
  }
  // A thing with a place of its own (a cup on its stone, the guest's choron on its board): put down, it goes back
  // there from wherever it is carried (from far away unseen), never onto the ground. `t.onHome()` when it is back.
  homed(t) {
    t.home = { p: t.obj.position.clone(), q: t.obj.quaternion.clone() };
    const act = { id: 'back', label: ACT.back, run: () => this.goHome(t) };
    t.put = () => (this.busy ? null : act);
    return t;
  }
  async goHome(t) {
    if (this.held !== t) return;
    this.letGo();
    if (t.obj.position.distanceTo(t.home.p) > 6) { t.obj.position.copy(t.home.p); t.obj.quaternion.copy(t.home.q); } else {
      await this.fly(t, t.home.p, t.home.q, 0.5);
      this.game.audio?.play(LIE[t.kind]?.sound || 'wood-lay-2', t.home.p);
    }
    t.it.off = false; t.obj.userData.sphere = undefined;
    t.onHome?.();
  }
  // how full the pail is, 0…1: its water stands that high
  setLevel(l) {
    const p = this.pail, w = p.water;
    p.level = clamp(l, 0, 1);
    w.visible = p.level > 0.02;
    w.position.y = 0.05 + (this.waterY - 0.05) * p.level;
    w.scale.setScalar(0.84 + 0.16 * p.level); // the staves flare upward
  }

  get name() {
    if (!this.held) return null;
    const n = this.game.ui.t(this.held.name);
    return this.more.length ? `${n} × ${this.more.length + 1}` : n;
  }

  // The act E does on `it` while the hands are (or aren't) busy. undefined = leave it to `it.act`.
  actFor(it) {
    const h = this.held;
    if (it.take) {
      if (h?.kind === 'log' && it.take === 'woodpile') return this.busy ? null : this.stackAct;
      if (h?.kind === 'log' && it.take === 'log' && this.more.length + 1 < ARMFUL && !this.busy) return this.takeAct; // an armful
      if (h) return null; // hands full: just read it
      return it.take === 'woodpile' ? this.takeLogAct : this.takeAct;
    }
    if (h?.kind === 'log' && it.fireplace) return this.layAct;
    return undefined;
  }
  // the hands with nothing in focus: the pail at the water
  idleAct() {
    const h = this.held;
    if (!h || this.busy || h.kind !== 'pail') return null;
    if (h.level < 0.98 && this.waterAhead()) return this.fillAct;
    return h.level > 0.02 && this.game.player.pitch < -0.45 ? this.pourAct : null; // tipped out where you look down: the lake or the ground
  }
  // Putting down: the carried thing (of an armful: its last billet) goes back to its own place when the thing
  // says so (`thing.put()` → an act, null = not now, undefined = no place near), else onto dry ground ahead.
  putAct() {
    const h = this.held;
    if (!h || this.busy) return null;
    const home = (this.more[this.more.length - 1] || h).put?.();
    if (home !== undefined) return home;
    if (h.kind === 'log' && this.game.player.pos.distanceTo(this.pile.getWorldPosition(_v)) < 3.2) return this.stackAllAct; // by the woodpile: onto it
    return this.dropSpot() ? this.downAct : null;
  }
  // dry ground to set a thing on: a step ahead, or at the feet when that is water (nothing goes into the lake)
  dropSpot(r = 0.2) {
    const g = this.game, pl = g.player, terrain = g.world.terrain;
    for (const d of [0.75, 0.3]) {
      const at = g.world.collide(pl.pos.x + fwdX(pl.yaw) * d, pl.pos.z + fwdZ(pl.yaw) * d, r, pl.pos.y);
      const gy = terrain.height(at.x, at.z), wy = terrain.water(at.x, at.z, gy);
      if (wy === null || wy - gy <= 0.03) return at;
    }
    return null;
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
    id: 'take', label: ACT.take,
    run: async (game, it) => {
      const t = it.thing || (it.take === 'pail' ? this.pail : this.logs.find((l) => l.obj === it.target));
      if (!t || (this.held && !(this.held.kind === 'log' && t.kind === 'log' && this.more.length + 1 < ARMFUL))) return;
      if (t.kind === 'log') t.state = 'held';
      if (this.held) { this.more.push(t); this.grab(t); } else this.hold(t);
      t.onTake?.();
      game.audio?.play('wood-take', t.obj.position); // the pail is wood too: a handle knock
    },
  };
  // billets off the woodpile: a tap takes an armful, one after another
  takeLogAct = {
    id: 'take-log', label: ACT.takeLog,
    run: async (game) => {
      if (this.held) return;
      this.busy = true;
      for (let n = 0; n < ARMFUL; n++) {
        // a billet from the pool, or the one set down longest ago
        let t = this.logs.find((l) => l.pool && l.state === 'pool');
        if (!t) t = this.logs.filter((l) => l.pool && l.state === 'ground').sort((a, b) => a.t - b.t)[0];
        if (!t) break;
        t.state = 'held';
        const o = t.obj;
        o.position.copy(this.pile.getWorldPosition(_p)).add(_v.set((Math.random() - 0.5) * 0.8, 0.45, 0).applyAxisAngle(_e2.set(0, 1, 0), this.pile.rotation.y));
        o.quaternion.setFromEuler(_e.set(Math.PI / 2, this.pile.rotation.y, 0));
        o.scale.setScalar(1);
        o.visible = true;
        if (this.held) { this.more.push(t); this.grab(t); } else this.hold(t);
        game.audio?.play('wood-take', o.position);
        this.weigh(0.25);
        let w = 0;
        await this.until((dt) => (w += dt) > 0.32);
      }
      this.busy = false;
    },
  };
  downAct = { id: 'down', label: ACT.down, run: () => this.setDown() };
  // back onto the woodpile: a tap stacks them all
  stackAct = {
    id: 'stack', label: ACT.stack,
    run: async (game) => {
      if (this.held?.kind !== 'log' || this.busy) return;
      this.busy = true;
      while (this.held) await this.stackOne();
      this.busy = false;
      game.promptKey = null;
    },
  };
  // put down by the woodpile: the whole armful onto it
  stackAllAct = {
    id: 'stack-all', label: ACT.stack,
    run: async (game) => {
      if (this.held?.kind !== 'log' || this.busy) return;
      this.busy = true;
      while (this.held) await this.stackOne();
      this.busy = false;
      game.promptKey = null;
    },
  };
  async stackOne() {
    const t = this.letGo(), g = this.game;
    const at = this.pile.getWorldPosition(new THREE.Vector3()).add(_v.set((Math.random() - 0.5) * 1.6, 0.5, 0).applyAxisAngle(_e2.set(0, 1, 0), this.pile.rotation.y));
    await this.fly(t, at, new THREE.Quaternion().setFromEuler(_e.set(Math.PI / 2, this.pile.rotation.y, 0)), 0.3);
    g.audio?.play('wood-lay', at);
    this.free(t);
    this.stacked++;
    g.work?.count('stacked');
  }
  // A tap dips the pail: it comes up full.
  fillAct = {
    id: 'fill', label: ACT.fill,
    run: async (game) => {
      const w = this.waterAhead(), t = this.held;
      if (!w || t !== this.pail) return;
      this.busy = true;
      this.held = null;
      const yaw = game.player.yaw;
      await this.fly(t, w.clone().add(_v.set(0, -0.2, 0)), new THREE.Quaternion().setFromEuler(_e.set(0.5, yaw, 0, 'YXZ')), 0.42);
      game.audio?.play('water-pour', w);
      const to = 1;
      await this.until((dt) => {
        this.setLevel(Math.min(to, t.level + dt / 1.1));
        t.obj.quaternion.setFromEuler(_e.set(0.5 * (1 - t.level), yaw, 0, 'YXZ')); // it rights itself as it grows heavy
        return t.level >= to;
      });
      this.hold(t);
      this.weigh(0.3 + 0.5 * t.level);
      this.busy = false;
    },
  };
  // a tap tips it forward until it is empty
  pourAct = {
    id: 'pour', label: ACT.pour,
    run: async (game) => {
      const t = this.held;
      if (t !== this.pail || t.level <= 0.02) return;
      this.busy = true;
      const pl = game.player, at = this.waterAhead() || _v.set(pl.pos.x + fwdX(pl.yaw) * 0.8, pl.pos.y, pl.pos.z + fwdZ(pl.yaw) * 0.8).clone();
      let s = 0, sounded = false;
      const to = 0;
      await this.until((dt) => {
        s += dt;
        this.dip = -ease(Math.min(1, s / 0.35));
        if (this.dip < -0.75) {
          if (!sounded) { sounded = true; game.audio?.play('water-pour-2', at); }
          this.setLevel(Math.max(to, t.level - dt / 1.6));
          this.pourFrom(t.obj, at.y);
        }
        return t.level <= to;
      });
      this.stream.visible = false;
      const d0 = this.dip;
      await this.anim(0.35, (k) => { this.dip = d0 * (1 - ease(k)); });
      this.busy = false;
    },
  };
  // a tap lays every billet in the hands into the fire, one after another
  layAct = {
    id: 'lay', label: ACT.lay,
    run: async (game, it) => {
      this.busy = true;
      while (this.held?.kind === 'log') await this.layOne(game, it);
      this.busy = false;
    },
  };
  layOneAct = {
    run: async (game, it) => {
      const fp = it.fireplace;
      if (this.held?.kind !== 'log') return;
      const t = this.letGo();
      t.state = 'fire';
      const at = fp.pos();
      const yaw = Math.random() * Math.PI * 2; // a round stick: any turn about its axis
      // leaned into the fire in a gap between two of its billets, its foot in the ashes (a split billet's wood
      // turned up or out, away from the others): upright in a balagan's mouth, slanting on an uraha's hearth
      const L = t.len ??= lengthOf(t.obj), a = fp.lean(), c = Math.cos(a), s = Math.sin(a);
      let to, top;
      if (fp.upright) { // `at` 0.35 over the fire's floor; its billets stand in a cone there
        const rf = 0.3 + 0.08 * clamp((L - 0.5) / 0.4, 0, 1), h = Math.min(L * 0.95, 0.9);
        to = at.clone().add(_v.set(c * rf, -0.33, s * rf));
        top = to.clone().add(_v.set(-c * 0.3 * h, h, -s * 0.3 * h));
      } else { // `at` the hearth's top; the foot out on the ash, the top against the others
        const rf = clamp(0.1 + Math.sqrt(Math.max(0, (L - 0.06) ** 2 - 0.24 ** 2)), 0.3, 0.62);
        to = at.clone().add(_v.set(c * rf, 0.04, s * rf));
        top = at.clone().add(_v.set(c * 0.1, 0.28, s * 0.1)); // on its own side of the middle: two laid ones never meet
      }
      const dir = top.sub(to).normalize(), q = new THREE.Quaternion().setFromUnitVectors(_e2.set(0, 1, 0), dir);
      const want = fp.upright ? _p.set(c, 0, s) : _p.set(0, 1, 0).addScaledVector(dir, -dir.y).normalize(); // where its wood should face
      const w = want.applyQuaternion(_q.copy(q).invert()), m = midOf(t.obj);
      q.multiply(_q.setFromAxisAngle(_e2.set(0, 1, 0), Math.atan2(w.x, w.z) - Math.atan2(m.x, m.z) + (Math.hypot(m.x, m.z) < 0.01 ? yaw : 0)));
      await this.fly(t, to, q, 0.7);
      game.audio?.play('wood-lay', at);
      fp.fuel();
      setTimeout(() => game.audio?.play('fire-feed', at), 350);
      this.burning.push({ log: t, t: 0, upright: fp.upright, base: to.clone() });
    },
  };
  layOne(game, it) { return this.layOneAct.run(game, it); }

  hold(t) {
    this.held = t;
    this.grab(t);
  }
  grab(t) {
    t.it.off = true; t.down = false;
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
    const lie = LIE[(this.more[this.more.length - 1] || this.held).kind], at = this.dropSpot(lie.r);
    if (!at) return;
    const t = this.letGo(), q = (t.lieQ || lie.q)(pl.yaw);
    let { x, z } = at;
    if (lie.pivot) for (let i = 0; i < 2; i++) { // a billet's ends too: clear of walls and posts
      const d = _v.set(0, 1, 0).applyQuaternion(q).setY(0).normalize();
      let mx = 0, mz = 0;
      for (const s of [lie.pivot, -lie.pivot]) { const ex = x + d.x * s, ez = z + d.z * s, c = g.world.collide(ex, ez, 0.12, pl.pos.y); mx += c.x - ex; mz += c.z - ez; }
      x += mx; z += mz;
    }
    if (lie.pivot) { _v.set(0, lie.pivot, 0).applyQuaternion(q); x += _v.x; z += _v.z; } // pivot is the billet's end
    // on the ground under its every point, clear of what lies there already
    const spot = restSpot(g.world, t.obj, q, x, z, this.lyingFeet(t), { feet: pl.pos.y, max: 0.8 });
    const to = new THREE.Vector3(spot.x, spot.y, spot.z);
    await this.fly(t, to, spot.q, 0.45);
    t.down = true;
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
  // the strand of water from the lowest point of the pail's rim down to `y`
  pourFrom(pail, y) {
    const [r, h] = pail.userData.rim, s = this.stream;
    let low = Infinity;
    for (let a = 0; a < 6.28; a += 0.4) {
      _v.set(Math.cos(a) * r, h, Math.sin(a) * r).applyQuaternion(pail.quaternion).add(pail.position);
      if (_v.y < low) { low = _v.y; s.position.copy(_v); }
    }
    s.scale.set(1, Math.max(0.05, low - y), 1);
    s.visible = true;
  }
  anim(dur, step) {
    return new Promise((res) => this.moves.push({ dur, k: 0, step, res }));
  }
  // runs `step(dt)` every frame until it returns true
  until(step) { return new Promise((res) => this.moves.push({ until: step, res })); }
  // weight coming onto the arms: the view dips a little
  weigh(k) { this.game.player.springV -= k; }

  update(dt) {
    const cam = this.eye || this.game.stage?.body || this.game.engine.camera; // (a job's worker eye: `eye`; the body's eye while the view is away: src/ui/stage.js)
    // in a framed work view what the body carries is out of the picture
    const away = !!this.game.framed?.on && !this.eye;
    if (away !== !!this.away) { this.away = away; for (const t of [this.held, ...this.more]) if (t) t.obj.visible = !away; }
    for (const m of [...this.moves]) {
      if (m.until) { if (m.until(dt)) { this.moves.splice(this.moves.indexOf(m), 1); m.res(); } continue; }
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
    // what is carried trails the turning view (heavier things further), and sits nearer the middle of a narrow screen
    const pl = this.game.player, lag = this.lag;
    if (this.lastYaw === null) this.lastYaw = pl.yaw;
    if (dt > 0) {
      const heavy = h?.kind === 'pail' ? 1 + h.level : 1 + this.more.length * 0.3;
      lag.x = damp(lag.x, clamp(angleDiff(this.lastYaw, pl.yaw) / dt * 0.012 * heavy, -0.09, 0.09), 9, dt);
      lag.y = damp(lag.y, clamp((pl.pitch - this.lastPitch) / dt * 0.008 * heavy, -0.05, 0.05), 9, dt);
      this.lastYaw = pl.yaw; this.lastPitch = pl.pitch;
    }
    const narrow = Math.min(1, cam.aspect * 0.8);
    if (h) {
      const P = HOLD[h.kind], dip = this.dip;
      const posed = this.pose?.(dt, cam);
      for (let i = 0; i <= this.more.length; i++) {
        const t = i ? this.more[i - 1] : h;
        t.blend = Math.min(1, t.blend + dt / 0.4);
        const world = posed?.world && !i;
        if (posed && !i) { _p.copy(posed.p); _q.copy(posed.q); } else {
          _p.set(P.p[0] - Math.abs(dip) * 0.05 + ARM[i][0], P.p[1] - (h.level || 0) * 0.045 + ARM[i][1], P.p[2] - Math.abs(dip) * 0.2 + ARM[i][2]);
          if (P.q) _q.copy(P.q); else _q.setFromEuler(_e.set(P.r[0] + dip * 1.5, P.r[1], P.r[2], 'YXZ')); // dip < 0: tipped forward to pour
        }
        if (!world) {
          _p.x = _p.x * narrow + lag.x; _p.y += lag.y;
          _q.premultiply(_q2.setFromEuler(_e.set(-lag.y * 1.5, 0, -lag.x * 2.2)));
          _p.applyQuaternion(cam.quaternion).add(cam.position); _q.premultiply(cam.quaternion);
        }
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

// a carried thing's length along its own +Y (billets and branches stand on their foot at the origin)
function lengthOf(obj) {
  let y = 0;
  obj.traverse((m) => { if (!m.geometry?.attributes.position) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); y = Math.max(y, m.geometry.boundingBox.max.y * m.scale.y); });
  return y || 0.5;
}
// the middle of its shape across its own +Y axis (a split billet's wood lies off its pith edge)
function midOf(obj) {
  if (obj.userData.mid) return obj.userData.mid;
  const m = new THREE.Vector3(); let n = 0;
  for (const v of hullOf(obj)) { m.x += v.x; m.z += v.z; n++; }
  return (obj.userData.mid = m.multiplyScalar(1 / Math.max(1, n)));
}
