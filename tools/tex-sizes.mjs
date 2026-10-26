// Texture sizes: every image under public/assets/tex also ships at 1024/512/256 on its long edge (`diff@512.webp`
// beside `diff.webp`) and src/data/tex-sizes.json lists each image's full edge, so a tier loads only the size it
// draws (src/load/texsize.js) and every load starts at 256 (src/engine/materials.js). Poly Haven sets
// (fetch-assets.mjs) are encoded from their original JPGs, cached in .cache/tex-src/ (fetched when missing);
// other images (generated, ambientCG) keep their file and get variants from it. Needs `cwebp` and `ffmpeg`.
// Usage: node tools/tex-sizes.mjs   (rerun after fetch-assets, webp.mjs or a texture generator)
import { readdirSync, statSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { TEXTURES, MAPS } from './fetch-assets.mjs';

export const SIZES = [1024, 512, 256];
const root = new URL('../public/assets/tex/', import.meta.url).pathname;
const cache = new URL('../.cache/tex-src/', import.meta.url).pathname;
const out = new URL('../src/data/tex-sizes.json', import.meta.url).pathname;
// lossy, tuned by SSIM against the originals: normals keep more (shading shows their blocks), the rest q80
const quality = (name) => (/^nor/.test(name) ? 88 : 80);
const encode = (src, dst, q, size) => execFileSync('cwebp', ['-quiet', '-q', String(q), '-m', '6', '-mt', '-exact', ...(size ? ['-resize', ...size] : []), src, '-o', dst]);
const dims = (p) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim().split(',').map(Number);

async function original(id, name) {
  const res = TEXTURES[id], dir = join(cache, id), jpg = join(dir, `${name}.jpg`), png = join(dir, `${name}.png`);
  if (!existsSync(png)) {
    mkdirSync(dir, { recursive: true });
    const r = await fetch(`https://dl.polyhaven.org/file/ph-assets/Textures/jpg/${res}/${id}/${id}_${MAPS[name]}_${res}.jpg`);
    if (!r.ok) throw new Error(`${id} ${name}: ${r.status}`);
    writeFileSync(jpg, Buffer.from(await r.arrayBuffer()));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', jpg, png]); // cwebp reads the PNG losslessly
    unlinkSync(jpg);
  }
  return png;
}

const manifest = {};
let before = 0, after = 0;
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(root).filter((p) => /\.webp$/.test(p));
for (const p of files) if (/@\d+\.webp$/.test(p)) { before += statSync(p).size; unlinkSync(p); } // old variants
for (const p of files.filter((f) => !/@\d+\.webp$/.test(f))) {
  const rel = relative(root, p), [id, file] = rel.split('/'), name = file?.replace('.webp', '');
  before += statSync(p).size;
  const ph = TEXTURES[id] && MAPS[name];
  const src = ph ? await original(id, name) : p;
  if (ph) encode(src, p, quality(name));
  const [w, h] = dims(p), full = Math.max(w, h);
  manifest[rel] = full;
  after += statSync(p).size;
  for (const s of SIZES) if (s < full) {
    const k = s / full, v = p.replace(/\.webp$/, `@${s}.webp`);
    encode(src, v, quality(name), [String(Math.round(w * k)), String(Math.round(h * k))]);
    after += statSync(v).size;
  }
}
writeFileSync(out, JSON.stringify(manifest, Object.keys(manifest).sort()) + '\n');
console.log(`tex-sizes: ${Object.keys(manifest).length} images, ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB with variants`);
