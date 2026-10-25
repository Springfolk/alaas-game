// Geometry for the yard models (serge, ampaar, kuruo, sele): turned/hewn logs and poles with
// irregular radius, taper and bend; tubes along curves (ropes, hoops); orientation and merging.
// Every builder returns indexed BufferGeometry with position, normal, uv, color, so any of them merge.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

// Smooth periodic noise around a circle that also drifts along y: a few random sines.
function ringNoise(rng, n = 5) {
  const k = [];
  for (let i = 0; i < n; i++) k.push({ f: 1 + Math.floor(rng() * (2 + i * 1.6)), p: rng() * TAU, a: (rng() * 0.6 + 0.4) / (1 + i), fy: (rng() - 0.5) * 3 });
  return (a, y) => { let s = 0; for (const q of k) s += q.a * Math.sin(q.f * a + q.p + y * q.fy); return s; };
}

// A body of revolution with irregularities.
// profile: [[y, r], ...] (y may fold back, e.g. into a cup); radial: segments around.
// opts.carve(y, a, r) → radius offset (grooves, relief); opts.color(y, a, out[3]) → vertex colour;
// opts.bend(y) → [dx, dz] centre offset; noise: relative radius wobble; oval: 2-lobe ovality.
export function turned(profile, opts = {}) {
  const { radial = 14, rng = Math.random, noise = 0.035, oval = 0.05, bend, carve, color, tileU = 0.45, tileV = 0.7, capTop = false, capBottom = false } = opts;
  const nz = ringNoise(rng), ovPhase = rng() * TAU, uOff = rng(), vOff = rng() * 3;
  const meanR = profile.reduce((s, p) => s + p[1], 0) / profile.length;
  const uTiles = Math.max(1, Math.round((TAU * meanR) / tileU));
  const pos = [], uv = [], col = [], idx = [];
  const c = [1, 1, 1];
  let arc = 0;
  for (let i = 0; i < profile.length; i++) {
    const [y, r] = profile[i];
    if (i) arc += Math.hypot(y - profile[i - 1][0], r - profile[i - 1][1]);
    const [bx, bz] = bend ? bend(y) : [0, 0];
    for (let j = 0; j <= radial; j++) {
      const a = (j % radial) / radial * TAU;
      let rr = r * (1 + noise * nz(a, y) + oval * Math.cos(2 * (a - ovPhase)));
      if (carve) rr += carve(y, a, r);
      rr = Math.max(rr, 0.0005);
      pos.push(bx + Math.cos(a) * rr, y, bz - Math.sin(a) * rr);
      uv.push(uOff + (j / radial) * uTiles, vOff + arc / tileV);
      c[0] = c[1] = c[2] = 1;
      if (color) color(y, a, c);
      col.push(c[0], c[1], c[2]);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < profile.length - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const caps = [];
  if (capBottom) caps.push([0, -1]);
  if (capTop) caps.push([profile.length - 1, 1]);
  for (const [ri, dir] of caps) {
    const base = pos.length / 3, start = ri * row;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < radial; j++) { cx += pos[(start + j) * 3]; cy += pos[(start + j) * 3 + 1]; cz += pos[(start + j) * 3 + 2]; }
    cx /= radial; cy /= radial; cz /= radial;
    // end grain: a separate ring of verts so the cap gets its own flat normal
    for (let j = 0; j <= radial; j++) {
      const k = (start + (j % radial)) * 3;
      pos.push(pos[k], pos[k + 1], pos[k + 2]);
      uv.push((pos[k] - cx) * 2 + 0.5, (pos[k + 2] - cz) * 2 + 0.5);
      col.push(0.62, 0.6, 0.57);
    }
    pos.push(cx, cy, cz); uv.push(0.5, 0.5); col.push(0.55, 0.52, 0.48);
    const ctr = base + row;
    for (let j = 0; j < radial; j++) dir > 0 ? idx.push(base + j, base + j + 1, ctr) : idx.push(base + j + 1, base + j, ctr);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  weldSeam(g, profile.length, row);
  return g;
}

// average the normals of the duplicated seam column so a log has no visible seam
function weldSeam(g, rings, row) {
  const n = g.attributes.normal;
  for (let i = 0; i < rings; i++) {
    const a = i * row, b = a + row - 1;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}

// A plain log/pole profile: length L, radii r0 → r1, sampled every `step` metres (+ extra ys).
export function logProfile(L, r0, r1, { step = 0.25, flare = 0, extra = [] } = {}) {
  const ys = new Set([0, L, ...extra]);
  for (let y = step; y < L; y += step) ys.add(+y.toFixed(4));
  return [...ys].sort((a, b) => a - b).map((y) => {
    const t = y / L;
    return [y, r0 + (r1 - r0) * t + flare * Math.exp(-y * 6)];
  });
}

// Random gentle bow of a log: returns bend(y) for turned().
export function bow(rng, L, amount = 0.02) {
  const ax = (rng() - 0.5) * 2 * amount, az = (rng() - 0.5) * 2 * amount, k = 0.6 + rng() * 0.8;
  return (y) => { const s = Math.sin(Math.PI * Math.min(Math.max(y / L, 0), 1)); return [ax * s, az * Math.pow(s, k)]; };
}

// Bake a transform that takes the +Y axis of a geometry from `a` to `b` (points), with a roll.
export function orient(g, a, b, roll = 0) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A);
  const L = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const m = new THREE.Matrix4().makeRotationY(roll);
  m.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
  m.premultiply(new THREE.Matrix4().makeTranslation(A.x, A.y, A.z));
  g.applyMatrix4(m);
  return L;
}

// A tube along points (array of Vector3/[x,y,z]); uv.x around 0..1, uv.y = metres along.
// radius: number or (t, i) => r. Parallel-transport frames, so twists read correctly.
export function tube(points, radius, { radial = 6, color, closed = false } = {}) {
  const P = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  const n = P.length;
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, n - 1)];
    T.push(b.clone().sub(a).normalize());
  }
  let ref = Math.abs(T[0].y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(ref.clone().cross(T[0]).normalize());
  B.push(T[0].clone().cross(N[0]));
  for (let i = 1; i < n; i++) {
    const v = B[i - 1].clone().cross(T[i]);
    const nn = v.lengthSq() < 1e-10 ? N[i - 1].clone() : T[i].clone().cross(v).normalize().negate();
    // project previous normal (parallel transport)
    const pn = N[i - 1].clone().sub(T[i].clone().multiplyScalar(N[i - 1].dot(T[i]))).normalize();
    N.push(pn.lengthSq() > 0.5 ? pn : nn);
    B.push(T[i].clone().cross(N[i]));
  }
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let s = 0;
  const c = [1, 1, 1];
  for (let i = 0; i < n; i++) {
    if (i) s += P[i].distanceTo(P[i - 1]);
    const r = typeof radius === 'function' ? radius(i / (n - 1), i) : radius;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      const nx = N[i].x * Math.cos(a) + B[i].x * Math.sin(a), ny = N[i].y * Math.cos(a) + B[i].y * Math.sin(a), nz = N[i].z * Math.cos(a) + B[i].z * Math.sin(a);
      pos.push(P[i].x + nx * r, P[i].y + ny * r, P[i].z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(j / radial, s);
      c[0] = c[1] = c[2] = 1;
      if (color) color(i / (n - 1), j / radial, c);
      col.push(c[0], c[1], c[2]);
    }
  }
  const row = radial + 1;
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * row + j, b = a + row;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  if (closed) for (let j = 0; j < radial; j++) { const a = (n - 1) * row + j; idx.push(a, a + 1, j, a + 1, j + 1, j); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// A rope hanging between two points: a catenary-ish sag, sampled every `step` metres.
export function sagCurve(a, b, sag, step = 0.08, wobble = 0, rng = Math.random) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const L = A.distanceTo(B), n = Math.max(2, Math.ceil(L / step));
  const ph = rng() * TAU, side = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3(0, 1, 0)).normalize();
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = A.clone().lerp(B, t);
    p.y -= sag * 4 * t * (1 - t) * (1 - 0.15 * Math.sin(Math.PI * t));
    if (wobble) p.addScaledVector(side, wobble * Math.sin(t * 9 + ph) * 4 * t * (1 - t));
    out.push(p);
  }
  return out;
}

