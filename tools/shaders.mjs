// Shader-build inventory: every node build from navigation to complete, with its object, material, pass,
// light set and geometry layout, grouped by material. node tools/shaders.mjs [chrome|webkit] [query] [out.json]
// — needs the dev server (PORT). Prints the count per pass and the materials with the most builds.
// COVERED=1: the real load under the key art (whole builds, no ?auto) instead of ?auto's time-sliced one.
import { writeFileSync } from 'node:fs';
import { launch, pageOptions, PORT as port } from './browser.mjs';
const [kind = 'chrome', query = '', out = ''] = process.argv.slice(2);
const browser = await launch(kind);
const page = await browser.newPage(pageOptions(kind, { viewport: { width: 1280, height: 720 } }));
await page.addInitScript(() => {
  const B = window.__builds = [];
  window.__buildMs = 0;
  // main-thread time inside the stream's builds (between its yields)
  const iv2 = setInterval(() => {
    const st = window.game?.stream;
    if (!st) return;
    clearInterval(iv2);
    const own = st.build.bind(st);
    st.build = async (...a) => {
      const sch = self.scheduler, y = sch.yield;
      let t = performance.now();
      const slice = () => { const d = performance.now() - t; window.__buildMs += d; if (d > (window.__slice?.[0] || 0)) window.__slice = [Math.round(d), a[0].material?.name || a[0].material?.type]; };
      sch.yield = () => { slice(); return y.call(sch).then((v) => { t = performance.now(); return v; }); };
      const t0 = window.__buildMs;
      try { return await own(...a); } finally { slice(); sch.yield = y; (window.__per ||= []).push([Math.round(window.__buildMs - t0), (a[0].material?.name || a[0].material?.type) + '/' + (a[0].object?.name || '')]); }
    };
  }, 0);
  const iv = setInterval(() => {
    const n = window.game?.engine?.renderer?._nodes;
    if (!n) return;
    clearInterval(iv);
    const own = n._createNodeBuilder.bind(n);
    n._createNodeBuilder = (ro, material) => {
      const nb = own(ro, material), o = ro.object, rt = ro.renderer.getRenderTarget();
      const pass = material.isShadowPassMaterial || ro.camera.isOrthographicCamera && o.castShadow && material !== o.material ? 'shadow'
        : rt?.texture?.name === 'output' ? 'main' : rt?.width === 320 ? 'mirror' : rt ? `rt:${rt.texture?.name || rt.width + 'x' + rt.height}` : 'screen';
      const lights = (material.lightsNode || o.material?.lightsNode || ro.lightsNode)?.getLights?.() || [];
      const m = o.material === material ? material : (o.material?.name || o.material?.type) + '>' + (material.name || material.type);
      const mat = typeof m === 'string' ? m : (m.name || m.type);
      const keys = material.isNodeMaterial ? Object.keys(material).filter((k) => k.endsWith('Node') && material[k]?.isNode).join(' ') : '';
      B.push({ obj: o.name || o.type, mat, type: material.type, pass, cam: ro.camera.type + (ro.camera.isArrayCamera ? 'A' : ''),
        lights: lights.map((l) => l.type[0] + l.id).join(','), geo: ro.getGeometryCacheKey(), nodes: keys,
        prog: material.customProgramCacheKey?.(), t: Math.round(performance.now()), ready: !!window.game?.ready,
        // why two builds of one material differ: material id, instanced (three keys those per object), render context, the key at creation
        mid: material.id, inst: !!(o.isInstancedMesh || o.count > 1), ctx: ro.context.id, ik: ro.initialCacheKey });
      return nb;
    };
  }, 0);
});
await page.goto(`http://127.0.0.1:${port}/?${process.env.COVERED ? '' : 'auto&'}${query}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.complete, null, { timeout: 300000, polling: 200 });
const B = await page.evaluate(() => window.__builds);
const buildMs = await page.evaluate(() => Math.round(window.__buildMs)), slice = await page.evaluate(() => window.__slice), per = await page.evaluate(() => window.__per);
await browser.close();
if (out) writeFileSync(out, JSON.stringify(B, null, 1));
const count = (f) => { const c = {}; for (const b of B) { const k = f(b); c[k] = (c[k] || 0) + 1; } return Object.entries(c).sort((a, b) => b[1] - a[1]); };
const shadowish = (b) => (b.pass === 'main' && b.cam === 'OrthographicCamera' ? 'shadow?' : b.pass);
console.log(`${kind} ${query || '(default)'}: ${B.length} builds; ${buildMs} ms main-thread in streamed builds (${(buildMs / B.length).toFixed(1)} ms each; longest slice ${slice?.join(' ms, ')})`);
console.log('per pass: ' + count(shadowish).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log('light sets: ' + count((b) => b.lights || '-').map(([k, v]) => `[${k}] ${v}`).join(' · '));
if (process.env.TOP) console.log('slowest: ' + per.sort((x, y) => y[0] - x[0]).slice(0, +process.env.TOP).map(([t, n]) => `${t} ${n}`).join(' · '));
console.log('per material:');
for (const [k, v] of count((b) => `${b.mat} (${b.type})`).slice(0, 80)) console.log(`  ${String(v).padStart(3)}  ${k}`);
