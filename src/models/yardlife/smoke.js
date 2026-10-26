// Smoke as camera-facing puffs in one instanced draw: each puff rises, swells, slows and drifts
// downwind, fading out. The CPU keeps ~50 puffs; the shader adds rolling noise inside each puff.
import * as THREE from 'three/webgpu';
import {
  texture, uv, vec3, float, instancedBufferAttribute, mx_noise_float, time, color, mix,
} from 'three/tsl';
import { puffTexture } from './textures.js';
import { TIER } from '../../engine/tier.js';

/**
 * origin: [x, y, z] local; wind: [x, z] m/s; opts: rate (puffs/s), life (s), size [start, end] m,
 * rise m/s, tint (lit colour), shade (shadowed colour), alpha.
 */
export function makeSmoke(origin, wind, opts = {}) {
  // phones: 45% of the puffs, each denser, one noise octave: the smudge fire's overlapping puffs were a warm
  // iPhone's heaviest view (blended layers, three noise lookups in each)
  const phone = TIER.name === 'mobile';
  if (phone) opts = { ...opts, count: Math.ceil((opts.count ?? 56) * 0.45), rate: (opts.rate ?? 4) * 0.45, alpha: Math.min(1, (opts.alpha ?? 0.55) * 1.35) };
  const { count = 56, rate = 4, life = 14, size = [0.7, 5.5], rise = 0.45, tint = 0xc9c6bf, shade = 0x6d6c6a, alpha = 0.55, spread = 0.5, seed = 1 } = opts;
  const geo = new THREE.PlaneGeometry(1, 1);
  const fade = new Float32Array(count * 3); // alpha, seed, age 0..1
  const attr = new THREE.InstancedBufferAttribute(fade, 3);
  const a = instancedBufferAttribute(attr);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const tex = puffTexture();
  // rolling noise erodes each puff into wisps as it ages
  const q = uv().sub(0.5);
  const drift = vec3(q.mul(2.2), a.y.mul(17).add(time.mul(0.15)));
  const n = phone ? mx_noise_float(drift).mul(0.85)
    : mx_noise_float(drift).mul(0.6).add(mx_noise_float(drift.mul(2.7)).mul(0.3)).add(mx_noise_float(drift.mul(6.1)).mul(0.12));
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
  const parentInv = new THREE.Matrix4();
  function update(dt, camera) {
    for (const p of P) {
      if (p.dead) { acc += dt * rate; if (acc >= 1) { acc -= 1; spawn(p); } else continue; }
      step(p, dt);
    }
    // camera rotation in the mesh's parent frame
    mesh.parent?.updateWorldMatrix(true, false);
    if (mesh.parent) parentInv.copy(mesh.parent.matrixWorld).invert(); else parentInv.identity();
    const camQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(parentInv.clone().multiply(camera.matrixWorld)));
    for (let i = 0; i < count; i++) {
      const p = P[i], t = Math.min(1, p.age / life);
      const sz = size[0] + (size[1] - size[0]) * Math.sqrt(t);
      qz.setFromAxisAngle(Z, p.rot);
      qt.copy(camQ).multiply(qz);
      m.compose(pv.set(p.x, p.y, p.z), qt, sc.set(sz, sz, sz));
      mesh.setMatrixAt(i, m);
      // fade in quickly, thin out as it spreads
      const al = p.dead ? 0 : Math.min(1, p.age / 1.5) * (1 - t) ** 0.9 * alpha;
      fade[i * 3] = al; fade[i * 3 + 1] = p.seed; fade[i * 3 + 2] = t;
    }
    mesh.instanceMatrix.needsUpdate = true;
    attr.needsUpdate = true;
  }
  return { mesh, update };
}
