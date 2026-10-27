// The summer fire on the clay hearth: a bed of ash and embers, a few burning billets, flame sheets,
// a flickering warm light, smoke rising out through the smoke hole, and a shaft of sun through the hole.
import * as THREE from 'three/webgpu';
import {
  uv, vec2, vec3, float, mix, positionLocal, normalView, attribute, uniform, time, abs, length, pow, max,
  mx_fractal_noise_float, mx_worley_noise_float, mx_noise_float, step, dot, cross, exp,
} from 'three/tsl';
import { TAU, tube, merge, grid } from './geom.js';
import { HEARTH } from './interior.js';
import { occ, bump, smoothstep } from './mats.js';
import { valueNoise } from '../../util.js';

const fbm = (p, o = 3) => mx_fractal_noise_float(p, o, 2, 0.5).mul(0.5).add(0.5);

// holeY / holeR: the smoke hole's height and radius; coneR(y): the inside radius of the cone at height y
const FIRE_LIGHT = { intensity: 9, distance: 9 }; // reaches the wall 4.8 m away
export function buildFire(rng, { holeY, holeR, coneR }) {
  const group = new THREE.Group();
  const uFlare = uniform(0), uFlick = uniform(1);
  const y0 = HEARTH.top - 0.01;

  // ---- ash and embers
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    const p = positionLocal, r = length(vec2(p.x, p.z));
    const w = mx_worley_noise_float(p.mul(38));
    const n = fbm(p.mul(9), 3);
    m.colorNode = mix(vec3(0.2, 0.19, 0.18), vec3(0.04, 0.035, 0.03), smoothstep(0.32, 0.1, r).mul(n.mul(0.6).add(0.5)).clamp(0, 1));
    const hot = smoothstep(0.24, 0.04, r.add(n.mul(0.08))).mul(pow(smoothstep(0.55, 0.0, w), 2.0));
    const pulse = mx_noise_float(vec3(p.x.mul(14), p.z.mul(14), time.mul(0.9))).mul(0.35).add(0.75);
    m.emissiveNode = vec3(1.0, 0.32, 0.06).mul(hot).mul(pulse).mul(uFlick).mul(uFlare.mul(1.5).add(1)).mul(5);
    m.aoNode = occ(p);
    m.normalNode = bump(n.mul(0.004));
    const g = grid(24, 6, (u, v) => {
      const a = u * TAU, r = 0.0001 + v * 0.42;
      return [Math.cos(a) * r, y0 + Math.max(0, 0.045 * (1 - (r / 0.34) ** 2)) + valueNoise(Math.cos(a) * r * 20, Math.sin(a) * r * 20, 61) * 0.006, Math.sin(a) * r];
    }, (u, v) => [u, v], true);
    const o = new THREE.Mesh(g, m); o.userData.noShadow = true; group.add(o);
  }

  // ---- burning billets leaning together, charred with glowing cracks towards the fire
  {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
    const p = positionLocal;
    const d = length(p.sub(vec3(0, y0 + 0.08, 0)));
    const w = mx_worley_noise_float(vec3(p.x.mul(60), p.y.mul(25), p.z.mul(60)));
    const n = fbm(p.mul(14), 3);
    const charK = smoothstep(0.42, 0.15, d);
    m.colorNode = mix(mix(vec3(0.42, 0.3, 0.2), vec3(0.3, 0.22, 0.15), n), vec3(0.025, 0.02, 0.018), charK);
    const glow = smoothstep(0.22, 0.06, d).mul(smoothstep(0.12, 0.0, w)).mul(n.add(0.4));
    m.emissiveNode = vec3(1.0, 0.36, 0.07).mul(glow).mul(uFlick).mul(uFlare.add(1)).mul(6);
    m.aoNode = occ(p);
    m.normalNode = bump(w.mul(0.003).mul(charK).add(n.mul(0.002)));
    const logs = [];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + rng() * 0.4, len = 0.42 + rng() * 0.12, rr = 0.03 + rng() * 0.012;
      const foot = new THREE.Vector3(Math.cos(a) * 0.3, y0 + 0.02, Math.sin(a) * 0.3);
      const tip = new THREE.Vector3(Math.cos(a) * 0.04, y0 + 0.2 + rng() * 0.05, Math.sin(a) * 0.04);
      const dir = tip.clone().sub(foot).normalize();
      const end = foot.clone().addScaledVector(dir, len * 0.75);
      logs.push(tube([foot, foot.clone().lerp(end, 0.5), end], (t, an) => rr * (Math.sin(an + k) > -0.3 ? 1 : 0.4) * (1 - t * 0.35), 7, { capStart: true, capEnd: true }));
    }
    const o = new THREE.Mesh(merge(logs), m); group.add(o);
  }

  // ---- flames: crossed sheets with a scrolling noise tongue (additive, HDR so bloom catches the core)
  {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const t = uv(), seed = attribute('aSeed', 'float');
    const n = mx_fractal_noise_float(vec3(t.x.mul(3.2), t.y.mul(2.2).sub(time.mul(1.9)), seed), 3, 2, 0.5);
    const yv = t.y;
    const halfW = pow(float(1).sub(yv), 0.7).mul(0.42).add(0.02);
    const dx = abs(t.x.sub(0.5).add(n.mul(0.16).mul(yv)));
    const body = smoothstep(halfW, halfW.mul(0.25), dx).mul(smoothstep(0.0, 0.1, yv)).mul(smoothstep(1.0, 0.45, yv.add(n.mul(0.3))));
    const heat = body.mul(float(1).sub(yv.mul(0.65)));
    m.colorNode = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.72, 0.32), smoothstep(0.25, 0.85, heat)).mul(heat).mul(uFlick).mul(uFlare.mul(1.3).add(1)).mul(3.2);
    m.opacityNode = body;
    m.fog = false;
    const sheets = [];
    const add = (cx, cz, w, h, rot, sd) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2, 0);
      g.rotateY(rot);
      g.translate(cx, y0 + 0.03, cz);
      g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Float32Array(4).fill(sd), 1));
      sheets.push(g);
    };
    for (let k = 0; k < 3; k++) add(0, 0, 0.34, 0.62, (k / 3) * Math.PI, k * 3.1);
    for (let k = 0; k < 4; k++) { const a = rng() * TAU; add(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.2, 0.34 + rng() * 0.12, rng() * Math.PI, 10 + k * 2.7); }
    const o = new THREE.Mesh(merge(sheets, ['aSeed']), m); o.userData.noShadow = true; o.renderOrder = 2;
    group.add(o);
  }

  // ---- light
  const light = new THREE.PointLight(0xffb27c, FIRE_LIGHT.intensity, FIRE_LIGHT.distance, 2); // warm but not orange; cut off within the house
  light.position.set(0, y0 + 0.6, 0);
  light.userData.noShadow = true;
  group.add(light);

  // ---- smoke: camera-facing puffs rebuilt each frame on the CPU
  const NS = 44;
  const parts = [];
  for (let i = 0; i < NS; i++) parts.push({ age: rng() * 1, life: 1, x: 0, y: 0, z: 0, vx: 0, vz: 0, seed: rng() * 100, rot: rng() * TAU });
  const reset = (q, prewarm) => {
    q.life = 20 + rng() * 8; q.age = prewarm ? rng() * q.life : 0;
    q.x = (rng() - 0.5) * 0.15; q.z = (rng() - 0.5) * 0.15; q.y = y0 + 0.35;
    q.seed = rng() * 100; q.rot = rng() * TAU; q.spin = (rng() - 0.5) * 0.3;
    q.vx = (rng() - 0.5) * 0.04; q.vz = (rng() - 0.5) * 0.04;
  };
  for (const q of parts) reset(q, true);
  const sg = new THREE.BufferGeometry();
  const sPos = new Float32Array(NS * 12), sUV = new Float32Array(NS * 8), sP = new Float32Array(NS * 16), sIdx = [];
  for (let i = 0; i < NS; i++) {
    sUV.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
    const b = i * 4; sIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage)); // rewritten per frame (src/load/release.js keeps it)
  sg.setAttribute('uv', new THREE.BufferAttribute(sUV, 2));
  sg.setAttribute('aP', new THREE.BufferAttribute(sP, 4).setUsage(THREE.DynamicDrawUsage));
  sg.setIndex(sIdx);
  const uSunL = uniform(new THREE.Vector3(0, 1, 0)), uSunOn = uniform(1), uHole = uniform(new THREE.Vector3(0, holeY, 0));
  const inShaft = (p) => {
    const rel = p.sub(uHole);
    const along = dot(rel, uSunL).negate();
    const d = length(cross(rel, uSunL));
    return smoothstep(holeR * 0.9, holeR * 0.4, d).mul(step(0, along)).mul(uSunOn);
  };
  {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const t = uv(), a = attribute('aP', 'vec4'), p = positionLocal;
    const n = mx_fractal_noise_float(vec3(t.x.mul(2.2).add(a.y), t.y.mul(2.2), time.mul(0.06).add(a.y)), 4, 2, 0.55).mul(0.5).add(0.5);
    const disc = pow(max(float(1).sub(length(t.sub(0.5)).mul(2)), 0), 1.3);
    const outside = smoothstep(holeY - 0.3, holeY + 0.4, p.y);
    const fireLit = exp(p.y.mul(-1.1)).mul(uFlick);
    let c = vec3(0.05, 0.048, 0.046).add(vec3(0.5, 0.24, 0.1).mul(fireLit).mul(0.5));
    c = c.add(vec3(1.0, 0.93, 0.8).mul(inShaft(p)).mul(0.9));
    c = mix(c, vec3(0.62, 0.62, 0.64).mul(uSunOn.mul(0.6).add(0.4)), outside);
    m.colorNode = c;
    m.opacityNode = disc.mul(smoothstep(0.35, 0.85, n)).mul(a.x).mul(mix(float(0.3), float(0.42), outside));
    const o = new THREE.Mesh(sg, m); o.userData.noShadow = true; o.frustumCulled = false; o.renderOrder = 3;
    group.add(o);
  }

  // ---- light shaft through the smoke hole
  const shaftG = new THREE.CylinderGeometry(holeR * 0.85, holeR * 0.92, 1, 20, 8, true);
  shaftG.translate(0, -0.5, 0); // hangs down from its origin
  const shaftM = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  {
    const t = uv();
    const along = t.y; // 1 at the hole, 0 at the far end
    const edge = pow(abs(normalView.z), 1.6);
    const dust = mx_fractal_noise_float(vec3(t.x.mul(6), t.y.mul(9).add(time.mul(0.05)), time.mul(0.04)), 3, 2, 0.5).mul(0.5).add(0.5);
    shaftM.colorNode = vec3(1.0, 0.92, 0.78).mul(edge).mul(dust.mul(0.8).add(0.4)).mul(smoothstep(0.0, 0.25, along)).mul(smoothstep(1.0, 0.9, along)).mul(uSunOn).mul(0.05);
    shaftM.fog = false;
  }
  const shaft = new THREE.Mesh(shaftG, shaftM);
  shaft.userData.noShadow = true; shaft.receiveShadow = false; shaft.renderOrder = 4;
  shaft.position.set(0, holeY, 0);
  group.add(shaft);

  let flare = 0, tt = 0, fuel = 0; // fuel: a log laid on (src/interact), burns down over ~60 s
  const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _q = new THREE.Quaternion();
  const down = new THREE.Vector3(0, -1, 0), _d = new THREE.Vector3();
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // sunDirLocal: unit vector towards the sun in model space; camLocal: camera axes in model space
  function update(dt, { sunLocal, sunElev, camRight, camUp }) {
    tt += dt;
    flare = Math.max(0, flare - dt * 0.9);
    fuel = Math.max(0, fuel - dt / 60);
    const fk = Math.min(1, fuel * 4);
    const fl = 0.84 + valueNoise(tt * 7, 1, 3) * 0.1 + valueNoise(tt * 19, 2, 4) * 0.06;
    uFlick.value = fl;
    uFlare.value = Math.max(flare, fk * 0.45);
    light.intensity = FIRE_LIGHT.intensity * fl * (1 + flare * 1.6 + fk * 0.6);
    light.position.set(valueNoise(tt * 5, 3, 5) * 0.03, y0 + 0.6 + valueNoise(tt * 6, 4, 6) * 0.04, valueNoise(tt * 5, 5, 7) * 0.03);
    // sun
    const on = THREE.MathUtils.smoothstep(sunElev, 6, 16);
    uSunOn.value = on;
    uSunL.value.copy(sunLocal);
    shaft.visible = on > 0.01;
    if (shaft.visible) {
      const dir = _d.copy(sunLocal).negate();
      _q.setFromUnitVectors(down, dir);
      shaft.quaternion.copy(_q);
      // length until it meets the floor or the wall of the cone
      let L = (holeY - 0.05) / Math.max(0.05, -dir.y);
      const hx = dir.x, hz = dir.z, horiz = Math.hypot(hx, hz);
      if (horiz > 1e-3) {
        // step down the shaft until outside the cone radius
        for (let s = 0.2; s < L; s += 0.1) { const y = holeY + dir.y * s, r = horiz * s; if (r > coneR(y) - 0.15) { L = s; break; } }
      }
      shaft.scale.set(1, L, 1);
    }
    // smoke puffs
    for (let i = 0; i < NS; i++) {
      const q = parts[i];
      q.age += dt;
      if (q.age > q.life) reset(q, false);
      const f = q.age / q.life;
      const rise = 0.42 + f * 0.5 + flare * 0.3;
      q.y += rise * dt;
      // drawn to the smoke hole, then carried off by the breeze outside
      const pull = q.y < holeY ? 0.25 : 0;
      q.x += (q.vx - q.x * pull) * dt + (q.y > holeY ? 0.18 * dt : 0);
      q.z += (q.vz - q.z * pull) * dt + (q.y > holeY ? 0.05 * dt : 0);
      if (q.y < holeY) { const rMax = Math.max(0.15, coneR(q.y) - 0.6); const r = Math.hypot(q.x, q.z); if (r > rMax) { q.x *= rMax / r; q.z *= rMax / r; } }
      q.rot += q.spin * dt;
      const size = 0.28 + f * 1.3 + Math.max(0, q.y - holeY) * 0.25;
      const alpha = Math.min(1, f * 6) * Math.min(1, (1 - f) * 3) * (q.y > holeY + 2.5 ? Math.max(0, 1 - (q.y - holeY - 2.5) / 3) : 1);
      const c = Math.cos(q.rot), s = Math.sin(q.rot);
      _r.copy(camRight).multiplyScalar(c).addScaledVector(camUp, s).multiplyScalar(size / 2);
      _u.copy(camUp).multiplyScalar(c).addScaledVector(camRight, -s).multiplyScalar(size / 2);
      const k = i * 12;
      for (let j = 0; j < 4; j++) {
        const [a, b] = CORNERS[j];
        sPos[k + j * 3] = q.x + _r.x * a + _u.x * b;
        sPos[k + j * 3 + 1] = q.y + _r.y * a + _u.y * b;
        sPos[k + j * 3 + 2] = q.z + _r.z * a + _u.z * b;
        sP.set([alpha, q.seed, f, 0], (i * 4 + j) * 4);
      }
    }
    sg.attributes.position.needsUpdate = true;
    sg.attributes.aP.needsUpdate = true;
  }
  return { group, update, light, flare: () => { flare = 1; }, fuel: () => { fuel = 1; flare = Math.max(flare, 0.6); } };
}
