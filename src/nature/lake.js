// The alaas lake: still, peat-dark water with a half-resolution planar sky reflection, wind ripples
// that brighten in rolling gust patches (cat's paws), and depth from the baked terrain field, so the
// shallows show the muddy bed and the edge fades to a wet line with no foam.
import * as THREE from 'three/webgpu';
import {
  Fn, texture, reflector, positionWorld, cameraPosition, vec2, vec3, vec4, float, normalize, dot, max, pow, mix, exp,
  smoothstep, clamp, length, reflect,
} from 'three/tsl';
import { LAKE } from '../world/terrain.js';
import { natureField, natureWind } from './grass.js';
import { mulberry32 } from '../util.js';
import { compiling, CULL_LAYER } from '../engine/merge.js';
import { mirror } from '../engine/lod.js';

// Tiling ripple normal map: random short-crested waves (periodic in the tile), normals in RG.
function rippleTexture() {
  const N = 256, h = new Float32Array(N * N), rnd = mulberry32(77);
  const waves = Array.from({ length: 24 }, () => {
    const a = rnd() * Math.PI * 2, k = 2 + Math.floor(rnd() * 14);
    return { kx: Math.round(Math.cos(a) * k), ky: Math.round(Math.sin(a) * k), amp: 1 / k, ph: rnd() * 6.28 };
  });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const w of waves) v += w.amp * Math.sin((w.kx * x + w.ky * y) / N * Math.PI * 2 + w.ph);
    h[y * N + x] = v;
  }
  const d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N];
    const dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
    const k = (y * N + x) * 4;
    d[k] = 128 + Math.max(-127, Math.min(127, dx * 18)); d[k + 1] = 128 + Math.max(-127, Math.min(127, dy * 18)); d[k + 2] = 255; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

