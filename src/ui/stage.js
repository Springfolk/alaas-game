// The inspect stage: the view leaves the body and goes to the thing itself, in the live world (docs/ui.md).
// Nothing is built for it: it moves the game's own camera (position, aim, field of view), so no shader, target
// or mesh is new. A small thing: the view glides up to it along the line it was seen on; a house, a tree or a
// place: a cut (through a short dip) to a framed view from outside; inside a shell: the view stays and looks
// round. Opened from the journal, the view goes to the thing wherever it stands. The player turns the thing by
// dragging (an orbit round it). `VIEWS` (src/data/views.json; directions baked by tools/bake-journal.mjs) says
// which thing shows an entry and from where.
import * as THREE from 'three/webgpu';
import VIEWS from '../data/views.json';
import { clamp, ease } from '../util.js';

const D2R = Math.PI / 180;
const SMALL = 1.5; // m: a thing of at most this radius is gone up to; a bigger one is framed from outside
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _box = new THREE.Box3();
const UP = new THREE.Vector3(0, 1, 0);

// The things an entry is shown by: its interactables with a place, the summer homestead first.
export function thingsOf(world, id) {
  return world.interactables.filter((i) => i.entry === id && (i.target || i.zone) && !i.gap && !i.rack && !i.block);
}
// The one a view names (`it`: an index, or a piece of its English label), else the first.
export function pickThing(world, id, v = VIEWS[id]) {
  const list = thingsOf(world, v?.as || id), sel = v?.it;
  if (typeof sel === 'string') return list.find((i) => i.label?.en.includes(sel)) || list[0] || null;
  return list[sel || 0] || null;
}
// Centre and radius of a thing (a zone: the spot at chest height).
export function boundsOf(world, it) {
  if (!it.target) { const z = it.zone; return { c: new THREE.Vector3(z.x, world.groundAt(z.x, z.z) + 1.2, z.z), r: z.r, box: null }; }
  const box = _box.setFromObject(it.target).clone(), s = box.getSize(_v);
  return { c: box.getCenter(new THREE.Vector3()), r: Math.max(0.09, s.length() * 0.41), box };
}
const dirOf = (yaw, el, out) => out.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)); // from the thing to the eye

