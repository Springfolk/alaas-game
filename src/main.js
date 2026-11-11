// Boot and loop: title → walk. Looking at a thing: the do input acts on it (hands), E opens its explainer card.
import * as THREE from 'three/webgpu';
import { Engine } from './engine/engine.js';
import { setAnisotropy, setTextureRenderer, sharpenTextures } from './engine/materials.js';
import { bootDone, bootFailed, restoreLost, resumeSpot } from './engine/tier.js';
import { releaseGeometry } from './load/release.js';
import { World } from './world/world.js';
import { START } from './world/layout.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { TouchControls } from './ui/touch.js';
import { UI, BY_ID } from './ui/ui.js';
import { Interactions } from './interact/index.js';
import { quickRaycast } from './interact/raycast.js';
import { ShaderStream } from './load/stream.js';
import { shareShadowShaders } from './load/shadows.js';
import { closeWorkers } from './load/workers.js';
import { isShadowProxy } from './engine/merge.js';
import { T, CONTROLS, LANGS, LANG_NAMES, tr, detectLang } from './ui/i18n.js';
import { Guide } from './ui/guide.js';
import { Stage } from './ui/stage.js';
import { Teach } from './ui/teach.js';
import { Cues } from './ui/cue.js';
import { prewarmUI } from './ui/prewarm.js';
import { icon, glyph } from './ui/icons.js';
import { fillSelects, watchSelects } from './ui/select.js';
import { version } from '../package.json';
import { instrument, event } from './load/prof.js';

const KEY = 'alaas-v1';
const params = new URLSearchParams(location.search);
if (params.has('remotelog') || params.has('perftest')) import('./load/remotelog.js'); // phone debugging: console + heartbeat to /__log (tools/phonelog.mjs)
const audioModules = import.meta.glob('./audio/audio.js');
// load timeline (ms since navigation) for tools/loadprof.mjs
const mark = (k) => { (window.loadMarks ||= {})[k] = Math.round(performance.now()); event(k); };
mark('main'); // every static import fetched and run
// the loading key art (index.html #keyart; hidden with ?auto) covers the world until it is complete
const keyart = document.getElementById('keyart');
const keyartShown = () => !!keyart && getComputedStyle(keyart).display !== 'none';
const setRes = (e, k) => { e.renderer.setPixelRatio(e.pixelRatio() * k); e.renderer.setSize(innerWidth, innerHeight, false); };

function loadSave() {
  const def = { lang: detectLang(), found: [], done: [], settings: { sens: 1, fov: 72, vol: 0.85, quality: 'auto', invertY: false, motion: 1, smooth: 0 } };
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    // the language comes from the browser until the player picks one (langSet)
    if (s) {
      return { ...def, ...s, lang: s.langSet ? s.lang : def.lang, settings: { ...def.settings, ...s.settings } };
    }
  } catch { /* storage blocked */ }
  return def;
}

