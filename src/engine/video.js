// Advanced video options (Settings → Graphics): the knobs the presets set (tier.js), as the player sees them. Changing
// one makes the quality "custom": the preset the game runs (`base`) with the options on top (Engine `custom`).
// `live`: applied in play, no shader or pipeline built (`applyLive`); the rest are built with the world or the post
// chain and apply after a reload (the settings' reload note), the way a quality change does.
import { PRESETS } from './tier.js';

const DPR = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1;
const pct = (v) => Math.round(v * 100) + '%';
// key → values (in order) · fmt / words: labels of the values (booleans: a switch) · desktop: not on phones · ok(base): offered on that preset
export const VIDEO = [
  { key: 'res', values: [0.5, 0.67, 0.75, 1], fmt: pct, live: true },
  { key: 'dynres', values: [true, false], live: true },
  { key: 'fps', values: [30, 60], fmt: String, live: true, desktop: true },
  { key: 'shadow', values: [512, 1024, 2048], words: ['qLow', 'qMedium', 'qHigh'] },
  { key: 'shadowFar', values: [45, 55, 70, 110, 150], metres: true, live: true },
  { key: 'ao', values: [false, true], ok: (base) => !PRESETS[base]?.leanEnv }, // the lean sky light's maps + AO: over 16 textures in the ground's shader
  { key: 'aa', values: ['taa', 'fxaa', 'none'], words: ['vAaTaa', 'vAaFxaa', 'vOff'] },
  { key: 'grass', values: [0.3, 0.45, 0.6, 1], fmt: pct },
  { key: 'distance', values: [0.55, 0.7, 0.8, 1], words: ['vNear', 'qMedium', 'vFar', 'vFull'] },
  { key: 'glow', values: [true, false] },
  { key: 'mirror', values: [0, 0.25, 0.35], words: ['vOff', 'qLow', 'qHigh'], live: (a, b) => a > 0 && b > 0 }, // on ↔ off: another water shader
];
const snap = (v, values) => values.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

// The options a tier's opts amount to (the engine's, or a preset's: what "custom" starts from)
export function fromOpts(o, tier) {
  return {
    res: snap(Math.min(DPR, o.dpr) / DPR, VIDEO[0].values),
    dynres: !(o.resMin >= Math.min(DPR, o.dpr)),
    fps: o.fps ?? 60,
    shadow: snap(o.shadows, VIDEO[3].values),
    shadowFar: snap(o.shadowFar, VIDEO[4].values),
    ao: !!o.ao,
    aa: o.aa ?? (tier === 'mobile' ? 'fxaa' : 'taa'),
    grass: snap(o.grassDensity ?? 1, VIDEO[7].values),
    distance: snap(o.forest ?? 1, VIDEO[8].values),
    glow: o.bloom ?? o.quality !== 'low',
    mirror: snap(o.reflection ?? 0, VIDEO[10].values),
  };
}

// The Engine overrides of custom options `v` on preset `base` (also into TIER: grass and forest are read there)
export function toOpts(v, base) {
  const p = PRESETS[base] || PRESETS.medium, dpr = v.res * DPR;
  const o = {
    dpr, resMin: v.dynres ? Math.min(p.resMin ?? 0, dpr) : dpr, resStart: v.dynres ? p.resStart ?? 1 : 1,
    shadows: v.shadow, shadowFar: v.shadowFar, ao: v.ao && !p.leanEnv, aa: v.aa, grassDensity: v.grass, forest: v.distance, bloom: v.glow, reflection: v.mirror,
  };
  if (base !== 'mobile') o.fps = v.fps; // phones keep their 30 fps cap
  return o;
}

// Whether going from options `a` (what this load was built with) to `b` needs a reload
export function needsReload(a, b) {
  return VIDEO.some(({ key, live }) => a[key] !== b[key] && !(typeof live === 'function' ? live(a[key], b[key]) : live));
}

// Applies the live options of `v` to a running engine (the rest wait for the reload)
export function applyLive(e, v, base) {
  const o = toOpts(v, base);
  e.opts.dpr = o.dpr; e.opts.resMin = o.resMin;
  if (!v.dynres) e.resScale = 1;
  e.resScale = Math.max(e.resScale, e.resFloor());
  e.applyResolution();
  if (o.fps) e.opts.fps = o.fps;
  const knob = (s) => e.knobs?.some((k) => k.name.startsWith(s));
  e.opts.shadowFar = o.shadowFar;
  e.sun.shadow.camera.far = o.shadowFar * (knob('shadow') ? 0.7 : 1);
  if (e.reflector && o.reflection > 0) { e.opts.reflection = o.reflection; e.reflector.resolutionScale = o.reflection * (knob('lake') ? 0.6 : 1); }
}
