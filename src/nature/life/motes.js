// Specks that only show when the sun catches them: dust motes drifting in the sun shafts inside the
// balagan (windows, door) and the uraha (smoke hole), midge swarms dancing over the shore and the
// meadow edge (bright against a low sun), and willow/poplar fluff drifting downwind. Additive
// camera-facing specks, never smaller than ~1.5 px (energy kept, so far ones just fade). One draw.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec2, vec3, float, sin, cos, fract, floor, select, smoothstep, max, min, abs, length, normalize,
  positionPrevious, cameraViewMatrix, instanceIndex, hash, cameraPosition, dot, clamp, uv, uniformArray,
} from 'three/tsl';
import { wrapNear, phaseHG } from './common.js';
import { inner, WINDOWS, WIN, FX, FZ, DW, DH, ZD } from '../../models/balagan/dims.js';

const MAX_SHAFTS = 6;
// uraha cone radius at height y (its cover profile, model space)
const CONE = [[2.75, 0], [2.62, 1.45], [2.41, 2.56], [2.07, 3.2], [1.61, 4.02], [1.1, 4.92], [0.62, 5.8], [0.24, 6.55], [0, 6.95]];
const coneR = (y) => { for (let k = 1; k < CONE.length; k++) if (y <= CONE[k][1]) { const [r0, y0] = CONE[k - 1], [r1, y1] = CONE[k]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0; };

export function buildMotes(ctx, world, { tier, W, F, K }) {
  const PER_SHAFT = tier === 'low' ? 24 : 48, NSW = tier === 'low' ? 3 : 6, PER_SW = tier === 'low' ? 24 : 40, NSEED = tier === 'low' ? 16 : 36;
  const nDust = MAX_SHAFTS * PER_SHAFT, nMidge = NSW * PER_SW, N = nDust + nMidge + NSEED;
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  g.instanceCount = N;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  // ---------- sun shafts (CPU, refreshed when the sun moves): origin, two half-axes of the opening, length ----------
  const openings = []; // { c, a, b, n (outward), floor, cone? } in world space
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const p of world.placed || []) {
    const obj = p.object; if (!obj) continue;
    const toW = (x, y, z) => obj.localToWorld(v3(x, y, z));
    const dirW = (x, y, z) => v3(x, y, z).transformDirection(obj.matrixWorld);
    if (p.model === 'balagan' && p.variant !== 'winter') {
      for (const [side, lat, sill] of WINDOWS) {
        const y = sill + WIN / 2;
        if (side === 'S') openings.push({ c: toW(lat, y, inner(FZ, y)), a: dirW(1, 0, 0).multiplyScalar(WIN * 0.45), b: dirW(0, 1, 0).multiplyScalar(WIN * 0.45), n: dirW(0, 0, 1), floor: p.y + 0.03 });
        if (side === 'W') openings.push({ c: toW(-inner(FX, y), y, lat), a: dirW(0, 0, 1).multiplyScalar(WIN * 0.45), b: dirW(0, 1, 0).multiplyScalar(WIN * 0.45), n: dirW(-1, 0, 0), floor: p.y + 0.03 });
      }
      const y = DH / 2;
      openings.push({ c: toW(inner(FX, y), y, ZD), a: dirW(0, 0, 1).multiplyScalar(DW * 0.45), b: dirW(0, 1, 0).multiplyScalar(DH * 0.45), n: dirW(1, 0, 0), floor: p.y + 0.03, door: true });
    }
    if (p.model === 'urasa') {
      let holeY = 10.5;
      obj.traverse((o) => { if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && o.material?.blending === THREE.AdditiveBlending) holeY = o.position.y; });
      openings.push({ c: toW(0, holeY - 0.05, 0), a: dirW(1, 0, 0).multiplyScalar(0.39), b: dirW(0, 0, 1).multiplyScalar(0.39), n: dirW(0, 1, 0), floor: p.y + 0.03, cone: { obj, holeY } });
    }
  }
  openings.length = Math.min(openings.length, MAX_SHAFTS);
  const uO = uniformArray(Array.from({ length: MAX_SHAFTS }, () => new THREE.Vector4()), 'vec4'); // centre, length
  const uA = uniformArray(Array.from({ length: MAX_SHAFTS }, () => new THREE.Vector4()), 'vec4'); // half-axis a, lit
  const uB = uniformArray(Array.from({ length: MAX_SHAFTS }, () => new THREE.Vector4()), 'vec4'); // half-axis b
  const lastSun = new THREE.Vector3();
  const refresh = () => {
    const sun = world.engine.sun.position.clone().normalize();
    if (sun.distanceToSquared(lastSun) < 1e-8) return;
    lastSun.copy(sun);
    const L = sun.clone().negate();
    openings.forEach((o, k) => {
      const facing = sun.dot(o.n), lit = THREE.MathUtils.smoothstep(facing, 0.04, 0.2) * THREE.MathUtils.smoothstep(sun.y, 0.03, 0.12);
      let len = L.y < -0.02 ? (o.c.y - o.floor) / -L.y : 0;
      if (o.cone) { // the shaft leaves through the cone wall
        const lc = o.cone.obj.worldToLocal(o.c.clone()), ld = L.clone().transformDirection(o.cone.obj.matrixWorld.clone().invert());
        for (let s = 0.2; s < len; s += 0.1) { const y = lc.y + ld.y * s, r = Math.hypot(lc.x + ld.x * s, lc.z + ld.z * s); if (r > coneR(y) - 0.2) { len = s; break; } }
      }
      len = Math.min(len, 6);
      uO.array[k].set(o.c.x, o.c.y, o.c.z, len);
      uA.array[k].set(o.a.x, o.a.y, o.a.z, lit);
      uB.array[k].set(o.b.x, o.b.y, o.b.z, 0);
    });
  };
  refresh();
  world.updaters.push(refresh);

  const i = instanceIndex.toFloat();
  const h = (k) => hash(instanceIndex.add(k * 7919 + 503));
  const kind = select(i.lessThan(nDust), float(0), select(i.lessThan(nDust + nMidge), float(1), float(2)));
  const groundAt = (xz) => F.sampleA(xz).x.add(F.HBASE);
  const sunUp = W.sunDir.y;
  const lowSun = float(1).sub(smoothstep(0.25, 0.6, sunUp)).mul(1.5).add(0.5);

  // world position, physical size (m), brightness at time t
  const state = (t) => {
    // dust: anywhere in its shaft's prism, drifting slowly (Brownian-ish), lit only while the shaft is
    const sIdx = floor(i.div(PER_SHAFT)).min(MAX_SHAFTS - 1).toInt();
    const O = uO.element(sIdx), A = uA.element(sIdx), B = uB.element(sIdx);
    const L = W.sunDir.negate();
    const tt = t.mul(0.05);
    const ra = fract(h(1).add(sin(tt.mul(h(2).add(0.5)).add(h(3).mul(6))).mul(0.12))).mul(2).sub(1);
    const rb = fract(h(4).add(sin(tt.mul(h(5).add(0.5)).add(h(6).mul(6))).mul(0.12)).sub(tt.mul(0.3))).mul(2).sub(1);
    const along = fract(h(7).add(sin(tt.mul(0.7).add(h(8).mul(6))).mul(0.05))).mul(O.w);
    const pDust = O.xyz.add(A.xyz.mul(ra)).add(B.xyz.mul(rb)).add(L.mul(along));
    const bDust = A.w.mul(smoothstep(0, 0.1, O.w)).mul(0.5);

    // midges: swarms on a 30 m lattice round the camera, by water and at the meadow edge
    const sw = floor(i.sub(nDust).div(PER_SW));
    const hs = (k) => hash(sw.add(k * 131 + 7));
    const cell = 22;
    const home = wrapNear(vec2(hs(1), hs(2)).mul(cell * 2), W.cam.xz, cell * 2);
    const A2 = F.sampleA(home.xz), B2 = F.sampleB(home.xz);
    const hab = max(float(1).sub(smoothstep(2, 14, abs(A2.y.add(1)))), smoothstep(0.2, 0.4, B2.x).mul(float(1).sub(smoothstep(0.6, 0.8, B2.x))));
    const ground = max(groundAt(home.xz), float(90.6));
    const centre = vec3(home.xz.x, ground.add(hs(3).mul(1.5).add(1.4)), home.xz.y)
      .add(vec3(W.dir.x, 0, W.dir.y).mul(W.gust(home.xz).mul(0.6)));
    const f1 = h(11).mul(3).add(2), f2 = h(12).mul(3).add(2.5), f3 = h(13).mul(2).add(1.5);
    const pMid = centre.add(vec3(sin(t.mul(f1).add(h(14).mul(6))).mul(0.35), sin(t.mul(f3).add(h(15).mul(6))).mul(0.5).add(sin(t.mul(0.7).add(h(16).mul(6))).mul(0.15)), cos(t.mul(f2).add(h(17).mul(6))).mul(0.35)));
    const bMid = hab.mul(home.fade).mul(0.6);

    // fluff: drifts downwind through a 36 m box, rising and sinking
    const bS = 36;
    const drift = W.dir.mul(t.mul(h(21).mul(0.6).add(0.7)));
    const hf = wrapNear(vec2(h(22), h(23)).mul(bS).add(drift), W.cam.xz, bS);
    const yS = groundAt(hf.xz).add(h(24).mul(3.5).add(0.6)).add(sin(t.mul(0.4).add(h(25).mul(6))).mul(0.5));
    const pSeed = vec3(hf.xz.x, yS, hf.xz.y).add(vec3(W.dir.x, 0, W.dir.y).mul(W.gust(hf.xz).mul(1.2)));
    const bSeed = hf.fade.mul(0.35);

    const isD = kind.lessThan(0.5), isM = kind.greaterThan(0.5).and(kind.lessThan(1.5));
    const pos = select(isD, pDust, select(isM, pMid, pSeed));
    const size = select(isD, float(0.0006), select(isM, float(0.0012), float(0.006)));
    const bright = select(isD, bDust, select(isM, bMid, bSeed));
    return { pos, size, bright };
  };

  const vB = attribute('uv', 'vec2');
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.fog = false;
  const V = cameraViewMatrix; // rows are the camera axes
  const right = vec3(V.element(0).x, V.element(1).x, V.element(2).x);
  const up = vec3(V.element(0).y, V.element(1).y, V.element(2).y);
  const s = state(K.time), sp = state(K.prev);
  const dist = length(s.pos.sub(cameraPosition));
  const drawn = max(s.size, dist.mul(K.pxAngle).mul(0.9));
  const q = vB.mul(2).sub(1);
  mat.positionNode = Fn(() => {
    const off = right.mul(q.x).add(up.mul(q.y)).mul(drawn);
    positionPrevious.assign(sp.pos.add(off));
    return s.pos.add(off);
  })();
  // energy kept when drawn bigger than it is; lit by forward-scattered sun
  const toEye = normalize(s.pos.sub(cameraPosition));
  const cosT = dot(toEye, W.sunDir);
  const isD = kind.lessThan(0.5);
  const phase = select(isD, phaseHG(cosT, 0.6).mul(0.15).add(0.05), select(kind.lessThan(1.5), phaseHG(cosT, 0.8).mul(0.12).mul(lowSun), phaseHG(cosT, 0.5).mul(0.06).add(0.02)));
  const energy = min(s.size.div(drawn).pow(2), 1).mul(select(isD, float(60), select(kind.lessThan(1.5), float(40), float(18))));
  const r = length(uv().mul(2).sub(1));
  const spot = clamp(float(1).sub(r.mul(r)), 0, 1).pow(2);
  mat.colorNode = W.sunCol.mul(s.bright).mul(phase).mul(energy).mul(spot).mul(select(isD, vec3(1, 0.9, 0.75), vec3(1, 0.97, 0.9)));

  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'life-motes';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = 5;
  mesh.layers.set(1);
  world.scene.add(mesh);
  return { mesh, openings };
}
