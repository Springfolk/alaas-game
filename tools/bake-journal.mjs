// Bakes what the inspect stage and the journal need from the game itself (docs/ui.md, docs/loading.md):
//  1. `dir` (and `free`) of every entry's view in src/data/views.json: the side its thing is best seen from, found by
//     casting rays at it from all round (entries with `fix`, `cam` or `photo` keep what they have);
//  2. the journal's pictures, public/assets/ui/journal/<id>.webp (+ <id>.s.webp, a 20 px blur for what is not found
//     yet): each entry's view as the stage shows it; work-<job>.webp for the jobs; map.webp, the homestead from
//     above, with its projection in src/data/journal.json (the journal puts its markers on it).
// npm run bake-journal [-- id …] — needs the dev server (PORT) and `cwebp`. Rerun after changing a model, the layout
// or the light (after bake-geometry and bake-impostors).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, PORT as port } from './browser.mjs';

const only = process.argv.slice(2);
const ROOT = new URL('..', import.meta.url).pathname;
const VIEWS = join(ROOT, 'src/data/views.json'), OUT = join(ROOT, 'public/assets/ui/journal');
const MAP = { cam: [10, 150, -130, 0, -42, 32], w: 1600, h: 900 }; // the homestead from above the south
const WORK = { split: 'block', hay: 'khotuur', tuos: 'bark', gather: 'drywood' }; // a job's own thing (flag on its interactable); the others share their entry's picture
const S = 512;
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'journal-'));
const views = JSON.parse(readFileSync(VIEWS, 'utf8'));

const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: S, height: S } });
page.on('pageerror', (e) => console.warn('pageerror:', e.message));
await page.goto(`http://127.0.0.1:${port}/?auto&keepgeo&q=high&sharp&notouch`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 600000, polling: 500 });
const HIDE = '#hints, #dot, #prompt, #toasts, #title, #fps, #card, #guide, #gshimmer, #dip { display: none !important; }';

// 1. the side each thing is best seen from
const dirs = await page.evaluate(async ({ views, only }) => {
  const { pickThing, boundsOf } = await import('/src/ui/stage.js');
  const g = window.game, world = g.world, scene = g.engine.scene, D2R = Math.PI / 180;
  const THREE = { Raycaster: g.ray.constructor, Vector3: g.player.pos.constructor };
  const sun = g.engine.sun.position.clone().setY(0).normalize();
  // everything a view could be blocked by: drawn meshes that still hold their vertices
  const solid = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.layers.test(g.engine.camera.layers) || !o.geometry?.attributes.position?.array?.length) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const m = o.material;
    if (!m || m.visible === false || m.colorWrite === false || m.transparent || o.userData.interactable) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    if (s.radius > 400) return; // sky, ground
    solid.push({ o, s });
  });
  const ray = new THREE.Raycaster(), out = {}, v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const dirOf = (yaw, el) => new THREE.Vector3(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el));
  for (const id of Object.keys(views)) {
    const view = views[id];
    if (view.cam || view.photo || view.fix || (only.length && !only.includes(id))) continue;
    const it = pickThing(world, id, view);
    if (!it) { out[id] = null; continue; }
    const b = boundsOf(world, it), near = b.r <= 1.5;
    const D = b.r * 1.3 / Math.sin(Math.atan(0.27)) * (view.dist || 1);
    const els = near ? [22, 34, 46] : [7, 13, 20], N = 24;
    const cand = solid.filter((x) => x.s.center.distanceTo(b.c) < D + b.r + x.s.radius + 1).map((x) => x.o);
    const ground = (p) => world.groundAt(p.x, p.z);
    const score = els.map((el) => Array.from({ length: N }, (_, k) => {
      const d = dirOf(k / N * Math.PI * 2, el * D2R), P = d.clone().multiplyScalar(D).add(b.c);
      if (P.y < ground(P) + 0.3) return 0;
      right.crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(); up.crossVectors(right, d).normalize();
      let free = 0;
      const pts = [[0, 0], [0.55, 0], [-0.55, 0], [0, 0.55], [0, -0.55]];
      for (const [x, y] of pts) {
        v.copy(b.c).addScaledVector(right, x * b.r).addScaledVector(up, y * b.r);
        const len = v.distanceTo(P);
        ray.set(P, v.sub(P).normalize()); ray.near = 0.02; ray.far = Math.max(0.05, len - b.r * 1.05);
        if (!ray.intersectObjects(cand, false).length) free++;
      }
      return free / pts.length + (near ? 0 : 0.12 * d.clone().setY(0).normalize().dot(sun)); // a house: its sunlit side
    }));
    let best = null;
    els.forEach((el, e) => { for (let k = 0; k < N; k++) {
      const s = score[e][k] * 0.5 + (score[e][(k + 1) % N] + score[e][(k + N - 1) % N]) * 0.2 + (score[e][(k + 2) % N] + score[e][(k + N - 2) % N]) * 0.05 + (e === 1 ? 0.03 : 0);
      if (!best || s > best.s) best = { s, e, k };
    } });
    out[id] = { dir: [Math.round(best.k / N * 360), els[best.e]], free: score[best.e].every((s) => s >= 0.75), s: +best.s.toFixed(2) };
  }
  return out;
}, { views, only });
for (const [id, d] of Object.entries(dirs)) {
  if (!d) { console.warn(`${id}: no thing in the world`); continue; }
  views[id].dir = d.dir;
  if (d.free) views[id].free = true; else delete views[id].free;
  if (d.s < 0.75) console.warn(`${id}: best view only ${d.s} clear (${d.dir}) — give it a "dir" and "fix": true`);
}
writeFileSync(VIEWS, JSON.stringify(views, null, 1) + '\n');
console.log(`views: ${Object.keys(dirs).length} directions`);
// (the dev server reloads the page when views.json changes: load it again, with the new views)
await page.waitForTimeout(1500);
await page.goto(`http://127.0.0.1:${port}/?auto&q=high&sharp&notouch`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 600000, polling: 500 });
await page.addStyleTag({ content: HIDE });

