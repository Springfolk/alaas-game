// Small things with a place of their own that are taken into the hands, used with the do input and put back
// (they never lie on the ground: `Hands.homed`): the guest's choron in the uraha (a tap sprinkles a few drops of
// kymys towards the fire, the earth or the sky, else it is a sip), the cup of milk on the lake's offering stone (a tap
// over the water pours a little), the khomus on its peg in the balagan (a tap plucks it, taps in rhythm play on). The respectful gestures that
// were there before, now done by the player's own hands and look; nothing here can go wrong (docs/interactions.md).
// Props and their own animations stay in the models (`userData.guest`, `.offering`, `.khomus`).
import * as THREE from 'three/webgpu';
import { ease, clamp, fwdX, fwdZ } from '../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const X = V(1, 0, 0), Y = V(0, 1, 0);
const BACK = L('төттөрү уур', 'put it back', 'вернуть на место');

// What the three share: one thing, its pose while held, a clock for its motions.
class Homed {
  constructor(game, hands, kind, obj, name, hold) {
    this.game = game; this.hands = hands;
    hands.addKind(kind, hold, { r: 0.1, lift: 0, sound: 'wood-lay-2', q: () => new THREE.Quaternion() });
    this.thing = hands.homed(hands.addThing({ kind, obj, it: {}, name }));
    this.pose = null; // { p, q, world? } while a motion runs
    this.ticks = [];
    const own = hands.pose;
    hands.pose = (dt, cam) => (hands.held === this.thing ? this.posed(dt, cam) : own?.(dt, cam));
    this.backAct = { id: 'back', label: BACK, run: () => hands.goHome(this.thing) };
    this.takeAct = { id: 'take', label: L('ыл', 'take it', 'взять'), run: () => this.take() };
  }
  get held() { return this.hands.held === this.thing; }
  posed() { return this.pose; }
  take() { if (!this.hands.held) { this.hands.hold(this.thing); this.game.audio?.play('wood-take', this.thing.obj.position); } }
  // runs step(dt) every frame until it returns true
  until(step) { return new Promise((res) => this.ticks.push((dt) => (step(dt) ? (res(), true) : false))); }
  update(dt) { for (let i = this.ticks.length - 1; i >= 0; i--) if (this.ticks[i](dt)) this.ticks.splice(i, 1); }
}

