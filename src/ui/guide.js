// The journal's finder: a not-yet-found entry chosen in the journal gets a small marker over the nearest
// place it is found (clamped to the screen edge, with an arrow, when out of view) and a soft shimmer once
// you are close. DOM only (styles in index.html), so it never builds a shader. Entries with no place of
// their own (told of in other cards) point at the nearest card that links to them.
import * as THREE from 'three/webgpu';
import { BY_ID } from './ui.js';

const NEAR = 7; // m: the shimmer shows inside this
const EDGE = 44; // px: the edge marker's inset

export class Guide {
  constructor(game) {
    this.game = game;
    this.id = null;
    this.el = document.createElement('div');
    this.el.id = 'guide';
    this.el.innerHTML = '<i class="pin"></i><i class="arrow"></i><span class="dist"></span>';
    this.glow = document.createElement('div');
    this.glow.id = 'gshimmer';
    document.body.append(this.glow, this.el);
    this.dist = this.el.querySelector('.dist');
    this.v = new THREE.Vector3();
    this.t = 0;
  }

  // every interactable an entry is found at (or, for an entry told of only in cards, at the cards that link to it)
  places(id) {
    const its = this.game.world.interactables.filter((i) => i.entry && (i.target || i.zone));
    const at = (e) => its.filter((i) => i.entry === e);
    let ids = [id];
    const seen = new Set(ids);
    for (let depth = 0; depth < 3; depth++) {
      const hit = ids.flatMap(at);
      if (hit.length) return hit.map((i) => this.pos(i));
      ids = Object.values(BY_ID).filter((e) => !seen.has(e.id) && e.related?.some((r) => ids.includes(r))).map((e) => e.id);
      ids.forEach((e) => seen.add(e));
    }
    return [];
  }
  pos(it) {
    if (it.zone) return new THREE.Vector3(it.zone.x, this.game.world.terrain.height(it.zone.x, it.zone.z) + 1, it.zone.z);
    return new THREE.Box3().setFromObject(it.target).getCenter(new THREE.Vector3());
  }

  // choose (or, with the same id, drop) the entry to be guided to
  set(id) {
    this.id = id && id !== this.id ? id : null;
    this.targets = this.id ? this.places(this.id) : [];
    this.target = null; this.t = 0;
    if (!this.targets.length) this.id = null;
    this.update();
    return this.id;
  }

  update(dt = 0) {
    const g = this.game, show = this.id && !g.title && !g.ui.modal && !g.paused;
    this.el.classList.toggle('on', !!show);
    if (!show) { this.glow.classList.remove('on'); return; }
    const p = g.player.pos, cam = g.engine.camera;
    if ((this.t -= dt) <= 0 || !this.target) { // the nearest of its places, re-chosen now and then
      this.t = 0.5;
      this.target = this.targets.reduce((a, b) => (a && a.distanceToSquared(p) < b.distanceToSquared(p) ? a : b), null);
    }
    const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    this.dist.textContent = d < 10 ? `${d.toFixed(1)} m` : `${Math.round(d)} m`;
    // camera space: in front when z < 0
    const v = this.v.copy(this.target).applyMatrix4(cam.matrixWorldInverse);
    const W = innerWidth, H = innerHeight;
    let x, y, inView = false;
    if (v.z < -0.1) {
      v.applyMatrix4(cam.projectionMatrix);
      x = (v.x + 1) / 2 * W; y = (1 - v.y) / 2 * H;
      inView = x > EDGE && x < W - EDGE && y > EDGE && y < H - EDGE;
    }
    let ang = 0;
    if (!inView) { // to the screen edge, along the direction to the target
      const dx = v.z < -0.1 ? x - W / 2 : v.x, dy = v.z < -0.1 ? y - H / 2 : -v.y || 0.001;
      const ex = W / 2 - EDGE, ey = H / 2 - EDGE, k = Math.min(ex / Math.abs(dx || 1e-6), ey / Math.abs(dy || 1e-6));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
      ang = Math.atan2(dy, dx);
    }
    this.el.classList.toggle('edge', !inView);
    this.el.style.transform = `translate(${x}px,${y}px)`;
    this.el.style.setProperty('--a', `${ang}rad`);
    const near = inView && d < NEAR;
    this.glow.classList.toggle('on', near);
    if (near) {
      const s = Math.min(3, 2.2 / Math.max(0.6, d));
      this.glow.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      this.glow.style.opacity = Math.min(1, (NEAR - d) / 2.5);
    }
  }
}
