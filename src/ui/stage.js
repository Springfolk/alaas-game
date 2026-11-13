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
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _box = new THREE.Box3();
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
const PAD = 0.16; // m: the eye keeps this far from a wall
// Is the point within `pad` of the wall collider `k` ({ x, z, hw, hd, c, s, y0?, y1? }: src/world/world.js)?
function inWall(k, x, y, z, pad) {
  if (k.y0 !== undefined && (y < k.y0 || y > k.y1)) return false;
  const ox = x - k.x, oz = z - k.z;
  return Math.abs(ox * k.c - oz * k.s) < k.hw + pad && Math.abs(ox * k.s + oz * k.c) < k.hd + pad;
}
// How far from `c` along the unit `dir` the eye may go, up to D, before it comes to a wall.
// … or before it leaves the room `room` (hints.js `ROOMS`: walls, cover, ceiling) the thing stands in
function reachRoom(room, c, dir, D) {
  for (let t = 0.1; t < D; t += 0.1) if (!room.free(_w.set(c.x + dir.x * t, c.y + dir.y * t, c.z + dir.z * t))) return Math.max(0.1, t - 0.1);
  return D;
}
function reach(walls, c, dir, D) {
  for (let t = 0.1; t < D; t += 0.1) {
    const x = c.x + dir.x * t, y = c.y + dir.y * t, z = c.z + dir.z * t;
    for (const k of walls) if (inWall(k, x, y, z, PAD)) return t - 0.1;
  }
  return D;
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
    // over the head with a view of its own (the swallows' nests on the beams): that fixed view, not a glide among the rafters
    if (it?.target && v.cam && boundsOf(world, it).c.y > this.body.position.y + 0.2) it = null;
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
        // (a thing above the eye, on a beam or a shelf: seen from below, never from inside the roof over it)
        const up = b.c.y > eye.y + 0.2;
        s.yaw = Math.atan2(to.x, to.z); s.el = clamp(Math.asin(clamp(to.y / dist, -1, 1)), up ? -50 * D2R : 12 * D2R, up ? -8 * D2R : 62 * D2R);
        s.maxD = Math.max(dist, b.r * 2.2); if (up) s.yawMax = 30 * D2R; // (against a wall: turned no further than it can be seen from inside)
      } else if (inPerson && b.box?.clone().expandByScalar(0.3).containsPoint(eye)) { // inside it: look round from here
        Object.assign(s, { mode: 'here', eye: eye.clone(), yaw: g.player.yaw, el: g.player.pitch, fov: this.body.fov, yawMax: Math.PI });
      } else {
        s.mode = b.r <= SMALL ? 'near' : 'out'; s.cut = true;
        if (preset) { s.yaw = preset[0] * D2R; s.el = preset[1] * D2R; s.k = v.dist || 1; if (v.free) s.yawMax = Math.PI; }
        else { s.yaw = Math.atan2(to.x, to.z); s.el = 14 * D2R; }
      }
      if (s.mode === 'out') { s.elMin = 3 * D2R; s.elMax = 55 * D2R; world.optimized?.hold(b.box || new THREE.Box3().setFromCenterAndSize(b.c, new THREE.Vector3().setScalar(b.r * 2))); } // seen from above: the house itself, not its impostor
      if (s.el < 0) { s.elMin = s.el - 25 * D2R; s.elMax = 0; } // seen from below: it turns under, never over into the roof
    }
    // a small thing indoors: the walls the eye must stay within (thin long colliders; not one the thing itself is on)
    if (s.mode === 'near') s.walls = world.colliders.filter((k) => k.kind === 'box' && Math.min(k.hw, k.hd) <= 0.2 && Math.max(k.hw, k.hd) >= 0.5
      && Math.hypot(k.x - s.c.x, k.z - s.c.z) < 12 && !inWall(k, s.c.x, s.c.y, s.c.z, s.r + PAD));
    if (s.mode === 'near' || s.mode === 'out') s.room = g.hints?.rooms.find((r) => r.in(s.c) && r.free(s.c)) || null; // a thing indoors: the eye stays in its room
    if (wasOn && this.s?.mode !== 'photo') s.cut = s.cut || s.mode !== 'near';
    this.s = s; this.on = true; this.closing = false;
    g.engine.closeLook = s.mode === 'near';
    if (s.mode === 'photo') { s.t = 1; return s.mode; }
    if (s.cut) { s.hold = true; this.cut(() => { s.t = 1; s.hold = false; }); } // (the view stays put until the dip hides the cut)
    return s.mode;
  }
  // A framed work view (src/interact/framed.js): the view glides from where it is to `v` = { c (what is watched),
  // r (m it must show round c), yaw (rad, from c to the eye), el (rad), fov (°) }; `v.c` may move (the view
  // follows it, eased). Never through a wall, never under the ground.
  work(v) {
    const cam = this.cam, wasOn = this.on;
    if (!wasOn) this.body = { position: cam.position.clone(), quaternion: cam.quaternion.clone(), aspect: cam.aspect, fov: cam.fov };
    const c = v.c.clone();
    const s = { mode: 'work', v, c, r: v.r, t: 0, oy: 0, op: 0, zoom: 1, idle: 0, time: 0, from: { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov } };
    s.walls = this.game.world.colliders.filter((k) => k.kind === 'box' && Math.min(k.hw, k.hd) <= 0.2 && Math.max(k.hw, k.hd) >= 0.5
      && Math.hypot(k.x - c.x, k.z - c.z) < 12 && !inWall(k, c.x, c.y, c.z, 0.3 + PAD));
    this.s = s; this.on = true; this.closing = false;
    return s;
  }
  // back to the body; `then` once the view is there
  close(then) {
    const s = this.s;
    if (!this.on) { then?.(); return; }
    const end = () => { this.game.world.optimized?.hold(null); this.on = false; this.s = null; this.body = null; this.closing = false; this.game.engine.closeLook = false; this.game.player.update(0); then?.(); };
    if (!s || s.mode === 'photo') { end(); return; }
    if (s.cut || (s.mode !== 'near' && s.mode !== 'work')) { this.cut(end); return; }
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
    if (Math.abs(dx) > 2) this.game.teach?.note('turn');
  }
  zoomBy(d) { const s = this.s; if (s && s.mode !== 'photo') { s.zoom = clamp(s.zoom * (d > 0 ? 1.12 : 0.89), 0.6, 1.7); s.idle = 0; } }

  update(dt) {
    const s = this.s, cam = this.cam;
    if (!this.on || !s || s.mode === 'photo') return;
    s.time += dt; s.idle += dt;
    // the glide's own step: a long frame (a hitch as the card first draws) slows it rather than skipping it
    const step = Math.min(dt, 1 / 30);
    if (this.closing) { s.t -= step / 0.32; if (s.t <= 0) { this.closing(); return; } } else if (s.t < 1 && !s.hold) s.t = Math.min(1, s.t + step / 0.55);
    // the thing's place on screen follows the layout (a reading sheet moves it up or aside)
    const a = this.area, k = s.time < 0.05 ? 1 : 1 - Math.exp(-7 * dt);
    this.ax += (a.x - this.ax) * k; this.ay += (a.y - this.ay) * k;
    const f0 = s.fov, tv = Math.tan(f0 * D2R / 2), aspect = cam.aspect;
    const sway = this.still || s.idle < 1.5 ? 0 : Math.sin((s.idle - 1.5) * 0.35) * Math.min(1, (s.idle - 1.5) / 3) * (s.mode === 'here' ? 2.5 : 7) * D2R; // a slow turn of its own
    if (s.mode === 'work') this.workView(s, dt);
    else if (s.mode === 'here') {
      this.pos.copy(s.eye);
      const el = clamp(s.el + s.op, -80 * D2R, 80 * D2R);
      this.quat.setFromEuler(_e.set(el, s.yaw + s.oy + sway, 0, 'YXZ'));
      if (s.cut) this.quat.multiply(_q.setFromEuler(_e.set(-Math.atan(this.ay * tv), Math.atan(this.ax * tv * aspect), 0, 'YXZ'))); // a view of its own: what it aims at sits in the part the type leaves free
    } else {
      const el = clamp(s.el + s.op, s.elMin, s.elMax);
      s.op = el - s.el;
      // far enough that it fits its share of the screen
      // (as the card first laid it out; a reading sheet that leaves less room moves it back by half at most)
      const now = Math.min(a.w * aspect, a.h) * tv, fit = (s.fit ||= now) / clamp(s.fit / now, 1, 1.5);
      const D0 = s.r * 1.3 / Math.sin(Math.atan(fit)) * (s.k || 1);
      const D = (s.maxD ? Math.min(D0, s.maxD) : D0) * s.zoom;
      dirOf(s.yaw + s.oy + sway, el, this.pos);
      // not through a wall: the eye stops short of it (at once), and goes back out as the way clears (eased)
      let free = s.walls?.length ? reach(s.walls, s.c, this.pos, D) : D;
      if (s.room) free = reachRoom(s.room, s.c, this.pos, free);
      s.d = s.d === undefined || free < s.d ? free : s.d + (free - s.d) * (1 - Math.exp(-6 * dt));
      this.pos.multiplyScalar(Math.max(s.d, s.r + 0.12)).add(s.c);
      const floor = this.game.world.groundAt(this.pos.x, this.pos.z) + (s.mode === 'out' ? 0.25 : 0.08); // never under the ground
      if (this.pos.y < floor) this.pos.y = floor;
      this.quat.setFromRotationMatrix(_m.lookAt(this.pos, s.c, UP));
      this.quat.multiply(_q.setFromEuler(_e.set(-Math.atan(this.ay * tv), Math.atan(this.ax * tv * aspect), 0, 'YXZ')));
    }
    const e = ease(clamp(s.t, 0, 1)), fov = s.mode === 'work' ? s.fov : f0;
    cam.position.lerpVectors(s.from.pos, this.pos, e);
    cam.quaternion.slerpQuaternions(s.from.quat, this.quat, e);
    const f = s.from.fov + (fov - s.from.fov) * e;
    if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // the framed work view: `v.r` round the watched point fits the narrower side of the screen, the eye along (yaw, el) from it
  workView(s, dt) {
    const v = s.v, cam = this.cam;
    const k = s.time < 0.05 ? 1 : 1 - Math.exp(-3.5 * dt); // a new aim: the view moves on, eased
    s.c.lerp(v.c, k);
    s.yaw = s.yaw === undefined ? v.yaw : s.yaw + Math.atan2(Math.sin(v.yaw - s.yaw), Math.cos(v.yaw - s.yaw)) * k;
    s.el = s.el === undefined ? v.el : s.el + (v.el - s.el) * k;
    s.r += (v.r - s.r) * k;
    const portrait = this.portrait; // a phone upright: as near as on a wide screen, `r` a little cropped at the sides, more above and below
    s.fov = v.fov * (portrait ? 1.45 : 1);
    const tv = Math.tan(s.fov * D2R / 2), fit = Math.min(cam.aspect, 1) * tv;
    const D = s.r * (portrait ? 0.75 : 1) / Math.sin(Math.atan(fit));
    dirOf(s.yaw, s.el, this.pos);
    const free = s.walls.length ? reach(s.walls, s.c, this.pos, D) : D;
    s.d = s.d === undefined || free < s.d ? free : s.d + (free - s.d) * (1 - Math.exp(-6 * dt));
    this.pos.multiplyScalar(Math.max(s.d, 0.3)).add(s.c);
    const floor = this.game.world.groundAt(this.pos.x, this.pos.z) + 0.25;
    if (this.pos.y < floor) this.pos.y = floor;
    this.quat.setFromRotationMatrix(_m.lookAt(this.pos, s.c, UP));
    if (v.lift) this.quat.multiply(_q.setFromEuler(_e.set(v.lift * tv, 0, 0))); // the watched point lower on screen
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
