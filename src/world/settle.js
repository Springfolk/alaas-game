// Ground contact. Models are built (and baked) once for every tier, over the true terrain or a level floor; the ground
// each tier draws is its own grid, linear between nodes, and differs from the terrain by up to ~10 cm (more at the far
// places, where the grid is coarse). Once the homestead is placed (World.build, before merging) every resting thing is
// moved onto the surface as this tier draws it, `world.drawnAt` without floors: the drawn ground, raised by the
// models' rests (earth floors and mats drawn over it, exact where a rest carries its drawn surface).
// - Meshes with `userData.ground` follow it vertex by vertex, in a load worker (settle-data.js): every vertex within
//   FULL of its reference moves by (surface − reference), fading out to FADE. The reference: 'grime' = the yard
//   Bucket's per-vertex height over the ground it was shaped on (yardlife/kit.js); 'terrain' = shaped over the terrain
//   itself; a number = the level (model frame) it was built standing on.
// - Objects with `userData.rest` (loose things, taken later) move as one, their lowest point on the surface.
// The geometry's bounding box stays as built: the homestead atlas key (engine/lod.js) is the same on every tier.
import * as THREE from 'three/webgpu';
import { restY } from '../interact/rest.js';
import { work } from '../load/workers.js';
import { settleMeshes } from './settle-data.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// returns { meshes, verts, things, ms (main thread), wall }
export async function settle(world) {
  const t0 = performance.now();
  const meshes = [], things = [];
  for (const { object: root } of world.placed) root.traverse((o) => { // world matrices as World.place left them
    if (o.userData.rest) things.push(o);
    else if (o.isMesh && o.userData.ground !== undefined) {
      const g = o.geometry, p = g.attributes.position, ref = o.userData.ground, grime = ref === 'grime' ? g.attributes.grime : null, e = o.matrixWorld.elements;
      if (!p?.array?.length || p.isInterleavedBufferAttribute || p.itemSize !== 3 || (ref === 'grime' && (!grime || grime.itemSize !== 1))) return;
      if (Math.abs(e[1]) > 1e-6 || Math.abs(e[9]) > 1e-6 || Math.abs(e[5] - 1) > 1e-6) { console.warn(`settle: ${o.name} is tilted or scaled: not draped`); return; }
      meshes.push({ o, args: { pos: p.array.slice(), grime: grime?.array.slice(), e: [...e], ref, level: root.position.y + (typeof ref === 'number' ? ref : 0) } });
    }
  });
  const g = world.ground.userData, pads = world.terrain.pads;
  const args = { N: g.N, mm: g.h, pads, rests: world.rests.filter((f) => !f.loose), meshes: meshes.map((m) => m.args) }; // (`loose` rests, a mat lying on a floor, only take things set down in play)
  const job = work('settle', args, () => ({ meshes: settleMeshes(args), pos: args.meshes.map((m) => m.pos) }));
  for (const o of things) rest(world, o); // meanwhile
  let ms = performance.now() - t0;
  const res = await job;
  const t1 = performance.now();
  let verts = 0;
  meshes.forEach(({ o }, k) => {
    const { n, box, sphere } = res.meshes[k], geo = o.geometry;
    if (!geo.boundingBox) geo.boundingBox = new THREE.Box3(new THREE.Vector3(box[0], box[1], box[2]), new THREE.Vector3(box[3], box[4], box[5])); // as built (see above)
    if (!n) return;
    const p = geo.attributes.position;
    p.array.set(res.pos[k]); p.needsUpdate = true;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(sphere[0], sphere[1], sphere[2]), sphere[3]);
    verts += n;
  });
  ms += performance.now() - t1;
  const wall = Math.round(performance.now() - t0);
  console.info(`settle: ${meshes.length} meshes (${verts} vertices moved), ${things.length} things: ${Math.round(ms)} ms on the main thread, ${wall} ms in all`);
  return { meshes: meshes.length, things: things.length, verts, ms: Math.round(ms), wall };
}

function rest(world, o) {
  o.getWorldPosition(_v); o.getWorldQuaternion(_q);
  const y = restY(world, o, _q, _v.x, _v.z, 0.001);
  o.position.y += y - _v.y;
  o.updateMatrixWorld(true);
}
