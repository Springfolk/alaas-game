// Hitch hunt: a long scripted walk with mouse look through every area, at the real frame pacing.
// node tools/hitch.mjs [chrome|webkit|phone] [query] — needs the dev server (PORT). Prints the frame-interval
// distribution (p50/p95/p99/max), hitch counts and every new render pipeline compiled after the fade.
// UNCAPPED=1 renders as fast as possible (frame cost instead of pacing).
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = ''] = process.argv.slice(2);
// [x, z, speed m/s]: homestead → inside the urasa → balagan → yard → lakeside → forest edge → far meadow
const PATH = [
  [62, -211, 5], [22, -207, 3], [12, -205, 2], [5, -205, 1.6], [0.4, -205.4, 1.6], [-1.5, -204, 1.6], [5, -205, 2],
  [6, -196, 2.5], [-9, -199, 2], [-14, -200, 1.4], [-18, -199, 1.4], [-16, -203, 1.4], [-9, -200, 2], [3, -191, 2.5],
  [26, -216, 3], [46, -205, 3], [30, -150, 6], [6, -66, 6], [-30, -45, 5], [-90, -110, 7], [-200, -140, 7],
  [-130, -260, 7], [-60, -320, 5], [-40, -345, 3], [20, -300, 7], [150, -160, 8], [250, -105, 6], [264, -96, 2],
];
const browser = await launch(kind, { uncapped: !!process.env.UNCAPPED });
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: kind === 'webkit' ? 2 : 1 }));
page.setDefaultTimeout(240000);
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || /^merge:/.test(m.text())) errs.push(m.text()); });
let res;
for (let attempt = 1; ; attempt++) try { // Vite reloads the page when files change: retry
  await page.goto(`http://127.0.0.1:${port}/?auto&${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.game?.ready, null, { timeout: 240000 });
  res = await page.evaluate(async ({ PATH, uncapped }) => {
    const g = window.game, e = g.engine, r = e.renderer, p = g.player;
    if (uncapped) e.pace = () => true;
    const pipes = () => r._pipelines?.caches.size ?? 0;
    // name each pipeline compiled during the walk: object/material, pass (render target), new shader or not
    const P = r._pipelines, orig = P._getRenderPipeline.bind(P), named = [];
    P._getRenderPipeline = (ro, vs, fs, ...rest) => {
      if (named.on) named.push(`${ro.object.name || ro.object.parent?.name || ro.object.type}/${ro.material.name || ro.material.type}${ro.context?.renderTarget ? ' @rt' : ''}`);
      return orig(ro, vs, fs, ...rest);
    };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    await wait(1500); // past the fade
    const p0 = pipes(), legs = []; named.on = true;
    let d = 0;
    for (let i = 1; i < PATH.length; i++) {
      const [ax, az] = PATH[i - 1], [bx, bz, v] = PATH[i], L = Math.hypot(bx - ax, bz - az);
      legs.push({ ax, az, bx, bz, v, d0: d, t: L / v }); d += L;
    }
    const rows = [], compiles = [];
    const frame = g.frame.bind(g);
    let leg = 0, legT = 0, t = 0, last = null;
    g.input.locked = true;
    return new Promise((done) => {
      g.frame = () => {
        const now = performance.now(), dt = last == null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
        const L = legs[leg];
        legT += dt; t += dt;
        if (legT > L.t) { legT -= L.t; leg++; }
        if (leg >= legs.length) { g.frame = frame; g.input.locked = false; done({ rows, compiles, named, p0, p1: pipes(), dist: Math.round(d) }); return; }
        const C = legs[leg], k = Math.min(1, legT / C.t);
        const x = C.ax + (C.bx - C.ax) * k, z = C.az + (C.bz - C.az) * k;
        p.pos.set(x, g.world.groundAt(x, z), z);
        // heading along the path plus a wide, irregular mouse sweep
        const head = Math.atan2(-(C.bx - C.ax), -(C.bz - C.az));
        p.aimYaw = p.yaw = head + Math.sin(t * 0.9) * 1.3 + Math.sin(t * 2.3) * 0.4;
        p.aimPitch = p.pitch = Math.sin(t * 0.7) * 0.25 - 0.05;
        const n0 = pipes(), a = performance.now();
        frame();
        const b = performance.now(), n1 = pipes();
        if (last != null) rows.push([now - last, b - a]);
        if (n1 > n0) compiles.push({ at: [Math.round(x), Math.round(z)], n: n1 - n0, ms: Math.round(b - a) });
        last = now;
      };
    });
  }, { PATH, uncapped: !!process.env.UNCAPPED });
  break;
} catch (e) { if (attempt >= 4) throw e; console.log('retry: ' + e.message.split('\n')[0]); }
const q = (v, f) => v[Math.min(v.length - 1, Math.floor(v.length * f))];
const iv = res.rows.map((r) => r[0]).sort((a, b) => a - b), cpu = res.rows.map((r) => r[1]).sort((a, b) => a - b);
const meta = await page.evaluate(() => ({ tier: window.game.engine.tier, cap: window.game.engine.fpsCap, res: window.game.engine.resScale }));
const fmt = (v) => `p50 ${q(v, 0.5).toFixed(1)} · p95 ${q(v, 0.95).toFixed(1)} · p99 ${q(v, 0.99).toFixed(1)} · max ${v[v.length - 1].toFixed(1)} ms`;
console.log(`${kind} ${query || '(default)'}${process.env.UNCAPPED ? ' UNCAPPED' : ''} · ${res.dist} m · ${res.rows.length} frames · ${JSON.stringify(meta)}`);
console.log(`  interval ${fmt(iv)}`);
console.log(`  cpu      ${fmt(cpu)}`);
const cnt = (ms) => iv.filter((x) => x > ms).length;
console.log(`  hitches  >25 ms ${cnt(25)} · >50 ms ${cnt(50)} · >100 ms ${cnt(100)} · interval in 15-18 ms ${iv.filter((x) => x > 15 && x < 18.5).length}`);
console.log(`  pipelines after fade: ${res.p1 - res.p0}${res.compiles.length ? ' at ' + JSON.stringify(res.compiles.slice(0, 12)) : ''}`);
if (res.named.length) console.log('  compiled: ' + [...new Set(res.named)].slice(0, 30).join(', '));
for (const l of errs.slice(0, 8)) console.log('  ' + l);
await browser.close();
