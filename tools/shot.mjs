// Headless screenshot through system Chrome (never takes the screen).
// node tools/shot.mjs "<path?query>" out.png [width] [height] [extraWaitMs]
// Needs `npm run dev` running. Waits for window.ready (viewer) or game.complete (game), then for extraWaitMs.
// EVAL = JS run in the page then (SCRIPT = a file of it); its console warnings and errors print.
import { launch, PORT as port } from './browser.mjs';
const [path = '/', out = 'shot.png', w = 1280, h = 720, wait = 1500] = process.argv.slice(2);
const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +process.env.DPR || 1 });
const logs = [];
page.on('console', (m) => { const l = `${m.type()}: ${m.text()}`; if (['error', 'warning'].includes(m.type()) && !logs.includes(l)) logs.push(l); }); // each line once
page.on('pageerror', (e) => logs.push('pageerror: ' + (process.env.STACK ? e.stack : e.message)));
await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'domcontentloaded' });
try {
  // the game: once the world is complete (every shader built; older builds: ready)
  await page.waitForFunction(() => window.ready || (window.game?.complete && (!window.game.sharpening || window.game.sharp)) || (window.game?.ready && !window.game.finish), null, { timeout: 300000 }); // sharp: textures at the tier size
} catch { logs.push('timeout waiting for ready'); }
const script = process.env.SCRIPT ? (await import('node:fs')).readFileSync(process.env.SCRIPT, 'utf8') : process.env.EVAL;
if (script) await page.evaluate(script).catch((e) => logs.push("eval: " + e.message));
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const backend = await page.evaluate(() => (window.viewer || window.game)?.engine?.backend).catch(() => null);
console.log(`saved ${out} · backend ${backend}`);
for (const l of logs.slice(0, 30)) console.log(l);
await browser.close();
