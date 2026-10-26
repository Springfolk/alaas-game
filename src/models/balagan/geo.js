// Geometry helpers for the balagan: irregular logs, lofted surfaces, buckets merged by material.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bucket, bucketReplay } from '../../load/geocache.js';

const V = THREE.Vector3;

// Collects geometries per material; every geometry gets position/normal/uv/color (+ declared extras).
export class Buckets {
  constructor() { this.map = new Map(); }
  add(mat, geo, { color = [1, 1, 1], extra = {} } = {}) {
    if (!geo || bucketReplay()) return; // replay: the merge comes baked (src/load/geocache.js)
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) {
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set(color, i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    for (const [k, v] of Object.entries(extra)) {
      if (g.attributes[k]) continue;
      const a = new Float32Array(n * v.length);
      for (let i = 0; i < n; i++) a.set(v, i * v.length);
      g.setAttribute(k, new THREE.BufferAttribute(a, v.length));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', ...Object.keys(extra), ...(mat.userData.attrs || [])].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    if (!this.map.has(mat)) this.map.set(mat, []);
    this.map.get(mat).push(g);
  }
  // Merged meshes into `parent`; returns { mat → mesh }.
  build(parent, { cast = true } = {}) {
    const out = new Map();
    const merged = bucket(() => [...this.map].map(([mat, list]) => {
      const geo = mergeGeometries(list, false);
      if (!geo) console.warn('merge failed', mat.name, list.map((g) => Object.keys(g.attributes).join()));
      return geo && [mat, geo];
    }).filter(Boolean));
    for (const [mat, geo] of merged) {
      if (mat.shadowSide == null && !mat.userData.noShadow) mat.shadowSide = THREE.DoubleSide;
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast && !mat.userData.noShadow;
      m.receiveShadow = true;
      m.name = mat.name;
      parent.add(m);
      out.set(mat, m);
    }
    this.map.clear();
    return out;
  }
}

// Transform a geometry in place by position/rotation(euler)/scale.
export function xf(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], order = 'XYZ' } = {}) {
  const m = new THREE.Matrix4().compose(new V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r, order)), new V(...s));
  geo.applyMatrix4(m);
  return geo;
}

// Box with uv in metres (so tiling textures keep real scale).
export function box(w, h, d, { p, r, seg = [1, 1, 1] } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, ...seg);
  metricUV(g, w, h, d);
  return p || r ? xf(g, { p, r }) : g;
}
function metricUV(g, w, h, d) {
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z; each face uv 0..1 → metres
  const uv = g.attributes.uv, per = uv.count / 6;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < per; i++) {
    const k = f * per + i;
    uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  }
}