class Game {
  async boot() {
    this.save = loadSave();
    this.state = { lang: this.save.lang, found: new Set(this.save.found), work: this.save.work ||= {} }; // work: counts of the hands-on jobs (src/interact/work)
    this.done = new Set(this.save.done); // actions already performed (ribbon tied…)
    const canvas = document.getElementById('game');
    const quality = this.bootQuality = params.get('q') || (params.has('low') ? 'low' : this.save.settings.quality);
    this.applyStatic();
    this.engine = await new Engine(canvas, { webgl: params.has('webgl'), post: !params.has('nopost'), quality }).init();
    setAnisotropy(this.engine.renderer.getMaxAnisotropy?.() || 8);
    setTextureRenderer(this.engine.renderer); // phones: texture images freed once uploaded
    instrument(this.engine.renderer); // ?prof (src/load/prof.js)
    mark('engine');
    window.game = this; // early, for debugging the load
    this.input = new Input(canvas);
    this.ui = new UI(this.state);
    if (params.has('fps')) document.getElementById('fps').classList.add('on'); // the F3 meter on a phone (no keyboard)
    this.world = new World(this.engine);
    this.player = new Player(this.engine.camera, this.world, this.input);
    if (params.has('cam')) this.player.view = params.get('cam').split(',').map(Number); // free camera: x,y,z,yaw°,pitch°,fov° (tools/key-art.mjs)
    this.touch = TouchControls.attach(this); // phones: virtual stick + buttons, no pointer lock
    this.teach = new Teach(this); // the controls, one at a time, when first needed (src/ui/teach.js)
    this.ray = new THREE.Raycaster();
    this.ray.far = 3.4;
    this.applySettings();
    const painted = prewarmUI(this); // the interface's own paint shaders, while the world is built

    // Loading (docs/loading.md): the world is drawn behind the title from the first frames (sky, ground,
    // homestead, then nature) while its shaders build in time slices (src/load/stream.js) and pure-CPU
    // generation runs in workers (src/load/workers.js); "click to walk" once nothing is left to build.
    const go = document.getElementById('go');
    let shown = 0, built = 0;
    const status = (stage) => {
      const f = shown = Math.max(shown, 0.4 * built + 0.6 * this.stream.progress * built); // shaders: the bigger part
      go.textContent = f < 0.6 ? `${Math.round(f / 0.6 * 100)}%${stage ? ' · ' + stage : ''}` : `${this.tt(T.preparing)} ${Math.round((f - 0.6) / 0.4 * 100)}%`;
    };
    this.stream = new ShaderStream(this.engine.renderer);
    shareShadowShaders(this.engine.renderer);
    this.stream.urgent = (o) => o.name === 'ground' || o.name === 'forest-canopy' || o.name === 'forest-impostors';
    // collect() puts every layer in every pass: a shadow proxy (src/engine/merge.js) is drawn only with the shadow pass's material
    this.stream.never = (o, m) => isShadowProxy(o) && m === o.material;
    this.stream.eye = this.engine.camera.position; // nearest first
    this.world.prewarm = (scene, cam, target) => this.stream.prepare(scene, cam, target); // offscreen bakes
    this.world.breathe = async () => { await new Promise((r) => setTimeout(r, 0)); await this.stream.viewBuilt(); }; // what shows comes first
    // the soundscape's code loads from the first view on (preview()), its clips from ready
    this.loadAudio = () => (this.audioLoading ||= audioModules['./audio/audio.js']?.().then(({ AudioScape }) => new AudioScape(this)).catch((e) => console.warn('audio', e)));
    const at = params.get('at')?.split(',').map(Number) || resumeSpot(); // resumeSpot: back after a GPU loss in play
    // the loading view must see the world from where it will be played (again once the floors exist)
    const place = () => { if (at) this.player.place(at[0], at[1], at[2] ?? 0); else this.player.place(START.x, START.z, START.yaw); this.player.update(0); };
    this.engine.onLost = () => restoreLost(at); // lost while loading: back to this same spot (in play: where the player stands, below)
    await this.world.build((f, stage) => { built = f; status(stage); }, () => { place(); return this.preview(status); }); // the homestead's build code starts once the sky shows
    place();
    mark('built');
    releaseGeometry(this); // vertex arrays the GPU holds leave the JS heap before the warm-up (src/load/release.js)
    this.interact = new Interactions(this); // carrying, sitting, berries (src/interact)
    this.cues = new Cues(this); // the next thing to do, shown (src/ui/cue.js); its ghosts exist before the warm-up
    this.guide = new Guide(this); // the journal's finder (DOM only)
    this.stage = this.ui.stage = new Stage(this); // the inspect stage: the view goes to the thing (src/ui/stage.js)
    this.ui.placed = new Set(this.world.interactables.map((i) => i.entry).filter(Boolean));
    this.ui.j.init(this); // the journal's map: where everything is
    if (params.has('sun')) { const [e, a] = params.get('sun').split(',').map(Number); this.engine.setSun(e, a ?? this.engine.sunAz); }
    await this.warmUp();
    await painted;
    mark('warm');

    this.audio = await this.loadAudio();
    this.audio?.fetchClips();
    releaseGeometry(this); // again: meshes first drawn in the warm-up
    this.sharpening = sharpenTextures().then(() => { this.sharp = true; mark('sharp'); closeWorkers(); }); // 256 → the tier's size, in play
    if (params.has('perftest')) this.sharpening.then(() => import('./load/perftest.js')).then((m) => m.perfTest(this)); // per-layer frame cost on a device
    this.player.onStep = (surface, speed) => this.audio?.step(surface, speed);

    this.title = true;
    this.ready = true;
    bootDone(); // the boot guard's mark (src/engine/tier.js): this load was not killed
    mark('ready');
    document.getElementById('fade').classList.add('clear');
    this.reveal(() => { go.textContent = this.tt(T.clickToWalk); });
    document.getElementById('title').addEventListener('click', () => this.start());
    document.getElementById('pause').addEventListener('click', () => this.resume());
    for (const b of document.querySelectorAll('#pause [data-page]')) b.onclick = () => this.pausePage(b.dataset.page);
    document.getElementById('pause-x').onclick = () => this.resume();
    document.getElementById('resume').onclick = () => this.resume();
    document.getElementById('reload').onclick = () => { this.persist(); location.reload(); };
    document.getElementById('exit').onclick = (e) => { e.stopPropagation(); this.exit(); }; // (a click on #pause resumes)
    this.input.onLockChange = (locked) => {
      // the pause menu goes once the lock is really back (a too-early request fails and leaves it up)
      if (locked) { this.unpause(); return; }
      if (this.title) return;
      this.closeCard(); this.ui.close(); // Esc closes the card or journal (and, as pointer lock goes, pauses)
      this.showPause();
      this.teach.note('pause');
    };
    addEventListener('keydown', (e) => this.key(e));
    this.input.onDo = (down) => { if (down && this.playing) this.act(this.focus); }; // the hands: left button, F, the touch hand button
    this.input.onPut = () => this.put();
    this.ui.onAction = (a, id, it, back) => { // window buttons, journal tiles, card links, the names on the stage
      if (a === 'learn') this.discover(id, true);
      else if (a === 'more') this.inspect(null);
      else if (a === 'open') { if (back) this.ui.close(); this.read(id, it, back); }
      else this.closeUI();
    };
    watchSelects((name, v) => {
      if (name === 'lang') this.setLang(v);
      else if (name === 'q') { this.save.settings.quality = v; this.persist(); this.applySettings(); }
    });
    if (params.has('auto')) this.start(true);

    this.clock = new THREE.Timer();
    // the GPU device lost in play, or a frame that keeps throwing (the canvas would freeze): reload, resume here
    const lost = () => restoreLost([this.player.pos.x, this.player.pos.z, this.player.yaw]);
    this.engine.onLost = lost;
    // (Safari after the page was hidden: createCommandEncoder throws every few frames, no device-lost event)
    let bad = [];
    this.engine.renderer.setAnimationLoop((t) => {
      try { this.tick(t); } catch (e) {
        const now = performance.now();
        bad = bad.filter((x) => now - x < 3000);
        if (!bad.length) console.error(e);
        if (bad.push(now) >= 5) lost();
      }
    });
  }

