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
 * The bark is shaded round; each end is a saw cut a few degrees off square with an eased, slightly
 * domed rim (a flat, square end reads as a cardboard cut-out).
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
  // each end's cut plane: y = base + tx·x + tz·z (up to ~5° off square), from one rng draw per end
  const tilt = (s) => { const a = s * TAU * 7.31, m = 0.035 + 0.05 * ((s * 97.3) % 1); return [Math.cos(a) * m, Math.sin(a) * m]; };
  const T0 = tilt(rng()), T1 = tilt(rng());
  const yAt = (p, end) => (end ? len + T1[0] * p[0] + T1[1] * p[1] : T0[0] * p[0] + T0[1] * p[1]);
  const xAt = (p, end) => p[0] + (end ? skew : 0);
  const n = pts.length;
  // bark: one strip over the arc (pts 1 … n-1), normals from the pith (−mx, −mz)
  const bark = (() => {
    const pos = [], nor = [], uvs = [];
    let arc = 0;
    for (let i = 1; i < n; i++) {
      const p = pts[i];
      if (i > 1) arc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const nx = p[0] + mx, nz = p[1] + mz, nl = Math.hypot(nx, nz) || 1;
      for (const end of [0, 1]) { pos.push(xAt(p, end), yAt(p, end), p[1]); nor.push(nx / nl, 0, nz / nl); uvs.push(arc, end ? len : 0); }
    }
    const idx = [];
    for (let i = 0; i < n - 2; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    return finish(pos, nor, uvs, idx).toNonIndexed();
  })();
  // the two split faces (flat)
  const quad = (A, B) => {
    const w = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const pos = [xAt(A, 0), yAt(A, 0), A[1], xAt(B, 0), yAt(B, 0), B[1], xAt(A, 1), yAt(A, 1), A[1], xAt(B, 1), yAt(B, 1), B[1]];
    return finish(pos, null, [0, 0, w, 0, 0, len, w, len], [0, 2, 1, 1, 2, 3]).toNonIndexed();
  };
  const split = mergeGeometries([quad(pts[0], pts[1]), quad(pts[n - 1], pts[0])]);
  // an end: the rim ring on the cut, an inner ring drawn in by c and raised by c·0.5 (eased edge), fanned to its middle
  const c = Math.min(0.006, r * 0.07);
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= n; cz /= n;
  const cap = (end) => {
    const dir = end ? 1 : -1, pos = [], uvs = [], idx = [];
    const put = (x, z, lift) => {
      const p = [x, z];
      pos.push(xAt(p, end), yAt(p, end) + dir * lift, z); uvs.push(x + mx, z + mz);
    };
    for (const p of pts) put(p[0], p[1], 0);
    for (const p of pts) {
      const dx = cx - p[0], dz = cz - p[1], d = Math.hypot(dx, dz) || 1, s = Math.min(c, d * 0.4) / d;
      put(p[0] + dx * s, p[1] + dz * s, c * 0.5);
    }
    put(cx, cz, c * 0.8);
    const tri = (a, b, e) => (dir > 0 ? idx.push(a, e, b) : idx.push(a, b, e));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(i, j, n + i); tri(j, n + j, n + i); // rim band
      tri(n + i, n + j, 2 * n);               // face
    }
    return finish(pos, null, uvs, idx).toNonIndexed();
  };
  return { bark, split, ends: mergeGeometries([cap(0), cap(1)]) };
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
  // a ring on the axis (a closed bottom or top) has only degenerate triangles: take its neighbour ring's mean normal
  const n = g.attributes.normal;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i][0] > 1e-6) continue;
    const k = i > 0 ? i - 1 : i + 1;
    if (k >= profile.length) continue;
    _v.set(0, 0, 0);
    for (let j = 0; j < seg; j++) _v.x += n.getX(k * row + j), _v.y += n.getY(k * row + j), _v.z += n.getZ(k * row + j);
    _v.normalize();
    for (let j = 0; j <= seg; j++) n.setXYZ(i * row + j, _v.x, _v.y, _v.z);
  }
  return g;
}
/**
 * The fill of a lathed vessel (water, coal, grain): a disc whose rim follows the vessel's inner wall between
 * profile points a and b at fraction t (so it meets the wobbled wall all round), domed by `mound` in the middle
 * and roughened by `lump` (metres). Call before the vessel goes into a bucket. uv: x/z in metres.
 */
