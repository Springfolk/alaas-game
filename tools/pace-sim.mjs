// The pacer and the quality governor (src/engine/pacing.js) against a modelled device: no browser, no GPU.
//   node tools/pace-sim.mjs [only]     (`only` = part of a scenario's name)
// Model: a display at `hz`; rAF once per refresh while the main thread is free and fewer than 4 frames are queued
// (Chrome); a frame's JS takes `js` ms, then the GPU, one frame at a time, `gpu + px × scale²` ms (× `load(t)`).
// Prints: frames per second, dips (a frame a refresh late or more) in all and in the last third, the resolution's
// range, its changes, the knobs at the end, and input→display p50/p95 (ms from a frame's start to the refresh after
// its GPU work ends). `lag`/`lagP`: a callback that late (½–1×, ms) with that chance; `quant`: timestamp resolution,
// ms; `timed: false`: no GPU timing; `queue`: unfinished frames that hold rAF back (Chrome 4, Safari 2);
// `every`: rAF only on every n-th refresh (Safari in Low Power Mode: 2).
import { pace, govern, frameDone, KNOBS } from '../src/engine/pacing.js';

function run({ hz = 60, fps = 60, js = 5, gpu = 3, px = 8, floor = 0.55, start = 1, secs = 60, jitter = 0.2, load = () => 1, noise = 0.08, lag = 0, lagP = 0, quant = 0, timed = true, queue = 4, every = 1 }) {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const clock = { t: 0, now() { return this.t; } };
  const e = {
    resScale: start, opts: { shadowFar: 100, reflection: 0.25 }, sun: { shadow: { camera: { far: 100 } } }, reflector: { resolutionScale: 0.25 },
    resFloor: () => floor, applyResolution() { changes++; },
  };
  let changes = 0, busyUntil = 0, gpuFree = 0, last = null, lastT = null;
  const v = 1000 / hz, done = [], ends = [], iv = [], lat = [], res = [];
  for (let k = 1; k * v < secs * 1000; k++) {
    const T = k * v;
    clock.t = T;
    while (done.length && done[0][0] <= T) { clock.t = done[0][0]; done.shift()[1](); clock.t = T; }
    while (ends.length && ends[0] <= T) ends.shift();
    if (k % every || T < busyUntil || ends.length >= queue) continue;
    const late = lagP && rnd() < lagP ? lag * (0.5 + rnd() / 2) : 0, S = T + late; // (a callback delivered late: its JS starts late)
    let now = S + (rnd() - 0.5) * 2 * jitter;
    if (quant) now = Math.round(now / quant) * quant;
    if (!pace(e, now, fps)) continue;
    if (last != null) { govern(e, (now - last) / 1000, T); if (T > 3000) iv.push([T - lastT, e.paceIv, T]); }
    last = now; lastT = T;
    const m = load(T / 1000), shadow = e.sun.shadow.camera.far < 100 ? 0.9 : 1, mirror = e.reflector.resolutionScale < 0.25 ? 0.95 : 1, lazy = e.lazyKnob ? 0.88 : 1;
    const J = js * shadow * lazy * m ** 0.5 * (1 + (rnd() - 0.5) * 2 * noise), G = (gpu * shadow * lazy + px * e.resScale ** 2 * mirror) * m * (1 + (rnd() - 0.5) * 2 * noise);
    busyUntil = S + J;
    const end = Math.max(S + J, gpuFree) + G;
    gpuFree = end; ends.push(end + 0.5);
    clock.t = S + J;
    frameDone(e, J, timed && ((cb) => { done.push([end + 0.5, cb]); done.sort((a, b) => a[0] - b[0]); }), clock);
    lat.push(Math.ceil(end / v) * v - T);
    res.push(e.resScale);
  }
  const dips = iv.filter(([d, p]) => d > p + 0.5 * v), tail = dips.filter((d) => d[2] > secs * 667).length;
  lat.sort((a, b) => a - b);
  const q = (f) => lat[Math.floor(lat.length * f)];
  return `${(iv.length / (secs - 3)).toFixed(1).padStart(5)} fps · dips ${String(dips.length).padStart(3)} (last third ${tail}) · res ${Math.min(...res).toFixed(2)}–${Math.max(...res).toFixed(2)} → ${e.resScale.toFixed(2)}, ${changes} changes · ${(e.knobs || []).map((k) => k.name).join(', ') || 'no knobs'} · input→display ${q(0.5).toFixed(0)}/${q(0.95).toFixed(0)} ms`;
}

