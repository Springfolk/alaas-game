// Дьэдьэн (wild strawberry, Fragaria orientalis): colonies on the dry, sunny ground round the homestead, on
// the slope above it and along the forest's edge. A colony is a short-sward opening with a few dense crowns
// (trefoil leaves on stalks, red berries on arching trusses held at the height of the leaves, white flowers
// standing over them) and runner plants between. A crown is the thing picked from. Instanced per region of
// ~45 m, drawn within sight range; berries and flowers swell with distance so they stay a dot of colour.
// Local frame: HOME.
import { attribute, positionLocal, positionPrevious, cameraPosition, modelWorldMatrix, vec4, clamp, Fn } from 'three/tsl';
import { TIER } from '../../engine/tier.js';
import { CULL_LAYER } from '../../engine/merge.js';
import { mulberry32 } from '../../util.js';

// colonies: [x, z, radius]. Round the yard off the paths; the slope above the homestead; the forest's edge (north).
export const COLONIES = [
  [-9, 13, 1.2], [-4.5, 25, 1.4], [13.5, 27.5, 1.3], [-14, 20.5, 1.1], [19, 34, 1.6], [-1.5, 37, 1.4], [-14, -9, 1.2], [18.5, -14.5, 1.3],
  [-3, -20, 1.7], [8, -27, 1.5], [-16, -30, 1.8], [-28, -16, 1.4], [-33, 6, 1.5], [34, 22, 1.4], [-8, -44, 2.0], [12, -52, 1.9],
  [-24, -58, 2.1], [3, -68, 2.3], [26, -66, 2.0], [-12, -80, 2.3], [16, -84, 2.2], [-36, -84, 2.0], [36, -88, 2.1], [0, -94, 2.4],
];

const STALK = 0.1;
export const CROWN = 0.3;     // m: a crown's radius
const SWELL = [3, 3];         // berries and flowers keep their true size to 3 m, then grow with distance up to ×3
const TRUSS_TOP = [0.012, 0.16, 0.004]; // a flower truss's head (its centre for the swell)

// one graph for berries and flowers: the instance grows about its own centre (`aC`, model-local) with distance
const swell = Fn(() => {
  const c = attribute('aC', 'vec3');
  const d = modelWorldMatrix.mul(vec4(c, 1)).xyz.distance(cameraPosition);
  const p = c.add(positionLocal.sub(c).mul(clamp(d.div(SWELL[0]), 1, SWELL[1])));
  positionPrevious.assign(p);
  return p;
});