export function fillLathe(g, seg, a, b, t, { mound = 0, lump = 0, inset = 0.997, rings = 4 } = {}) {
  const P = g.attributes.position, row = seg + 1;
  const pos = [[0, 0, 0]], idx = [];
  let y0 = 0;
  const rim = [];
  for (let j = 0; j < seg; j++) {
    const A = a * row + j, B = b * row + j;
    const x = P.getX(A) + (P.getX(B) - P.getX(A)) * t, y = P.getY(A) + (P.getY(B) - P.getY(A)) * t, z = P.getZ(A) + (P.getZ(B) - P.getZ(A)) * t;
    rim.push([x * inset, y, z * inset]); y0 += y / seg;
  }
  pos[0] = [0, y0 + mound, 0];
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    for (let j = 0; j < seg; j++) {
      const [x, y, z] = rim[j];
      const bump = k < rings ? lump * Math.sin(j * 2.7 + k * 4.1) * Math.sin(j * 1.3 - k * 2.3) : 0;
      pos.push([x * f, y0 + (y - y0) * f + mound * (1 - f * f) + bump, z * f]);
    }
  }
  const at = (k, j) => (k === 0 ? 0 : 1 + (k - 1) * seg + (j % seg));
  for (let j = 0; j < seg; j++) idx.push(0, at(1, j), at(1, j + 1));
  for (let k = 1; k < rings; k++) for (let j = 0; j < seg; j++) {
    idx.push(at(k, j), at(k + 1, j), at(k + 1, j + 1), at(k, j), at(k + 1, j + 1), at(k, j + 1));
  }
  // facing up: check the first triangle and flip all if needed
  const [p0, p1, p2] = [pos[idx[0]], pos[idx[1]], pos[idx[2]]];
  const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
  if (ny < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  return finish(pos.flat(), null, pos.flatMap((p) => [p[0], p[2]]), idx);
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
        addLog(bucket, [bx0, y - 0.15, bz0], [x - nx * side * lean + dx * (rng() - 0.5) * 0.05, y + h, z - nz * side * lean], 0.055 + rng() * 0.012, 0.042, rng, mats.wood, mats.end, { seg: 6, step: 0.8 });
      }
      // willow-bark lashings binding the stakes under each rail
      for (const ry of rails) {
        const ly = y + ry - 0.06;
        bucket.add(new THREE.TorusGeometry(0.15, 0.012, 3, 8), mats.lash, mtx([x, ly, z], [Math.PI / 2, 0, Math.atan2(dz, dx)], [1, 1, 0.6]), jitterTint(rng, 0.15));
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
          addLog(bucket, [A[0] + ox, ground(A[0] + ox, A[1] + oz) + 0.05, A[1] + oz], [B[0] + ox + dx * 0.4, ground(B[0] + ox, B[1] + oz) + 0.05, B[1] + oz + dz * 0.4], 0.05, 0.04, rng, mats.wood, mats.end, { seg: 6, step: 1.0 });
        }
        continue;
      }
      const ya = ground(A[0], A[1]), yb = ground(B[0], B[1]);
      for (const ry of rails) {
        if (rng() < 0.04) continue; // a missing rail here and there
        const sag = (rng() - 0.3) * 0.05;
        const ex = dx * 0.3, ez = dz * 0.3;
        const fresh = rng() < 0.08;
        addLog(bucket, [A[0] - ex, ya + ry + sag, A[1] - ez], [B[0] + ex, yb + ry - sag, B[1] + ez], 0.05 + rng() * 0.012, 0.038, rng, fresh ? mats.fresh : mats.wood, mats.end, { seg: 6, step: 0.9, bend: 0.006 });
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

/**
 * A thin sheet (w × d, in x/z) with curl along x and random warping; grid res.
 * thick > 0: a closed slab instead — the underside offset down by `thick` (tinted by `under`) and the edges closed.
 */
export function sheetGeo(w, d, rng, { curl = 0.08, warp = 0.015, res = 8, thick = 0, under = [0.78, 0.62, 0.5] } = {}) {
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
  return thick > 0 ? slab(g, res, thick, under) : g;
}

// Closes a (res+1)² grid sheet into a slab of thickness t: top as is, bottom offset along −normal, rim strips.
function slab(g, res, t, under) {
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, n = P.count, row = res + 1;
  const pos = [], uvs = [], col = [], idx = [];
  const v = (i, down, u, w, c) => {
    pos.push(P.getX(i) - (down ? N.getX(i) * t : 0), P.getY(i) - (down ? N.getY(i) * t : 0), P.getZ(i) - (down ? N.getZ(i) * t : 0));
    uvs.push(u ?? U.getX(i), w ?? U.getY(i)); col.push(...c);
    return pos.length / 3 - 1;
  };
  const top = [1, 1, 1];
  for (let i = 0; i < n; i++) v(i, 0, null, null, top);
  for (let i = 0; i < n; i++) v(i, 1, null, null, under);
  const gi = g.index.array;
  for (let k = 0; k < gi.length; k += 3) {
    idx.push(gi[k], gi[k + 1], gi[k + 2]);
    idx.push(n + gi[k], n + gi[k + 2], n + gi[k + 1]);
  }
  // rim: walk the border; each edge a quad of its own (hard edge), turned to face away from the middle
  const loop = [];
  for (let i = 0; i < res; i++) loop.push(i);
  for (let j = 0; j < res; j++) loop.push(j * row + res);
  for (let i = res; i > 0; i--) loop.push(res * row + i);
  for (let j = res; j > 0; j--) loop.push(j * row);
  let mx = 0, mz = 0;
  for (let i = 0; i < n; i++) { mx += P.getX(i); mz += P.getZ(i); }
  mx /= n; mz /= n;
  let s = 0;
  for (let k = 0; k < loop.length; k++) {
    const a = loop[k], b = loop[(k + 1) % loop.length];
    const len = Math.hypot(P.getX(b) - P.getX(a), P.getZ(b) - P.getZ(a));
    const c = [(1 + under[0]) / 2, (1 + under[1]) / 2, (1 + under[2]) / 2];
    const a0 = v(a, 0, s, 0, c), b0 = v(b, 0, s + len, 0, c), a1 = v(a, 1, s, t, c), b1 = v(b, 1, s + len, t, c);
    s += len;
    // outward = away from the sheet's middle in x/z; flip the winding when the quad faces inward
    const ex = P.getX(b) - P.getX(a), ez = P.getZ(b) - P.getZ(a);
    const ox = (P.getX(a) + P.getX(b)) / 2 - mx, oz = (P.getZ(a) + P.getZ(b)) / 2 - mz;
    const nx = -ez, nz = ex; // the facing of (a0, a1, b0): down × edge
    if (nx * ox + nz * oz > 0) idx.push(a0, a1, b0, b0, a1, b1);
    else idx.push(a0, b0, a1, b0, b1, a1);
  }
  return finish(pos, null, uvs, idx, col);
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
