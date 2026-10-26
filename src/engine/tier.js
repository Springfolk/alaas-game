// Device tiers: presets per tier and the auto-detection that picks one (Settings → Quality "Auto").
// `TIER` is filled by Engine.init before the world loads; ground, forest and texture loading read it.
//   quality      the preset name the post chain / life layers key on (mobile → 'low')
//   ao           GTAO pre-pass (a second scene pass)
//   shadows      sun shadow map size per cascade (2 cascades side by side), shadowFar = cascade range (m)
//   reflection   lake reflection resolution scale · texMax = largest texture edge
//   dpr          max pixel ratio (capped by the display's) · resStart = the scale of it to start at (1) · resMin = pixel ratio dynamic resolution never
//                goes under (none: 55% of the start ratio); high keeps at least CSS-pixel resolution
//   grassDensity 1 = full blades (grass.js), forest = scale of the full/coarse tree ring radii (forest.js)
//   ground       ground grid vertices per side · fps = frame cap (battery saver halves it)
//   atlasMax     largest impostor atlas edge · pipelines = GPU pipeline compiles in flight while loading
//   release      drop each texture image's CPU/IOSurface copy once it is on the GPU (materials.js)
const NATIVE = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
export const PRESETS = {
  high: { quality: 'high', ao: true, shadows: 2048, shadowFar: 150, reflection: 0.35, dpr: 2, resMin: 1, texMax: 4096, grassDensity: 1, forest: 1, ground: 640, fps: 60 },
  medium: { quality: 'medium', ao: false, shadows: 2048, shadowFar: 110, reflection: 0.25, dpr: 1.5, resMin: 0.7, texMax: 2048, grassDensity: 1, forest: 1, ground: 640, fps: 60 },
  low: { quality: 'low', ao: false, shadows: 1024, shadowFar: 70, reflection: 0.18, dpr: 0.75, resMin: 0.5, texMax: 1024, grassDensity: 0.6, forest: 0.8, ground: 512, fps: 60 },
  // phones (lite too): 67–100% of the screen's own resolution — starts at 67% and climbs while frames keep pace
  // (dynamic resolution); below 67% read as mush (dpr = resMin: no dynamic resolution, only the knobs)
  mobile: { quality: 'low', ao: false, shadows: 1024, shadowFar: 55, reflection: 0.15, dpr: NATIVE, resMin: NATIVE * 0.67, resStart: 0.67, texMax: 512, atlasMax: 1024, pipelines: 4, release: true, grassDensity: 0.45, forest: 0.7, ground: 420, fps: 60 },
};
// A weak phone (≤3 GB, <4 cores, no WebGPU, under-default GPU limits) or one whose last load was killed:
// mobile with these on top (TIER.lite). Memory can't be handed back at run time, so it is decided here.
export const LITE = { lite: true, shadows: 512, shadowFar: 45, reflection: 0.1, texMax: 256, atlasMax: 512, pipelines: 2, grassDensity: 0.3, forest: 0.55 }; // ground as mobile: its baked terrain pack

export const TIER = { name: 'medium', auto: false, reason: '', ...PRESETS.medium };

export function setTier(name, extra = {}) {
  Object.assign(TIER, PRESETS[name] || PRESETS.medium, { name: PRESETS[name] ? name : 'medium' }, extra);
  return TIER;
}

// Phones/tablets → mobile; on desktop no WebGPU (WebGL2 fallback), few cores, little memory or an older
// integrated GPU → low; everything else → medium. `high` (GTAO) is never picked automatically.
// Phones and tablets: the UA, iPadOS (which reports a Mac), or a coarse pointer on a small screen.
export function isPhone() {
  const n = typeof navigator !== 'undefined' ? navigator : {}, ua = n.userAgent || '';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820;
  return /Android|iPhone|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && n.maxTouchPoints > 1) || (coarse && small);
}

export async function detectTier({ webgl = false } = {}) {
  const n = typeof navigator !== 'undefined' ? navigator : {};
  const cores = n.hardwareConcurrency || 4, mem = n.deviceMemory || 8; // Safari reports no deviceMemory
  // phones draw with WebGL2 (Engine.init; most have no WebGPU, and Safari's is opt-in): only memory and cores
  // make one weak (LITE), not missing WebGPU
  if (isPhone()) {
    const weak = mem <= 3 ? `${mem} GB` : cores < 4 ? `${cores} cores` : '';
    return weak ? { name: 'mobile', reason: `touch device, ${weak}`, extra: LITE } : { name: 'mobile', reason: 'touch device' };
  }
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

// Boot guard: a load the OS kills (iOS jetsam on memory: Safari reloads the page, then gives up with "A problem
// repeatedly occurred") leaves no JS error to react to, so each load marks itself in localStorage until ready
// (bootDone) or a normal leave (pagehide); while hidden (locked, another app or tab) it is unmarked — the OS freezing
// a background page is not the load failing. Finding an unfinished mark under 10 min old, the next load steps down:
// 1 = auto picks mobile + LITE / low, 2 = also WebGL2. A load that finished at a step tries one step up next time,
// at most once a day (a failed try blocks the next for a day), so two interrupted loads never demote a device for
// good. A chosen quality resets it.
const GUARD = 'alaas-boot3'; // 3: drops the steps the old keep-forever rule left
const DAY = 86400000;
let guard = { step: 0 }, loading = true;
const keep = (g) => { guard = g; try { localStorage.setItem(GUARD, JSON.stringify(g)); } catch { /* storage blocked */ } };
export function bootStep(auto) {
  let g = {};
  try { g = JSON.parse(localStorage.getItem(GUARD)) || {}; } catch { /* none */ }
  const now = Date.now();
  let step = auto ? g.step || 0 : 0;
  if (auto && g.pending && now - g.pending < 600000) { step = Math.min(2, step + 1); g.tryAt = now; }
  else if (auto && step > 0 && g.ok && !(now - (g.tryAt || 0) < DAY)) { step--; g.tryAt = now; }
  keep({ ...g, step, ok: false, pending: now });
  addEventListener('pagehide', () => { if (guard.pending && !failed) keep({ ...guard, pending: 0 }); });
  document.addEventListener('visibilitychange', () => { if (loading && !failed) keep({ ...guard, pending: document.hidden ? 0 : Date.now() }); });
  return step;
}
let failed = false;
export const bootDone = () => { loading = false; keep({ ...guard, pending: 0, ok: true }); };
// the GPU device was lost while loading (a GPU process crash or reset): reload one step down
export const bootFailed = () => { if (!guard.pending || failed) return; failed = true; location.reload(); };
// lost in play (iOS drops the GPU device under memory pressure or a GPU timeout, or hands it back broken after
// the page was hidden: the canvas freezes on its last frame while the page still answers): reload where the player
// stood (main.js resumes there, title screen). No tier step: these losses are not about the load being too big.
const RESUME = 'alaas-resume';
export function playLost(at) {
  if (failed) return;
  failed = true;
  try { sessionStorage.setItem(RESUME, JSON.stringify({ at, t: Date.now() })); } catch { /* storage blocked */ }
  keep({ ...guard, pending: 0 });
  location.reload();
}
// the spot to resume at after playLost's reload (once, within a minute), else null
export function resumeSpot() {
  try { const r = JSON.parse(sessionStorage.getItem(RESUME)); sessionStorage.removeItem(RESUME); return r && Date.now() - r.t < 60000 ? r.at : null; } catch { return null; }
}
