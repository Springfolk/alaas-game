// Bakes the yard's procedural texture sets (src/models/yardlife/textures.js) to
// public/assets/tex/canvas_<name>/{diff,nor,arm}.webp, so the game fetches them instead of painting
// them at load. Rows are written bottom-up: the loader decodes images flipped (materials.js).
// Usage: node tools/bake-canvas-tex.mjs [name ...] (all sets by default; needs `cwebp`: brew install webp)
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { CANVAS_SETS, paintCanvasSet } from '../src/models/yardlife/textures.js';

function png(w, h, rgba) { // minimal RGBA PNG, rows reversed
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h), src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++) src.copy(raw, y * (w * 4 + 1) + 1, (h - 1 - y) * w * 4, (h - y) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const only = process.argv.slice(2);
for (const name of CANVAS_SETS.filter((n) => !only.length || only.includes(n))) {
  const dir = new URL(`../public/assets/tex/canvas_${name}/`, import.meta.url).pathname;
  await mkdir(dir, { recursive: true });
  const set = paintCanvasSet(name);
  for (const map of ['diff', 'nor', 'arm']) {
    const { data, width, height } = set[map].image, p = `${dir}${map}.png`;
    await writeFile(p, png(width, height, data));
    execFileSync('cwebp', ['-quiet', ...(map === 'nor' ? ['-lossless'] : ['-q', '88']), '-exact', p, '-o', `${dir}${map}.webp`]); // normals: lossless (fine detail)
    await unlink(p);
  }
  console.log(`canvas_${name}: ${set.diff.image.width}×${set.diff.image.height}`);
}
