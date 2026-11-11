// The player's hands on what is carried or worked with. A thing says where it is held: `userData.grips` =
// [{ hand: 'R' | 'L', p: [x, y, z], axis: [x, y, z], r, out?: [x, y, z], elbow?: [x, y, z] }] in its own frame:
// `p` a point on the handle's axis, `axis` along the handle towards the thumb, `r` the handle's radius (from 5 cm
// an open, cupping hand), `out` the side the wrist leaves on (else: towards the elbow; `over`: that side in camera space, the hand lying on top), `elbow` the elbow in
// camera space (else by the ribs). Hands follow the thing carried (src/interact/hands.js) and any other thing
// with grips while its `userData.inHands` is set (a tool the work itself moves; the player is drawn to its
// `userData.stand` = { of: Object3D, x, z, low? }, the worker's place in that object's frame, `low` kneeling). A hand comes up from below the
// view to its grip and sinks back; the forearm (a mesh of its own) is turned from the wrist towards the elbow.
// Meshes: src/models/chores/arms.js.
import * as THREE from 'three/webgpu';
import { damp, ease } from '../util.js';

const ELBOW = { R: [0.36, -0.66, 0.2], L: [-0.36, -0.66, 0.2] };
const REACH = 1.3, NEAR = 0.36; // m from the eye
const REST = { R: [0.3, -0.7, -0.22], L: [-0.3, -0.7, -0.22] }; // where a free hand waits, below the view
const _p = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3(), _e = new THREE.Vector3(), _w = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3();

export class Arms {
  constructor(game, parts, hands) {
    this.game = game; this.hands = hands; this.mats = parts.mats || []; this.sky = 1;
    const scene = game.engine.scene;
    this.side = {};
    for (const s of ['R', 'L']) {
      const P = parts[s];
      for (const o of [P.fist, P.cup, P.forearm]) { scene.attach(o); o.visible = false; o.matrixAutoUpdate = true; }
      this.side[s] = { ...P, k: 0, on: null, p: new THREE.Vector3(), q: new THREE.Quaternion(), shown: null };
    }
    // the fires that can light them
    this.lights = parts.lights || []; this.fires = [];
    scene.traverse((o) => { if (o.isPointLight) this.fires.push(o); });
    // tools the work moves by itself
    this.tools = [];
    for (const pl of game.world.placed) pl.object.traverse((o) => { if (o.userData.grips) this.tools.push(o); });
    scene.traverse((o) => { if (o.userData.grips && !this.tools.includes(o)) this.tools.push(o); });
  }

  // the grip each hand should be on now: { obj, g } or null
  want(s) {
    const h = this.hands.held;
    if (h && h.blend > 0.35) {
      // an armful: the left hand lies over its top billet, in view; the right arm carries from below
      const top = this.hands.more[this.hands.more.length - 1], over = s === 'L' && top?.obj.userData.grips?.find((g) => g.over);
      if (over) return { obj: top.obj, g: over };
      const g = h.obj.userData.grips?.find((g) => g.hand === s);
      if (g) return _w.fromArray(g.p).applyMatrix4(h.obj.matrixWorld).distanceTo(this.game.engine.camera.position) < NEAR ? null : { obj: h.obj, g }; // at the face: no hand before the eye
      // the far end of an armful rests on the other arm
      const m = this.hands.more[this.hands.more.length - 1], g2 = m?.obj.userData.grips?.find((g) => g.hand === s);
      if (g2) return { obj: m.obj, g: g2 };
    }
    // a tool the work moves: only within the arm's reach
    const cam = this.game.engine.camera;
    for (const o of this.tools) if (o.userData.inHands && o.visible) {
      const g = o.userData.grips.find((g) => g.hand === s);
      if (g && _w.fromArray(g.p).applyMatrix4(o.matrixWorld).distanceTo(cam.position) < REACH) return { obj: o, g };
    }
    return null;
  }

