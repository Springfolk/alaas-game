// Bakes traced ornament (tools/object-traces.mjs, docs/patterns.md) in headless system Chrome (canvas Path2D);
// needs `cwebp`. Outputs:
//   carving/chorons.webp       carved-ornament masks of turned vessels, one channel per vessel, 1 = cut away;
//                              u once round the vessel in the lathe's direction (geom.js `lathe`), v = height /
//                              total height (0 at the base, image bottom)
//   canvas_bowplate/{diff,nor,arm}.webp  the engraved front saddle bow (yardlife `bowplate`): planar metres / 0.34,
//                              u = 0 on the bow's axis (wraps), v = 0 at its base
// Usage: node tools/make-carving.mjs
import { chromium } from 'playwright-core';
import { CHROME } from './browser.mjs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { CHORON_A, CHORON_B, SADDLE_BOW } from './object-traces.mjs';

const W = 2048, H = 1024;
const CHANNELS = [CHORON_A, CHORON_B, null]; // r: goblet chorons, g: three-legged choron

function paint({ W, H, objs }) {
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'), od = og.createImageData(W, H);
  objs.forEach((o, ch) => {
    if (!o) return;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round';
    const Y = (cm) => H * (1 - cm / o.height); // image row of a height
    // the traced side reads left to right as seen from outside; the lathe's u runs the other way: mirror at the end
    for (const b of o.bands) {
      const sx = W / b.n / b.w, y0 = Y(b.y0), sy = (Y(b.y1) - y0) / b.h;
      for (let k = -1; k <= b.n; k++) {
        g.save(); g.translate(k * W / b.n, y0); g.scale(sx, sy);
        if (b.d) g.fill(new Path2D(b.d));
        for (const s of b.strokes || []) { g.lineWidth = s.w; g.stroke(new Path2D(s.d)); }
        g.restore();
      }
    }
    for (const s of o.singles || []) {
      // a single motif, its axis over lathe angle `legAngle` (over the front leg, as on the photo)
      const at = W * (1 - (o.legAngle ?? 0) / (2 * Math.PI)), y0 = Y(s.y0), sy = (Y(s.y1) - y0) / s.h;
      const x0 = at + (s.deg0 - s.axis) / 360 * W, sx = (s.deg1 - s.deg0) / 360 * W / s.w;
      for (const dx of [-W, 0, W]) { g.save(); g.translate(x0 + dx, y0); g.scale(sx, sy); g.fill(new Path2D(s.d)); g.restore(); }
    }
    for (const [cm, w] of o.grooves || []) { const y = Y(cm); g.fillRect(0, y - (w / o.height * H) / 2, W, w / o.height * H); }
    // mirror into the lathe's direction
    const d = g.getImageData(0, 0, W, H).data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) od.data[(y * W + x) * 4 + ch] = d[(y * W + (W - 1 - x)) * 4];
  });
  for (let i = 3; i < od.data.length; i += 4) od.data[i] = 255;
  og.putImageData(od, 0, 0);
  return out.toDataURL('image/png');
}

// the bow plate: engraved lines (dark, 0.6 mm deep in the normal map) on silver sheet, like canvas_silver
function bowplate({ B, S, N }) {
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = '#fff';
  const kx = B.k / S * N; // drawing px → texture px
  for (const dx of [0, N]) { g.setTransform(kx, 0, 0, kx, dx - B.C * kx, N - B.bot * kx); g.fill(new Path2D(B.d)); }
  const l = g.getImageData(0, 0, N, N).data, L = (x, y) => l[(((y + N) % N) * N + ((x + N) % N)) * 4] / 255;
  const im = (f) => { const o = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const p = f(x, y), i = (y * N + x) * 4; o.data[i] = p[0]; o.data[i + 1] = p[1]; o.data[i + 2] = p[2]; o.data[i + 3] = 255; } g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(o, 0, 0); return c.toDataURL('image/png'); };
  const diff = im((x, y) => { const v = Math.round((0.86 - L(x, y) * 0.72) * 255); return [v, Math.round(v * 0.985), Math.round(v * 0.96)]; });
  const nor = im((x, y) => { // height −0.6 per line, image rows top-down (v up)
    const hx = (L(x + 1, y) - L(x - 1, y)) * -0.6, hy = (L(x, y - 1) - L(x, y + 1)) * -0.6;
    const nx = -hx * 1.5, ny = hy * 1.5, len = Math.hypot(nx, ny, 1);
    return [(nx / len * 0.5 + 0.5) * 255, (ny / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255].map(Math.round);
  });
  const arm = im((x, y) => [255, Math.round((0.3 + L(x, y) * 0.45) * 255), 0]);
  return { diff, nor, arm };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const url = await page.evaluate(paint, { W, H, objs: CHANNELS });
const bp = await page.evaluate(bowplate, { B: SADDLE_BOW, S: 0.34, N: 1024 });
await browser.close();
const bdir = new URL('../public/assets/tex/canvas_bowplate/', import.meta.url).pathname;
await mkdir(bdir, { recursive: true });
for (const [m, u] of Object.entries(bp)) {
  await writeFile(`${bdir}${m}.png`, Buffer.from(u.split(',')[1], 'base64'));
  execFileSync('cwebp', ['-quiet', ...(m === 'nor' ? ['-lossless'] : ['-q', '88']), '-exact', `${bdir}${m}.png`, '-o', `${bdir}${m}.webp`]);
  await unlink(`${bdir}${m}.png`);
}
console.log('✓ canvas_bowplate');
const dir = new URL('../public/assets/tex/carving/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}chorons.png`, Buffer.from(url.split(',')[1], 'base64'));
execFileSync('cwebp', ['-quiet', '-lossless', '-exact', `${dir}chorons.png`, '-o', `${dir}chorons.webp`]);
await unlink(`${dir}chorons.png`);
console.log('✓ carving/chorons.webp');
