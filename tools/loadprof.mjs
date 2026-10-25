// Load profile: main-thread stalls from navigation to playable, per browser.
// node tools/loadprof.mjs [chrome|webkit|phone] [query] [shotPrefix] — needs the dev server (PORT).
// Prints time to the first world pixel (the black fade clears), to playable (game.ready) and to the world
// complete (game.complete: every shader built), the load marks and stage console lines, and every main-thread
// stall over 50 ms until complete (gaps between animation frames / timers: WebKit has no long-task observer;
// Chrome's long tasks too). THROTTLE=4: Chrome CPU throttling (an office-computer proxy).
// With shotPrefix, screenshots the loading view at 1, 2, 4, 8 s and at ready.
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = '', shots = ''] = process.argv.slice(2);
const browser = await launch(kind);
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1280, height: 720 } }));
const throttle = +process.env.THROTTLE || 1;
if (throttle > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: throttle });
await page.addInitScript(() => {
  const P = window.__prof = { gaps: [], long: [], log: [] };
  let last = performance.now();
  const beat = () => { const t = performance.now(); if (t - last > 50) P.gaps.push([Math.round(last), Math.round(t - last)]); last = t; };
  const raf = () => { beat(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf); setInterval(beat, 16);
  // first world pixel: the black fade starts to clear (#fade.clear); playable: game.ready
  const iv = setInterval(() => {
    if (!P.firstPixel && document.getElementById('fade')?.classList.contains('clear')) P.firstPixel = Math.round(performance.now());
    if (window.game?.ready && !P.ready) P.ready = Math.round(performance.now());
    if (window.game?.complete || (window.game?.ready && !window.game.finish)) { P.complete = Math.round(performance.now()); clearInterval(iv); } // older builds: ready = complete
  }, 10);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* WebKit */ }
  const info = console.info.bind(console);
  console.info = (...a) => { P.log.push([Math.round(performance.now()), a.join(' ')]); info(...a); };
});
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
let P;
for (let attempt = 1; ; attempt++) try { // Vite reloads the page when files change: retry
await page.goto(`http://127.0.0.1:${port}/?${query}`, { waitUntil: 'domcontentloaded' });
const t0 = Date.now();
if (shots) for (const s of [1, 2, 4, 8]) {
  await page.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  if (await page.evaluate(() => window.game?.ready)) break;
  await page.screenshot({ path: `${shots}-${s}s.png` }).catch(() => {});
}
await page.waitForFunction(() => window.game?.complete || (window.game?.ready && !window.game.finish), null, { timeout: 300000, polling: 200 });
await page.waitForTimeout(2600);
if (shots) await page.screenshot({ path: `${shots}-ready.png` });
P = await page.evaluate(() => ({ ...window.__prof, marks: window.loadMarks || {} }));
break;
} catch (e) { if (attempt >= 4) throw e; console.log('retry: ' + e.message.split('\n')[0]); }
console.log(`${kind} ${query || '(default)'}`);
console.log(`first world pixel ${P.firstPixel} ms · playable ${P.ready} ms · complete ${P.complete} ms${throttle > 1 ? ` · CPU ×${throttle}` : ''} · marks ${JSON.stringify(P.marks)}`);
for (const [t, s] of P.log) if (/nature|warm|forest|ground|grass|stage|homestead|complete/.test(s)) console.log(`  ${String(t).padStart(6)}  ${s}`);
for (const [name, a, b] of [['to playable', 0, P.ready], ['in play to complete', P.ready, P.complete], ['first 2.5 s after complete', P.complete, P.complete + 2500]]) {
  const gaps = P.gaps.filter(([t]) => t >= a && t < b);
  console.log(`gaps >50ms ${name}: ${gaps.length}, longest ${Math.max(0, ...gaps.map((g) => g[1]))} ms, total ${gaps.reduce((s, g) => s + g[1], 0)} ms`);
  if (gaps.length) console.log('  ' + gaps.sort((x, y) => y[1] - x[1]).slice(0, 25).map(([t, d]) => `${d}@${t}`).join(' '));
}
P.long = P.long.filter(([t]) => t < P.complete);
if (P.long.length) console.log(`longtasks: ${P.long.length}, longest ${Math.max(...P.long.map((g) => g[1]))} ms: ` + P.long.sort((a, b) => b[1] - a[1]).slice(0, 15).map(([t, d]) => `${d}@${t}`).join(' '));
for (const l of errs.slice(0, 8)) console.log('  ! ' + l);
await browser.close();
