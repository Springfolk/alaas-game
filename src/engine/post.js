// The post chain: [GTAO pre-pass →] scene pass (+ interior sky occlusion) → TRAA → sharpen → glare
// (bloom) → exposure → AgX with a gentle "punchy" look → vignette, grain.
// Also the exposure meter: a 64×36 log-luminance reduction read back a few times a second (eye adaptation).
// Called once by Engine.init (engine.buildPost); reads engine.opts (quality); sets engine.pipeline/grade/meter.
import * as THREE from 'three/webgpu';
import {
  pass, mrt, rtt, normalView, velocity, packNormalToRGB, unpackRGBToNormal, sample, screenUV, uv,
  builtinAOContext, uniform, vec4, Fn, output, float, vec2, vec3, dot, hash, floor, time, screenCoordinate,
  luminance, mat3, max, min, log2, pow, clamp, mix,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { urlFlag } from '../util.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { interiorOcclusion } from './interiors.js';

const SRGB_TO_2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.088), vec3(0.0433, 0.0113, 0.8956));
const R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const AGX_IN = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
const AGX_OUT = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));

// AgX (three's constants) with a look applied in its log/sigmoid space, as Blender's "Punchy" does:
// power deepens the mid-tones, saturation brings back the colour AgX greys out of foliage and sky.
// Returns display-referred linear sRGB.
const agx = (c, power, sat) => {
  const x = log2(AGX_IN.mul(SRGB_TO_2020.mul(c)).max(1e-10)).sub(-12.47393).div(4.026069 + 12.47393).clamp(0, 1).toVar();
  const x2 = x.mul(x), x4 = x2.mul(x2);
  let v = x4.mul(x2).mul(15.5).sub(x4.mul(x).mul(40.14)).add(x4.mul(31.96)).sub(x2.mul(x).mul(6.868)).add(x2.mul(0.4298)).add(x.mul(0.1191)).sub(0.00232).max(0);
  v = pow(v, vec3(power)).toVar();
  v = mix(vec3(dot(v, vec3(0.2126, 0.7152, 0.0722))), v, sat).max(0);
  v = pow(AGX_OUT.mul(v).max(0), vec3(2.2));
  return R2020_TO_SRGB.mul(v).clamp(0, 1);
};