export class Stage {
  constructor(game) {
    this.game = game;
    this.cam = game.engine.camera;
    this.on = false;
    this.body = null; // where the body's eye is while the view is away (src/interact/hands.js holds things there)
    this.s = null;
    this.area = { x: 0, y: 0, w: 1, h: 1 }; // where on screen the thing sits (NDC centre, share of the screen): ui.js sets it
    this.ax = 0; this.ay = 0;
    this.pos = new THREE.Vector3(); this.quat = new THREE.Quaternion();
    this.dip = document.createElement('div');
    this.dip.id = 'dip';
    document.body.appendChild(this.dip);
  }
  get still() { return !(this.game.player.settings.motion > 0.2) || matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // What kind of show an entry gets here: 'near' | 'out' | 'here' | 'photo'.
  // `it`: the thing the player looks at (in person); without it the entry's own view (from the journal, a link).
  open(id, it = null) {
    const g = this.game, world = g.world, v = VIEWS[id] || {}, cam = this.cam, wasOn = this.on;
    if (!wasOn) this.body = { position: cam.position.clone(), quaternion: cam.quaternion.clone(), aspect: cam.aspect, fov: cam.fov };
    const inPerson = !!it;
    it ||= v.cam || v.photo ? null : pickThing(world, id, v);
    const s = { id, it, t: 0, oy: 0, op: 0, zoom: 1, idle: 0, time: 0, yawMax: 50 * D2R, elMin: 6 * D2R, elMax: 68 * D2R, fov: this.portrait ? 56 : 40 };
    s.from = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov };
    const eye = this.body.position;
    if (!it) {
      if (v.cam) { // a place: a view of its own
        const [x, y, z, yaw = 0, pitch = 0, fov = 50] = v.cam;
        Object.assign(s, { mode: 'here', eye: new THREE.Vector3(x, y, z), yaw: yaw * D2R, el: pitch * D2R, fov: this.portrait ? Math.min(75, fov * 1.45) : fov, cut: true, yawMax: 60 * D2R });
      } else s.mode = 'photo'; // an idea: its photographs carry it, the view stays
    } else {
      const b = boundsOf(world, it);
      s.c = b.c; s.r = b.r;
      const preset = (!inPerson || it === pickThing(world, id, v)) && v.dir;
      const to = _v.copy(eye).sub(b.c), dist = to.length();
      if (inPerson && b.r <= SMALL) { // gone up to, along the line it is seen on
        s.mode = 'near';
        s.yaw = Math.atan2(to.x, to.z); s.el = clamp(Math.asin(clamp(to.y / dist, -1, 1)), 12 * D2R, 62 * D2R);
        s.maxD = Math.max(dist, b.r * 2.2);
      } else if (inPerson && b.box?.clone().expandByScalar(0.3).containsPoint(eye)) { // inside it: look round from here
        Object.assign(s, { mode: 'here', eye: eye.clone(), yaw: g.player.yaw, el: g.player.pitch, fov: this.body.fov, yawMax: Math.PI });
      } else {
        s.mode = b.r <= SMALL ? 'near' : 'out'; s.cut = true;
        if (preset) { s.yaw = preset[0] * D2R; s.el = preset[1] * D2R; s.k = v.dist || 1; if (v.free) s.yawMax = Math.PI; }
        else { s.yaw = Math.atan2(to.x, to.z); s.el = 14 * D2R; }
      }
      if (s.mode === 'out') { s.elMin = 3 * D2R; s.elMax = 55 * D2R; }
    }
    if (wasOn && this.s?.mode !== 'photo') s.cut = s.cut || s.mode !== 'near';
    this.s = s; this.on = true; this.closing = false;
    g.engine.closeLook = s.mode === 'near';
    if (s.mode === 'photo') { s.t = 1; return s.mode; }
    if (s.cut) this.cut(() => { s.t = 1; });
    return s.mode;
  }
  // back to the body; `then` once the view is there
  close(then) {
    const s = this.s;
    if (!this.on) { then?.(); return; }
    const end = () => { this.on = false; this.s = null; this.body = null; this.closing = false; this.game.engine.closeLook = false; this.game.player.update(0); then?.(); };
    if (!s || s.mode === 'photo') { end(); return; }
    if (s.cut || s.mode !== 'near') { this.cut(end); return; }
    this.closing = end; // glides back (update)
  }
  // a cut hidden by a short dip to dark
  cut(fn) {
    clearTimeout(this.cutT);
    this.dip.classList.add('on');
    // the eye adapts to the new place under the dip (the meter reads back every 0.15 s: src/engine/engine.js)
    this.cutT = setTimeout(() => { fn(); this.game.engine.adaptFast = 0.6; this.cutT = setTimeout(() => this.dip.classList.remove('on'), 300); }, 130);
  }
  get portrait() { return innerHeight > innerWidth * 1.05; }

  orbit(dx, dy) { // drag pixels
    const s = this.s;
    if (!s || s.mode === 'photo') return;
    const k = (s.mode === 'here' ? 0.12 : 0.32) * D2R;
    s.oy = clamp(s.oy - dx * k * (s.mode === 'here' ? -1 : 1), -s.yawMax, s.yawMax);
    s.op = clamp(s.op + dy * k * (s.mode === 'here' ? -1 : 1), -80 * D2R, 80 * D2R);
    s.idle = 0;
  }
  zoomBy(d) { const s = this.s; if (s && s.mode !== 'photo') { s.zoom = clamp(s.zoom * (d > 0 ? 1.12 : 0.89), 0.6, 1.7); s.idle = 0; } }

