// Baked geometry (docs/loading.md): what the model, tree and terrain generators would build at every load,
// shipped instead as binary packs in public/assets/geo/ (tools/bake-geometry.mjs). Behaviour stays in code:
// a model's build() still runs, but its heavy, pure parts are wrapped so a bake can stand in for them —
//   section(fn)       fn's value (geometries, typed arrays, plain data) comes from the pack; the shared
//                     rng streams are set to where fn left them. fn must have no other effects.
//   bucket(merge, …)  a merge-by-material bucket's merged geometries come from the pack (its adds are skipped);
//                     materials are matched by a stable key (geoMats dictionaries, kit.js recipes), not identity.
//   cachedJob(…)      a load-time worker job's result (src/load/workers.js).
// A pack is used when its key (the sources: tools/geo-keys.mjs, put in the page by vite.config.js) and its inputs (placement,
// terrain pads, job args) match; otherwise everything is generated as before, with a warning. A pack whose tape
// disagrees with the run (rng states, counts) aborts and the build reruns live. `?nogeo` = generate (A/B);
// `?bakegeo` = generate and record the packs for the tool.
import * as THREE from 'three/webgpu';
import { encodePack, fetchPack } from './geocodec.js';
import { job } from './workers.js';
import { rngs, strHash, urlFlag } from '../util.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'assets/geo/';
const KEYS = globalThis.__GEO_KEYS__;
export const baking = urlFlag('bakegeo') && !!KEYS;
const off = urlFlag('nogeo') || !KEYS || typeof DecompressionStream === 'undefined';
if (!KEYS) console.info('geo: no source keys in the page (a dev server started before vite.config.js?): geometry generated at load');
const hex = (s) => (strHash(s) >>> 0).toString(16).padStart(8, '0');
const manifest = off || baking ? Promise.resolve(null)
  : fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
// key '*': never shipped (the tool's SKIP), generated without a warning
const valid = (m, id) => { const e = m?.packs?.[id]; return e && (e.key === KEYS[e.group] || e.key === '*') ? e : null; };

// decoded packs by id: fetched and inflated in a load worker
const loads = new Map();
const load = (id, e) => {
  if (!loads.has(id)) {
    const url = `${BASE}${e.file}?k=${e.key}`;   // a pack's name stays across rebakes: its key busts a cached old one
    loads.set(id, job('geo', { url }, () => fetchPack(url)).catch((err) => { console.warn(`geo ${id}:`, err.message); return null; }));
  }
  return loads.get(id);
};
// once the world is built (src/load/release.js): the decoded packs were copied into the geometries
export const dropPacks = () => loads.clear();
// every model and forest pack starts loading as soon as the manifest is in (jobs: when asked for)
manifest.then((m) => {
  const ids = Object.entries(m?.packs || {}).filter(([id, e]) => !e.lazy && !e.empty && valid(m, id));
  Promise.all(ids.map(([id, e]) => load(id, e))).then(() => ids.length && console.info(`geo: ${ids.length} packs, ${(ids.reduce((s, [, e]) => s + e.bytes, 0) / 1e6).toFixed(1)} MB, in at ${Math.round(performance.now())} ms`));
});

