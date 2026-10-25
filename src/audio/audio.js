// The soundscape of a summer alaas: real recordings only (see docs/audio.md, tools/fetch-audio.mjs).
// Beds loop and are mixed by where the player stands; birds, horses and cattle call from 3D points
// around the hollow; houses muffle the outside and have their own room tone and hearth crackle.
import { ALAAS, LAKE } from '../world/terrain.js';
import { smooth, rand, pick as pickWith } from '../util.js';

const BASE = (import.meta.env?.BASE_URL || '/') + 'audio/';
const pick = (arr) => pickWith(Math.random, arr);

// Looping beds: base gains are multiplied by the position mix in update().
const BEDS = ['wind-larch', 'birch', 'breeze', 'insects', 'lake', 'mosquito', 'birds', 'room', 'fire'];
// Ambient calls: clip variants, gap between calls (s), where they come from, loudness and reference distance.
const CALLS = {
  cuckoo: { clips: ['cuckoo', 'cuckoo-2'], gap: [28, 75], at: 'forest', gain: 0.55, ref: 60 },
  thrush: { clips: ['thrush', 'thrush-2'], gap: [14, 38], at: 'edge', gain: 0.4, ref: 25 },
  crow: { clips: ['crow', 'crow-2'], gap: [35, 90], at: 'far', gain: 0.45, ref: 50 },
  woodpecker: { clips: ['woodpecker'], gap: [60, 140], at: 'forest', gain: 0.4, ref: 40 },
  lark: { clips: ['lark'], gap: [40, 90], at: 'sky', gain: 0.3, ref: 30 },
  horse: { clips: ['horse', 'horse-2'], gap: [70, 160], at: 'pasture', gain: 0.6, ref: 60 },
  cow: { clips: ['cow'], gap: [80, 180], at: 'pasture', gain: 0.5, ref: 60 },
};
const HOUSES = ['urasa', 'balagan', 'mogol-urasa'];
const FIRE_ENTRIES = ['ohokh', 'uot-ichchite'];
// Interaction shots: playback gain (default 0.75) and whether to jitter pitch (music stays in tune).
const SHOTS = {
  discover: { gain: 0.5, tune: true }, khomus: { gain: 0.8, tune: true },
  bench: { gain: 0.55 }, 'wood-take': { gain: 0.6 }, 'wood-lay': { gain: 0.65 }, ribbon: { gain: 0.65 },
};

export class AudioScape {
  constructor(game) {
    this.game = game;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = game.save?.settings?.vol ?? 0.85;
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 8;
    limiter.attack.value = 0.005; limiter.release.value = 0.2;
    this.master.connect(limiter).connect(c.destination);
    // outside world → muffling filter (houses) → master
    this.outside = c.createGain();
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass'; this.muffle.frequency.value = 20000; this.muffle.Q.value = 0.5;
    this.outside.connect(this.muffle).connect(this.master);
    this.near = c.createGain(); // footsteps, interactions, the room: never muffled
    this.near.connect(this.master);

    this.buffers = {};
    this.beds = {};
    this.fires = null;
    this.indoor = 0;
    this.gust = 0.6; this.gustT = 0;
    this.lastStep = {};
    this.foot = 1;
    this.timers = {};
    for (const [k, v] of Object.entries(CALLS)) this.timers[k] = rand(4, v.gap[0]);
    this.ready = this.load();
  }

  async load() {
    try { this.manifest = await (await fetch(BASE + 'manifest.json')).json(); } catch (e) { console.warn('audio: no manifest', e); return; }
    await Promise.all(this.manifest.files.map(async (name) => {
      try {
        const data = await (await fetch(`${BASE}${name}.ogg`)).arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(data);
      } catch (e) { console.warn(`audio: ${name} failed`, e); }
    }));
    if (this.started) this.startBeds();
  }

  start() {
    this.started = true;
    this.ctx.resume?.();
    if (this.buffers.breeze) this.startBeds();
  }

