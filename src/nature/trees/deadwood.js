// Fallen larch logs and old stumps on the forest floor (instanced, drawn within ~170 m with a dither
// fade). Logs lie along the slope; their upper side carries moss (the `log` bark).
import * as THREE from 'three/webgpu';
import { positionWorld, screenCoordinate, hash, float } from 'three/tsl';
import { limbsGeometry, grow, vec } from './gen.js';
import { barkMaterial, U } from './materials.js';
import { mulberry32, smooth, fbm } from '../../util.js';

const NEAR = 170;

function logGeometry(rng, L) {
  const pts = [];
  const r0 = 0.15 + rng() * 0.06;
  const bend = (rng() - 0.5) * 0.25;
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    pts.push({ p: vec(-L / 2 + L * t, r0 * 0.85, Math.sin(t * Math.PI) * bend), r: r0 * (1 - 0.45 * t) * (k === 0 ? 0.92 : 1), ao: 0.75 + 0.2 * t, wob: 0.05 });
  }
  const limbs = [{ pts, phase: 0 }];
  // broken branch stubs sticking out
  for (let i = 0; i < 6; i++) {
    const t = 0.25 + rng() * 0.7, a = rng() * Math.PI * 2;
    const base = vec(-L / 2 + L * t, r0 * 0.85 + Math.sin(a) * r0 * 0.6, Math.cos(a) * r0 * 0.6);
    const st = grow(rng, base, vec(0.3, Math.sin(a), Math.cos(a)), 0.2 + rng() * 0.5, 0.025, { segs: 2, wander: 0.3, ao0: 0.85, ao1: 0.9 });
    st.radial = 4; limbs.push(st);
  }
  return limbsGeometry(limbs, { radial: 9, H: 1 });
}
function stumpGeometry(rng) {
  const h = 0.25 + rng() * 0.45, r = 0.16 + rng() * 0.1;
  const pts = [];
  for (let k = 0; k <= 4; k++) { const t = k / 4; pts.push({ p: vec(0, -0.1 + (h + 0.1) * t, 0), r: r * (1 + 0.35 * (1 - t) * (1 - t)), ao: 0.75, wob: 0.12 }); }
  // jagged top: a short cone closing the tube
  pts.push({ p: vec(0.03, h + 0.06, 0), r: r * 0.5, ao: 0.8 });
  pts.push({ p: vec(0.05, h + 0.1, 0.02), r: 0.01, ao: 0.8 });
  return limbsGeometry([{ pts, phase: 0 }], { radial: 10, H: 1 });
}

export function buildDeadwood(world, trees, { keep }) {
  const { terrain } = world;
  const rng = mulberry32(777);
  const group = new THREE.Group(); group.name = 'forest-deadwood';
  const logs = [0, 1, 2].map((i) => logGeometry(rng, 5 + i * 2.5));
  const stumps = [0, 1].map(() => stumpGeometry(rng));
  const mat = barkMaterial('log', { wind: false, lod: false });
  const d = hash(screenCoordinate.x.floor().add(screenCoordinate.y.floor().mul(4099.0)));
  const fade = float(NEAR).sub(positionWorld.sub(U.eye).length()).div(20).clamp(0, 1);
  mat.maskNode = d.lessThan(fade);
  const lists = [...logs, ...stumps].map(() => []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const S = 9;
  for (let z = -700; z < 700; z += S) for (let x = -700; x < 700; x += S) {
    const px = x + rng() * S, pz = z + rng() * S;
    const rd = terrain.rimDist(px, pz);
    if (rd < 300 || rd > 680) continue;
    const f = terrain.forest(px, pz);
    if (f < 0.5) continue;
    if (keep.some((k) => Math.hypot(px - k.x, pz - k.z) < k.r)) continue;
    const r = rng();
    const patch = smooth(-0.2, 0.3, fbm(px * 0.015, pz * 0.015, 91)); // windfall patches
    if (r < 0.1 + patch * 0.15) {
      const vi = (rng() * 3) | 0, L = 5 + vi * 2.5, yaw = rng() * Math.PI * 2;
      const dx = Math.cos(yaw) * L / 2, dz = -Math.sin(yaw) * L / 2;
      const h1 = terrain.height(px - dx, pz - dz), h2 = terrain.height(px + dx, pz + dz);
      const pitch = Math.atan2(h2 - h1, L);
      e.set(0, yaw, pitch, 'YZX'); q.setFromEuler(e);
      const s = 0.8 + rng() * 0.4;
      m4.compose(new THREE.Vector3(px, (h1 + h2) / 2 - 0.06, pz), q, new THREE.Vector3(s, s, s));
      lists[vi].push(m4.clone());
    } else if (r < 0.2) {
      const vi = 3 + ((rng() * 2) | 0);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
      m4.compose(new THREE.Vector3(px, terrain.height(px, pz), pz), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rng() * 0.5));
      lists[vi].push(m4.clone());
    }
  }
  // only the pieces within NEAR (+ margin) are drawn: the instance buffers are refilled as the player
  // moves (they used to hold every log of the forest — ~0.8 M triangles a frame, mostly faded out)
  const meshes = [...logs, ...stumps].map((g, i) => {
    const list = lists[i];
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(g, mat, list.length);
    m.userData.all = list;
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    m.name = 'deadwood';
    group.add(m);
    return m;
  }).filter(Boolean);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let lx = 1e9, lz = 1e9;
  const refresh = (ex, ez) => {
    const R = (NEAR + 12) ** 2;
    for (const m of meshes) {
      let n = 0;
      for (const mm of m.userData.all) {
        const dx = mm.elements[12] - ex, dz = mm.elements[14] - ez;
        if (dx * dx + dz * dz < R) m.setMatrixAt(n++, mm);
      }
      if (!n) m.setMatrixAt(n++, zero); // keep one (invisible) instance: the mesh stays drawn, so warm-up compiles it
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
    }
    lx = ex; lz = ez;
  };
  world.updaters.push((dt, { camera }) => {
    const e = camera.position;
    if (Math.hypot(e.x - lx, e.z - lz) > 6) refresh(e.x, e.z);
  });
  const cam = world.engine?.camera?.position;
  refresh(cam?.x ?? 0, cam?.z ?? 0);
  return { object: group, count: lists.reduce((a, l) => a + l.length, 0) };
}
