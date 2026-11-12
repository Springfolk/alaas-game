// Frame pacing and dynamic quality, as plain functions over the engine's state (no three: tools/pace-sim.mjs runs
// them against a modelled device). Order of a frame: pace → [govern, …draw] → frameDone.
//   e.resScale   the dynamic resolution scale (≤ 1) · e.knobs = the KNOBS stepped down · e.paceIv = ms per paced frame
//   e.gpuPending frames handed to the GPU and not finished · e.gpuTimes = ms each took from the end of its JS
// What is measured, per ~0.5 s window: frame intervals (dips), how long the GPU takes to finish a frame, how many
// frames it is behind, the frame's JS time. Headless Chrome, GPU 2% over its budget: 59 fps, no visible dips, but
// 3–4 frames queued (60 ms more from input to picture); the old rule (average interval ≥ 12% over) saw nothing.

// The refresh interval of the display, ms, from the last 31 rAF deltas: their sum over the refreshes they span (each
// delta counted in units of the median, so skipped refreshes and timestamp jitter cancel out), at most 1/58 s (a
// device too slow to draw every refresh must not read as a slow display); an estimate within 2% of the last is not taken.
function refresh(e, d) {
  const r = e.rafDeltas ||= [];
  if (d > 1 && d < 60) r.push(d);
  if (r.length >= 31) {
    const med = r.slice().sort((a, b) => a - b)[15];
    let sum = 0, n = 0;
    for (const x of r) { const k = Math.round(x / med); if (k >= 1 && k <= 3) { sum += x; n += k; } }
    const v = n ? sum / n : med;
    if (!e.vsync || Math.abs(v - e.vsync) > e.vsync * 0.02) { e.vsync = v; e.gov = null; }
    // the shortest interval seen twice running is the display's own (callbacks only come slower than it)
    if (Math.abs(v - e.vsyncSeen) < v * 0.02 && !(v > e.vsyncBase * 0.98)) e.vsyncBase = v;
    e.vsyncSeen = v;
    r.length = 0;
  }
  // a slow device's callbacks come every 2nd or 3rd refresh: that many refreshes of the display as it was last seen
  // (else of a 60 Hz one), not a 30 Hz display
  const v = e.vsync || 1000 / 60, base = e.vsyncBase || 1000 / 60;
  return Math.min(v > base * 1.3 ? v / Math.round(v / base) : v, 1000 / 58);
}

// True when a frame is due on this animation frame (`now` = its timestamp, ms) for `fps` (0 = none). Draws every
// n-th display refresh, n = refreshes per capped frame (120 Hz → every 2nd for 60) + e.paceSkip (the cadence knobs),
// so frame intervals stay even; a refresh rate the cap doesn't divide (75, 90, 144 Hz) runs every refresh (or every
// 2nd at 144), never below the cap. Refreshes are counted on the display's own clock from the last drawn frame, so
// late or early callbacks do not shift the beat. Holds a frame back while the GPU still has three (Chrome queues
// 3–4 before it slows rAF: that much later the picture answers the input).
export function pace(e, now, fps) {
  const d = now - (e.lastTick ?? now);
  e.lastTick = now;
  const v = refresh(e, d);
  if (!fps) { e.beat = null; return false; }
  const n = Math.max(1, Math.floor(1000 / fps / v + 0.2)) + (e.paceSkip || 0); // +0.2: tolerates a noisy refresh estimate
  if (n !== e.paceN || fps !== e.paceFps) { e.paceN = n; e.paceFps = fps; e.gov = null; e.resCeil = 0; }
  e.paceIv = n * v;
  if (e.beat != null && now - e.beat < (n - 0.5) * v) return false;
  // (not while the JS is the limit: the GPU's reports then come late; nor right after a change of resolution;
  // 2 while the GPU is the limit, govern: frames then come at its pace anyway)
  const hold = e.jsMs > e.paceIv * 0.8 || e.gov?.settle ? 9 : e.gpuHold || 3;
  if (e.gpuPending >= hold && now - (e.beat ?? now) < 250) { e.gpuHeld = (e.gpuHeld || 0) + 1; return false; }
  if (e.gpuPending >= hold) { e.gpuPending = 0; e.gpuSilent = (e.gpuSilent || 0) + 1; } // frames whose end was never reported: carry on (twice: without the timing)
  // the beat moves on by whole refreshes, on the display's grid (pulled halfway to each timestamp: their jitter is
  // halved, an inexact refresh estimate cannot build up); after a long gap it starts again from now
  const late = e.beat == null ? 0 : Math.round((now - e.beat) / v);
  e.beat = e.beat == null || late > 4 * n ? now : e.beat + late * v;
  e.beat += (now - e.beat) * 0.5;
  e.gpuAtStart = e.gpuPending;
  return true;
}

