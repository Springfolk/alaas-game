// Load-time worker: pure-CPU generation off the main thread. Messages { id, type, ...args } → { id, result }
// (typed arrays and bitmaps transferred). Types: 'ground' (grid samples), 'pack' (a ground splat set's texels),
// 'field' / 'mask' (grass.js's meadow field and homestead mask texels), 'scatter' (the taiga's trees), 'geo' (a pack), 'bitmap' (a texture image),
// 'simplify' (a shadow proxy's triangles).
import { Terrain } from '../world/terrain.js';
import { groundSamples, packSet } from '../world/ground-data.js';
import { fieldTexels, maskTexels } from '../nature/grass/field.js';
import { scatterTrees } from '../nature/trees/scatter.js';
import { fetchPack } from './geocodec.js';
import { loadBitmap } from './bitmap.js';
import { simplifyShadow } from './simplify.js';

const buffers = (o, out = []) => {
  if (ArrayBuffer.isView(o)) out.push(o.buffer);
  else if (typeof ImageBitmap !== 'undefined' && o instanceof ImageBitmap) out.push(o);
  else if (o && typeof o === 'object') for (const v of Object.values(o)) buffers(v, out);
  return out;
};
const terrain = (pads) => Object.assign(new Terrain(), { pads });

const JOBS = {
  ground: ({ pads, sizes }) => sizes.map((N) => groundSamples(terrain(pads), N)),
  pack: ({ base, max }) => packSet(base, max),
  field: ({ pads, spots }) => fieldTexels(terrain(pads), spots),
  mask: ({ R, G, spots, mask }) => maskTexels(R, G, spots, mask),
  scatter: ({ pads, ...args }) => scatterTrees(terrain(pads), args),
  geo: ({ url }) => fetchPack(url), // a baked geometry pack (src/load/geocache.js)
  bitmap: ({ url, max, flip }) => loadBitmap(url, max, 3, flip), // a texture image (src/load/bitmap.js)
  simplify: (args) => simplifyShadow(args), // a shadow proxy (src/load/simplify.js)
};

self.onmessage = async ({ data: { id, type, ...args } }) => {
  try {
    const result = await JOBS[type](args);
    self.postMessage({ id, result }, [...new Set(buffers(result))]);
  } catch (e) { self.postMessage({ id, error: String(e?.message || e) }); }
};
