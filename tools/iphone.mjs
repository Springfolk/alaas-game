// Real iPhone over USB (Settings › Safari › Advanced › Remote Automation; `safaridriver -p 4723` running on the Mac).
// node tools/iphone.mjs spots "<query>" [start,yard,urasa,inside,lake,edge]   uncapped ms/frame, JS ms, GPU-fence ms per spot
// node tools/iphone.mjs load "<query>"                                    boot marks (ms) and bytes transferred
// node tools/iphone.mjs play "<query>" [x,z,yaw]                        the game's pacing, slow turn: rendered fps per 5 s (CYCLES minutes)
// node tools/iphone.mjs ab "<query>" [x,z,yaw] [toggle|toggle…]           interleaved runtime A/B (CYCLES, default 4; SEQ=a|base|b… one exact order)
// BASE = the page (default: the tailnet test link); COOL=s first idles the phone on about:blank (heat throttles ~3×).
// The session id is kept in .cache/iphone.sid. A phone that has run hot shows ~3× frame times: compare within one run.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const WD = process.env.WD || 'http://127.0.0.1:4723', SIDF = '.cache/iphone.sid';
const BASE = process.env.BASE || 'https://georgiis-macbook.taila4c0b.ts.net:8443/';
const [mode = 'spots', query = '', where, only] = process.argv.slice(2);
const wd = async (method, path, body) => {
  const r = await fetch(WD + path, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const j = await r.json(); if (j.value?.error) throw new Error(`${j.value.error}: ${j.value.message}`); return j.value;
};
let sid = existsSync(SIDF) ? readFileSync(SIDF, 'utf8').trim() : null;
try { if (sid) await wd('GET', `/session/${sid}/url`); } catch { sid = null; }
if (!sid) { sid = (await wd('POST', '/session', { capabilities: { alwaysMatch: { platformName: 'iOS', browserName: 'Safari' } } })).sessionId; mkdirSync('.cache', { recursive: true }); writeFileSync(SIDF, sid); }
await wd('POST', `/session/${sid}/timeouts`, { script: 1800000, pageLoad: 120000 });
const go = (url) => wd('POST', `/session/${sid}/url`, { url });
const run = (fn, ...args) => wd('POST', `/session/${sid}/execute/async`, { script: `const done = arguments[arguments.length - 1]; (${fn})(...Array.from(arguments).slice(0, -1)).then(done, (e) => done({ error: String(e && e.stack || e) }));`, args });
if (process.env.COOL) { await go('about:blank'); await new Promise((r) => setTimeout(r, +process.env.COOL * 1000)); }
const SPOTS = { start: [62, -211, 1.69], yard: [9, -214, 1.2], urasa: [8, -204, 2.6], homestead: [8, -204, 4.2], ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7].map((k) => [`y${k}`, [8, -204, k * Math.PI / 4]])), inside: [0.4, -205.6, -1.4], lake: [6, -66, Math.PI], edge: [-60, -330, 0.3] };
const t0 = Date.now();
await go(`${BASE}?auto&${query}`);
// in the page: wait for the sharp world, uncap, then the mode's measurements
const out = await run(async (mode, spots, at, only, cycles, seq) => {
  const t = performance.now();
  while (!(window.game?.complete && window.game.sharp)) { if (performance.now() - t > 240000) return { error: 'not complete in 4 min' }; await new Promise((r) => setTimeout(r, 200)); }
  const g = window.game, e = g.engine, r = e.renderer, scene = e.scene, gl = r.backend.gl;
  const loaded = Math.round(performance.now());
  if (mode === 'load') { // the boot marks (main.js mark) and what came over the network
    const res = performance.getEntriesByType('resource'), nav = performance.getEntriesByType('navigation')[0];
    const kb = (f) => Math.round(res.filter(f).reduce((s, x) => s + (x.transferSize || 0), 0) / 1024);
    return { marks: JSON.stringify(window.loadMarks), transferKB: kb(() => true) + Math.round((nav?.transferSize || 0) / 1024), jsKB: kb((x) => /\.js/.test(x.name)), geoKB: kb((x) => /\/geo\//.test(x.name)), texKB: kb((x) => /\/tex\//.test(x.name)), impKB: kb((x) => /impostors/.test(x.name)), files: res.length };
  }
  const wait0 = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const pace0 = e.pace, dyn0 = e.dynamicResolution;
  e.pace = () => true; e.dynamicResolution = () => {};
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const med = (v) => (v = v.filter((x) => x != null).sort((p, q) => p - q), v.length ? +v[v.length >> 1].toFixed(1) : null);
  let links = 0; if (gl && !gl.__lp) { const lp = gl.linkProgram.bind(gl); gl.linkProgram = (p) => { links++; return lp(p); }; gl.__lp = true; }
  if (mode === 'spots') {
    const frame = g.frame.bind(g); let rows = null;
    g.frame = (...a) => {
      const t1 = performance.now(); frame(...a); if (!rows) return; const row = { c: performance.now() - t1 }; rows.push(row);
      if (gl && rows.length % 4 === 0) { const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), f0 = performance.now(); gl.flush();
        const poll = () => { if (gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED) { row.g = performance.now() - f0; gl.deleteSync(s); } else setTimeout(poll, 0); }; setTimeout(poll, 0); }
    };
    const res = { loaded, tier: e.tier, backend: e.backend, px: `${r.domElement.width}×${r.domElement.height}` };
    for (const [name, [x, z, yaw]] of spots) {
      g.player.place(x, z, yaw); await wait(2500);
      const f0 = r.info.frame, t1 = performance.now(); rows = []; links = 0; await wait(4000);
      const v = rows; rows = null; const ms = (performance.now() - t1) / (r.info.frame - f0);
      res[name] = `${ms.toFixed(1)} ms/frame · JS ${med(v.map((x) => x.c))} · GPU ${med(v.map((x) => x.g))} · ${r.info.render.drawCalls} draws${links ? ` · ${links} programs linked` : ''}`;
    }
    return res;
  }
  // ab: every toggle against the baseline, interleaved; per-cycle ratios to that cycle's baseline (same clock state only)
  const [x, z, yaw] = at; g.player.place(x, z, yaw); await wait(2500);
  const groups = scene.children.filter((c) => !c.isLight);
  const hide = (keys) => () => { const h = []; for (const c of groups) if (keys.some((k) => (k.endsWith('-') ? c.name.startsWith(k) : c.name === k))) c.traverse((o) => { if (o.layers.mask) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; };
  const HOME = ['urasa', 'balagan', 'serge', 'ampaar', 'kuruo', 'sele', 'yardlife', 'chores', 'lakeside', 'sacred-birch', 'balagan-kystyk', 'impostors'];
  const T = {
    'half res': () => { const pr = r.getPixelRatio(); r.setPixelRatio(pr * 0.5); return () => r.setPixelRatio(pr); },
    'frozen shadows': () => { const lz = e.opts.lazyShadows, sh = e.sun.shadow, au = sh.autoUpdate; e.opts.lazyShadows = false; sh.autoUpdate = false; sh.needsUpdate = false; return () => { e.opts.lazyShadows = lz; sh.autoUpdate = au; }; },
    'no ground': hide(['ground']), 'no near grass': hide(['grass-near']), 'no mid grass': hide(['grass-mid']), 'no flowers': hide(['flowers-', 'shore-plants']),
    'no forest': hide(['forest', 'forest-impostors', 'forest-canopy', 'forest-deadwood']), 'no homestead': hide(HOME),
    'only sky': hide(groups.map((c) => c.name).filter((n) => n && n !== 'sky')),
    // fewer instances of every grass/flower chunk (the cost of a sparser build, not its look)
    // half a second of nothing drawn (then measured with everything back)
    'blank 0.5s': () => { const u = hide(groups.map((c) => c.name).filter(Boolean))(); const v = e.sky.visible; e.sky.visible = false; const t1 = setTimeout(() => { u(); e.sky.visible = v; }, 500); return () => { clearTimeout(t1); u(); e.sky.visible = v; }; },
    'res x0.85': () => { const pr = r.getPixelRatio(); r.setPixelRatio(pr * 0.85); return () => r.setPixelRatio(pr); },
    'diet': () => { const a = T['grass x0.5'](); return () => a(); },
    'diet+res': () => { const a = T['grass x0.5'](), b = T['res x0.85'](); return () => { a(); b(); }; },
    'grass x0.5': () => { const h = []; for (const c of groups) if (/^(grass|flowers|shore)/.test(c.name)) c.traverse((o) => { const gg = o.geometry; if (gg?.isInstancedBufferGeometry) { h.push([gg, gg.instanceCount]); gg.instanceCount = Math.ceil(gg.instanceCount * 0.5); } }); return () => { for (const [gg, n] of h) gg.instanceCount = n; }; },
  };
  if (mode === 'play') { // the game's own pacing and dynamic quality; the view turns slowly at the spot; rendered fps per 5 s
    const [x, z, yaw] = at; g.player.place(x, z, yaw); e.pace = pace0; e.dynamicResolution = dyn0;
    for (const n of (only ? only.split('|') : [])) T[n]();
    const spin = setInterval(() => { g.player.aimYaw += 0.02; }, 50);
    const line = [];
    for (let k = 0; k < Math.round(cycles * 12); k++) { const f0 = r.info.frame; await wait0(5000); line.push(`${((r.info.frame - f0) / 5).toFixed(0)}${e.resScale < 0.999 ? `@${e.resScale.toFixed(2)}` : ''}`); }
    clearInterval(spin);
    return { loaded, cap: e.fpsCap, fps: line.join(' ') };
  }
  for (const n of [...(only ? only.split('|') : []), ...(seq ? seq.split('|') : [])]) if (n.startsWith('hide:')) T[n] = hide(n.slice(5).split(','));
  else if (n.startsWith('light:')) T[n] = () => { const h = []; scene.getObjectByName(n.slice(6))?.traverse((o) => { if (o.isLight) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; };
  else if (n.startsWith('nonmesh:')) T[n] = () => { const h = []; scene.getObjectByName(n.slice(8))?.traverse((o) => { if (!o.isMesh && o.layers.mask) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; };
  else if (n.startsWith('mat:')) { // mat:<model>:<material,…> hides those materials' meshes in one model (material name, or its type)
    const [, root, list] = n.split(':'), want = new Set(list.split(','));
    T[n] = () => { const h = []; scene.getObjectByName(root)?.traverse((o) => { if (o.isMesh && o.layers.mask && want.has(o.material?.name || o.material?.type)) { h.push([o, o.layers.mask]); o.layers.mask = 0; } }); return () => { for (const [o, m] of h) o.layers.mask = m; }; };
  }
  const names = only ? only.split('|') : Object.keys(T);
  const measure = async () => { await wait(700); links = 0; const f0 = r.info.frame, t1 = performance.now(); await wait(2500); return { ms: (performance.now() - t1) / Math.max(1, r.info.frame - f0), links }; };
  const acc = { base: [] }; for (const n of names) acc[n] = [];
  if (seq) { // SEQ: one exact order, printed as a timeline
    const line = [];
    for (const n of seq.split('|')) { const undo = n === 'base' ? () => {} : T[n](); const m = await measure(); undo(); line.push(`${n} ${m.ms.toFixed(0)}${m.links ? '*' : ''}`); }
    return { loaded, timeline: line.join(' → ') };
  }
  for (let c = 0; c < cycles; c++) for (const n of ['base', ...names]) { const undo = n === 'base' ? () => {} : T[n](); acc[n].push(await measure()); undo(); }
  const res = { loaded };
  for (const [k, v] of Object.entries(acc)) {
    const q = v.map((m, i) => m.ms / acc.base[i].ms).filter((x) => x < 1.8 && x > 1 / 1.8).sort((a, b) => a - b);
    res[k] = `${med(v.map((m) => m.ms))} ms${k === 'base' ? '' : q.length ? ` · ×${q[q.length >> 1].toFixed(2)} of base (${q.length}/${v.length} cycles)` : ''} · raw ${v.map((m) => m.ms.toFixed(0) + (m.links ? '*' : '')).join(' ')}`;
  }
  return res;
}, mode, (where || 'start,yard,urasa,inside,lake').split(',').filter((k) => SPOTS[k]).map((k) => [k, SPOTS[k]]),
((mode === 'ab' || mode === 'play') && where ? where.split(',').map(Number) : SPOTS.urasa), only || '', +(process.env.CYCLES || 4), process.env.SEQ || '');
console.log(`${mode} ${query || '(default)'} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const [k, v] of Object.entries(out)) console.log(`  ${k.padEnd(14)} ${v}`);
