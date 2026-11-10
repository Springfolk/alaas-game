// Smoke as camera-facing puffs in one instanced draw: each puff rises, swells, slows and drifts
// downwind, fading out. The CPU keeps ~50 puffs; the shader adds rolling noise inside each puff.
// Fill cost (every puff is a blended layer; the smudge fire's 110 cost an M3 Max 13–66 ms a frame at the pen):
// the noise is two lookups of a baked texture, and a puff the eye is inside of thins out and is not drawn.
import * as THREE from 'three/webgpu';
import {
  texture, uv, vec2, float, instancedBufferAttribute, time, color, mix,
} from 'three/tsl';
import { puffTexture } from './textures.js';
import { TIER } from '../../engine/tier.js';
import { mulberry32 } from '../../util.js';

// Tileable gradient noise, three octaves (lattice 8, 24, 48 cells; weights as the procedural one had: 0.6, 0.3,
// 0.12) in one 256² channel, stored as n × 0.5 + 0.5.
let noiseTex = null;
function smokeNoise() {
  if (noiseTex) return noiseTex;
  const S = 256, rnd = mulberry32(977), data = new Uint8Array(S * S * 4), sum = new Float32Array(S * S);
  for (const [N, w] of [[8, 0.6], [24, 0.3], [48, 0.12]]) {
    const gx = new Float32Array(N * N), gy = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { const a = rnd() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / S * N, fy = y / S * N, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const dot = (ix, iy, dx, dy) => { const i = (iy % N) * N + (ix % N); return gx[i] * dx + gy[i] * dy; };
      const u = fade(tx), v = fade(ty);
      const a = dot(x0, y0, tx, ty), b = dot(x0 + 1, y0, tx - 1, ty), c = dot(x0, y0 + 1, tx, ty - 1), d = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
      sum[y * S + x] += (a + (b - a) * u + (c + (d - c) * u - (a + (b - a) * u)) * v) * 1.5 * w; // ×1.5: 2D gradient noise spans about ±0.7
    }
  }
  for (let i = 0; i < S * S; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round((sum[i] * 0.5 + 0.5) * 255))); data[i * 4 + 3] = 255; }
  noiseTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.generateMipmaps = true; noiseTex.minFilter = THREE.LinearMipmapLinearFilter; noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

/**
 * origin: [x, y, z] local; wind: [x, z] m/s; opts: rate (puffs/s), life (s), size [start, end] m,
 * rise m/s, tint (lit colour), shade (shadowed colour), alpha.
 */
