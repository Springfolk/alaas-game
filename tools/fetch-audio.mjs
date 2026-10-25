// Downloads the real recordings the soundscape uses and bakes them into public/audio/*.ogg (Opus).
// Sources are CC0 Freesound HQ previews plus CC BY-SA Wikimedia Commons khomus demos (credited in docs/credits.md).
// Loops get an equal-power crossfade so they are seamless; footsteps are sliced into sprites (manifest.json).
// Needs ffmpeg with libopus. Downloads are cached in node_modules/.cache/audio-src.
// Usage: node tools/fetch-audio.mjs [name ...]   (no args = everything)
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const FS = (p) => `https://cdn.freesound.org/previews/${p}-hq.mp3`;
// key → source. page: where the licence is shown.
export const SOURCES = {
  'wind-forest': { url: FS('403/403051_338690'), page: 'https://freesound.org/s/403051/', title: 'wind_forest_08_strong' },
  breeze: { url: FS('181/181801_3153523'), page: 'https://freesound.org/s/181801/', title: 'breeze.wav' },
  aspen: { url: FS('452/452317_612689'), page: 'https://freesound.org/s/452317/', title: 'wind heavy trees aspens clatter' },
  lake: { url: FS('614/614299_6501596'), page: 'https://freesound.org/s/614299/', title: 'Gentle waves on a lake' },
  mosquito: { url: FS('477/477794_3472612'), page: 'https://freesound.org/s/477794/', title: 'Mosquito Buzzing' },
  forestbirds: { url: FS('396/396237_449907'), page: 'https://freesound.org/s/396237/', title: 'zablocie-forest-birds-nature-reserve' },
  meadow: { url: FS('529/529573_2061858'), page: 'https://freesound.org/s/529573/', title: 'Meadow with many insects chirps atmo field recording' },
  roomtone: { url: FS('744/744447_14793871'), page: 'https://freesound.org/s/744447/', title: 'Soft Room Tone' },
  campfire: { url: FS('40/40699_25133'), page: 'https://freesound.org/s/40699/', title: 'campfire.wav' },
  cuckoo3: { url: FS('517/517780_8031303'), page: 'https://freesound.org/s/517780/', title: 'CUCKOO - 3' },
  cuckoo9: { url: FS('81/81971_557478'), page: 'https://freesound.org/s/81971/', title: 'Cuckoo 9.WAV' },
  thrush: { url: FS('365/365663_6142149'), page: 'https://freesound.org/s/365663/', title: 'Bird, Thrush Nightingale 02' },
  crows: { url: FS('556/556233_4835746'), page: 'https://freesound.org/s/556233/', title: 'Hooded Crows (Corvus cornix)' },
  crow: { url: FS('741/741366_16104671'), page: 'https://freesound.org/s/741366/', title: 'Hooded Crow: Cawing' },
  woodpecker: { url: FS('428/428146_7455632'), page: 'https://freesound.org/s/428146/', title: 'Great Spotted Woodpecker' },
  skylark: { url: FS('387/387426_2247456'), page: 'https://freesound.org/s/387426/', title: 'Single Skylark' },
  horses: { url: FS('868/868303_15895934'), page: 'https://freesound.org/s/868303/', title: 'Horses - Two Horses Neighing, Distant' },
  whinny: { url: FS('149/149024_2581089'), page: 'https://freesound.org/s/149024/', title: 'Horse_Whinny.wav' },
  cow: { url: FS('233/233145_4056007'), page: 'https://freesound.org/s/233145/', title: 'Cow - Moo (distant)' },
  crane1: { url: FS('846/846522_18447435'), page: 'https://freesound.org/s/846522/', title: 'Common Crane' },
  crane2: { url: FS('548/548491_2762515'), page: 'https://freesound.org/s/548491/', title: 'Crane bird calling.wav' },
  'st-grass': { url: FS('206/206030_770707'), page: 'https://freesound.org/s/206030/', title: 'footsteps grass' },
  'st-dirt': { url: FS('264/264469_1042839'), page: 'https://freesound.org/s/264469/', title: 'Footsteps Dirt 01' },
  'st-forest': { url: FS('274/274833_5239381'), page: 'https://freesound.org/s/274833/', title: 'Forest dry leaves walk' },
  'st-mud': { url: FS('376/376809_2309965'), page: 'https://freesound.org/s/376809/', title: 'MUDDY AND WET FOOTSTEPS' },
  'st-wood': { url: FS('164/164315_2407533'), page: 'https://freesound.org/s/164315/', title: 'Footsteps on wooden flooring' },
  'st-hollow': { url: FS('459/459970_6253486'), page: 'https://freesound.org/s/459970/', title: 'Footsteps on hollow wood' },
  bonfire: { url: FS('186/186374_2421128'), page: 'https://freesound.org/s/186374/', title: 'Bonfire Being Lit' },
  cloth: { url: FS('19/19291_84709'), page: 'https://freesound.org/s/19291/', title: 'foley cloth rustle.wav' },
  fabric: { url: FS('554/554561_456862'), page: 'https://freesound.org/s/554561/', title: 'fabric rubbing / pulling' },
  milkpour: { url: FS('420/420098_7249762'), page: 'https://freesound.org/s/420098/', title: '18-01 Milk pouring_Slow' },
  waterpour: { url: FS('173/173930_3229685'), page: 'https://freesound.org/s/173930/', title: 'Water Pour' },
  bucket: { url: FS('508/508178_9159316'), page: 'https://freesound.org/s/508178/', title: 'Water Pouring Out of Bucket' },
  plunger: { url: FS('318/318637_1038858'), page: 'https://freesound.org/s/318637/', title: 'plunger.wav' },
  plunge: { url: FS('505/505709_2884593'), page: 'https://freesound.org/s/505709/', title: 'plunge1.wav' },
  woodendoor: { url: FS('125/125958_981397'), page: 'https://freesound.org/s/125958/', title: 'Wooden door open-close' },
  polegate: { url: FS('788/788015_12262933'), page: 'https://freesound.org/s/788015/', title: 'Wooden Gate' },
  bellows: { url: FS('368/368498_1463340'), page: 'https://freesound.org/s/368498/', title: 'bellows.wav' },
  bellows2: { url: FS('567/567083_5450487'), page: 'https://freesound.org/s/567083/', title: '20180327_Bellows.wav' },
  sitbench: { url: FS('454/454378_612689'), page: 'https://freesound.org/s/454378/', title: 'wood creak low sit down on loose park bench and get up' },
  sitchair: { url: FS('429/429327_8649084'), page: 'https://freesound.org/s/429327/', title: '18-sentandose silla de madera' },
  woodpile: { url: FS('316/316728_2591786'), page: 'https://freesound.org/s/316728/', title: 'Bois-empile' },
  firewood: { url: FS('489/489885_7581660'), page: 'https://freesound.org/s/489885/', title: 'STACKING - MOVING - SPLIT FIREWOOD' },
  logdrop: { url: FS('681/681416_14819331'), page: 'https://freesound.org/s/681416/', title: 'wooden log drop' },
  khomus2: { url: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Klangdemonstration_einer_jakutischen_Maultrommel.wav', ext: 'wav', licence: 'CC BY-SA 4.0', page: 'https://commons.wikimedia.org/wiki/File:Klangdemonstration_einer_jakutischen_Maultrommel.wav' },
};

// Outputs. kind: loop (seamless bed) | shot (silence trimmed) | steps (sprite of single steps).
// ss/t: segment of the source (s); xf: loop crossfade; db: target RMS (dBFS); mono; hp/lp: filters (Hz); fade: shot in/out (s).
export const OUT = {
  // beds
  'wind-larch': { src: 'wind-forest', kind: 'loop', ss: 4, t: 40, xf: 4, db: -20 },
  birch: { src: 'aspen', kind: 'loop', ss: 8, t: 34, xf: 4, db: -22 },
  breeze: { src: 'breeze', kind: 'loop', ss: 4, t: 36, xf: 4, db: -24, hp: 60 },
  insects: { src: 'meadow', kind: 'loop', ss: 6, t: 40, xf: 4, db: -26 },
  lake: { src: 'lake', kind: 'loop', ss: 10, t: 36, xf: 4, db: -22, mono: true },
  mosquito: { src: 'mosquito', kind: 'loop', ss: 6, t: 20, xf: 3, db: -26, mono: true },
  birds: { src: 'forestbirds', kind: 'loop', ss: 20, t: 60, xf: 5, db: -28, hp: 300 },
  room: { src: 'roomtone', kind: 'loop', ss: 5, t: 24, xf: 3, db: -38, mono: true, lp: 3000 },
  fire: { src: 'campfire', kind: 'loop', ss: 20, t: 28, xf: 3, db: -22, mono: true },
  // ambient calls
  cuckoo: { src: 'cuckoo3', kind: 'shot', ss: 0, t: 12, db: -20, mono: true, hp: 250 },
  'cuckoo-2': { src: 'cuckoo9', kind: 'shot', ss: 0, t: 10, db: -20, mono: true, hp: 250 },
  thrush: { src: 'thrush', kind: 'shot', ss: 0, t: 5.2, db: -22, mono: true, hp: 800 },
  'thrush-2': { src: 'forestbirds', kind: 'shot', ss: 100, t: 8, db: -24, mono: true, hp: 600 },
  crow: { src: 'crows', kind: 'shot', ss: 0, t: 8, db: -20, mono: true, hp: 250 },
  'crow-2': { src: 'crow', kind: 'shot', ss: 0, t: 4.8, db: -20, mono: true, hp: 250 },
  woodpecker: { src: 'woodpecker', kind: 'shot', ss: 0, t: 10, db: -22, mono: true, hp: 300 },
  lark: { src: 'skylark', kind: 'shot', ss: 5, t: 22, db: -24, mono: true, hp: 1200 },
  horse: { src: 'horses', kind: 'shot', ss: 0, t: 3.4, db: -20, mono: true, hp: 150 },
  'horse-2': { src: 'whinny', kind: 'shot', ss: 0, t: 6.9, db: -20, mono: true, hp: 200, lp: 6000 },
  cow: { src: 'cow', kind: 'shot', ss: 0, t: 8, db: -20, mono: true, hp: 80 },
  crane: { src: 'crane1', kind: 'shot', ss: 0, t: 1.43, db: -20, mono: true, hp: 250, fade: [0.005, 0.25] },
  'crane-2': { src: 'crane2', kind: 'shot', ss: 20.6, t: 3.4, db: -20, mono: true, hp: 250, fade: [0.02, 0.6] },
  // footsteps
  'steps-grass': { src: 'st-grass', kind: 'steps', n: 10, slot: 0.5, db: -20 },
  'steps-dirt': { src: 'st-dirt', kind: 'steps', n: 10, slot: 0.5, db: -20 },
  'steps-forest': { src: 'st-forest', kind: 'steps', n: 10, slot: 0.55, db: -20 },
  'steps-mud': { src: 'st-mud', kind: 'steps', n: 10, slot: 0.6, db: -20 },
  'steps-wood': { src: 'st-wood', kind: 'steps', n: 10, slot: 0.5, db: -20, also: 'st-hollow' },
  // interactions
  discover: { src: 'khomus2', kind: 'shot', ss: 49.35, t: 1.35, db: -26, mono: true, fade: [0.003, 0.5] }, // one lone pluck
  'fire-feed': { src: 'bonfire', kind: 'shot', ss: 0, t: 3.4, db: -27, mono: true, fade: [0.05, 1.2] },
  ribbon: { src: 'cloth', kind: 'shot', ss: 0, t: 2.7, db: -24, mono: true },
  'ribbon-2': { src: 'fabric', kind: 'shot', ss: 2, t: 2.5, db: -28, mono: true },
  pour: { src: 'milkpour', kind: 'shot', ss: 0, t: 5, db: -22, mono: true, fade: [0.05, 1] },
  'water-pour': { src: 'waterpour', kind: 'shot', ss: 0, t: 5, db: -28, mono: true, fade: [0.05, 1] },
  'water-pour-2': { src: 'bucket', kind: 'shot', ss: 0, t: 5, db: -28, mono: true, fade: [0.05, 1] },
  churn: { src: 'plunger', kind: 'shot', ss: 0, t: 4, db: -25, mono: true, fade: [0.02, 0.6] },
  door: { src: 'woodendoor', kind: 'shot', ss: 0, t: 1.2, db: -31, mono: true, hp: 70, fade: [0.005, 0.35] }, // latch and swing, no squeal
  gate: { src: 'polegate', kind: 'shot', ss: 0, t: 1.7, db: -27, mono: true, hp: 70, fade: [0.01, 0.4] }, // wooden rattle, no hinge squeal
  bellows: { src: 'bellows', kind: 'shot', ss: 0, t: 5.9, db: -27, mono: true, lp: 9000 },
  'bellows-2': { src: 'bellows2', kind: 'shot', ss: 0, t: 5, db: -25, mono: true, fade: [0.02, 0.8] },
  // sitting down: a body settling on wood (cloth rustle + one soft creak), not a held creak
  bench: { src: 'sitbench', kind: 'shot', ss: 0.15, t: 1.28, db: -30, mono: true, hp: 90, lp: 7000, fade: [0.03, 0.3] },
  'bench-2': { src: 'sitchair', kind: 'shot', ss: 0.86, t: 1.15, db: -30, mono: true, hp: 90, lp: 9000, fade: [0.04, 0.4] },
  // a billet lifted off the pile: one or two dry knocks of split wood
  'wood-take': { src: 'woodpile', kind: 'shot', ss: 26.03, t: 0.45, db: -28, mono: true, hp: 100, fade: [0.004, 0.2] },
  'wood-take-2': { src: 'firewood', kind: 'shot', ss: 8.1, t: 0.42, db: -28, mono: true, hp: 100, fade: [0.004, 0.18] },
  'wood-lay': { src: 'logdrop', kind: 'shot', ss: 0, t: 1, db: -24, mono: true, fade: [0.005, 0.5] },
  'wood-lay-2': { src: 'logdrop', kind: 'shot', ss: 3.15, t: 1, db: -24, mono: true, fade: [0.005, 0.5] },
  khomus: { src: 'khomus2', kind: 'shot', ss: 0, t: 18, db: -20, mono: true, fade: [0.05, 2.5], hp: 60 },
};

const root = new URL('../', import.meta.url);
const cache = new URL('node_modules/.cache/audio-src/', root);
const outDir = new URL('public/audio/', root);
const SR = 48000;
const exists = (u) => access(u).then(() => true, () => false);

function run(args, input) {
  return new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args]);
    const chunks = []; let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code ? rej(new Error(err)) : res(Buffer.concat(chunks))));
    if (input) p.stdin.end(input); else p.stdin.end();
  });
}

