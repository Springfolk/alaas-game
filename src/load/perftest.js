// ?perftest (with ?remotelog's relay): on a real device, what each layer costs. Once the world is complete it
// visits the bench spots (start, yard, inside, lake, forest edge; tools/bench.mjs), uncapped (no frame pacing, no
// dynamic quality), and at each hides one layer at a time for 5 s, logging frames per second, the mean frame time
// and the frame's triangles and draws (full-scene steps). Hiding clears the meshes' layers (no camera or
// shadow pass draws them; `visible` would trip merge.js's shadow watchdog, which rebuilds shaders): nothing compiles. Shadows are frozen (the maps stop re-rendering), not switched off (that would rebuild shaders).
const SPOTS = { start: [62, -211, 1.69], yard: [9, -214, 1.2], inside: [0.4, -205.6, -1.4], lake: [6, -66, Math.PI], edge: [-60, -330, 0.3] };
const STEPS = [
  ['everything', []],
  ['no grass', ['grass-near', 'grass-mid']],
  ['no flowers', ['flowers-', 'shore-plants']],
  ['no forest', ['forest', 'forest-impostors', 'forest-canopy', 'forest-deadwood']],
  ['no homestead', ['urasa', 'balagan', 'serge', 'ampaar', 'kuruo', 'sele', 'yardlife', 'chores', 'lakeside', 'sacred-birch', 'balagan-kystyk', 'impostors']],
  ['shadows frozen', [], 'shadows'],
];

export async function perfTest(game) {
  const e = game.engine, r = e.renderer, scene = e.scene, sun = e.sun;
  const log = (s) => console.info(`perftest ${s}`);
  e.pace = () => true; e.dynamicResolution = () => {};
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const groups = scene.children.filter((c) => !c.isLight && c.name !== 'ground');
  const match = (c, keys) => keys.some((k) => k === '*' || (k.endsWith('-') ? c.name.startsWith(k) : c.name === k));
  log(`start · ${innerWidth}×${innerHeight} @${devicePixelRatio} · px ratio ${r.getPixelRatio()} · tier ${e.tier} · ${groups.map((c) => c.name).join(',')}`);
  // the frame's triangles and draws, summed over its renders (three resets the counters per render)
  const count = () => new Promise((ok) => {
    const orig = r._renderObjectDirect.bind(r); let tris = 0, draws = 0;
    r._renderObjectDirect = (o, ...a) => { const g = o.geometry, n = g.index ? g.index.count : g.attributes.position?.count || 0;
      tris += (n / 3) * (g.isInstancedBufferGeometry ? g.instanceCount : o.isInstancedMesh ? o.count : 1); draws++; return orig(o, ...a); };
    requestAnimationFrame(() => requestAnimationFrame(() => { r._renderObjectDirect = orig; ok([tris, draws]); }));
  });
  for (const [spot, [x, z, yaw]] of Object.entries(SPOTS)) {
    game.player.place(x, z, yaw);
    await wait(3000);
    for (const [name, keys, extra] of STEPS) {
      const hidden = [];
      for (const c of groups) if (c.visible && match(c, keys)) c.traverse((o) => { if (o.layers.mask) { hidden.push([o, o.layers.mask]); o.layers.mask = 0; } });
      if (extra === 'shadows') sun.shadow.autoUpdate = false;
      await wait(1500); // settle
      const f0 = r.info.frame, t0 = performance.now();
      let worst = 0, last = t0;
      const watch = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (performance.now() - t0 < 3500) requestAnimationFrame(watch); };
      requestAnimationFrame(watch);
      await wait(3500);
      const frames = r.info.frame - f0, ms = (performance.now() - t0) / frames;
      const tc = name === 'everything' ? await count() : null;
      log(`${spot.padEnd(7)} ${name.padEnd(15)} ${(1000 / ms).toFixed(1)} fps · ${ms.toFixed(1)} ms/frame · worst ${Math.round(worst)} ms${tc ? ` · ${(tc[0] / 2e6).toFixed(2)} M tris, ${tc[1] / 2} draws per frame` : ''}`);
      for (const [o, m] of hidden) o.layers.mask = m;
      sun.shadow.autoUpdate = true;
    }
  }
  log('done');
}
