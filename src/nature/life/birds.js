// Birds over the alaas: black kites circling on thermals, a far white-tailed eagle, a pair of common
// cranes passing over (rarely Siberian cranes), ducks on the lake that swim, flush and come back,
// swallows skimming the meadow and the water, and crows walking and flying round the homestead.
// One instanced draw: a low-poly bird whose proportions (neck, tail, fork, legs, chord, sweep) are
// per-instance, wings flapped in the vertex shader. Flight is steered on the CPU (a few dozen birds).
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec3, vec4, float, sin, cos, pow, mix, select, smoothstep, min, max, normalize, cross, positionGeometry,
  normalGeometry, positionPrevious, cameraViewMatrix, varyingProperty, faceDirection, floor, positionWorld, cameraPosition,
  dot,
} from 'three/tsl';
import { LAKE, HOME } from '../../world/terrain.js';
import { linRGB } from './common.js';
import { rand, damp } from '../../util.js';

// ---------- species ----------
// span (m); shape: neck, tail, fork, legs | chord, tipK, sweep, bodyR | bodyL, tailW, droop;
// colours: top, secondary (primaries/trailing edge/head), under lightness; pattern bits:
// 1 dark hand, 2 dark trailing edge, 4 white tail, 8 dark head/neck, 16 pale belly
const SP = {
  kite: { span: 1.5, neck: 0.8, tail: 1.25, fork: 0.035, legs: 0, chord: 0.23, tipK: 6, sweep: 0.3, bodyR: 1.2, bodyL: 1, tailW: 0.95, droop: -0.1, top: 0x5c4834, sec: 0x241c16, under: 0.75, pat: 1 },
  eagle: { span: 2.2, neck: 1.1, tail: 0.75, fork: -0.03, legs: 0, chord: 0.33, tipK: 9, sweep: 0.08, bodyR: 1.2, bodyL: 1, tailW: 1.3, droop: -0.04, top: 0x4a3828, sec: 0x1e1812, under: 0.7, pat: 1 | 4 },
  crane: { span: 2.2, neck: 3.0, tail: 0.6, fork: 0, legs: 1, chord: 0.26, tipK: 7, sweep: 0.15, bodyR: 1, bodyL: 1.25, tailW: 1, droop: -0.02, top: 0x8c8f8e, sec: 0x1c1c1c, under: 0.85, pat: 1 | 8 },
  sibcrane: { span: 2.2, neck: 3.0, tail: 0.6, fork: 0, legs: 1.05, chord: 0.26, tipK: 7, sweep: 0.15, bodyR: 1, bodyL: 1.25, tailW: 1, droop: -0.02, top: 0xeceae4, sec: 0x161616, under: 0.85, pat: 1 },
  duck: { span: 0.88, neck: 1.7, tail: 0.5, fork: 0, legs: 0, chord: 0.2, tipK: 3, sweep: 0.55, bodyR: 1.55, bodyL: 1.45, tailW: 1, droop: 0, top: 0x6b5338, sec: 0x3a2c1e, under: 1.15, pat: 8 },
  swallow: { span: 0.33, neck: 0.5, tail: 1.5, fork: 0.24, legs: 0, chord: 0.2, tipK: 2.4, sweep: 0.95, bodyR: 1.05, bodyL: 1.25, tailW: 0.8, droop: 0, top: 0x1a2030, sec: 0x14161e, under: 1, pat: 16 },
  crow: { span: 0.95, neck: 1.0, tail: 1.0, fork: -0.01, legs: 0, chord: 0.27, tipK: 8, sweep: 0.15, bodyR: 1.25, bodyL: 1.2, tailW: 1.1, droop: -0.03, top: 0x141518, sec: 0x101114, under: 1, pat: 0 },
};

