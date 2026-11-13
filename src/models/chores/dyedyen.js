// Дьэдьэн (wild strawberry, Fragaria orientalis): colonies on the dry, sunny ground round the homestead, on
// the slope above it and along the forest's edge. A colony is a short-sward opening with a few dense crowns
// (trefoil leaves on stalks, red berries on arching trusses held at the height of the leaves, white flowers
// standing over them) and runner plants between. A crown is the thing picked from. Instanced per region of
// ~45 m, drawn within sight range; berries and flowers swell with distance so they stay a dot of colour.
// Local frame: HOME.
import { attribute, positionLocal, positionPrevious, cameraPosition, modelWorldMatrix, vec4, smoothstep, Fn } from 'three/tsl';
import { TIER } from '../../engine/tier.js';
import { CULL_LAYER } from '../../engine/merge.js';
import { mulberry32 } from '../../util.js';

// colonies: [x, z, radius]. Round the yard off the paths and out of the smudge fire's smoke; the slope above the
// homestead; the forest's edge (north).
export const COLONIES = [
  [-9, 13, 1.2], [-4.5, 25, 1.4], [13.5, 27.5, 1.3], [-14, 20.5, 1.1], [19, 34, 1.6], [-1.5, 37, 1.4], [-14, -9, 1.2],
  [-3, -20, 1.7], [8, -27, 1.5], [-16, -30, 1.8], [-28, -16, 1.4], [-33, 6, 1.5], [34, 22, 1.4], [-8, -44, 2.0], [12, -52, 1.9],
  [-24, -58, 2.1], [3, -68, 2.3], [26, -66, 2.0], [-12, -80, 2.3], [16, -84, 2.2], [-36, -84, 2.0], [36, -88, 2.1], [0, -94, 2.4],
];

const STALK = 0.1;
export const CROWN = 0.3;     // m: a crown's radius
const SWELL = [3, 12, 2.2];   // berries and flowers keep their true size to 3 m, then grow eased with distance to ×2.2 at 12 m
const TRUSS_TOP = [0.012, 0.16, 0.004]; // a flower truss's head (its centre for the swell)

// one graph for berries and flowers: the instance grows about its own centre (`aC`, model-local) with distance
const swell = Fn(() => {
  const c = attribute('aC', 'vec3');
  const d = modelWorldMatrix.mul(vec4(c, 1)).xyz.distance(cameraPosition);
  const p = c.add(positionLocal.sub(c).mul(smoothstep(SWELL[0], SWELL[1], d).mul(SWELL[2] - 1).add(1)));
  positionPrevious.assign(p);
  return p;
});

