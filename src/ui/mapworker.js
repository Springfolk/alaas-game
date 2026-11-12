// The journal map's close tiles (src/ui/maptiles.js): one square of the world drawn (src/ui/mapdraw.js), sent back as PNG.
import { Terrain } from '../world/terrain.js';
import { drawMap } from './mapdraw.js';

const T = new Terrain();
onmessage = async ({ data: m }) => {
  if (m.pads) { T.pads = m.pads; return; }
  const { key, x0, z0, span, size, M } = m;
  const c = new OffscreenCanvas(size, size);
  c.getContext('2d').putImageData(new ImageData(drawMap(T, x0, z0, span, size, M), size), 0, 0);
  postMessage({ key, blob: await c.convertToBlob({ type: 'image/png' }) });
};