  update(dt) {
    const s = this.s, cam = this.cam;
    if (!this.on || !s || s.mode === 'photo') return;
    s.time += dt; s.idle += dt;
    if (this.closing) { s.t -= dt / 0.32; if (s.t <= 0) { this.closing(); return; } } else if (s.t < 1) s.t = Math.min(1, s.t + dt / 0.55);
    // the thing's place on screen follows the layout (a reading sheet moves it up or aside)
    const a = this.area, k = s.time < 0.05 ? 1 : 1 - Math.exp(-7 * dt);
    this.ax += (a.x - this.ax) * k; this.ay += (a.y - this.ay) * k;
    const fov = s.fov, tv = Math.tan(fov * D2R / 2), aspect = cam.aspect;
    const sway = this.still || s.idle < 1.5 ? 0 : Math.sin((s.idle - 1.5) * 0.35) * Math.min(1, (s.idle - 1.5) / 3) * (s.mode === 'here' ? 2.5 : 7) * D2R; // a slow turn of its own
    if (s.mode === 'here') {
      this.pos.copy(s.eye);
      const el = clamp(s.el + s.op, -80 * D2R, 80 * D2R);
      this.quat.setFromEuler(_e.set(el, s.yaw + s.oy + sway, 0, 'YXZ'));
    } else {
      const el = clamp(s.el + s.op, s.elMin, s.elMax);
      s.op = el - s.el;
      // far enough that it fits its share of the screen
      // (as the card first laid it out; a reading sheet that leaves less room moves it back by half at most)
      const now = Math.min(a.w * aspect, a.h) * tv, fit = (s.fit ||= now) / clamp(s.fit / now, 1, 1.5);
      const D0 = s.r * 1.3 / Math.sin(Math.atan(fit)) * (s.k || 1);
      const D = (s.maxD ? Math.min(D0, s.maxD) : D0) * s.zoom;
      dirOf(s.yaw + s.oy + sway, el, this.pos).multiplyScalar(Math.max(D, s.r + 0.12)).add(s.c);
      const floor = this.game.world.groundAt(this.pos.x, this.pos.z) + 0.25; // never under the ground
      if (s.mode === 'out' && this.pos.y < floor) this.pos.y = floor;
      this.quat.setFromRotationMatrix(_m.lookAt(this.pos, s.c, UP));
      this.quat.multiply(_q.setFromEuler(_e.set(-Math.atan(this.ay * tv), Math.atan(this.ax * tv * aspect), 0, 'YXZ')));
    }
    const e = ease(clamp(s.t, 0, 1));
    cam.position.lerpVectors(s.from.pos, this.pos, e);
    cam.quaternion.slerpQuaternions(s.from.quat, this.quat, e);
    const f = s.from.fov + (fov - s.from.fov) * e;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // a world point on screen (px), or null behind the eye
  project(p, out = {}) {
    const v = _v.copy(p).applyMatrix4(this.cam.matrixWorldInverse);
    if (v.z > -0.05) return null;
    v.applyMatrix4(this.cam.projectionMatrix);
    out.x = (v.x + 1) / 2 * innerWidth; out.y = (1 - v.y) / 2 * innerHeight;
    return out;
  }
  // The named things round the staged one: its own labelled parts, and what the player has found there.
  marks(found) {
    const s = this.s, g = this.game;
    if (!s || s.mode === 'photo' || s.mode === 'out') return []; // (from outside a house the things in it are not in view)
    const out = [], seen = new Set(), at = s.mode === 'here' ? s.eye : s.c, reach = s.mode === 'here' ? 7 : s.r * 1.25 + 0.3;
    for (const o of g.world.interactables) {
      if (o === s.it || !o.target || o.off || !o.entry) continue;
      if (!(o.label && o.entry === s.id) && !found.has(o.entry)) continue;
      if (o.entry === s.id && !o.label) continue;
      const b = boundsOf(g.world, o);
      if (b.c.distanceTo(at) - Math.min(b.r, 1) > reach || (s.mode !== 'here' && b.r > s.r * 1.2)) continue;
      const name = o.label || null, key = name ? name.en : o.entry;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ it: o, entry: o.entry, label: name, p: b.box ? new THREE.Vector3(b.c.x, Math.min(b.box.max.y, b.c.y + 0.5), b.c.z) : b.c, d: b.c.distanceTo(at) });
    }
    return out.sort((x, y) => x.d - y.d).slice(0, 6);
  }
}
export { VIEWS };