export function buildDyedyen(T, { ground, forest }) {
  const rng = mulberry32(0xd1ed1e), rngN = mulberry32(0x5eed5); // rngN: the close-up layout only (the far one stays as it is)
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
      const P = { cx: x0, cz: z0, R: CROWN, leaves: [], berries: [], bc: [], bs: [], heads: [], trusses: [], tc: [] };
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
        P.heads.push({ x: tx, z: tz, y: ground(tx, tz) + h, a: ta, m });
        for (let i = 0; i < m; i++, j++) {
          const a = ta + (rng() - 0.5) * 1.8, d = 0.014 + rng() * 0.034;
          const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
          p.set(x, ground(x, z) + h - i * 0.011 + (rng() - 0.5) * 0.02, z);
          e.set((rng() - 0.5) * 0.5, -a + Math.PI, (rng() - 0.5) * 0.5, 'YXZ'); // the stalk runs back to the truss
          s.setScalar(0.8 + rng() * 0.4);
          P.berries.push(mat4()); P.bc.push(p.x, p.y, p.z); P.bs.push(s.x);
        }
      }
      for (let j = 0; j < TRUSS; j++) {
        const a = rng() * Math.PI * 2, r = CROWN * (0.2 + rng() * 0.9), x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        e.set((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.3, 'YXZ');
        p.set(x, ground(x, z) - 0.004, z); s.setScalar(0.9 + rng() * 0.4);
        const m = mat4(), t = new T.Vector3(...TRUSS_TOP).applyMatrix4(m);
        P.trusses.push(m); P.tc.push(t.x, t.y, t.z);
      }
      nearLayout(T, P, ground, rngN);
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
    const lm = fill('dyedyen-leaves', leafGeo, leafMat, crowns.flatMap((P) => P.leaves));
    const rm = fill('dyedyen-runners', runnerGeo, leafMat, list.flatMap((C) => C.runners));
    let r = 0;
    for (const C of list) { C.runMesh = rm; C.runFirst = r; r += C.runners.length; }
    const im = fill('dyedyen', berryGeo, berryMat, crowns.flatMap((P) => P.berries), crowns.flatMap((P) => P.bc));
    let i = 0;
    for (const P of crowns) { P.mesh = im; P.first = i; i += P.berries.length; }
    const fm = fill('dyedyen-flowers', trussGeo, flowerMat, crowns.flatMap((P) => P.trusses), crowns.flatMap((P) => P.tc));
    let a = 0, b = 0;
    for (const P of crowns) { P.leafMesh = lm; P.leafFirst = a; a += P.leaves.length; P.trussMesh = fm; P.trussFirst = b; b += P.trusses.length; }
  }

  // the near crowns: the few within reach of the eye drawn as close-up plants (fruit trusses arching out and
  // down, berries hanging under the leaves); their far instances are hidden meanwhile
  const NEAR_R = phone ? 1.5 : 1.9, NEAR_K = phone ? 4 : 6;
  const nearMesh = (name, geo, mat, n, centres) => {
    if (centres) {
      const g = new T.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      g.setIndex(geo.index);
      g.setAttribute('aC', new T.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(T.DynamicDrawUsage));
      geo = g;
    }
    const im = new T.InstancedMesh(geo, mat, n);
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.count = 0; im.frustumCulled = false; im.castShadow = false; im.name = name;
    im.userData.dynamic = im.userData.near = true;
    meshes.push(im);
    return im;
  };
  const NL = nearMesh('dyedyen-near-leaves', leafNear(T, phone ? 6 : 8), leafMat, NEAR_K * LEAVES);
  const NS = nearMesh('dyedyen-near-stalks', archNear(T), leafMat, NEAR_K * (PER * 2));
  const NB = nearMesh('dyedyen-near', berryNear(T, phone ? 40 : 64), berryMat, NEAR_K * PER, true);
  const NT = nearMesh('dyedyen-near-flowers', trussNear(T), flowerMat, NEAR_K * TRUSS, true);
  const NR = nearMesh('dyedyen-near-runners', leafNear(T, phone ? 3 : 4, 0.4), leafMat, 2 * Math.max(...colonies.map((C) => C.runners.length)));
  const near = new Set(), nearC = new Set();
  const farShow = (P, on) => {
    P.leaves.forEach((m, j) => P.leafMesh.setMatrixAt(P.leafFirst + j, on ? m : zero));
    P.trusses.forEach((m, j) => P.trussMesh.setMatrixAt(P.trussFirst + j, on ? m : zero));
    P.berries.forEach((m, j) => P.mesh.setMatrixAt(P.first + j, on && j < P.n ? m : zero));
    for (const im of [P.leafMesh, P.trussMesh, P.mesh]) im.instanceMatrix.needsUpdate = true;
  };
  const runShow = (C, on) => {
    C.runners.forEach((m, j) => C.runMesh.setMatrixAt(C.runFirst + j, on ? m : zero));
    C.runMesh.instanceMatrix.needsUpdate = true;
  };
  const nearWrite = () => {
    let l = 0, st = 0, b = 0, t = 0;
    const bc = NB.geometry.attributes.aC, tc = NT.geometry.attributes.aC;
    for (const P of near) {
      for (const m of P.leaves) NL.setMatrixAt(l++, m);
      for (const m of P.arches) NS.setMatrixAt(st++, m);
      P.near.forEach((m, j) => { NB.setMatrixAt(b, j < P.n ? m : zero); bc.array.set(P.nc.slice(j * 3, j * 3 + 3), b * 3); b++; });
      P.trusses.forEach((m, j) => { NT.setMatrixAt(t, m); tc.array.set(P.tc.slice(j * 3, j * 3 + 3), t * 3); t++; });
    }
    let r = 0;
    for (const C of nearC) for (const m of C.runners) NR.setMatrixAt(r++, m);
    NL.count = l; NS.count = st; NB.count = b; NT.count = t; NR.count = r;
    NR.instanceMatrix.needsUpdate = true;
    for (const im of [NL, NS, NB, NT]) im.instanceMatrix.needsUpdate = true;
    bc.needsUpdate = tc.needsUpdate = true;
  };
  for (const P of patches) P.n = PER;

  // berries and flowers (at most ~1 px, swollen ×2.2) end nearer than the leaves: fewer draws over the yard
  const far = phone ? 45 : 80, fruitFar = phone ? 25 : 40;
  for (const m of meshes) if (!m.userData.near) m.userData.far = /dyedyen(-flowers)?$/.test(m.name) ? fruitFar : far;
  return {
    meshes, patches, colonies, perPatch: PER,
    // regions out of sight range go to the unrendered layer, as merge.js does (cam: local to the model)
    cull(cx, cz) {
      for (const m of meshes) { if (m.userData.near) continue; const b = m.boundingSphere; m.layers.mask = Math.hypot(b.center.x - cx, b.center.z - cz) < b.radius + m.userData.far ? 1 : 1 << CULL_LAYER; }
      // the nearest few crowns within reach go close-up (a little farther to leave than to enter)
      const want = [];
      for (const P of patches) { const d = Math.hypot(P.cx - cx, P.cz - cz); if (d < (near.has(P) ? NEAR_R + 0.35 : NEAR_R)) want.push([d, P]); }
      want.sort((a, b) => a[0] - b[0]);
      const keep = new Set(want.slice(0, NEAR_K).map(([, P]) => P));
      // the runner plants of the colony (two at most) the eye is in or beside
      const wantC = [];
      for (const C of colonies) { const d = Math.hypot(C.cx - cx, C.cz - cz) - C.R; if (d < (nearC.has(C) ? NEAR_R + 0.35 : NEAR_R)) wantC.push([d, C]); }
      wantC.sort((a, b) => a[0] - b[0]);
      const keepC = new Set(wantC.slice(0, 2).map(([, C]) => C));
      const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
      if (same(keep, near) && same(keepC, nearC)) return;
      for (const P of near) if (!keep.has(P)) { near.delete(P); farShow(P, true); }
      for (const P of keep) if (!near.has(P)) { near.add(P); farShow(P, false); }
      for (const C of nearC) if (!keepC.has(C)) { nearC.delete(C); runShow(C, true); }
      for (const C of keepC) if (!nearC.has(C)) { nearC.add(C); runShow(C, false); }
      nearWrite();
    },
    // k: crown, n: how many berries stay (0 … PER); the last picked are the first back
    setPatch(k, n) {
      const P = patches[k];
      P.n = n;
      if (near.has(P)) { nearWrite(); return; }
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

// ---------- close-up crowns (within ~2 m of the eye) ----------
const TAU = Math.PI * 2;
const BERRY_TOP = 0.0115; // a close-up berry's calyx heart above its centre: its stalk starts here

// Where a near crown's fruit hangs: each far truss (P.heads) arches out from the crown's heart to a head just over
// its berries, and every berry hangs from it on its own short stalk exactly where its far instance is, so nothing
// moves when a crown swaps to its close-up. P.near: berry matrices, P.nc: their centres, P.arches: stalk matrices
// (archNear, sheared from its start to its end).
function nearLayout(T, P, ground, rng) {
  const q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), s = new T.Vector3();
  P.near = []; P.nc = []; P.arches = [];
  const arch = (a, b, side, lift, thick) => {
    const Z = new T.Vector3().subVectors(b, a), X = new T.Vector3(-side.z, 0, side.x).normalize().multiplyScalar(thick);
    P.arches.push(new T.Matrix4().makeBasis(X, new T.Vector3(0, lift, 0), Z).setPosition(a));
  };
  let j = 0;
  for (const H of P.heads) {
    const top0 = Math.max(...P.bc.slice(j * 3, (j + H.m) * 3).filter((_, k) => k % 3 === 1));
    const head = new T.Vector3(H.x, top0 + 0.022, H.z);
    const foot = new T.Vector3(P.cx + Math.cos(H.a) * 0.02, ground(P.cx, P.cz) - 0.004, P.cz + Math.sin(H.a) * 0.02);
    arch(foot, head, new T.Vector3(Math.cos(H.a), 0, Math.sin(H.a)), 0.8 + rng() * 0.45, 1);
    for (let i = 0; i < H.m; i++, j++) {
      p.fromArray(P.bc, j * 3);
      e.set((rng() - 0.5) * 0.35, rng() * TAU, (rng() - 0.5) * 0.35, 'YXZ'); s.setScalar(P.bs[j]);
      P.near.push(new T.Matrix4().compose(p, q.setFromEuler(e), s)); P.nc.push(p.x, p.y, p.z);
      const top = new T.Vector3(0, BERRY_TOP * s.x, 0).applyQuaternion(q).add(p);
      arch(head, top, new T.Vector3(p.x - H.x, 0, p.z - H.z), 0.12, 0.6);
    }
  }
}

// A hairy stalk through pts: a five-sided tube with fine hairs standing out from it.
function hairyStalk(T, pos, col, idx, pts, r, c, hairs, rng) {
  const curve = new T.CatmullRomCurve3(pts.map((v) => new T.Vector3(...v))), N = 7, S = 5;
  const F = curve.computeFrenetFrames(N, false), b0 = pos.length / 3;
  const ring = (n, b, a) => [n.x * Math.cos(a) + b.x * Math.sin(a), n.y * Math.cos(a) + b.y * Math.sin(a), n.z * Math.cos(a) + b.z * Math.sin(a)];
  for (let i = 0; i <= N; i++) {
    const o = curve.getPointAt(i / N);
    for (let k = 0; k < S; k++) { const d = ring(F.normals[i], F.binormals[i], (k / S) * TAU); pos.push(o.x + d[0] * r, o.y + d[1] * r, o.z + d[2] * r); col.push(...c); }
  }
  for (let i = 0; i < N; i++) for (let k = 0; k < S; k++) { const a = b0 + i * S + k, bb = b0 + i * S + (k + 1) % S; idx.push(a, bb, a + S, bb, bb + S, a + S); }
  const t = new T.Vector3(), d = new T.Vector3();
  for (let h = 0; h < hairs; h++) {
    const u = rng(), o = curve.getPointAt(u), i = Math.round(u * N);
    curve.getTangentAt(u, t);
    d.set(...ring(F.normals[i], F.binormals[i], rng() * TAU)).addScaledVector(t, 0.35).normalize();
    const L = 0.0012 + rng() * 0.0012, k = pos.length / 3, w = 0.0002;
    pos.push(o.x + d.x * r * 0.6 + t.x * w, o.y + d.y * r * 0.6 + t.y * w, o.z + d.z * r * 0.6 + t.z * w,
      o.x + d.x * r * 0.6 - t.x * w, o.y + d.y * r * 0.6 - t.y * w, o.z + d.z * r * 0.6 - t.z * w,
      o.x + d.x * (r + L), o.y + d.y * (r + L), o.z + d.z * (r + L));
    col.push(...c, ...c, 0.66, 0.68, 0.56);
    idx.push(k, k + 1, k + 2);
  }
}

// The close-up trefoil: the far leaf's shape and fold, with nt sharp teeth a side on each leaflet (the base
// entire), straight parallel side veins running out to the teeth (pleated between, paler than the blade), a pale
// midrib and a hairy stalk.
function leafNear(T, nt, hairs = 1) {
  const pos = [], col = [], idx = [], rng = mulberry32(77);
  const L = 0.046, W = 0.0165;
  const wOf = (u) => W * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.05)), 0.75) * (0.8 + 0.7 * u * (1 - u));
  const leaflet = (yaw, tilt, k) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const put = (x, z, g, lift) => {
      const y = Math.abs(x) * 0.42 + z * Math.sin(tilt) + lift - (z / L) * (z / L) * 0.006;
      const zz = z * Math.cos(tilt) + 0.005;
      pos.push((x * c + zz * sn) * k, y * k, (-x * sn + zz * c) * k);
      col.push(0.08 * g, 0.19 * g, 0.035 * g);
    };
    for (const side of [1, -1]) {
      // the edge, base to apex: entire at the base, then notch, tooth, notch … the apex tooth
      const edge = [[0, 1, 0], [0.08, 1, 0], [0.16, 1, 0]];
      for (let t = 0; t < nt; t++) { edge.push([0.22 + (t / nt) * 0.76, 0.86, 1]); edge.push([0.22 + ((t + 0.8) / nt) * 0.76, 1.06, 2]); }
      edge.push([1, 0, 2]);
      const b0 = pos.length / 3;
      for (const [u, f, kind] of edge) {
        const w = wOf(u) * f, ze = L * Math.min(1, u + (kind === 2 ? 0.03 : 0));
        const zm = Math.max(0, ze - w * 1.1);   // the vein leaves the midrib this far back (about 45°)
        for (let v = 0; v <= 3; v++) {
          const t = v / 3, x = side * w * t, z = zm + (ze - zm) * t, bump = Math.sin(Math.PI * t);
          const lift = kind === 2 ? -0.0011 * bump : kind === 1 ? 0.0012 * bump : 0;
          const g = v === 0 ? 1.55 : kind === 2 ? (v === 3 ? 1.25 : 1.32) : kind === 1 ? 0.8 : 0.95;
          put(x, z, g * (0.86 + 0.24 * (z / L)), lift);
        }
      }
      for (let i = 0; i < edge.length - 1; i++) for (let v = 0; v < 3; v++) {
        const a = b0 + i * 4 + v, b = a + 4;
        if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  };
  leaflet(0, 0.12, 1); leaflet(1.12, -0.02, 0.92); leaflet(-1.12, -0.02, 0.92);
  hairyStalk(T, pos, col, idx, [[0, 0.003, 0.002], [0.007, -STALK * 0.5, 0.002], [0.004, -STALK, 0]], 0.0011, [0.25, 0.31, 0.11], Math.round(34 * hairs), rng);
  return geoOf(T, pos, col, idx);
}

