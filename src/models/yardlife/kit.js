// Shared kit for yardlife and lakeside: weathered PBR node materials, ground-aware merging buckets,
// and geometry for logs, poles, split firewood, sheets and lathe bodies.
// Convention: every geometry carries position, normal, uv (in metres), color (tint) and grime
// (height above the ground, for dirt at the base). Buckets merge everything by material.
import * as THREE from 'three/webgpu';
import {
  texture, uv, attribute, vec2, vec3, float, color, mix, normalMap, normalWorld, positionWorld, mx_noise_float, frontFacing, materialReference,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { maps } from '../../engine/materials.js';
import { canvasMaps } from './textures.js';
import { bucket, bucketReplay, geoMaterialSource, section } from '../../load/geocache.js';

export const TAU = Math.PI * 2;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// ---------- materials ----------
// Materials of one shape (which maps, back face, lichen, dirt) share one node graph whose per-material values
// are material properties read through shared reference nodes: three keys a shader build by node identity,
// so they share one build (docs/loading.md). The maths is the same as with the values as constants.
const matCache = new Map(), graphs = new Map(), refs = new Map();
// baked buckets (src/load/geocache.js) name their materials by recipe: 'pmat:[src, o]' remakes one (the cache
// hands back the same object), 'kit#key' only finds one already made (options with nodes)
const recipes = new WeakMap(), noded = new Map();
const recipe = (mat, kind, key, src, o) => {
  if (!Object.values(o).some((v) => v?.isNode)) return recipes.set(mat, `${kind}:${JSON.stringify([src, o])}`);
  const k = `kit#${kind}:${src}${JSON.stringify(Object.fromEntries(Object.entries(o).filter(([, v]) => !v?.isNode)))}`;
  recipes.set(mat, k); noded.set(k, mat);
};
geoMaterialSource({
  key: (mat) => recipes.get(mat),
  get: (k) => {
    if (k.startsWith('kit#')) return noded.get(k);
    const [kind, rest] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
    if (kind === 'pmat') return pmat(...JSON.parse(rest));
    if (kind === 'decal') return decalMat(...JSON.parse(rest));
  },
});
const R = (name, type) => refs.get(name) || refs.set(name, materialReference(name, type)).get(name);
function pmatGraph({ nor, arm, back, lichen, dirt }) {
  const uvS = uv().div(R('_pScale', 'float'));
  const at = (name) => R(name, 'texture').context({ getUV: () => uvS });
  const diff = at('_pDiff');
  const vc = attribute('color', 'vec3');
  const grime = attribute('grime', 'float');
  let col = diff.rgb.mul(vc).mul(R('_pTint', 'color'));
  // the back face of a sheet (inner birch bark) has its own colour
  if (back) col = frontFacing.select(col, at('_pBack').rgb.mul(vc));
  // slow per-position tone so merged copies never look identical
  const n = mx_noise_float(positionWorld.mul(0.7)).mul(R('_pVary', 'float')).add(1);
  col = col.mul(vec3(n, n, n.mul(0.985)));
  if (lichen) {
    const north = normalWorld.z.negate().add(normalWorld.y.mul(0.35)).smoothstep(0.05, 0.75);
    const patch = mx_noise_float(positionWorld.mul(3.1)).add(mx_noise_float(positionWorld.mul(11)).mul(0.4)).smoothstep(0.0, 0.45);
    col = mix(col, vec3(0.6, 0.63, 0.52).mul(diff.g.mul(0.5).add(0.62)), north.mul(patch).mul(R('_pLichen', 'float')));
  }
  if (dirt) {
    const d = float(1).sub(grime.smoothstep(0.0, 0.35)).mul(R('_pDirt', 'float'));
    col = mix(col, col.mul(vec3(0.42, 0.36, 0.29)), d.mul(0.85));
  }
  const ns = R('_pNormalScale', 'float'), rough = R('_pRough', 'float');
  const g = { color: col, metal: R('_pMetal', 'float') };
  if (nor) g.normal = normalMap(at('_pNor'), vec2(ns, ns));
  if (arm) {
    const a = at('_pArm');
    g.rough = a.g.mul(rough).clamp(0.05, 1);
    g.ao = a.r.mul(0.6).add(0.4);
  } else g.rough = rough;
  return g;
}

/**
 * A weathered PBR node material. src: a texture-set id in public/assets/tex, or a canvas set name.
 * scale: metres per texture tile. lichen: grey-green crust on north (−Z) faces. dirt: darkening at the base.
 */
export function pmat(src, o = {}) {
  const key = src + JSON.stringify(o, (k, v) => (v && v.isNode ? undefined : v));
  if (matCache.has(key)) return matCache.get(key);
  const { scale = 1, tint = 0xffffff, lichen = 0, dirt = 1, rough = 1, metal = 0, normalScale = 1, side,
    vary = 0.14, back, emissive, transparent, opacity, alphaTest, double } = o;
  const m = typeof src === 'string' && !src.startsWith('canvas:') ? maps(src) : canvasMaps(src.replace('canvas:', ''));
  const mat = new THREE.MeshStandardNodeMaterial({ side: double ? THREE.DoubleSide : side ?? THREE.FrontSide });
  Object.assign(mat, {
    _pScale: scale, _pTint: new THREE.Color(tint), _pVary: vary, _pLichen: lichen, _pDirt: dirt, _pRough: rough, _pMetal: metal, _pNormalScale: normalScale,
    _pDiff: m.diff, _pNor: m.nor || null, _pArm: m.arm || null, _pBack: back !== undefined ? canvasMaps(back).diff : null,
  });
  const shape = { nor: !!m.nor, arm: !!m.arm, back: back !== undefined, lichen: !!lichen, dirt: !!dirt };
  const sk = JSON.stringify(shape);
  if (!graphs.has(sk)) graphs.set(sk, pmatGraph(shape));
  const g = graphs.get(sk);
  mat.colorNode = g.color;
  if (g.normal) mat.normalNode = g.normal;
  mat.roughnessNode = g.rough;
  if (g.ao) mat.aoNode = g.ao;
  mat.metalnessNode = g.metal;
  if (emissive) mat.emissiveNode = emissive;
  if (transparent) { mat.transparent = true; mat.depthWrite = false; }
  if (opacity) mat.opacityNode = opacity;
  if (alphaTest) mat.alphaTest = alphaTest;
  mat.name = src;
  matCache.set(key, mat);
  recipe(mat, 'pmat', key, src, o);
  return mat;
}

// A ground decal material: a texture set faded out by the uv2 edge attribute (0 edge … 1 centre) and noise.
export function decalMat(src, o = {}) {
  const { scale = 1, tint = 0xffffff, rough = 1, strength = 1 } = o;
  const key = 'decal:' + src + scale + tint + strength;
  if (matCache.has(key)) return matCache.get(key);
  const m = maps(src);
  const uvS = uv().div(scale);
  const edge = attribute('edge', 'float');
  const nz = mx_noise_float(positionWorld.xz.mul(1.7)).mul(0.28).add(mx_noise_float(positionWorld.xz.mul(6.5)).mul(0.12));
  const a = edge.add(nz).smoothstep(0.18, 0.62).mul(strength);
  const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.colorNode = texture(m.diff, uvS).rgb.mul(color(tint)).mul(attribute('color', 'vec3'));
  mat.normalNode = normalMap(texture(m.nor, uvS), vec2(0.8, 0.8));
  mat.roughnessNode = texture(m.arm, uvS).g.mul(rough).clamp(0.78, 1);
  mat.metalnessNode = float(0);
  mat.opacityNode = a;
  mat.name = 'decal:' + src;
  matCache.set(key, mat);
  recipe(mat, 'decal', key, src, o);
  return mat;
}

// ---------- buckets: merge by material, carrying grime (height above ground) ----------
export class Bucket {
  /** ground(x, z) → local ground height under a local point */
  constructor(ground) {
    this.ground = ground;
    this.parts = new Map(); // material → geometries
  }
  /**
   * geo: BufferGeometry (consumed); mat: material; m: Matrix4 (optional);
   * tint: [r,g,b] multiplies vertex colours.
   */
  add(geo, mat, m, tint) {
    if (bucketReplay()) return geo; // the merge comes baked (src/load/geocache.js)
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) {
      const c = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    if (tint) {
      const c = g.attributes.color.array;
      for (let i = 0; i < n; i++) { c[i * 3] *= tint[0]; c[i * 3 + 1] *= tint[1]; c[i * 3 + 2] *= tint[2]; }
    }
    const p = g.attributes.position.array, gr = new Float32Array(n);
    for (let i = 0; i < n; i++) gr[i] = p[i * 3 + 1] - this.ground(p[i * 3], p[i * 3 + 2]);
    g.setAttribute('grime', new THREE.Float32BufferAttribute(gr, 1));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'grime', 'edge'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }
  /** Merges into meshes and adds them to `group`. Returns the meshes. */
  build(group, { shadows = true } = {}) {
    const out = [];
    const list = bucket(() => [...this.parts].map(([mat, gs]) => {
      // decal geometries carry 'edge'; others must not differ in attribute sets
      const has = gs.some((g) => g.attributes.edge);
      if (has) for (const g of gs) if (!g.attributes.edge) g.setAttribute('edge', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(1), 1));
      const merged = mergeGeometries(gs, false);
      if (!merged) { console.warn('merge failed', mat.name); return null; }
      merged.computeBoundingSphere();
      return [mat, merged];
    }).filter(Boolean));
    for (const [mat, merged] of list) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = mat.name;
      mesh.castShadow = shadows && !mat.transparent;
      mesh.receiveShadow = true;
      group.add(mesh);
      out.push(mesh);
    }
    this.parts.clear();
    return out;
  }
}