export default async function build(ctx, world) {
  const F = natureField(world), W = natureWind(world);
  const engine = world.engine;
  const ripples = rippleTexture();

  const refl = reflector({ resolutionScale: world.engine.opts.reflection ?? 0.35 });
  engine.reflector = refl.reflector; // dynamic quality scales its resolution (Engine.knob)
  refl.target.rotateX(-Math.PI / 2);
  refl.target.position.set(LAKE.x, LAKE.level, LAKE.z);
  world.scene.add(refl.target);
  // the reflection skips the dense near grass (layer 1); the mid grass and shore plants still mirror
  refl.reflector.getVirtualCamera(engine.camera).layers.disableAll();
  refl.reflector.getVirtualCamera(engine.camera).layers.enable(0);
  // the reflection reuses this frame's sun shadow map: re-rendering (and re-fitting) the cascades
  // for the mirrored camera would cost a whole shadow pass and leave the map fitted to the wrong view
  const base = refl.reflector, render = base.updateBefore.bind(base);
  // perf: model parts the mirror can't show are hidden for the mirrored pass only (visibility, not layers:
  // no recompiles, raycasts unaffected) — those whose reflected sight line meets the water plane outside
  // the lake, and those under ~3 reflection pixels across
  let parts = null;
  const scale = world.engine.opts.reflection ?? 0.35;
  const ground = world.ground;
  const collect = () => {
    parts = [];
    const sp = new THREE.Sphere();
    for (const { object } of world.placed) object.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      sp.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
      // lowest point: the sphere's bottom, but not below the ground it stands on (nothing is drawn under it)
      const lo = Math.max(sp.center.y - sp.radius, world.terrain.height(sp.center.x, sp.center.z) - 0.5);
      parts.push({ o, x: sp.center.x, y: sp.center.y, z: sp.center.z, r: sp.radius, lo });
    });
  };
  const hidden = [];
  let standIns = null;
  base.updateBefore = (frame) => {
    const sh = engine.sun.shadow, auto = sh.autoUpdate;
    sh.autoUpdate = false;
    const cam = engine.camera, e = cam.position, vcam = base.getVirtualCamera(cam);
    // while the loader builds every shader: mirror everything, culled parts included
    const all = compiling(cam);
    if (all) vcam.layers.enable(CULL_LAYER);
    if (!parts) collect();
    const k = 3 / Math.max(1, innerHeight * scale) * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const eh = Math.max(0.05, e.y - LAKE.level), R = LAKE.r + 30; // R: the water disc
    // where the sight line to a mirrored point at height h crosses the water: a fraction eh / (eh + h) of the way
    const seen = (p) => {
      const lo = p.lo - LAKE.level, hi = p.y + p.r - LAKE.level;
      if (lo <= 0.05) return true;
      const t1 = eh / (eh + lo), t2 = eh / (eh + hi), dx = p.x - e.x, dz = p.z - e.z;
      // distance from the lake centre to the crossing segment t2..t1
      const ax = e.x + dx * t2 - LAKE.x, az = e.z + dz * t2 - LAKE.z, sx = dx * (t1 - t2), sz = dz * (t1 - t2);
      const u = Math.min(1, Math.max(0, -(ax * sx + az * sz) / (sx * sx + sz * sz || 1)));
      return Math.hypot(ax + sx * u, az + sz * u) < R + p.r * t1 + 2;
    };
    // the models far from the water mirror as their impostors (lod.js): cheaper, and no reflection shaders to build
    if (!standIns && world.optimized?.impostors) standIns = world.optimized.mirrored();
    for (const o of standIns || []) if (o.visible) { o.visible = false; hidden.push(o); }
    mirror.value = 1;
    for (const p of parts) {
      if (all || !p.o.visible) continue;
      if (2 * p.r < Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) * k || !seen(p)) { p.o.visible = false; hidden.push(p.o); }
    }
    // the reflection gets the coarse ground (ground.js): the fine grid's tiles draw nothing for this pass
    const tiles = ground?.userData.tiles || [], coarse = ground?.getObjectByName('ground-coarse');
    if (coarse) { for (const t of tiles) t.visible = false; coarse.visible = true; }
    try { return render(frame); } finally {
      if (coarse) { for (const t of tiles) t.visible = true; coarse.visible = false; }
      if (all) vcam.layers.disable(CULL_LAYER);
      mirror.value = 0;
      sh.autoUpdate = auto;
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    }
  };

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const wp = positionWorld.xz;
  const toCam = cameraPosition.sub(positionWorld);
  const dist = length(toCam);
  const V = toCam.div(dist);

  const fx = Fn(() => {
    // ripples: two scrolling layers; strength follows the gusts, calmer in the sheltered margins
    const t = W.time;
    const a = texture(ripples, wp.mul(0.11).add(W.dir.mul(t.mul(0.035)))).xy.sub(0.5);
    const b = texture(ripples, wp.mul(0.27).add(vec2(W.dir.y, W.dir.x.negate()).mul(t.mul(0.05)))).xy.sub(0.5);
    const c = texture(ripples, wp.mul(0.9).sub(W.dir.mul(t.mul(0.11)))).xy.sub(0.5);
    const A = F.sampleA(wp);
    const depth = max(float(LAKE.level).sub(A.x.add(F.HBASE)), 0);
    const gust = W.gust(wp);
    const strength = mix(0.05, 0.45, gust.mul(gust)).mul(smoothstep(0, 0.6, depth).mul(0.7).add(0.3)).mul(W.strength);
    const g = a.mul(0.6).add(b.mul(0.5)).add(c.mul(0.35)).mul(strength).mul(float(1).sub(smoothstep(60, 300, dist)).mul(0.8).add(0.2));
    const N = normalize(vec3(g.x.negate(), 1, g.y.negate()));

    // reflection: planar, nudged by the ripple slope
    refl.uvNode = refl.uvNode.add(g.mul(0.35).div(dist.mul(0.02).add(1)));
    const R = refl.rgb.mul(0.9); // a little light is lost even on still water
    const cosT = clamp(dot(N, V), 0, 1);
    const fres = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosT), 5)));

    // peaty water: what little light comes back up is brown-olive; the shallows show the mud bed
    const body = mix(vec3(0.026, 0.024, 0.012), vec3(0.008, 0.009, 0.005), smoothstep(0.2, 1.6, depth));
    const sunLit = W.sunCol.mul(max(W.sunDir.y, 0)).mul(0.06);
    const col = body.mul(sunLit.add(0.3));
    // sun glints on the ripples
    const Rv = reflect(V.negate(), N);
    const glint = pow(max(dot(Rv, W.sunDir), 0), 900).mul(6).add(pow(max(dot(Rv, W.sunDir), 0), 120).mul(0.12));
    const rgb = mix(col, R, fres).add(W.sunCol.mul(glint).mul(0.12));
    // see-through at the edge: opacity from depth along the view ray
    const path = depth.div(max(cosT, 0.08));
    const opac = float(1).sub(exp(path.mul(-2.6))).max(fres).clamp(0, 1).mul(smoothstep(0.0, 0.05, depth));
    return vec4(rgb, opac);
  })();
  mat.colorNode = fx.rgb;
  mat.opacityNode = fx.a;

  const geo = new THREE.CircleGeometry(LAKE.r + 30, 160);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, mat);
  water.position.set(LAKE.x, LAKE.level, LAKE.z);
  water.name = 'lake';
  water.castShadow = false;
  water.receiveShadow = false;
  water.renderOrder = 1;
  world.scene.add(water);
}