export function buildDyedyen(T, { ground, forest }) {
  const rng = mulberry32(0xd1ed1e);
  const phone = TIER.quality === 'low'; // low and phones: fewer, simpler leaves and berries
  // per crown: leaves, berries, flower trusses; runner plants per m² of colony
  const LEAVES = phone ? 20 : 30, PER = phone ? 10 : 16, TRUSS = phone ? 2 : 3, RUNNERS = phone ? 7 : 14;
  const leafMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.8, side: T.DoubleSide, vertexColors: true });
  const berryMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.34, vertexColors: true });
  const flowerMat = new T.MeshStandardNodeMaterial({ color: 0xffffff, roughness: 0.7, side: T.DoubleSide, vertexColors: true });
  leafMat.name = 'dyedyen-leaf'; berryMat.name = 'dyedyen-berry'; flowerMat.name = 'dyedyen-flower';
  berryMat.positionNode = swell(); flowerMat.positionNode = swell();
  const fine = TIER.quality === 'high';
  const leafGeo = leaf(T, fine ? 3 : 2, true), runnerGeo = leaf(T, 1, false), berryGeo = berry(T, fine ? 6 : 5), trussGeo = truss(T);
  const q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3(), p = new T.Vector3();
  const zero = new T.Matrix4().makeScale(0, 0, 0);
  const mat4 = () => new T.Matrix4().compose(p, q.setFromEuler(e), s);

  // a colony: an ellipse turned at random with crowns inside it, each crown a pick target
  const colonies = [], patches = [];
  for (const [cx, cz, R] of COLONIES) {
    if (forest && forest(cx, cz) >= 0.6) continue;
    const turn = rng() * Math.PI, ax = 0.75 + rng() * 0.35, c = Math.cos(turn), sn = Math.sin(turn);
    const at = (r, a) => { const u = Math.cos(a) * r * R, v = Math.sin(a) * r * R * ax; return [cx + u * c - v * sn, cz + u * sn + v * c]; };
    // the sward stays short over the colony: a few overlapping blobs, not a ring
    const short = [0, 1, 2, 3].map(() => { const [x, z] = at(0.2 + 0.4 * rng(), rng() * Math.PI * 2); return { x, z, rx: R * (0.6 + rng() * 0.45), rz: R * (0.6 + rng() * 0.45) }; });
    const C = { cx, cz, R, short, runners: [], crowns: [] };
    colonies.push(C);
    // crowns: kept apart, the first near the middle
    const n = Math.max(4, Math.round(R * R * 2.4)), spots = [];
    for (let tries = 0; spots.length < n && tries < 200; tries++) {
      const [x, z] = spots.length ? at(Math.sqrt(rng()) * 0.86, rng() * Math.PI * 2) : at(0.15 * rng(), rng() * Math.PI * 2);
      if (spots.every(([a, b]) => Math.hypot(a - x, b - z) > CROWN * 2.3)) spots.push([x, z]);
    }
    for (const [x0, z0] of spots) {
      const P = { cx: x0, cz: z0, R: CROWN, leaves: [], berries: [], bc: [], trusses: [], tc: [] };
      for (let j = 0; j < LEAVES; j++) {
        const r = CROWN * Math.pow(rng(), 0.6), a = rng() * Math.PI * 2, x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r, k = 1.05 + rng() * 0.5;
        // a trefoil on its stalk (built down to y = -STALK), leaning out from the crown's middle
        e.set(0.12 + (r / CROWN) * 0.4 + (rng() - 0.5) * 0.4, -a + Math.PI / 2 + (rng() - 0.5) * 1.2, (rng() - 0.5) * 0.4, 'YXZ');
        p.set(x, ground(x, z) + STALK * k * (0.6 + 0.4 * rng() + 0.25 * (1 - r / CROWN)) - 0.004, z); s.setScalar(k);
        P.leaves.push(mat4());
      }
      // berries in trusses of 3–5 arching out between and over the leaves, where the eye finds them
      for (let j = 0; j < PER;) {
        const ta = rng() * Math.PI * 2, tr = CROWN * (0.35 + rng() * 0.75), m = Math.min(PER - j, 3 + Math.floor(rng() * 3));
        const tx = x0 + Math.cos(ta) * tr, tz = z0 + Math.sin(ta) * tr, h = 0.115 + rng() * 0.06;
        for (let i = 0; i < m; i++, j++) {
          const a = ta + (rng() - 0.5) * 1.8, d = 0.014 + rng() * 0.034;
          const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
          p.set(x, ground(x, z) + h - i * 0.011 + (rng() - 0.5) * 0.02, z);
          e.set((rng() - 0.5) * 0.5, -a + Math.PI, (rng() - 0.5) * 0.5, 'YXZ'); // the stalk runs back to the truss
          s.setScalar(0.8 + rng() * 0.4);
          P.berries.push(mat4()); P.bc.push(p.x, p.y, p.z);
        }
      }
      for (let j = 0; j < TRUSS; j++) {
        const a = rng() * Math.PI * 2, r = CROWN * (0.2 + rng() * 0.9), x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3, 'YXZ');
        p.set(x, ground(x, z) - 0.004, z); s.setScalar(0.9 + rng() * 0.4);
        const m = mat4(), t = new T.Vector3(...TRUSS_TOP).applyMatrix4(m);
        P.trusses.push(m); P.tc.push(t.x, t.y, t.z);
      }
      C.crowns.push(P); patches.push(P);
    }
    // runner plants between the crowns: tufts of two to four small trefoils
    for (let j = Math.round(RUNNERS * Math.PI * R * R * ax); j > 0;) {
      const [tx, tz] = at(Math.pow(rng(), 0.6), rng() * Math.PI * 2), m = Math.min(j, 2 + Math.floor(rng() * 3));
      for (let i = 0; i < m; i++, j--) {
        const a = rng() * Math.PI * 2, d = 0.02 + rng() * 0.05, x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d, k = 0.95 + rng() * 0.55;
        e.set(0.3 + (rng() - 0.5) * 0.5, -a + Math.PI / 2, (rng() - 0.5) * 0.4, 'YXZ');
        p.set(x, ground(x, z) + STALK * k * (0.45 + rng() * 0.4) - 0.004, z); s.setScalar(k);
        C.runners.push(mat4());
      }
    }
  }

  // regions of ~45 m: one mesh each of leaves, runners, berries and flowers
  const regions = new Map(), meshes = [];
  for (const C of colonies) {
    const key = `${Math.floor(C.cx / 45)},${Math.floor(C.cz / 45)}`;
    if (!regions.has(key)) regions.set(key, []);
    regions.get(key).push(C);
  }
  const fill = (name, geo, mat, list, centres) => {
    if (centres) { // a swelling mesh: the shared vertex data plus its own instances' centres
      const g = new T.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      g.setIndex(geo.index);
      g.setAttribute('aC', new T.InstancedBufferAttribute(new Float32Array(centres), 3));
      geo = g;
    }
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
    const crowns = list.flatMap((C) => C.crowns);
    fill('dyedyen-leaves', leafGeo, leafMat, crowns.flatMap((P) => P.leaves));
    fill('dyedyen-runners', runnerGeo, leafMat, list.flatMap((C) => C.runners));
    const im = fill('dyedyen', berryGeo, berryMat, crowns.flatMap((P) => P.berries), crowns.flatMap((P) => P.bc));
    let i = 0;
    for (const P of crowns) { P.mesh = im; P.first = i; i += P.berries.length; }
    fill('dyedyen-flowers', trussGeo, flowerMat, crowns.flatMap((P) => P.trusses), crowns.flatMap((P) => P.tc));
  }

  const far = phone ? 45 : 80;
  return {
    meshes, patches, colonies, perPatch: PER,
    // regions out of sight range go to the unrendered layer, as merge.js does (cam: local to the model)
    cull(cx, cz) { for (const m of meshes) { const b = m.boundingSphere; m.layers.mask = Math.hypot(b.center.x - cx, b.center.z - cz) < b.radius + far ? 1 : 1 << CULL_LAYER; } },
    // k: crown, n: how many berries stay (0 … PER); the last picked are the first back
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
// a thin stalk through the points [x, y, z]: two crossed strips, or one
function stalk(pos, col, idx, pts, w, c, crossed = true) {
  for (const a of crossed ? [0, Math.PI / 2] : [0.6]) {
    const b = pos.length / 3, dx = Math.cos(a) * w, dz = Math.sin(a) * w;
    for (const [x, y, z] of pts) { pos.push(x - dx, y, z - dz, x + dx, y, z + dz); col.push(...c, ...c); }
    for (let i = 0; i < pts.length - 1; i++) { const o = b + i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  }
}

// A trefoil: three rhombic-ovate leaflets ~4.5 × 3.2 cm with coarse teeth, folded along the midrib and
// pleated by the side veins, on a hairy stalk down to y = -STALK. Paler along the midrib and at the teeth.
// `full`: the crown's leaf; else a runner plant's (TEETH 1: a plain rhomb, one stalk strip).
function leaf(T, TEETH, full) {
  const pos = [], col = [], idx = [];
  const L = 0.046, W = 0.0165;
  const leaflet = (yaw, tilt, k) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), base = pos.length / 3;
    const put = (x, z, g, pleat = 0) => {
      const y = Math.abs(x) * 0.42 + z * Math.sin(tilt) + pleat - (z / L) * (z / L) * 0.006; // V-fold, tip curling down
      const zz = z * Math.cos(tilt) + 0.005;
      pos.push((x * c + zz * sn) * k, y * k, (-x * sn + zz * c) * k); col.push(0.085 * g, 0.2 * g, 0.04 * g);
    };
    put(0, L * 0.42, 1.3);                                           // fan centre on the midrib
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
  stalk(pos, col, idx, [[0, 0.003, 0], [0.007, -STALK * 0.5, 0.002], [0.004, -STALK, 0]], 0.0011, [0.3, 0.3, 0.16], full);
  return geoOf(T, pos, col, idx);
}

// A berry: ~1.9 cm across and 2.2 cm long, round-conical, hanging tip-down under a green calyx of spread
// sepals, its thin stalk arching up and back (−Z) to the truss. Seeds: pale flecks. Origin = the berry's centre.
function berry(T, SEG) {
  const R = 0.0095, ROWS = 4;
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= ROWS; j++) {
    const v = j / ROWS, th = v * Math.PI, y = Math.cos(th), w = Math.sin(th) * (y < 0 ? 1 - 0.3 * y * y : 1);
    for (let i = 0; i < SEG; i++) {
      const a = (i + (j % 2) * 0.5) / SEG * Math.PI * 2;
      pos.push(Math.cos(a) * w * R, y * R * (y < 0 ? 1.32 : 1.02), Math.sin(a) * w * R);
      const seed = (i + j) % 2 === 0 && j > 0 && j < ROWS ? 1 : 0, sh = 0.86 + 0.14 * y; // paler towards the calyx
      col.push(0.6 * sh + seed * 0.1, 0.008 + seed * 0.07 + (y > 0.6 ? 0.05 : 0), 0.018 + seed * 0.02);
    }
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * SEG + i, b = j * SEG + (i + 1) % SEG, c = a + SEG, d = b + SEG;
    if (j === 0) idx.push(b, d, c); else if (j === ROWS - 1) idx.push(a, b, d); // the poles: one triangle a side
    else if (j % 2) idx.push(a, b, d, a, d, c); else idx.push(a, b, c, b, d, c);
  }
  // the calyx: five pointed sepals lying back over the shoulder (seen from above: one face)
  const y0 = R * 1.02, G = [0.1, 0.24, 0.05];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2, b = pos.length / 3;
    pos.push(Math.cos(a + 0.5) * R * 0.5, y0 + 0.0008, Math.sin(a + 0.5) * R * 0.5, Math.cos(a) * R * 1.5, y0 + 0.0022, Math.sin(a) * R * 1.5, Math.cos(a - 0.5) * R * 0.5, y0 + 0.0008, Math.sin(a - 0.5) * R * 0.5);
    col.push(...G, 0.16, 0.32, 0.08, ...G);
    idx.push(b, b + 2, b + 1);
  }
  stalk(pos, col, idx, [[0, y0, 0], [0, y0 + 0.02, -0.008], [0, y0 + 0.027, -0.03]], 0.0007, [0.32, 0.26, 0.12]);
  return geoOf(T, pos, col, idx);
}

