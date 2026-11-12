// Ground contact. Models are built (and baked) once for every tier, over the true terrain or a level floor; the ground
// each tier draws is its own grid, linear between nodes, and differs from the terrain by up to ~10 cm (more at the far
// places, where the grid is coarse). Once the homestead is placed (World.build, before merging) every resting thing is
// moved onto the surface as this tier draws it, `world.drawnAt` without floors: the drawn ground, raised by the
// models' rests (earth floors and mats drawn over it, exact where a rest carries its height function).
// - Meshes with `userData.ground` follow it vertex by vertex: every vertex within FULL of its reference moves by
//   (surface − reference), fading out to FADE. The reference: 'grime' = the yard Bucket's per-vertex height over the
//   ground it was shaped on (yardlife/kit.js); 'terrain' = shaped over the terrain itself; a number = the level (model
//   frame) it was built standing on.
// - Objects with `userData.rest` (loose things, taken later) move as one, their lowest point on the surface.
// The geometry's bounding box stays as built: the homestead atlas key (engine/lod.js) is the same on every tier.
import * as THREE from 'three/webgpu';
import { restY } from '../interact/rest.js';
import { smooth } from '../util.js';

const FULL = 0.35, FADE = 0.8;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// in slices of ≤ ~8 ms between frames (`world.breathe`); returns { meshes, verts, things, ms, slice }
export async function settle(world) {
  const work = [];
  let things = 0;
  for (const { object: root } of world.placed) root.traverse((o) => { // world matrices as World.place left them
    if (o.userData.rest) { things++; work.push(() => { rest(world, o); return 0; }); }
    else if (o.isMesh && o.userData.ground !== undefined) work.push(() => drape(world, o, root));
  });
  let ms = 0, slice = 0, verts = 0, t = performance.now();
  for (const job of work) {
    verts += job();
    const d = performance.now() - t;
    if (d > 8) { ms += d; slice = Math.max(slice, d); await world.breathe(); t = performance.now(); }
  }
  const d = performance.now() - t; ms += d; slice = Math.max(slice, d);
  console.info(`settle: ${work.length - things} meshes (${verts} vertices moved), ${things} things: ${Math.round(ms)} ms, longest slice ${Math.round(slice)} ms`);
  return { meshes: work.length - things, things, verts, ms: Math.round(ms), slice: Math.round(slice) };
}

// the surface under (x, z) for the rests overlapping a box (world xz)
function surfaceIn(world, box) {
  const rs = world.rests.filter((f) => { // (`loose` rests, a mat lying on a floor, only take things set down in play)
    if (f.loose) return false;
    const R = f.r ?? Math.hypot(f.hw, f.hd);
    return f.x + R > box.min.x && f.x - R < box.max.x && f.z + R > box.min.z && f.z - R < box.max.z;
  });
  if (!rs.length) { world.drawnAt(box.min.x, box.min.z); return world._drawnG || world._drawn || ((x, z) => world.drawnAt(x, z, null, null)); } // the bare grid sampler
  return (x, z) => world.drawnAt(x, z, rs, null);
}

function drape(world, mesh, root) {
  const g = mesh.geometry, p = g.attributes.position;
  if (!p?.array?.length) return 0;
  const e = mesh.matrixWorld.elements;
  if (Math.abs(e[1]) > 1e-6 || Math.abs(e[9]) > 1e-6 || Math.abs(e[5] - 1) > 1e-6) { console.warn(`settle: ${mesh.name} is tilted or scaled: not draped`); return 0; }
  if (!g.boundingBox) g.computeBoundingBox(); // as built (see above)
  const wb = g.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
  const ref = mesh.userData.ground, grime = ref === 'grime' ? g.attributes.grime : null;
  if (ref === 'grime' && !grime) return 0;
  const level = root.position.y + (typeof ref === 'number' ? ref : 0), T = world.terrain;
  const terr = ref === 'terrain' && (T.heightFast ? (x, z) => T.heightFast(x, z) : (x, z) => T.height(x, z));
  const surf = surfaceIn(world, wb);
  let n = 0;
  const A = p.array, G = grime?.array;
  if (p.isInterleavedBufferAttribute || p.itemSize !== 3 || (grime && grime.itemSize !== 1)) return 0;
  for (let i = 0; i < p.count; i++) {
    const lx = A[i * 3], ly = A[i * 3 + 1], lz = A[i * 3 + 2];
    const x = e[0] * lx + e[8] * lz + e[12], y = ly + e[13], z = e[2] * lx + e[10] * lz + e[14];
    const h = G ? G[i] : terr ? y - terr(x, z) : y - level; // height over the reference
    if (h > FADE || h < -FADE) continue;
    const w = h < FULL ? 1 : 1 - smooth(FULL, FADE, h);
    const d = surf(x, z) - (y - h);
    if (d !== 0) { A[i * 3 + 1] = ly + w * d; n++; }
  }
  if (n) { p.needsUpdate = true; g.computeBoundingSphere(); }
  return n;
}

function rest(world, o) {
  o.getWorldPosition(_v); o.getWorldQuaternion(_q);
  const y = restY(world, o, _q, _v.x, _v.z, 0.001);
  o.position.y += y - _v.y;
  o.updateMatrixWorld(true);
}