// ---------- matrices ----------
export function mtx(p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const e = new THREE.Euler(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(e);
  _s.set(...(Array.isArray(s) ? s : [s, s, s]));
  return new THREE.Matrix4().compose(_v.set(...p), _q, _s);
}
// A matrix that maps the +Y axis (0..1) onto the segment a→b.
export function along(a, b, roll = 0) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  return new THREE.Matrix4().compose(A, q, new THREE.Vector3(1, 1, 1));
}

// ---------- noise ----------
export function wobbler(rng, n = 4) {
  const k = [];
  for (let i = 0; i < n; i++) k.push({ f: 1 + Math.floor(rng() * (2 + i * 1.5)), p: rng() * TAU, a: (0.4 + rng() * 0.6) / (1 + i), fy: (rng() - 0.5) * 4 });
  return (a, y) => { let s = 0; for (const q of k) s += q.a * Math.sin(q.f * a + q.p + y * q.fy); return s; };
}

// ---------- geometry ----------
function finish(pos, nor, uvs, idx, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (idx) g.setIndex(idx);
  if (!nor) g.computeVertexNormals();
  return g;
}

/**
 * A log/pole along +Y from 0 to len: taper r0→r1, wobble, gentle bend, optional knots.
 * Returns { side, caps } — caps are the two end discs (end grain), or null.
 */
