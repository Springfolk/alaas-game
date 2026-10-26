// Renders the loading screen's key art from the game itself and encodes it (docs/loading.md):
// public/assets/ui/keyart-{1920,960,phone}.{avif,webp} and the inline blurred placeholder in index.html.
// npm run key-art — needs the dev server (PORT; `/src` imports), `cwebp`, `avifenc` and `ffmpeg`. Rerun after changing
// a model, the light or the sun (the shot uses the game's own sun, so the cross-fade into play matches).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, PORT as port } from './browser.mjs';

// over the lake's north shore, looking north up the path to the urasa and the forest ring (?cam=x,y,z,yaw°,pitch°,fov°)
// rendered at 2× the largest output and scaled down (supersampling)
const SHOTS = [
  { name: 'wide', cam: '0,99,0,13,-5,30', w: 3840, h: 2160 },  // 16:9; the urasa on the right third, clear of the title
  { name: 'phone', cam: '0,99,0,2,-3.5,46', w: 1920, h: 3200 }, // portrait 3:5
];
const OUT = new URL('../public/assets/ui/', import.meta.url).pathname;
const HTML = new URL('../index.html', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'keyart-'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

const browser = await launch('chrome');
const shoot = async (s) => {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h } });
  page.on('pageerror', (e) => console.warn('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.warn('console:', m.text()); });
  try {
    // ?keyart (src/util.js): high tier maxed, no LOD/impostors/size culling, fixed full resolution
    await page.goto(`http://127.0.0.1:${port}/?auto&keyart&cam=${s.cam}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.complete, null, { timeout: 600000, polling: 500 });
    await page.addStyleTag({ content: '#hints, #dot, #prompt, #toasts, #title, #fps, #keyart { display: none !important; }' }); // no HUD
    const t0 = Date.now();
    await page.evaluate(async () => { // every texture at full size, then ≥150 frames and ≥5 s: exposure settles
      await (await import('/src/engine/materials.js')).texturesLoaded();
      const t = performance.now();
      for (let n = 0; n < 150 || performance.now() - t < 5000; n++) await new Promise((r) => requestAnimationFrame(r));
    });
    console.log(`${s.name}: settled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    await page.screenshot({ path: join(tmp, `${s.name}.png`), timeout: 120000 });
  } finally { await page.close(); }
};
for (const s of SHOTS) {
  for (let tries = 3; ; ) {
    try { await shoot(s); break; } catch (e) { // e.g. a dev-server reload mid-shot (a file changed)
      if (--tries === 0) throw e;
      console.warn(`${s.name}: ${e.message.split('\n')[0]} — retrying`);
    }
  }
}
await browser.close();

// scale (lanczos) → AVIF + WebP; sizes: desktop ≤ ~250 kB, phone ≤ ~80 kB
const encode = (src, out, w, h, { avif, webp }) => {
  const png = join(tmp, `${out}.png`);
  run('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, `${src}.png`), '-vf', `scale=${w}:${h}:flags=lanczos`, png]);
  run('avifenc', ['-q', String(avif), '-s', '4', '-y', '420', png, join(OUT, `${out}.avif`)]);
  run('cwebp', ['-quiet', '-q', String(webp), '-m', '6', '-sharp_yuv', png, '-o', join(OUT, `${out}.webp`)]);
  for (const ext of ['avif', 'webp']) console.log(`${out}.${ext}  ${(statSync(join(OUT, `${out}.${ext}`)).size / 1024).toFixed(0)} kB`);
};
encode('wide', 'keyart-1920', 1920, 1080, { avif: 66, webp: 84 });
encode('wide', 'keyart-960', 960, 540, { avif: 62, webp: 80 });
encode('phone', 'keyart-phone', 960, 1600, { avif: 60, webp: 78 });

// the placeholder: 48×27, blurred, inlined as the layer's background (first paint before any request)
const lqip = join(tmp, 'lqip.webp');
run('ffmpeg', ['-v', 'error', '-y', '-i', join(tmp, 'wide.png'), '-vf', 'scale=48:27:flags=area,gblur=sigma=0.7', join(tmp, 'lqip.png')]);
run('cwebp', ['-quiet', '-q', '60', join(tmp, 'lqip.png'), '-o', lqip]);
const uri = 'data:image/webp;base64,' + readFileSync(lqip).toString('base64');
const html = readFileSync(HTML, 'utf8');
const next = html.replace(/(\/\* keyart-lqip \*\/ url\()[^)]*\)/, `$1${uri})`);
if (next === html && !html.includes(uri)) console.warn('index.html: no `/* keyart-lqip */ url(…)` marker found');
writeFileSync(HTML, next);
console.log(`placeholder ${uri.length} bytes inline`);
rmSync(tmp, { recursive: true });