// ---------- values ↔ pack (geometries by identity, typed arrays copied) ----------
const MATH = { Vector2: THREE.Vector2, Vector3: THREE.Vector3, Vector4: THREE.Vector4, Color: THREE.Color, Quaternion: THREE.Quaternion, Matrix4: THREE.Matrix4 };
// Vertex data is quantised (src/load/geocodec.js) within each attribute's own bounds: positions 16-bit (~0.1 mm
// on a house), unit normals octahedral 8-bit (~0.7°; others as data), uvs 14-bit, colours 8-bit, other data
// 12-bit. Plain typed arrays and indices stay exact; so do colliders and every other plain value.
const unit = (a) => { for (let i = 0; i < a.length; i += 3) if (Math.abs(Math.hypot(a[i], a[i + 1], a[i + 2]) - 1) > 1e-3) return false; return true; };
const BITS = { position: 16, uv: 14, color: 8 };
const quant = (name, s, a) => ({ q: name === 'normal' && s === 3 && unit(a) ? { s, kind: 'oct', b: 8 } : { s, kind: 'lin', b: BITS[name] || 12 } });
class Writer {
  constructor() { this.arrays = []; this.opts = []; this.head = { geos: [], attrs: [], ibs: [] }; this.ids = new Map(); }
  array(a, opt) { this.opts[this.arrays.length] = opt; this.arrays.push(a.slice()); return this.arrays.length - 1; }
  ref(o, list, make) { if (!this.ids.has(o)) { const i = list.length; list.push(null); this.ids.set(o, i); list[i] = make(); } return this.ids.get(o); }
  attr(a, name) {
    return this.ref(a, this.head.attrs, () => {
      const d = { s: a.itemSize };
      if (a.normalized) d.n = 1;
      if (a.isInterleavedBufferAttribute) {
        const ib = a.data;
        d.ib = this.ref(ib, this.head.ibs, () => ({ a: this.array(ib.array), st: ib.stride }));
        d.o = a.offset;
      } else d.a = this.array(a.array, a.usage === THREE.StaticDrawUsage && !a.normalized && name && quant(name, a.itemSize, a.array));
      if (a.usage !== THREE.StaticDrawUsage) d.u = a.usage;
      if (a.gpuType !== THREE.FloatType) d.gt = a.gpuType;
      return d;
    });
  }
  geo(g) {
    return this.ref(g, this.head.geos, () => {
      if (g.isInstancedBufferGeometry || Object.keys(g.morphAttributes).length) throw new Error('geo: instanced/morph geometry');
      const d = { a: {} };
      for (const [k, a] of Object.entries(g.attributes)) d.a[k] = this.attr(a, k);
      if (g.index) d.i = this.attr(g.index);
      if (g.groups.length) d.gr = g.groups;
      if (g.drawRange.start || g.drawRange.count !== Infinity) d.dr = [g.drawRange.start, g.drawRange.count];
      if (g.name) d.nm = g.name;
      if (Object.keys(g.userData).length) d.ud = this.enc(g.userData);
      if (g.boundingBox) d.bb = [...g.boundingBox.min.toArray(), ...g.boundingBox.max.toArray()];
      if (g.boundingSphere) d.bs = [...g.boundingSphere.center.toArray(), g.boundingSphere.radius];
      return d;
    });
  }
  enc(v) {
    if (v === undefined) return { $u: 1 };
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') return Number.isFinite(v) ? v : { $n: String(v) };
    if (ArrayBuffer.isView(v)) return { $a: this.array(v) };
    if (v.isBufferGeometry) return { $g: this.geo(v) };
    if (v.isBox3) return { $t: 'Box3', v: [...v.min.toArray(), ...v.max.toArray()] };
    if (v.isSphere) return { $t: 'Sphere', v: [...v.center.toArray(), v.radius] };
    for (const [name, T] of Object.entries(MATH)) if (v.constructor === T) return { $t: name, v: v.toArray() };
    if (Array.isArray(v)) return v.map((x) => this.enc(x));
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error(`geo: cannot bake a ${v.constructor?.name || typeof v}`);
    const o = {};
    for (const [k, x] of Object.entries(v)) { if (typeof x === 'function') throw new Error(`geo: cannot bake a function (${k})`); o[k] = this.enc(x); }
    return o;
  }
  bytes(tape) { return encodePack({ ...this.head, tape }, this.arrays, this.opts); }
}

