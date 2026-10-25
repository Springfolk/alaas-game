// Runtime-compile check: loads the game, then walks a route round the homestead (yard, inside the houses,
// the lake) turning the view, and reports every shader built and pipeline created during the walk.
// node tools/walkcheck.mjs [chrome|webkit|phone] [query] — needs the dev server (PORT).
// Default: the walk starts once the world is complete (game.complete): must be 0/0.
// EARLY=1: it starts at "ready", while the loader still streams shaders; builds then are expected, but each
// must be time-sliced: pass = no frame gap over 50 ms.
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = ''] = process.argv.slice(2);
const browser = await launch(kind);
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1280, height: 720 } }));
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const ROUTE = [[62, -211, 1.69], [30, -212, 1.5], [9, -214, 1.2], [4, -205, -1.4], [0.4, -205.6, -1.4], [-14, -203, 0], [-17, -200, 2],
  [3, -186, 3], [26, -225, 0.5], [40, -203, -2], [14, -170, 3.1], [6, -100, 3.1], [6, -66, Math.PI], [-60, -330, 0.3], [62, -211, 1.69]];
let res;
for (let attempt = 1; ; attempt++) try { // Vite reloads the page when files change: retry
  await page.goto(`http://127.0.0.1:${port}/?auto&${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction((early) => (early ? window.game?.ready : window.game?.complete || (window.game?.ready && !window.game.finish)), !!process.env.EARLY, { timeout: 300000 });
  res = await page.evaluate(async (ROUTE) => {
    const g = window.game, r = g.engine.renderer, built = [], pipes = [];
    const cnb = r.backend.createNodeBuilder.bind(r.backend);
    r.backend.createNodeBuilder = (o, rr) => { built.push(`${o.name || o.type}/${o.material?.name || o.material?.type}`); return cnb(o, rr); };
    const crp = r.backend.createRenderPipeline.bind(r.backend);
    r.backend.createRenderPipeline = (ro, p) => { pipes.push(`${ro.object.name || ro.object.type}/${ro.material.name || ro.material.type}`); return crp(ro, p); };
    const ccp = r.backend.createComputePipeline.bind(r.backend);
    r.backend.createComputePipeline = (cp, b) => { pipes.push('compute'); return ccp(cp, b); };
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    let worst = 0, over = 0, last = performance.now();
    const f = g.frame.bind(g);
    g.frame = (now) => { const t = performance.now(); worst = Math.max(worst, t - last); if (t - last > 50) over++; last = t; f(now); };
    for (const [x, z, yaw] of ROUTE) {
      g.player.place(x, z, yaw);
      for (let k = 0; k < 8; k++) { g.player.yaw = g.player.aimYaw = yaw + k * Math.PI / 4; await wait(120); }
    }
    return { built, pipes, worst: Math.round(worst), over, complete: !!g.complete };
  }, ROUTE);
  break;
} catch (e) { if (attempt >= 4) throw e; console.log('retry: ' + e.message.split('\n')[0]); }
const early = !!process.env.EARLY, pass = early ? res.over === 0 : res.built.length + res.pipes.length === 0;
console.log(`${kind} ${query || '(default)'}${early ? ' EARLY (walk from ready)' : ' (walk once complete)'}: ${res.built.length} shaders built, ${res.pipes.length} pipelines created; worst frame gap ${res.worst} ms, ${res.over} over 50 ms${early ? `; complete by the end: ${res.complete}` : ''} → ${pass ? 'PASS' : 'FAIL'}`);
for (const b of [...new Set([...res.built, ...res.pipes])].slice(0, 30)) console.log('  ' + b);
for (const l of errs.slice(0, 8)) console.log('  ! ' + l);
await browser.close();
