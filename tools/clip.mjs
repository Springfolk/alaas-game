// Renders the README clips from the game itself, frame by frame on a virtual clock (timers, rAF, performance.now and
// CSS animations all step 1/50 s a frame), so the result is even whatever the machine's speed.
// node tools/clip.mjs <clip>|all [--stills] — needs a served build (PORT; `npx vite preview`), ffmpeg, img2webp.
// Out: .cache/clips/<clip>.mp4 (1080p, 50 fps), .webp (800 px, 25 fps), .gif (480 px, 20 fps); `shots --stills`: the
// first frame of every shot as a PNG.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync } from 'node:fs';
import { launch, PORT } from './browser.mjs';

const FPS = 50, DT = 1000 / FPS, W = 960, H = 540, DPR = 2, FADE = 0.6;
const OUT = new URL('../.cache/clips/', import.meta.url).pathname;
const QUERY = 'auto&q=high';

// A shot: `dur` s; `cam(u)` (u 0–1) → { p: [x, height over the ground, z], t: the point looked at, the same way, fov }
// or `play`: the player's own body, driven through `start(g)` and `each(g, s)` in the page; `hud`: the interface shows.
const drift = (p0, t0, p1, t1, fov = 50, fov1 = fov) => (u) => ({
  p: p0.map((v, i) => v + (p1[i] - v) * u), t: t0.map((v, i) => v + (t1[i] - v) * u), fov: fov + (fov1 - fov) * u,
});
const read = (dur, look, more) => ({
  dur, play: true, hud: true, args: [look, more],
  start: (g) => { g.player.place(15.2, -206.6, 1.62); g.input.locked = true; g.player.aimPitch = 0.12; },
  each: (g, s, n, look, more) => {
    const at = (t) => n === Math.round(t * 50);
    if (s < 1.3) { g.input.keys.add('KeyW'); g.player.aimYaw = 1.62 + 0.25 * Math.min(1, s / 1.3); } else g.input.keys.clear();
    if (at(look)) g.inspect(g.focus?.entry === 'serge' ? g.focus : g.world.interactables.find((i) => i.entry === 'serge'));
    if (at(more)) g.inspect(null);
  },
  end: (g) => { g.closeCard?.(); },
});
const SHOTS = {
  // the homestead from the meadow: grass in the wind, the urasa and its serge
  meadow: { dur: 6, cam: drift([34, 0.7, -196], [4, 3.2, -205], [31, 1.0, -199], [4, 3.2, -205], 42) },
  meadow3: { dur: 3.2, cam: drift([34, 0.7, -196], [4, 3.2, -205], [32.4, 0.86, -197.6], [4, 3.2, -205], 42) },
  serge: { dur: 3.2, cam: drift([13.2, 1.1, -207.6], [10, 1.9, -205], [12.2, 2.0, -208.4], [10, 2.2, -205], 44) },
  hearth: { dur: 3.2, cam: drift([0.9, 1.25, -207.3], [-2, 0.75, -205], [1.4, 1.2, -206.2], [-2, 0.8, -205], 58) },
  choron: { dur: 3.2, cam: drift([2.35, 0.55, -207.0], [1.5, 0.3, -206.4], [2.5, 0.6, -206.1], [1.5, 0.32, -206.4], 40) },
  balagan: { dur: 3.2, cam: drift([-20.6, 1.45, -198.2], [-17, 1.0, -201.5], [-19.6, 1.4, -197.9], [-17, 1.05, -201.5], 60) },
  shore: { dur: 3.6, cam: drift([24, 1.5, -58], [22, 0.2, -44], [21, 1.5, -57], [22, 0.2, -44], 55) },
  // the player's own walk up the track, the body's bob and sway left in
  walk: {
    dur: 9, play: true, hud: true,
    start: (g) => { g.player.place(31, -208.6, 1.69); g.input.locked = true; g.input.keys.add('KeyW'); },
    each: (g, s) => { g.player.aimYaw = 1.69 - 0.2 * Math.sin(Math.min(1, s / 9) * Math.PI) ** 2; g.player.aimPitch = 0.02; },
    end: (g) => g.input.keys.clear(),
  },
  // walk up to the serge, look closer (E), read on (E): the card
  read: read(9, 2.4, 6.2),
  readShort: read(6.4, 2.0, 4.6),
};
// A clip: its shots in order, cross-faded
const CLIPS = {
  walk: ['walk'],
  details: ['serge', 'hearth', 'choron', 'balagan', 'shore'],
  meadow: ['meadow'],
  read: ['read'],
  trailer: ['meadow3', 'hearth', 'choron', 'readShort', 'shore'],
};