async function source(key) {
  const s = SOURCES[key];
  const file = new URL(`${key}.${s.ext || 'mp3'}`, cache);
  if (!(await exists(file))) {
    const r = await fetch(s.url, { headers: { 'User-Agent': 'alaas-fetch-audio/1.0 (game build tool)' } });
    if (!r.ok) throw new Error(`${key}: ${r.status}`);
    await writeFile(file, Buffer.from(await r.arrayBuffer()));
    console.log(`↓ ${key}`);
  }
  return file;
}

// Decode a segment to interleaved float32 at 48 kHz.
async function decode(file, o, ch) {
  const af = [];
  if (o.hp) af.push(`highpass=f=${o.hp}`);
  if (o.lp) af.push(`lowpass=f=${o.lp}`);
  if (o.trim) af.push('silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse');
  const args = ['-i', file.pathname];
  if (o.ss != null) args.unshift('-ss', String(o.ss));
  if (o.dur) args.push('-t', String(o.dur));
  if (af.length) args.push('-af', af.join(','));
  args.push('-ac', String(ch), '-ar', String(SR), '-f', 'f32le', '-');
  const b = await run(args);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

const rms = (a) => { let s = 0; for (const v of a) s += v * v; return Math.sqrt(s / a.length) || 1e-9; };
function normalise(a, db) {
  let g = 10 ** (db / 20) / rms(a);
  let peak = 0; for (const v of a) peak = Math.max(peak, Math.abs(v));
  g = Math.min(g, 0.95 / (peak || 1)); // never clip
  for (let i = 0; i < a.length; i++) a[i] *= g;
  return a;
}

// Seamless loop of length t from a decoded t+xf segment: equal-power crossfade of the tail onto the head.
function makeLoop(a, ch, t, xf) {
  const n = Math.round(t * SR), x = Math.round(xf * SR);
  const out = new Float32Array(n * ch);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let v = a[i * ch + c];
      if (i < x) { const k = i / x; v = v * Math.sin(k * Math.PI / 2) + a[(n + i) * ch + c] * Math.cos(k * Math.PI / 2); }
      out[i * ch + c] = v;
    }
  }
  return out;
}

