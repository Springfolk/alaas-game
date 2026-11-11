// Дьэдьэн (wild strawberry, Fragaria): carpets on the dry, sunny ground round the homestead, on the
// slope above it and along the forest's edge. Trefoil leaves on stalks, red berries hanging from arching
// trusses at the height of the leaves, a few white flowers and unripe berries. Instanced per region of
// ~45 m (leaves, berries, flower trusses), drawn within sight range. Local frame: HOME.
import { TIER } from '../../engine/tier.js';
import { CULL_LAYER } from '../../engine/merge.js';
import { mulberry32 } from '../../util.js';

// patches: [x, z, radius]. Round the yard off the paths; the slope above the homestead; the forest's edge (north).
export const PATCHES = [
  [-9, 13, 0.9], [-4.5, 25, 1.1], [13.5, 27.5, 1.0], [-14, 20.5, 0.8], [19, 34, 1.2], [-1.5, 37, 1.0], [-14, -9, 0.9], [18.5, -14.5, 1.0],
  [-3, -20, 1.2], [8, -27, 1.0], [-16, -30, 1.3], [-28, -16, 1.0], [-33, 6, 1.1], [34, 22, 1.0], [-8, -44, 1.3], [12, -52, 1.2],
  [-24, -58, 1.3], [3, -68, 1.4], [26, -66, 1.2], [-12, -80, 1.4], [16, -84, 1.3], [-36, -84, 1.2], [36, -88, 1.3], [0, -94, 1.4],
];

const STALK = 0.1;