const box3 = (a) => new THREE.Box3(new THREE.Vector3().fromArray(a, 0), new THREE.Vector3().fromArray(a, 3));
class Reader {
  constructor({ head, arrays }) { this.head = head; this.arrays = arrays; this.made = { geos: [], attrs: [], ibs: [] }; }
  attr(i) {
    if (this.made.attrs[i]) return this.made.attrs[i];
    const d = this.head.attrs[i];
    let a;
    if (d.ib !== undefined) {
      const ib = this.made.ibs[d.ib] ||= new THREE.InterleavedBuffer(this.arrays[this.head.ibs[d.ib].a], this.head.ibs[d.ib].st);
      a = new THREE.InterleavedBufferAttribute(ib, d.s, d.o, !!d.n);
    } else a = new THREE.BufferAttribute(this.arrays[d.a], d.s, !!d.n);
    if (d.u !== undefined) a.setUsage(d.u);
    if (d.gt !== undefined) a.gpuType = d.gt;
    return (this.made.attrs[i] = a);
  }
  geo(i) {
    if (this.made.geos[i]) return this.made.geos[i];
    const d = this.head.geos[i], g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(d.a)) g.setAttribute(k, this.attr(a));
    if (d.i !== undefined) g.setIndex(this.attr(d.i));
    for (const gr of d.gr || []) g.addGroup(gr.start, gr.count, gr.materialIndex);
    if (d.dr) g.setDrawRange(d.dr[0], d.dr[1]);
    if (d.nm) g.name = d.nm;
    if (d.ud) g.userData = this.dec(d.ud);
    if (d.bb) g.boundingBox = box3(d.bb);
    if (d.bs) g.boundingSphere = new THREE.Sphere(new THREE.Vector3().fromArray(d.bs), d.bs[3]);
    return (this.made.geos[i] = g);
  }
  dec(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => this.dec(x));
    if (v.$u) return undefined;
    if (v.$n) return Number(v.$n);
    if (v.$a !== undefined) return this.arrays[v.$a];
    if (v.$g !== undefined) return this.geo(v.$g);
    if (v.$t === 'Box3') return box3(v.v);
    if (v.$t === 'Sphere') return new THREE.Sphere(new THREE.Vector3().fromArray(v.v), v.v[3]);
    if (v.$t) return new MATH[v.$t]().fromArray(v.v);
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = this.dec(x);
    return o;
  }
}

// A non-indexed geometry → indexed, merging only bit-identical vertices (lossless: draws the same triangles).
function reindex(g) {
  if (g.index || g.groups.length || Object.values(g.attributes).some((a) => a.isInterleavedBufferAttribute)) return g;
  const attrs = Object.entries(g.attributes), n = g.attributes.position.count;
  if (attrs.some(([, a]) => a.array.BYTES_PER_ELEMENT !== 4)) return g;
  const words = attrs.map(([, a]) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.byteLength >> 2)); // f32 bits
  const sizes = attrs.map(([, a]) => a.itemSize);
  const same = (i, j) => { for (let k = 0; k < words.length; k++) { const z = sizes[k], w = words[k]; for (let c = 0; c < z; c++) if (w[i * z + c] !== w[j * z + c]) return false; } return true; };
  const heads = new Map(), next = new Int32Array(n), rep = new Uint32Array(n), remap = new Uint32Array(n);
  let u = 0;
  for (let i = 0; i < n; i++) {
    let h = 2166136261;
    for (let k = 0; k < words.length; k++) { const z = sizes[k], w = words[k]; for (let c = 0; c < z; c++) h = Math.imul(h ^ w[i * z + c], 16777619); }
    const h0 = heads.get(h) ?? -1;
    let j = h0;
    while (j >= 0 && !same(rep[j], i)) j = next[j];
    if (j < 0) { j = u++; rep[j] = i; next[j] = h0; heads.set(h, j); }
    remap[i] = j;
  }
  if (u > n * 0.9) return g; // nothing worth it
  const out = new THREE.BufferGeometry();
  for (const [name, a] of attrs) {
    const arr = new a.array.constructor(u * a.itemSize);
    for (let j = 0; j < u; j++) arr.set(a.array.subarray(rep[j] * a.itemSize, (rep[j] + 1) * a.itemSize), j * a.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(u > 65535 ? remap : Uint16Array.from(remap), 1));
  if (g.boundingSphere) out.boundingSphere = g.boundingSphere.clone();
  if (g.boundingBox) out.boundingBox = g.boundingBox.clone();
  out.userData = g.userData;
  return out;
}

// ---------- scopes: one model build, the forest variants, … ----------
class Mismatch extends Error {}
let cur = null;
const states = (list) => list.map((r) => r.state());
const sameStates = (list, s) => list.length === s.length && list.every((r, i) => r.state() === s[i]);

