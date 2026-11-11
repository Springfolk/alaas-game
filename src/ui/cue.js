// The next thing to do, shown (docs/interactions.md "Cues"): while a job is under way or something is carried, the
// thing the hands should go to next glints (`#cue`: a green star on it, or an arrow at the screen's edge when it
// is out of view), and where a carried thing belongs stands there as a pale ghost of itself (the fish trap in the
// weir's gap, the bark on its hide). No sentence says it. One table of rules here (`next`), read from the jobs'
// own state. The marker is DOM; the ghosts are meshes made before the warm-up (shared geometry, one material),
// only shown and hidden in play.
import * as THREE from 'three/webgpu';
import { uniform } from 'three/tsl';
import { LAKE } from '../world/terrain.js';

const EDGE = 46; // px: the edge arrow's inset
const _v = new THREE.Vector3(), _b = new THREE.Box3(), _m = new THREE.Matrix4();

export class Cues {
  constructor(game) {
    this.game = game;
    const its = game.world.interactables, jobs = game.work?.jobs || [];
    this.hands = game.interact.hands;
    this.split = jobs.find((j) => j.axe); this.fish = jobs.find((j) => j.trap); this.hay = jobs.find((j) => j.scythe); this.tuos = jobs.find((j) => j.rest && j.thing);
    this.fires = its.filter((i) => i.fireplace);
    this.heap = its.find((i) => i.rounds); this.tymtay = its.find((i) => i.tymtay); this.stone = its.find((i) => i.offering);
    this.blank = its.find((i) => i.target?.userData.forge); this.forge = its.find((i) => i.act?.id === 'bellows');
    this.patches = its.filter((i) => i.berries !== undefined);
    this.el = document.createElement('div');
    this.el.id = 'cue';
    this.el.innerHTML = '<i class="c-ring"></i><i class="c-star"></i><i class="c-arrow"></i>';
    document.body.appendChild(this.el);
    this.at = new THREE.Vector3(); this.cur = null; this.t = 0;
    // ghosts: the carried thing where it belongs
    this.op = uniform(0.3);
    const mat = this.mat = new THREE.MeshBasicNodeMaterial({ name: 'ghost', color: 0xd8ffc8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    mat.opacityNode = this.op;
    this.ghosts = {};
    const F = this.fish, T = this.tuos;
    if (F) {
      const q = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0))); // as Fish.setAct lays it: its length across the gap
      this.ghost('trap', F.trap.obj, F.gap.clone().add(new THREE.Vector3(0.5, 0, 0)), q);
    }
    if (T) this.ghost('bark', T.thing.obj, T.rest.p, T.rest.q);
    this.shown = null;
  }
  // a pale copy of `src` (its meshes' own geometry) standing at p, q
  ghost(name, src, p, q) {
    const g = new THREE.Group();
    src.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    src.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const m = o.isInstancedMesh ? new THREE.InstancedMesh(o.geometry, this.mat, o.count) : new THREE.Mesh(o.geometry, this.mat);
      if (o.isInstancedMesh) m.instanceMatrix = o.instanceMatrix;
      m.matrixAutoUpdate = false;
      m.matrix.multiplyMatrices(inv, o.matrixWorld);
      m.castShadow = m.receiveShadow = false;
      m.renderOrder = 9;
      g.add(m);
    });
    g.position.copy(p); g.quaternion.copy(q);
    g.visible = false;
    g.userData.dynamic = true;
    this.game.engine.scene.add(g);
    this.ghosts[name] = g;
  }

  centre(it) { return _b.setFromObject(it.target).getCenter(new THREE.Vector3()); }
  nearest(list, pos = (x) => x) {
    const P = this.game.player.pos;
    let best = null, bd = Infinity;
    for (const x of list) { const p = pos(x); if (!p) continue; const d = p.distanceToSquared(P); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  fire() { return this.nearest(this.fires, (i) => i.fireplace.pos?.() || this.centre(i)); }
  // the lake's edge on the way from `from` to its middle
  shore(from) {
    const terrain = this.game.world.terrain, dx = LAKE.x - from.x, dz = LAKE.z - from.z, d = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < d; s += 1.5) {
      const x = from.x + dx / d * s, z = from.z + dz / d * s, gy = terrain.height(x, z), wy = terrain.water(x, z, gy);
      if (wy !== null && wy - gy > 0.08) return new THREE.Vector3(x, wy, z);
    }
    return new THREE.Vector3(LAKE.x, LAKE.level, LAKE.z);
  }

  // What the hands should go to next: { at: world point, ghost?: name } or null. The rules, job by job.
  next() {
    const g = this.game, h = this.hands, held = h?.held, P = g.player.pos;
    if (!h || g.acting || g.interact.seat.on || g.choosing) return null;
    for (const r of g.interact.rites) {
      if (!r.held) continue;
      if (r.fillAct) return { at: this.fire() }; // the guest's choron: the first drops are the fire's
      if (r.pourAct) return r.milk > 0 ? { at: this.shore(this.centre(this.stone)) } : null; // the lake's milk: to the water
      return null;
    }
    const S = this.split;
    if (S && !S.sw) {
      const c = S.onBlock;
      if (S.axeHeld) {
        if (c) { if (c.state === 'block') return { at: _v.copy(c.pos).setY(c.pos.y + 0.5).clone() }; } else {
          const rest = this.nearest(S.chunks.filter((x) => x.state === 'rest'), (x) => x.pos);
          if (rest) return { at: rest.clone().setY(rest.y + 0.15) }; // a half lies there: back onto the block
          if (S.freeRound() !== undefined) return { at: this.centre(this.heap) };
          const loose = this.nearest(S.pieces.filter((p) => p.state === 'ground'), (p) => p.obj.position); // every round is in billets: carry them off
          if (loose) return { at: loose.clone() };
        }
      } else if (!held && P.distanceTo(S.block) < 8) {
        if (c?.state === 'block') return { at: this.centre(S.axe.it) }; // a round stands ready: the axe
        const rest = !c && this.nearest(S.chunks.filter((x) => x.state === 'rest'), (x) => x.pos);
        if (rest) return { at: rest.clone().setY(rest.y + 0.15) };
      }
    }
    const F = this.fish;
    if (F && !F.busy) {
      if (F.held) return F.n > 0 ? { at: this.centre(this.tymtay) } : { at: this.ghosts.trap.position, ghost: 'trap' };
      if (F.state === 'set' && F.n >= 3 && !held && P.distanceTo(F.trap.obj.position) < 45) return { at: F.trap.obj.position.clone().setY(F.trap.obj.position.y + 0.2) };
    }
    const H = this.hay;
    if (H?.held && !H.sw) {
      const mask = H.mask;
      if (mask?.tall && !mask.tall(P.x, P.z)) return { at: this.meadow(H, mask) };
      return null;
    }
    const T = this.tuos;
    if (T && !T.busy) {
      if (T.held && !T.made) return T.warm > 0 ? { at: T.rest.p, ghost: 'bark' } : { at: this.fire() };
      if (T.held && T.made) { // a тордуйа in the hands: berries
        const full = this.nearest(this.patches.filter((i) => (g.interact.patches.get(i.berries)?.n ?? 1) > 0), (i) => this.centre(i));
        return full && full.distanceTo(P) < 80 ? { at: full } : null;
      }
      if (!held && !T.made && T.onHide && T.warm > 0 && P.distanceTo(T.rest.p) < 20) return { at: T.rest.p };
    }
    const W = this.blank?.target.userData.forge;
    if (W && W.at !== 'rest' && !held && this.forge && P.distanceTo(this.centre(this.forge)) < 14) {
      if (W.fly || W.busy || W.at === 'tub') return null;
      return { at: this.blank.live() ? this.blank.target.getWorldPosition(new THREE.Vector3()) : this.centre(this.forge) }; // the iron when it is ready for the hands, else the bellows
    }
    if (held?.kind === 'log') {
      const pile = h.pile.getWorldPosition(new THREE.Vector3()), fire = this.fire();
      return { at: fire && fire.distanceTo(P) < pile.distanceTo(P) ? fire : pile.setY(pile.y + 0.5) };
    }
    if (held === h.pail && h.pail.level < 0.02) return { at: this.shore(P) };
    return null;
  }
  // standing grass nearest the mower: looked for round the scythe's post
  meadow(H, mask) {
    const P = this.game.player.pos, c = H.home.p;
    let best = null, bd = Infinity;
    for (let r = 4; r <= 28; r += 4) for (let a = 0; a < 12; a++) {
      const x = c.x + Math.cos(a * Math.PI / 6) * r, z = c.z + Math.sin(a * Math.PI / 6) * r;
      if (!mask.tall(x, z)) continue;
      const d = (x - P.x) ** 2 + (z - P.z) ** 2;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    return best ? new THREE.Vector3(best[0], this.game.world.groundAt(best[0], best[1]) + 0.4, best[1]) : null;
  }

  update(dt) {
    const g = this.game;
    if ((this.t -= dt) <= 0) {
      this.t = 0.2;
      const live = !g.title && !g.paused && !g.ui.modal && !g.stage?.on;
      const c = live ? this.next() : null;
      this.cur = c?.at ? c : null;
      if (this.cur) this.at.copy(this.cur.at);
      const gh = this.cur?.ghost && this.at.distanceTo(g.player.pos) < 40 ? this.cur.ghost : null;
      if (gh !== this.shown) {
        if (this.shown) this.ghosts[this.shown].visible = false;
        if (gh) this.ghosts[gh].visible = true;
        this.shown = gh;
      }
    }
    if (this.shown) this.op.value = 0.22 + 0.14 * Math.sin(performance.now() * 0.004);
    const on = !!this.cur;
    if (on !== this.on) { this.on = on; this.el.classList.toggle('on', on); }
    if (!on) return;
    const cam = g.engine.camera, W = innerWidth, H = innerHeight;
    const v = _v.copy(this.at).applyMatrix4(cam.matrixWorldInverse);
    let x, y, inView = false;
    if (v.z < -0.1) {
      v.applyMatrix4(cam.projectionMatrix);
      x = (v.x + 1) / 2 * W; y = (1 - v.y) / 2 * H;
      inView = x > EDGE && x < W - EDGE && y > EDGE && y < H - EDGE;
    }
    let ang = 0;
    if (!inView) {
      const dx = v.z < -0.1 ? x - W / 2 : v.x, dy = v.z < -0.1 ? y - H / 2 : -v.y || 0.001;
      const k = Math.min((W / 2 - EDGE) / Math.abs(dx || 1e-6), (H / 2 - EDGE) / Math.abs(dy || 1e-6));
      x = W / 2 + dx * k; y = H / 2 + dy * k;
      ang = Math.atan2(dy, dx);
    }
    if (inView === this.edge) { this.edge = !inView; this.el.classList.toggle('edge', !inView); }
    const near = inView && Math.abs(x - W / 2) < 60 && Math.abs(y - H / 2) < 60; // under the dot: the prompt is there
    if (near !== this.near) { this.near = near; this.el.classList.toggle('near', near); }
    this.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    if (!inView) this.el.style.setProperty('--a', `${ang.toFixed(3)}rad`);
  }
}
