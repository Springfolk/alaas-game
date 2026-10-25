// Converts every .jpg/.png under public/assets/tex to .webp (normal maps at higher quality) and
// deletes the source. Run after fetch-assets or any texture generator. Needs `cwebp` (brew install webp).
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../public/assets/tex/', import.meta.url).pathname;
let before = 0, after = 0;
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!/\.(jpe?g|png)$/i.test(f)) return;
  const out = p.replace(/\.(jpe?g|png)$/i, '.webp');
  const q = /^nor/.test(f) ? '92' : '84';
  execFileSync('cwebp', ['-quiet', '-q', q, '-mt', '-exact', p, '-o', out]);
  before += statSync(p).size; after += statSync(out).size;
  unlinkSync(p);
});
walk(root);
console.log(`webp: ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
