// Headless render benchmark: per view, the frame's CPU time and CPU+GPU time (each frame waits for the GPU).
// node tools/bench.mjs [chrome|webkit|phone] [query] — e.g. `node tools/bench.mjs phone "q=low"`. Needs the dev server (PORT).
// Numbers are relative (one shared GPU); compare runs made back to back. DPR env: desktop pixel ratio.
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = ''] = process.argv.slice(2);
const VIEWS = { start: [62, -211, 1.69], yard: [9, -214, 1.2], inside: [0.4, -205.6, -1.4], lake: [6, -66, Math.PI], edge: [-60, -330, 0.3] };
const browser = await launch(kind, { uncapped: true });
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: +process.env.DPR || (kind === 'webkit' ? 2 : 1) }));
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (/warm-up|tier/.test(m.text())) errs.push(m.text()); });
let res, load;
for (let attempt = 1; ; attempt++) try { // Vite reloads the page when files change: retry
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/?auto&gputime&${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.ready, null, { timeout: 240000 });
load = Date.now() - t0;
res = await page.evaluate(async (VIEWS) => {
  const g = window.game, e = g.engine, r = e.renderer;
  e.dynamicResolution = () => {}; e.pace = () => true; // uncapped: measure the work, not the pacing
  const frame = g.frame.bind(g);
  let rec = null;
  // the game keeps its own loop; each frame's CPU time is timed here, its GPU time read from timestamp queries
  g.frame = () => {
    const a = performance.now(); frame(); const b = performance.now();
    if (!rec) return;
    const i = r.info.render, row = { cpu: b - a, calls: i.drawCalls, tris: i.triangles };
    rec.push(row);
    if (r.backend.trackTimestamp) r.resolveTimestampsAsync('render').then((ms) => { row.gpu = ms; });
  };
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const med = (v) => (v = v.filter((x) => x != null).sort((p, q) => p - q), v.length ? v[v.length >> 1] : null);
  const out = {};
  for (const [name, [x, z, yaw]] of Object.entries(VIEWS)) {
    g.player.place(x, z, yaw);
    await wait(700);
    rec = [];
    await wait(2000);
    const rows = rec; rec = null;
    await wait(200);
    const fps = rows.length / 2;
    out[name] = { cpu: med(rows.map((x) => x.cpu))?.toFixed(1), gpu: med(rows.map((x) => x.gpu))?.toFixed(1), fps: fps.toFixed(0),
      calls: med(rows.map((x) => x.calls)), tris: (med(rows.map((x) => x.tris)) / 1e6).toFixed(2) };
  }
  out.meta = { tier: e.tier, quality: e.opts.quality, backend: e.backend, px: `${r.domElement.width}x${r.domElement.height}`, ts: !!r.backend.trackTimestamp };
  return out;
}, VIEWS);
break;
} catch (e) { if (attempt >= 4) throw e; console.log('retry: ' + e.message.split('\n')[0]); }
console.log(`${kind} ${query || '(default)'} · load ${(load / 1000).toFixed(1)} s · ${JSON.stringify(res.meta)}`);
for (const [k, v] of Object.entries(res)) if (k !== 'meta') console.log(`  ${k.padEnd(7)} cpu ${String(v.cpu).padStart(5)} ms · gpu ${String(v.gpu).padStart(5)} ms · ${v.fps} fps · ${v.calls} calls · ${v.tris} M tris`);
for (const l of errs.slice(0, 8)) console.log('  ' + l);
await browser.close();
