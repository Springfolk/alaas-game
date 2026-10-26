// Renderer, sky, sun (with drifting cloud shadows), aerial haze and the post chain
// (post chain: post.js; sky and clouds: sky.js; interior sky occlusion: interiors.js).
import * as THREE from 'three/webgpu';
import {
  uniform, vec4, Fn, output, positionWorld, positionView, float, exp, max, cameraPosition, dot, smoothstep, texture, uv,
} from 'three/tsl';
import { buildPost } from './post.js';
import { fastPMREM } from '../load/pmrem.js';
import { PRESETS, TIER, LITE, setTier, detectTier, bootStep, bootFailed } from './tier.js';
import { setTextureMax } from './materials.js';
import { makeSky, updateSky, cloudField, cloudCover, CLOUD_Y } from './sky.js';
import { sunMask } from './master.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { urlFlag, KEYART } from '../util.js';

// exposure for a sunlit scene; METER_REF = its metered mean log2 luminance (post.js meter)
const EXPOSURE = 0.75, METER_REF = -1.75;
const SUN_DAY = new THREE.Color(0xfff5ea), SUN_LOW = new THREE.Color(0xffa060);

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    // device tier presets (src/engine/tier.js): high | medium | low | mobile, or 'auto' → detected in init()
    this.requested = KEYART ? { ...opts, quality: 'high' } : opts;
    const q = this.requested.quality;
    this.tier = PRESETS[q] ? q : 'medium';
    this.opts = this.presetOpts(this.tier);
    this.fpsCap = 60; // frame pacing (pace())
    this.resScale = 1; // dynamic resolution: drops when frames run long, recovers when there is room
    this.frameTimes = [];
    this.sunElev = 40; this.sunAz = 215; // degrees; azimuth 0 = north (−Z), 90 = east (+X)
    this.exposure = EXPOSURE; this.exposureTarget = 0.62; // houses raise the target (a hint: the meter decides)
  }

  presetOpts(tier) {
    const { quality, ...rest } = this.requested;
    // ?keyart: the high preset maxed — 4096 shadow maps over the whole shot, full-resolution lake mirror
    return { post: true, ...setTier(tier, KEYART ? { shadows: 4096, shadowFar: 900, reflection: 1, texMax: 4096 } : this.tierExtra), ...rest };
  }

  async init() {
    const auto = !PRESETS[this.requested.quality];
    // boot guard (tier.js): after a load the OS killed, step down — 1: mobile → LITE, medium → low; 2: WebGL2 too
    const step = this.bootStep = KEYART ? 0 : bootStep(auto);
    if (step >= 2) this.requested = { ...this.requested, webgl: true };
    if (auto) { // 'auto' (default): pick by device
      const d = await detectTier({ webgl: !!this.requested.webgl });
      this.tier = d.name;
      this.tierExtra = d.extra || (step && this.tier === 'mobile' ? LITE : undefined);
      if (step && this.tier !== 'mobile') this.tier = 'low';
      this.opts = this.presetOpts(this.tier);
      TIER.auto = true; TIER.reason = d.reason + (step ? `, boot step ${step}` : '');
    }
    this.tierAuto = TIER.auto;
    // battery saver (30 fps) by default on phones, and on a laptop whose battery runs low (≤20%, unplugged)
    // where the Battery Status API reports it (Chromium; Safari has none: the setting is the fallback)
    this.autoSaver = this.tier === 'mobile';
    navigator.getBattery?.().then((b) => {
      const upd = () => { this.autoSaver = this.tier === 'mobile' || (!b.charging && b.level <= 0.2); };
      upd(); b.addEventListener('chargingchange', upd); b.addEventListener('levelchange', upd);
    }).catch(() => {});
    setTextureMax(this.opts.texMax);
    const r = this.renderer = new THREE.WebGPURenderer({ canvas: this.canvas, antialias: false, forceWebGL: !!this.opts.webgl, trackTimestamp: this.opts.gpuTime ?? urlFlag('gputime') });
    r.library.addLight(SunLightNode, SunLight);
    // lost while loading (bootDone not yet called): reload a step down; in play: main.js's onLost (reload, resume)
    const lost = r.onDeviceLost.bind(r);
    r.onDeviceLost = (info) => { lost(info); if (KEYART) return; bootFailed(); this.onLost?.(info); };
    r.setPixelRatio(Math.min(devicePixelRatio, this.opts.dpr) * this.resScale);
    r.setSize(innerWidth, innerHeight, false);
    r.shadowMap.enabled = true;
    r.toneMapping = THREE.AgXToneMapping;
    r.toneMappingExposure = 1;
    await r.init();
    this.backend = r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 6000);

    // sun radiance (colour × intensity) and the sky/cloud layer: src/engine/sky.js
    this.sunColor = uniform(new THREE.Color());
    const sky = this.sky = makeSky(this);
    scene.add(sky);

    const sun = this.sun = new SunLight(SUN_DAY, 3.4);
    sun.castShadow = true;
    sun.shadow.camera.far = this.opts.shadowFar; // tighter cascades: crisp shadows near the eye
    // cloud shadows: the sun is dimmed where the sky's own cumulus layer (CLOUD_Y up) blocks it,
    // so the shadows drifting over the alaas belong to the clouds overhead. Every lit material gets them.
    this.cloudShadow = uniform(0.7); // how dark a cloud shadow is (0 = none): ~1.5 EV, the sky still lights it
    this.cloudCover = cloudCover;    // noise threshold: lower = more of the ground in shadow
    // The coarse cloud field is rendered each frame into a small texture around the view (cloudMap) and
    // sampled per pixel, instead of three noise octaves in every lit pixel.
    const cm = this.cloudMap = makeCloudMap();
    sun.colorNode = Fn(() => {
      const L = this.sky.sunPosition;
      const up = max(L.y, 0.08);
      const q = positionWorld.xz.add(L.xz.mul(float(CLOUD_Y).sub(positionWorld.y).div(up)));
      const n = texture(cm.rt.texture, q.sub(cm.origin).div(CLOUD_SPAN).add(0.5)).r;
      const c = smoothstep(cloudCover, cloudCover.add(0.16), n);
      return this.sunColor.mul(float(1).sub(c.mul(this.cloudShadow))).mul(sunMask); // per-material sun mask (master.js)
    })();
    sun.shadow.mapSize.setScalar(this.opts.shadows);
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    scene.add(sun);

    // aerial perspective: distance haze that thins with height (airlight from the horizon sky),
    // brighter and warmer towards the sun (forward Mie scattering)
    this.haze = {
      color: uniform(new THREE.Color()), sun: uniform(new THREE.Color()),
      density: uniform(0.00024), falloff: uniform(0.012), base: uniform(80),
    };
    const h = this.haze;
    scene.fogNode = Fn(() => {
      const d = positionView.length();
      const lift = exp(max(positionWorld.y.sub(h.base), 0).mul(h.falloff).negate());
      const f = float(1).sub(exp(d.mul(h.density).mul(lift).negate())).clamp(0, 0.94);
      const cosT = dot(positionWorld.sub(cameraPosition).div(d.max(1e-3)), this.sky.sunPosition);
      const hg = float(0.51).div(float(1.49).sub(cosT.mul(1.4)).pow(1.5)); // Henyey-Greenstein, g = 0.7
      const air = h.color.add(h.sun.mul(hg));
      return vec4(f.mix(output.rgb, air), output.a);
    })();

    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    scene.environmentIntensity = 1; // the sky is in absolute units matched to the sun (sky.js)
    this.setSun(this.sunElev, this.sunAz);
    if (this.opts.post) this.buildPost();
    addEventListener('resize', () => this.resize());
    return this;
  }

  buildPost() { buildPost(this); }

  // Sun from elevation/azimuth in degrees; sky, haze, sun colour and the environment map follow.
  setSun(elev, az) {
    this.sunElev = elev; this.sunAz = az;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const th = THREE.MathUtils.degToRad(az);
    // azimuth from north (−Z) clockwise towards east (+X)
    this.sun.position.set(Math.sin(phi) * Math.sin(th), Math.cos(phi), -Math.sin(phi) * Math.cos(th));
    const day = THREE.MathUtils.clamp(elev / 28, 0, 1);
    this.sun.color.lerpColors(SUN_LOW, SUN_DAY, day);
    // direct sun through the air mass (Kasten–Young): 5.2 at 40°, ~3.6 at 12°, ~1.9 at 5°
    const m = 1 / (Math.sin(THREE.MathUtils.degToRad(Math.max(elev, 0.5))) + 0.50572 * Math.pow(Math.max(elev, 0.5) + 6.07995, -1.6364));
    this.sun.intensity = 5.6 * Math.exp(-0.12 * (m - 1));
    this.sunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    this.sky.sunPosition.value.copy(this.sun.position);
    // haze = the horizon sky at 90° from the sun, plus a forward-scattering lobe that matches the sky towards it
    const { horizon, towardSun } = updateSky(this.sky, this.sun.position, this.sunColor.value);
    const cosS = Math.cos(THREE.MathUtils.degToRad(Math.max(elev, 0) - 2));
    const hg = (c) => 0.51 / Math.pow(1.49 - 1.4 * c, 1.5);
    const k = 0.6 / (hg(cosS) - hg(0)); // 0.6: near haze stays a little darker than the long sky path
    this.haze.sun.value.copy(towardSun).sub(horizon).multiplyScalar(k);
    this.haze.sun.value.r = Math.max(0, this.haze.sun.value.r); this.haze.sun.value.g = Math.max(0, this.haze.sun.value.g); this.haze.sun.value.b = Math.max(0, this.haze.sun.value.b);
    this.haze.color.value.copy(horizon).sub(this.haze.sun.value.clone().multiplyScalar(hg(0)));
    this.envRT?.dispose();
    this.sky.showSunDisc.value = 0;
    this.envScene.add(this.sky);
    this.envRT = this.pmrem.fromScene(this.envScene);
    this.scene.add(this.sky);
    this.sky.showSunDisc.value = 1;
    this.scene.environment = this.envRT.texture;
    (this.scene.environmentNode ||= fastPMREM(this.envRT.texture)).value = this.envRT.texture; // same light, cheaper shader builds (src/load/pmrem.js)
  }

  // Eye adaptation: the exposure follows the metered frame (post.js) — partly, as eyes do, faster
  // towards light than towards dark. Without the meter, the houses' exposureTarget hints drive it.
  update(dt) {
    this.dynamicResolution(dt);
    this.cloudMap?.render(this.renderer, this.camera, this.sky.sunPosition.value);
    this.syncInteriors?.();
    this.meterDt = dt;
    const m = this.meter?.log2;
    const target = m != null
      ? EXPOSURE * Math.min(6, Math.max(0.45, 2 ** ((METER_REF - m) * 0.75)))
      : EXPOSURE * this.exposureTarget / 0.62;
    const rate = target < this.exposure ? 2.2 : 0.9;
    this.exposure += (target - this.exposure) * (1 - Math.exp(-rate * dt));
    if (this.grade) this.grade.exposure.value = this.exposure;
    this.renderer.toneMappingExposure = this.exposure;
  }

  // Frame pacing: true when a frame is due on this animation frame (`now` = its timestamp, ms) for `fps`
  // (0 = none). Draws every n-th display refresh, n = refreshes per capped frame (120 Hz → every 2nd for 60),
  // so frame intervals stay even; a refresh rate the cap doesn't divide (75, 90, 144 Hz) runs every refresh
  // (or every 2nd at 144) — never below the cap. The refresh interval is the low quartile of recent rAF deltas,
  // at most 1/58 s: a device too slow to draw every refresh must not read as a slow display (its frames would
  // then always "keep pace" and dynamic quality never step down).
  pace(now, fps) {
    const d = now - (this.lastTick ?? now);
    this.lastTick = now;
    const r = this.rafDeltas ||= [];
    if (d > 2 && d < 60) r.push(d);
    if (r.length >= 31) { r.sort((a, b) => a - b); this.vsync = r[7]; r.length = 0; }
    const v = Math.min(this.vsync || 1000 / 60, 1000 / 58);
    this.vsyncs = (this.vsyncs || 0) + Math.max(1, Math.round(d / v));
    if (!fps) return false;
    const n = Math.max(1, Math.floor(1000 / fps / v + 0.2)); // +0.2: tolerates a noisy refresh estimate
    if (this.vsyncs < n) return false;
    this.vsyncs = 0;
    this.paceIv = n * v;
    if (n !== this.paceN || fps !== this.paceFps) { this.paceN = n; this.paceFps = fps; this.frameTimes.length = 0; }
    return true;
  }

  // Every ~1.5 s: if frames miss the paced interval (a few missed refreshes: ≥12% over on average) render
  // fewer pixels; when they all keep it, give pixels back — but not straight back to a scale that just
  // failed (ceiling, retried after 30 s). Holds the frame rate by resolution instead of dropping frames.
  // Still slow at the resolution floor: one cheaper knob per window (KNOBS: none builds a shader). A knob
  // comes back, last first, once resolution is full again and frames kept pace for `knobWait` (10 s;
  // doubled, ≤2 min, when a restored knob fails again within 20 s).
  dynamicResolution(dt) {
    if (dt <= 0 || KEYART) return; // ?keyart: full resolution however long a frame takes
    const f = this.frameTimes, iv = this.paceIv || 1000 / 60;
    f.push(Math.min(dt * 1000, iv * 3));
    if (f.length * iv < 1500) return;
    let sum = 0;
    for (const x of f) sum += x;
    const avg = sum / f.length;
    f.length = 0;
    const prev = this.resScale, now = performance.now();
    if (this.resCeil && now - this.resCeilAt > 30000) this.resCeil = 0;
    if (avg > iv * 1.12) {
      this.resCeil = this.resScale; this.resCeilAt = now;
      // floor: the tier's resMin pixel ratio (high: CSS pixels, never upscaled), else 55% of the start ratio
      const base = Math.min(devicePixelRatio, this.opts.dpr), resMin = this.opts.resMin;
      const floor = resMin ? Math.min(1, resMin / base) : 0.55;
      if (this.resScale > floor) this.resScale = Math.max(floor, this.resScale - (avg > iv * 1.6 ? 0.15 : 0.08));
      else this.knob(-1, now);
    } else if (avg < iv * 1.02 && this.resScale < 1 && (!this.resCeil || this.resScale + 0.05 < this.resCeil)) {
      this.resScale = Math.min(1, this.resScale + 0.05);
    } else if (avg < iv * 1.02 && this.resScale >= 1 && this.knobs?.length && now - this.knobAt > this.knobWait) this.knob(1, now);
    if (this.resScale !== prev) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.opts.dpr) * this.resScale);
      this.renderer.setSize(innerWidth, innerHeight, false);
    }
  }

  // One knob down (dir −1) or the last one back up (+1). Each changes only sizes, counts or the frame cap.
  knob(dir, now) {
    const on = this.knobs ||= [];
    this.knobWait ||= 10000;
    if (dir < 0) {
      const k = KNOBS.find((k) => !on.includes(k) && k.ok(this));
      if (!k) return;
      if (now - this.knobAt < 20000 && this.knobUp === k) this.knobWait = Math.min(120000, this.knobWait * 2);
      on.push(k); k.set(this, true);
    } else {
      const k = this.knobUp = on.pop();
      k.set(this, false);
    }
    this.knobAt = now;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  render() {
    if (this.pipeline) { this.pipeline.render(); this.meter?.tick(this.meterDt || 0); }
    else this.renderer.render(this.scene, this.camera);
  }
}

