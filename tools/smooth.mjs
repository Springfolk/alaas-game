// Smoothness: frame intervals as the display gets them (rAF timestamps of drawn frames), dips and what the
// frame was doing, per area and movement, at the game's own pacing; how old the look input is when its frame
// is handed to the GPU; and what a frame costs in every direction.
//   node tools/smooth.mjs [chrome|webkit|phone|lite] [query]      (dev server or a build on PORT)
// `lite` = phone with 2 GB reported (mobile + LITE). Env: THROTTLE=4 (Chrome: CPU ×4) · AREAS=yard,shore ·
// MOVES=stand,walk,run,turn · SECS=3 per move · SIZE=1728x1117@2 (desktop viewport and pixel ratio) · JSON=out.json ·
// LAT=1: look latency instead, from real mouse moves / a touch drag: age of the oldest and of the newest look event
// in a frame when its JS ends, and how far the view trails the aim (look smoothing), in ms of turning ·
// COST=1: uncapped ms per frame (CPU + GPU throughput) at every area in 12 directions, the hot spots (RES=1: full
// resolution; WHY=n: at the n worst, the ms saved with each material or top-level object hidden).
// A dip = a drawn frame that came a display refresh late or more (interval > paced + half a refresh). `gpu` = ms from the end of a frame's JS until the GPU
// finished it: latency, not load (≈7 ms at any load in Chrome; near the paced interval = frames queueing).
// Chrome only: `gc` (frames in which the JS heap shrank), kB of garbage per frame, long tasks.
import { launch, pageOptions, PORT as port } from './browser.mjs';

// [x, z, yaw] — yaw 0 looks north (−Z), π/2 west
export const AREAS = {
  start: [62, -211, 1.69], yard: [9, -214, 1.2], urasa: [0.4, -205.6, -1.4], balagan: [-17, -200.5, 1.5], khoton: [-19, -205.5, 0],
  ampaar: [3, -187, Math.PI], pen: [22, -222, 0.8], mares: [43, -206, -0.6], smithy: [24.5, -193.5, -1], woodpile: [-3.75, -214.6, 1.57],
  craft: [12, -199, -0.8], meadow: [-4.6, -146.6, 0.9], shore: [6, -66, Math.PI], shallows: [24.5, -47.5, 0.9], edge: [-60, -330, 0.3],
  forest: [0, -400, 0.5], birch: [-240, -128, 1.57], winter: [262, -98, -1.57],
};