export function logGeo(len, r0, r1, rng, { seg = 9, step = 0.22, wob = 0.07, bend = 0.012, caps = false, flat = 0 } = {}) {
  const rings = Math.max(2, Math.ceil(len / step) + 1);
  const nz = wobbler(rng), bx = (rng() - 0.5) * 2, bz = (rng() - 0.5) * 2;
  const bl = Math.hypot(bx, bz) || 1;
  const pos = [], nor = [], uvs = [], idx = [];
  const rm = (r0 + r1) / 2, uOff = rng() * 3, vOff = rng() * 5;
  const ringPts = [];
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1), y = t * len;
    const bend1 = Math.sin(Math.PI * t) * bend * len;
    const cx = bx / bl * bend1, cz = bz / bl * bend1;
    const r = r0 + (r1 - r0) * t;
    const pts = [];
    for (let j = 0; j <= seg; j++) {
      const a = (j % seg) / seg * TAU;
      let rr = r * (1 + wob * nz(a, y * 3));
      if (flat) rr *= 1 - flat * Math.max(0, -Math.sin(a)) ** 4; // a flattened underside
      const x = cx + Math.cos(a) * rr, z = cz - Math.sin(a) * rr;
      pos.push(x, y, z);
      nor.push(Math.cos(a), (r0 - r1) / len, -Math.sin(a));
      uvs.push(uOff + j / seg * TAU * rm, vOff + y);
      pts.push([x, y, z]);
    }
    ringPts.push(pts);
  }
  const row = seg + 1;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const side = finish(pos, nor, uvs, idx);
  let capG = null;
  if (caps) capG = mergeGeometries([disc(ringPts[0], -1), disc(ringPts[rings - 1], 1)]);
  return { side, caps: capG };
}

