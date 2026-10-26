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

// Phones: every tree in the forest's outer rows (DEPTH < 0.25, ~15 m in), every other one deeper in — there the far
// impostors stood card behind card (fill a phone GPU pays per layer); the treeline still reads as dense
function thin(t) {
  if (TIER.name !== 'mobile' || KEYART) return t;
  const keep = [];
  for (let k = 0; k < t.N; k++) if (t.DEPTH[k] < 0.25 || ((k * 2654435761) >>> 0) % 100 < 50) keep.push(k);
  const out = { N: keep.length };
  for (const key of ['DEPTH', 'X', 'Z', 'Y', 'ROT', 'S', 'VI']) out[key] = t[key].constructor.from(keep, (k) => t[key][k]);
  return out;
}
let R0 = 34, R1 = 100;
const VARIANTS = [ // [species, count, options] — group key is options.kind or the species
  ['larch', 6], ['birch', 5], ['birch', 2, { young: true, kind: 'youngBirch' }], ['pine', 3], ['deadLarch', 2], ['shrub', 2, { kind: 'willow' }], ['shrub', 2, { kind: 'rose' }],
];

export default async function forest(ctx, world) {
  if (urlFlag('noforest')) return; // A/B timing
  const { terrain } = world;
  const t0 = performance.now();
  R0 = Math.round(34 * TIER.forest); R1 = Math.round(100 * TIER.forest); // R0 was 44: the full trees (5–7k bark triangles each) were ~30% of a forest-edge frame
  if (KEYART) { R0 = 5000; R1 = 5100; } // ?keyart: every tree full (lod0), no coarse ring or impostors

  // ---------- placement: in a worker (trees/scatter.js) while the variants are made here ----------
  const bySp = {}; // variant indices per kind, in the order the variants are made below
  let nv = 0;
  for (const [sp, n, o = {}] of VARIANTS) for (let i = 0; i < n; i++) (bySp[o.kind || sp] ||= []).push(nv++);
  const keep = PLACEMENTS.map((p) => ({ x: p.x, z: p.z, r: p.model === 'sacred-birch' ? 60 : (p.pad || 6) + 12 }));
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

  const trees = thin(await scattered);
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
  let lastX = 1e9, lastZ = 1e9, lastYaw = 0, timer = 0;
  const fwd = new THREE.Vector3();
  // ?keyart: only trees whose bounds (+40 m: shadows cast into view) touch the view frustum, or all lod0 would be ~0.5 G triangles
  const frustum = new THREE.Frustum(), sphere = new THREE.Sphere(), m4 = new THREE.Matrix4();
  // view (every tier, not ?keyart): only trees in the camera's horizontal view cone (half-FOV + CONE margin) or
  // within NEAR m; a full tree (it casts shadows) also when its shadow's tip lands in the cone. A turn past TURN
  // refills at once (the updater, before this frame's render), so a turn never shows a gap.
  const CONE = 0.45, TURN = 0.2, NEAR = 12;
  const view = { on: false, fx: 0, fz: 1, cos: -1, sx: 0, sz: 0, sl: 0 };
  const inView = (x, z, d) => view.fx * x + view.fz * z >= view.cos * d;
  // one instance into its variant's buffers (no closure or array per tree: a refresh touches thousands, and
  // WebKit keeps that garbage for its periodic 40–70 ms collections)
  const put = (lod, vi, k, f) => {
    const s = sets[lod][vi];
    if (f === 0 || s.n >= CAP[lod]) return;
    const a = s.itr.array, b = s.isc.array, i = s.n * 4, j = s.n * 3;
    a[i] = X[k]; a[i + 1] = Y[k]; a[i + 2] = Z[k]; a[i + 3] = ROT[k];
    b[j] = S[k]; b[j + 1] = f; b[j + 2] = DEPTH[k];
    s.n++;
  };
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
        let shadowOnly = false;
        if (view.on && d > NEAR && !inView(X[k] - ex, Z[k] - ez, d)) {
          if (d > R0 + BAND) continue;
          const L = Math.min(60, variants[vi].H * S[k] * view.sl), tx = X[k] - ex + view.sx * L, tz = Z[k] - ez + view.sz * L;
          if (!inView(tx, tz, Math.hypot(tx, tz))) continue;
          shadowOnly = true; // only its shadow shows: the full tree, no lod1 cross-fade partner
        }
        const f0 = Math.min(1, Math.max(0, (R0 + BAND - d) / (2 * BAND)));
        const f1 = Math.min(1, Math.max(0, (R1 + BAND - d) / (2 * BAND)));
        if (d < R0 + BAND) put(0, vi, k, f0);
        if (d > R0 - BAND && !shadowOnly) put(1, vi, k, d < R0 + BAND ? (f0 > 0 ? -(1 - f0) : 1) : f1);
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
    camera.getWorldDirection(fwd);
    const h = Math.hypot(fwd.x, fwd.z), yaw = Math.atan2(fwd.x, fwd.z);
    const turned = Math.abs(Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw))) > TURN;
    if (timer <= 0 || turned || Math.hypot(e.x - lastX, e.z - lastZ) > 1.5) {
      // looking nearly straight up or down: no cone; else the half-FOV across (portrait phones: narrow) + margin
      view.on = !KEYART && h > 0.25;
      if (view.on) {
        const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
        view.fx = fwd.x / h; view.fz = fwd.z / h; view.cos = Math.cos(Math.min(Math.PI, half + CONE + TURN));
        if (sun) { // shadow direction on the ground (away from the sun) and length per metre of height
          const sd = sun.position, sh = Math.hypot(sd.x, sd.z) || 1;
          view.sx = -sd.x / sh; view.sz = -sd.z / sh; view.sl = Math.min(4, sh / Math.max(1e-3, sd.y));
        } else view.sl = 0;
      }
      refresh(e.x, e.z); lastX = e.x; lastZ = e.z; lastYaw = yaw; timer = 0.5;
    }
  });
  // first fill so the opening frame already has trees
  if (world.engine?.camera) refresh(world.engine.camera.position.x, world.engine.camera.position.z);

  world.forest = { trees, variants, refresh, stats: () => ({ trees: N, lod0: sets[0].reduce((a, s) => a + s.n, 0), lod1: sets[1].reduce((a, s) => a + s.n, 0) }) };
  console.info(`forest: ${N} trees, ${variants.length} variants, ${(performance.now() - t0) | 0} ms`);
}
