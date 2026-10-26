// The taiga around the alaas: Cajander larch, birch, some Scots pine, dead larches, shrubs,
// stumps and fallen logs. ~150k trees placed from terrain.forest(); drawn in three rings:
//   0–R0 m full trees, R0–R1 m coarser trees (both instanced per variant, shadows), beyond R1
//   octahedral-ish billboard impostors baked at load, then a canopy band to the horizon.
// Rings cross-fade with a screen dither. Near trunks get colliders.
import * as THREE from 'three/webgpu';
import { makeTree } from './trees/gen.js';
import { barkMaterial, leafMaterial, U } from './trees/materials.js';
import { buildImpostors } from './trees/impostor.js';
import { buildDeadwood } from './trees/deadwood.js';
import { buildCanopyBand, canopyGeometry } from './trees/canopy.js';
import { geoBuild, section } from '../load/geocache.js';
import { scatterTrees } from './trees/scatter.js';
import { job } from '../load/workers.js';
import { PLACEMENTS } from '../world/layout.js';
import { urlFlag, KEYART } from '../util.js';

import { TIER } from '../engine/tier.js';

// trees to FAR m from the alaas centre, the canopy band beyond; low tiers pull the full/coarse rings in (TIER.forest)
export const BAND = 7, FAR = 950;
let R0 = 44, R1 = 100;
const VARIANTS = [ // [species, count, options] — group key is options.kind or the species
  ['larch', 6], ['birch', 5], ['birch', 2, { young: true, kind: 'youngBirch' }], ['pine', 3], ['deadLarch', 2], ['shrub', 2, { kind: 'willow' }], ['shrub', 2, { kind: 'rose' }],
];

