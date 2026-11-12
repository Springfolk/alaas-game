// Small things with a place of their own that are taken into the hands, used with the do input and put back
// (they never lie on the ground: `Hands.homed`): the guest's choron in the uraha (one tap: filled, drops for the
// fire, the earth and the sky, a sip, back on its board), the cup of milk on the lake's offering stone (one tap: carried out over the
// water, poured, set back), the khomus on its peg in the balagan (a tap plucks it, taps in rhythm play on). The respectful gestures that
// were there before, now done by the player's own hands and look; nothing here can go wrong (docs/interactions.md).
// Props and their own animations stay in the models (`userData.guest`, `.offering`, `.khomus`).
import * as THREE from 'three/webgpu';
import { ease, clamp, fwdX, fwdZ } from '../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
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
    super(game, hands, 'choron', parts.hero, L('чороон', 'choroon', 'чороон'), { p: [0.15, -0.27, -0.44], r: [0, 0, 0] });
    this.parts = parts;
    this.it = game.world.interactables.find((i) => i.guest);
    this.thing.it = this.it;
    this.fillAct = { id: 'fill-choron', freeze: true, label: L('кымыста кут', 'kymys: drops for the fire, a sip', 'кумыс: капли огню, глоток'), run: () => this.rite() };
    this.tilt = new THREE.Quaternion(); this.off = V(0, 0, 0); // the held cup's lean and shift (world lean, camera shift)
    this.P = { p: V(0, 0, 0), q: new THREE.Quaternion(), world: true };
  }
  actFor(it) {
    if (this.held) return null; // only while its rite plays
    if (it.guest) return this.hands.held || this.busy ? null : this.fillAct;
    return undefined;
  }
  idleAct() { return null; }
  // One tap, the guest's whole part (the player held still, the view led): the ladle fills it, it comes into the
  // hands, drops for the fire, for the earth and for the sky, a sip, and it goes back onto its board.
  async rite() {
    if (this.busy || this.hands.held) return;
    await this.fill();
    if (!this.held) return;
    this.busy = true;
    const pl = this.game.player, h = this.parts.hearth(), eye = this.game.engine.camera.position;
    const dx = h.x - pl.pos.x, dz = h.z - pl.pos.z, yaw = Math.atan2(-dx, -dz);
    await this.look(yaw, clamp(Math.atan2(h.y - eye.y, Math.hypot(dx, dz)), -0.6, -0.1), 1.0); // the hearth mid-view, over the cup
    await this.drops('fire');
    await this.look(yaw, -0.7, 0.9);
    await this.drops('earth');
    await this.look(yaw, 0.6, 1.1);
    await this.drops('sky');
    await this.look(yaw, -0.05, 0.9);
    await this.drink();
    this.busy = false;
    await this.hands.goHome(this.thing);
  }
  // the view eased to (yaw, pitch) over `dur` s
  look(yaw, pitch, dur) {
    const pl = this.game.player, y0 = pl.yaw, p0 = pl.pitch, dy = Math.atan2(Math.sin(yaw - y0), Math.cos(yaw - y0));
    let k = 0;
    return this.until((dt) => {
      k = Math.min(1, k + dt / dur); const e = ease(k);
      pl.yaw = pl.aimYaw = y0 + dy * e; pl.pitch = pl.aimPitch = p0 + (pitch - p0) * e;
      return k >= 1;
    });
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
  // The cup tipped slowly towards the look until a few drops leave its far rim (ыс), held, and righted. For the fire
  // they are set down on it (the pinch's path, yard/offer.js) and it answers; for the earth they fall from the rim;
  // for the sky the cup is raised and they rise a hand's breadth before falling. Never a throw.
  async drops(to) {
    const g = this.game, cam = g.engine.camera, P = this.parts, kl = P.kymys, hero = P.hero;
    const dir = cam.getWorldDirection(new THREE.Vector3()), flat = V(dir.x, 0, dir.z).normalize();
    const axis = new THREE.Vector3().crossVectors(Y, flat).normalize();
    const { lean, lift } = { fire: { lean: 0.45, lift: 0 }, earth: { lean: 0.6, lift: -0.04 }, sky: { lean: 0.35, lift: 0.09 } }[to];
    let k = 0;
    const set = (e) => { this.tilt.setFromAxisAngle(axis, lean * e); this.off.set(0, lift * e, -0.05 * e); };
    await this.until((dt) => { k = Math.min(1, k + dt / 0.7); set(ease(k)); return k >= 1; });
    const lip = flat.clone().multiplyScalar(kl.rTop).addScaledVector(Y, kl.top).applyQuaternion(this.tilt).add(hero.position);
    kl.vol *= 0.985;
    g.audio?.play('pour', hero.position);
    if (to === 'fire') { await P.offer(lip, 3); P.flare(g); }
    else {
      P.sprinkle(lip, to === 'sky' ? flat.clone().multiplyScalar(0.12).addScaledVector(Y, 1.5) : flat.clone().multiplyScalar(0.2).addScaledVector(Y, -0.05), 6);
      await this.until(((t) => (dt) => (t += dt) > 0.6)(0));
    }
    await this.until((dt) => { k = Math.max(0, k - dt / 0.6); set(ease(k)); return k <= 0; });
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
    this.milk = 1;
    this.offerAct = { id: 'milk', label: L('Эбэҕэ үүт кут', 'Pour milk for the lake', 'Налить озеру молока'), run: () => this.offer() };
  }
  idleAct() { return null; }
  actFor(it) {
    if (it.offering) return this.held ? this.backAct : this.hands.held || this.milk <= 0 || this.busy ? null : this.offerAct;
    return undefined;
  }
  // One tap, the whole offering: the cup is carried from its stone out over the water, tipped until the milk is
  // poured, and set back on the stone.
  async offer() {
    const g = this.game, t = this.thing, h = this.hands, terrain = g.world.terrain, home = t.home.p;
    if (this.busy || h.held || this.milk <= 0) return;
    let w = null;
    for (let r = 0.6; r < 3 && !w; r += 0.3) for (let a = 0; a < 6.28; a += 0.4) { // the nearest open water, seen from the player's side
      const x = home.x + Math.cos(a) * r, z = home.z + Math.sin(a) * r, gy = terrain.height(x, z), wy = terrain.water(x, z, gy);
      if (wy !== null && wy - gy > 0.08) { w = V(x, wy, z); break; }
    }
    if (!w) return;
    this.busy = true; t.it.off = true;
    const yaw = Math.atan2(w.x - home.x, w.z - home.z) + Math.PI, up = new THREE.Quaternion().setFromAxisAngle(Y, yaw); // the far rim (−z) towards the water
    g.audio?.play('wood-take', home);
    await h.fly(t, w.clone().add(V(0, 0.32, 0)).lerp(home, 0.25), up, 1.1);
    const P = this.parts, cup = P.cup;
    let rings = 9, sounded = false, tip = 0;
    await this.until((dt) => {
      const on = this.milk > 0;
      tip = clamp(tip + (on ? dt / 0.7 : -dt / 0.5), 0, 1);
      cup.quaternion.copy(up).multiply(_q.setFromAxisAngle(X, -1.25 * ease(tip)));
      const flowing = tip > 0.8 && this.milk > 0;
      if (flowing) {
        this.milk = Math.max(0, this.milk - dt / 2.2);
        P.milkTop.scale.setScalar(0.45 + 0.55 * this.milk); P.milkTop.visible = this.milk > 0;
        if (!sounded) { sounded = true; g.audio?.play('pour', w); }
        const lip = _v.set(0, 0.1, -0.066).applyQuaternion(cup.quaternion).add(cup.position), local = P.group.worldToLocal(lip.clone());
        P.stream.position.copy(local); P.stream.scale.set(1, Math.max(0.05, local.y - P.waterY), 1);
        if ((rings += dt) > 0.9) { rings = 0; P.rippleT.value = 0; P.ripple.position.set(local.x, P.waterY + 0.012, local.z); }
      }
      P.stream.visible = flowing;
      return tip <= 0 && !on;
    });
    await h.fly(t, home, t.home.q, 1.0);
    g.audio?.play('wood-lay-2', home);
    t.it.off = false; t.obj.userData.sphere = undefined;
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