// a flat end disc from a ring of points (dir: +1 faces +Y, −1 faces −Y); uv centred, in metres
function disc(pts, dir) {
  const n = pts.length - 1;
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < n; j++) { cx += pts[j][0]; cy += pts[j][1]; cz += pts[j][2]; }
  cx /= n; cy /= n; cz /= n;
  const pos = [cx, cy, cz], uvs = [0, 0], idx = [];
  for (let j = 0; j <= n; j++) { pos.push(...pts[j]); uvs.push(pts[j][0] - cx, pts[j][2] - cz); }
  for (let j = 1; j <= n; j++) dir > 0 ? idx.push(0, j, j + 1) : idx.push(0, j + 1, j);
  const g = finish(pos, null, uvs, idx);
  return g;
}

/** Adds a log from a to b into bucket (side → sideMat, caps → capMat). */
export function addLog(bucket, a, b, r0, r1, rng, sideMat, capMat, opts = {}, tint) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const { side, caps } = logGeo(len, r0, r1, rng, { ...opts, caps: !!capMat });
  const m = along(a, b, rng() * TAU);
  const t = tint || jitterTint(rng, 0.1);
  bucket.add(side, sideMat, m, t);
  if (caps) bucket.add(caps, capMat, m, t);
}

export function jitterTint(rng, k = 0.1, base = [1, 1, 1]) {
  const v = 1 + (rng() - 0.5) * 2 * k, w = (rng() - 0.5) * k * 0.6;
  return [base[0] * v * (1 + w), base[1] * v, base[2] * v * (1 - w)];
}

/**
 * Split firewood along +Y: a sector of a log (angle `ang`, radius r) — returns
 * { bark (outer arc), split (two radial faces), ends (end grain) }.
 */
export function splitGeo(len, r, ang, rng, k = 5) {
  const pts = [[0, 0]];
  const a0 = -ang / 2;
  for (let i = 0; i <= k; i++) {
    const a = a0 + ang * i / k;
    const rr = r * (1 + (rng() - 0.5) * 0.08);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  // shift so the piece sits about its centroid
  let mx = 0, mz = 0;
  for (const p of pts) { mx += p[0]; mz += p[1]; }
  mx /= pts.length; mz /= pts.length;
  for (const p of pts) { p[0] -= mx; p[1] -= mz; }
  const skew = (rng() - 0.5) * 0.04;
  const quad = (A, B, out) => {
    // a strip from A to B along the length (2 rings)
    const pos = [], uvs = [], idx = [];
    const w = Math.hypot(B[0] - A[0], B[1] - A[1]);
    pos.push(A[0], 0, A[1], B[0], 0, B[1], A[0] + skew, len, A[1], B[0] + skew, len, B[1]);
    uvs.push(0, 0, w, 0, 0, len, w, len);
    idx.push(0, 2, 1, 1, 2, 3);
    out.push(finish(pos, null, uvs, idx));
  };
  const bark = [], split = [];
  quad(pts[0], pts[1], split);
  for (let i = 1; i < pts.length - 1; i++) quad(pts[i], pts[i + 1], bark);
  quad(pts[pts.length - 1], pts[0], split);
  const cap = (y, dir, dx) => {
    const pos = [], uvs = [], idx = [];
    for (const p of pts) { pos.push(p[0] + dx, y, p[1]); uvs.push(p[0] + mx, p[1] + mz); }
    for (let i = 1; i < pts.length - 1; i++) dir > 0 ? idx.push(0, i + 1, i) : idx.push(0, i, i + 1);
    return finish(pos, null, uvs, idx);
  };
  return {
    bark: mergeGeometries(bark.map((g) => g.toNonIndexed())),
    split: mergeGeometries(split.map((g) => g.toNonIndexed())),
    ends: mergeGeometries([cap(0, -1, 0).toNonIndexed(), cap(len, 1, skew).toNonIndexed()]),
  };
}

/** A body of revolution from [[r, y], ...] with uv in metres (u around, v along the profile). */
export function lathe(profile, seg = 20, rng, wob = 0) {
  const nz = rng ? wobbler(rng) : null;
  const pos = [], uvs = [], idx = [];
  let arc = 0;
  const rmax = Math.max(...profile.map((p) => p[0]));
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i];
    if (i) arc += Math.hypot(r - profile[i - 1][0], y - profile[i - 1][1]);
    for (let j = 0; j <= seg; j++) {
      const a = (j % seg) / seg * TAU;
      const rr = r * (1 + (nz ? wob * nz(a, y * 4) : 0));
      pos.push(Math.cos(a) * rr, y, -Math.sin(a) * rr);
      uvs.push(j / seg * TAU * rmax, arc);
    }
  }
  const row = seg + 1;
  for (let i = 0; i < profile.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * row + j, b = a + row;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = finish(pos, null, uvs, idx);
  weld(g, profile.length, row);
  return g;
}
function weld(g, rings, row) {
  const n = g.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * row, b = a + row - 1;
    _v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
    n.setXYZ(a, _v.x, _v.y, _v.z); n.setXYZ(b, _v.x, _v.y, _v.z);
  }
}

