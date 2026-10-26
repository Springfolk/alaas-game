// A merged shadow proxy's triangles, simplified for the shadow pass (load worker job 'simplify', src/load/worker.js):
// coincident positions welded first (the source parts split them at uv/normal seams, which the simplifier would
// keep as borders), then meshoptimizer collapses edges while the surface moves < `error` m (under a shadow texel)
// and prunes parts smaller than that (they cast no visible shadow). Returns the new index, the same vertices.
import { MeshoptSimplifier } from 'meshoptimizer';

export async function simplifyShadow({ pos, idx, error }) {
  await MeshoptSimplifier.ready;
  const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
  const welded = new Uint32Array(idx.length);
  for (let i = 0; i < idx.length; i++) welded[i] = remap[idx[i]];
  const [out] = MeshoptSimplifier.simplify(welded, pos, 3, 0, error, ['ErrorAbsolute', 'Prune']);
  return out;
}
