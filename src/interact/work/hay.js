// От охсуу: mowing with the old Sakha scythe (саха хотуура). It is a chopping tool: each tap is a blow, swung up
// above one shoulder and brought down across the body to the other side, so its tip undercuts the grass in a
// half-circle before the mower; the blows go right to left and left to right in turn. Taps in rhythm: a tap before
// the scythe is back gives a lower blow, a shorter and narrower cut. Two or three blows from one stance, a step on.
// The meadow's own grass is mown (the grass mask, src/nature/grass.js `mask.mow`); cut wisps lie where the blade
// went. Nothing is told in words. Props: src/models/hayfield.js.
import * as THREE from 'three/webgpu';
import { clamp, ease, fwdX, fwdZ } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  name: L('саха хотуура', 'Sakha scythe', 'якутская коса'),
  mow: L('оту оҕус', 'strike the grass', 'ударить по траве'),
  hang: L('хотууру ыйаа', 'hang the scythe up', 'повесить косу'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// camera-space poses (origin: the grip's end): carried; for a blow from the right, raised above the right shoulder
// and swept down across to the low left (`side` -1 mirrors them: from the left to the low right)
const CARRY = { p: V(0.34, -0.5, -0.42), q: basisQ(V(-0.25, 0.25, -0.93), V(-0.9, -0.3, 0.2)) };
const pose = (p, y, x) => ({ p, y, x, q: basisQ(y, x) });
const HIGH = pose(V(0.3, -0.06, -0.44), V(0.5, 0.78, 0.38), V(-0.7, 0.3, -0.6)); // the snath up and out over the shoulder
const MID = pose(V(0.12, -0.36, -0.5), V(0.1, -0.2, -0.97), V(-1, -0.1, 0)); // across the front, the blade at the grass
const END = pose(V(-0.12, -0.44, -0.5), V(-0.6, -0.25, -0.76), V(-0.4, 0.1, 0.9)); // swept through to the low other side
const mirror = (P) => ({ p: V(-P.p.x, P.p.y, P.p.z), q: basisQ(V(-P.y.x, P.y.y, P.y.z), V(-P.x.x, P.x.y, P.x.z)) });
const SIDE = { 1: { HIGH, MID, END }, [-1]: { HIGH: mirror(HIGH), MID: mirror(MID), END: mirror(END) } };
const REACH = 2.1, HALF = 1.05; // the blade's reach (m) and half-angle (rad) from a full swing
const RISE = 0.32, BACK = 0.42; // s to swing it up; s for it to come back after a blow (the beat)

export class Hay {
  constructor(work, parts, find) {
    this.work = work;
    const game = this.game = work.game, hands = this.hands = work.hands;
    this.parts = parts;
    hands.addKind('khotuur', { p: CARRY.p.toArray(), q: CARRY.q }, {
      r: 0.25, lift: 0.03, sound: 'wood-lay',
      q: (yaw) => basisQ(V(fwdX(yaw + 1.2), 0, fwdZ(yaw + 1.2)), V(fwdX(yaw - 0.37), 0, fwdZ(yaw - 0.37))),
    });
    this.scythe = hands.addThing({ kind: 'khotuur', obj: parts.scythe, it: find(parts.scythe), name: TXT.name });
    this.scythe.it.thing = this.scythe;
    this.scythe.put = () => (!this.sw && game.player.pos.distanceTo(this.home.p) < 2.6 ? this.hangAct : undefined); // by its post: hung up
    this.home = { p: parts.scythe.position.clone(), q: parts.scythe.quaternion.clone() };
    this.rackIt = game.world.interactables.find((i) => i.rack);
    this.sw = null;
    this.side = 1; // the next blow comes from the right (1) or the left (-1)
    this.next = 0; // the swath's next wisp
    const own = hands.pose;
    hands.pose = (dt, cam) => (hands.held === this.scythe ? this.posed(dt, cam) : own?.(dt, cam));
    game.engine.scene.attach(parts.swath); // world space: wisps are placed by world coordinates
    parts.swath.position.set(0, 0, 0); parts.swath.quaternion.identity(); parts.swath.updateMatrixWorld();
  }
  get held() { return this.hands.held === this.scythe; }
  get mask() { return this.game.world._field?.mask; }

  actFor(it) {
    if (it.khotuur) return this.hands.held || this.sw ? null : this.hands.takeAct;
    if (it.rack) return this.held && !this.sw ? this.hangAct : undefined;
    return undefined;
  }
  // the hands with nothing in focus: the scythe strikes
  idleAct() {
    if (!this.held) return null;
    return !this.sw || this.sw.phase === 'back' ? this.mowAct : this.noAct;
  }
  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };
  mowAct = { id: 'mow', label: TXT.mow, run: () => this.strike(), tap: () => { if (this.sw) this.sw.next ??= 0.45; } }; // a tap mid-blow: the next, low
  hangAct = {
    id: 'hang-scythe', label: TXT.hang,
    run: async (game) => {
      if (!this.held) return;
      const t = this.hands.letGo();
      await this.hands.fly(t, this.home.p, this.home.q, 0.5);
      game.audio?.play('wood-lay', this.home.p);
      t.it.off = false; t.obj.userData.sphere = undefined;
    },
  };

  // A blow; a tap while the scythe is still coming back is kept for when it is (lower: the beat was early).
  async strike(power = 1) {
    if (!this.held) return;
    if (this.sw?.phase === 'back') { this.sw.next ??= 0.45 + 0.55 * ease(this.sw.k); return; }
    if (this.sw) return;
    const g = this.game, side = this.side;
    this.side = -side;
    const sw = this.sw = { phase: 'raise', t: 0, power: 0, top: power, side, k: 0 };
    await new Promise((res) => { sw.go = res; });
    sw.phase = 'fall'; sw.k = 0;
    g.audio?.play('swish', g.engine.camera.position);
    await new Promise((res) => { sw.cut = res; });
    this.cut(sw.power, side);
    g.promptKey = null;
  }

  // the blade's half-circle: every tall texel within reach and in front goes down
  cut(power, side = 1) {
    const g = this.game, pl = g.player, m = this.mask;
    // from a low swing the blade has little way: a short, narrow cut
    const R = REACH * (0.42 + 0.58 * power), half = HALF * (0.45 + 0.55 * power), fx = fwdX(pl.yaw), fz = fwdZ(pl.yaw), x0 = pl.pos.x, z0 = pl.pos.z;
    const sx = -fz * side, sz = fx * side; // towards where the blade ends (the blow's far side)
    const cells = [];
    const n = m.mow(x0 - R, z0 - R, x0 + R, z0 + R, (x, z) => {
      const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
      if (d < 0.35 || d > R) return false;
      if (Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) > half) return false;
      cells.push(x, z);
      return true;
    });
    g.player.springV -= 0.25 + 0.6 * power;
    if (n && power > 0.3) g.audio?.play('scythe', _v.set(x0 + fx, pl.pos.y, z0 + fz)); else g.audio?.step?.('grass', 1 + 2 * power);
    if (!n) return;
    // wisps of cut grass, lying across the blade's path, carried towards the side the blade ends on
    const sw = this.parts.swath, M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < cells.length; i += 2) {
      if (Math.random() < 0.6) continue;
      const x = cells[i] + (Math.random() - 0.5) * 0.3 + sx * 0.15, z = cells[i + 1] + (Math.random() - 0.5) * 0.3 + sz * 0.15;
      p.set(x, g.world.groundAt(x, z) + 0.02, z);
      q.setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(fx, fz) + (Math.random() - 0.5) * 1.1);
      sw.setMatrixAt(this.next, M4.compose(p, q, s.setScalar(0.55 + Math.random() * 0.35)));
      this.next = (this.next + 1) % this.parts.max;
    }
    sw.instanceMatrix.needsUpdate = true;
    this.work.count('mown', Math.round(n * m.texel * m.texel * 10) / 10);
    this.work.count('blows');
  }

  update(dt) {
    const sw = this.sw, g = this.game;
    const off = !this.held;
    if (this.rackIt.off !== off) { this.rackIt.off = off; g.promptKey = null; }
    if (!sw) return;
    if (!this.held) { this.sw = null; return; }
    if (sw.phase === 'raise') {
      sw.t += dt;
      sw.power = sw.top * ease(Math.min(1, sw.t / (RISE * (0.5 + 0.5 * sw.top))));
      if (sw.power >= sw.top - 1e-3 && sw.go) { const f = sw.go; sw.go = null; f(); }
    } else if (sw.phase === 'fall') {
      sw.k = Math.min(1, sw.k + dt / 0.14);
      if (sw.k >= 1) { sw.phase = 'sweep'; sw.k = 0; sw.cut(); }
    } else if (sw.phase === 'sweep') {
      sw.k = Math.min(1, sw.k + dt / 0.18);
      if (sw.k >= 1) { sw.phase = 'back'; sw.k = 0; }
    } else if (sw.phase === 'back') {
      sw.k = Math.min(1, sw.k + dt / BACK);
      if (sw.k >= 1) {
        this.sw = null; g.promptKey = null;
        if (sw.next != null) this.strike(sw.next); // the early tap's blow
      }
    }
  }

  // the held scythe while a blow runs (camera space): up over one shoulder, down across to the other side
  posed() {
    const sw = this.sw;
    if (!sw) return null;
    const P = this._pose ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() }, S = SIDE[sw.side];
    const mix = (a, b, k) => { P.p.lerpVectors(a.p, b.p, k); P.q.slerpQuaternions(a.q, b.q, k); };
    const high = this._high ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    high.p.lerpVectors(CARRY.p, S.HIGH.p, 0.35 + 0.65 * sw.top); high.q.slerpQuaternions(CARRY.q, S.HIGH.q, 0.35 + 0.65 * sw.top); // a low beat: not so high
    if (sw.phase === 'raise') mix(CARRY, high, sw.top ? sw.power / sw.top : 1);
    else if (sw.phase === 'fall') mix(high, S.MID, sw.k * sw.k);
    else if (sw.phase === 'sweep') mix(S.MID, S.END, ease(sw.k));
    else mix(S.END, CARRY, ease(sw.k));
    return P;
  }
}