// a heavy view (×2.2) from 20 s to 35 s
const heavy = (t) => (t > 20 && t < 35 ? 2.2 : 1);
const CASES = {
  'fast desktop, 60 Hz': { js: 5, gpu: 3, px: 5 },
  'fast desktop, 120 Hz': { hz: 120, js: 5, gpu: 3, px: 5 },
  'GPU 2% over at full resolution': { js: 5, gpu: 4, px: 13 },
  'GPU-bound ×1.5': { js: 6, gpu: 5, px: 20 },
  'GPU-bound ×1.5, 120 Hz': { hz: 120, js: 6, gpu: 5, px: 20 },
  'GPU-bound ×3 (floor not enough)': { js: 6, gpu: 8, px: 42 },
  'GPU-bound ×3, 120 Hz': { hz: 120, js: 6, gpu: 8, px: 42 },
  'CPU-bound: JS 14 ± 4 ms': { js: 14, gpu: 3, px: 5, noise: 0.3 },
  'CPU at the budget: JS 15.5 ± 3 ms': { js: 15.5, gpu: 3, px: 5, noise: 0.2 },
  'CPU-bound: JS 17 ms': { js: 17, gpu: 3, px: 5 },
  'CPU-bound: JS 20 ms': { js: 20, gpu: 3, px: 5 },
  'CPU-bound: JS 20 ms, 120 Hz': { hz: 120, js: 20, gpu: 3, px: 5 },
  'heavy view for 15 s': { js: 5, gpu: 3, px: 8, load: heavy },
  'heavy view for 15 s, slow GPU': { js: 6, gpu: 5, px: 14, load: heavy },
  'phone, 30 fps, starts at 67%': { fps: 30, js: 9, gpu: 8, px: 30, floor: 0.67, start: 0.67 },
  'phone, 30 fps, fast': { fps: 30, js: 6, gpu: 5, px: 14, floor: 0.67, start: 0.67 },
  'phone, 30 fps, slow (floor not enough)': { fps: 30, js: 12, gpu: 14, px: 60, floor: 0.67, start: 0.67 },
  'phone, 30 fps, heavy view': { fps: 30, js: 8, gpu: 6, px: 22, floor: 0.67, start: 0.67, load: heavy },
  '144 Hz, timestamps ±1.5 ms': { hz: 144, js: 4, gpu: 2, px: 3, jitter: 1.5 },
  '120 Hz, timestamps ±1.5 ms': { hz: 120, js: 4, gpu: 2, px: 3, jitter: 1.5 },
  '240 Hz, timestamps ±0.5 ms': { hz: 240, js: 4, gpu: 2, px: 3, jitter: 0.5 },
  '90 Hz': { hz: 90, js: 4, gpu: 2, px: 3 },
  '75 Hz, timestamps ±3 ms': { hz: 75, js: 4, gpu: 2, px: 3, jitter: 3 },
  '1 ms clock, callbacks 5–10 ms late': { js: 6, gpu: 3, px: 5, quant: 1, lag: 10, lagP: 0.04 },
  'Safari, GPU near the budget': { js: 6, gpu: 4, px: 13.5, floor: 0.667, quant: 1, lag: 10, lagP: 0.04, timed: false, queue: 2 },
  'Safari, fast GPU': { js: 6, gpu: 3, px: 5, floor: 0.667, quant: 1, lag: 10, lagP: 0.04, timed: false, queue: 2 },
  'Safari, heavy first 15 s': { js: 6, gpu: 4, px: 10, floor: 0.667, secs: 90, load: (t) => (t < 15 ? 3 : 1), quant: 1, lag: 10, lagP: 0.04, timed: false, queue: 2 },
  'Safari, Low Power Mode (rAF at 30 Hz)': { js: 6, gpu: 3, px: 5, floor: 0.667, quant: 1, lag: 10, lagP: 0.04, timed: false, queue: 2, every: 2, secs: 300 },
  'Safari, GPU-bound ×3': { js: 6, gpu: 8, px: 42, floor: 0.667, quant: 1, lag: 10, lagP: 0.04, timed: false, queue: 2 },
};
const only = process.argv[2];
void KNOBS;
for (const [name, c] of Object.entries(CASES)) if (!only || name.includes(only)) console.log(`${name.padEnd(40)} ${run(c)}`);