// After a frame's draw calls: `jsMs` = what its JS took; `whenDone(cb)` calls back once the GPU has finished the
// frame (WebGPU: the queue's promise; WebGL2: a fence), or is null where that can't be known.
export function frameDone(e, jsMs, whenDone, clock = performance) {
  e.jsMs = jsMs;
  if (!whenDone || e.gpuSilent >= 2) return;
  const t0 = clock.now();
  e.gpuPending = (e.gpuPending || 0) + 1;
  whenDone(() => { e.gpuPending = Math.max(0, e.gpuPending - 1); (e.gpuTimes ||= []).push(clock.now() - t0); });
}

const q = (v, f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];

// Once per frame, before it draws (`dt` s since the last one). Every ~0.5 s of frames:
//   over  two frames came a refresh late (or the average interval is 10% over), or the GPU is two frames behind in a tenth
//         of the frames, or takes > 1.6 intervals. The second window running (a hitch looks the same for one, and
//         a change is not free; far over: at once): fewer pixels, by how far over (5–20% a step), down to the
//         tier's floor. At the floor, or when the frame's JS alone is the limit (over 0.8 of the interval:
//         resolution can't help), one of KNOBS; a slower beat after twice as many windows.
//   room  no late frame, the GPU finishes a quarter of the frames within 0.8 of the interval and the JS takes
//         under 0.6 of it, twice in a row: 4–8% more resolution, by the room measured (not up to a scale the GPU
//         fell behind at in the last 15 s, doubled ≤ 2 min each time the climb back fails). At full resolution a
//         knob comes back, last first, after `knobWait` (4 s; doubled, ≤ 2 min, when a restored one fails within
//         20 s); a slower beat comes back first, and only when the faster one is measured to fit.
//   else  nothing changes: a frame rate held with little to spare is left alone, not probed.
// Without GPU timing (no fence, or Safari's WebGL2 where it costs 5 ms a frame): over by late frames alone, room =
// none late and the average under 2% over; so resolution is probed there, each failed step waiting longer.
export function govern(e, dt, now = performance.now()) {
  const iv = e.paceIv || 1000 / 60, ms = dt * 1000;
  if (dt <= 0) return;
  const g = e.gov ||= { n: 0, t: 0, late: 0, deep: 0, js: 0, room: 0, over: 0 };
  g.n++; g.t += Math.min(ms, iv * 3); g.js += e.jsMs || 0;
  if (ms > iv + 0.5 * iv / (e.paceN || 1)) g.late++; // a refresh or more over (at 30 on a 60 Hz display that is 50 ms, 1.5×: no margin for a ratio)
  if (e.gpuAtStart >= 2) g.deep++;
  g.deep += e.gpuHeld || 0; e.gpuHeld = 0;
  if (g.t < 500 || g.n < 8) return;
  const avg = g.t / g.n, js = g.js / g.n, deep = g.deep / g.n, late = g.late, times = (e.gpuTimes || []).sort((a, b) => a - b);
  const timed = times.length >= g.n / 2, gpu = timed ? q(times, 0.5) : 0, quick = timed ? q(times, 0.25) : 0;
  if (e.gpuTimes) e.gpuTimes.length = 0;
  g.n = g.t = g.late = g.deep = g.js = 0;
  if (g.settle) { g.settle = false; return; } // the window after a change still holds frames queued before it
  const over = late >= 2 || avg > iv * 1.1 || (timed && (deep > 0.1 || gpu > iv * 1.6));
  // the JS is the limit: fewer pixels can't help, and the GPU's reports reach a busy main thread late (they then
  // read as a queue)
  const cpu = over && js > iv * 0.8;
  const room = !over && late === 0 && (timed ? quick < iv * 0.8 && js < iv * 0.6 : avg < iv * 1.02);
  g.over = over ? g.over + 1 : 0; g.room = room ? g.room + 1 : 0;
  e.gpuMs = gpu; // (the F3 meter)
  if (timed && !over) { // the GPU's time at the last two scales (KNOBS: how much of it the pixels are)
    const at = e.gpuAt ||= [], last = at[at.length - 1];
    if (last && Math.abs(last.s - e.resScale) < 0.03) last.g += (gpu - last.g) * 0.5;
    else { at.push({ s: e.resScale, g: gpu }); if (at.length > 2) at.shift(); }
  }
  e.gpuHold = over && !cpu && timed ? 2 : 3;
  if (e.resCeil && now - e.resCeilAt > e.ceilWait) e.resCeil = 0;
  const prev = e.resScale, floor = e.resFloor();
  const sure = !timed || deep > 0.1 || gpu > iv * 1.6; // the GPU is seen to be behind (late frames alone can be a hitch)
  // acted on in the second window running (a hitch looks the same for one, and a change is not free), far over at once
  const need = avg > iv * 1.4 || deep > 0.5 ? 1 : 2;
  if (over) {
    if (!cpu && e.resScale > floor + 1e-3) {
      if (g.over >= need) {
        if (sure) { // this scale is not tried again for 15 s; twice as long (≤ 2 min) each time the climb back fails
          e.ceilWait = now - e.resUpAt < 10000 ? Math.min(120000, (e.ceilWait || 15000) * 2) : now - e.resCeilAt > 120000 ? 15000 : e.ceilWait || 15000;
          e.resCeil = e.resScale; e.resCeilAt = now;
        }
        const ratio = Math.max(avg / iv, deep > 0.1 ? 1.11 : 1, timed ? gpu / (iv * 1.6) : 1); // (a queue says the GPU is over, not by how much)
        e.resScale = Math.max(floor, e.resScale * Math.min(0.95, Math.max(0.8, Math.sqrt(0.9 / ratio))));
        g.over = 0;
      }
    } else if (g.over >= need && knob(e, -1, now, cpu, g.over < need * 2)) g.over = 0; // (a slower beat: after twice as many windows)
  } else if (room && g.room >= 2) {
    g.room = 0;
    const on = e.knobs, top = on?.[on.length - 1];
    // a slower cadence comes back before resolution does: 60 at fewer pixels over 30 at more
    if (top?.fits && now - e.knobAt > e.knobWait && top.fits(e, { gpu, js, iv, floor })) { knob(e, 1, now); e.resScale = Math.min(e.resScale, Math.max(floor, top.scale ?? floor)); }
    else if (e.resScale < 1) {
      // as many more pixels as the GPU's time leaves room for, 4–8% a step, short of a scale that failed
      const to = Math.min(1, e.resCeil ? e.resCeil - 0.04 : 1, e.resScale * Math.min(1.08, Math.max(1.04, Math.sqrt(iv * 0.75 / Math.max(quick, 1)))));
      if (to > e.resScale + 0.03 || (to >= 1 && !e.resCeil)) { e.resScale = to; e.resUpAt = now; }
    }
    else if (top && !top.fits && now - e.knobAt > e.knobWait) knob(e, 1, now);
  }
  if (e.resScale !== prev) { e.applyResolution(); g.settle = true; }
}