// A flowering truss standing from the ground (origin): a forked stalk with three open flowers over the leaves
// (five white petals round a yellow centre, ~2.4 cm) and a pale unripe berry.
function truss(T) {
  const pos = [], col = [], idx = [];
  const ST = [0.3, 0.3, 0.16], fork = [0.008, 0.115, 0.003];
  stalk(pos, col, idx, [[0, 0, 0], [0.005, 0.06, 0.002], fork], 0.001, ST);
  const flower = (fc, lean, k) => { // fc: centre; lean: the way it faces (radians round Y), tipped 0.35 rad out
    stalk(pos, col, idx, [fork, [(fork[0] + fc[0]) / 2, (fork[1] + fc[1]) / 2 + 0.006, (fork[2] + fc[2]) / 2], fc], 0.0007, ST, false);
    const petal = 0.012 * k, lx = Math.cos(lean), lz = Math.sin(lean), tip = 0.35;
    const at = (x, y, z) => { const o = x * lx + z * lz; pos.push(fc[0] + x, fc[1] + y - o * tip, fc[2] + z); }; // tipped towards `lean`
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * Math.PI * 2 + lean, b = pos.length / 3, ca = Math.cos(a), sa = Math.sin(a);
      at(ca * 0.002, 0.001, sa * 0.002);
      at(ca * petal * 0.62 - sa * petal * 0.5, 0.003, sa * petal * 0.62 + ca * petal * 0.5);
      at(ca * petal * 1.1, 0.0015, sa * petal * 1.1);
      at(ca * petal * 0.62 + sa * petal * 0.5, 0.003, sa * petal * 0.62 - ca * petal * 0.5);
      col.push(0.84, 0.84, 0.7, 0.96, 0.96, 0.92, 0.96, 0.96, 0.92, 0.96, 0.96, 0.92);
      idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
    const b = pos.length / 3; // the yellow centre: a low cone
    at(0, 0.0042, 0); col.push(0.92, 0.72, 0.08);
    for (let j = 0; j < 5; j++) { const a = (j / 5) * Math.PI * 2; at(Math.cos(a) * 0.0034 * k, 0.0016, Math.sin(a) * 0.0034 * k); col.push(0.8, 0.58, 0.06); }
    for (let j = 0; j < 5; j++) idx.push(b, b + 1 + (j + 1) % 5, b + 1 + j);
  };
  flower(TRUSS_TOP, 0.4, 1); flower([-0.016, 0.148, -0.012], 3.6, 0.9); flower([0.024, 0.136, 0.02], 1.4, 0.82);
  // a side branch: an unripe berry (pale green-white, hanging)
  const from = [0.005, 0.06, 0.002], to = [-0.02, 0.085, 0.014], r = 0.0052, len = 0.013, c = [0.66, 0.72, 0.42];
  stalk(pos, col, idx, [from, [(from[0] + to[0]) / 2, to[1] + 0.008, (from[2] + to[2]) / 2], to], 0.0007, ST, false);
  const b = pos.length / 3;
  pos.push(to[0], to[1], to[2]); col.push(0.14, 0.3, 0.07);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; pos.push(to[0] + Math.cos(a) * r, to[1] - len * 0.4, to[2] + Math.sin(a) * r); col.push(...c); }
  pos.push(to[0], to[1] - len, to[2]); col.push(...c);
  for (let k = 0; k < 5; k++) idx.push(b, b + 1 + (k + 1) % 5, b + 1 + k, b + 6, b + 1 + k, b + 1 + (k + 1) % 5);
  return geoOf(T, pos, col, idx);
}
