// Bakes the generated geometry (src/load/geocache.js) so the game loads it instead of building it at every load:
// runs the game in headless Chrome with `?bakegeo` (per tier, for the tier-sized ground grid), collects the
// recorded packs, deflates them into public/assets/geo/*.bin and writes manifest.json (each pack's source key).
// Then checks the bake: builds the world from the packs and generated (`?nogeo`) and compares every model
// (scene graph, geometry, colliders, interactables) and the worker jobs' results. Rerun after changing a model,
// a generator or the terrain (`npm run build` and the dev server warn when the bake is stale).
// node tools/bake-geometry.mjs — needs the dev server (PORT).
import { writeFileSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { launch, PORT as port } from './browser.mjs';
import { geoKeys } from './geo-keys.mjs';

const out = new URL('../public/assets/geo/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await launch('chrome');

async function run(query, fn, arg) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const warns = [];
  page.on('pageerror', (e) => warns.push('! ' + e.message));
  page.on('console', (m) => { if (/geo /.test(m.text()) || m.type() === 'error') warns.push(m.text()); });
  for (let attempt = 1; ; attempt++) try { // Vite reloads the page when files change: retry
    await page.goto(`http://127.0.0.1:${port}/?auto&${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.game?.complete, null, { timeout: 300000, polling: 250 });
    break;
  } catch (e) { if (attempt >= 3) throw e; console.log('retry: ' + e.message.split('\n')[0]); }
  const r = await fn(page, arg);
  await page.close();
  return { r, warns };
}

// ---------- bake (CHECK=only: just the check) ----------
const packs = {}, failed = {};
if (process.env.CHECK !== 'only') {
for (const q of ['', 'q=low', 'q=mobile']) {
  const { r, warns } = await run(`bakegeo${q ? '&' + q : ''}`, async (page) => {
    const ids = await page.evaluate(() => Object.keys(window.__geo?.packs || {}));
    const got = {};
    for (const id of ids) got[id] = await page.evaluate((id) => {
      const p = window.__geo.packs[id], b = p.bytes;
      let s = '';
      if (b) for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
      return { group: p.group, key: p.key, lazy: p.lazy, empty: p.empty, b64: b ? btoa(s) : null };
    }, id);
    return { got, failed: await page.evaluate(() => window.__geo?.failed || {}) };
  });
  for (const w of warns) console.log('  ' + w);
  Object.assign(failed, r.failed);
  for (const [id, p] of Object.entries(r.got)) if (!packs[id] && (!q || p.group === 'jobs')) packs[id] = p;
  console.log(`baked ${q || 'default tier'}: ${Object.keys(r.got).length} scopes`);
}

// not shipped (main-thread time saved per MB too small, or off the main thread anyway): an empty entry
// tells the game to generate them without a warning
const SKIP = (id, p) => p.group === 'forest' || /^job:(field|mask|scatter)#/.test(id);
const file = (id) => id.replace(/^model:/, '').replace(/[:#]/g, '-') + '.bin';
const manifest = { version: 1, keys: {}, packs: {} };
const { keys } = geoKeys();
let total = 0, rawTotal = 0;
for (const [id, p] of Object.entries(packs).sort()) {
  if (p.key !== keys[p.group]) console.log(`  ! ${id}: sources changed during the bake (rerun)`);
  if (SKIP(id, p)) {
    if (p.b64) console.log(`  ${id.padEnd(40)} not shipped (would be ${(deflateRawSync(Buffer.from(p.b64, 'base64'), { level: 9 }).length / 1e6).toFixed(2)} MB)`);
    manifest.packs[id] = { group: p.group, key: '*', empty: true };
    continue;
  }
  manifest.keys[p.group] = p.key;
  if (p.empty) { manifest.packs[id] = { group: p.group, key: p.key, empty: true }; continue; }
  const raw = Buffer.from(p.b64, 'base64'), z = deflateRawSync(raw, { level: 9 });
  writeFileSync(out + file(id), z);
  manifest.packs[id] = { group: p.group, key: p.key, file: file(id), bytes: z.length, raw: raw.length, ...(p.lazy ? { lazy: true } : {}) };
  total += z.length; rawTotal += raw.length;
  console.log(`  ${id.padEnd(40)} ${(raw.length / 1e6).toFixed(2).padStart(7)} MB → ${(z.length / 1e6).toFixed(2).padStart(6)} MB`);
}
for (const f of readdirSync(out)) if (f.endsWith('.bin') && !Object.values(manifest.packs).some((e) => e.file === f)) unlinkSync(out + f);
writeFileSync(out + 'manifest.json', JSON.stringify(manifest, null, 1) + '\n');
console.log(`total ${(rawTotal / 1e6).toFixed(1)} MB → ${(total / 1e6).toFixed(1)} MB deflated`);
for (const [id, m] of Object.entries(failed)) console.log(`  not baked: ${id}: ${m}`);
}

// ---------- check: the packs build what the generators build ----------
const fingerprint = (page) => page.evaluate(() => {
  const w = window.game.world, r = (x) => Math.round(x * 1e4) / 1e4;
  // userData as plain data (numbers rounded; no functions, scene objects or cycles)
  const plain = (v, d = 0) => (typeof v === 'number' ? r(v) : !v || typeof v !== 'object' ? (typeof v === 'function' ? undefined : v)
    : d > 4 || v.isObject3D || v.isMaterial || v.isNode || v.isTexture ? undefined : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x, d + 1)])));
  const geo = (g) => {
    const p = g.attributes.position, idx = g.index?.array, n = idx ? idx.length : p.count;
    let sx = 0, sy = 0, sz = 0;
    for (let t = 0; t < n; t++) { const i = idx ? idx[t] : t; sx += p.getX(i); sy += p.getY(i); sz += p.getZ(i); }
    // means (not sums): quantised vertex data (src/load/geocodec.js) moves them by far less than the tolerance
    const at = Object.keys(g.attributes).sort().map((k) => {
      const a = g.attributes[k]; let s = 0, m = 0;
      for (let t = 0; t < n; t += 7) { const i = idx ? idx[t] : t; m++; for (let c = 0; c < a.itemSize; c++) s += a.getComponent(i, c); }
      return `${k}:${a.itemSize}:${r(s / (m || 1))}`;
    });
    return `${n / 3}t ${r(sx / (n || 1))},${r(sy / (n || 1))},${r(sz / (n || 1))} ${at.join(' ')}`;
  };
  const node = (o) => {
    let s = `${o.type}:${o.name}:${o.visible ? 1 : 0}${o.castShadow ? 'c' : ''}:${o.position.toArray().map(r)}:${o.rotation.toArray().slice(0, 3).map(r)}:${o.scale.toArray().map(r)}`;
    if (o.material) s += ` [${[o.material].flat().map((m) => m.name || m.type).join()}]`;
    if (o.geometry) s += ' ' + geo(o.geometry);
    const ud = Object.fromEntries(Object.entries(o.userData).filter(([k]) => k !== 'sphere' && k !== 'interactable')); // runtime caches
    if (Object.keys(ud).length) s += ' ' + JSON.stringify(plain(ud));
    return s;
  };
  const out = {};
  for (const p of w.placed) {
    const lines = [];
    const walk = (o, d) => { if (o.name.endsWith('-shadow')) return; lines.push(' '.repeat(d) + node(o)); for (const c of o.children) walk(c, d + 1); };
    walk(p.object, 0);
    out[`${p.model}@${p.x},${p.z}`] = lines;
  }
  out.colliders = w.colliders.filter((c) => c.x < 1e6).map((c) => JSON.stringify(c, (k, v) => (typeof v === 'number' ? r(v) : v)));
  out.floors = w.floors.map((c) => JSON.stringify(c, (k, v) => (typeof v === 'number' ? r(v) : v)));
  out.lows = w.lows.map((c) => JSON.stringify(c, (k, v) => (typeof v === 'number' ? r(v) : v)));
  out.interactables = w.interactables.map((it) => `${it.entry} ${it.target?.name || ''}:${it.target?.type || ''} ${JSON.stringify(it.zone || '')} ${it.act?.id || ''} ${Object.keys(it).sort()}`);
  const forest = w.forest;
  if (forest) out.forest = forest.variants.map((v) => `${v.species} ${v.radius} ${v.trunkR} ${geo(v.lod0.bark)} ${v.lod0.leaves ? geo(v.lod0.leaves) : ''} ${geo(v.lod1.bark)}`).concat([`trees ${forest.trees.N} ${[...forest.trees.X.slice(0, 50)].map(r)}`]);
  const ground = w.scene.getObjectByName('ground');
  if (ground) out.ground = [geo(ground.geometry), geo(ground.children[0].geometry)];
  return out;
});
// equal but for numbers within the quantisation tolerance (2e-3 on means and transforms; 1e-2 on normal means:
// 8-bit octahedral normals)
const NUM = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g, NRM = /normal:3:(-?[\d.e-]+)/;
const near = (x = '', y = '') => {
  if (x === y) return true;
  const nx = x.match(NRM), ny = y.match(NRM);
  if (nx && ny) { if (Math.abs(nx[1] - ny[1]) > 1e-2) return false; x = x.replace(NRM, ''); y = y.replace(NRM, ''); }
  if (x.replace(NUM, '#') !== y.replace(NUM, '#')) return false;
  const p = x.match(NUM), q = y.match(NUM);
  return p.every((v, i) => Math.abs(v - q[i]) <= 2e-3 + 1e-5 * Math.abs(v));
};
// two generated runs: lines that differ between them are animation (smoke, fire light, curtain), not the bake
const live = await run('nogeo', fingerprint), live2 = await run('nogeo', fingerprint), baked = await run('', fingerprint);
for (const wn of baked.warns.filter((w) => /geo /.test(w))) console.log('  ' + wn);
let diffs = 0;
for (const k of new Set([...Object.keys(live.r), ...Object.keys(baked.r)])) {
  const a = live.r[k] || [], a2 = live2.r[k] || [], b = baked.r[k] || [];
  const bad = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (!near(a[i], b[i]) && a[i] === a2[i]) bad.push(i);
  if (bad.length) { diffs++; console.log(`  ✗ ${k}: ${bad.length} of ${a.length} differ`); for (const i of bad.slice(0, 3)) console.log(`      gen   ${a[i]}\n      baked ${b[i]}`); }
}
console.log(diffs ? `check: ${diffs} differences` : `check: the baked world matches the generated one (${Object.keys(live.r).length} parts)`);
await browser.close();