// 2. the pictures
const webp = (png, name, size, q = 74) => execFileSync('cwebp', ['-quiet', '-q', String(q), '-resize', String(size), '0', png, '-o', join(OUT, name)]);
const settle = () => page.evaluate(async () => { window.game.engine.adaptFast = 1; const t = performance.now(); for (let n = 0; n < 80 || performance.now() - t < 1600; n++) await new Promise((r) => requestAnimationFrame(r)); }); // the eye adapted, TRAA settled
await page.evaluate(() => { window.game.player.settings.motion = 0; window.game.input.locked = true; });
const shots = Object.keys(views).filter((id) => !views[id].photo).map((id) => ({ name: id, id }))
  .concat(Object.entries(WORK).map(([job, flag]) => ({ name: 'work-' + job, flag })))
  .filter((s) => !only.length || only.includes(s.name));
for (const s of shots) {
  const ok = await page.evaluate(({ id, flag }) => {
    const g = window.game;
    if (g.stage.on) { g.stage.on = false; g.stage.s = null; }
    const it = flag ? g.world.interactables.find((i) => i[flag] && i.target) : null;
    if (flag && !it) return false;
    if (it) { const c = new (g.player.pos.constructor)(); it.target.getWorldPosition(c); g.player.place(c.x + 1.4, c.z + 1.1, 0); g.player.update(0); g.engine.camera.updateMatrixWorld(); }
    const mode = g.stage.open(it ? (it.entry || 'ottuk-mas') : id, it);
    Object.assign(g.stage.area, { x: 0, y: 0, w: 0.84, h: 0.84 });
    if (g.stage.s) { g.stage.s.t = 1; g.stage.s.fov = 40; if (it) { g.stage.s.el = 0.6; g.stage.s.maxD = 0; } }
    clearTimeout(g.stage.cutT);
    return mode;
  }, s);
  if (!ok || ok === 'photo') { console.warn(`${s.name}: nothing to show`); continue; }
  await settle();
  const png = join(tmp, s.name + '.png');
  await page.screenshot({ path: png });
  webp(png, s.name + '.webp', 320);
  webp(png, s.name + '.s.webp', 20, 60);
}
await page.evaluate(() => { const g = window.game; g.stage.on = false; g.stage.s = null; });
if (!only.length || only.includes('map')) { // the homestead from above
  await page.setViewportSize({ width: MAP.w, height: MAP.h });
  const vp = await page.evaluate((cam) => { const g = window.game; g.player.view = cam; g.player.update(0); const c = g.engine.camera; c.updateMatrixWorld(); return c.projectionMatrix.clone().multiply(c.matrixWorldInverse).elements; }, MAP.cam);
  await settle();
  const png = join(tmp, 'map.png');
  await page.screenshot({ path: png });
  webp(png, 'map.webp', 1600, 78);
  writeFileSync(join(ROOT, 'src/data/journal.json'), JSON.stringify({ map: { w: MAP.w, h: MAP.h, vp: vp.map((x) => +x.toPrecision(7)) } }) + '\n');
}
console.log(`pictures: ${shots.length} in ${OUT}`);
await browser.close();
rmSync(tmp, { recursive: true, force: true });