  // The loading view: a frame loop that draws whatever has its shader built and queues the rest for
  // `this.stream`, which builds it between frames. The black fade clears once all in view is drawn (the
  // sky, within ~0.3 s). `this.loadTasks` run inside a frame, before its draw.
  preview(status) {
    const e = this.engine, stream = this.stream;
    e.dynamicResolution = () => {}; // slow loading frames must not lower the resolution for play
    if ((this.covered = keyartShown())) setRes(e, 0.5); // unseen under the key art: a quarter of the pixels (the frames feed the shader stream)
    // and whole shader builds in longer slices: each of three's yields inside a build costs a task hop
    if (this.covered) { stream.sync = true; stream.budget = 40; }
    this.loadTasks = [];
    let last = performance.now(), cost = 10, shown, drawnN = -1;
    const first = new Promise((ok) => { shown = ok; setTimeout(ok, 1000); });
    const loop = (now) => {
      if (this.ready) { delete e.dynamicResolution; return; }
      requestAnimationFrame(loop);
      // ~30 fps; while shaders build, drawing takes at most ~1/5 of the main thread (the view is still).
      // Unseen under the key art, a frame only feeds the stream: one when the scene gains a stage (its view
      // shaders first), else every ~0.5 s
      const n = e.scene.children.length, gap = this.covered && this.firstView ? (n !== drawnN ? 0 : 500) : stream.waiting ? Math.max(50, cost * 5) : 30;
      if (now - last < gap && !this.loadTasks.length) { status(); return; } // the progress text keeps moving
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const tf = performance.now();
      this.player.update(0);
      this.world.update(dt, { dt, time: now / 1000, camera: e.camera, player: this.player, game: this });
      e.update(dt);
      for (const task of this.loadTasks.splice(0)) task();
      stream.render(() => e.render());
      drawnN = n;
      cost += (performance.now() - tf - cost) * 0.3;
      stream.pump();
      status();
      if (!stream.skipped && !this.firstView && stream.total) { // all in view is drawn: show it
        this.firstView = true;
        mark('firstView');
        const fade = document.getElementById('fade');
        fade.style.transitionDuration = '0.9s';
        fade.classList.add('clear');
        setTimeout(this.loadAudio, 0);
        requestAnimationFrame(() => setTimeout(shown, 0)); // once that frame is on screen
      }
    };
    requestAnimationFrame(loop);
    return first; // resolves once the first view shows (at most 1 s)
  }
  // The key art cross-fades (1.4 s, index.html) to the finished world, already drawn behind it; `then` at ~1.1 s.
  reveal(then) {
    if (!keyartShown()) { keyart?.remove(); then(); return; }
    requestAnimationFrame(() => requestAnimationFrame(() => { // play frames on screen first
      keyart.classList.add('gone');
      setTimeout(then, 1100);
      setTimeout(() => keyart.remove(), 1600);
    }));
  }
  // Runs `fn` inside the next loading-view frame; resolves after it.
  inFrame(fn) { return new Promise((ok) => this.loadTasks.push(() => ok(fn()))); }