// A hairy stalk from its start (origin) to its end (0, 0, 1), bowed up 6 cm; an instance shears it into place
// (nearLayout): x by its thickness, y by how high it arches, z from start to end.
function archNear(T) {
  const pos = [], col = [], idx = [], pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, 0.06 * Math.sin(Math.PI * Math.pow(t, 0.7)), t]); }
  hairyStalk(T, pos, col, idx, pts, 0.0009, [0.3, 0.33, 0.12], 40, mulberry32(9));
  return geoOf(T, pos, col, idx);
}

// The close-up berry: round-conical, deep red, paler at the shoulder, set all over with small yellow-brown seeds
// (achenes) standing on its skin; the calyx of five sepals and five smaller bracts spread back from the top.
function berryNear(T, NA) {
  const R = 0.0095, SEG = 16, ROWS = 12, pos = [], col = [], idx = [];
  const shape = (th) => { const y = Math.cos(th); return [Math.sin(th) * (y < 0 ? 1 - 0.38 * y * y : 1) * R, y * R * (y < 0 ? 1.45 : 1.0)]; }; // round-conical
  for (let j = 0; j <= ROWS; j++) {
    const th = (j / ROWS) * Math.PI, [w, y] = shape(th), sh = Math.cos(th);
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * TAU;
      pos.push(Math.cos(a) * w, y, Math.sin(a) * w);
      col.push(...(sh > 0.72 ? [0.72, 0.16, 0.12] : [0.56 + 0.08 * sh, 0.012, 0.02]));
    }
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < SEG; i++) { const a = j * SEG + i, b = j * SEG + (i + 1) % SEG; idx.push(a, b, a + SEG, b, b + SEG, a + SEG); }
  // achenes: a phyllotactic spiral over the berry below the calyx, each a raised diamond along the meridian
  const n = new T.Vector3(), m = new T.Vector3(), q = new T.Vector3();
  for (let k = 0; k < NA; k++) {
    const th = Math.PI * (0.3 + 0.66 * (k + 0.5) / NA), a = k * 2.39996, [w, y] = shape(th), [w2, y2] = shape(th + 0.01);
    const o = new T.Vector3(Math.cos(a) * w, y, Math.sin(a) * w);
    m.set(Math.cos(a) * (w2 - w), y2 - y, Math.sin(a) * (w2 - w)).normalize();   // down the meridian
    q.set(-Math.sin(a), 0, Math.cos(a));                                        // round the berry
    n.crossVectors(q, m).normalize(); if (n.dot(o) < 0) n.negate();
    const b = pos.length / 3, l = 0.0007, s = 0.00038;
    for (const [dm, dq, dn] of [[-l, 0, 0.0001], [0, s, 0.00032], [l, 0, 0.0001], [0, -s, 0.00032]]) pos.push(o.x + m.x * dm + q.x * dq + n.x * dn, o.y + m.y * dm + q.y * dq + n.y * dn, o.z + m.z * dm + q.z * dq + n.z * dn);
    col.push(0.5, 0.3, 0.06, 0.62, 0.42, 0.1, 0.46, 0.26, 0.05, 0.62, 0.42, 0.1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // the calyx: sepals (long) and bracts (short) spread out and back over the shoulder
  const y0 = R * 1.02;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU, big = k % 2 === 0, len = big ? R * 1.25 : R * 0.8, wd = big ? 0.0022 : 0.0012, ca = Math.cos(a), sa = Math.sin(a), b = pos.length / 3;
    const P2 = (r, side, y) => [ca * r - sa * side, y, sa * r + ca * side];
    pos.push(...P2(R * 0.18, -wd * 0.5, y0 + 0.0008), ...P2(R * 0.18, wd * 0.5, y0 + 0.0008), ...P2(R * 0.18 + len * 0.45, wd, y0 + 0.0026), ...P2(R * 0.18 + len * 0.45, -wd, y0 + 0.0026), ...P2(R * 0.18 + len, 0, y0 + 0.0012 + (big ? 0.001 : 0.002)));
    col.push(0.1, 0.24, 0.05, 0.1, 0.24, 0.05, 0.14, 0.3, 0.07, 0.14, 0.3, 0.07, 0.24, 0.36, 0.12);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2, b + 3, b + 4, b + 2, b, b + 1, b + 2, b, b + 2, b + 3, b + 3, b + 2, b + 4); // both faces
  }
  // the heart of the calyx: a little green boss where the stalk joins
  const b = pos.length / 3;
  pos.push(0, BERRY_TOP, 0); col.push(0.2, 0.32, 0.1);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; pos.push(Math.cos(a) * 0.0013, y0 + 0.0006, Math.sin(a) * 0.0013); col.push(0.12, 0.26, 0.06); }
  for (let k = 0; k < 6; k++) idx.push(b, b + 1 + (k + 1) % 6, b + 1 + k);
  return geoOf(T, pos, col, idx);
}