// ── the guest's choron ──
export class Choron extends Homed {
  constructor(game, hands, parts) {
    super(game, hands, 'choron', parts.hero, L('чороон', 'choron', 'чорон'), { p: [0.15, -0.27, -0.44], r: [0, 0, 0] });
    this.parts = parts;
    this.it = game.world.interactables.find((i) => i.guest);
    this.thing.it = this.it;
    this.sprinkleAct = { id: 'choron', label: L('ыс', 'sprinkle', 'окропить'), run: () => this.use(true) };
    this.drinkAct = { id: 'drink', label: L('ис', 'drink', 'выпить'), run: () => this.use(false) };
    this.fillAct = { id: 'fill-choron', label: L('кымыста кут', 'ladle kymys into it', 'налить кумыса'), run: () => this.fill() };
    this.tilt = new THREE.Quaternion(); this.off = V(0, 0, 0); // the held cup's lean and shift (world lean, camera shift)
    this.P = { p: V(0, 0, 0), q: new THREE.Quaternion(), world: true };
  }
  actFor(it) {
    if (this.held) return this.busy ? null : it.entry === 'choron' ? this.backAct : this.useAct(); // with the choron in the hands they do nothing else
    if (it.guest) return this.hands.held || this.busy ? null : this.fillAct;
    return undefined;
  }
  idleAct() { return this.held && !this.busy ? this.useAct() : null; }
  // aimed at the fire, down at the earth or up at the sky: drops for it; else a sip
  useAct() {
    const g = this.game, cam = g.engine.camera, pitch = g.player.pitch;
    const h = this.parts.hearth(), to = _w.copy(h).sub(cam.position), d = to.length();
    const fire = d < 7 && to.normalize().dot(cam.getWorldDirection(_v)) > 0.86;
    return fire || pitch < -0.6 || pitch > 0.5 ? this.sprinkleAct : this.drinkAct;
  }
  // the ladle fills it from the симиир, then it is in the hands
  async fill() {
    if (this.busy || this.hands.held) return;
    this.busy = true;
    await this.parts.fill(this.game);
    this.busy = false;
    this.take();
  }
  // Held upright in the world whatever the view does (kymys spills from a tilted cup), a little below the look.
  posed(dt, cam) {
    const P = this.P, H = [0.15, -0.27, -0.44], narrow = Math.min(1, cam.aspect * 0.8);
    P.p.set(H[0] * narrow + this.off.x, H[1] + this.off.y, H[2] + this.off.z).applyQuaternion(cam.quaternion).add(cam.position);
    P.q.setFromAxisAngle(Y, this.game.player.yaw).premultiply(this.tilt);
    return P;
  }
  async use(sprinkle) {
    if (!this.held || this.busy) return;
    const kl = this.parts.kymys;
    this.busy = true;
    if (!sprinkle) await this.drink(); else if (kl.vol > kl.volAt(this.parts.KYMYS.left) * 1.001) await this.sprinkle();
    this.busy = false;
  }
  // The cup tipped a little towards the look: a few drops go that way, sprinkled (ыс). Towards the fire, it answers.
  async sprinkle() {
    const g = this.game, cam = g.engine.camera, P = this.parts, kl = P.kymys;
    const dir = cam.getWorldDirection(new THREE.Vector3()), flat = _v.set(dir.x, 0, dir.z).normalize().clone();
    const axis = new THREE.Vector3().crossVectors(Y, flat).normalize(), lean = 0.3 + 0.2 * (1 - Math.abs(dir.y));
    const rise = clamp(dir.y, -0.6, 0.9) * 0.1;
    let k = 0;
    await this.until((dt) => { k = Math.min(1, k + dt / 0.16); const e = ease(k); this.tilt.setFromAxisAngle(axis, lean * e); this.off.set(0, rise * e, -0.07 * e); return k >= 1; });
    // from the rim nearest the look
    const hero = P.hero, lip = flat.clone().multiplyScalar(kl.rTop).addScaledVector(Y, kl.top).applyQuaternion(this.tilt).add(hero.position);
    P.sprinkle(lip, _w.copy(dir).addScaledVector(Y, 0.35).normalize());
    kl.vol *= 0.985;
    g.audio?.play('pour', hero.position);
    const hearth = P.hearth(), to = _w.copy(hearth).sub(cam.position), d = to.length();
    if (d < 7 && to.normalize().dot(dir) > 0.86) setTimeout(() => P.flare(g), 300 + d * 90); // the drops reach the fire
    await this.until((dt) => { k = Math.max(0, k - dt / 0.3); const e = ease(k); this.tilt.setFromAxisAngle(axis, lean * e); this.off.set(0, rise * e, -0.07 * e); return k <= 0; });
    this.tilt.identity(); this.off.set(0, 0, 0);
  }
  // A sip: the near rim comes to the lips, the choron tips towards the face and comes down again; what it held at
  // the start stays in (the guest does not drain it).
  async drink() {
    const g = this.game, cam = g.engine.camera, P = this.parts, kl = P.kymys;
    const th0 = 0.25, th1 = Math.max(th0, kl.tiltFor(kl.volAt(P.KYMYS.left)));
    const mouth = V(0, -0.1, -0.11), H = V(0.15 * Math.min(1, cam.aspect * 0.8), -0.27, -0.44);
    let up = 0, th = th0, sipped = false, t = 0;
    await this.until((dt) => {
      const on = (t += dt) < 2.3; // up, the sip, a breath, down
      up = clamp(up + (on ? dt / 0.55 : -dt / 0.5), 0, 1);
      if (up >= 1 && on) { th = Math.min(th1, th + dt * (th1 - th0) / 1.2); if (!sipped) { sipped = true; g.player.springV += 0.25; } }
      if (!on) th = Math.max(th0, th - dt * 2);
      const e = ease(up), a = th * e;
      // lean about the rim nearest the face: the axis is the view's right, turned level
      const right = _v.set(1, 0, 0).applyQuaternion(cam.quaternion).setY(0).normalize();
      this.tilt.setFromAxisAngle(right, a);
      const face = _w.set(-fwdX(g.player.yaw), 0, -fwdZ(g.player.yaw)); // from the cup towards the drinker
      const lip = face.clone().multiplyScalar(kl.rTop).addScaledVector(Y, kl.top).applyQuaternion(this.tilt); // rim, from the cup's foot (world axes)
      const want = mouth.clone().applyQuaternion(cam.quaternion).sub(lip).applyQuaternion(_q.copy(cam.quaternion).invert()); // the foot, in view space
      this.off.copy(want.sub(H)).multiplyScalar(e);
      return up <= 0 && !on;
    });
    this.tilt.identity(); this.off.set(0, 0, 0);
  }
  update(dt) {
    super.update(dt);
    if (this.held && !this.busy && !this.parts.inside(this.game.player.pos)) this.hands.goHome(this.thing); // it stays in the house
  }
}