/** Box-projected uvs in metres (for primitives whose own uvs are 0..1). */
export function boxUV(g, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uvs[i * 2] = u * scale; uvs[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/** A displaced blob (stones, clods, heaps): an icosphere scaled to (sx, sy, sz) with noise. */
export function blob(sx, sy, sz, rng, { detail = 2, rough = 0.18, flatBottom = true } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const f = [rng() * 9, rng() * 9, rng() * 9];
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const d = 1 + rough * (Math.sin(_v.x * 3.1 + f[0]) * Math.sin(_v.y * 2.7 + f[1]) * Math.sin(_v.z * 3.3 + f[2]) + 0.5 * Math.sin(_v.x * 7 + _v.z * 5 + f[1]) * 0.5);
    _v.multiplyScalar(d);
    if (flatBottom && _v.y < -0.15) _v.y = -0.15 + (_v.y + 0.15) * 0.15;
    p.setXYZ(i, _v.x * sx, (_v.y + 0.15) * sy, _v.z * sz);
  }
  g.computeVertexNormals();
  return boxUV(g.toNonIndexed ? g : g, 1);
}

/** A tube along a curve (ropes, hoops, lashings). */
export function tube(points, r, seg = 5, closed = false, tubular) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed);
  const len = curve.getLength();
  const g = new THREE.TubeGeometry(curve, tubular || Math.max(4, Math.ceil(len / 0.08)), r, seg, closed);
  const uvA = g.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getY(i) * TAU * r, uvA.getX(i) * len);
  return g;
}

/**
 * A ground decal: a polygon-free patch (ellipse) or a ribbon along a polyline, draped on the ground
 * with `lift` metres clearance. edge attribute: 0 at the border, 1 inside.
 */
export function patchGeo(ground, cx, cz, rx, rz, rot = 0, res = 18, lift = 0.025) {
  const pos = [], uvs = [], edge = [], idx = [];
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let j = 0; j <= res; j++) for (let i = 0; i <= res; i++) {
    const u = i / res * 2 - 1, v = j / res * 2 - 1;
    const lx = u * rx, lz = v * rz;
    const x = cx + lx * c - lz * s, z = cz + lx * s + lz * c;
    pos.push(x, ground(x, z) + lift, z);
    uvs.push(x, z);
    edge.push(Math.max(0, 1 - Math.hypot(u, v)) * 1.6);
  }
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const a = j * (res + 1) + i, b = a + res + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = finish(pos, null, uvs, idx);
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
  return g;
}

