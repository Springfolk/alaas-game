// Draws the journal's map base (docs/ui.md), public/assets/ui/journal/map.webp, with src/ui/mapdraw.js (the
// journal draws its close tiles with the same), north up. Its extent goes to src/data/journal.json; the journal lays buildings and markers over
// it itself. npm run bake-map — needs the dev server (PORT) and `cwebp`. Rerun after changing the terrain.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, PORT as port } from './browser.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const MAP = { size: 2048, cx: 0, cz: -10, half: 410 }; // px; the world square it covers: centre and half-side, m
const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
page.on('pageerror', (e) => console.warn('pageerror:', e.message));
await page.goto(`http://127.0.0.1:${port}/?auto&notouch&q=low`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.world?.terrain && window.game.complete, null, { timeout: 600000, polling: 500 });

const url = await page.evaluate(async (M) => {
  const { drawMap } = await import('/src/ui/mapdraw.js'); // (the journal draws its close tiles with it too)
  const c = document.createElement('canvas');
  c.width = c.height = M.size;
  const img = new ImageData(drawMap(window.game.world.terrain, M.cx - M.half, M.cz - M.half, 2 * M.half, M.size, M), M.size);
  c.getContext('2d').putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}, MAP);
await browser.close();

const tmp = mkdtempSync(join(tmpdir(), 'map-'));
const png = join(tmp, 'map.png');
writeFileSync(png, Buffer.from(url.split(',')[1], 'base64'));
execFileSync('cwebp', ['-quiet', '-q', '84', '-m', '6', png, '-o', join(ROOT, 'public/assets/ui/journal/map.webp')]);
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(ROOT, 'src/data/journal.json'), JSON.stringify({ map: MAP }) + '\n');
console.log(`map: ${MAP.size} px for ${2 * MAP.half} m`);
