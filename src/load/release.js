// Drops the JS copy of vertex data the GPU already holds (three keeps every array after the upload) and the decoded
// geometry packs (src/load/geocache.js). Called once the world is built (before the warm-up, its memory peak) and
// again after it (meshes first drawn there). By then the load's readers are done: merges and shadow proxies are
// built (World.build awaits them; the simplify job got its own copy), impostor bakes only render.
// Kept: positions + index of placed models and interactables (look-at and vault raycasts, the merge watchdog's
// rebuild), anything not StaticDrawUsage (attributes rewritten in play are marked DynamicDrawUsage where made),
// instanced and interleaved data, and whatever has no GPU buffer yet (never drawn: e.g. the coarse ground on phones).
// A freed attribute keeps its count and array type (three's pipeline layout reads them); bounds are computed first.
// `?keepgeo`: off (A/B). Dev: reading a freed array outside three, or marking one for upload, warns once.
import { StaticDrawUsage } from 'three/webgpu';
import { KEYART, urlFlag } from '../util.js';
import { dropPacks } from './geocache.js';

export function releaseGeometry(game) {
  if (KEYART || urlFlag('keepgeo') || urlFlag('bakegeo') || urlFlag('bakeimpostors')) return null;
  const { world, engine } = game, backend = engine.renderer.backend;
  dropPacks();
  const keep = new Set();
  const cpu = (o) => o?.traverse((m) => { if (m.geometry) keep.add(m.geometry.attributes.position).add(m.geometry.index); });
  for (const q of world.placed) cpu(q.object);
  for (const it of world.interactables) cpu(it.target);
  const onGpu = (a) => { const d = backend.get(a); return !!(d.buffer || d.bufferGPU); };
  const seen = new Set();
  let bytes = 0, n = 0;
  const free = (a) => {
    if (!a || seen.has(a)) return;
    seen.add(a);
    if (keep.has(a) || a.usage !== StaticDrawUsage || a.isInstancedBufferAttribute || a.isInterleavedBufferAttribute || !a.array?.length || !onGpu(a)) return;
    bytes += a.array.byteLength; n++;
    const stub = new a.array.constructor(0);
    if (!import.meta.env.DEV) { a.array = stub; return; }
    let warned = false;
    const warn = (what) => { if (!warned) { warned = true; console.warn(`release.js: freed attribute ${what}`, a.name || '', new Error().stack); } };
    Object.defineProperty(a, 'array', { get() { if (!/three|release\.js/.test(new Error().stack.split('\n')[2] || '')) warn('read'); return stub; }, set() { warn('replaced'); } });
    Object.defineProperty(a, 'needsUpdate', { set() { warn('marked for upload (make it DynamicDrawUsage)'); } });
  };
  engine.scene.traverse((o) => {
    const g = o.geometry;
    if (!g?.attributes) return;
    const pos = g.attributes.position;
    if (pos && !keep.has(pos) && !seen.has(pos)) { if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox && !g.isInstancedBufferGeometry) g.computeBoundingBox(); }
    for (const a of Object.values(g.attributes)) free(a);
    free(g.index);
  });
  if (n) console.info(`release: ${(bytes / 1e6).toFixed(1)} MB of vertex data freed (${n} arrays, now only on the GPU)`);
  return { bytes, n };
}
