// Where a frame's JS goes: the Chrome CPU profiler over a few seconds of play at a spot, self time by function
// (and by file). Needs `npm run dev` (PORT). node tools/jsprof.mjs "<query>" [x,z,yaw] [seconds]
import { launch, PORT } from './browser.mjs';
const [query = 'webgl&q=mobile', at = '8,-204,2.6', secs = 4] = process.argv.slice(2);
const browser = await launch('chrome', { uncapped: true });
const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.goto(`http://127.0.0.1:${PORT}/?auto&${query}`);
await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 300000 });
await page.evaluate(async (at) => { const [x, z, yaw] = at.split(',').map(Number); const e = window.game.engine; e.pace = () => true; e.dynamicResolution = () => {}; window.game.player.place(x, z, yaw); await new Promise((ok) => setTimeout(ok, 2000)); }, at);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
const f0 = await page.evaluate(() => window.game.engine.renderer.info.frame);
await cdp.send('Profiler.start');
await page.waitForTimeout(secs * 1000);
const { profile } = await cdp.send('Profiler.stop');
const frames = (await page.evaluate(() => window.game.engine.renderer.info.frame)) - f0;
const dt = profile.timeDeltas.reduce((s, x) => s + x, 0) / 1000, byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map(), counts = new Map();
for (let i = 0; i < profile.samples.length; i++) counts.set(profile.samples[i], (counts.get(profile.samples[i]) || 0) + (profile.timeDeltas[i] || 0) / 1000);
const fn = new Map(), file = new Map();
for (const [id, ms] of counts) {
  const c = byId.get(id).callFrame, f = (c.url.split('/').pop() || '(native)').split('?')[0];
  const k = `${c.functionName || '(anon)'} ${f}:${c.lineNumber + 1}`;
  fn.set(k, (fn.get(k) || 0) + ms); file.set(f, (file.get(f) || 0) + ms); self.set(id, ms);
}
const per = (ms) => (ms / frames).toFixed(3);
console.log(`${frames} frames in ${dt.toFixed(0)} ms profiled · ms per frame by file:`);
for (const [k, ms] of [...file].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${per(ms).padStart(7)}  ${k}`);
console.log('by function (self):');
for (const [k, ms] of [...fn].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${per(ms).padStart(7)}  ${k}`);
await browser.close();