// In the page: records every animation frame and every drawn frame from `start()` to `stop()`.
// Row: [rAF time, interval since the last drawn frame, JS ms, paced interval, heap bytes, flags, age of the oldest look event, GPU ms,
// age of the newest look event, aim yaw, view yaw, display refreshes per paced frame]
export function probe() {
  const g = window.game, e = g.engine;
  if (window.smooth) return;
  const S = window.smooth = { rows: null, raf: [], drive: null, long: [], marks: {} };
  const tick = g.tick.bind(g), frame = g.frame.bind(g);
  let lastRaf = 0, lastFrame = 0, flags = 0, first = 0, newest = 0, res = e.resScale;
  // what a frame did besides drawing: 1 sun shadows re-rendered late (phones) · 2 cloud map · 4 resolution change · 8 quality step
  const cm = e.cloudMap, cmRender = cm.render.bind(cm);
  cm.render = (...a) => { const at = cm.at; cmRender(...a); if (cm.at !== at) flags |= 2; };
  const knob = e.knob.bind(e);
  e.knob = (...a) => { flags |= 8; knob(...a); };
  for (const type of ['mousemove', 'touchmove']) addEventListener(type, (ev) => { first ||= ev.timeStamp; newest = ev.timeStamp; }, { capture: true, passive: true });
  try { new PerformanceObserver((l) => { if (S.rows) for (const x of l.getEntries()) S.long.push([Math.round(x.startTime), Math.round(x.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch { /* WebKit: none */ }
  // ms from the end of a frame's JS until the GPU has finished its work (WebGPU: the queue's promise; WebGL2: a fence)
  const dev = e.renderer.backend.device, gl = e.renderer.backend.gl;
  const gpuDone = (set, t0) => {
    if (dev) dev.queue.onSubmittedWorkDone().then(() => set(performance.now() - t0), () => {});
    else if (gl) {
      const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => { if (gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED) { set(performance.now() - t0); gl.deleteSync(s); } else setTimeout(poll, 1); };
      setTimeout(poll, 1);
    }
  };
  g.tick = (now) => {
    if (S.rows) { S.raf.push(now - lastRaf); S.drive?.(now, (now - lastRaf) / 1000); }
    lastRaf = now;
    tick(now);
  };
  g.frame = (now) => {
    const lazy = e.sun.shadow.needsUpdate && e.sun.shadow.autoUpdate === false;
    const a = performance.now();
    frame(now);
    const b = performance.now();
    if (e.resScale !== res) { res = e.resScale; flags |= 4; }
    if (S.rows && lastFrame) {
      const row = [now, now - lastFrame, b - a, e.paceIv || 1000 / 60, performance.memory?.usedJSHeapSize || 0, flags | (lazy ? 1 : 0), first ? b - first : -1, -1, first ? b - newest : -1, g.player.aimYaw, g.player.yaw, e.paceN || 1];
      S.rows.push(row);
      gpuDone((ms) => { row[7] = ms; }, b);
    }
    lastFrame = now; flags = 0; first = 0;
  };
  S.start = (drive = null) => { S.rows = []; S.raf = []; S.long = []; S.drive = drive; lastFrame = 0; };
  S.stop = () => { const r = { rows: S.rows, raf: S.raf, long: S.long, res: e.resScale, knobs: (e.knobs || []).map((k) => k.name), cap: e.fpsCap }; S.rows = null; S.drive = null; return r; };
}

const q = (v, f) => (v.length ? v[Math.min(v.length - 1, Math.floor(v.length * f))] : 0);
// One recording → its numbers. dips: [interval ms, JS ms, cause]
export function stats({ rows, raf, long }) {
  const iv = rows.map((r) => r[1]).sort((a, b) => a - b), cpu = rows.map((r) => r[2]).sort((a, b) => a - b);
  const dips = [];
  let alloc = 0, gc = 0;
  rows.forEach((r, i) => {
    const dh = i ? r[4] - rows[i - 1][4] : 0, shrank = dh < -262144;
    if (dh > 0) alloc += dh;
    if (shrank) gc++;
    if (r[1] > r[3] * (1 + 0.5 / (r[11] || 1))) { // half a refresh over: the frame came a refresh late or more
      const why = [];
      if (shrank) why.push('gc');
      if (r[5] & 1) why.push('shadows'); if (r[5] & 2) why.push('cloudmap'); if (r[5] & 4) why.push('res'); if (r[5] & 8) why.push('knob');
      const prev = i ? rows[i - 1] : r;
      if (prev[2] > r[3]) why.push(`js ${prev[2].toFixed(0)} ms`); // the frame before ran long: this one came late
      else if (prev[7] > r[3]) why.push(`gpu ${prev[7].toFixed(0)} ms`);
      if (long.some(([t, d]) => t < r[0] && t + d > r[0] - r[1])) why.push('long task');
      dips.push([+r[1].toFixed(1), +prev[2].toFixed(1), why.join('+') || 'unknown']);
    }
  });
  const gpu = rows.map((r) => r[7]).filter((x) => x >= 0).sort((a, b) => a - b);
  const lat = rows.map((r) => r[6]).filter((x) => x >= 0).sort((a, b) => a - b);
  const latNew = rows.map((r) => r[8]).filter((x) => x >= 0).sort((a, b) => a - b), trail = [];
  for (let i = 1; i < rows.length; i++) { // the view's lag behind the aim, as time at the aim's turning rate
    const w = (rows[i][9] - rows[i - 1][9]) / rows[i][1];
    if (Math.abs(w) > 0.0003) trail.push((rows[i][9] - rows[i][10]) / w);
  }
  trail.sort((a, b) => a - b);
  const turned = rows.reduce((n, r, i) => n + (i ? Math.abs(r[9] - rows[i - 1][9]) : 0), 0) * 180 / Math.PI;
  const r = (x) => +x.toFixed(1);
  return {
    n: rows.length, p50: r(q(iv, 0.5)), p95: r(q(iv, 0.95)), p99: r(q(iv, 0.99)), max: r(iv[iv.length - 1] || 0), pace: r(rows[0]?.[3] || 0),
    dips, cpu50: r(q(cpu, 0.5)), cpu99: r(q(cpu, 0.99)), cpuMax: r(cpu[cpu.length - 1] || 0), rafMax: r(Math.max(0, ...raf.slice(1))),
    alloc: rows.length ? Math.round(alloc / rows.length / 1024) : 0, gc, gpu50: r(q(gpu, 0.5)), gpu95: r(q(gpu, 0.95)), gpuMax: r(gpu[gpu.length - 1] || 0), lat50: r(q(lat, 0.5)), lat95: r(q(lat, 0.95)), new50: r(q(latNew, 0.5)), trail50: r(q(trail, 0.5)), turned: Math.round(turned),
  };
}
export const line = (s) => `p50 ${s.p50} · p95 ${s.p95} · p99 ${s.p99} · max ${s.max} · dips ${s.dips.length}/${s.n} · js ${s.cpu50}/${s.cpu99}/${s.cpuMax} · gpu ${s.gpu50}/${s.gpu95}/${s.gpuMax}${s.alloc ? ` · ${s.alloc} kB/f gc ${s.gc}` : ''}`;

// COST=1: the frame's cost with pacing and dynamic resolution off, standing at each area, in 12 directions.
async function cost(page, names, env) {
  const out = await page.evaluate(async ({ areas, why, full }) => {
    const g = window.game, e = g.engine, r = e.renderer, p = g.player;
    e.dynamicResolution = () => {}; e.pace = () => true; g.input.locked = true;
    if (full) { e.resScale = 1; r.setPixelRatio(e.pixelRatio()); r.setSize(innerWidth, innerHeight, false); }
    const frame = g.frame.bind(g);
    let n = 0;
    g.frame = (now) => { frame(now); n++; };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const measure = async (ms = 300) => { await wait(100); n = 0; const t = performance.now(); await wait(ms); return (performance.now() - t) / n; };
    const scan = [];
    for (const [name, [x, z]] of areas) {
      p.place(x, z, 0); await wait(700);
      for (let k = 0; k < 12; k++) { p.yaw = p.aimYaw = k * Math.PI / 6; scan.push({ name, yaw: k * 30, ms: await measure(), calls: r.info.render.drawCalls }); }
    }
    const seen = new Set(), dissect = [];
    for (const w of scan.slice().sort((a, b) => b.ms - a.ms)) {
      if (seen.has(w.name) || dissect.length >= why) continue;
      seen.add(w.name);
      const [x, z] = areas.find((a) => a[0] === w.name)[1];
      p.place(x, z, w.yaw * Math.PI / 180); await wait(900);
      const base = await measure(600), groups = new Map(), add = (k, o) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); };
      e.scene.traverse((o) => { if ((o.isMesh || o.isSprite || o.isPoints) && o.visible) { const m = [o.material].flat()[0]; add('mat:' + (m?.name || m?.type), o); } });
      for (const o of e.scene.children) if (o.visible) add('obj:' + (o.name || o.type), o);
      const res = [];
      for (const [k, list] of groups) { for (const o of list) o.visible = false; const ms = await measure(220); for (const o of list) o.visible = true; res.push([k, base - ms]); }
      dissect.push({ ...w, base, res: res.sort((a, b) => b[1] - a[1]).slice(0, 8) });
    }
    return { scan, dissect, px: `${r.domElement.width}×${r.domElement.height}`, tier: e.tier + (e.opts.lite ? ' lite' : ''), backend: e.backend };
  }, { areas: names.map((k) => [k, AREAS[k]]), why: +env.WHY || 0, full: !!env.RES });
  console.log(`${out.tier} ${out.backend} ${out.px} · uncapped ms per frame, view direction 0°…330°`);
  for (const name of names) { const v = out.scan.filter((s) => s.name === name); console.log(`  ${name.padEnd(9)}${v.map((s) => s.ms.toFixed(1).padStart(6)).join('')}   ${Math.min(...v.map((s) => s.calls))}–${Math.max(...v.map((s) => s.calls))} draws`); }
  for (const d of out.dissect) console.log(`  ${d.name} ${d.yaw}°: ${d.base.toFixed(1)} ms; saved by hiding: ${d.res.map(([k, ms]) => `${k} ${ms.toFixed(1)}`).join(' · ')}`);
  if (env.JSON) (await import('node:fs')).writeFileSync(env.JSON, JSON.stringify(out));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind = 'chrome', query = ''] = process.argv.slice(2);
  const env = process.env, secs = +env.SECS || 3, moves = (env.MOVES || 'stand,walk,run,turn').split(',');
  const areas = (env.AREAS || Object.keys(AREAS).join(',')).split(',');
  const phone = kind === 'phone' || kind === 'lite';
  const [, w = 1440, h = 900, dpr = kind === 'webkit' ? 2 : 1] = (env.SIZE || '').match(/^(\d+)x(\d+)(?:@([\d.]+))?$/) || [];
  const browser = await launch(kind === 'lite' ? 'phone' : kind, { uncapped: !!env.COST });
  const ctx = await browser.newContext(pageOptions(phone ? 'phone' : kind, { viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr }));
  if (kind === 'lite') await ctx.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { get: () => 2 }));
  const page = await ctx.newPage();
  page.setDefaultTimeout(300000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const cdp = kind === 'webkit' ? null : await ctx.newCDPSession(page);
  await page.goto(`http://127.0.0.1:${port}/?auto&${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 300000 });
  if (cdp && env.THROTTLE) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +env.THROTTLE });
  if (env.COST) { await cost(page, areas, env); await browser.close(); process.exit(0); }
  await page.evaluate(probe);
  await page.waitForTimeout(2500);
  const meta = await page.evaluate(() => { const e = window.game.engine; return { tier: e.tier + (e.opts.lite ? ' lite' : ''), backend: e.backend, cap: e.fpsCap, vsync: +(e.vsync || 0).toFixed(1) }; });
  console.log(`${kind} ${query || '(default)'}${env.THROTTLE ? ` CPU×${env.THROTTLE}` : ''} · ${JSON.stringify(meta)}`);
  const out = { kind, query, throttle: +env.THROTTLE || 1, meta, rows: {} };
  const record = async (area, move) => {
    const [x, z, yaw] = AREAS[area];
    await page.evaluate(async ({ x, z, yaw, move, lat }) => {
      const g = window.game, p = g.player, inp = g.input;
      inp.keys.clear(); p.place(x, z, yaw);
      if (inp.touchMode) inp.lock(); else inp.locked = true; // touch: the controls go live (src/ui/touch.js)
      await new Promise((ok) => setTimeout(ok, 900));
      if (move === 'walk' || move === 'run') inp.keys.add('KeyW');
      if (move === 'run') inp.keys.add('ShiftLeft');
      let t = 0;
      // mouse look fed per animation frame: a slow weave while moving, ~290°/s sweeps back and forth for `turn`
      window.smooth.start(lat ? null : (now, dt) => {
        t += dt;
        if (move === 'turn') inp.mdx += (Math.floor(t / 1.1) % 2 ? -1 : 1) * 2300 * Math.min(dt, 0.05);
        else if (move !== 'stand') inp.mdx += Math.sin(t * 1.3) * 180 * Math.min(dt, 0.05);
      });
    }, { x, z, yaw, move, lat: !!env.LAT });
    if (env.LAT) { // real look input: mouse moves (movementX), or a touch drag on the right half of a phone
      const t0 = Date.now();
      if (phone) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 300, id: 1 }] });
      for (let i = 0; Date.now() - t0 < secs * 1000; i++) {
        const px = 200 + 150 * Math.sin(i / 20);
        if (phone) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: px, y: 300, id: 1 }] });
        else await page.mouse.move(400 + px, 300);
        await new Promise((ok) => setTimeout(ok, 4));
      }
      if (phone) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else await page.waitForTimeout(secs * 1000);
    const rec = await page.evaluate(() => { const g = window.game; g.input.keys.clear(); const r = window.smooth.stop(); return r; });
    const s = stats(rec);
    s.res = rec.res; s.knobs = rec.knobs;
    (out.rows[area] ||= {})[move] = s;
    console.log(`  ${area.padEnd(9)} ${move.padEnd(5)} ${line(s)}${env.LAT ? ` · look event age oldest ${s.lat50} (p95 ${s.lat95}) newest ${s.new50} ms · view trails ${s.trail50} ms (${s.turned}° turned)` : ''} · res ${Math.round(rec.res * 100)}%${rec.knobs.length ? ' · ' + rec.knobs.join(', ') : ''}${s.dips.length ? '\n      dips ' + s.dips.slice(0, 6).map((d) => `${d[0]} (${d[2]})`).join(', ') : ''}`);
  };
  for (const area of areas) for (const move of env.LAT ? ['turn'] : moves) await record(area, move);
  const all = Object.values(out.rows).flatMap((a) => Object.values(a));
  const worst = (k) => Math.max(...all.map((s) => s[k]));
  console.log(`  ALL: worst p99 ${worst('p99')} · worst max ${worst('max')} · dips ${all.reduce((n, s) => n + s.dips.length, 0)} in ${all.reduce((n, s) => n + s.n, 0)} frames · js p50 ${q(all.map((s) => s.cpu50).sort((a, b) => a - b), 0.5)} (worst area ${worst('cpu50')})`);
  for (const l of [...new Set(errs)].slice(0, 6)) console.log('  ' + l);
  if (env.JSON) (await import('node:fs')).writeFileSync(env.JSON, JSON.stringify(out));
  await browser.close();
}
