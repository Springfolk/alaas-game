// GPU ms per frame of the phone tier on this Mac (Apple GPU like an iPhone's, but steady: no thermal flips), by a
// WebGL2 timer query around every frame. Needs `npm run dev` (PORT).
// node tools/gpuab.mjs "<query>|<query>…" [spot,spot…] [toggle|toggle…]   each query a fresh page (?auto&webgl&q=mobile&…);
// toggles: hide:<group>,… · mat:<model>:<material>,… (as tools/iphone.mjs) · nosky · a+b (both; defined earlier in the list); spots as iphone.mjs (default urasa,yard,edge)
import { launch, PORT } from './browser.mjs';
const [queries = '', where = 'urasa,yard,edge', toggles = ''] = process.argv.slice(2);
const SPOTS = { start: [62, -211, 1.69], yard: [9, -214, 1.2], urasa: [8, -204, 2.6], homestead: [8, -204, 4.2], inside: [0.4, -205.6, -1.4], lake: [6, -66, Math.PI], edge: [-60, -330, 0.3], y2: [8, -204, Math.PI / 2], y7: [8, -204, 7 * Math.PI / 4] };
const browser = await launch('chrome', { uncapped: true });
for (const q of queries.split('|')) {
  // an iPhone 14 Pro's frame: 393×852 CSS px, 3× native, the tier's 0.67 start → ~790×1710 px
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?auto&webgl&q=mobile&${q}`);
  await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 300000 });
  const out = await page.evaluate(async ({ spots, toggles }) => {
    const g = window.game, e = g.engine, r = e.renderer, gl = r.backend.gl, scene = e.scene, ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    e.pace = () => true; e.dynamicResolution = () => {};
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    let rows = null, js = null; const pend = [];
    const frame = g.frame.bind(g);
    g.frame = (...a) => {
      if (!rows) return frame(...a);
      const qy = gl.createQuery(), t0 = performance.now(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qy); frame(...a); gl.endQuery(ext.TIME_ELAPSED_EXT); js.push(performance.now() - t0); pend.push([qy, rows]);
      for (let i = pend.length - 1; i >= 0; i--) { const [p, into] = pend[i]; if (gl.getQueryParameter(p, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) into.push(gl.getQueryParameter(p, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(p); pend.splice(i, 1); } }
    };
    const groups = scene.children.filter((c) => !c.isLight);
    const T = { base: () => () => {}, nosky: () => { e.sky.visible = false; return () => { e.sky.visible = true; }; } };
    for (const n of toggles ? toggles.split('|') : []) {
      if (n.includes('+')) { const parts = n.split('+'); T[n] = () => { const u = parts.map((k) => T[k]()); return () => u.forEach((f) => f()); }; continue; }
      if (n.startsWith('light:')) { T[n] = () => { const h = []; scene.getObjectByName(n.slice(6))?.traverse((o) => { if (o.isLight) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; }; continue; }
      if (n.startsWith('hide:')) { const keys = n.slice(5).split(','); T[n] = () => { const h = []; for (const c of groups) if (keys.some((k) => (k.endsWith('-') ? c.name.startsWith(k) : c.name === k))) c.traverse((o) => { if (o.layers.mask) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; }; }
      else if (n.startsWith('mat:')) { const [, root, list] = n.split(':'), want = new Set(list.split(',')); T[n] = () => { const h = []; scene.getObjectByName(root)?.traverse((o) => { if (o.isMesh && o.layers.mask && want.has(o.material?.name || o.material?.type)) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; }; }
    }
    const med = (v) => { v = [...v].sort((a, b) => a - b); return v.length ? v[v.length >> 1] : NaN; };
    const res = { px: `${r.domElement.width}×${r.domElement.height}` };
    for (const [name, [x, z, yaw]] of spots) {
      g.player.place(x, z, yaw); await wait(1500);
      for (const [tn, t] of Object.entries(T)) { const undo = t(); await wait(400); rows = []; js = []; await wait(2000); const v = rows; rows = null; undo(); res[`${name} ${tn}`] = `${med(v).toFixed(2)} ms GPU · JS ${med(js).toFixed(2)} ms (${v.length} frames) · ${r.info.render.drawCalls} draws · ${(r.info.render.triangles / 1000).toFixed(0)}k tri`; }
    }
    return res;
  }, { spots: where.split(',').map((k) => [k, SPOTS[k]]), toggles });
  console.log(q || '(default)');
  for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(22)} ${v}`);
  await page.close();
}
await browser.close();