  // Build every shader (and pipeline) the walk can need before "click to walk": everything in the scene,
  // hidden props, every LOD, every pass (shadows, lake reflection, post), until a round finds nothing new
  // (passes appear as the materials that drive them get built). Nothing compiles in play.
  async warmUp() {
    const t0 = performance.now(), s = this.stream, e = this.engine, cam = e.camera;
    if (this.covered) setRes(e, 1); // full resolution again: the pacing frames below are play's
    this.world.update(1 / 60, { dt: 1 / 60, time: 0, camera: cam, player: this.player, game: this }); // models finish their materials on the first tick
    let meshes = 0;
    for (let round = 0; round < 8; round++) {
      const n = s.total;
      // the sun's maps re-render every round, lazy or not (phones: Engine.lazyShadows), so each caster's shadow shader is built
      meshes = await this.inFrame(() => s.collect(e.scene, cam, () => { e.sun.shadow.needsUpdate = true; e.render(); }));
      await s.drain();
      if (s.total === n) break;
    }
    mark('warmBuilt');
    // frames with everything built until two come at a normal pace (≤ 3 s): the GPU process has then compiled
    // the pipelines, so the first frames of play don't stall on that backlog (~1 s in Chrome)
    for (let ok = 0, t = performance.now(), t1 = t; ok < 2 && t1 - t < 3000;) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      ok = now - t1 < 40 ? ok + 1 : 0; t1 = now;
    }
    this.complete = true; // (tools: everything built)
    s.sync = false; s.budget = 12; // anything streamed later is in view again
    console.info(`warm-up: ${meshes} meshes, ${s.total} render objects built while loading; last rounds ${Math.round(performance.now() - t0)} ms`);
  }

  tt(o) { return tr(o, this.state.lang); }

  // Every static interface string, the controls lists and the language buttons, in the current language.
  applyStatic() {
    const lang = this.state.lang;
    document.documentElement.lang = lang;
    for (const el of document.querySelectorAll('[data-t]')) el.textContent = this.tt(T[el.dataset.t]);
    for (const el of document.querySelectorAll('.ver')) el.textContent = 'v' + version;
    for (const el of document.querySelectorAll('[data-ic]')) if (!el.firstChild) { el.innerHTML = icon(el.dataset.ic, el.className); el.className = ''; el.style.display = 'contents'; }
    // the controls, drawn: on a phone its own (stick, drag, buttons), else the keys and the mouse
    const touch = !!this.touch;
    const keys = () => CONTROLS.filter((c) => !touch || c.touch)
      .map((c) => `<span>${glyph(c, touch)}</span><span>${this.tt(c.label)}</span>`).join('');
    document.getElementById('keys-pause').innerHTML = keys();
    fillSelects('lang', LANGS.map((l) => [l, LANG_NAMES[l]]), lang);
    this.fillQuality?.();
    this.teach?.show(null);
    const go = document.getElementById('go');
    if (this.ready && this.title) go.textContent = this.tt(T.clickToWalk);
  }
  setLang(lang) {
    this.state.lang = lang;
    this.save.langSet = true;
    if (this.cardOpen()) this.ui.showEntry(this.ui.current, { mode: this.reading?.mode || 'peek' }); else if (this.ui.open === 'journal') this.ui.showJournal();
    this.focus = undefined;
    this.applyStatic();
    this.persist();
  }
  start(auto = false) {
    this.title = false;
    document.getElementById('title').classList.remove('show');
    this.audio?.start();
    if (!auto) this.input.lock();
  }
  // Pause. P (or the touch button) keeps the pointer lock, and the menu takes the drawn cursor, so Continue
  // needs no new lock (and no browser banner). Esc: the browser drops the lock; Continue re-locks once.
  get paused() { return document.getElementById('pause').classList.contains('show'); }
  pause() {
    this.closeCard(); this.ui.close();
    this.showPause();
    this.ui.setMenu(true);
    this.teach.note('pause');
  }
  // the pause window; on a phone it opens on its list of what can be done
  showPause() {
    document.querySelector('#pause .menu').classList.remove('paged');
    document.getElementById('pause').classList.add('show');
  }
  // one of its pages (settings, controls, about); none: back to the list (a phone)
  pausePage(id) {
    document.querySelector('#pause .menu').classList.toggle('paged', !!id);
    if (!id) return;
    for (const b of document.querySelectorAll('#pause .pz-nav [data-page]')) b.classList.toggle('on', b.dataset.page === id);
    for (const t of document.querySelectorAll('#pause .tab')) t.classList.toggle('on', t.id === 'tab-' + id);
  }
  fillQuality() {
    const q = this.save.settings.quality;
    fillSelects('q', ['auto', 'high', 'medium', 'low', 'mobile'].map((v) => [v, this.tt(T['q' + v[0].toUpperCase() + v.slice(1)])]), q);
    document.getElementById('qnote').hidden = q === this.bootQuality;
  }
  unpause() {
    document.getElementById('pause').classList.remove('show');
    this.ui.setMenu(false);
    this.input.mdx = this.input.mdy = 0; // the cursor's moves are not a look
  }
  // Exit (pause menu): closes the tab, which browsers refuse only for a tab holding an earlier page (a link
  // followed in the same tab); then back to that page, or to the title screen when it is the game again or none
  exit() {
    this.persist();
    window.close();
    if (window.closed) return;
    this.title = true; // first: losing the pointer lock then shows no pause menu
    this.unpause(); this.closeCard(); this.ui.close();
    document.exitPointerLock();
    document.getElementById('title').classList.add('show');
    const prev = window.navigation?.entries()[navigation.currentEntry?.index - 1]; // same-origin entries only
    if (!prev || new URL(prev.url).pathname !== location.pathname) history.back();
  }
  resume() {
    this.persist();
    if (this.input.locked) this.unpause(); else this.input.lock(); // the menu goes once the lock is back
  }
  applySettings() {
    const s = this.save.settings;
    this.player.settings.sens = s.sens;
    this.player.settings.invertY = s.invertY;
    this.player.settings.fov = s.fov; this.player.settings.motion = s.motion; this.player.settings.smooth = s.smooth;
    this.engine.camera.fov = s.fov; this.engine.camera.updateProjectionMatrix();
    this.audio?.setVolume(s.vol);
    const bind = (id, key, parse = Number, prop = 'value') => {
      const el = document.getElementById(id);
      el[prop] = s[key];
      el.oninput = () => { s[key] = parse(el[prop]); this.applySettings(); this.persist(); };
    };
    bind('s-sens', 'sens'); bind('s-fov', 'fov'); bind('s-vol', 'vol');
    bind('s-inv', 'invertY', Boolean, 'checked');
    for (const k of ['motion', 'smooth']) if (document.getElementById('s-' + k)) bind('s-' + k, k); // sliders 0..1, if the UI has them
    bind('s-battery', 'batterySaver', Boolean, 'checked'); // read by the perf code (save.settings.batterySaver)
    if (s.batterySaver == null && this.engine) document.getElementById('s-battery').checked = !!this.engine.autoSaver; // auto until toggled
    this.fillQuality();
    document.getElementById('fovv')?.replaceChildren(s.fov + '°');
  }

  persist() {
    this.save.lang = this.state.lang;
    this.save.found = [...this.state.found];
    this.save.done = [...this.done];
    try { localStorage.setItem(KEY, JSON.stringify(this.save)); } catch { /* ignore */ }
  }

  key(e) {
    if (this.title) return;
    const ui = this.ui;
    if (e.code === 'KeyL') { this.setLang({ sah: 'en', en: 'ru', ru: 'sah' }[this.state.lang] || 'sah'); return; }
    if (e.code === 'F3') { e.preventDefault(); document.getElementById('fps').classList.toggle('on'); return; }
    if (e.code === 'KeyP' && this.input.locked) { if (this.paused) this.resume(); else this.pause(); return; }
    if (this.paused) return;
    // a card or the journal is up: E goes on (the thing → its text → closed), Esc / J / a step away close; the
    // pointer lock is kept throughout
    if (ui.modal) {
      if (e.code === 'KeyE' && ui.open === 'card') this.inspect(null);
      else if (e.code === 'Escape' || e.code === 'KeyE' || e.code === 'KeyJ' || e.code === 'Tab' || (ui.open === 'card' && /^Key[WASD]$/.test(e.code))) this.closeUI();
      return;
    }
    if (!this.input.active) return;
    if (e.code === 'KeyJ' || e.code === 'Tab') { ui.showJournal(undefined, true); this.teach.note('journal'); }
    if (e.code === 'KeyE') this.inspect(this.focus);
  }

  // `quiet`: the card that is opening shows it as new itself
  discover(id, quiet = false) {
    if (!BY_ID[id] || this.state.found.has(id)) return false;
    this.state.found.add(id);
    if (!quiet) this.ui.discovered(id);
    if (this.guide?.id === id) this.guide.clear();
    this.audio?.play('discover');
    this.persist();
    return true;
  }

  // Is a card up (the inspect stage, with or without its reading sheet)?
  cardOpen() { return this.ui.open === 'card'; }
  // the card away and the view back in the body; a card opened from the journal goes back to it
  closeCard() {
    const r = this.reading;
    this.reading = null;
    if (!this.cardOpen() && !this.stage?.on) return;
    if (this.cardOpen()) this.ui.close();
    this.stage.close();
    if (r?.back === 'journal' && !this.paused && !this.title) this.ui.showJournal();
  }
  // close any window and play on (lock() is a no-op while the pointer is still locked)
  closeUI() { const card = this.cardOpen(); this.closeCard(); if (!card) this.ui.close(); if (!this.ui.open) this.input.lock(); }
  // Inspecting (E, the touch eye button): the thing in view comes up (the view goes to it: src/ui/stage.js)
  // with its name and one line → its full text beside it → closed. The one entry point for looking closer; it never acts.
  inspect(it) {
    const r = this.cardOpen() ? this.reading : null;
    if (r && (!it || !it.entry || r.it === it || it.entry === r.id)) { this.read(r.id, r.it); return; }
    if (it?.entry) this.read(it.entry, it);
  }
  // `it`: the thing looked at (none: the entry's own view, as from the journal or a link); `back`: where closing returns
  read(id, it = null, back = null) {
    if (!BY_ID[id]) return;
    const r = this.cardOpen() ? this.reading : null;
    if (r?.id === id && (!it || r.it === it)) { // the same thing again: its text, then closed
      if (r.mode === 'full') { this.closeCard(); return; }
      r.mode = 'full';
      this.ui.showEntry(id, { mode: 'full' });
      return;
    }
    const fresh = this.discover(id, true);
    this.teach.note('read');
    const kind = this.stage.open(id, it);
    this.ui.showEntry(id, { mode: 'peek', kind, fresh });
    this.reading = { id, it, mode: 'peek', back: back || r?.back };
  }
  // The act the hands do on `it` now (what you carry can change it), or null.
  actOf(it) {
    const o = this.interact?.actFor(it);
    if (o !== undefined) return o;
    if (!it.act) return null;
    const doneKey = it.act.once ? `${it.entry}:${it.act.id || 'act'}` : null;
    return doneKey && this.done.has(doneKey) ? null : it.act;
  }
  // taking play input: not on the title, in a menu or under a centred window
  get playing() { return !this.title && !this.paused && !this.ui.modal && this.input.active; }
  // Acting (the do input goes down): the act of the thing in view, or with nothing in view what the carried
  // thing does by itself. Acts that last read `input.doing` (held) themselves. It never opens a card.
  act(it) {
    if (this.acting) return;
    const act = it ? this.actOf(it) : this.interact?.idleAct();
    if (act && act.id !== 'none') this.teach.note('do');
    if (act) return this.run(act, it);
  }
  // Putting down (right button, Q, the touch button): what you carry goes back to its place when that is
  // within reach, else onto the ground before you.
  put() {
    if (!this.playing || this.acting) return;
    const act = this.interact?.putAct();
    if (act) this.teach.note('put');
    if (act) return this.run(act, null);
  }
  async run(act, it) {
    this.acting = act;
    this.promptKey = null;
    const doneKey = act === it?.act && act.once ? `${it.entry}:${act.id || 'act'}` : null;
    if (act.freeze) this.player.frozen = true; // only acts that move the view or ask a choice
    try { await act.run(this, it); } finally {
      if (act.freeze) this.player.frozen = false;
      this.acting = null; this.promptKey = null;
    }
    if (doneKey) this.done.add(doneKey);
    if (it?.entry) this.discover(it.entry); // learnt by doing; reading stays the player's own step
  }

  // What the player is looking at (a target within reach) or standing in (a zone).
  pickFocus() {
    const cam = this.engine.camera;
    this.ray.setFromCamera({ x: 0, y: 0 }, cam);
    let best = null, bestD = Infinity;
    // only targets whose bounds come within reach (raycasting whole houses every frame is costly)
    const targets = [], cp = cam.position;
    for (const it of this.world.interactables) {
      const t = it.target;
      if (!t || it.off) continue;
      if (!t.userData.sphere) {
        const b = new THREE.Box3().setFromObject(t);
        t.userData.sphere = b.isEmpty() ? null : b.getBoundingSphere(new THREE.Sphere());
      }
      const sp = t.userData.sphere;
      if (!sp || sp.center.distanceTo(cp) - sp.radius < this.ray.far) targets.push(t);
    }
    const hits = this.ray.intersectObjects(targets, true);
    // small things lie on or in big ones (a knife on a bench, silver beside a coat): among the hits
    // close behind the first, the smallest target wins
    let bestR = Infinity;
    for (const h of hits) {
      if (h.distance > hits[0].distance + 0.6) break;
      let o = h.object;
      while (o && !o.userData.interactable) o = o.parent;
      const r = o?.userData.sphere?.radius ?? Infinity;
      if (o && (!best || r < bestR)) { bestR = r; best = o.userData.interactable; bestD = h.distance; this.focusHit = { ...h, it: best }; }
    }
    if (!best) {
      const p = this.player.pos;
      for (const it of this.world.interactables) {
        if (!it.zone || it.off) continue;
        const d = Math.hypot(p.x - it.zone.x, p.z - it.zone.z);
        if (d < it.zone.r && d < bestD) { best = it; bestD = d; }
      }
    }
    return best;
  }

  frame(now) {
    const t0 = performance.now();
    this.clock.update(now); // the rAF timestamp: frame steps stay as even as the display's refreshes
    const dt = Math.max(0, Math.min(this.clock.getDelta(), 0.25)); // (was 0.05: under 20 fps the world ran in slow motion)
    const paused = this.paused;
    const staged = this.stage?.on; // the view is away from the body (the inspect stage)
    if (!this.title && !this.ui.modal && !paused && !staged) this.stepPlayer(dt);
    else if (this.title) { this.player.update(0); }
    if (staged) this.stage.update(dt);
    // tag interactable roots once
    for (const it of this.world.interactables) if (it.target && !it.target.userData.interactable) { it.target.userData.interactable = it; quickRaycast(it.target); }
    this.pickTick = (this.pickTick || 0) + 1;
    const live = !this.title && !this.ui.modal && !this.player.frozen && !paused && !staged;
    const pick = !(this.pickTick % 3);
    const f = live ? (pick ? this.pickFocus() : this.focus) : null;
    if (f !== this.focus) { this.focus = f; this.promptKey = null; }
    if (pick || this.promptKey == null) {
      // the prompt names the thing in view, what the hands would do with it and whether it has a card; with
      // nothing in view the dot alone turns into a ring when the carried thing can be used
      const act = !live || this.acting ? null : f ? this.actOf(f) : this.interact?.idleAct();
      const e = f && BY_ID[f.entry];
      const what = f ? (f.label ? this.ui.t(f.label) : e ? e.sah.split(/[;(]/)[0].trim() : f.entry) : null;
      const can = !!act && act.id !== 'none';
      const put = live && !this.acting ? this.interact?.putAct() || null : null;
      this.doReady = can; this.doAct = can ? act : null; // (the touch hand button draws this act's tool)
      this.readReady = !!e;
      this.putReady = !!put; this.putAct = put;
      const key = `${what}|${can ? act.id + this.ui.t(act.label) : ''}|${!!e}|${put?.id}`;
      if (key !== this.promptKey) {
        this.promptKey = key;
        const dot = document.getElementById('dot');
        dot.classList.toggle('on', !!(f || can));
        dot.classList.toggle('do', can);
        this.ui.setPrompt(what, { act: this.doAct, read: !!e, put });
      }
    }
    const ctx = { dt, time: this.clock.getElapsed(), camera: this.engine.camera, player: this.player, game: this };
    this.world.update(dt, ctx);
    this.audio?.update(dt, ctx);
    this.engine.update(dt);
    this.engine.render();
    this.guide?.update(dt);
    this.cues?.update(dt);
    this.ui.frame();
    this.fpsMeter(dt);
    this.teach.update(dt);
    this.input.endFrame();
    this.engine.frameDone(performance.now() - t0);
  }
}

