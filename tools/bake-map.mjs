// Draws the journal's map base (docs/ui.md), public/assets/ui/journal/map.webp: the alaas from straight above as a
// drawn map, from the game's own terrain functions (relief shading and contour lines, the lake, the taiga, the
// trodden paths), north up. Its extent goes to src/data/journal.json; the journal lays buildings and markers over
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

const url = await page.evaluate(({ size, cx, cz, half }) => {
  const T = window.game.world.terrain;
  const G = size / 2 + 1, cell = 2 * half / (G - 1); // a grid at half the picture's resolution
  const hgt = new Float32Array(G * G), wat = new Float32Array(G * G), forest = new Float32Array(G * G), path = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = cx - half + i * cell, z = cz - half + j * cell, h = T.height(x, z), k = j * G + i;
    hgt[k] = h;
    const w = T.water(x, z, h);
    wat[k] = w === null ? 0 : w - h;
    forest[k] = T.forest(x, z);
    path[k] = T.splat(x, z, h)[2];
  }
  const at = (a, u, v) => { // bilinear
    const x = Math.min(G - 1.001, Math.max(0, u)), y = Math.min(G - 1.001, Math.max(0, v)), i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * G + i;
    return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + G] * (1 - fx) + a[k + G + 1] * fx) * fy;
  };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const mix = (a, b, t) => a + (b - a) * t, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const px = 2 * half / size; // m per pixel
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / 2, v = y / 2;
    const h = at(hgt, u, v), w = at(wat, u, v), f = at(forest, u, v), p = at(path, u, v);
    const dx = (at(hgt, u + 1, v) - at(hgt, u - 1, v)) / (2 * cell), dz = (at(hgt, u, v + 1) - at(hgt, u, v - 1)) / (2 * cell);
    const shade = Math.min(1.25, Math.max(0.6, 1 + (-dx - dz) * 2.2)); // lit from the north-west
    // the meadow: pale warm green, drier and paler up the slope
    const up = sm(91.5, 100, h);
    let r = mix(176, 196, up), g = mix(196, 201, up), b = mix(128, 140, up);
    // trodden earth
    const pk = sm(0.45, 0.75, p) * 0.75;
    r = mix(r, 214, pk); g = mix(g, 196, pk); b = mix(b, 158, pk);
    // taiga: darker, with the grain of tree crowns
    if (f > 0.02) {
      const wx = x * px, wz = y * px, crown = hash(Math.floor(wx / 3.2), Math.floor(wz / 3.2));
      const cxn = (wx / 3.2) % 1 - 0.5, czn = (wz / 3.2) % 1 - 0.5, dot = crown < f * 0.9 && cxn * cxn + czn * czn < 0.16 ? 1 : 0;
      const t = sm(0.05, 0.6, f);
      r = mix(r, 96 - dot * 26, t); g = mix(g, 128 - dot * 26, t); b = mix(b, 92 - dot * 22, t);
    }
    r *= shade; g *= shade; b *= shade;
    // contour lines every metre (every fifth stronger), thinning out where the ground is level
    const grad = Math.hypot(dx, dz) * px;
    if (grad > 0.004 && w <= 0) {
      const fr = Math.abs(((h % 1) + 1) % 1 - 0.5), dist = (0.5 - fr) / grad; // px from the nearest line
      const major = Math.abs(Math.round(h) % 5) === 0;
      const a = Math.max(0, 1 - dist / (major ? 1.1 : 0.7)) * (major ? 0.34 : 0.2);
      r = mix(r, 92, a); g = mix(g, 84, a); b = mix(b, 56, a);
    }
    // the lake: a pale shallows, deeper blue outward, a bright shoreline
    if (w > 0) {
      const deep = sm(0, 1.6, w);
      r = mix(170, 96, deep); g = mix(210, 160, deep); b = mix(232, 214, deep);
      const edge = 1 - sm(0, 0.06, w);
      r = mix(r, 250, edge); g = mix(g, 252, edge); b = mix(b, 255, edge);
    } else if (w > -0.25 && at(wat, u, v) === 0 && h < 90.6 + 0.35) { r = mix(r, 224, 0.5); g = mix(g, 214, 0.5); b = mix(b, 176, 0.5); } // the wet shore
    // towards the picture's edge the map sinks into the frame's dark glass
    const e = Math.max(Math.abs(x / size - 0.5), Math.abs(y / size - 0.5)) * 2, vg = sm(0.9, 1, e);
    r = mix(r, 22, vg); g = mix(g, 44, vg); b = mix(b, 68, vg);
    const k = (y * size + x) * 4;
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
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
