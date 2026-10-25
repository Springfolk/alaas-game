// Geometry helpers for the ураһа: tubes along paths, lathes, grids, merging by material.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TAU = Math.PI * 2;
const KEEP = ['position', 'normal', 'uv'];

// Keep only the shared attributes (so geometries merge), indexed.
export function clean(g, extra = []) {
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k) && !extra.includes(k)) g.deleteAttribute(k);
  if (!g.index) {
    const n = g.attributes.position.count, idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export function merge(list, extra = []) {
  const gs = list.filter(Boolean).map((g) => clean(g, extra));
  if (!gs.length) return null;
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  return m;
}

// Apply a transform: { p: [x,y,z], r: [x,y,z] euler, ry, s: number|[x,y,z] }
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function xf(g, { p = [0, 0, 0], r, ry, s = 1 } = {}) {
  _e.set(r ? r[0] : 0, r ? r[1] : (ry || 0), r ? r[2] : 0, 'YXZ');
  _q.setFromEuler(_e);
  _s.set(...(Array.isArray(s) ? s : [s, s, s]));
  _m.compose(_v.set(...p), _q, _s);
  g.applyMatrix4(_m);
  return g;
}

// A tube along a polyline of Vector3 with rotation-minimising frames.
// radius(t, a, i) → radius at path fraction t (0..1), angle a; uv.x around (0..1), uv.y = length in metres.
export function tube(path, radius, radial = 8, { capStart = false, capEnd = false, uvScale = 1 } = {}) {
  const n = path.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    T.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  // initial normal: any vector perpendicular to the first tangent
  const up = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(new THREE.Vector3().crossVectors(T[0], up).normalize());
  B.push(new THREE.Vector3().crossVectors(T[0], N[0]));
  for (let i = 1; i < n; i++) {
    const nn = N[i - 1].clone().sub(T[i].clone().multiplyScalar(N[i - 1].dot(T[i]))).normalize();
    N.push(nn);
    B.push(new THREE.Vector3().crossVectors(T[i], nn));
  }
  const pos = [], nor = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i < n; i++) {
    if (i) len += path[i].distanceTo(path[i - 1]);
    const t = i / (n - 1);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const c = Math.cos(a), s = Math.sin(a);
      const r = radius(t, a, i);
      const nx = N[i].x * c + B[i].x * s, ny = N[i].y * c + B[i].y * s, nz = N[i].z * c + B[i].z * s;
      pos.push(path[i].x + nx * r, path[i].y + ny * r, path[i].z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(j / radial, len * uvScale);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const cap = (i, dir) => {
    const base = pos.length / 3, t = i / (n - 1), tn = T[i].clone().multiplyScalar(dir);
    pos.push(path[i].x, path[i].y, path[i].z); nor.push(tn.x, tn.y, tn.z); uv.push(0.5, 0.5);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a), r = radius(t, a, i);
      pos.push(path[i].x + (N[i].x * c + B[i].x * s) * r, path[i].y + (N[i].y * c + B[i].y * s) * r, path[i].z + (N[i].z * c + B[i].z * s) * r);
      nor.push(tn.x, tn.y, tn.z); uv.push(0.5 + c * r * 2, 0.5 + s * r * 2);
    }
    for (let j = 0; j < radial; j++) dir > 0 ? idx.push(base, base + 1 + j, base + 2 + j) : idx.push(base, base + 2 + j, base + 1 + j);
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(n - 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // smooth normals that follow the radius changes
  g.computeVertexNormals();
  fixSeam(g, radial, n);
  return g;
}

// Lathe from [[r, y], ...] (bottom → top); uv.x around, uv.y = profile fraction.
// rFn(r, y, a) may perturb the radius per angle.
export function lathe(prof, segs = 24, rFn) {
  const pos = [], uv = [], idx = [];
  const n = prof.length;
  let tot = 0; const acc = [0];
  for (let i = 1; i < n; i++) { tot += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]); acc.push(tot); }
  for (let i = 0; i < n; i++) for (let j = 0; j <= segs; j++) {
    const a = (j / segs) * TAU;
    const r = rFn ? rFn(prof[i][0], prof[i][1], a, i) : prof[i][0];
    pos.push(Math.cos(a) * r, prof[i][1], Math.sin(a) * r);
    uv.push(j / segs, acc[i] / (tot || 1));
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) {
    const a = i * (segs + 1) + j, b = a + segs + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixSeam(g, segs, n);
  return g;
}

// average normals across the lathe seam (j = 0 and j = segs share a position)
function fixSeam(g, segs, rows) {
  const nm = g.attributes.normal;
  for (let i = 0; i < rows; i++) {
    const a = i * (segs + 1), b = a + segs;
    const x = nm.getX(a) + nm.getX(b), y = nm.getY(a) + nm.getY(b), z = nm.getZ(a) + nm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nm.setXYZ(a, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l);
  }
}

// A grid surface: f(u, v) → [x, y, z] for u in 0..nu, v in 0..nv; uvFn(u, v) → [s, t].
export function grid(nu, nv, f, uvFn, flip = false) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = f(i / nu, j / nv); pos.push(p[0], p[1], p[2]);
    const t = uvFn ? uvFn(i / nu, j / nv) : [i / nu, j / nv]; uv.push(t[0], t[1]);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + nu + 1;
    flip ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A rounded box (bevelled edges catch light): w × h × d centred, bevel b.
function rbox(w, h, d, b = 0.008, seg = 1) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  if (b <= 0) return g;
  // pull vertices onto a rounded box: simple approach, shrink then push along clamped normal
  const p = g.attributes.position, hw = w / 2 - b, hh = h / 2 - b, hd = d / 2 - b;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    v.sub(c).normalize().multiplyScalar(b).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Box along a segment a→b (thickness w × h), for planks and beams.
export function beam(a, b, w, h, bevel = 0.006, up = new THREE.Vector3(0, 1, 0)) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = rbox(len, h, w, bevel);
  // map uv.y along the length in metres for wood grain
  const dir = B.clone().sub(A).normalize();
  const side = new THREE.Vector3().crossVectors(dir, up);
  if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
  side.normalize();
  const upv = new THREE.Vector3().crossVectors(side, dir).normalize();
  const m = new THREE.Matrix4().makeBasis(dir, upv, side);
  m.setPosition(A.clone().add(B).multiplyScalar(0.5));
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getY(i) + p.getZ(i)) * 2 + 0.5, p.getX(i) + len / 2);
  g.applyMatrix4(m);
  return g;
}
