// A merged shadow proxy's triangles, simplified for the shadow pass (load worker job 'simplify', src/load/worker.js):
// coincident positions welded first (the source parts split them at uv/normal seams, which the simplifier would
// keep as borders), then meshoptimizer collapses edges while the surface moves < `error` m (under a shadow texel)
// and prunes parts smaller than that (they cast no visible shadow). Returns the new index and only the vertices it
// still uses, in the order the triangles meet them.
import { MeshoptSimplifier } from 'meshoptimizer';

export async function simplifyShadow({ pos, idx, error }) {
  await MeshoptSimplifier.ready;
  const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
  const welded = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) welded[i] = remap[idx[i]];
  const [out] = MeshoptSimplifier.simplify(welded, pos, 3, 0, error, ['ErrorAbsolute', 'Prune']);
  const slot = new Int32Array(pos.length / 3).fill(-1);
  let n = 0;
  for (let i = 0; i < out.length; i++) { if (slot[out[i]] < 0) slot[out[i]] = n++; }
  const kept = new Float32Array(n * 3), index = n > 65535 ? new Uint32Array(out.length) : new Uint16Array(out.length);
  for (let i = 0; i < out.length; i++) {
    const v = out[i], s = slot[v];
    index[i] = s; kept[s * 3] = pos[v * 3]; kept[s * 3 + 1] = pos[v * 3 + 1]; kept[s * 3 + 2] = pos[v * 3 + 2];
  }
  return { pos: kept, idx: index };
}