// An irregular log from a to b: taper r0→r1, gentle bow, knobbly radius. u = around (m), v = along (m).
export function log(a, b, r0, r1, rng, { seg = 7, bow = 0.02, knob = 0.12, caps = false, capTop = 0, rowLen = 0.5 } = {}) {
  const A = new V(...a), B = new V(...b);
  const axis = B.clone().sub(A), len = axis.length();
  axis.normalize();
  const side = Math.abs(axis.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0);
  const n1 = new V().crossVectors(axis, side).normalize(), n2 = new V().crossVectors(axis, n1).normalize();
  const rows = Math.max(2, Math.ceil(len / rowLen));   // rowLen: metres per ring along the log
  const bowDir = n1.clone().multiplyScalar(Math.cos(rng() * 6.28)).addScaledVector(n2, Math.sin(rng() * 6.28));
  const bowAmt = (rng() - 0.3) * bow * len;
  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const pos = [], uv = [], idx = [];
  const ring = seg + 1;
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const c = A.clone().addScaledVector(axis, t * len).addScaledVector(bowDir, Math.sin(t * Math.PI) * bowAmt);
    let r = r0 + (r1 - r0) * t;
    if (capTop && t > 1 - capTop) r *= Math.max(0.05, (1 - t) / capTop); // pointed top
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const k = 1 + knob * (0.5 * Math.sin(th * 2 + ph[0] + t * 3) + 0.35 * Math.sin(th * 3 + ph[1] - t * 5) + 0.3 * Math.sin(t * 17 + ph[2]) * Math.sin(th + ph[2]));
      const d = n1.clone().multiplyScalar(Math.cos(th)).addScaledVector(n2, Math.sin(th));
      const p = c.clone().addScaledVector(d, r * k);
      pos.push(p.x, p.y, p.z);
      uv.push((i / seg) * 2 * Math.PI * r0, t * len);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) {
    const a0 = j * ring + i, a1 = a0 + 1, b0 = a0 + ring, b1 = b0 + 1;
    idx.push(a0, a1, b0, a1, b1, b0);   // counter-clockwise seen from outside: normals face out
  }
  if (caps) {
    for (const [j, flip] of [[0, true], [rows, false]]) {
      const c0 = pos.length / 3;
      const cc = j === 0 ? A : B.clone().addScaledVector(bowDir, 0);
      pos.push(cc.x, cc.y, cc.z); uv.push(0, 0);
      for (let i = 0; i < seg; i++) {
        const a0 = j * ring + i, a1 = a0 + 1;
        if (flip) idx.push(c0, a1, a0); else idx.push(c0, a0, a1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A grid surface from f(u, v) → [x, y, z] (u, v in 0..1); uv attribute from `uvf` or metres along the grid.
export function sheet(nu, nv, f, { uvf, skip, face } = {}) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = f(i / nu, j / nv);
    pos.push(p[0], p[1], p[2]);
    const t = uvf ? uvf(i / nu, j / nv, p) : [i / nu, j / nv];
    uv.push(t[0], t[1]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    if (skip && skip((i + 0.5) / nu, (j + 0.5) / nv)) continue;
    const a = j * (nu + 1) + i, b = a + nu + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (face) orient(g, face); else g.computeVertexNormals();
  return g;
}

// Flip the winding of an indexed geometry if its faces mostly point against face(x, y, z) → [dx, dy, dz].
export function orient(g, face) {
  const p = g.attributes.position.array, ix = g.index.array;
  let sum = 0;
  const a = new V(), b = new V(), c = new V();
  for (let i = 0; i < ix.length; i += 3) {
    a.fromArray(p, ix[i] * 3); b.fromArray(p, ix[i + 1] * 3); c.fromArray(p, ix[i + 2] * 3);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const m = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const d = face(m.x, m.y, m.z);
    sum += Math.sign(n.x * d[0] + n.y * d[1] + n.z * d[2]);
  }
  if (sum < 0) for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
  return g;
}

// Point on a rounded rectangle (half sizes hx, hz, corner radius rc) at perimeter fraction s ∈ [0,1).
// Returns [x, z, nx, nz]. Starts at +X middle, runs counter-clockwise seen from above (+X → −Z → −X → +Z).
export function rrect(hx, hz, rc, s) {
  const sx = hx - rc, sz = hz - rc;
  const L = [2 * sz, Math.PI * rc / 2, 2 * sx, Math.PI * rc / 2, 2 * sz, Math.PI * rc / 2, 2 * sx, Math.PI * rc / 2];
  const tot = L.reduce((a, b) => a + b, 0);
  let d = (((s % 1) + 1) % 1) * tot + sz; // start at the middle of the +X side
  d %= tot;
  let k = 0;
  while (d > L[k]) { d -= L[k]; k = (k + 1) % 8; }
  const t = d / L[k];
  switch (k) {
    case 0: return [hx, sz - 2 * sz * t, 1, 0];
    case 1: { const a = -Math.PI / 2 * t; return [sx + rc * Math.cos(a), -sz + rc * Math.sin(a), Math.cos(a), Math.sin(a)]; }
    case 2: return [sx - 2 * sx * t, -hz, 0, -1];
    case 3: { const a = -Math.PI / 2 - Math.PI / 2 * t; return [-sx + rc * Math.cos(a), -sz + rc * Math.sin(a), Math.cos(a), Math.sin(a)]; }
    case 4: return [-hx, -sz + 2 * sz * t, -1, 0];
    case 5: { const a = Math.PI - Math.PI / 2 * t; return [-sx + rc * Math.cos(a), sz + rc * Math.sin(a), Math.cos(a), Math.sin(a)]; }
    case 6: return [-sx + 2 * sx * t, hz, 0, 1];
    default: { const a = Math.PI / 2 - Math.PI / 2 * t; return [sx + rc * Math.cos(a), sz + rc * Math.sin(a), Math.cos(a), Math.sin(a)]; }
  }
}

// Smooth value noise (deterministic) for geometry.
export function vnoise(x, y, seed = 0) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
export function fbm2(x, y, seed = 0, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, seed + i * 31) * a; f *= 2.1; a *= 0.5; }
  return s;
}

// Lathe from a profile [[r, y], …] with metric uv.
export function lathe(profile, seg = 16, { phi0 = 0, phiLen = Math.PI * 2 } = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, phi0, phiLen);
  return g;
}

// Tube along points (array of [x,y,z]).
export function tube(points, r, seg = 6, closed = false, tubSeg) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new V(...p)), closed);
  return new THREE.TubeGeometry(c, tubSeg || Math.max(4, points.length * 4), r, seg, closed);
}