// ---------- geometry (unit wingspan; +X right, +Y up, +Z forward) ----------
// attribute bp = (region 0 body · 1 head/neck · 2 tail · 3 legs · 4 wing, span s, chord c, side)
const WING_S = [0, 0.1, 0.24, 0.38, 0.5, 0.62, 0.74, 0.86, 0.95, 1];
function birdGeometry() {
  const P = [], N = [], BP = [], I = [];
  const v = (p, n, bp) => { P.push(...p); N.push(...n); BP.push(...bp); return P.length / 3 - 1; };
  // a triangle whose front face points along `want`
  const tri = (a, b, c, want) => {
    const pa = P.slice(a * 3, a * 3 + 3), pb = P.slice(b * 3, b * 3 + 3), pc = P.slice(c * 3, c * 3 + 3);
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], w = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) I.push(a, c, b); else I.push(a, b, c);
  };
  // body + head: rings along z
  const rings = [[-0.13, 0.011, 0], [-0.08, 0.028, 0], [-0.015, 0.039, 0], [0.05, 0.035, 0], [0.1, 0.022, 0], [0.135, 0.019, 1], [0.17, 0.017, 1]];
  const K = 6, ids = [];
  for (const [z, r, reg] of rings) {
    const ring = [];
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85 - 0.004;
      ring.push(v([x, y, z], [Math.cos(a), Math.sin(a), 0], [reg, 0, 0, Math.sign(x)]));
    }
    ids.push(ring);
  }
  const tip = v([0, -0.006, 0.215], [0, 0, 1], [1, 0, 0, 0]);
  const tail0 = v([0, 0, -0.15], [0, 0, -1], [0, 0, 0, 0]);
  for (let j = 0; j < ids.length - 1; j++) for (let k = 0; k < K; k++) {
    const a = ids[j][k], b = ids[j][(k + 1) % K], c = ids[j + 1][k], d = ids[j + 1][(k + 1) % K];
    const ang = ((k + 0.5) / K) * Math.PI * 2 + Math.PI / 2, out = [Math.cos(ang), Math.sin(ang), 0];
    tri(a, b, c, out); tri(b, d, c, out);
  }
  for (let k = 0; k < K; k++) {
    const ang = ((k + 0.5) / K) * Math.PI * 2 + Math.PI / 2;
    tri(ids.at(-1)[k], ids.at(-1)[(k + 1) % K], tip, [Math.cos(ang), Math.sin(ang), 0.5]);
    tri(ids[0][k], ids[0][(k + 1) % K], tail0, [Math.cos(ang), Math.sin(ang), -0.5]);
  }
  // tail: flat fan, the centre tip vertex carries the fork (c = 1)
  const up = [0, 1, 0];
  const tl = v([-0.016, 0.004, -0.11], up, [2, 0, 0, -1]), tr = v([0.016, 0.004, -0.11], up, [2, 0, 0, 1]);
  const ol = v([-0.05, 0.0, -0.26], up, [2, 0, 0, -1]), or = v([0.05, 0.0, -0.26], up, [2, 0, 0, 1]);
  const tc = v([0, 0.0, -0.255], up, [2, 0, 1, 0]);
  tri(tl, tr, tc, up); tri(tl, tc, ol, up); tri(tr, or, tc, up);
  // legs (scaled to nothing unless the species trails them)
  for (const sd of [-1, 1]) {
    const a = v([sd * 0.012, -0.022, -0.06], [0, -1, 0], [3, 0, 0, sd]), b = v([sd * 0.02, -0.022, -0.06], [0, -1, 0], [3, 0, 0, sd]);
    const c = v([sd * 0.01, -0.03, -0.4], [0, -1, 0], [3, 0, 0, sd]), d = v([sd * 0.016, -0.03, -0.4], [0, -1, 0], [3, 0, 0, sd]);
    tri(a, b, c, [0, -1, 0]); tri(b, d, c, [0, -1, 0]);
  }
  // wings: two rows (leading c = 0, trailing c = 1) per side; positions are made in the shader
  for (const sd of [-1, 1]) {
    const row = WING_S.map((s) => [v([sd * s * 0.5, 0, 0.04], up, [4, s, 0, sd]), v([sd * s * 0.5, 0, -0.1], up, [4, s, 1, sd])]);
    for (let k = 0; k < row.length - 1; k++) {
      const [a, b] = row[k], [c, d] = row[k + 1];
      tri(a, b, c, up); tri(b, d, c, up);
    }
  }
  return { P, N, BP, I };
}