export function buildDyedyen(T, { ground, forest }) {
  const rng = mulberry32(0xd1ed1e);
  const phone = TIER.quality === 'low'; // low and phones: fewer, simpler leaves
  const DENS = phone ? 42 : 80, PER = phone ? 36 : 64, TRUSS = phone ? 5 : 9; // per m² of leaves; berries and trusses per patch
  const leafMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.85, side: T.DoubleSide, vertexColors: true });
  const berryMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.3, vertexColors: true });
  leafMat.name = 'dyedyen-leaf'; berryMat.name = 'dyedyen-berry';
  const leafGeo = leaf(T, phone ? 2 : 3), berryGeo = berry(T), trussGeo = truss(T);
  const q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
  const zero = new T.Matrix4().makeScale(0, 0, 0);

  // a patch: an ellipse turned at random, a few crowns inside it; leaves thin out towards its edge
  const patches = PATCHES.filter(([x, z]) => !forest || forest(x, z) < 0.6).map(([cx, cz, r0]) => {
    const R = r0 * 1.25;
    const turn = rng() * Math.PI, ax = 0.75 + rng() * 0.35, c = Math.cos(turn), sn = Math.sin(turn);
    const at = (r, a) => { const u = Math.cos(a) * r * R, v = Math.sin(a) * r * R * ax; return [cx + u * c - v * sn, cz + u * sn + v * c]; };
    // the sward stays short over the carpet: a few overlapping blobs, not a ring
    const short = [0, 1, 2].map(() => { const [x, z] = at(0.45 * rng(), rng() * Math.PI * 2); return { x, z, rx: R * (0.75 + rng() * 0.45), rz: R * (0.75 + rng() * 0.45) }; });
    return { cx, cz, R, at, short, leaves: [], berries: [], trusses: [] };
  });
  for (const P of patches) {
    const n = Math.round(DENS * P.R * P.R * 1.6);
    for (let j = 0; j < n; j++) {
      const [x, z] = P.at(Math.pow(rng(), 0.62), rng() * Math.PI * 2), k = 1 + rng() * 0.6;
      // a trefoil on its stalk (built down to y = -STALK), leaning out a little
      e.set((rng() - 0.5) * 0.7, rng() * Math.PI * 2, (rng() - 0.5) * 0.5, 'YXZ');
      p.set(x, ground(x, z) + STALK * k * (0.62 + rng() * 0.38) - 0.004, z);
      P.leaves.push(new T.Matrix4().compose(p, q.setFromEuler(e), s.setScalar(k)));
    }
    // berries in trusses of 2–4, at the height of the leaves where the eye finds them
    for (let j = 0; j < PER;) {
      const [tx, tz] = P.at(Math.pow(rng(), 0.55), rng() * Math.PI * 2), m = Math.min(PER - j, 2 + Math.floor(rng() * 3)), lean = rng() * Math.PI * 2;
      const h = 0.105 + rng() * 0.06;
      for (let i = 0; i < m; i++, j++) {
        const a = lean + (rng() - 0.5) * 1.6, d = 0.012 + rng() * 0.03;
        const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
        p.set(x, ground(x, z) + h - i * 0.012 + (rng() - 0.5) * 0.02, z);
        e.set((rng() - 0.5) * 0.5, -a + Math.PI, (rng() - 0.5) * 0.5, 'YXZ'); // the stalk runs back to the truss
        P.berries.push(new T.Matrix4().compose(p, q.setFromEuler(e), s.setScalar(0.8 + rng() * 0.45)));
      }
    }
    for (let j = 0; j < TRUSS; j++) {
      const [x, z] = P.at(Math.pow(rng(), 0.5), rng() * Math.PI * 2), k = 0.85 + rng() * 0.4;
      e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3, 'YXZ');
      p.set(x, ground(x, z) - 0.004, z);
      P.trusses.push(new T.Matrix4().compose(p, q.setFromEuler(e), s.setScalar(k)));
    }
  }

  // regions of ~45 m: one leaf mesh and one berry mesh each
  const regions = new Map(), meshes = [];
  for (const P of patches) {
    const key = `${Math.floor(P.cx / 45)},${Math.floor(P.cz / 45)}`;
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(P);
  }
  const fill = (name, geo, mat, list) => {
    const im = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere(); im.computeBoundingBox();
    im.castShadow = false; im.name = name;
    im.userData.dynamic = true; // kept out of merge.js's size culling (it measures one leaf at the model's origin)
    meshes.push(im);
    return im;
  };
  for (const list of regions.values()) {
    fill('dyedyen-leaves', leafGeo, leafMat, list.flatMap((P) => P.leaves));
    const im = fill('dyedyen', berryGeo, berryMat, list.flatMap((P) => P.berries));
    let i = 0;
    for (const P of list) { P.mesh = im; P.first = i; i += P.berries.length; }
  }
  for (const list of regions.values()) fill('dyedyen-flowers', trussGeo, leafMat, list.flatMap((P) => P.trusses));

  const far = phone ? 45 : 80;
  return {
    meshes, patches, perPatch: PER,
    // regions out of sight range go to the unrendered layer, as merge.js does (cam: local to the model)
    cull(cx, cz) { for (const m of meshes) { const b = m.boundingSphere; m.layers.mask = Math.hypot(b.center.x - cx, b.center.z - cz) < b.radius + far ? 1 : 1 << CULL_LAYER; } },
    // k: patch, n: how many berries stay (0 … PER); the last picked are the first back
    setPatch(k, n) {
      const P = patches[k];
      P.berries.forEach((m, j) => P.mesh.setMatrixAt(P.first + j, j < n ? m : zero));
      P.mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

const geoOf = (T, pos, col, idx) => {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  if (idx) g.setIndex(idx);
  g.computeVertexNormals();
  return g;
};
// a thin stalk as two crossed strips through the points [x, y, z]
function stalk(pos, col, idx, pts, w, c) {
  for (const a of [0, Math.PI / 2]) {
    const b = pos.length / 3, dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    for (const [x, y, z] of pts) { pos.push(x - dx, y, z - dz, x + dx, y, z + dz); col.push(...c, ...c); }
    for (let i = 0; i < pts.length - 1; i++) { const o = b + i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
}

// A trefoil: three rhombic-ovate leaflets ~4.5 × 3.2 cm with coarse teeth, folded along the midrib and
// pleated by the side veins, on a hairy stalk down to y = -STALK. Paler along the veins and at the teeth.
function leaf(T, TEETH) {
  const pos = [], col = [], idx = [];
  const L = 0.046, W = 0.0165;
  const leaflet = (yaw, tilt, k) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), base = pos.length / 3;
    const put = (x, z, g, pleat = 0) => {
      const y = Math.abs(x) * 0.42 + z * Math.sin(tilt) + pleat - (z / L) * (z / L) * 0.006; // V-fold, tip curling down
      const zz = z * Math.cos(tilt) + 0.005;
      pos.push((x * c + zz * sn) * k, y * k, (-x * sn + zz * c) * k); col.push(0.1 * g, 0.19 * g, 0.032 * g);
    };
    put(0, L * 0.42, 1.25);                                          // fan centre on the midrib
    const sides = [];
    for (const side of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= TEETH * 2; i++) {
        const u = i / (TEETH * 2), tooth = u > 0.2 && i % 2 === 1;
        let w = W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.05)), 0.75) * (0.8 + 0.7 * u * (1 - u));
        w *= tooth ? 1.16 : u > 0.2 ? 0.9 : 1;
        pts.push([side * w, L * (u + (tooth ? 0.035 : 0)), tooth ? 1.0 : 0.78, tooth ? 0.0016 : -0.0012]);
      }
      sides.push(side > 0 ? pts : pts.reverse());
    }
    const ring = [...sides[0], ...sides[1].slice(1)];
    for (const [x, z, g, pl] of ring) put(x, z, g * (0.82 + 0.3 * (z / L)), pl);
    for (let i = 1; i < ring.length; i++) idx.push(base, base + i, base + i + 1);
    idx.push(base, base + ring.length, base + 1);
  };
  leaflet(0, 0.12, 1); leaflet(1.12, -0.02, 0.92); leaflet(-1.12, -0.02, 0.92);
  stalk(pos, col, idx, [[0, 0.003, 0], [0.007, -STALK * 0.5, 0.002], [0.004, -STALK, 0]], 0.0011, [0.3, 0.3, 0.16]);
  return geoOf(T, pos, col, idx);
}