  setVolume(v) { this.master.gain.setTargetAtTime(Math.max(0, v), this.ctx.currentTime, 0.05); }

  loopSource(name, dest) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g).connect(dest);
    src.start(0, Math.random() * buf.duration);
    return { src, g };
  }

  startBeds() {
    if (this.bedsOn) return;
    this.bedsOn = true;
    for (const name of BEDS) {
      if (name === 'fire' || name === 'room') continue;
      let dest = this.outside, pan = null;
      if (name === 'lake') { // comes from the nearest shore
        pan = this.panner(8, 1, 'equalpower');
        pan.connect(this.outside); dest = pan;
      }
      const b = this.loopSource(name, dest);
      if (b) this.beds[name] = { ...b, pan };
    }
    const room = this.loopSource('room', this.near);
    if (room) this.beds.room = room;
  }

  panner(ref, rolloff = 1, model = 'HRTF') {
    const p = this.ctx.createPanner();
    p.panningModel = model; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 10000;
    return p;
  }

  static setPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
  }

  // Which house (placement) a point is inside, or null.
  houseAt(x, z) {
    for (const p of this.game.world?.placed || []) {
      if (!HOUSES.includes(p.model) || !p.pad) continue;
      if (Math.hypot(x - p.x, z - p.z) < p.pad * 0.8) return p;
    }
    return null;
  }

  // Hearths: interactables whose entry is the fire / its spirit, plus their house.
  findFires() {
    this.fires = [];
    for (const it of this.game.world?.interactables || []) {
      if (!FIRE_ENTRIES.includes(it.entry)) continue;
      let x, y, z;
      if (it.target?.getWorldPosition) {
        it.target.updateWorldMatrix(true, false);
        const w = it.target.getWorldPosition(new it.target.position.constructor());
        ({ x, y, z } = w);
      } else if (it.zone) { x = it.zone.x; z = it.zone.z; y = this.game.world.groundAt(x, z) + 0.5; } else continue;
      if (this.fires.some((f) => Math.hypot(f.x - x, f.z - z) < 2.5)) continue;
      const pan = this.panner(1.2, 1.3);
      const filt = this.ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 20000;
      pan.connect(filt).connect(this.master);
      AudioScape.setPos(pan, x, y, z);
      const b = this.loopSource('fire', pan);
      if (b) this.fires.push({ x, y, z, house: this.houseAt(x, z), filt, ...b });
    }
  }

  update(dt, { camera, player, game }) {
    const c = this.ctx;
    if (!camera || c.state !== 'running') return;
    const t = c.currentTime;
    // listener follows the camera
    const L = c.listener, e = camera.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    if (L.positionX) {
      L.positionX.value = px; L.positionY.value = py; L.positionZ.value = pz;
      L.forwardX.value = -e[8]; L.forwardY.value = -e[9]; L.forwardZ.value = -e[10];
      L.upX.value = e[4]; L.upY.value = e[5]; L.upZ.value = e[6];
    } else { L.setPosition(px, py, pz); L.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6]); }
    if (!this.bedsOn) return;
    if (!this.fires && game.world?.interactables?.length) this.findFires();

    const pos = player?.pos || { x: px, y: py, z: pz };
    const house = this.houseAt(pos.x, pos.z);
    const inside = (game.engine?.exposureTarget ?? 0) > 0.7 || !!house;
    this.indoor += ((inside ? 1 : 0) - this.indoor) * (1 - Math.exp(-dt / 0.35));
    const k = this.indoor;
    this.muffle.frequency.setTargetAtTime(20000 * Math.pow(650 / 20000, k), t, 0.08);
    this.outside.gain.setTargetAtTime(1 - 0.55 * k, t, 0.08);

    // wind gusts: slow random walk
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = rand(3, 9); this.gustTarget = rand(0.35, 1); }
    this.gust += ((this.gustTarget ?? 0.6) - this.gust) * (1 - Math.exp(-dt / 2.5));

    // position mix
    const d = Math.hypot(pos.x - ALAAS.x, pos.z - ALAAS.z);
    const forest = smooth(ALAAS.r - 110, ALAAS.r + 20, d); // 0 in the meadow, 1 in the taiga
    const edge = smooth(ALAAS.r - 160, ALAAS.r - 50, d) * (1 - smooth(ALAAS.r + 10, ALAAS.r + 80, d));
    const lx = pos.x - LAKE.x, lz = pos.z - LAKE.z, ld = Math.hypot(lx, lz) || 1;
    const shore = ld - LAKE.r; // < 0 over the water
    const nearWater = 1 - smooth(5, 70, shore);
    let sacred = 0;
    for (const p of game.world?.placed || []) if (p.model === 'sacred-birch') sacred = Math.max(sacred, 1 - smooth(6, 45, Math.hypot(pos.x - p.x, pos.z - p.z)));
    const g = this.gust;
    const mix = {
      'wind-larch': (0.12 + 0.75 * forest) * (0.55 + 0.45 * g),
      birch: (0.12 + 0.35 * edge + 0.45 * sacred + 0.12 * (1 - forest)) * (0.5 + 0.5 * g),
      breeze: 0.42 * (1 - forest) * (0.45 + 0.55 * g),
      insects: 0.32 * (1 - forest) * (1 - 0.5 * nearWater) + 0.06,
      lake: 0.9, // distance done by its panner
      mosquito: 0.12 * nearWater + 0.06 * forest,
      birds: 0.22 + 0.25 * forest + 0.1 * edge,
    };
    for (const [name, gain] of Object.entries(mix)) {
      const b = this.beds[name];
      if (b) b.g.gain.setTargetAtTime(gain, t, 0.6);
    }
    const lake = this.beds.lake;
    if (lake) { // nearest shore point, a little above the water
      const r = Math.max(LAKE.r - 2, 0), sx = LAKE.x + lx / ld * r, sz = LAKE.z + lz / ld * r;
      if (shore < 0) AudioScape.setPos(lake.pan, pos.x + 3, LAKE.level + 0.3, pos.z);
      else AudioScape.setPos(lake.pan, sx, LAKE.level + 0.3, sz);
    }
    if (this.beds.room) this.beds.room.g.gain.setTargetAtTime(0.45 * k, t, 0.3);
    for (const f of this.fires || []) {
      const sameRoom = (f.house && f.house === house) || (!f.house && !inside);
      f.g.gain.setTargetAtTime(Math.hypot(f.x - pos.x, f.z - pos.z) > 60 ? 0 : 0.9, t, 0.5);
      f.filt.frequency.setTargetAtTime(sameRoom ? 20000 : 700, t, 0.15);
    }

    // ambient calls
    for (const [kind, def] of Object.entries(CALLS)) {
      this.timers[kind] -= dt;
      if (this.timers[kind] > 0) continue;
      this.timers[kind] = rand(...def.gap);
      if (kind === 'cuckoo' && Math.random() < 0.25) this.timers[kind] = rand(4, 9); // cuckoos call in bouts
      const p = this.where(def.at, pos);
      this.shot(pick(def.clips), p, def.gain * rand(0.75, 1.1), def.ref, this.outside, rand(0.96, 1.04));
    }
  }

  // A point a call comes from.
  where(at, pos) {
    const a = Math.random() * Math.PI * 2;
    const T = this.game.world?.terrain;
    const h = (x, z) => (T ? T.height(x, z) : 0);
    let x, z, up;
    if (at === 'forest') { const r = ALAAS.r + rand(30, 160); x = ALAAS.x + Math.cos(a) * r; z = ALAAS.z + Math.sin(a) * r; up = rand(10, 18); }
    else if (at === 'edge') { const r = ALAAS.r + rand(-15, 40); x = ALAAS.x + Math.cos(a) * r; z = ALAAS.z + Math.sin(a) * r; up = rand(4, 14); }
    else if (at === 'sky') { x = pos.x + Math.cos(a) * rand(20, 70); z = pos.z + Math.sin(a) * rand(20, 70); up = rand(30, 60); }
    else if (at === 'pasture') { // out on the far meadow, never next to the player
      const r = rand(120, ALAAS.r - 40); x = ALAAS.x + Math.cos(a) * r; z = ALAAS.z + Math.sin(a) * r;
      if (Math.hypot(x - pos.x, z - pos.z) < 110) { x = 2 * ALAAS.x - x; z = 2 * ALAAS.z - z; }
      up = 1.4;
    } else { x = pos.x + Math.cos(a) * rand(80, 220); z = pos.z + Math.sin(a) * rand(80, 220); up = rand(8, 25); }
    return { x, y: h(x, z) + up, z };
  }

  // Play a buffer once, optionally from a 3D point (with air absorption by distance).
  shot(name, pos, gain = 1, ref = 2, dest = this.near, rate = 1) {
    const buf = this.buffers[name];
    if (!buf || this.ctx.state !== 'running') return null;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g);
    let tail = g;
    if (pos) {
      const L = c.listener;
      const lx = L.positionX ? L.positionX.value : 0, ly = L.positionY ? L.positionY.value : 0, lz = L.positionZ ? L.positionZ.value : 0;
      const dist = Math.hypot(pos.x - lx, (pos.y ?? ly) - ly, pos.z - lz);
      if (dist > 25) {
        const air = c.createBiquadFilter(); air.type = 'lowpass';
        air.frequency.value = Math.max(1800, 20000 * Math.exp(-dist / 140));
        tail.connect(air); tail = air;
      }
      const p = this.panner(ref, 1);
      AudioScape.setPos(p, pos.x, pos.y ?? ly, pos.z);
      tail.connect(p); tail = p;
    }
    tail.connect(dest);
    src.start();
    src.onended = () => { src.disconnect(); tail.disconnect(); };
    return src;
  }

  // Interaction sounds: 'discover', 'door', 'khomus'… Variants (name-2, name-3) are chosen at random.
  play(name, pos) {
    const variants = [name, `${name}-2`, `${name}-3`].filter((n) => this.buffers[n]);
    if (!variants.length) return null;
    const def = SHOTS[name.replace(/-\d$/, '')] || {};
    const p = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
    if (p) { // a sound at the ear (sitting down) comes from the body below it, not from inside the head
      const L = this.ctx.listener;
      if (L.positionX && Math.hypot(p.x - L.positionX.value, p.y - L.positionY.value, p.z - L.positionZ.value) < 0.5) p.y -= 0.6;
    }
    const gain = (def.gain ?? 0.75) * (def.tune ? 1 : rand(0.82, 1));
    return this.shot(pick(variants), p, gain, 2.5, this.near, def.tune ? 1 : rand(0.94, 1.05));
  }

  // One footstep: a random slice from the surface's sprite, never the same as the last two.
  step(surface, speed = 2) {
    if (!this.manifest || this.ctx.state !== 'running') return;
    const map = { water: 'mud', snow: 'grass' };
    let s = map[surface] || surface;
    const def = this.manifest.steps[s] ? s : 'grass';
    const st = this.manifest.steps[def], buf = this.buffers[`steps-${def}`];
    if (!buf) return;
    const last = this.lastStep[def] || [];
    let i;
    do i = (Math.random() * st.n) | 0; while (st.n > 2 && last.includes(i));
    this.lastStep[def] = [i, last[0]];
    const run = speed > 4;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rand(0.93, 1.07) * (run ? 1.04 : 1);
    const g = c.createGain();
    g.gain.value = (run ? 1 : 0.62) * rand(0.8, 1) * (st.gain ?? 1);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = run ? 14000 : rand(5000, 8000);
    const pan = c.createStereoPanner(); this.foot = -this.foot; pan.pan.value = this.foot * 0.12;
    src.connect(lp).connect(g).connect(pan).connect(this.near);
    const dur = Math.min(st.slot, run ? st.slot * 0.8 : st.slot);
    src.start(0, i * st.slot, dur);
    src.onended = () => { src.disconnect(); pan.disconnect(); };
  }
}