const [name = 'all', ...flags] = process.argv.slice(2);
const stills = flags.includes('--stills');
const names = name === 'all' ? Object.keys(CLIPS) : name === 'shots' ? Object.keys(SHOTS) : [name];
mkdirSync(OUT, { recursive: true });
const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
page.on('pageerror', (e) => console.error('page:', e.message));
await page.clock.install();
await page.goto(`http://127.0.0.1:${PORT}/?${QUERY}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.game?.complete && window.game.sharp, null, { timeout: 300000 });
await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
await page.evaluate(() => {
  const g = window.game, e = g.engine;
  e.renderer.setAnimationLoop(null); e.dynamicResolution = () => {};
  g.player.settings.smooth = 0.6;
  document.head.append(Object.assign(document.createElement('style'), { textContent: '.nohud :is(#dot, #prompt, #puthint, #toasts, #teach, #teach-ghost, #guide, #gshimmer) { display: none !important; }' }));
  // one frame: CSS animations move by dt, the game steps and draws, the GPU finishes
  window.__frame = async (dt, view) => {
    for (const a of document.getAnimations()) { if (a.playState !== 'paused') { a.pause(); a.__t = a.currentTime || 0; } a.currentTime = (a.__t += dt); }
    if (view) {
      const y = (x, z, h) => g.world.groundAt(x, z) + h;
      const [px, ph, pz] = view.p, [tx, th, tz] = view.t, py = y(px, pz, ph), ty = y(tx, tz, th);
      const yaw = Math.atan2(-(tx - px), -(tz - pz)), pitch = Math.atan2(ty - py, Math.hypot(tx - px, tz - pz));
      g.player.pos.x = px; g.player.pos.z = pz;
      g.player.view = [px, py, pz, yaw * 180 / Math.PI, pitch * 180 / Math.PI, view.fov];
    } else g.player.view = null;
    g.frame(performance.now());
    await e.renderer.backend.device.queue.onSubmittedWorkDone();
  };
});
const step = async (view) => { await page.clock.runFor(DT); await page.evaluate(([dt, v]) => window.__frame(dt, v), [DT, view]); };

async function shoot(id, dir) {
  const s = SHOTS[id], frames = stills ? 1 : Math.round(s.dur * FPS);
  await page.evaluate(([hud, start]) => {
    const g = window.game;
    document.documentElement.classList.toggle('nohud', !hud);
    g.input.keys.clear(); g.engine.adaptFast = 1;
    if (start) (0, eval)(`(${start})`)(g);
  }, [!!s.hud, s.start?.toString()]);
  const each = s.each?.toString();
  const drive = (n) => (each ? page.evaluate(([fn, t, k, a]) => (0, eval)(`(${fn})`)(window.game, t, k, ...a), [each, n / FPS, n, s.args || []]) : null);
  if (each) await drive(0);
  for (let n = 0; n < 70; n++) await step(s.cam?.(0)); // the view settles: shadows, eye, anti-aliasing, the near grass
  for (let n = 0; n < frames; n++) {
    if (each) await drive(n);
    await step(s.cam?.(n / Math.max(1, frames - 1)));
    await page.screenshot({ path: `${dir}/f${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 97 });
  }
  if (s.end) await page.evaluate((fn) => (0, eval)(`(${fn})`)(window.game), s.end.toString());
  return frames;
}

const done = new Map();
const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });
for (const clip of names) {
  const shots = name === 'shots' ? [clip] : CLIPS[clip], t0 = Date.now();
  if (!shots) throw new Error(`no clip ${clip}: ${Object.keys(CLIPS).join(', ')}`);
  const parts = [];
  for (const [i, id] of shots.entries()) {
    const dir = `${OUT}shots/${id}`;
    if (!done.has(id)) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); done.set(id, await shoot(id, dir)); } // a shot renders once a run
    parts.push({ dir, dur: done.get(id) / FPS });
    if (stills) ff('-i', `${dir}/f00000.jpg`, '-vf', 'scale=960:-1', `${OUT}${clip}-${i}-${id}.png`);
  }
  if (stills) continue;
  // the shots cross-faded into one master, then the README sizes
  const ins = parts.flatMap((p) => ['-framerate', String(FPS), '-i', `${p.dir}/f%05d.jpg`]);
  let graph = '', last = '0:v', at = 0;
  for (let i = 1; i < parts.length; i++) { at += parts[i - 1].dur - FADE; graph += `[${last}][${i}:v]xfade=transition=fade:duration=${FADE}:offset=${at.toFixed(3)}[x${i}];`; last = `x${i}`; }
  const mp4 = `${OUT}${clip}.mp4`;
  ff(...ins, '-filter_complex', `${graph}[${last}]format=yuv420p[o]`, '-map', '[o]', '-c:v', 'libx264', '-crf', '15', '-preset', 'slow', '-movflags', '+faststart', mp4);
  ff('-i', mp4, '-filter_complex', 'fps=20,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle', `${OUT}${clip}.gif`);
  const tmp = `${OUT}${clip}-webp`;
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp);
  ff('-i', mp4, '-vf', 'fps=25,scale=800:-1:flags=lanczos', `${tmp}/f%05d.png`);
  execFileSync('img2webp', ['-loop', '0', '-lossy', '-q', '78', '-m', '5', '-d', '40', ...readdirSync(tmp).sort().map((f) => `${tmp}/${f}`), '-o', `${OUT}${clip}.webp`]);
  rmSync(tmp, { recursive: true });
  console.log(`${clip}: ${(parts.reduce((s, p) => s + p.dur, 0) - FADE * (parts.length - 1)).toFixed(1)} s, ${((Date.now() - t0) / 1000).toFixed(0)} s to render`);
}
await browser.close();
