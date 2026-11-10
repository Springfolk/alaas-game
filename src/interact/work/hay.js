// От охсуу: mowing with the old Sakha scythe (саха хотуура). It is a chopping tool: swung over the head (hold E:
// the gauge climbs and falls) and brought down so its tip undercuts the grass in a half-circle before the mower.
// Two or three blows from one stance, then a step on. The meadow's own grass is mown (the grass mask,
// src/nature/grass.js `mask.mow`); cut wisps lie where the blade went. Props: src/models/hayfield.js.
import * as THREE from 'three/webgpu';
import { clamp, ease, fwdX, fwdZ } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  name: L('саха хотуура', 'Sakha scythe', 'якутская коса'),
  mow: L('оту оҕус (E-ни тутан тур)', 'strike the grass (hold E)', 'ударить по траве (удерживайте E)'),
  mowTap: L('оту оҕус', 'strike the grass', 'ударить по траве'),
  hang: L('хотууру ыйаа', 'hang the scythe up', 'повесить косу'),
  how: L('Саха хотуурунан оту охсоллор: төбөҥ үрдүнэн далай, иннигэр аҥаар эргимтэнэн быһа оҕус.', 'With the Sakha scythe grass is struck, not swept: swing it over your head and undercut a half-circle before you.', 'Якутской косой траву не косят, а бьют: занесите её над головой и подрубите полукруг перед собой.'),
  step: L('Биир сиртэн икки-үс охсуу, онтон хардыылаа.', 'Two or three blows from one stance, then step on.', 'Два-три удара с одного места — и шаг вперёд.'),
  weak: L('Үрдүктүк далай: мөлтөх охсуу оту быспат.', 'Swing higher: a weak blow does not cut.', 'Замахнитесь выше: слабый удар траву не берёт.'),
  area: L('от охсулунна', 'of meadow mown', 'луга скошено'),
};
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// camera-space poses (origin: the grip's end): carried, raised over the head, low at the right, swept to the left
const CARRY = { p: V(0.34, -0.62, -0.35), q: basisQ(V(-0.25, 0.25, -0.93), V(-0.9, -0.3, 0.2)) };
const UP = { p: V(0.26, 0.0, -0.2), q: basisQ(V(0.28, 0.9, 0.3), V(-0.6, 0.2, -0.8)) };
const LOW = { p: V(0.45, -0.45, -0.3), q: basisQ(V(0.25, -0.3, -0.92), V(-1, -0.15, -0.2)) };
const LEFT = { p: V(-0.05, -0.5, -0.32), q: basisQ(V(-0.55, -0.3, -0.78), V(-0.3, 0.1, 0.9)) };
const NEED = 0.45, REACH = 2.1, HALF = 1.05; // the least swing that cuts; the blade's reach (m) and half-angle (rad)

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
    this.home = { p: parts.scythe.position.clone(), q: parts.scythe.quaternion.clone() };
    this.rackIt = game.world.interactables.find((i) => i.rack);
    this.sw = null;
    this.next = 0; // the swath's next wisp
    this.stance = { x: 0, z: 0, n: 0 };
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
  // E with nothing in focus: the scythe strikes (it is put away only at its post, never dropped by a stray E)
  idleAct() {
    if (!this.held) return null;
    return this.sw ? this.noAct : this.game.input.touchMode ? this.mowTapAct : this.mowAct;
  }
  noAct = { id: 'none', label: L('', '', ''), thenCard: false, run: async () => {} };
  mowAct = { id: 'mow', label: TXT.mow, thenCard: false, run: () => this.strike() };
  mowTapAct = { id: 'mow', label: TXT.mowTap, thenCard: false, run: () => this.strike() };
  hangAct = {
    id: 'hang-scythe', label: TXT.hang, thenCard: false,
    run: async (game) => {
      if (!this.held) return;
      const t = this.hands.letGo();
      await this.hands.fly(t, this.home.p, this.home.q, 0.5);
      game.audio?.play('wood-lay', this.home.p);
      t.it.off = false; t.obj.userData.sphere = undefined;
    },
  };

  async strike() {
    if (!this.held || this.sw) return;
    const g = this.game, inp = g.input;
    this.work.hint('hay-how', TXT.how, 2);
    const sw = this.sw = { phase: 'raise', t: 0, power: 0, hold: inp.down('KeyE'), first: true, k: 0 };
    await new Promise((res) => { sw.go = res; });
    sw.phase = 'fall'; sw.k = 0;
    g.audio?.play('swish', g.engine.camera.position);
    await new Promise((res) => { sw.cut = res; });
    this.cut(sw.power);
    await new Promise((res) => { sw.done = res; });
    this.sw = null;
    g.promptKey = null;
  }

  // the blade's half-circle: every tall texel within reach and in front goes down
  cut(power) {
    const g = this.game, pl = g.player, m = this.mask;
    if (power < NEED) { this.work.hint('hay-weak', TXT.weak); g.audio?.step?.('grass', 1); return; }
    const R = REACH * (0.7 + 0.3 * power), fx = fwdX(pl.yaw), fz = fwdZ(pl.yaw), x0 = pl.pos.x, z0 = pl.pos.z;
    const cells = [];
    const n = m.mow(x0 - R, z0 - R, x0 + R, z0 + R, (x, z) => {
      const dx = x - x0, dz = z - z0, d = Math.hypot(dx, dz);
      if (d < 0.35 || d > R) return false;
      if (Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) > HALF) return false;
      cells.push(x, z);
      return true;
    });
    g.player.springV -= 0.7;
    g.audio?.play('scythe', _v.set(x0 + fx, pl.pos.y, z0 + fz)) || g.audio?.step?.('grass', 3);
    if (!n) return;
    // wisps of cut grass, lying across the blade's path, drawn towards the mower's left as the blade throws them
    const sw = this.parts.swath, M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let i = 0; i < cells.length; i += 2) {
      if (Math.random() < 0.6) continue;
      const x = cells[i] + (Math.random() - 0.5) * 0.3 - fz * 0.15, z = cells[i + 1] + (Math.random() - 0.5) * 0.3 + fx * 0.15;
      p.set(x, g.world.groundAt(x, z) + 0.02, z);
      q.setFromAxisAngle(_v.set(0, 1, 0), Math.atan2(fx, fz) + (Math.random() - 0.5) * 1.1);
      sw.setMatrixAt(this.next, M4.compose(p, q, s.setScalar(0.55 + Math.random() * 0.35)));
      this.next = (this.next + 1) % this.parts.max;
    }
    sw.instanceMatrix.needsUpdate = true;
    const area = n * m.texel * m.texel, before = Math.floor((g.save.work.mown || 0) / 25);
    const total = this.work.count('mown', Math.round(area * 10) / 10);
    this.work.count('blows');
    if (Math.floor(total / 25) > before) g.ui.toast(`<small>${g.ui.t(TXT.area)}</small><b>${Math.round(total)} м²</b>`, 3200);
    // the same stance again and again cuts nothing new
    const st = this.stance;
    if (Math.hypot(st.x - x0, st.z - z0) < 0.4) { if (++st.n >= 3) this.work.hint('hay-step', TXT.step, 2); } else { st.x = x0; st.z = z0; st.n = 1; }
  }

  update(dt) {
    const sw = this.sw, g = this.game;
    const off = !this.held;
    if (this.rackIt.off !== off) { this.rackIt.off = off; g.promptKey = null; }
    if (!sw) return;
    if (!this.held) { this.sw = null; this.work.meter(null); return; }
    if (sw.phase === 'raise') {
      sw.t += dt;
      const inp = g.input, u = (sw.t / 0.8) % 2;
      sw.power = clamp(u < 1 ? u : 2 - u, 0, 1);
      if (sw.hold && sw.t > 0.12 && sw.t < 0.2 && !inp.down('KeyE')) sw.hold = false;
      const go = sw.hold ? !inp.down('KeyE') && sw.t >= 0.2 : !sw.first && inp.hit('KeyE');
      sw.first = false;
      this.work.meter(sw.power, NEED, 1);
      if (go || sw.t > 6) { this.work.meter(null); sw.go(); }
    } else if (sw.phase === 'fall') {
      sw.k = Math.min(1, sw.k + dt / 0.13);
      if (sw.k >= 1) { sw.phase = 'sweep'; sw.k = 0; sw.cut(); }
    } else if (sw.phase === 'sweep') {
      sw.k = Math.min(1, sw.k + dt / 0.2);
      if (sw.k >= 1) { sw.phase = 'back'; sw.k = 0; }
    } else if (sw.phase === 'back') {
      sw.k = Math.min(1, sw.k + dt / 0.38);
      if (sw.k >= 1) sw.done();
    }
  }

  // the held scythe while a blow runs (camera space)
  posed() {
    const sw = this.sw;
    if (!sw) return null;
    const P = this._pose ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() };
    const mix = (a, b, k) => { P.p.lerpVectors(a.p, b.p, k); P.q.slerpQuaternions(a.q, b.q, k); };
    if (sw.phase === 'raise') mix(CARRY, UP, ease(Math.min(1, sw.t / 0.25)) * (0.3 + 0.7 * sw.power));
    else if (sw.phase === 'fall') mix(UP, LOW, sw.k * sw.k);
    else if (sw.phase === 'sweep') mix(LOW, LEFT, ease(sw.k));
    else mix(LEFT, CARRY, ease(sw.k));
    return P;
  }
}