function fades(a, ch, fin, fout) {
  const n = a.length / ch, fi = Math.round(fin * SR), fo = Math.round(fout * SR);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fi) g = i / fi;
    if (i > n - fo) g = Math.min(g, (n - i) / fo);
    for (let c = 0; c < ch; c++) a[i * ch + c] *= g * g;
  }
  return a;
}

// 10 ms RMS envelope (mono)
function envelope(a, hop = 480) {
  const e = new Float32Array(Math.floor(a.length / hop));
  for (let i = 0; i < e.length; i++) { let s = 0; for (let j = 0; j < hop; j++) { const v = a[i * hop + j]; s += v * v; } e[i] = Math.sqrt(s / hop); }
  return e;
}

// Find single steps: onsets where the envelope jumps over the local floor; keep the cleanest n.
function sliceSteps(a, n, slot) {
  const e = envelope(a), hop = 480, len = Math.round(slot * SR);
  const sorted = [...e].sort((x, y) => x - y), floor = sorted[Math.floor(sorted.length * 0.3)], top = sorted[Math.floor(sorted.length * 0.98)];
  const thr = floor + (top - floor) * 0.3;
  const onsets = [];
  for (let i = 3; i < e.length - 1; i++) {
    if (e[i] > thr && e[i - 3] < thr * 0.6 && (!onsets.length || i - onsets.at(-1).i > (0.15 * SR) / hop)) {
      let pk = 0; for (let j = i; j < Math.min(e.length, i + 15); j++) pk = Math.max(pk, e[j]);
      onsets.push({ i, pk });
    }
  }
  // prefer steps of typical loudness (not the loudest scuffs, not the faintest)
  const pks = onsets.map((o) => o.pk).sort((x, y) => x - y), med = pks[Math.floor(pks.length / 2)];
  const best = onsets.filter((o) => (o.i * hop + len) < a.length).sort((x, y) => Math.abs(Math.log(x.pk / med)) - Math.abs(Math.log(y.pk / med))).slice(0, n);
  best.sort((x, y) => x.i - y.i);
  const out = new Float32Array(best.length * len);
  best.forEach((o, k) => {
    const s0 = Math.max(0, o.i * hop - 0.015 * SR);
    const next = onsets.find((q) => q.i > o.i); // stop before the next footfall
    const end = Math.min(len, next ? next.i * hop - 0.03 * SR - s0 : len);
    const seg = new Float32Array(len); seg.set(a.slice(s0, s0 + end));
    const fo = Math.round(Math.min(0.12, end / SR / 3) * SR), fi = Math.round(0.004 * SR);
    for (let i = 0; i < len; i++) { let g = 1; if (i < fi) g = i / fi; if (i > end - fo) g = Math.max(0, (end - i) / fo); seg[i] *= g; }
    normalise(seg, -20);
    out.set(seg, k * len);
  });
  return { pcm: out, n: best.length };
}