export function ribbonGeo(ground, pts, width, rng, { step = 0.5, lift = 0.03, across = 4 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength();
  const n = Math.max(2, Math.ceil(len / step));
  const pos = [], uvs = [], edge = [], idx = [];
  const nz = wobbler(rng, 3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const nx = -tg.z, nzv = tg.x;
    const w = width * (1 + 0.25 * nz(t * 9, 0)) * (i === 0 || i === n ? 0.6 : 1);
    const off = 0.15 * nz(t * 5 + 2, 1);
    const endFade = Math.min(1, Math.min(t, 1 - t) * len / 2.5);
    for (let k = 0; k <= across; k++) {
      const f = k / across * 2 - 1;
      const x = p.x + nx * (f * w / 2 + off), z = p.z + nzv * (f * w / 2 + off);
      pos.push(x, ground(x, z) + lift, z);
      uvs.push(x, z);
      edge.push((1 - Math.abs(f)) * 1.5 * endFade);
    }
  }
  const r = across + 1;
  for (let i = 0; i < n; i++) for (let k = 0; k < across; k++) {
    const a = i * r + k, b = a + r;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = finish(pos, null, uvs, idx);
  // keep normals up (the ground mesh shades the slope; the decal just colours it)
  const nm = g.attributes.normal;
  for (let i = 0; i < nm.count; i++) { _v.fromBufferAttribute(nm, i); if (_v.y < 0) _v.negate(); nm.setXYZ(i, _v.x, _v.y, _v.z); }
  g.setAttribute('edge', new THREE.Float32BufferAttribute(edge, 1));
  return g;
}

/** Rail fence (сигиэһин күрүө) along a polyline: paired stakes every ~3 m, 2–3 rails, willow lashings. */
export function fence(bucket, ground, pts, rng, mats, { rails = [0.42, 0.82, 1.2], bay = 3, gaps = [], closed = false } = {}) {
  const colliders = [];
  const P = closed ? [...pts, pts[0]] : pts;
  for (let s = 0; s < P.length - 1; s++) {
    const [ax, az] = P[s], [bx, bz] = P[s + 1];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / bay));
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz, nz = dx;
    const posts = [];
    for (let i = 0; i <= n; i++) {
      if (s > 0 && i === 0) { posts.push(null); continue; } // shared with previous segment
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      posts.push([x, z]);
    }
    for (let i = 0; i < posts.length; i++) {
      if (!posts[i]) continue;
      const [x, z] = posts[i];
      if (gaps.some((g) => Math.hypot(g[0] - x, g[1] - z) < g[2] * 0.3)) continue;
      const y = ground(x, z);
      // two stakes leaning slightly together across the line
      for (const side of [-1, 1]) {
        const h = 1.45 + rng() * 0.2, lean = 0.05 + rng() * 0.03;
        const bx0 = x + nx * side * 0.11, bz0 = z + nz * side * 0.11;
        addLog(bucket, [bx0, y - 0.15, bz0], [x - nx * side * lean + dx * (rng() - 0.5) * 0.05, y + h, z - nz * side * lean], 0.055 + rng() * 0.012, 0.042, rng, mats.wood, mats.end, { seg: 7, step: 0.4 });
      }
      // willow-bark lashings binding the stakes under each rail
      for (const ry of rails) {
        const ly = y + ry - 0.06;
        bucket.add(new THREE.TorusGeometry(0.15, 0.012, 4, 10), mats.lash, mtx([x, ly, z], [Math.PI / 2, 0, Math.atan2(dz, dx)], [1, 1, 0.6]), jitterTint(rng, 0.15));
      }
    }
    // rails between successive posts, overlapping at the stakes; one bay is open where a gap lies
    for (let i = 0; i < posts.length - 1; i++) {
      const A = posts[i] || P[s], B = posts[i + 1];
      const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2;
      const gap = gaps.find((g) => Math.hypot(g[0] - mx, g[1] - mz) < g[2]);
      if (gap) {
        // slid-out gate rails lying in the grass beside the gap
        for (let k = 0; k < 2; k++) {
          const ox = nx * (0.6 + k * 0.25), oz = nz * (0.6 + k * 0.25);
          addLog(bucket, [A[0] + ox, ground(A[0] + ox, A[1] + oz) + 0.05, A[1] + oz], [B[0] + ox + dx * 0.4, ground(B[0] + ox, B[1] + oz) + 0.05, B[1] + oz + dz * 0.4], 0.05, 0.04, rng, mats.wood, mats.end, { seg: 6, step: 0.6 });
        }
        continue;
      }
      const ya = ground(A[0], A[1]), yb = ground(B[0], B[1]);
      for (const ry of rails) {
        if (rng() < 0.04) continue; // a missing rail here and there
        const sag = (rng() - 0.3) * 0.05;
        const ex = dx * 0.3, ez = dz * 0.3;
        const fresh = rng() < 0.08;
        addLog(bucket, [A[0] - ex, ya + ry + sag, A[1] - ez], [B[0] + ex, yb + ry - sag, B[1] + ez], 0.05 + rng() * 0.012, 0.038, rng, fresh ? mats.fresh : mats.wood, mats.end, { seg: 7, step: 0.5, bend: 0.006 });
      }
      const L2 = Math.hypot(B[0] - A[0], B[1] - A[1]);
      colliders.push({ x: mx, z: mz, hw: L2 / 2, hd: 0.15, rot: -Math.atan2(B[1] - A[1], B[0] - A[0]) });
    }
  }
  return colliders;
}