// The body in steps of ≤1/30 s, so a slow frame walks as far as the time it took and collisions stay exact;
// the frame's look input applies in the first step only.
Game.prototype.stepPlayer = function (dt) {
  const inp = this.input, look = [inp.mdx, inp.mdy, inp.lookX, inp.lookY];
  for (let left = dt, first = true; first || left > 1e-6; first = false) {
    const s = Math.min(left, 1 / 30);
    if (!first) inp.mdx = inp.mdy = inp.lookX = inp.lookY = 0;
    this.player.update(s);
    left -= s;
  }
  [inp.mdx, inp.mdy, inp.lookX, inp.lookY] = look;
};

Game.prototype.fpsMeter = function (dt) {
  const m = this._fps ||= { t: 0, n: 0, worst: 0 };
  m.t += dt; m.n++; m.worst = Math.max(m.worst, dt);
  if (m.t < 0.5) return;
  const el = document.getElementById('fps');
  if (el.classList.contains('on')) {
    const info = this.engine.renderer.info.render, e = this.engine;
    el.textContent = `${Math.round(m.n / m.t)} fps · ${(m.t / m.n * 1000).toFixed(1)} ms (worst ${(m.worst * 1000).toFixed(0)})\n` +
      `${info.drawCalls} calls · ${(info.triangles / 1e6).toFixed(1)} M tris\n${e.tier}${e.tierAuto ? ' (auto)' : ''} · ${e.fpsCap} fps cap${e.knobs?.length ? ` (${e.knobs.map((k) => k.name).join(', ')})` : ''} · gpu ${Math.round(e.gpuMs || 0)} ms · res ${Math.round(e.renderer.getPixelRatio() / devicePixelRatio * 100)}% of native · ${e.backend}${e.fallback ? ` (${e.fallback})` : ''}`;
  }
  m.t = 0; m.n = 0; m.worst = 0;
};