// One knob down (dir −1; `cpu`: only those that save JS; `gentle`: not a slower beat) or the last one back up (+1).
// True when one was stepped.
export function knob(e, dir, now, cpu = false, gentle = false) {
  const on = e.knobs ||= [];
  e.knobWait ||= 4000;
  if (dir < 0) {
    const k = KNOBS.find((k) => !on.includes(k) && (!cpu || k.cpu) && k.ok(e));
    if (!k || (gentle && k.fits)) return false;
    if (now - e.knobAt < 20000 && e.knobUp === k) e.knobWait = Math.min(120000, e.knobWait * 2);
    on.push(k); k.set(e, true);
  } else {
    const k = e.knobUp = on.pop();
    k.set(e, false);
  }
  e.knobAt = now;
  return true;
}

// Dynamic quality steps after resolution, cheapest loss first; none needs a new shader or pipeline. A slower
// cadence = one more display refresh per frame (60 Hz: 60 → 30; 120 Hz: 60 → 40 → 30), never under 30 fps (from a
// 30 cap, phones: one step to a steady 20 instead of 33/50 ms frames in turn); it comes
// back when the frame is measured to fit the faster beat at the resolution floor: the GPU's time scaled to it
// under 0.55 of that interval, the JS under 0.7 of it. Resolution then restarts from the scale that fits.
const slower = (name) => ({
  name, cpu: true,
  ok: (e) => (e.paceN + 1) * Math.min(e.vsync || 1000 / 60, 1000 / 58) < (e.paceFps > 30 ? 34.5 : 51),
  set: (e, d) => { e.paceSkip = (e.paceSkip || 0) + (d ? 1 : -1); },
  fits(e, { gpu, js, iv, floor }) {
    // The GPU's time at another scale: part of it does not depend on the pixel count (geometry, shadows). That
    // part is taken from the last two scales measured (govern keeps them), else as half; all of it by pixels
    // promised 60 where it then failed, back and forth.
    const [p, q] = e.gpuAt || [], k = p && q && (q.g - p.g) / (q.s * q.s - p.s * p.s);
    const fix = k > 0 ? Math.min(0.85, Math.max(0.15, 1 - k * e.resScale ** 2 / Math.max(gpu, 1e-3))) : 0.5;
    const to = iv * (e.paceN - 1) / e.paceN;
    if (!(js < to * 0.7 && gpu * (fix + (1 - fix) * (floor / e.resScale) ** 2) < to * 0.55)) return false;
    this.scale = e.resScale * Math.sqrt(Math.min(1, Math.max(0, (to * 0.55 / Math.max(gpu, 1e-3) - fix) / (1 - fix)))); // as many pixels as still fit
    return true;
  },
});
export const KNOBS = [
  { name: 'shadow range ×0.7', cpu: true, ok: () => true, set: (e, d) => { e.sun.shadow.camera.far = e.opts.shadowFar * (d ? 0.7 : 1); } }, // fewer casters per cascade
  { name: 'lake mirror ×0.6', ok: (e) => !!e.reflector, set: (e, d) => { e.reflector.resolutionScale = e.opts.reflection * (d ? 0.6 : 1); } },
  slower('slower beat'), slower('slower beat 2'),
  { name: 'lazy shadows', cpu: true, ok: (e) => !e.opts.lazyShadows, set: (e, d) => { e.lazyKnob = d; if (!d) e.sun.shadow.autoUpdate = true; } }, // the maps on a move or turn (Engine.lazyShadows)
];