export default async function forest(ctx, world) {
  if (urlFlag('noforest')) return; // A/B timing
  const { terrain } = world;
  const t0 = performance.now();
  R0 = Math.round(44 * TIER.forest); R1 = Math.round(100 * TIER.forest);
  if (KEYART) { R0 = 5000; R1 = 5100; } // ?keyart: every tree full (lod0), no coarse ring or impostors

  // ---------- placement: in a worker (trees/scatter.js) while the variants are made here ----------
  const bySp = {}; // variant indices per kind, in the order the variants are made below
  let nv = 0;
  for (const [sp, n, o = {}] of VARIANTS) for (let i = 0; i < n; i++) (bySp[o.kind || sp] ||= []).push(nv++);
  const keep = PLACEMENTS.map((p) => ({ x: p.x, z: p.z, r: p.model === 'sacred-birch' ? 24 : (p.pad || 6) + 12 }));
  // debug: `?trees` lines every variant up on the meadow at z = −120 (x = −60 + 9·i), plus shrubs
  const lineUp = urlFlag('trees') ? nv : 0;
  const args = { bySp, keep, far: FAR, lineUp };
  const scattered = job('scatter', { pads: terrain.pads, ...args }, () => scatterTrees(terrain, args));

  // ---------- variants (baked: src/load/geocache.js) and the canopy band's geometry ----------
  const variants = [];
  let canopy;
  await geoBuild('forest', JSON.stringify({ VARIANTS, FAR, pads: terrain.pads }), async () => {
    variants.length = 0;
    for (const [sp, n, o = {}] of VARIANTS) for (let i = 0; i < n; i++) {
      const v = section(() => {
        const { lod0, lod1, H, r0, species, box, radius, trunkR } = makeTree(sp, 1000 + variants.length * 7919 + i, o);
        return { lod0, lod1, H, r0, species, box, radius, trunkR };
      });
      v.index = variants.length; v.kind = o.kind || sp; variants.push(v);
      if (variants.length % 4 === 0) await new Promise((r) => setTimeout(r, 0)); // short main-thread tasks
    }
    canopy = section(() => canopyGeometry(terrain, FAR * 0.9));
  }, { rngs: false });

  const trees = await scattered;
  const { N, DEPTH, X, Z, Y, ROT, S, VI } = trees;
  // ---------- spatial grid for the near rings ----------
  const G0 = -FAR * 1.25, CELL = 32, GN = Math.ceil(-G0 * 2 / CELL);
  const cellOf = (x, z) => Math.floor((z - G0) / CELL) * GN + Math.floor((x - G0) / CELL);
  const counts = new Uint32Array(GN * GN + 1);
  for (let k = 0; k < N; k++) counts[cellOf(X[k], Z[k]) + 1]++;
  for (let c = 1; c <= GN * GN; c++) counts[c] += counts[c - 1];
  const items = new Uint32Array(N), fill = counts.slice(0, GN * GN);
  for (let k = 0; k < N; k++) items[fill[cellOf(X[k], Z[k])]++] = k;

  // ---------- instanced near/mid meshes ----------
  const CAP = KEYART ? [N, 1] : [Math.ceil(900 * TIER.forest ** 2), Math.ceil(4000 * TIER.forest ** 2)];
  const group = new THREE.Group(); group.name = 'forest';
  const mats = {};
  const matFor = (sp, part) => (mats[sp + part] ||= part === 'bark' ? barkMaterial(sp) : leafMaterial(sp));
  const sets = [0, 1].map((lod) => variants.map((v) => {
    // per-instance (x, y, z, yaw) and (scale, fade), shared by the bark and leaf geometry
    const itr = new THREE.InstancedBufferAttribute(new Float32Array(CAP[lod] * 4), 4);
    const isc = new THREE.InstancedBufferAttribute(new Float32Array(CAP[lod] * 3), 3);
    itr.setUsage(THREE.DynamicDrawUsage); isc.setUsage(THREE.DynamicDrawUsage);
    const meshes = [];
    for (const part of ['bark', 'leaves']) {
      const src = v[`lod${lod}`][part];
      if (!src) continue;
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = src.index;
      for (const k in src.attributes) geo.setAttribute(k, src.attributes[k]);
      geo.setAttribute('itr', itr); geo.setAttribute('isc', isc);
      geo.instanceCount = 0;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const m = new THREE.Mesh(geo, matFor(v.species, part));
      m.frustumCulled = false; m.castShadow = lod === 0; m.receiveShadow = true; // mid trees cast no shadows (cost)
      m.name = `${v.species}${v.index}-lod${lod}-${part}`;
      m.layers.set(1); // the lake reflection (layer 0 only) skips near trees; impostors and canopy still mirror
      group.add(m); meshes.push(m);
    }
    return { meshes, itr, isc, n: 0 };
  }));
  world.scene.add(group);

  // ---------- far impostors, canopy band, deadwood, shrubs ----------
  const imp = await buildImpostors(world, variants, trees, { R1, BAND });
  imp.object.visible = !KEYART;
  world.scene.add(imp.object);
  world.scene.add(buildCanopyBand(canopy));
  const dead = buildDeadwood(world, trees, { keep });
  dead.object.traverse((o) => o.layers.set(1));
  world.scene.add(dead.object);
  world.engine?.camera.layers.enable(1);

  // ---------- colliders for near trunks (a fixed pool, refilled as the player moves) ----------
  const POOL = 40;
  const pool = [];
  for (let i = 0; i < POOL; i++) { const c = { kind: 'circle', x: 1e7, z: 1e7, r: 0 }; pool.push(c); world.colliders.push(c); }

  // ---------- LOD refresh ----------
  let lastX = 1e9, lastZ = 1e9, timer = 0;
  // ?keyart: only trees whose bounds (+40 m: shadows cast into view) touch the view frustum, or all lod0 would be ~0.5 G triangles
  const frustum = new THREE.Frustum(), sphere = new THREE.Sphere(), m4 = new THREE.Matrix4();
  const refresh = (ex, ez) => {
    for (const lod of sets) for (const s of lod) s.n = 0;
    const cam = KEYART && world.engine?.camera;
    if (cam) { cam.updateMatrixWorld(); frustum.setFromProjectionMatrix(m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
    let nc = 0;
    const reach = R1 + BAND;
    const c0x = Math.max(0, Math.floor((ex - reach - G0) / CELL)), c1x = Math.min(GN - 1, Math.floor((ex + reach - G0) / CELL));
    const c0z = Math.max(0, Math.floor((ez - reach - G0) / CELL)), c1z = Math.min(GN - 1, Math.floor((ez + reach - G0) / CELL));
    for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
      const c = cz * GN + cx;
      for (let a = counts[c]; a < counts[c + 1]; a++) {
        const k = items[a];
        const d = Math.hypot(X[k] - ex, Z[k] - ez);
        if (d > reach) continue;
        const vi = VI[k];
        if (cam) {
          const h = variants[vi].H * S[k];
          sphere.center.set(X[k], Y[k] + h / 2, Z[k]); sphere.radius = h / 2 + variants[vi].radius * S[k] + 40;
          if (!frustum.intersectsSphere(sphere)) continue;
        }
        // cross-fades: lod0 fades out over R0±BAND while lod1 fades in on the complementary dither;
        // lod1 fades out over R1±BAND while the impostors (shader side) fade in
        const f0 = Math.min(1, Math.max(0, (R0 + BAND - d) / (2 * BAND)));
        const f1 = Math.min(1, Math.max(0, (R1 + BAND - d) / (2 * BAND)));
        const put = (lod, f) => {
          const s = sets[lod][vi];
          if (f === 0 || s.n >= CAP[lod]) return;
          s.itr.array.set([X[k], Y[k], Z[k], ROT[k]], s.n * 4); s.isc.array.set([S[k], f, DEPTH[k]], s.n * 3); s.n++;
        };
        if (d < R0 + BAND) put(0, f0);
        if (d > R0 - BAND) put(1, d < R0 + BAND ? (f0 > 0 ? -(1 - f0) : 1) : f1);
        if (d < 14 && nc < POOL) {
          const c = pool[nc++]; c.x = X[k]; c.z = Z[k]; c.r = variants[vi].trunkR * S[k] * 1.25 + 0.03;
        }
      }
    }
    for (let i = nc; i < POOL; i++) { pool[i].x = 1e7; pool[i].z = 1e7; }
    for (const lod of sets) for (const s of lod) {
      for (const m of s.meshes) { m.geometry.instanceCount = s.n; m.visible = s.n > 0; }
      if (s.n) for (const [a, w] of [[s.itr, 4], [s.isc, 3]]) { // upload only the used instances
        a.clearUpdateRanges(); a.addUpdateRange(0, s.n * w); a.needsUpdate = true;
      }
    }
  };

  const sun = world.engine?.sun;
  world.updaters.push((dt, { camera }) => {
    U.time.value += dt;
    if (sun) {
      U.sunDir.value.copy(sun.position).normalize();
      U.sunCol.value.copy(sun.color).multiplyScalar(sun.intensity / 5.0); // 5.0 = the engine's midday peak
    }
    const e = camera.position;
    U.eye.value.copy(e);
    timer -= dt;
    if (timer <= 0 || Math.hypot(e.x - lastX, e.z - lastZ) > 1.5) {
      refresh(e.x, e.z); lastX = e.x; lastZ = e.z; timer = 0.5;
    }
  });
  // first fill so the opening frame already has trees
  if (world.engine?.camera) refresh(world.engine.camera.position.x, world.engine.camera.position.z);

  world.forest = { trees, variants, refresh, stats: () => ({ trees: N, lod0: sets[0].reduce((a, s) => a + s.n, 0), lod1: sets[1].reduce((a, s) => a + s.n, 0) }) };
  console.info(`forest: ${N} trees, ${variants.length} variants, ${(performance.now() - t0) | 0} ms`);
}