const fail = (e) => {
  if (window.game?.engine?.restoring) return; // a lost GPU device is being restored by a reload: not a failed start
  const engine = window.game?.engine;
  if (engine?.deviceBroken()) { engine.renderer.onDeviceLost({ api: 'WebGPU', message: String(e), reason: 'broken' }); return; } // restored like a loss
  console.error(e, e?.stack);
  bootFailed(); // the next load steps down (src/engine/tier.js)
  const go = document.getElementById('go');
  go.style.animation = 'none';
  go.style.textTransform = 'none';
  go.textContent = 'failed to start: ' + (e?.message || e);
};
addEventListener('error', (e) => { if (!window.game?.ready) fail(e.error || e.message); });
addEventListener('unhandledrejection', (e) => { if (!window.game?.ready) fail(e.reason); });
document.getElementById('go').textContent = '· · ·';
new Game().boot().catch(fail);

// Frame pacing (perf): a steady 60 fps (30 with the battery saver) in play, on the title and in menus;
// once the pause menu has settled (TRAA converged) no frames are drawn until it closes. Engine.pace counts
// display refreshes, so a 120 Hz screen draws exactly every other one.
Game.prototype.tick = function (now) {
  const e = this.engine, s = this.save.settings;
  e.fpsCap = (s.batterySaver ?? e.autoSaver) ? 30 : e.opts.fps;
  const paused = document.getElementById('pause')?.classList.contains('show');
  this.pausedFrames = paused ? (this.pausedFrames || 0) + 1 : 0;
  if (e.pace(now, this.pausedFrames > 45 ? 0 : e.fpsCap)) this.frame(now);
};