// ---------- material ----------
function birdMaterial() {
  const bp = attribute('bp', 'vec4');
  const A = attribute('bA', 'vec4'), B = attribute('bB', 'vec4'), C = attribute('bC', 'vec4');
  const D = attribute('bD', 'vec4'), E = attribute('bE', 'vec4'), F = attribute('bF', 'vec4');
  const K1 = attribute('bK', 'vec4'), K2 = attribute('bL', 'vec4');
  const PA = attribute('bPA', 'vec4'), PB = attribute('bPB', 'vec4');
  const vN = varyingProperty('vec3', 'bdN'), vPart = varyingProperty('vec4', 'bdPart');
  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.82, metalness: 0 });

  const basis = (f, roll) => {
    const r0 = normalize(cross(f, vec3(0, 1, 0))), u0 = cross(r0, f);
    const cr = cos(roll), sr = sin(roll);
    return [r0.mul(cr).sub(u0.mul(sr)), u0.mul(cr).add(r0.mul(sr)), f];
  };
  mat.positionNode = Fn(() => {
    const region = bp.x, s = bp.y, c = bp.z, side = bp.w, p0 = positionGeometry;
    const neck = D.x, tail = D.y, fork = D.z, legs = D.w;
    const bodyR = E.w, bodyL = F.x, tailW = F.y, droop = F.z;
    // body, head, tail, legs: stretch the canonical bird to the species
    const zHead = p0.z.sub(0.1).mul(neck).add(0.1);
    const zTail = p0.z.add(0.11).mul(tail).sub(0.11).add(c.mul(fork).mul(tail));
    const zLeg = p0.z.add(0.06).mul(legs).sub(0.06);
    const isTail = region.greaterThan(1.5).and(region.lessThan(2.5));
    const zb = select(region.lessThan(0.5), p0.z, select(region.lessThan(1.5), zHead, select(isTail, zTail, zLeg)));
    const xb = select(isTail, p0.x.mul(tailW), p0.x.mul(bodyR));
    const yb = select(region.lessThan(1.5), p0.y.mul(bodyR), p0.y.mul(select(region.greaterThan(2.5), legs, float(1))));
    const body = vec3(xb, yb, zb.mul(bodyL));
    // wings: shoulder and wrist joints, the hand lagging the arm
    const phase = C.x, amp = C.y, fold = C.z, dih = C.w;
    const a1 = dih.add(amp.mul(sin(phase)));
    const a2 = a1.add(amp.mul(0.7).mul(sin(phase.sub(0.9)))).add(droop.mul(float(1).sub(amp.mul(2)).max(0)));
    const chord = E.x.mul(float(1).sub(pow(s, E.y))).mul(mix(1.05, 0.8, s)).add(0.01);
    const le = float(0.045).add(sin(s.mul(Math.PI)).mul(0.022)).sub(E.z.mul(0.2).mul(smoothstep(0.3, 1, s)));
    const zw = le.sub(c.mul(chord));
    const r = s.mul(0.5), ri = min(r, 0.2), ro = max(r.sub(0.2), 0);
    // upstroke: the hand folds in a little
    const flex = float(1).sub(amp.mul(0.35).mul(max(cos(phase), 0)));
    const wx = side.mul(bodyR.mul(0.02).add(cos(a1).mul(ri)).add(cos(a2).mul(ro).mul(flex)));
    const wy = sin(a1).mul(ri).add(sin(a2).mul(ro).mul(flex)).add(0.012);
    const folded = vec3(side.mul(bodyR.mul(0.03).add(c.mul(0.01))), bodyR.mul(0.024).sub(c.mul(0.006)), float(0.03).sub(s.mul(0.24)).sub(c.mul(0.035)).mul(bodyL));
    const wing = mix(vec3(wx, wy, zw), folded, fold);
    const isW = region.greaterThan(3.5);
    const local = select(isW, wing, body);
    const aN = select(s.lessThan(0.4), a1, a2);
    const nW = normalize(mix(vec3(side.negate().mul(sin(aN)), cos(aN), 0), vec3(0, 1, 0), fold));
    const nLocal = select(isW, nW, normalGeometry);

    const [R, U, Fw] = basis(normalize(B.xyz), B.w);
    const world = A.xyz.add(R.mul(local.x).add(U.mul(local.y)).add(Fw.mul(local.z)).mul(A.w));
    const [Rp, Up, Fp] = basis(normalize(PB.xyz), PB.w);
    positionPrevious.assign(PA.xyz.add(Rp.mul(local.x).add(Up.mul(local.y)).add(Fp.mul(local.z)).mul(PA.w)));
    vN.assign(R.mul(nLocal.x).add(U.mul(nLocal.y)).add(Fw.mul(nLocal.z)));
    vPart.assign(vec4(region, s, c, p0.y));
    return world;
  })();
  // wings: the top is the front face; seen from below, the underside is in its own shadow
  mat.normalNode = cameraViewMatrix.mul(vec4(vN.mul(select(vPart.x.greaterThan(1.5), faceDirection, float(1))), 0)).xyz.normalize();
  const bit = (k) => floor(K1.w.div(k)).mod(2);
  mat.colorNode = Fn(() => {
    const region = vPart.x, s = vPart.y, c = vPart.z;
    const top = K1.xyz, sec = K2.xyz;
    const isW = region.greaterThan(3.5);
    const below = select(isW.or(region.greaterThan(1.5).and(region.lessThan(2.5))), faceDirection.lessThan(0), vPart.w.lessThan(-0.008));
    let col = select(below, top.mul(K2.w), top);
    // pale belly (kites' pale hands below, swallows' cream underparts)
    col = mix(col, vec3(0.62, 0.55, 0.45), bit(16).mul(select(below, float(1), float(0))).mul(select(isW, smoothstep(0.55, 0.75, s).mul(0.5), float(0.85))));
    const hand = bit(1).mul(smoothstep(0.58, 0.72, s)).mul(select(isW, float(1), float(0)));
    const trail = bit(2).mul(smoothstep(0.55, 0.8, c)).mul(select(isW, float(1), float(0)));
    col = mix(col, sec, max(hand, trail));
    col = mix(col, vec3(0.8, 0.79, 0.76), bit(4).mul(select(region.greaterThan(1.5).and(region.lessThan(2.5)), float(1), float(0))));
    col = mix(col, sec, bit(8).mul(select(region.greaterThan(0.5).and(region.lessThan(1.5)), float(0.85), float(0))));
    // legs are dark
    col = select(region.greaterThan(2.5).and(region.lessThan(3.5)), vec3(0.03, 0.03, 0.03), col);
    return col;
  })();
  // a little light comes through the spread primaries against the sun
  const toEye = normalize(positionWorld.sub(cameraPosition));
  mat.userData.sunHooks = (W) => {
    mat.emissiveNode = K1.xyz.mul(W.sunCol).mul(pow(max(dot(toEye, W.sunDir), 0), 8)).mul(0.08).mul(select(vPart.x.greaterThan(3.5), float(1), float(0)));
  };
  return mat;
}

