// Device tiers: presets per tier and the auto-detection that picks one (Settings → Quality "Auto").
// `TIER` is filled by Engine.init before the world loads; ground, forest and texture loading read it.
//   quality      the preset name the post chain / life layers key on (mobile → 'low')
//   ao           GTAO pre-pass (a second scene pass)
//   shadows      sun shadow map size per cascade (2 cascades side by side), shadowFar = cascade range (m)
//   reflection   lake reflection resolution scale · dpr = max pixel ratio · texMax = largest texture edge
//   grassDensity 1 = full blades (grass.js), forest = scale of the full/coarse tree ring radii (forest.js)
//   ground       ground grid vertices per side · fps = frame cap (battery saver halves it)
export const PRESETS = {
  high: { quality: 'high', ao: true, shadows: 2048, shadowFar: 150, reflection: 0.35, dpr: 1, texMax: 4096, grassDensity: 1, forest: 1, ground: 640, fps: 60 },
  medium: { quality: 'medium', ao: false, shadows: 2048, shadowFar: 110, reflection: 0.25, dpr: 1, texMax: 2048, grassDensity: 1, forest: 1, ground: 640, fps: 60 },
  low: { quality: 'low', ao: false, shadows: 1024, shadowFar: 70, reflection: 0.18, dpr: 0.75, texMax: 1024, grassDensity: 0.6, forest: 0.8, ground: 512, fps: 60 },
  mobile: { quality: 'low', ao: false, shadows: 1024, shadowFar: 55, reflection: 0.15, dpr: 1.25, texMax: 1024, grassDensity: 0.45, forest: 0.7, ground: 420, fps: 60 },
};

export const TIER = { name: 'medium', auto: false, reason: '', ...PRESETS.medium };

export function setTier(name, extra = {}) {
  Object.assign(TIER, PRESETS[name] || PRESETS.medium, { name: PRESETS[name] ? name : 'medium' }, extra);
  return TIER;
}

// Phones/tablets → mobile; no WebGPU (WebGL2 fallback), few cores, little memory or an older
// integrated GPU → low; everything else → medium. `high` (GTAO) is never picked automatically.
export async function detectTier({ webgl = false } = {}) {
  const n = typeof navigator !== 'undefined' ? navigator : {};
  const ua = n.userAgent || '';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820;
  const ipad = /Macintosh/.test(ua) && n.maxTouchPoints > 1; // iPadOS reports a Mac
  if (/Android|iPhone|iPod|Mobile/i.test(ua) || ipad || (coarse && small)) return { name: 'mobile', reason: 'touch device' };
  const cores = n.hardwareConcurrency || 4, mem = n.deviceMemory || 8;
  let adapter = null;
  if (!webgl && n.gpu) try { adapter = await n.gpu.requestAdapter({ powerPreference: 'high-performance' }); } catch { /* none */ }
  if (!adapter) return { name: 'low', reason: 'no WebGPU' };
  const info = adapter.info || {};
  const vendor = (info.vendor || '').toLowerCase(), arch = (info.architecture || '').toLowerCase();
  if (cores < 6 || mem < 4) return { name: 'low', reason: `${cores} cores, ${mem} GB` };
  // Intel before Xe (gen-9…gen-11) struggles; Apple, Xe/Arc, NVIDIA, AMD manage medium
  if (vendor === 'intel' && /gen-(?:[0-9]|1[01])$/.test(arch)) return { name: 'low', reason: `intel ${arch}` };
  if (adapter.limits && adapter.limits.maxTextureDimension2D < 8192) return { name: 'low', reason: 'small GPU limits' };
  return { name: 'medium', reason: `${vendor || 'gpu'} ${arch}`.trim() };
}
