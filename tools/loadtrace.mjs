// Load breakdown: where the time from navigation to ready goes (docs/loading.md).
// node tools/loadtrace.mjs [chrome|webkit] [query] [profile.json] — needs a server (PORT; dev or `vite preview`).
// Loads with `?prof` (src/load/prof.js) and prints: the load marks; main-thread busy time per phase (a 4 ms
// timer probe: busy = how late it fires); main-thread time by bucket (node builds, texture upload/mips,
// pipeline creation, renders…); wall spans of off-thread work (fetches, image decode, worker jobs, pipeline
// compiles, GPU queue); fetched resources by kind. Chrome adds a CDP CPU profile, self time by source file
// (written to profile.json when given: open it in Chrome DevTools' Performance panel).
import { writeFileSync } from 'node:fs';
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = '', out = ''] = process.argv.slice(2);
const browser = await launch(kind);
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1280, height: 720 } }));
const throttle = +process.env.THROTTLE || 1;
const cdp = kind === 'webkit' ? null : await page.context().newCDPSession(page);
if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.addInitScript(() => {
  performance.setResourceTimingBufferSize?.(5000);
  const B = window.__busy = [];
  let last = performance.now();
  setInterval(() => { const t = performance.now(), late = t - last - 4; if (late > 1) B.push([last, late]); last = t; }, 4);
  const F = window.__frames = [];
  const raf = (t) => { F.push(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
});
if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
await page.goto(`http://127.0.0.1:${port}/?prof${query ? '&' + query : ''}`, { waitUntil: 'commit' });
await page.waitForFunction(() => window.game?.ready, null, { timeout: 300000, polling: 50 });
if (process.env.AFTER) { await page.evaluate(() => window.loadProf && (window.__atReady = { ...window.loadProf.ms })); await page.waitForTimeout(2600); }
const profile = cdp ? (await cdp.send('Profiler.stop')).profile : null;
const R = await page.evaluate(() => ({
  marks: window.loadMarks, prof: window.loadProf, atReady: window.__atReady, busy: window.__busy, frames: window.__frames,
  res: performance.getEntriesByType('resource').map((e) => ({ n: e.name, s: e.startTime, e: e.responseEnd, b: e.encodedBodySize || e.transferSize || 0, i: e.initiatorType })),
}));
await browser.close();

const M = R.marks, ready = M.ready, f = (x) => String(Math.round(x)).padStart(6);
console.log(`${kind} ${query || '(default)'}${throttle > 1 ? ` CPU ×${throttle}` : ''}  marks ${JSON.stringify(M)}`);
// main-thread busy per phase
const phases = [['nav→main (modules)', 0, M.main], ['main→engine', M.main, M.engine], ['engine→firstView', M.engine, M.firstView ?? M.engine],
  ['firstView→built', M.firstView ?? M.engine, M.built], ['built→warmBuilt', M.built, M.warmBuilt], ['warmBuilt→ready (pacing)', M.warmBuilt, ready]];
const busyIn = (a, b) => R.busy.reduce((s, [t, l]) => s + Math.max(0, Math.min(b, t + l) - Math.max(a, t)), 0);
console.log('\nphase                         wall    busy   idle');
for (const [n, a, b] of phases) console.log(`${n.padEnd(28)}${f(b - a)}  ${f(busyIn(a, b))} ${f(b - a - busyIn(a, b))}`);
console.log(`${'total'.padEnd(28)}${f(ready)}  ${f(busyIn(0, ready))} ${f(ready - busyIn(0, ready))}`);
// frames: long frame gaps
const gaps = []; for (let i = 1; i < R.frames.length; i++) { const d = R.frames[i] - R.frames[i - 1]; if (d > 50) gaps.push([R.frames[i - 1], d]); }
console.log(`frames ${R.frames.length}, gaps >50 ms ${gaps.length} (${f(gaps.reduce((s, g) => s + g[1], 0))} ms)`);
// AFTER=1: the 2.5 s after ready (frame gaps and main-thread buckets there)
if (R.atReady) {
  const after = []; for (let i = 1; i < R.frames.length; i++) { const d = R.frames[i] - R.frames[i - 1]; if (R.frames[i - 1] >= ready && d > 33) after.push(`${Math.round(d)}@+${Math.round(R.frames[i - 1] - ready)}`); }
  const d = Object.entries(R.prof.ms).map(([k, v]) => [k, v - (R.atReady[k] || 0)]).filter(([, v]) => v > 1).map(([k, v]) => `${k} ${Math.round(v)}`);
  console.log(`after ready: frames >33 ms ${after.join(' ') || 'none'}; main-thread ${d.join(', ')}; events ${R.prof.events.filter((e) => e[1] > ready).map(([n, t]) => `${n} +${Math.round(t - ready)}`).join(', ')}`);
}
// buckets
const P = R.prof || { ms: {}, n: {}, spans: {} };
const tot = Object.values(P.ms).reduce((a, b) => a + b, 0);
console.log('\nmain-thread bucket (exclusive)   ms     n');
for (const [k, v] of Object.entries(P.ms).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)}${f(v)} ${f(P.n[k])}`);
console.log(`  ${'(sum)'.padEnd(28)}${f(tot)}   other busy ≈ ${Math.round(busyIn(0, ready) - tot)}`);
console.log('\noff-thread span               n    sum  first   last');
for (const [k, s] of Object.entries(P.spans).sort()) console.log(`  ${k.padEnd(24)}${f(s.n)} ${f(s.sum)} ${f(s.first)} ${f(s.last)}`);
// timeline: per interval between events, wall / busy / bucketed main-thread ms
if (P.events?.length) {
  console.log('\ninterval (events)                       wall  busy  node rend  tex  other   idle   (busy ≥ bucket sum)');
  const ev = [['nav', 0, {}], ...P.events];
  const g = (o, ks) => ks.reduce((s, k) => s + (o[k] || 0), 0);
  const K = { node: ['nodes'], rend: ['render', 'buffers', 'bindings', 'pipeline.create'], tex: ['tex.upload', 'tex.mips', 'tex.create'] };
  for (let i = 1; i < ev.length; i++) {
    const [n0, a, m0] = ev[i - 1], [n1, b, m1] = ev[i], d = {};
    for (const [k, ks] of Object.entries(K)) d[k] = g(m1, ks) - g(m0, ks);
    // the probe misses short tasks: busy is at least what the buckets measured
    const all = Object.values(m1).reduce((x, y) => x + y, 0) - Object.values(m0).reduce((x, y) => x + y, 0), busy = Math.max(busyIn(a, b), all);
    console.log(`  ${(n0 + ' → ' + n1).slice(0, 36).padEnd(36)}${f(b - a)}${f(busy)}${f(d.node)}${f(d.rend)}${f(d.tex)}${f(busy - all)}${f(b - a - busy)}`);
  }
}
// resources
const kindOf = (r) => { const u = new URL(r.n).pathname;
  if (/\/node_modules\/|\/@vite|\/@fs|\.vite\/deps/.test(u)) return 'js: deps/vite'; if (/\.(m?js|ts)$|\/src\//.test(u)) return 'js: src';
  const m = u.match(/\/assets\/(\w+)\//); if (m) return `asset: ${m[1]}`; return 'other ' + (u.split('.').pop() || ''); };
const groups = {}; for (const r of R.res) { const g = groups[kindOf(r)] ||= { n: 0, b: 0, s: Infinity, e: 0, after: 0 }; g.n++; g.b += r.b; g.s = Math.min(g.s, r.s); g.e = Math.max(g.e, r.e); if (r.e > ready) g.after++; }
console.log('\nresources               n      kB  start    end');
for (const [k, g] of Object.entries(groups).sort((a, b) => a[1].s - b[1].s)) console.log(`  ${k.padEnd(20)}${f(g.n)} ${String(Math.round(g.b / 1e3)).padStart(7)} ${f(g.s)} ${f(g.e)}`);
// CPU profile: self time by file (Chrome)
if (profile) {
  if (out) writeFileSync(out, JSON.stringify(profile));
  const byId = new Map(profile.nodes.map((n) => [n.id, n])), self = new Map(), dt = profile.timeDeltas;
  for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i]; self.set(id, (self.get(id) || 0) + (dt[i + 1] ?? 0) / 1000); }
  const files = new Map(), fns = new Map();
  for (const [id, ms] of self) {
    const c = byId.get(id).callFrame;
    let file = c.url ? new URL(c.url).pathname.replace(/\?.*/, '') : `(${c.functionName || 'native'})`;
    file = file.replace(/.*node_modules\/(\.vite\/deps\/)?/, 'nm/').replace(/^\/src\//, 'src/');
    files.set(file, (files.get(file) || 0) + ms);
    const fn = `${c.functionName || '(anon)'} ${file.split('/').pop()}:${c.lineNumber}`;
    fns.set(fn, (fns.get(fn) || 0) + ms);
  }
  console.log('\nCPU profile self time by file (ms)');
  for (const [k, v] of [...files].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${f(v)}  ${k}`);
  console.log('top functions');
  for (const [k, v] of [...fns].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${f(v)}  ${k}`);
}
