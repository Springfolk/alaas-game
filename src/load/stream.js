// Shader streaming for the loading screen. Building a node material's shader (TSL → WGSL, plain JS on the
// main thread) is what costs seconds at load. So while loading, every render goes through `render()` here:
// render objects whose shader is built draw as usual, the rest are queued and built by `pump()` in small time
// slices (three's `buildAsync`, which yields between stages), so the world appears piece by piece and the
// page never blocks. Order: what a load step awaits (`prepare()`) → what the view missed → nearest first.
// `collect()` queues everything in the scene (hidden props, every LOD, every pass: shadows, lake reflection,
// post quads); `prepare()` does it for an offscreen bake.
// Everything is built (and its pipeline compiled) before play: a pipeline compiled in play holds frames.
// `sync`: whole builds per slice, no yields inside (under the key art nothing is seen; each yield costs a task hop).
// Uses three r186 renderer internals (`_renderObjectDirect`, `_objects`, `_nodes`, `_pipelines`, state fields).
import { Sphere, Vector3 } from 'three/webgpu';
import { enter, exit, span } from './prof.js';

// Safari has no `scheduler.yield`: three's fallback waits a whole animation frame per build stage.
if (typeof self !== 'undefined' && !self.scheduler?.yield) {
  const ch = new MessageChannel(), waiting = [];
  ch.port1.onmessage = () => waiting.shift()?.();
  self.scheduler = { ...self.scheduler, yield: () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); }) };
}

// between build slices: a task yield (a setTimeout chain is clamped to 4 ms per slice after five)
const tick = () => self.scheduler.yield();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FIRST = -1e5, VIEW = -1e4; // order offsets: awaited by a load step / missed by the last view render
const _s = new Sphere();

// three keys a shader build by the geometry's attribute layout *and* whether it has an index; the index never
// changes the shader, so an indexed and a non-indexed mesh with one material share a build (once per
// RenderObject class; three r186 RenderObject.getGeometryCacheKey).
let patched = false;
function sameShaderIndexed(ro) {
  if (patched) return;
  patched = true;
  const proto = Object.getPrototypeOf(ro), key = proto.getGeometryCacheKey;
  if (key) proto.getGeometryCacheKey = function () { const k = key.call(this); return k.endsWith('index,') ? k.slice(0, -6) : k; };
}

export class ShaderStream {
  constructor(renderer) {
    this.r = renderer;
    this.queue = [];                  // { ro, group, drawRange, state, bias, view, x, y, z, r, done }
    this.seen = new Map();            // render object → its queue item, until its build starts
    this.drawn = new WeakSet();       // objects drawn at least once
    this.flying = new Set();          // pipelines still compiling
    this.urgent = () => false;        // (object) => true: build it in place, before the rest of the view
    this.never = () => false;         // (object, material) => true: a draw that never happens in play (not drawn, not built)
    this.syncMs = 40;                 // in-place builds per render for urgent / changed objects
    this.budget = 12;                 // ms of building per slice
    this.sync = false;                // whole builds, no yields inside (the view is unseen: main.js, under the key art)
    this.eye = new Vector3();         // distances are from here (main.js keeps it at the camera)
    this.bias = 0; this.mine = null;  // during prepare(): its bias, and the items it waits for
    this.views = 0;                   // view renders so far: an item's `view` = the last one that missed it
    this.done = 0; this.total = 0; this.skipped = 0;
  }

  get waiting() { return this.queue.length; }
  get progress() { return this.total ? this.done / this.total : 1; }

  // The renderer state a shader build reads (target, MRT, samples, output transform, and the scene's lights:
  // three fills a scene's LightsNode per render and restores it after, so outside a render it holds a stale
  // set — a shader built then would miss the fires): captured when an object is queued mid-render, put back
  // while it builds, and taken off again while the build yields.
  state(ln = null) {
    const r = this.r;
    return { rt: r._renderTarget, face: r._activeCubeFace, mip: r._activeMipmapLevel, mrt: r._mrt, ctx: r._currentRenderContext, tm: r.toneMapping, ln, lights: ln?.getLights().slice() };
  }
  apply(st) {
    const r = this.r;
    r._renderTarget = st.rt; r._activeCubeFace = st.face; r._activeMipmapLevel = st.mip; r._mrt = st.mrt; r._currentRenderContext = st.ctx; r.toneMapping = st.tm;
    st.ln?.setLights(st.lights);
  }

