// ?perftest (with ?remotelog's relay): on a real device, what each layer costs. Once the world is complete it
// stands at the start view, uncapped (no frame pacing, no dynamic quality), and hides one layer at a time for 5 s,
// logging frames per second and the mean frame time for each step. Hiding clears the meshes' layers (no camera or
// shadow pass draws them; `visible` would trip merge.js's shadow watchdog, which rebuilds shaders): nothing compiles. Shadows are frozen (the maps stop re-rendering), not switched off (that would rebuild shaders).
const STEPS = [
  ['everything', []],
  ['no near grass', ['grass-near']],
  ['no mid grass', ['grass-mid']],
  ['no grass at all', ['grass-near', 'grass-mid']],
  ['no flowers', ['flowers-', 'shore-plants']],
  ['no forest', ['forest', 'forest-impostors', 'forest-canopy', 'forest-deadwood']],
  ['no homestead', ['urasa', 'balagan', 'serge', 'ampaar', 'kuruo', 'sele', 'yardlife', 'chores', 'lakeside', 'sacred-birch', 'balagan-kystyk', 'impostors']],
  ['no life', ['life-']],
  ['shadows frozen', [], 'shadows'],
  ['half resolution', [], 'res'],
  ['only sky + ground', ['*'], 'shadows'],
];

export async function perfTest(game) {
  const e = game.engine, r = e.renderer, scene = e.scene, sun = e.sun;
  const log = (s) => console.info(`perftest ${s}`);
  e.pace = () => true; e.dynamicResolution = () => {};
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const groups = scene.children.filter((c) => !c.isLight && c.name !== 'ground');
  const match = (c, keys) => keys.some((k) => k === '*' || (k.endsWith('-') ? c.name.startsWith(k) : c.name === k));
  const pr = r.getPixelRatio();
  log(`start · ${innerWidth}×${innerHeight} @${devicePixelRatio} · px ratio ${pr} · tier ${e.tier} · ${groups.map((c) => c.name).join(',')}`);
  await wait(3000);
  for (const [name, keys, extra] of STEPS) {
    const hidden = [];
    for (const c of groups) if (c.visible && match(c, keys)) c.traverse((o) => { if (o.layers.mask) { hidden.push([o, o.layers.mask]); o.layers.mask = 0; } });
    if (extra === 'shadows') sun.shadow.autoUpdate = false;
    if (extra === 'res') r.setPixelRatio(pr / 2);
    await wait(1500); // settle
    const f0 = r.info.frame, t0 = performance.now();
    let worst = 0, last = t0;
    const watch = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; if (performance.now() - t0 < 3500) requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
    await wait(3500);
    const frames = r.info.frame - f0, ms = (performance.now() - t0) / frames;
    log(`${name.padEnd(18)} ${(1000 / ms).toFixed(1)} fps · ${ms.toFixed(1)} ms/frame · worst ${Math.round(worst)} ms`);
    for (const [o, m] of hidden) o.layers.mask = m;
    sun.shadow.autoUpdate = true;
    r.setPixelRatio(pr);
  }
  log('done');
}