// ── the cup of milk on the lake's offering stone ──
export class Cup extends Homed {
  constructor(game, hands, parts) {
    super(game, hands, 'cup', parts.cup, L('үүттээх туос иһит', 'cup of milk', 'чашка молока'), { p: [0.14, -0.24, -0.42], r: [0, 0, 0] });
    this.parts = parts;
    this.stone = game.world.interactables.find((i) => i.offering);
    this.milk = 1; this.tip = 0;
    this.pourAct = { id: 'milk', label: L('Эбэҕэ үүт кут', 'Pour a little milk for the lake', 'Налить озеру немного молока'), run: () => this.pour() };
    this.takeAct.label = L('үүтү ыл', 'take the milk', 'взять молоко');
    this.P = { p: V(0, 0, 0), q: new THREE.Quaternion() };
  }
  actFor(it) {
    if (it.offering) return this.held ? this.backAct : this.hands.held || this.milk <= 0 ? null : this.takeAct;
    return undefined;
  }
  // milk goes to the water only (never onto the ground): looking down at the lake within reach
  idleAct() { return this.held && !this.busy && this.milk > 0 && this.hands.waterAhead() ? this.pourAct : null; }
  posed() {
    if (!this.tip) return null;
    const P = this.P, e = ease(this.tip);
    P.p.set(0.14 - 0.06 * e, -0.24 + 0.03 * e, -0.42 - 0.1 * e);
    P.q.setFromEuler(_e.set(-1.25 * e, 0, 0)); // the far rim down
    return P;
  }
  async pour() {
    const g = this.game, P = this.parts, cup = P.cup, w = this.hands.waterAhead();
    if (!w || this.busy) return;
    this.busy = true;
    const to = Math.max(0, this.milk - 0.34); // a tap: a third of the cup
    let rings = 9, sounded = false;
    await this.until((dt) => {
      const on = this.milk > to;
      this.tip = clamp(this.tip + (on ? dt / 0.5 : -dt / 0.4), 0, 1);
      const flowing = this.tip > 0.8 && this.milk > 0;
      if (flowing) {
        this.milk = Math.max(to, this.milk - dt / 1.6);
        P.milkTop.scale.setScalar(0.45 + 0.55 * this.milk); P.milkTop.visible = this.milk > 0;
        if (!sounded) { sounded = true; g.audio?.play('pour', w); }
        // the strand from the far rim down to the water, rings where it lands
        const lip = _v.set(0, 0.1, -0.066).applyQuaternion(cup.quaternion).add(cup.position), local = P.group.worldToLocal(lip.clone());
        P.stream.position.copy(local); P.stream.scale.set(1, Math.max(0.05, local.y - P.waterY), 1);
        if ((rings += dt) > 0.9) { rings = 0; P.rippleT.value = 0; P.ripple.position.set(local.x, P.waterY + 0.012, local.z); }
      }
      P.stream.visible = flowing;
      return this.tip <= 0 && !on;
    });
    this.busy = false;
    g.promptKey = null;
  }
}

// ── the khomus ──
const AT_LIPS = { p: [0.0, -0.115, -0.2], q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, -1, 0), V(-1, 0, 0), V(0, 0, -1))) }; // the frame across the mouth, the tongue's hook outward
export class Khomus extends Homed {
  constructor(game, hands, parts) {
    super(game, hands, 'khomus', parts.obj, L('хомус', 'khomus', 'хомус'), AT_LIPS);
    this.parts = parts;
    this.peg = game.world.interactables.find((i) => i.khomus);
    this.playAct = { id: 'play', label: L('Хомустаа', 'Play the khomus', 'Сыграть на хомусе'), run: () => this.play() };
    this.takeAct.label = this.playAct.label;
    this.ring = 0; // the frame still humming after a pluck
    this.P = { p: V(0, 0, 0), q: new THREE.Quaternion() };
  }
  get dark() { return (this.game.engine?.sunElev ?? 30) < 0; } // never after dark (the card says why)
  actFor(it) {
    if (this.held) return this.busy ? null : it.khomus ? this.backAct : this.playAct;
    if (it.khomus) return this.hands.held || this.dark ? null : this.takeAct;
    return undefined;
  }
  idleAct() { return this.held && !this.busy ? this.playAct : null; }
  posed() {
    if (this.ring <= 0.002) return null;
    const P = this.P, s = this.ring * Math.sin(performance.now() * 0.09);
    P.p.set(AT_LIPS.p[0], AT_LIPS.p[1] + s * 0.0025, AT_LIPS.p[2]);
    P.q.copy(AT_LIPS.q).multiply(_q.setFromAxisAngle(X, s * 0.05));
    return P;
  }
  // a tap: one pluck. Taps that follow in rhythm play on, and the playing stops a moment after the last.
  async play() {
    if (!this.held || this.busy) return;
    const g = this.game, at = g.engine.camera.position;
    this.busy = true;
    const pluck = () => { g.audio?.play('khomus-pluck', at) || g.audio?.play('discover', at); this.ring = 1; };
    pluck();
    let t = 0, song = null;
    this.playAct.tap = () => { t = 0; if (!song) song = g.audio?.sustain?.('khomus', at) || true; else pluck(); };
    await this.until((dt) => { if (song) this.ring = Math.max(this.ring, 0.6); return (t += dt) > (song ? 0.9 : 0.7) || !this.held; });
    this.playAct.tap = null;
    song?.stop?.();
    this.busy = false;
  }
  update(dt) {
    super.update(dt);
    this.ring = Math.max(0, this.ring - dt * 1.6);
    if (this.held && !this.busy && this.thing.obj.position.distanceTo(this.thing.home.p) > 9) this.hands.goHome(this.thing); // it stays in the house
  }
}