// ---------- flight ----------
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _r = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class Bird {
  constructor(sp, kind) {
    this.sp = sp; this.kind = kind;
    this.pos = new THREE.Vector3(0, -500, 0); this.vel = new THREE.Vector3(1, 0, 0);
    this.fwd = new THREE.Vector3(1, 0, 0); this.roll = 0;
    this.phase = Math.random() * 6.28; this.amp = 0; this.fold = 0; this.dih = 0.06;
    this.freq = 3; this.flapT = 0; this.shown = 0;
    this.prev = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(1, 0, 0), roll: 0, s: 0 };
    this.mode = 'off'; this.t = 0;
  }
  // steer towards a desired velocity with limited acceleration; bank into the turn
  fly(desired, dt, agility = 6, bankMul = 1) {
    _v.copy(desired).sub(this.vel).multiplyScalar(2.5);
    if (_v.length() > agility) _v.setLength(agility);
    this.vel.addScaledVector(_v, dt);
    this.pos.addScaledVector(this.vel, dt);
    const sp = this.vel.length();
    if (sp > 0.2) {
      _w.copy(this.vel).divideScalar(sp);
      _w.y = THREE.MathUtils.clamp(_w.y, -0.6, 0.6);
      this.fwd.lerp(_w.normalize(), 1 - Math.exp(-10 * dt)).normalize();
    }
    // lateral acceleration → bank (right turn = right wing down)
    _r.crossVectors(this.fwd, UP).normalize();
    const lat = _v.dot(_r);
    const bank = THREE.MathUtils.clamp(Math.atan2(lat * bankMul, 9.8), -1.1, 1.1);
    this.roll = damp(this.roll, bank, 4, dt);
  }
  // on the ground or the water: heading only
  sit(dt) { this.roll = damp(this.roll, 0, 6, dt); }
  flap(dt, on, freq, amp) {
    this.amp = damp(this.amp, on ? amp : 0, on ? 7 : 3.5, dt);
    if (on || this.amp > 0.02) this.phase += dt * Math.PI * 2 * freq;
    else this.phase = damp(this.phase, Math.round(this.phase / (Math.PI * 2)) * Math.PI * 2, 2, dt);
  }
}

