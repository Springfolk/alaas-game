// Builds the place: terrain, ground, nature (src/nature/*: grass, lake, forest…), and every model in the layout.
// Keeps the colliders, walkable floors and interactables in world space.
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { lights } from 'three/tsl';
import { Terrain } from './terrain.js';
import { buildGround } from './ground.js';
import { PLACEMENTS } from './layout.js';
import { pbr, maps, tex } from '../engine/materials.js';
import { optimizePlaced } from '../engine/merge.js';
import { geoBuild } from '../load/geocache.js';
import { homesteadLights, useLights, shareGraphs, materialsOf } from '../engine/master.js';
import { mulberry32, strHash, urlFlag } from '../util.js';
import { event } from '../load/prof.js';

const modelModules = import.meta.glob('../models/*.js');
const natureModules = import.meta.glob('../nature/*.js');
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export class World {
  constructor(engine) {
    this.engine = engine;
    this.scene = engine.scene;
    this.terrain = new Terrain();
    this.colliders = [];     // { kind: 'circle', x, z, r } | { kind: 'box', x, z, hw, hd, c, s, y0?, y1? }
    this.floors = [];        // { x, z, hw, hd, c, s, h } walkable surfaces above the ground (world y)
    this.lows = [];          // { x, z, hw, hd, c, s, h } low lintels/ceilings: clear height (world y) the player stoops under
    this.interactables = []; // { entry, target?, zone?, act?, label? }
    this.updaters = [];      // (dt, ctx) => void, from models and nature
    this.placed = [];
    this.ground = null;      // the ground mesh, once built (in the scene once its textures are in)
    this.breathe = yieldFrame; // between load steps: main.js waits there for the loading view's shaders
  }

  ctx(rngKey) {
    return { THREE, TSL, pbr, maps, tex, rng: mulberry32(strHash(rngKey)), terrain: this.terrain, world: this };
  }

  // `onBase()` (the loading view starts: the sky), then the ground, the homestead, and nature.
  // Each stage's objects join the scene only once the stage is done (nature lit by the sun alone), so
  // the loading view never draws, and builds the shaders of, half-made or wrongly lit things, and the
  // scene's light set (part of every shader) changes once, when the homestead with its fires comes in.
  async build(onProgress = () => {}, onBase = () => {}) {
    const timed = async (label, fn) => { const t = performance.now(); event(`${label} >`); const v = await fn(); event(`${label} <`); console.info(`${label}: ${Math.round(performance.now() - t)} ms`); return v; };
    const staged = async (fn) => {
      const list = [];
      this.scene.add = (...o) => { list.push(...o); return this.scene; };
      try { await fn(); } finally { delete this.scene.add; }
      return list;
    };
    // every module starts loading now, in parallel
    const models = PLACEMENTS.map((p) => modelModules[`../models/${p.model}.js`]?.());
    const nature = Object.entries(natureModules).map(([path, load]) => [path.split('/').pop().replace('.js', ''), load()]);
    for (const m of [...models, ...nature.map((n) => n[1])]) m?.catch(() => {}); // reported where awaited
    // building pads first so the ground is flattened under them
    for (const p of PLACEMENTS) p.y = p.pad ? this.terrain.addPad(p.x, p.z, p.pad) : this.terrain.height(p.x, p.z);
    // Nature is lit by the sun (and sky) only: the indoor fire lights would otherwise be evaluated
    // in every grass, tree and ground pixel, and shine through walls onto the meadow.
    const sunOnly = lights([this.engine.sun]);
    const sunLit = (root) => root.traverse((o) => {
      for (const m of [o.material].flat()) if (m?.isNodeMaterial && m.lights !== false && !m.lightsNode) m.lightsNode = sunOnly;
    });
    await onBase(); // the sky first
    // the ground (its grid in a worker) while the homestead builds here; shown once its textures are in
    // (until then the sky's own ground shows, not a black one), past the staging below
    // (nature needs only its mesh: `this.ground`)
    const groundBuilt = timed('ground', () => buildGround(this.terrain)).then((ground) => {
      sunLit(ground);
      onProgress(0.15);
      return (this.ground = ground);
    });
    const groundShown = groundBuilt.then((ground) => Promise.race([ground.material.userData.ready, new Promise((r) => setTimeout(r, 4000))])
      .then(() => THREE.Scene.prototype.add.call(this.scene, ground)));

    let i = 0;
    const homestead = await staged(() => timed('homestead', async () => {
      for (const [k, p] of PLACEMENTS.entries()) {
        if (!models[k]) { console.warn(`model ${p.model} not built yet`); continue; }
        const mod = await models[k];
        // baked geometry (src/load/geocache.js) stands in for the heavy parts when its key and inputs match
        const res = await geoBuild(`model:${p.model}`, JSON.stringify({ p, pads: this.terrain.pads }), () => mod.default(this.ctx(p.model + p.x), p));
        this.place(res, p);
        onProgress(0.15 + 0.35 * (++i / PLACEMENTS.length));
        await this.breathe();
      }
    }));
    // One light set for the whole homestead: the sun and two local lights that each material takes from its
    // own model (a house its fire; src/engine/master.js), so builds don't split by light set. A model may set
    // its materials first (the urasa: no sun indoors, no fire outside).
    const homeLights = homesteadLights(this.engine);
    for (const { object } of this.placed) {
      const own = [];
      object.traverse((o) => { if (o.isLight) own.push(o); });
      object.traverse((o) => {
        for (const m of [o.material].flat()) if (m?.isNodeMaterial && m.lights !== false && !m.lightsNode) { m.lightsNode = homeLights; useLights(m, own); }
      });
    }
    if (!urlFlag('nomaster')) shareGraphs(materialsOf(...homestead)); // ?nomaster: A/B
    this.scene.add(...homestead);
    // draw-call merging (src/engine/merge.js): merged shadow casters, far impostors, tiny far parts culled
    if (!urlFlag('nomerge')) { // ?nomerge: A/B
      const opt = this.optimized = optimizePlaced(this, this.engine.camera, this.engine.sun);
      this.updaters.push(opt.update);
      opt.ready.catch((e) => console.error('merge failed', e));
    }
    // nature after the models; a failing module is logged and skipped, never blocks the load
    for (const [k, [name, load]] of nature.entries()) {
      if (name !== 'forest') await groundBuilt; // the meadow, the lake and life use the ground (world.ground)
      onProgress(0.5 + 0.5 * (k / nature.length), name);
      let list = [];
      try {
        list = await staged(() => timed(`nature/${name}`, async () => { const mod = await load; await mod.default?.(this.ctx(`../nature/${name}.js`), this); }));
      } catch (e) { console.error(`nature/${name} failed`, e, e?.stack); }
      for (const o of list) sunLit(o);
      if (!urlFlag('nomaster')) shareGraphs(materialsOf(...list));
      for (const o of list) this.scene.add(o);
      await this.breathe();
    }
    await groundShown;
    await this.optimized?.ready.catch(() => {}); // merged shadows and impostors in the scene before the warm-up
    onProgress(1);
  }

  // Adds a model's result ({ object, colliders, floors, interactables, update }) at a placement.
  place(res, p) {
    const { object } = res;
    object.position.set(p.x, p.y, p.z);
    object.rotation.y = p.yaw || 0;
    object.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); // casting is the model's call (three's default: off)
    this.scene.add(object);
    object.updateMatrixWorld(true);
    const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
    // local (x, z) → world; three's rotation.y maps local +X to (cos, −sin)
    const tw = (x, z) => ({ x: p.x + x * c + z * s, z: p.z - x * s + z * c });
    for (const k of res.colliders || []) {
      const w = tw(k.x, k.z);
      if (k.r !== undefined) this.colliders.push({ kind: 'circle', ...w, r: k.r, y0: k.y0, y1: k.y1 });
      else {
        const a = (p.yaw || 0) + (k.rot || 0);
        this.colliders.push({ kind: 'box', ...w, hw: k.hw, hd: k.hd, c: Math.cos(a), s: Math.sin(a), y0: k.y0, y1: k.y1 });
      }
    }
    for (const f of res.floors || []) {
      const w = tw(f.x, f.z), a = (p.yaw || 0) + (f.rot || 0);
      this.floors.push({ ...w, hw: f.hw, hd: f.hd, c: Math.cos(a), s: Math.sin(a), h: p.y + f.h });
    }
    for (const f of res.lows || []) {
      const w = tw(f.x, f.z), a = (p.yaw || 0) + (f.rot || 0);
      this.lows.push({ ...w, hw: f.hw, hd: f.hd, c: Math.cos(a), s: Math.sin(a), h: p.y + f.h });
    }
    for (const it of res.interactables || []) {
      const e = { ...it };
      if (it.zone) e.zone = { ...tw(it.zone.x, it.zone.z), r: it.zone.r };
      this.interactables.push(e);
    }
    if (res.update) this.updaters.push(res.update);
    this.placed.push({ ...p, object });
  }

  // box test in the box's own frame
  static local(b, x, z) {
    const dx = x - b.x, dz = z - b.z;
    return [dx * b.c - dz * b.s, dx * b.s + dz * b.c];
  }

  groundAt(x, z) {
    let h = this.terrain.height(x, z);
    for (const f of this.floors) {
      const [lx, lz] = World.local(f, x, z);
      if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd) h = Math.max(h, f.h);
    }
    return h;
  }

  // Lowest clear height (world y) over a circle of radius r at (x, z), or Infinity.
  headroomAt(x, z, r = 0) {
    let h = Infinity;
    for (const f of this.lows) {
      const [lx, lz] = World.local(f, x, z);
      if (Math.abs(lx) < f.hw + r && Math.abs(lz) < f.hd + r) h = Math.min(h, f.h);
    }
    return h;
  }

  surfaceAt(x, z, y) {
    for (const f of this.floors) {
      const [lx, lz] = World.local(f, x, z);
      if (Math.abs(lx) < f.hw && Math.abs(lz) < f.hd && Math.abs(y - f.h) < 0.05) return 'wood';
    }
    return this.terrain.surface(x, z);
  }

  // Slide a circle of radius r out of every collider. y = feet height (colliders may have y0/y1).
  collide(x, z, r, y = 0) {
    for (let pass = 0; pass < 3; pass++) {
      for (const k of this.colliders) {
        if (k.y0 !== undefined && (y + 1.6 < k.y0 || y > k.y1)) continue;
        if (k.kind === 'circle') {
          const dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz), m = k.r + r;
          if (d < m && d > 1e-6) { x = k.x + dx / d * m; z = k.z + dz / d * m; }
        } else {
          const [lx, lz] = World.local(k, x, z);
          const cx = Math.max(-k.hw, Math.min(k.hw, lx)), cz = Math.max(-k.hd, Math.min(k.hd, lz));
          let ex = lx - cx, ez = lz - cz, d = Math.hypot(ex, ez);
          if (d >= r) continue;
          let nlx, nlz;
          if (d < 1e-6) { // centre inside: push out along the shallowest side
            const px = k.hw - Math.abs(lx), pz = k.hd - Math.abs(lz);
            if (px < pz) { nlx = Math.sign(lx || 1) * (k.hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (k.hd + r); }
          } else { nlx = cx + ex / d * r; nlz = cz + ez / d * r; }
          // back to world (inverse rotation)
          x = k.x + nlx * k.c + nlz * k.s;
          z = k.z - nlx * k.s + nlz * k.c;
        }
      }
    }
    return { x, z };
  }

  update(dt, ctx) { for (const u of this.updaters) u(dt, ctx); }
}