// A flat strip (ribbon, strap, bark band) along points, width w, facing `up` side; uv.y metres.
export function strip(points, width, { color, twist = 0, up = [0, 0, 1] } = {}) {
  const P = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)));
  const U = new THREE.Vector3(...up).normalize();
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let s = 0;
  const c = [1, 1, 1];
  for (let i = 0; i < P.length; i++) {
    if (i) s += P[i].distanceTo(P[i - 1]);
    const t = P[Math.min(i + 1, P.length - 1)].clone().sub(P[Math.max(i - 1, 0)]).normalize();
    let side = t.clone().cross(U).normalize();
    if (twist) side.applyAxisAngle(t, twist * (i / (P.length - 1)));
    const n = side.clone().cross(t).normalize();
    const w = typeof width === 'function' ? width(i / (P.length - 1)) : width;
    for (const k of [-0.5, 0.5]) {
      pos.push(P[i].x + side.x * w * k, P[i].y + side.y * w * k, P[i].z + side.z * w * k);
      nor.push(n.x, n.y, n.z);
      uv.push(k + 0.5, s);
      c[0] = c[1] = c[2] = 1;
      if (color) color(i / (P.length - 1), k + 0.5, c);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < P.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Box with uv in metres and a colour (planks, boards, the door).
export function board(w, h, d, { color = [1, 1, 1], tile = 1 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    // planar uv in metres: grain runs along the longest of the face's two axes
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const [a, b] = ax > 0.5 ? [p.getZ(i), p.getY(i)] : ay > 0.5 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    const along = (ax > 0.5 ? Math.max(d, h) === h : ay > 0.5 ? Math.max(w, d) === d : Math.max(w, h) === h);
    uv.setXY(i, (along ? a : b) / tile, (along ? b : a) / tile);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(p.count).fill(color).flat(), 3));
  return g;
}

export function merge(list) {
  const gs = list.filter(Boolean);
  if (!gs.length) return null;
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  return m;
}

export function tris(g) { return g ? (g.index ? g.index.count : g.attributes.position.count) / 3 : 0; }