async function begin(group, inputs, track = true, live = false) {
  const id = `${group}#${hex(inputs)}`, s = { id, group, mode: 'live', depth: 0, si: 0, bi: 0, rngs: [], mats: [] };
  if (baking) { s.mode = 'bake'; s.w = new Writer(); s.tape = { s: [], b: [] }; }
  else if (!off && !live) {
    const m = await manifest, e = valid(m, id);
    if (e?.empty) { cur = s; rngs.list = track ? s.rngs : null; s.track = track; return s; }
    const pack = e && await load(id, e);
    loads.delete(id); // read once: the geometries get copies
    if (pack) { s.mode = 'replay'; s.r = new Reader(pack); s.tape = pack.head.tape; }
    else if (m) console.warn(`geo ${id}: ${m.packs?.[id] ? 'stale' : 'not baked'} (generated at load): npm run bake-geometry`);
  }
  cur = s; rngs.list = track ? s.rngs : null; s.track = track;
  return s;
}
function end(s, failed) {
  if (cur === s) { cur = null; rngs.list = null; }
  if (s.mode !== 'bake') return;
  const G = (window.__geo ||= { packs: {}, failed: {} });
  if (failed || s.failed) { G.failed[s.id] = String(failed?.message || s.failed); return; }
  G.packs[s.id] = s.si || s.bi ? { group: s.group, key: KEYS[s.group], bytes: s.w.bytes(s.tape) } : { group: s.group, key: KEYS[s.group], empty: true };
}

// Runs fn (a build: creates its ctx and rng inside) in a scope; a pack that disagrees reruns it live.
// rngs: false when fn's sections use no shared rng stream (other code may make streams while fn awaits).
export async function geoBuild(group, inputs, fn, { rngs: track = true } = {}) {
  const s = await begin(group, inputs, track);
  try { const v = await fn(); end(s); return v; } catch (e) {
    end(s, e);
    if (!(e instanceof Mismatch)) throw e;
    console.warn(`geo ${s.id}: ${e.message} — generated at load instead: npm run bake-geometry`);
    const live = await begin(group, inputs, track, true);
    try { return await fn(); } finally { end(live); }
  }
}

// see the top of the file
export function section(fn) {
  const s = cur;
  if (!s || s.mode === 'live' || s.depth) return fn();
  const k = s.si++;
  if (s.mode === 'replay') {
    const t = s.tape.s[k];
    if (!t || !sameStates(s.rngs, t.b)) throw new Mismatch(`section ${k} out of step`);
    t.a.forEach((v, i) => s.rngs[i].state(v));
    return s.r.dec(t.v);
  }
  const b = states(s.rngs);
  s.depth++; rngs.list = null;
  const add = THREE.Object3D.prototype.add;
  THREE.Object3D.prototype.add = function (...o) { s.failed ||= `section ${k} adds to the scene graph`; return add.apply(this, o); };
  let v;
  try { v = fn(); } finally { s.depth--; rngs.list = s.track ? s.rngs : null; THREE.Object3D.prototype.add = add; }
  if (v instanceof Promise) s.failed ||= `section ${k} is async`;
  try { s.tape.s.push({ b, a: states(s.rngs), v: s.w.enc(v) }); } catch (e) { s.failed ||= `section ${k}: ${e.message}`; s.tape.s.push(null); }
  return v;
}

// Material dictionaries ({ name: material }): bucket materials are keyed by their name in one. Called in a build,
// for that build; at module level (no build running), for every build.
const globalMats = [];
export function geoMats(dict, prefix = 'M') { (cur ? cur.mats : globalMats).push([prefix, dict]); }
// Global material sources: { key(mat) → string|undefined, get(key) → material|undefined } (kit.js recipes).
const sources = [];
export const geoMaterialSource = (src) => sources.push(src);
function matKey(s, mat) {
  for (const src of sources) { const k = src.key(mat); if (k !== undefined) return k; }
  for (const [p, d] of [...s.mats, ...globalMats]) for (const [k, m] of Object.entries(d)) if (m === mat) return `${p}.${k}`;
}
function matGet(s, key) {
  for (const [p, d] of [...s.mats, ...globalMats]) if (key.startsWith(p + '.')) { const m = d[key.slice(p.length + 1)]; if (m?.isMaterial) return m; }
  for (const src of sources) { const m = src.get(key); if (m) return m; }
}

