// Bakes the impostor atlases offline, so the game loads them instead of building a one-off bake shader per
// source material at every load (src/load/atlas.js). Runs the game's own load-time bake (`?bakeimpostors`)
// in headless Chrome, reads the targets back and writes public/assets/impostors/<name>-{albedo,normal}.webp
// (colour lossy at high quality, alpha lossless) + meta.json (the layout key each atlas was baked for). Rerun after changing a model or a bake.
// node tools/bake-impostors.mjs — needs the dev server (PORT) and `cwebp` (brew install webp).
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { deflateSync, crc32 } from 'node:zlib';
import { launch, PORT as port } from './browser.mjs';

const out = new URL('../public/assets/impostors/', import.meta.url).pathname;
// RGBA8 rows (top first) → PNG
const png = (w, h, rgba) => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
};

const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('! ' + e.message));
await page.goto(`http://127.0.0.1:${port}/?auto&bakeimpostors`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.complete && window.__atlases, null, { timeout: 300000 });
const names = await page.evaluate(() => Object.keys(window.__atlases));
const metaPath = out + 'meta.json', meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
for (const name of names) {
  const res = await page.evaluate(async (name) => {
    const a = window.__atlases[name], r = window.game.engine.renderer;
    await a.done;
    const read = async (rt) => {
      const px = await r.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height);
      let s = ''; const b = new Uint8Array(px.buffer, px.byteOffset, px.byteLength);
      for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return { key: a.key, w: a.rtA.width, h: a.rtA.height, albedo: await read(a.rtA), normal: await read(a.rtN) };
  }, name);
  for (const kind of ['albedo', 'normal']) {
    const p = `${out}${name}-${kind}`;
    writeFileSync(p + '.png', png(res.w, res.h, Buffer.from(res[kind], 'base64')));
    // lossy colour at high quality (far billboards), alpha (the cut-out) lossless
    execFileSync('cwebp', ['-quiet', '-q', kind === 'normal' ? '95' : '92', '-alpha_q', '100', '-exact', '-m', '6', '-sharp_yuv', p + '.png', '-o', p + '.webp']);
    unlinkSync(p + '.png');
  }
  meta[name] = { key: res.key, width: res.w, height: res.h };
  console.log(`${name}: ${res.w}×${res.h}, key ${res.key}`);
}
writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
await browser.close();
