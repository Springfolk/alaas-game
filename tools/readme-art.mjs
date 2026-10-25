// Renders the README art from docs/img/icon.svg (tools/make-icon.mjs) and the loading key art (tools/key-art.mjs):
// public/icon.svg (copy), docs/img/icon-256.png, public/apple-touch-icon.png (180, on the dark rim colour) and
// docs/img/banner.webp (1600×500: key art, icon, «Алаас» in the self-hosted Noto Serif).
// node tools/readme-art.mjs — headless system Chrome (CHROME), `cwebp`; no dev server.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const root = new URL('..', import.meta.url);
const at = (p) => new URL(p, root).pathname;
const url = (p) => new URL(p, root).href;
const DARK = '#21160f'; // the icon's rim
const tmp = mkdtempSync(join(tmpdir(), 'readme-art-'));
copyFileSync(at('docs/img/icon.svg'), at('public/icon.svg'));

const browser = await launch('chrome');
const render = async (html, w, h, scale, out, omitBackground = false) => {
  const file = join(tmp, 'page.html');
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.goto('file://' + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, omitBackground });
  await page.close();
};
const icon = (size, bg) => `<!doctype html><body style="margin:0;background:${bg}">
  <img src="${url('docs/img/icon.svg')}" style="display:block;width:${size}px;height:${size}px">`;
await render(icon(256, 'transparent'), 256, 256, 1, at('docs/img/icon-256.png'), true);
await render(icon(180, DARK), 180, 180, 1, at('public/apple-touch-icon.png'));

// banner at 800×250 CSS px, 2× device pixels
const banner = `<!doctype html><link rel="stylesheet" href="${url('public/assets/ui/fonts.css')}">
<style>
  body { margin: 0; width: 800px; height: 250px; overflow: hidden; position: relative; background: #2b2a22 url(${url('public/assets/ui/keyart-1920.webp')}) 0 -62px / 800px auto no-repeat; }
  body::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(22,16,10,.78), rgba(22,16,10,.45) 40%, rgba(22,16,10,0) 64%), linear-gradient(180deg, rgba(22,16,10,.35), rgba(22,16,10,0) 45%); }
  img { position: absolute; left: 48px; top: 72px; width: 106px; height: 106px; filter: drop-shadow(0 3px 8px rgba(0,0,0,.45)); }
  h1 { position: absolute; left: 178px; top: 50%; transform: translateY(-54%); margin: 0; font: 600 84px/1 'Noto Serif', serif; color: #f3ead6; text-shadow: 0 2px 10px rgba(0,0,0,.45); }
</style>
<img src="${url('docs/img/icon.svg')}"><h1>Алаас</h1>`;
const png = join(tmp, 'banner.png');
await render(banner, 800, 250, 2, png);
await browser.close();
for (const q of [86, 80, 74, 68, 60]) { // the largest quality under 200 kB
  execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', png, '-o', at('docs/img/banner.webp')]);
  if (statSync(at('docs/img/banner.webp')).size <= 200e3) break;
}
console.log(`banner.webp ${(statSync(at('docs/img/banner.webp')).size / 1e3).toFixed(0)} kB · icon-256.png · apple-touch-icon.png · public/icon.svg`);
rmSync(tmp, { recursive: true });
