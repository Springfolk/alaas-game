// The look-at ray is 3.4 m long, but three tests every triangle of a mesh whose bounds the ray enters: beside the
// storehouse's log walls (36k triangles), the pen's rails, the sacred birch or the serge (82k) a pick took 1.6–3 ms
// (every third frame) and left ~2.4 MB of garbage. A mesh over MIN triangles gets them sorted once, by centroid,
// into a G³ grid of cells, each with the box of its own triangles: a ray tests the boxes within its reach, then only
// their triangles. Same hits as Mesh.raycast (distance, point, object).
import * as THREE from 'three/webgpu';

const MIN = 1500, G = 16;
const grids = new WeakMap(); // geometry → { used, start, tris, box }
const _inv = new THREE.Matrix4(), _ray = new THREE.Ray(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

const triangles = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3 | 0;

function grid(g) {
  let q = grids.get(g);
  if (q) return q;
  if (!g.boundingBox) g.computeBoundingBox();
  const pos = g.attributes.position, idx = g.index, n = triangles(g), { min, max } = g.boundingBox;
  const kx = G / Math.max(max.x - min.x, 1e-6), ky = G / Math.max(max.y - min.y, 1e-6), kz = G / Math.max(max.z - min.z, 1e-6);
  const cell = new Uint16Array(n), start = new Uint32Array(G * G * G + 1), box = new Float32Array(G * G * G * 6);
  for (let c = 0; c < G * G * G; c++) { box[c * 6] = box[c * 6 + 1] = box[c * 6 + 2] = Infinity; box[c * 6 + 3] = box[c * 6 + 4] = box[c * 6 + 5] = -Infinity; }
  const at = (v, k) => Math.min(G - 1, Math.max(0, v * k | 0));
  for (let t = 0; t < n; t++) {
    let cx = 0, cy = 0, cz = 0, x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = idx ? idx.getX(t * 3 + k) : t * 3 + k, x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      cx += x; cy += y; cz += z;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z; if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
    }
    const c = cell[t] = (at(cz / 3 - min.z, kz) * G + at(cy / 3 - min.y, ky)) * G + at(cx / 3 - min.x, kx), o = c * 6;
    start[c + 1]++;
    if (x0 < box[o]) box[o] = x0; if (y0 < box[o + 1]) box[o + 1] = y0; if (z0 < box[o + 2]) box[o + 2] = z0;
    if (x1 > box[o + 3]) box[o + 3] = x1; if (y1 > box[o + 4]) box[o + 4] = y1; if (z1 > box[o + 5]) box[o + 5] = z1;
  }
  const used = [];
  for (let c = 0; c < G * G * G; c++) { if (start[c + 1]) used.push(c); start[c + 1] += start[c]; }
  const tris = new Uint32Array(n), fill = start.slice(0, G * G * G);
  for (let t = 0; t < n; t++) tris[fill[cell[t]]++] = t;
  grids.set(g, q = { used: Uint16Array.from(used), start, tris, box });
  return q;
}

function raycast(raycaster, hits) {
  const g = this.geometry, m = this.material, e = this.matrixWorld.elements;
  if (!m) return;
  const { used, start, tris, box } = grid(g), pos = g.attributes.position, idx = g.index;
  _ray.copy(raycaster.ray).applyMatrix4(_inv.copy(this.matrixWorld).invert());
  // the ray's reach in the mesh's own units (the direction is unit length again after the transform)
  const far = raycaster.far / Math.min(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
  const o = _ray.origin, d = _ray.direction, ix = 1 / d.x, iy = 1 / d.y, iz = 1 / d.z;
  const back = m.side === THREE.BackSide, cull = m.side !== THREE.DoubleSide;
  for (let u = 0; u < used.length; u++) {
    const c = used[u], k = c * 6;
    // slab test against the cell's box, within reach
    let t0 = (box[k] - o.x) * ix, t1 = (box[k + 3] - o.x) * ix, lo = Math.min(t0, t1), hi = Math.max(t0, t1);
    t0 = (box[k + 1] - o.y) * iy; t1 = (box[k + 4] - o.y) * iy; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    t0 = (box[k + 2] - o.z) * iz; t1 = (box[k + 5] - o.z) * iz; lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
    if (!(hi >= Math.max(lo, 0)) || lo > far) continue; // (NaN from 0 × ∞: the origin on a slab's face → tested)
    for (let j = start[c]; j < start[c + 1]; j++) {
      const t = tris[j] * 3, i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      _a.fromBufferAttribute(pos, i0); _b.fromBufferAttribute(pos, i1); _c.fromBufferAttribute(pos, i2);
      if (!(back ? _ray.intersectTriangle(_c, _b, _a, true, _p) : _ray.intersectTriangle(_a, _b, _c, cull, _p))) continue;
      const distance = raycaster.ray.origin.distanceTo(_s.copy(_p).applyMatrix4(this.matrixWorld));
      if (distance >= raycaster.near && distance <= raycaster.far) hits.push({ distance, point: _s.clone(), object: this });
    }
  }
}

// Gives the big plain meshes under `root` the grid raycast; their grids are built one per idle moment (a pick that
// comes first builds its own).
const queue = [];
export function quickRaycast(root) {
  root.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || m.isSkinnedMesh || m.isBatchedMesh || Array.isArray(m.material) || m.raycast === raycast) return;
    const pos = m.geometry?.attributes.position;
    if (!pos?.array?.length || m.geometry.morphAttributes?.position || triangles(m.geometry) < MIN) return;
    m.raycast = raycast;
    if (!grids.has(m.geometry) && queue.push(m.geometry) === 1) setTimeout(next, 200);
  });
}
function next() {
  const g = queue.shift();
  if (g) { grid(g); setTimeout(next, 60); }
}