// The close-up flowering truss: the far truss's stalks and flower places; each flower with five round (obovate)
// white petals, green sepals and bracts showing between them, a domed yellow-green heart ringed by twenty yellow
// stamens; hairy stalks; the unripe berry pale and seeded.
function trussNear(T) {
  const pos = [], col = [], idx = [], rng = mulberry32(31);
  const ST = [0.25, 0.31, 0.11], fork = [0.008, 0.115, 0.003];
  hairyStalk(T, pos, col, idx, [[0, 0, 0], [0.005, 0.06, 0.002], fork], 0.0011, ST, 30, rng);
  const flower = (fc, lean, k) => {
    hairyStalk(T, pos, col, idx, [fork, [(fork[0] + fc[0]) / 2, (fork[1] + fc[1]) / 2 + 0.006, (fork[2] + fc[2]) / 2], fc], 0.0008, ST, 14, rng);
    const lx = Math.cos(lean), lz = Math.sin(lean), tip = 0.35;
    const at = (x, y, z) => { const o = x * lx + z * lz; pos.push(fc[0] + x, fc[1] + y - o * tip, fc[2] + z); };
    // sepals and bracts behind the petals
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * TAU + lean + Math.PI / 5, len = (j % 2 ? 0.006 : 0.009) * k, w = (j % 2 ? 0.0011 : 0.0019) * k, ca = Math.cos(a), sa = Math.sin(a), b = pos.length / 3;
      at(ca * 0.0015 - sa * w, -0.0004, sa * 0.0015 + ca * w); at(ca * 0.0015 + sa * w, -0.0004, sa * 0.0015 - ca * w); at(ca * len, -0.0006, sa * len);
      col.push(0.12, 0.26, 0.06, 0.12, 0.26, 0.06, 0.2, 0.34, 0.1);
      idx.push(b, b + 1, b + 2);
    }
    // petals: a short claw widening to a round tip, cupped a little
    const rim = [[0.0032, -0.0012], [0.0055, -0.0034], [0.008, -0.0048], [0.0102, -0.0042], [0.0116, -0.0022], [0.012, 0], [0.0116, 0.0022], [0.0102, 0.0042], [0.008, 0.0048], [0.0055, 0.0034], [0.0032, 0.0012]];
    for (let j = 0; j < 5; j++) {
      const a = (j / 5) * TAU + lean, ca = Math.cos(a), sa = Math.sin(a), b = pos.length / 3;
      const P2 = (r, s, y) => at(ca * r - sa * s, y, sa * r + ca * s);
      P2(0.0025, 0, 0.0012); col.push(0.88, 0.88, 0.72);
      for (const [r, s] of rim) { P2(r * k, s * k, 0.0016 + 0.0012 * Math.abs(s) / 0.0048); col.push(0.97, 0.97, 0.93); }
      for (let i = 0; i < rim.length - 1; i++) idx.push(b, b + 2 + i, b + 1 + i);
    }
    // heart: a domed yellow-green receptacle
    const hb = pos.length / 3;
    at(0, 0.0046, 0); col.push(0.8, 0.78, 0.2);
    for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU; at(Math.cos(a) * 0.0026 * k, 0.0026, Math.sin(a) * 0.0026 * k); col.push(0.7, 0.68, 0.14); }
    for (let j = 0; j < 8; j++) idx.push(hb, hb + 1 + (j + 1) % 8, hb + 1 + j);
    // stamens: a ring of twenty, each a thin filament with a yellow anther, leaning out
    for (let j = 0; j < 20; j++) {
      const a = (j / 20) * TAU + 0.1, ca = Math.cos(a), sa = Math.sin(a), r0 = 0.0029 * k, r1 = 0.0043 * k, b = pos.length / 3;
      at(ca * r0 - sa * 0.0002, 0.0019, sa * r0 + ca * 0.0002); at(ca * r0 + sa * 0.0002, 0.0019, sa * r0 - ca * 0.0002);
      at(ca * r1 - sa * 0.00055, 0.0042, sa * r1 + ca * 0.00055); at(ca * r1 + sa * 0.00055, 0.0042, sa * r1 - ca * 0.00055);
      at(ca * (r1 + 0.0005), 0.0051, sa * (r1 + 0.0005));
      col.push(0.9, 0.86, 0.6, 0.9, 0.86, 0.6, 0.95, 0.75, 0.08, 0.95, 0.75, 0.08, 0.98, 0.8, 0.1);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3, b + 2, b + 4, b + 3);
    }
  };
  flower(TRUSS_TOP, 0.4, 1); flower([-0.016, 0.148, -0.012], 3.6, 0.9); flower([0.024, 0.136, 0.02], 1.4, 0.82);
  // the unripe berry on a side branch: small, pale green-white, its seeds showing
  const from = [0.005, 0.06, 0.002], to = [-0.02, 0.085, 0.014];
  hairyStalk(T, pos, col, idx, [from, [(from[0] + to[0]) / 2, to[1] + 0.008, (from[2] + to[2]) / 2], to], 0.0007, ST, 10, rng);
  const g = berryNear(T, 30), gp = g.attributes.position, gc = g.attributes.color, b = pos.length / 3;
  for (let i = 0; i < gp.count; i++) {
    pos.push(to[0] + gp.getX(i) * 0.55, to[1] - 0.007 + gp.getY(i) * 0.55, to[2] + gp.getZ(i) * 0.55);
    const red = gc.getX(i) > 0.4 && gc.getY(i) < 0.2; // the red skin is pale green while unripe
    col.push(...(red ? [0.62, 0.7, 0.42] : [gc.getX(i), gc.getY(i), gc.getZ(i)]));
  }
  for (const i of g.index.array) idx.push(b + i);
  return geoOf(T, pos, col, idx);
}