/**
 * A sub-frame of a bucket: build a piece in its own local space (origin x, z on the ground, turned by yaw)
 * and it lands in the bucket's space. ground(lx, lz) and tw(lx, lz) work in the sub-frame.
 */
export function frame(bucket, x, z, yaw = 0) {
  const F = mtx([x, 0, z], [0, yaw, 0]);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const tw = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  return {
    add: (g, mat, m, t) => bucket.add(g, mat, m ? F.clone().multiply(m) : F.clone(), t),
    ground: (lx, lz) => { const [wx, wz] = tw(lx, lz); return bucket.ground(wx, wz); },
    tw, yaw, F,
    // a collider from this frame into the bucket's space
    col: (k) => { const [wx, wz] = tw(k.x, k.z); return k.r !== undefined ? { ...k, x: wx, z: wz } : { ...k, x: wx, z: wz, rot: (k.rot || 0) + yaw }; },
  };
}

/** A sheet bent into a spiral roll (birch-bark roll): height h, inner radius r0, turns, along +Y. */
export function rollGeo(h, r0, turns, gap = 0.006, seg = 40) {
  const pos = [], uvs = [], idx = [];
  const n = Math.ceil(seg * turns);
  let arc = 0, px = 0, pz = 0;
  for (let i = 0; i <= n; i++) {
    const a = i / seg * TAU;
    const r = r0 + gap * a / TAU;
    const x = Math.cos(a) * r, z = -Math.sin(a) * r;
    if (i) arc += Math.hypot(x - px, z - pz);
    px = x; pz = z;
    pos.push(x, 0, z, x, h, z);
    uvs.push(arc, 0, arc, h);
  }
  for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return finish(pos, null, uvs, idx);
}

/** A thin sheet (w × d, in x/z) with curl along x and random warping; grid res. */
export function sheetGeo(w, d, rng, { curl = 0.08, warp = 0.015, res = 8 } = {}) {
  const g = new THREE.PlaneGeometry(w, d, res, res);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uvA = g.attributes.uv;
  const f = rng() * 9;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const y = curl * (2 * x / w) ** 2 + warp * Math.sin(x * 7 + f) * Math.sin(z * 5 + f);
    p.setY(i, y);
    uvA.setXY(i, x, z);
  }
  g.computeVertexNormals();
  return g;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A piece's geometry as a baked section (src/load/geocache.js): fn only adds to buckets and pushes onto
// K.colliders (kept as data); returns fn's value (plain data). Meshes, lights and updaters stay outside.
export function geoPiece(K, fn) {
  const { cols, v } = section(() => {
    const keep = K.colliders, out = K.colliders = [];
    try { return { cols: out, v: fn() }; } finally { K.colliders = keep; }
  });
  K.colliders.push(...cols);
  return v;
}