  // Is this render object's shader built (for it, or for an identical one)?
  built(ro) {
    const n = this.r._nodes;
    return n.get(ro).nodeBuilderState !== undefined || n.nodeBuilderCache.has(n.getForRenderCacheKey(ro));
  }

  // metres from the eye to an item's bounds (0: instanced or unbounded); order key, lower = sooner
  dist(it) { return it.r < 0 ? 0 : Math.max(0, Math.hypot(it.x - this.eye.x, it.y - this.eye.y, it.z - this.eye.z) - it.r); }
  prio(it) { return it.bias + this.dist(it) + (it.view === this.views ? VIEW : 0); }
  next() {
    let best = 0, bp = Infinity;
    for (let i = 0; i < this.queue.length; i++) { const p = this.prio(this.queue[i]); if (p < bp) { bp = p; best = i; } }
    const it = this.queue[best];
    this.queue[best] = this.queue[this.queue.length - 1]; this.queue.pop();
    return it;
  }

  // Render with `fn` (e.g. engine.render) drawing only render objects whose shader is built; queue the
  // others. The post quads and the sky are built in place (three's usual synchronous way), and so is, within
  // `syncMs` per render, what is `urgent()` or was drawn before and changed since (new lights) — or the view
  // goes dark. `view`: a render of the view (what it misses goes first). `skipped` = how many it could not draw.
  render(fn, view = true) {
    const r = this.r, proto = Object.getPrototypeOf(r)._renderObjectDirect, s = this;
    let sync = this.syncMs;
    this.skipped = 0;
    if (view) this.views++;
    r._renderObjectDirect = function (object, material, scene, camera, lightsNode, group, clippingContext, passId) {
      if (s.never(object, material)) return;
      const ro = this._objects.get(object, material, scene, camera, lightsNode, this._currentRenderContext, clippingContext, passId);
      sameShaderIndexed(ro);
      const frame = object.isQuadMesh || object.name === 'Background.mesh';
      const key = frame || s.drawn.has(object) || s.urgent(object);
      if (s.built(ro) || (view && frame) || (key && sync > 0)) {
        const t = performance.now();
        s.drawn.add(object);
        proto.call(this, object, material, scene, camera, lightsNode, group, clippingContext, passId);
        if (key) sync -= performance.now() - t;
        return;
      }
      s.skipped++;
      let it = s.seen.get(ro);
      if (!it) {
        s.total++;
        it = { ro, group, drawRange: object.geometry.drawRange, state: s.state(lightsNode), bias: s.bias, view: 0, x: 0, y: 0, z: 0, r: -1, done: false };
        const g = object.geometry;
        if (!object.isInstancedMesh && g?.attributes?.position && !g.isInstancedBufferGeometry) {
          if (!g.boundingSphere) g.computeBoundingSphere();
          _s.copy(g.boundingSphere).applyMatrix4(object.matrixWorld);
          if (_s.radius < 1e4) { it.x = _s.center.x; it.y = _s.center.y; it.z = _s.center.z; it.r = _s.radius; }
        }
        s.seen.set(ro, it); s.queue.push(it);
      } else it.bias = Math.min(it.bias, s.bias);
      if (view) it.view = s.views;
      s.mine?.push(it);
    };
    try { fn(); } finally { delete r._renderObjectDirect; }
  }

