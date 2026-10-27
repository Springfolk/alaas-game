// Renders the link-preview image public/og.jpg (1200×630, Open Graph / Twitter card): the loading key art
// (tools/key-art.mjs), the icon, «Алаас», the README's Sakha line and a play call-to-action. node tools/og-image.mjs — headless system Chrome; no dev server.
import { mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const root = new URL('..', import.meta.url);
const at = (p) => new URL(p, root).pathname;
const url = (p) => new URL(p, root).href;
const out = at('public/og.jpg');

const html = `<!doctype html><link rel="stylesheet" href="${url('public/assets/ui/fonts.css')}"><style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; position: relative; background: #2b2a22 url(${url('public/assets/ui/keyart-1920.webp')}) -50px -70px / 1300px auto no-repeat; }
  body::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(22,16,10,.1), rgba(22,16,10,.1) 40%, rgba(22,16,10,.82) 100%); }
  img { position: absolute; left: 72px; top: 360px; width: 150px; height: 150px; filter: drop-shadow(0 3px 10px rgba(0,0,0,.45)); }
  h1 { position: absolute; left: 252px; top: 372px; margin: 0; font: 600 108px/1 'Noto Serif', serif; color: #f3ead6; text-shadow: 0 2px 14px rgba(0,0,0,.5); }
  p { position: absolute; left: 256px; top: 500px; margin: 0; font: 400 34px/1.3 'Noto Serif', serif; color: #efe6d2; text-shadow: 0 1px 8px rgba(0,0,0,.6); }
  b { position: absolute; right: 72px; top: 404px; padding: 14px 30px; border-radius: 999px; font: 700 30px/1 'Open Sans', sans-serif; color: #21160f; background: #f3ead6; box-shadow: 0 4px 16px rgba(0,0,0,.4); }
</style>
<img src="${url('docs/img/icon.svg')}"><h1>Алаас</h1><p>Киин Саха сирин алааһыгар сайылык</p><b>Play free in your browser ▸</b>`;

const tmp = mkdtempSync(join(tmpdir(), 'og-image-'));
const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
writeFileSync(join(tmp, 'page.html'), html);
await page.goto('file://' + join(tmp, 'page.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
await page.screenshot({ path: out, type: 'jpeg', quality: 86 });
await browser.close();
rmSync(tmp, { recursive: true });
console.log(`og.jpg ${(statSync(out).size / 1e3).toFixed(0)} kB`);