export function makeSmoke(origin, wind, opts = {}) {
  // phones: 45% of the puffs, each denser: the smudge fire's overlapping puffs were a warm iPhone's heaviest view
  const phone = TIER.name === 'mobile';
  if (phone) opts = { ...opts, count: Math.ceil((opts.count ?? 56) * 0.45), rate: (opts.rate ?? 4) * 0.45, alpha: Math.min(1, (opts.alpha ?? 0.55) * 1.35) };
  const { count = 56, rate = 4, life = 14, size = [0.7, 5.5], rise = 0.45, tint = 0xc9c6bf, shade = 0x6d6c6a, alpha = 0.55, spread = 0.5, seed = 1 } = opts;
  const geo = new THREE.PlaneGeometry(1, 1);
  const fade = new Float32Array(count * 3); // alpha, seed, age 0..1
  const attr = new THREE.InstancedBufferAttribute(fade, 3).setUsage(THREE.DynamicDrawUsage);
  const a = instancedBufferAttribute(attr);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const tex = puffTexture();
  // rolling noise erodes each puff into wisps as it ages: two copies of the baked noise sliding through each other
  const q = uv().sub(0.5), nt = smokeNoise();
  const at = q.mul(2.2 / 8).add(vec2(a.y.mul(17.13), a.y.mul(7.31))), roll = time.mul(0.15 / 8);
  const n = texture(nt, at.add(vec2(roll, roll.mul(0.37)))).r.add(texture(nt, at.mul(1.13).add(vec2(0.37, 0.61)).sub(vec2(roll.mul(0.53), roll)))).r.sub(1).mul(1.4);
  const base = texture(tex, q.mul(float(1).add(n.mul(0.35))).add(0.5)).r;
  const dens = base.mul(1.25).add(n.mul(0.85)).sub(a.z.mul(0.4)).smoothstep(0.12, 0.75);
  mat.opacityNode = dens.mul(a.x);
  // dense cores are darker and warmer, thin edges catch the light blue-white
  const lit = mix(color(shade), color(tint), float(1).sub(dens).mul(0.7).add(uv().y.mul(0.35)).clamp(0, 1));
  mat.colorNode = lit;
  mat.name = 'smoke';
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'smoke';

  const P = [];
  let acc = 0, s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) P.push({ age: life * (i / count), x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rot: 0, spin: 0, seed: rnd(), dead: false });
  // pre-age the column so it already stands when the world appears
  for (const p of P) spawn(p, p.age);
  function spawn(p, age = 0) {
    p.age = 0; p.dead = false;
    p.x = origin[0] + (rnd() - 0.5) * spread; p.y = origin[1] + rnd() * 0.15; p.z = origin[2] + (rnd() - 0.5) * spread;
    p.vx = (rnd() - 0.5) * 0.12; p.vz = (rnd() - 0.5) * 0.12; p.vy = rise * (0.7 + rnd() * 0.6);
    p.rot = rnd() * Math.PI * 2; p.spin = (rnd() - 0.5) * 0.15; p.seed = rnd();
    if (age) step(p, age);
  }
  function step(p, dt) {
    p.age += dt;
    // buoyancy fades, the wind takes over with height
    const t = p.age / life;
    const w = Math.min(1.3, 0.75 + (p.y - origin[1]) * 0.35);
    p.vy *= Math.exp(-0.18 * dt);
    p.x += (p.vx + wind[0] * w) * dt; p.z += (p.vz + wind[1] * w) * dt; p.y += p.vy * dt;
    p.rot += p.spin * dt;
    if (t >= 1) p.dead = true;
  }

  const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), qz = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  const parentInv = new THREE.Matrix4(), rel = new THREE.Matrix4(), camQ = new THREE.Quaternion(), eye = new THREE.Vector3();
  function update(dt, camera) {
    for (const p of P) {
      if (p.dead) { acc += dt * rate; if (acc >= 1) { acc -= 1; spawn(p); } else continue; }
      step(p, dt);
    }
    // camera rotation and position in the mesh's parent frame
    mesh.parent?.updateWorldMatrix(true, false);
    if (mesh.parent) parentInv.copy(mesh.parent.matrixWorld).invert(); else parentInv.identity();
    rel.multiplyMatrices(parentInv, camera.matrixWorld);
    eye.setFromMatrixPosition(rel);
    camQ.setFromRotationMatrix(rel.extractRotation(rel));
    for (let i = 0; i < count; i++) {
      const p = P[i], t = Math.min(1, p.age / life);
      const sz = size[0] + (size[1] - size[0]) * Math.sqrt(t);
      // fade in quickly, thin out as it spreads; a puff around the eye (it would fill the whole view, layer on
      // layer) thins as the eye goes into it: from its rim to 0 at 0.3 of its radius
      const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z), near = Math.min(1, Math.max(0, (d / sz - 0.15) / 0.35));
      const al = p.dead ? 0 : Math.min(1, p.age / 1.5) * (1 - t) ** 0.9 * alpha * near * near * (3 - 2 * near);
      const shown = al > 0.003 ? sz : 0; // unseen: no area, no fill
      qz.setFromAxisAngle(Z, p.rot);
      qt.copy(camQ).multiply(qz);
      m.compose(pv.set(p.x, p.y, p.z), qt, sc.set(shown, shown, shown));
      mesh.setMatrixAt(i, m);
      fade[i * 3] = al; fade[i * 3 + 1] = p.seed; fade[i * 3 + 2] = t;
    }
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  }
  return { mesh, update };
}