export function buildBirds(ctx, world, { tier, W, onWater }) {
  const T = world.terrain;
  const counts = { kite: 3, eagle: 1, crane: 2, duck: tier === 'low' ? 5 : 8, swallow: tier === 'low' ? 5 : tier === 'high' ? 12 : 9, crow: 3 };
  const birds = [];
  for (const [k, n] of Object.entries(counts)) for (let i = 0; i < n; i++) birds.push(new Bird(SP[k], k));
  const N = birds.length;

  const { P, N: NN, BP, I } = birdGeometry();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(NN, 3));
  g.setAttribute('bp', new THREE.Float32BufferAttribute(BP, 4));
  g.setIndex(I);
  // every per-instance vec4 lives in one interleaved buffer (WebGPU allows only 8 vertex buffers)
  const NAMES = ['bA', 'bB', 'bC', 'bD', 'bE', 'bF', 'bK', 'bL', 'bPA', 'bPB'], STRIDE = NAMES.length * 4;
  const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(N * STRIDE), STRIDE, 1).setUsage(THREE.DynamicDrawUsage);
  const inst = {};
  NAMES.forEach((name, j) => {
    const a = new THREE.InterleavedBufferAttribute(ib, 4, j * 4);
    g.setAttribute(name, a);
    inst[name] = { set: (vals, i) => ib.array.set(vals, i * STRIDE + j * 4), o: j * 4 };
  });
  g.instanceCount = N;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const setShape = (i, sp) => {
    inst.bD.set([sp.neck, sp.tail, sp.fork, sp.legs], i);
    inst.bE.set([sp.chord, sp.tipK, sp.sweep, sp.bodyR], i);
    inst.bF.set([sp.bodyL, sp.tailW, sp.droop, 0], i);
    inst.bK.set([...linRGB(sp.top), sp.pat], i);
    inst.bL.set([...linRGB(sp.sec), sp.under], i);
    ib.needsUpdate = true;
  };
  birds.forEach((b, i) => setShape(i, b.sp));

  const mat = birdMaterial();
  mat.userData.sunHooks(W);
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'life-birds';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  world.scene.add(mesh);

  // ---------- behaviour ----------
  const ground = (x, z) => T.height(x, z);
  const lakeAt = (x, z) => T.lakeDist(x, z) - LAKE.r; // < 0 over the water
  const playerPos = new THREE.Vector3(HOME.x, 100, HOME.z);
  const audio = () => window.game?.audio;
  // calls go through the soundscape's outside bus (muffled indoors) with a far-carrying reference distance
  const call = (name, pos, gain = 0.5, ref = 30) => {
    const a = audio(); if (!a?.buffers) return;
    const v = [name, `${name}-2`].filter((n) => a.buffers[n]);
    if (!v.length) return;
    const clip = v[(Math.random() * v.length) | 0], p = { x: pos.x, y: pos.y, z: pos.z };
    if (a.shot && a.outside) a.shot(clip, p, gain, ref, a.outside, 0.96 + Math.random() * 0.08); else a.play?.(name, p);
  };

  const kites = birds.filter((b) => b.kind === 'kite'), eagle = birds.find((b) => b.kind === 'eagle');
  const cranes = birds.filter((b) => b.kind === 'crane'), ducks = birds.filter((b) => b.kind === 'duck');
  const swallows = birds.filter((b) => b.kind === 'swallow'), crows = birds.filter((b) => b.kind === 'crow');

  // thermals: kites circle up, then glide off to the next; one kite works low over the homestead
  const newThermal = (b, near) => {
    const a = Math.random() * 6.28, r = near ? rand(10, 60) : rand(30, 180);
    const cx = (near ? HOME.x : playerPos.x) + Math.cos(a) * r, cz = (near ? HOME.z : playerPos.z) + Math.sin(a) * r;
    b.th = { x: THREE.MathUtils.clamp(cx, -380, 380), z: THREE.MathUtils.clamp(cz, -380, 380), R: rand(18, 42), dir: Math.random() < 0.5 ? 1 : -1, top: near ? rand(22, 40) : rand(40, 85) };
    b.ang = Math.atan2(b.pos.z - b.th.z, b.pos.x - b.th.x);
    b.mode = 'glide'; b.t = rand(35, 90);
  };
  kites.forEach((b, i) => {
    const a = Math.random() * 6.28, r = rand(30, 200);
    b.pos.set(playerPos.x + Math.cos(a) * r, 100 + rand(40, 90), playerPos.z + Math.sin(a) * r);
    newThermal(b, i === 0); b.mode = 'circle'; b.shown = 1;
  });
  function kiteStep(b, dt, high) {
    const th = b.th, v = high ? 9 : 8;
    b.t -= dt;
    const fy = ground(b.pos.x, b.pos.z);
    if (b.mode === 'glide') {
      _v.set(th.x - b.pos.x, 0, th.z - b.pos.z);
      const d = _v.length();
      _v.setLength(v * 1.35); _v.y = -0.6;
      if (b.pos.y - fy < th.top * 0.6) _v.y = 0.4;
      if (d < th.R) { b.mode = 'circle'; b.ang = Math.atan2(b.pos.z - th.z, b.pos.x - th.x); }
      b.fly(_v, dt, 4);
      b.flapT -= dt;
    } else {
      b.ang += th.dir * (v / th.R) * dt;
      th.x += W.dir.value.x * 0.8 * dt; th.z += W.dir.value.y * 0.8 * dt; // the thermal drifts downwind
      const tx = th.x + Math.cos(b.ang) * th.R, tz = th.z + Math.sin(b.ang) * th.R;
      _v.set(-Math.sin(b.ang) * th.dir, 0, Math.cos(b.ang) * th.dir).multiplyScalar(v);
      _v.x += (tx - b.pos.x) * 0.6; _v.z += (tz - b.pos.z) * 0.6;
      _v.y = THREE.MathUtils.clamp((fy + th.top - b.pos.y) * 0.1, -0.5, 1.1);
      b.fly(_v, dt, 5);
      if (b.t < 0) newThermal(b, b === kites[0]);
    }
    // a few lazy flaps now and then; otherwise soaring with the hand drooped
    b.flapT -= dt;
    if (b.flapT < -rand(8, 20)) b.flapT = rand(1.2, 2.6);
    b.dih = 0.07;
    b.flap(dt, b.flapT > 0, 2.6, 0.42);
  }

  // cranes: a pair passes high over the alaas now and then, calling
  const crane = { t: rand(15, 30), active: false };
  function cranePass() {
    const lead = cranes[0], white = Math.random() < 0.12;
    for (const b of cranes) setShape(birds.indexOf(b), white ? SP.sibcrane : SP.crane);
    const a = Math.random() * 6.28, off = rand(-120, 120);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx;
    const cx = playerPos.x + px * off, cz = playerPos.z + pz * off;
    const alt = 100 + rand(35, 70);
    crane.dir = new THREE.Vector3(dx, 0, dz);
    crane.called = 0;
    cranes.forEach((b, k) => {
      b.pos.set(cx - dx * 700 - dx * k * 7 + px * k * 5, alt + k * 1.5, cz - dz * 700 - dz * k * 7 + pz * k * 5);
      b.vel.set(dx, 0, dz).multiplyScalar(13); b.fwd.set(dx, 0, dz); b.shown = 1; b.phase = k * 1.3;
    });
    lead.mode = 'pass';
    crane.active = true;
  }
  function craneStep(dt) {
    if (!crane.active) {
      crane.t -= dt;
      for (const b of cranes) b.shown = 0;
      if (crane.t < 0) cranePass();
      return;
    }
    for (const b of cranes) {
      _v.copy(crane.dir).multiplyScalar(13); _v.y = 0;
      b.fly(_v, dt, 2);
      b.dih = 0.04;
      b.flap(dt, true, 1.7, 0.5);
    }
    const lead = cranes[0], d = Math.hypot(lead.pos.x - playerPos.x, lead.pos.z - playerPos.z);
    if (d < 320 && crane.called < 2 && Math.random() < dt * 0.25) { crane.called++; call('crane', lead.pos, 0.6, 90); }
    if (_w.set(lead.pos.x - playerPos.x, 0, lead.pos.z - playerPos.z).dot(crane.dir) > 750) { crane.active = false; crane.t = rand(70, 160); }
  }

  // the eagle: wide slow circles, high and far off
  eagle.pos.set(playerPos.x + 400, 300, playerPos.z); eagle.shown = 1;
  eagle.th = { x: playerPos.x + 380, z: playerPos.z - 150, R: 70, dir: 1, top: 190 }; eagle.mode = 'circle'; eagle.ang = 0; eagle.t = 1e9;
  function eagleStep(dt) {
    const th = eagle.th;
    const d = Math.hypot(th.x - playerPos.x, th.z - playerPos.z);
    if (d < 260 || d > 650) { const a = Math.random() * 6.28; th.x = playerPos.x + Math.cos(a) * 420; th.z = playerPos.z + Math.sin(a) * 420; }
    kiteStep(eagle, dt, true);
    eagle.flap(dt, false, 2, 0.3); eagle.dih = 0.12;
  }

  // ducks: a group on the water off the north shore; they flush when the player comes close
  const raft = { x: 4, z: -32, t: rand(70, 140) };
  const waterSpot = (cx, cz, r) => {
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * r, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const l = lakeAt(x, z);
      if (l < -4 && l > -45) return { x, z };
    }
    return { x: LAKE.x, z: LAKE.z - LAKE.r + 25 };
  };
  ducks.forEach((b) => {
    const p = waterSpot(raft.x, raft.z, 18);
    b.pos.set(p.x, LAKE.level, p.z); b.mode = 'swim'; b.shown = 1; b.fold = 1;
    b.goal = waterSpot(p.x, p.z, 8); b.t = rand(3, 10);
    const a = Math.random() * 6.28; b.fwd.set(Math.cos(a), 0, Math.sin(a)); b.vel.set(0, 0, 0);
  });
  function flush(group) {
    const c = waterSpot(LAKE.x, LAKE.z, 70);
    for (const b of group) {
      if (b.mode !== 'swim') continue;
      b.mode = 'takeoff'; b.t = rand(0, 0.5); b.loops = rand(1, 2.2) * 6.28; b.ang = Math.atan2(b.pos.z - LAKE.z, b.pos.x - LAKE.x);
      b.land = waterSpot(c.x, c.z, 15); b.rr = rand(55, 75); b.alt = rand(14, 26);
      onWater?.(b.pos.x, b.pos.z, 1.0, 2);
    }
  }
  function duckStep(b, dt) {
    const yW = LAKE.level;
    if (b.mode === 'swim') {
      b.t -= dt;
      if (b.t < 0) { b.goal = waterSpot(b.pos.x, b.pos.z, 7); b.t = rand(4, 14); }
      _v.set(b.goal.x - b.pos.x, 0, b.goal.z - b.pos.z);
      const d = _v.length();
      const sp = d > 0.6 ? 0.35 : 0;
      if (d > 0.01) _v.multiplyScalar(sp / d);
      // keep apart a little
      for (const o of ducks) if (o !== b && o.mode === 'swim') { const dx = b.pos.x - o.pos.x, dz = b.pos.z - o.pos.z, dd = Math.hypot(dx, dz); if (dd < 1.2 && dd > 1e-3) { _v.x += dx / dd * 0.3; _v.z += dz / dd * 0.3; } }
      b.vel.lerp(_v, 1 - Math.exp(-1.2 * dt));
      b.pos.addScaledVector(b.vel, dt);
      const s = b.vel.length();
      if (s > 0.05) b.fwd.lerp(_w.copy(b.vel).setY(0).normalize(), 1 - Math.exp(-2 * dt)).normalize();
      b.pos.y = yW - 0.015 + Math.sin(b.phase * 0.5 + performance.now() * 0.0013) * 0.006;
      b.sit(dt); b.fold = damp(b.fold, 1, 4, dt); b.flap(dt, false, 0, 0); b.dih = 0;
      b.wake = (b.wake || 0) - dt;
      if (s > 0.15 && b.wake < 0) { b.wake = 0.9; onWater?.(b.pos.x - b.fwd.x * 0.25, b.pos.z - b.fwd.z * 0.25, 0.35, 0); }
      if (Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z) < 13 && playerPos.y < yW + 4) flush(ducks.filter((o) => Math.hypot(o.pos.x - b.pos.x, o.pos.z - b.pos.z) < 25));
      return;
    }
    if (b.mode === 'takeoff') {
      b.t -= dt;
      if (b.t > 0) { b.sit(dt); return; }
      b.fold = damp(b.fold, 0, 10, dt);
      _v.copy(b.fwd).setY(0).normalize().multiplyScalar(14); _v.y = 4.5;
      b.fly(_v, dt, 12);
      b.flap(dt, true, 6, 0.75); b.dih = 0.1;
      b.patter = (b.patter || 0) - dt;
      if (b.pos.y < yW + 0.8 && b.patter < 0) { b.patter = 0.12; onWater?.(b.pos.x, b.pos.z, 0.4, 2); }
      if (b.pos.y > yW + 5) { b.mode = 'circle'; b.ang = Math.atan2(b.pos.z - LAKE.z, b.pos.x - LAKE.x); }
      return;
    }
    if (b.mode === 'circle') {
      b.ang += (15 / b.rr) * dt; b.loops -= (15 / b.rr) * dt;
      const tx = LAKE.x + Math.cos(b.ang) * b.rr, tz = LAKE.z + Math.sin(b.ang) * b.rr;
      _v.set(-Math.sin(b.ang), 0, Math.cos(b.ang)).multiplyScalar(15);
      _v.x += (tx - b.pos.x) * 0.5; _v.z += (tz - b.pos.z) * 0.5;
      _v.y = (yW + b.alt - b.pos.y) * 0.5;
      b.fly(_v, dt, 10);
      b.flap(dt, true, 5.5, 0.7); b.dih = 0.08; b.fold = 0;
      if (b.loops < 0) b.mode = 'approach';
      return;
    }
    if (b.mode === 'approach') {
      _v.set(b.land.x - b.pos.x, 0, b.land.z - b.pos.z);
      const d = _v.length(), h = b.pos.y - yW;
      _v.setLength(Math.min(13, 4 + d * 0.3));
      _v.y = THREE.MathUtils.clamp(-h * (13 / Math.max(d, 1)), -6, 1);
      b.fly(_v, dt, 9);
      const gliding = d < 60;
      b.flap(dt, !gliding || h < 1.2, h < 1.2 ? 5 : 5.5, h < 1.2 ? 0.6 : 0.7);
      b.dih = gliding ? 0.22 : 0.08;
      if (h < 0.15 || (d < 1.5 && h < 0.6)) {
        b.mode = 'swim'; b.pos.y = yW; b.vel.multiplyScalar(0.25); b.vel.y = 0; b.goal = { x: b.pos.x + b.fwd.x * 2, z: b.pos.z + b.fwd.z * 2 }; b.t = rand(2, 6);
        onWater?.(b.pos.x, b.pos.z, 1.2, 2);
      }
    }
  }

  // swallows: fast, low, erratic over the meadow and the water round the player
  // houses swallows clear: horizontal radius and height above the floor (the urasa is ~10 m wide, 11 m tall)
  const HOUSES = (world.placed || []).filter((p) => ['urasa', 'balagan', 'ampaar'].includes(p.model))
    .map((p) => ({ x: p.x, z: p.z, y: p.y, r: p.model === 'urasa' ? 10 : 9, top: p.model === 'urasa' ? 12.5 : 9 }));
  swallows.forEach((b) => {
    const a = Math.random() * 6.28;
    b.pos.set(playerPos.x + Math.cos(a) * 30, 0, playerPos.z + Math.sin(a) * 30); b.pos.y = ground(b.pos.x, b.pos.z) + 3;
    b.mode = 'hawk'; b.t = 0; b.shown = 1; b.goal = b.pos.clone(); b.burst = 0;
  });
  function swallowStep(b, dt) {
    b.t -= dt;
    if (b.t < 0 || b.pos.distanceTo(b.goal) < 3) {
      const a = Math.random() * 6.28, r = rand(6, 45);
      const x = playerPos.x + Math.cos(a) * r, z = playerPos.z + Math.sin(a) * r;
      const water = lakeAt(x, z) < -2;
      let y = (water ? LAKE.level : ground(x, z)) + (water ? rand(0.25, 1.4) : rand(0.6, 5));
      for (const h of HOUSES) if (Math.hypot(x - h.x, z - h.z) < h.r) y = Math.max(y, h.y + h.top);
      b.goal.set(x, y, z); b.t = rand(0.8, 2.6); b.drink = water && Math.random() < 0.3;
    }
    _v.copy(b.goal).sub(b.pos).setLength(b.speed ??= rand(9.5, 13));
    const fy = Math.max(ground(b.pos.x, b.pos.z), lakeAt(b.pos.x, b.pos.z) < 0 ? LAKE.level : -1e9);
    if (b.pos.y < fy + 0.25) _v.y = Math.max(_v.y, 2);
    for (const h of HOUSES) if (Math.hypot(b.pos.x - h.x, b.pos.z - h.z) < h.r - 1 && b.pos.y < h.y + h.top - 1) _v.y = Math.max(_v.y, 4);
    b.fly(_v, dt, 32, 1.4);
    if (b.drink && lakeAt(b.pos.x, b.pos.z) < -1 && b.pos.y < LAKE.level + 0.12) { b.drink = false; onWater?.(b.pos.x, b.pos.z, 0.5, 0); }
    // bursts of quick flaps, then a glide with the wings swept back
    b.burst -= dt;
    if (b.burst < -rand(0.25, 0.8)) b.burst = rand(0.35, 0.9);
    const on = b.burst > 0;
    b.flap(dt, on, 8.5, 0.6);
    b.fold = damp(b.fold, on ? 0 : 0.22, 6, dt);
    b.dih = 0.02;
  }

  // crows: walk about the homestead, flap off when the player comes near
  const crowSpot = () => {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.28, r = rand(14, 70), x = HOME.x + Math.cos(a) * r, z = HOME.z + Math.sin(a) * r;
      if (HOUSES.every((h) => Math.hypot(x - h.x, z - h.z) > h.r) && lakeAt(x, z) > 2) return { x, z };
    }
    return { x: HOME.x + 30, z: HOME.z + 30 };
  };
  crows.forEach((b) => { const p = crowSpot(); b.pos.set(p.x, ground(p.x, p.z), p.z); b.mode = 'ground'; b.t = rand(8, 30); b.shown = 1; b.fold = 1; b.walk = 0; });
  function crowStep(b, dt) {
    const fy = ground(b.pos.x, b.pos.z);
    if (b.mode === 'ground') {
      b.t -= dt;
      b.walk -= dt;
      if (b.walk < -rand(1, 4)) { b.walk = rand(0.4, 1.4); b.wdir = Math.random() * 6.28; }
      if (b.walk > 0) {
        const s = 0.45 * dt; b.pos.x += Math.cos(b.wdir) * s; b.pos.z += Math.sin(b.wdir) * s;
        b.fwd.lerp(_w.set(Math.cos(b.wdir), 0, Math.sin(b.wdir)), 1 - Math.exp(-6 * dt)).normalize();
      }
      // pecking: the body dips forward
      b.peck = (b.peck || 0) - dt;
      if (b.peck < -rand(1, 3)) b.peck = 0.35;
      b.fwd.y = b.peck > 0 && b.walk <= 0 ? -0.5 * Math.sin((b.peck / 0.35) * Math.PI) : 0;
      b.fwd.normalize();
      b.pos.y = fy + 0.085;
      b.sit(dt); b.fold = damp(b.fold, 1, 8, dt); b.flap(dt, false, 0, 0);
      const near = Math.hypot(b.pos.x - playerPos.x, b.pos.z - playerPos.z) < 9;
      if (b.t < 0 || near) {
        b.mode = 'fly'; b.goal = crowSpot(); b.alt = rand(6, 16); b.t = 0;
        if (near || Math.random() < 0.5) call('crow', b.pos, 0.4, 20);
      }
      return;
    }
    _v.set(b.goal.x - b.pos.x, 0, b.goal.z - b.pos.z);
    const d = _v.length();
    _v.setLength(Math.min(11, 2 + d * 0.5));
    const gy = ground(b.goal.x, b.goal.z);
    const wantY = d < 14 ? gy + 0.06 : Math.max(fy, gy) + b.alt;
    _v.y = THREE.MathUtils.clamp((wantY - b.pos.y) * 0.9, -3, 3.5);
    b.fly(_v, dt, 10);
    b.fold = damp(b.fold, 0, 10, dt);
    b.t += dt;
    const climbing = _v.y > 0.5 || b.t < 1.5;
    b.glide = (b.glide || 0) - dt;
    if (b.glide < -rand(1.5, 3)) b.glide = rand(0.6, 1.2);
    b.flap(dt, climbing || b.glide <= 0 || d < 10, d < 10 ? 4.5 : 3.6, d < 10 ? 0.65 : 0.55);
    b.dih = 0.06;
    if (d < 0.6 && b.pos.y - gy < 0.4) { b.mode = 'ground'; b.t = rand(10, 35); b.vel.set(0, 0, 0); b.fwd.y = 0; b.fwd.normalize(); }
  }

  // ---------- per frame ----------
  const write = () => {
    const a = ib.array;
    birds.forEach((b, i) => {
      const k = i * STRIDE, s = b.shown ? b.sp.span : 0, pv = b.prev;
      const A = k + inst.bA.o, B = k + inst.bB.o, C = k + inst.bC.o, PA = k + inst.bPA.o, PB = k + inst.bPB.o;
      a[PA] = pv.pos.x; a[PA + 1] = pv.pos.y; a[PA + 2] = pv.pos.z; a[PA + 3] = pv.s;
      a[PB] = pv.fwd.x; a[PB + 1] = pv.fwd.y; a[PB + 2] = pv.fwd.z; a[PB + 3] = pv.roll;
      a[A] = b.pos.x; a[A + 1] = b.pos.y; a[A + 2] = b.pos.z; a[A + 3] = s;
      a[B] = b.fwd.x; a[B + 1] = b.fwd.y; a[B + 2] = b.fwd.z; a[B + 3] = b.roll;
      a[C] = b.phase % (Math.PI * 200); a[C + 1] = b.amp; a[C + 2] = b.fold; a[C + 3] = b.dih;
      pv.pos.copy(b.pos); pv.fwd.copy(b.fwd); pv.roll = b.roll; pv.s = s;
    });
    ib.needsUpdate = true;
  };
  // settle everyone, then keep the first frame's "previous" equal to the current
  for (let i = 0; i < 30; i++) step(1 / 30);
  write(); write();

  function step(dt) {
    if (W.player.value.y > -900) playerPos.copy(W.player.value);
    for (const b of kites) if (!b.frozen) kiteStep(b, dt, false);
    if (!eagle.frozen) eagleStep(dt);
    if (!cranes[0].frozen) craneStep(dt);
    for (const b of ducks) if (!b.frozen) duckStep(b, dt);
    for (const b of swallows) if (!b.frozen) swallowStep(b, dt);
    for (const b of crows) if (!b.frozen) crowStep(b, dt);
    // the raft's ducks come back to the north shore after a while
    raft.t -= dt;
    if (raft.t < 0) { raft.t = rand(90, 200); if (Math.random() < 0.5) flush(ducks.filter((b) => b.mode === 'swim').slice(0, 3)); }
  }
  world.updaters.push((dt) => {
    if (dt <= 0) return;
    step(Math.min(dt, 1 / 20));
    write();
  });
  // debug: freeze one of each species in a row in front of the camera
  function lineup(cam, { phase = 0, amp = 0, fold = 0, dist = 6, head = Math.PI, dy = 0.6, gap = 2.2 } = {}) {
    const kinds = ['kite', 'eagle', 'crane', 'duck', 'swallow', 'crow'];
    const f = new THREE.Vector3(); cam.getWorldDirection(f); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    kinds.forEach((k, j) => {
      const b = birds.find((o) => o.kind === k);
      b.frozen = true; b.shown = 1;
      b.pos.copy(cam.position).addScaledVector(f, dist + b.sp.span * 0.5).addScaledVector(r, (j - 2.5) * gap); b.pos.y += dy;
      b.fwd.copy(r).multiplyScalar(Math.cos(head)).addScaledVector(f, Math.sin(head)).normalize(); b.roll = 0; b.phase = phase; b.amp = amp; b.fold = fold; b.dih = 0.06;
    });
  }
  return { mesh, birds, cranePass, lineup };
}
