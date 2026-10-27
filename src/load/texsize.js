// Shipped texture sizes (tools/tex-sizes.mjs): each image under assets/tex/ also exists at 1024/512/256 on its
// long edge as `<name>@<size>.webp`; src/data/tex-sizes.json holds each image's full edge.
import SIZES from '../data/tex-sizes.json';
import { versioned } from './assetv.js';

export const FIRST = 256; // every load starts here; sharpenTextures() (src/engine/materials.js) brings the tier's size

// The URL of the smallest shipped size of `url` that still covers `max` (the full image when none is smaller), versioned.
export function sized(url, max) {
  const rel = url.match(/assets\/tex\/(.+\.webp)$/)?.[1], full = rel && SIZES[rel];
  if (!full) return versioned(url);
  let s = full;
  for (const v of [1024, 512, 256]) if (v < full && v >= max) s = v;
  return versioned(s === full ? url : url.replace(/\.webp$/, `@${s}.webp`));
}

// The edge a load at `max` gets (for knowing whether a later, larger max changes anything).
export function edgeFor(url, max) {
  const rel = url.match(/assets\/tex\/(.+\.webp)$/)?.[1], full = rel && SIZES[rel];
  return Math.min(max, full || max);
}