  update(dt) {
    const cam = this.game.stage?.body || this.game.engine.camera;
    const away = !!this.game.stage?.body; // the view is away at a thing: no arms hang in it
    // the worker steps up to a tool the work moves
    if (!away) for (const o of this.tools) {
      const st = o.userData.stand;
      if (!st || !o.userData.inHands) continue;
      const pl = this.game.player.pos, k = 1 - Math.exp(-6 * dt);
      if (st.low) this.game.player.kneel = 0.5; // work at the ground: down on the knees
      st.of.localToWorld(_w.set(st.x, 0, st.z));
      if (Math.hypot(_w.x - pl.x, _w.z - pl.z) > 0.04) { pl.x += (_w.x - pl.x) * k; pl.z += (_w.z - pl.z) * k; }
      break;
    }
    // indoors (a house has raised the exposure) the sky lights them only a little
    this.sky = damp(this.sky, this.game.engine.exposureTarget > 0.7 ? 0.03 : 1, 4, dt);
    for (const m of this.mats) m.envMapIntensity = this.sky;
    // the two fires that give the eye most light
    let a = null, b = null, ka = 0, kb = 0;
    for (const f of this.fires) {
      const d = _w.setFromMatrixPosition(f.matrixWorld).distanceTo(cam.position);
      if (f.distance && d > f.distance) continue;
      f.userData.eyeK = Math.min(1, (d / 1.2) ** 2); // a light that travels with the eye would burn them out
      const k = f.intensity * f.userData.eyeK / Math.max(0.25, d) ** (f.decay || 1);
      if (k > ka) { b = a; kb = ka; a = f; ka = k; } else if (k > kb) { b = f; kb = k; }
    }
    [a, b].forEach((f, i) => {
      const l = this.lights[i]; if (!l) return;
      if (!f) { l.intensity = 0; return; }
      l.color.copy(f.color); l.intensity = f.intensity * f.userData.eyeK * 0.6; l.matrixWorld.copy(f.matrixWorld); l.distance = f.distance; l.decay = f.decay;
    });
    for (const s of ['R', 'L']) {
      const S = this.side[s], w = away ? null : this.want(s);
      if (w) S.on = w;
      S.k = damp(S.k, w ? 1 : 0, w ? 11 : 9, dt);
      if (!w && S.k < 0.02) { S.k = 0; S.on = null; }
      const hand = S.on ? (S.on.g.r >= 0.05 ? S.cup : S.fist) : null;
      if (S.shown && S.shown !== hand) S.shown.visible = false;
      S.shown = hand; S.forearm.visible = !!hand;
      if (!hand) continue;
      hand.visible = true;
      const { obj, g } = S.on;
      // the elbow and the rest point, in the world
      _e.fromArray(g.elbow || ELBOW[s]).applyQuaternion(cam.quaternion).add(cam.position);
      // the grip frame: Y along the handle, Z from the handle to the wrist, X = Y × Z (the palm's side for a right hand)
      obj.updateWorldMatrix(true, false);
      _p.fromArray(g.p).applyMatrix4(obj.matrixWorld);
      _y.fromArray(g.axis).transformDirection(obj.matrixWorld);
      if (g.out) _z.fromArray(g.out).transformDirection(obj.matrixWorld); else if (g.over) _z.fromArray(g.over).applyQuaternion(cam.quaternion); else _z.copy(_e).sub(_p);
      _z.addScaledVector(_y, -_z.dot(_y));
      if (_z.lengthSq() < 1e-4) _z.set(0, 1, 0).applyQuaternion(cam.quaternion).addScaledVector(_y, -_y.y);
      _z.normalize(); _x.crossVectors(_y, _z);
      _q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
      // coming up from below the view / sinking back
      const e = ease(S.k);
      if (e < 1) {
        _w.fromArray(REST[s]).applyQuaternion(cam.quaternion).add(cam.position);
        _p.lerpVectors(_w, _p, e);
      }
      hand.position.copy(_p); hand.quaternion.copy(_q);
      hand.updateMatrixWorld(true);
      // the forearm: from the wrist towards the elbow, its flat side with the back of the hand
      _w.copy(hand.userData.wrist).applyMatrix4(hand.matrixWorld);
      _z.copy(_e).sub(_w).normalize();
      _up.copy(_y).addScaledVector(_z, -_y.dot(_z));
      if (_up.lengthSq() < 1e-4) _up.set(0, 1, 0); _up.normalize();
      _x.crossVectors(_up, _z);
      S.forearm.position.copy(_w); S.forearm.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _up, _z));
    }
  }
}
