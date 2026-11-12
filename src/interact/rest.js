// Where a loose thing comes to rest: every point of it on or over the ground, the lowest one touching, and its
// footprint clear of the other things lying about and of walls and posts. A thing's shape is its own vertices
// (visible meshes, decimated, in its own frame), read once.
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _pts = [];

export function hullOf(obj, n = 220) {
  if (obj.userData.hull) return obj.userData.hull;
  obj.updateWorldMatrix(true, true);
  _inv.copy(obj.matrixWorld).invert();
  const all = [];
  obj.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.material?.visible === false) return;
    const p = m.geometry.attributes.position;
    _m.multiplyMatrices(_inv, m.matrixWorld);
    for (let i = 0; i < p.count; i++) all.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(_m));
  });
  const step = Math.max(1, Math.floor(all.length / n)), pts = all.filter((_, i) => i % step === 0);
  // the extremes along each axis always count
  for (const k of ['x', 'y', 'z']) { let lo = all[0], hi = all[0]; for (const v of all) { if (v[k] < lo[k]) lo = v; if (v[k] > hi[k]) hi = v; } pts.push(lo, hi); }
  return (obj.userData.hull = pts);
}

// the height of the thing's origin at (x, z), turned by q, so that its lowest point is on the ground
export function restY(world, obj, q, x, z, lift = 0.002) {
  let y = -Infinity;
  for (const v of hullOf(obj)) { _v.copy(v).applyQuaternion(q); y = Math.max(y, world.drawnAt(x + _v.x, z + _v.z) - _v.y); }
  return y + lift;
}

// its footprint on the ground: an oriented rectangle { x, z, ux, uz, a, b } (centre, long axis, half lengths)
export function footprint(obj, q, x, z) {
  const H = hullOf(obj), pts = _pts;
  while (pts.length < H.length) pts.push(new THREE.Vector3());
  for (let i = 0; i < H.length; i++) pts[i].copy(H[i]).applyQuaternion(q);
  pts.length = H.length;
  let ux = 1, uz = 0, best = -1;
  for (let k = 0; k < 12; k++) { // the long axis: the widest of a dozen directions
    const a = k * Math.PI / 12, cx = Math.cos(a), cz = Math.sin(a);
    let lo = Infinity, hi = -Infinity; for (const p of pts) { const s = p.x * cx + p.z * cz; lo = Math.min(lo, s); hi = Math.max(hi, s); }
    if (hi - lo > best) { best = hi - lo; ux = cx; uz = cz; }
  }
  let l0 = Infinity, l1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (const p of pts) { const s = p.x * ux + p.z * uz, t = -p.x * uz + p.z * ux; l0 = Math.min(l0, s); l1 = Math.max(l1, s); w0 = Math.min(w0, t); w1 = Math.max(w1, t); }
  const ms = (l0 + l1) / 2, mt = (w0 + w1) / 2;
  return { x: x + ms * ux - mt * uz, z: z + ms * uz + mt * ux, ux, uz, a: (l1 - l0) / 2, b: (w1 - w0) / 2 };
}

// do two footprints overlap (with a gap `gap` between them)?
export function overlaps(A, B, gap = 0.01) {
  const dx = B.x - A.x, dz = B.z - A.z;
  for (const [ux, uz] of [[A.ux, A.uz], [-A.uz, A.ux], [B.ux, B.uz], [-B.uz, B.ux]]) {
    const ra = A.a * Math.abs(A.ux * ux + A.uz * uz) + A.b * Math.abs(-A.uz * ux + A.ux * uz);
    const rb = B.a * Math.abs(B.ux * ux + B.uz * uz) + B.b * Math.abs(-B.uz * ux + B.ux * uz);
    if (Math.abs(dx * ux + dz * uz) > ra + rb + gap) return false;
  }
  return true;
}

// a spot near (x, z) where the thing (turned by q) lies clear of `others` (footprints) and of colliders, and rests
// on dry ground, tipped to the ground's slope under it: { x, z, y, q, foot }. `avoid(f)` → true rejects a footprint.
// `away` = a point to roll away from: each ring of candidates is tried from the side facing off it.
export function restSpot(world, obj, q, x, z, others = [], { avoid = null, feet = 0, max = 1.4, away = null } = {}) {
  const f0 = footprint(obj, q, 0, 0), reach = max + Math.hypot(f0.a, f0.b) + 0.1;
  // the walls and posts near enough to matter
  const cols = world.colliders.filter((k) => (k.y0 === undefined || (feet + 1.6 >= k.y0 && feet <= k.y1)) && Math.hypot(k.x - x, k.z - z) < reach + (k.kind === 'circle' ? k.r : Math.hypot(k.hw, k.hd)));
  const inCol = (px, pz) => cols.some((k) => {
    if (k.kind === 'circle') return Math.hypot(px - k.x, pz - k.z) < k.r + 0.03;
    const ox = px - k.x, oz = pz - k.z;
    return Math.abs(ox * k.c - oz * k.s) < k.hw + 0.03 && Math.abs(ox * k.s + oz * k.c) < k.hd + 0.03;
  });
  const a0 = away ? Math.atan2(z - away.z, x - away.x) : 0;
  for (let r = 0; r <= max; r += 0.06) {
    const n = r === 0 ? 1 : Math.max(6, Math.round(r * 40));
    for (let m = 0; m < n; m++) {
      const i = m % 2 ? (m + 1) / 2 : -m / 2, a = a0 + i / n * Math.PI * 2, sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
      const f = { ...f0, x: f0.x + sx, z: f0.z + sz };
      if (avoid?.(f) || others.some((o) => overlaps(f, o))) continue;
      let hit = false; // the footprint's corners and middle clear of walls and posts, and out of the water
      for (const [s, t] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0]]) {
        const px = f.x + f.ux * f.a * s - f.uz * f.b * t, pz = f.z + f.uz * f.a * s + f.ux * f.b * t;
        if (inCol(px, pz)) { hit = true; break; }
        const gy = world.terrain.height(px, pz), wy = world.terrain.water(px, pz, gy);
        if (wy !== null && wy - gy > 0.03) { hit = true; break; }
      }
      if (hit) continue;
      return lay(world, obj, q, sx, sz, f);
    }
  }
  return lay(world, obj, q, x, z, { ...f0, x: f0.x + x, z: f0.z + z });
}

// tipped to the plane of the ground under its footprint, its lowest point on it
function lay(world, obj, q, x, z, f) {
  const g = (s, t) => world.drawnAt(f.x + f.ux * s - f.uz * t, f.z + f.uz * s + f.ux * t);
  const a = Math.max(0.05, f.a), b = Math.max(0.05, f.b), su = (g(a, 0) - g(-a, 0)) / (2 * a), sv = (g(0, b) - g(0, -b)) / (2 * b);
  const n = _v.set(-(su * f.ux - sv * f.uz), 1, -(su * f.uz + sv * f.ux)).normalize();
  const tq = new THREE.Quaternion().setFromUnitVectors(_up, n).multiply(q);
  return { x, z, y: restY(world, obj, tq, x, z), q: tq, foot: f };
}
const _up = new THREE.Vector3(0, 1, 0);