// A berry: ~1.5 cm across and 2 cm long, conical, hanging tip-down under a green calyx of spread sepals, its
// thin stalk arching up and back (−Z) to the truss. Seeds: pale flecks. Origin = the berry's centre.
function berry(T) {
  const R = 0.009, SEG = 6, ROWS = 4;
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= ROWS; j++) {
    const v = j / ROWS, th = v * Math.PI, y = Math.cos(th), w = Math.sin(th) * (y < 0 ? 1 - 0.42 * y * y : 1);
    for (let i = 0; i < SEG; i++) {
      const a = (i + (j % 2) * 0.5) / SEG * Math.PI * 2;
      pos.push(Math.cos(a) * w * R, y * R * (y < 0 ? 1.55 : 1.05), Math.sin(a) * w * R);
      const seed = (i + j) % 2 === 0 && j > 0 && j < ROWS ? 1 : 0, sh = 0.86 + 0.14 * y; // paler towards the calyx
      col.push(0.74 * sh + seed * 0.1, 0.012 + seed * 0.07 + (y > 0.6 ? 0.05 : 0), 0.016 + seed * 0.02);
    }
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * SEG + i, b = j * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG;
    if (j % 2) idx.push(a, b, d, a, d, c); else idx.push(a, b, c, b, d, c);
  }
  // the calyx: five pointed sepals lying back over the shoulder
  const y0 = R * 1.02, G = [0.1, 0.24, 0.05];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, b = pos.length / 3;
    pos.push(0, y0 + 0.0012, 0, Math.cos(a + 0.42) * R * 0.55, y0, Math.sin(a + 0.42) * R * 0.55, Math.cos(a) * R * 1.5, y0 + 0.0022, Math.sin(a) * R * 1.5, Math.cos(a - 0.42) * R * 0.55, y0, Math.sin(a - 0.42) * R * 0.55);
    col.push(...G, ...G, 0.16, 0.32, 0.08, ...G);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2, b, b + 1, b + 2, b, b + 2, b + 3); // both faces
  }
  stalk(pos, col, idx, [[0, y0, 0], [0, y0 + 0.014, -0.004], [0, y0 + 0.024, -0.014], [0, y0 + 0.027, -0.03]], 0.0007, [0.32, 0.26, 0.12]);
  return geoOf(T, pos, col, idx);
}

// A flowering truss standing from the ground (origin): a forked stalk with one open flower (five white
// petals round a yellow centre, ~1.8 cm), a bud and a pale unripe berry.
function truss(T) {
  const pos = [], col = [], idx = [];
  const ST = [0.3, 0.3, 0.16], top = [0.012, 0.15, 0.004];
  stalk(pos, col, idx, [[0, 0, 0], [0.006, 0.07, 0.002], [0.01, 0.115, 0.003], top], 0.001, ST);
  // the flower, facing up and a little out
  const petal = 0.0085, fc = [top[0], top[1] + 0.002, top[2]];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, b = pos.length / 3, ca = Math.cos(a), sa = Math.sin(a), nx = -sa, nz = ca;
    const at = (r, w, y) => pos.push(fc[0] + ca * r + nx * w, fc[1] + y, fc[2] + sa * r + nz * w);
    at(0.002, 0, 0); at(petal * 0.6, petal * 0.48, 0.0018); at(petal * 1.15, 0, 0.0006); at(petal * 0.6, -petal * 0.48, 0.0018);
    col.push(0.86, 0.86, 0.74, 0.95, 0.95, 0.9, 0.95, 0.95, 0.9, 0.95, 0.95, 0.9);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  { // the yellow centre: a low cone
    const b = pos.length / 3;
    pos.push(fc[0], fc[1] + 0.003, fc[2]); col.push(0.9, 0.72, 0.1);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; pos.push(fc[0] + Math.cos(a) * 0.0028, fc[1] + 0.0012, fc[2] + Math.sin(a) * 0.0028); col.push(0.8, 0.6, 0.08); }
    for (let k = 0; k < 6; k++) idx.push(b, b + 1 + (k + 1) % 6, b + 1 + k);
  }
  // side branches: an unripe berry (pale green-white, hanging) and a bud
  const drop = (from, to, r, len, c) => {
    stalk(pos, col, idx, [from, [(from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 0.008, (from[2] + to[2]) / 2], to], 0.0007, ST);
    const b = pos.length / 3;
    pos.push(to[0], to[1], to[2]); col.push(0.14, 0.3, 0.07);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; pos.push(to[0] + Math.cos(a) * r, to[1] - len * 0.4, to[2] + Math.sin(a) * r); col.push(...c); }
    pos.push(to[0], to[1] - len, to[2]); col.push(...c);
    for (let k = 0; k < 5; k++) idx.push(b, b + 1 + (k + 1) % 5, b + 1 + k, b + 6, b + 1 + k, b + 1 + (k + 1) % 5);
  };
  drop([0.01, 0.115, 0.003], [0.034, 0.108, -0.008], 0.0048, 0.012, [0.62, 0.7, 0.4]);
  drop([0.006, 0.07, 0.002], [-0.016, 0.082, 0.012], 0.0026, 0.007, [0.2, 0.36, 0.1]);
  return geoOf(T, pos, col, idx);
}