  // Queue every mesh in `scene`: everything shown (with its parents) and unculled for one render. One the
  // camera's layers miss (a part culled to a spare layer for now, a shadow-only proxy) joins layer 0 for it,
  // so every pass that will draw it later (the lake mirror, the shadow cascades) builds it now. Built ones are
  // drawn too (for one loading frame): a pipeline is only compiled for good once a draw has used it — one made
  // without a draw stalls the GPU process later (seconds at the end of the load in Chrome).
  collect(scene, camera, fn) {
    const objs = [], groups = [], seen = camera.layers.mask;
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine || o.isSprite) objs.push([o, o.visible, o.frustumCulled, o.layers.mask]);
      else groups.push([o, o.visible]);
    });
    for (const [o] of objs) { o.visible = true; o.frustumCulled = false; if (!(o.layers.mask & seen)) o.layers.mask |= 1; }
    for (const [o] of groups) o.visible = true;
    camera.layers.enableAll();
    try { this.render(fn, false); } finally {
      for (const [o, v, f, m] of objs) { o.visible = v; o.frustumCulled = f; o.layers.mask = m; }
      for (const [o, v] of groups) o.visible = v;
      camera.layers.mask = seen;
    }
    return objs.length;
  }

  // Builds the shaders an offscreen render of `scene` into `target` will need (e.g. a bake) in time slices,
  // first in the order; resolves when they are built, so the bake itself compiles nothing.
  async prepare(scene, camera, target) {
    const r = this.r, prev = [r.getRenderTarget(), r.getActiveCubeFace(), r.getActiveMipmapLevel()];
    const mine = this.mine = [];
    r.setRenderTarget(target);
    this.bias = FIRST;
    try { this.render(() => r.render(scene, camera), false); } finally { this.bias = 0; this.mine = null; r.setRenderTarget(...prev); }
    this.pump();
    while (mine.some((it) => !it.done)) await wait(16);
  }

  // Builds the queue in the background (one runner at a time); `drain()` waits until nothing is left.
  pump() { return (this.running ||= this.run().finally(() => { this.running = null; })); }
  async drain() { while (this.waiting || this.running) await this.pump(); while (this.flying.size) await Promise.all(this.flying); }
  // Resolves once nothing the last view render missed waits for its shader (or after `max` ms).
  async viewBuilt(max = 1500) {
    const t0 = performance.now();
    while (this.queue.some((it) => it.view === this.views) && performance.now() - t0 < max) await wait(16);
  }

  // Builds in slices of `budget` ms of main-thread time until the queue is empty.
  async run() {
    let t0 = performance.now();
    while (this.waiting) {
      const it = this.next();
      this.seen.delete(it.ro);
      try { await this.build(it.ro, it.group, it.drawRange, it.state); } finally { it.done = true; }
      this.done++;
      if (performance.now() - t0 > this.budget) { await tick(); t0 = performance.now(); }
    }
  }

  // One render object: its shader (three's buildAsync, with the renderer state it was queued in), then its
  // buffers, bind groups and pipeline. (three's async pipeline creation marks a pipeline failed on any
  // validation error caught in its error scope, even an unrelated one: the game must stay free of them.)
  async build(ro, group, drawRange, state) {
    const r = this.r, outside = this.state(state.ln), sched = self.scheduler, y = sched.yield;
    ro.group = group; ro.drawRange = drawRange;
    this.apply(state);
    sched.yield = () => { this.apply(outside); exit(); return y.call(sched).then(() => { enter('nodes'); Object.assign(outside, this.state(state.ln)); this.apply(state); }); };
    enter('nodes');
    try {
      if (!this.built(ro)) { if (this.sync) r._nodes.getForRender(ro); else await r._nodes.getForRenderAsync(ro); }
      r._geometries.updateForRender(ro);
      r._nodes.updateForRender(ro);
      r._bindings.updateForRender(ro);
      // async: the GPU process compiles it on a worker thread (a synchronous one blocks its main thread, and
      // the frames behind it, for 5–300 ms each); three skips drawing it until it is in
      const p = [];
      r._pipelines.getForRender(ro, p);
      if (p.length) { const all = Promise.all(p).finally(() => this.flying.delete(all)); this.flying.add(all); span('pipeline.wait', all); }
    } finally { sched.yield = y; this.apply(outside); exit(); }
  }
}