export function buildPost(engine) {
  const { renderer, scene, camera } = engine;
  const tier = engine.opts.quality || (engine.opts.ao ? 'high' : engine.opts.dpr < 1 ? 'low' : 'medium');
  const pipe = engine.pipeline = new THREE.RenderPipeline(renderer);
  // every tier: sky light is shut out inside the houses (only the door and smoke hole let it in)
  const interiors = interiorOcclusion();
  engine.syncInteriors = interiors.sync;
  const occl = interiors.node;
  // FXAA on every tier (below): TRAA left the image soft (-25–30% centre sharpness even after its sharpen) and
  // smeared thin far detail in motion, worst on the upscaled medium/low renders most machines get. ?taa = TRAA.
  const taa = urlFlag('taa');
  let scenePass, depth, vel;
  if (engine.opts.ao) {
    // high: a normals/velocity pre-pass feeds GTAO into the scene pass's ambient light
    const pre = pass(scene, camera);
    pre.transparent = false;
    pre.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
    pre.getTexture('output').type = THREE.UnsignedByteType;
    const preNormal = sample((uv) => unpackRGBToNormal(pre.getTextureNode().sample(uv)));
    depth = pre.getTextureNode('depth');
    vel = pre.getTextureNode('velocity');
    const aoPass = engine.aoPass = ao(depth, preNormal, camera);
    aoPass.resolutionScale = 0.5;
    aoPass.radius.value = 0.6;
    aoPass.thickness.value = 1.2;
    aoPass.useTemporalFiltering = true;
    scenePass = pass(scene, camera);
    scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r.mul(occl));
  } else {
    // medium/low: one scene pass writes colour and velocity together
    scenePass = pass(scene, camera);
    if (taa) scenePass.setMRT(mrt({ output, velocity }));
    scenePass.contextNode = builtinAOContext(occl);
    depth = scenePass.getTextureNode('depth');
    // (an 11-11-10 float colour target, tried for phones: ~2% GPU, and blended decals vanished on it under ANGLE)
    if (taa) vel = scenePass.getTextureNode('velocity'); // asking adds a colour target: only with the MRT that fills it
  }
  let aa = scenePass.getTextureNode('output'), aaTex = aa;
  if (taa) {
    aa = traa(aa, depth, vel, camera);
    aa.useSubpixelCorrection = false;
    aaTex = aa.getTextureNode();
  }

  // glare: a soft veil from the brightest things (sun, sunlit cloud rims, glints on water). The input is
  // capped so the sun glows as through a lens instead of whiting out the frame.
  const useBloom = engine.opts.bloom ?? tier !== 'low';
  const glow = engine.bloom = bloom(aa, 0.1, 0.55, 2.5);
  glow.smoothWidth.value = 6;
  glow.highPassFn = Fn(({ input, threshold, smoothWidth }) => {
    const l = luminance(input.rgb);
    const k = l.sub(threshold).div(smoothWidth).clamp(0, 1);
    return vec4(input.rgb.mul(k.mul(k)).mul(min(1, float(40).div(l.max(1e-4)))), 1);
  });

  // exposure (set by Engine.update), look and grade
  engine.grade = {
    exposure: uniform(1), sharpen: uniform(taa ? 0.8 : 0), // no TRAA softness to undo
    power: uniform(1.12), saturation: uniform(1.18), vignette: uniform(0.16), grain: uniform(tier === 'low' ? 0 : 0.01),
  };
  const g = engine.grade;
  pipe.outputColorTransform = false;
  const graded = Fn(() => {
    // TRAA leaves the image soft: a strong, halo-free sharpen (clamped to the local range; SMAA, tried, shimmered in motion)
    // (FXAA: sharpen 0, so not its four taps either)
    const c = aaTex.sample(screenUV).rgb;
    let col = c;
    if (taa) {
      const d = vec2(1).div(vec2(aaTex.size(0)));
      const n = aaTex.sample(screenUV.add(vec2(0, d.y))).rgb, s = aaTex.sample(screenUV.sub(vec2(0, d.y))).rgb;
      const e = aaTex.sample(screenUV.add(vec2(d.x, 0))).rgb, w = aaTex.sample(screenUV.sub(vec2(d.x, 0))).rgb;
      const lo = min(min(min(n, s), min(e, w)), c), hi = max(max(max(n, s), max(e, w)), c);
      col = clamp(c.add(c.mul(4).sub(n).sub(s).sub(e).sub(w).mul(g.sharpen.mul(0.25))), lo, hi);
    }
    if (useBloom) col = col.add(glow.rgb);
    let o = agx(col.mul(g.exposure), g.power, g.saturation);
    const v = screenUV.sub(0.5).mul(vec2(1.25, 1));
    o = o.mul(float(1).sub(dot(v, v).mul(g.vignette)));
    // to sRGB, then fine luminance grain in display space
    o = mix(o.mul(12.92), pow(o, vec3(1 / 2.4)).mul(1.055).sub(0.055), o.greaterThan(vec3(0.0031308)));
    const seed = screenCoordinate.x.add(screenCoordinate.y.mul(2048)).toUint().add(floor(time.mul(60)).toUint().mul(2654435));
    o = o.add(hash(seed).sub(0.5).mul(g.grain));
    return vec4(o, 1);
  })();
  // FXAA on the graded display-space image (its edge search needs gamma, not linear HDR); ?noaa: none
  // (graded is display-referred 0–1: FXAA reads it from 8 bits, not half floats)
  pipe.outputNode = taa || urlFlag('noaa') ? graded : fxaa(rtt(graded, null, null, { type: THREE.UnsignedByteType }));
  engine.graded = graded; // (tools/iphone.mjs: the 'no fxaa' A/B)

  // exposure meter: mean log2 luminance of the anti-aliased frame, centre-weighted, read back on the CPU
  const W = 64, H = 36;
  const rt = new THREE.RenderTarget(W, H, { depthBuffer: false });
  const mat = new THREE.NodeMaterial();
  mat.toneMapped = false;
  mat.fragmentNode = Fn(() => {
    let sum = float(0);
    for (const [i, j] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      sum = sum.add(log2(luminance(aaTex.sample(uv().add(vec2(i / W, j / H))).rgb).max(1 / 65536)));
    }
    return vec4(sum.div(4).add(16).div(24).clamp(0, 1), 0, 0, 1);
  })();
  const quad = new THREE.QuadMesh(mat);
  const weights = new Float32Array(W * H);
  let wsum = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5) / W - 0.5, dy = (y + 0.5) / H - 0.5;
    wsum += weights[y * W + x] = Math.exp(-(dx * dx * 1.2 + dy * dy * 1.6) * 6);
  }
  engine.meter = {
    log2: null, busy: false, wait: 0,
    tick(dt) {
      this.wait -= dt;
      if (this.busy || this.wait > 0) return;
      this.wait = 0.15; this.busy = true;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      renderer.setRenderTarget(prev);
      renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H).then((px) => {
        let s = 0;
        for (let i = 0; i < W * H; i++) s += weights[i] * (px[i * 4] / 255 * 24 - 16);
        this.log2 = s / wsum;
      }).catch(() => { this.wait = 1e9; }).finally(() => { this.busy = false; });
    },
  };
}