async function encode(name, pcm, ch) {
  const b = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const kbps = ch === 1 ? 64 : 96;
  const out = await run(['-f', 'f32le', '-ar', String(SR), '-ac', String(ch), '-i', '-', '-c:a', 'libopus', '-b:a', `${kbps}k`, '-vbr', 'on', '-application', 'audio', '-f', 'ogg', '-'], b);
  await writeFile(new URL(`${name}.ogg`, outDir), out);
  return out.length;
}

await mkdir(cache, { recursive: true });
await mkdir(outDir, { recursive: true });
const want = process.argv.slice(2);
const manifestFile = new URL('manifest.json', outDir);
{ // fetch the needed sources in parallel (Freesound's CDN is slow per file)
  const keys = [...new Set(Object.entries(OUT).filter(([n]) => !want.length || want.includes(n)).flatMap(([, o]) => [o.src, o.also].filter(Boolean)))];
  const queue = [...keys];
  await Promise.all(Array.from({ length: 8 }, async () => { while (queue.length) await source(queue.shift()); }));
}
const manifest = (await exists(manifestFile)) ? JSON.parse(await readFile(manifestFile, 'utf8')) : { files: [], steps: {} };
for (const [name, o] of Object.entries(OUT)) {
  if (want.length && !want.includes(name)) continue;
  const ch = o.mono || o.kind === 'steps' ? 1 : 2;
  const file = await source(o.src);
  let pcm;
  if (o.kind === 'loop') {
    pcm = normalise(makeLoop(await decode(file, { ...o, dur: o.t + o.xf }, ch), ch, o.t, o.xf), o.db);
  } else if (o.kind === 'steps') {
    let a = await decode(file, { hp: 70 }, 1);
    if (o.also) { const b = await decode(await source(o.also), { hp: 70 }, 1); const c = new Float32Array(a.length + b.length); c.set(a); c.set(b, a.length); a = c; }
    const s = sliceSteps(a, o.n, o.slot);
    pcm = s.pcm;
    manifest.steps[name.slice(6)] = { n: s.n, slot: o.slot };
  } else {
    const [fi, fo] = o.fade || [0.01, 0.3];
    pcm = normalise(fades(await decode(file, { trim: true, ...o, dur: o.t }, ch), ch, fi, fo), o.db);
  }
  const bytes = await encode(name, pcm, ch);
  if (!manifest.files.includes(name)) manifest.files.push(name);
  console.log(`✓ ${name}.ogg ${(bytes / 1024).toFixed(0)} KB${o.kind === 'steps' ? ` (${manifest.steps[name.slice(6)].n} steps)` : ''}`);
}
manifest.files = manifest.files.filter((f) => OUT[f]);
await writeFile(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