// true while a bucket's adds may be skipped (its merge comes from the pack)
export const bucketReplay = () => cur?.mode === 'replay' && !cur.depth;
// merge() → [[material, geometry]] merged live; in replay those pairs from the pack.
export function bucket(merge) {
  const s = cur;
  if (!s || s.mode === 'live' || s.depth) {
    if (s?.mode === 'bake' && s.depth) s.failed ||= 'a bucket is built inside a section';
    return merge();
  }
  const k = s.bi++;
  if (s.mode === 'replay') {
    const t = s.tape.b[k];
    if (!t) throw new Mismatch(`bucket ${k} out of step`);
    return t.map(([key, v]) => {
      const mat = matGet(s, key);
      if (!mat) throw new Mismatch(`bucket ${k}: no material ${key}`);
      return [mat, s.r.dec(v)];
    });
  }
  const list = merge();
  try {
    s.tape.b.push(list.map(([mat, geo]) => {
      const key = matKey(s, mat);
      if (key === undefined) throw new Error(`no key for material ${mat.name || mat.type}`);
      return [key, s.w.enc(reindex(geo))];
    }));
  } catch (e) { s.failed ||= `bucket ${k}: ${e.message}`; s.tape.b.push(null); }
  return list;
}

// ---------- load-time worker jobs (src/load/workers.js) ----------
const JOBS = new Set(['ground', 'field', 'mask', 'scatter']);
// job-specific pack forms. ground (src/world/ground-data.js samples, normals planar): heights to 4 mm, normals'
// x and z to 1/256 with y rebuilt from them (terrain normals point up) — deflates to a quarter.
const PACKED = {
  ground: {
    enc: (r) => r.map(({ N, h, nor, spl }) => {
      const NN = N * N, n = new Int16Array(NN * 2);
      for (let k = 0; k < NN * 2; k++) n[k] = Math.round(nor[(k < NN ? 0 : NN) + k] / 128);
      return { N, h: h.map((v) => Math.round(v / 4)), n, spl };
    }),
    dec: (r) => r.map(({ N, h, n, spl }) => {
      const NN = N * N, nor = new Int16Array(NN * 3);
      for (let k = 0; k < NN; k++) {
        const x = n[k] * 128, z = n[NN + k] * 128;
        nor[k] = x; nor[2 * NN + k] = z; nor[NN + k] = Math.round(Math.sqrt(Math.max(0, 32767 ** 2 - x * x - z * z)));
      }
      return { N, h: h.map((v) => v * 4), nor, spl };
    }),
  },
};
const hashBytes = (x) => {
  const b = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  let h = 2166136261;
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619);
  return (h >>> 0).toString(16);
};
const argKey = (v) => JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? `#${x.constructor.name}${x.length}:${hashBytes(x)}` : x));
export function cachedJob(type, args, run) {
  if (off || !JOBS.has(type)) return run();
  const id = `job:${type}#${hex(argKey(args))}`;
  if (baking) return run().then((r) => {
    try { const w = new Writer(); (window.__geo ||= { packs: {}, failed: {} }).packs[id] = { group: 'jobs', key: KEYS.jobs, lazy: true, bytes: w.bytes({ v: w.enc(PACKED[type]?.enc(r) ?? r) }) }; } catch (e) { (window.__geo.failed ||= {})[id] = e.message; }
    return r;
  });
  return manifest.then((m) => {
    const e = valid(m, id);
    if (e?.empty) return run();
    if (!e) { if (m) console.warn(`geo ${id}: ${m.packs?.[id] ? 'stale' : 'not baked'} (computed at load): npm run bake-geometry`); return run(); }
    return load(id, e).then((p) => { loads.delete(id); if (!p) return run(); const v = new Reader(p).dec(p.head.tape.v); return PACKED[type]?.dec(v) ?? v; });
  });
}