// Dynamic quality steps after resolution (Engine.knob), cheapest loss first; none needs a new shader or pipeline.
const KNOBS = [
  { name: 'shadow range ×0.7', ok: () => true, set: (e, d) => { e.sun.shadow.camera.far = e.opts.shadowFar * (d ? 0.7 : 1); } }, // fewer casters per cascade
  { name: 'lake mirror ×0.6', ok: (e) => !!e.reflector, set: (e, d) => { e.reflector.resolutionScale = e.opts.reflection * (d ? 0.6 : 1); } },
  { name: '30 fps', ok: (e) => e.fpsCap > 30, set: (e, d) => { e.capDown = d; } }, // main.js tick
];

// The coarse cloud field (sky.js cloudField, what cloud shadows use) over CLOUD_SPAN m of the cloud plane
// around where the view's ground looks up to through the sun, in a 512² half-float texture (16 m texels;
// the finest octave is ~110 m). Re-rendered each frame (it drifts), centred on a texel-snapped origin.
const CLOUD_SPAN = 8192;
function makeCloudMap() {
  const N = 512;
  const rt = new THREE.RenderTarget(N, N, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
  const origin = uniform(new THREE.Vector2());
  const mat = new THREE.NodeMaterial();
  mat.toneMapped = false;
  // texel centres: uv (0,0) is the texture's first row, the same convention the sampling uses
  mat.fragmentNode = Fn(() => vec4(cloudField(origin.add(uv().sub(0.5).mul(CLOUD_SPAN))), 0, 0, 1))();
  const quad = new THREE.QuadMesh(mat);
  const step = CLOUD_SPAN / N;
  return {
    rt, origin,
    render(renderer, camera, L) {
      const up = Math.max(L.y, 0.08), k = (CLOUD_Y - camera.position.y) / up;
      origin.value.set(Math.round((camera.position.x + L.x * k) / step) * step, Math.round((camera.position.z + L.z * k) / step) * step);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      renderer.setRenderTarget(prev);
    },
  };
}
