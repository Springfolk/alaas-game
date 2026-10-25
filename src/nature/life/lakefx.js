// Small life on the lake surface: expanding ring ripples (insects touching down, swallows drinking,
// swimming ducks' wakes, take-off and landing splashes, fish rising) and water striders skating in
// the calm shallows. One instanced draw of quads lying on the water; rings are spawned on the CPU.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec2, vec3, vec4, float, length, max, sin, exp, smoothstep, select, abs, clamp, positionGeometry,
  positionPrevious, uv, normalize,
} from 'three/tsl';
import { LAKE } from '../../world/terrain.js';

// kind: 0 small ring · 1 fish rise · 2 splash · 3 water strider
const SPEED = [0.3, 0.4, 0.55, 0], LIFE = [3, 6, 4.5, 1e9], LAMBDA = [0.07, 0.13, 0.16, 0];

export function buildLakeFx(ctx, world, { tier, W, K }) {
  const T = world.terrain;
  const NR = tier === 'low' ? 24 : 40, NS = tier === 'low' ? 6 : 12, N = NR + NS;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  // both per-instance vec4s in one interleaved buffer
  const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(N * 8), 8, 1).setUsage(THREE.DynamicDrawUsage);
  const put = (i, a, b) => { ib.array.set(a, i * 8); if (b) ib.array.set(b, i * 8 + 4); ib.needsUpdate = true; };
  for (let i = 0; i < N; i++) { ib.array[i * 8 + 2] = -1e4; ib.array[i * 8 + 3] = 0; ib.array[i * 8 + 4] = i < NR ? 0 : 3; }
  g.setAttribute('rA', new THREE.InterleavedBufferAttribute(ib, 4, 0));
  g.setAttribute('rB', new THREE.InterleavedBufferAttribute(ib, 4, 4));
  g.instanceCount = N;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(LAKE.x, LAKE.level, LAKE.z), LAKE.r + 40);

  const A = attribute('rA', 'vec4'), B = attribute('rB', 'vec4');
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const kind = B.x, age = K.time.sub(A.z);
  const sel = (arr) => select(kind.lessThan(0.5), float(arr[0]), select(kind.lessThan(1.5), float(arr[1]), select(kind.lessThan(2.5), float(arr[2]), float(arr[3]))));
  const speed = sel(SPEED), life = sel(LIFE), lambda = sel(LAMBDA);
  const isStrider = kind.greaterThan(2.5);
  // quad half-size: the ring front plus a few wavelengths behind it (striders: a 5 cm patch)
  const R = select(isStrider, A.w, speed.mul(life).add(lambda.mul(4)).mul(A.w.max(0.3)).add(0.05));
  const alive = select(isStrider, A.w.greaterThan(0), age.lessThan(life).and(age.greaterThan(0)));
  mat.positionNode = Fn(() => {
    const r = select(alive, R, float(0));
    // striders face along their heading (B.zw)
    const h = normalize(B.zw.add(vec2(0.0001, 0)));
    const q = positionGeometry.xz;
    const qr = select(isStrider, vec2(q.x.mul(h.x).sub(q.y.mul(h.y)), q.x.mul(h.y).add(q.y.mul(h.x))), q);
    const p = vec3(A.x.add(qr.x.mul(r)), float(LAKE.level + 0.012), A.y.add(qr.y.mul(r)));
    positionPrevious.assign(p);
    return p;
  })();
  const sky = W.sunCol.mul(vec3(0.07, 0.085, 0.11));
  const fx = Fn(() => {
    const q = uv().mul(2).sub(1);
    const rho = length(q).mul(R);
    // rings: crests trailing the front, fading with age and spreading
    const front = speed.mul(age).mul(A.w.max(0.3).pow(0.3));
    const x = front.sub(rho);
    const k = Math.PI * 2;
    const behind = smoothstep(0, lambda.mul(0.5), x).mul(exp(x.div(lambda.mul(1.1)).negate()));
    const amp = B.y.mul(exp(age.div(life.mul(0.35)).negate())).div(front.mul(4).add(1).sqrt());
    const w = sin(x.div(lambda).mul(k)).mul(behind).mul(amp);
    // fish rise: a dark boil in the middle for the first moment
    const boil = select(kind.greaterThan(0.5).and(kind.lessThan(1.5)), float(1).sub(smoothstep(0.05, 0.22, rho)).mul(exp(age.mul(-2.5))).mul(0.5), float(0));
    const ringA = clamp(abs(w).mul(0.5).add(boil), 0, 0.7);
    const ringC = select(w.greaterThan(0).and(boil.lessThan(0.05)), sky.mul(1.6), vec3(0.004, 0.004, 0.003));
    // strider: a slim dark body and four dimples (bright rims) where the legs press the film
    const sq = q.mul(A.w);
    const body = float(1).sub(smoothstep(0.6, 1, length(vec2(sq.x.div(0.006), sq.y.div(0.0018)))));
    const leg = (dx, dz) => {
      const d = length(sq.sub(vec2(dx, dz)));
      return smoothstep(0.0015, 0.0035, d).mul(float(1).sub(smoothstep(0.0035, 0.006, d)));
    };
    const dimples = max(max(leg(0.016, 0.012), leg(0.016, -0.012)), max(leg(-0.014, 0.016), leg(-0.014, -0.016)));
    const sA = max(body.mul(0.9), dimples.mul(0.7));
    const sC = select(body.greaterThan(dimples), vec3(0.006, 0.005, 0.004), sky.mul(2.2));
    return vec4(select(isStrider, sC, ringC), select(isStrider, sA, ringA).mul(select(alive, float(1), float(0))));
  })();
  mat.colorNode = fx.rgb;
  mat.opacityNode = fx.a;
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'life-lake';
  mesh.renderOrder = 2; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.layers.set(1); // the lake's own reflection does not see it
  world.scene.add(mesh);

  // ---------- spawning ----------
  let next = 0;
  const lakeAt = (x, z) => T.lakeDist(x, z) - LAKE.r;
  function ring(x, z, strength = 1, kind = 0) {
    if (lakeAt(x, z) > -0.3) return;
    const i = next; next = (next + 1) % NR;
    put(i, [x, z, K.time.value, kind === 2 ? 1.6 : kind === 1 ? 1 : Math.max(0.3, strength)], [kind, kind === 0 ? 0.6 + 0.4 * Math.min(strength, 1) : 1, 0, 0]);
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  const striders = Array.from({ length: NS }, (_, j) => ({ i: NR + j, x: 0, z: 0, vx: 0, vz: 0, on: false, t: 0, hx: 1, hz: 0 }));
  let fishT = 2, bugT = 1;
  const player = new THREE.Vector3();
  world.updaters.push((dt) => {
    if (dt <= 0) return;
    player.copy(W.player.value.y > -900 ? W.player.value : W.cam.value);
    const pd = lakeAt(player.x, player.z);
    if (pd > 160) { for (const s of striders) if (s.on) { s.on = false; ib.array[s.i * 8 + 3] = 0; ib.needsUpdate = true; } return; }
    // fish rising out on the open water, insects touching down near the player
    fishT -= dt;
    if (fishT < 0) {
      fishT = rand(2.5, 7);
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * 6.28, r = rand(6, 70), x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r;
        if (lakeAt(x, z) < -4) { ring(x, z, 1, 1); break; }
      }
    }
    bugT -= dt;
    if (bugT < 0) {
      bugT = rand(0.4, 1.6);
      const a = Math.random() * 6.28, r = rand(1.5, 18);
      ring(player.x + Math.cos(a) * r, player.z + Math.sin(a) * r, rand(0.3, 0.5), 0);
    }
    // water striders in the calm shallows close by
    for (const s of striders) {
      if (!s.on || Math.hypot(s.x - player.x, s.z - player.z) > 16) {
        s.on = false;
        const a = Math.random() * 6.28, r = rand(1.5, 12), x = player.x + Math.cos(a) * r, z = player.z + Math.sin(a) * r, l = lakeAt(x, z);
        if (l < -0.6 && l > -7) { s.on = true; s.x = x; s.z = z; s.t = rand(0, 1); s.vx = s.vz = 0; }
      }
      if (!s.on) { ib.array[s.i * 8 + 3] = 0; continue; }
      s.t -= dt;
      if (s.t < 0) {
        // a stroke: a quick glide in a new direction, the legs leaving tiny rings
        s.t = rand(0.35, 1.6);
        const a = Math.atan2(s.hz, s.hx) + rand(-1.4, 1.4), v = rand(0.15, 0.5);
        s.hx = Math.cos(a); s.hz = Math.sin(a); s.vx = s.hx * v; s.vz = s.hz * v;
        ring(s.x, s.z, 0.3, 0);
      }
      const f = Math.exp(-3 * dt);
      s.vx *= f; s.vz *= f;
      const nx = s.x + s.vx * dt, nz = s.z + s.vz * dt;
      if (lakeAt(nx, nz) < -0.4) { s.x = nx; s.z = nz; } else { s.hx = -s.hx; s.hz = -s.hz; s.vx = -s.vx; s.vz = -s.vz; }
      put(s.i, [s.x, s.z, 0, 0.05], [3, 1, s.hx, s.hz]);
    }
    ib.needsUpdate = true;
  });
  return { mesh, ring };
}
