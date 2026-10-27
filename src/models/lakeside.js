// The north shore of the alaas lake, below the homestead: the муҥха seine folded and hung to dry over
// three larch poles (birch-bark floats on the head rope, bark-wrapped stone sinkers on the foot rope,
// the bag bundled beneath), forked guide poles, the ice chisel and hair scoop waiting for winter,
// a dugout (тыы) pulled up on the shore, and a flat stone at the water's edge where a little milk is
// poured for the lake's иччи (Эбэ). Local frame: the water lies south (+z), edge at z ≈ 10–12.
import * as THREE from 'three/webgpu';
import { texture, uv, uniform, positionLocal, positionWorld, cameraPosition, smoothstep, mix, float, color, exp, attribute, mx_noise_float } from 'three/tsl';
import { LAKE } from '../world/terrain.js';
import {
  Bucket, addLog, blob, decalMat, jitterTint, lathe, mtx, patchGeo, pmat, ribbonGeo, sleep, tube, TAU,
} from './yardlife/kit.js';
import { yardMats } from './yardlife/mats.js';
import { maps } from '../engine/materials.js';
import { milk } from './yardlife/pieces.js';
import { section } from '../load/geocache.js';
import { versioned } from '../load/assetv.js';

export default async function build(ctx, placement) {
  const { THREE: T, terrain, rng } = ctx;
  const px = placement.x, pz = placement.z, py = placement.y;
  const ground = (x, z) => terrain.heightFast(px + x, pz + z) - py; // per-vertex grime (kit.js Bucket)
  // the viewer has no lake: put the water a metre below the origin there
  const isViewer = !terrain.addPad;
  const waterY = isViewer ? -0.03 : LAKE.level - py;
  const g = ground;
  const group = new T.Group();
  group.name = 'lakeside';
  const M = yardMats();
  const B = new Bucket(g);
  const colliders = [], interactables = [], ups = [];
  const proxyMat = new T.MeshBasicMaterial({ visible: false });
  const proxy = (x, y, z, w, h, d, yaw = 0) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), proxyMat);
    m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = false;
    group.add(m);
    return m;
  };
  // where the water starts along a north–south line
  const edgeZ = (x) => { for (let z = 0; z < 25; z += 0.1) if (g(x, z) < waterY + 0.02) return z; return 12; };

  // net: weathered twine, mesh holes from the opacity map, coverage dithered (alpha hash)
  const netMaps = maps('acg_net');
  const opTex = new THREE.TextureLoader().load(versioned(`${import.meta.env.BASE_URL}assets/tex/acg_net/op.webp`));
  opTex.wrapS = opTex.wrapT = THREE.RepeatWrapping;
  const NETS = 0.42; // metres per tile (≈ 3.5 cm mesh)
  const net = pmat('acg_net', { scale: NETS, tint: 0x9a8c78, double: true, dirt: 0.3, vary: 0.25, id: 'net' });
  // up close the twine is crisp; once the mesh is finer than a pixel the mip average would read as a
  // solid dark wall, so coverage thins to the real ~15–25 % and the twine pales to a faint grey veil
  const netDist = positionWorld.sub(cameraPosition).length();
  const farNet = smoothstep(4, 22, netDist);
  const op = texture(opTex, uv().div(NETS)).r;
  net.opacityNode = mix(op.mul(2.6).clamp(0, 1), op.mul(0.55).clamp(0, 0.28), farNet).mul(mix(1, 0.55, smoothstep(30, 90, netDist)));
  // the photo set is black twine: colour it as weathered grey-brown plant fibre instead
  net.colorNode = attribute('color', 'vec3').mul(mix(color(0x6b5e4c), color(0x958c7e), farNet)).mul(mx_noise_float(positionWorld.mul(1.3)).mul(0.18).add(1));
  net.roughnessNode = float(0.92);
  net.alphaHash = true;
  void netMaps;

  // ---------- path down from the meadow ----------
  const pathMat = decalMat('brown_mud_dry', { scale: 2.4, tint: 0xa89a86, strength: 0.9 });
  const stoneX = -2.2, stoneZ = edgeZ(-2.2) - 0.35;
  // the geometry runs in section()s, which a bake stands in for (src/load/geocache.js)
  section(() => {
    B.add(ribbonGeo(g, [[0, -9], [0.6, -4], [-0.8, 1], [-1.8, 5], [stoneX, stoneZ - 0.9]], 0.75, rng), pathMat);
    B.add(ribbonGeo(g, [[-0.8, 1], [-4, 3.5], [-6.5, 6.5]], 0.55, rng), pathMat);
    // the cattle-trodden muddy strip along the water
    B.add(patchGeo(g, -3, edgeZ(-3) - 0.6, 7, 1.6, 0.05, 26, 0.02), decalMat('muddy_tracks', { scale: 2, tint: 0xb4a894, strength: 0.55 }));
  });

  // ---------- the net rack ----------
  const RZ = 1.6, PH = 2.2;
  const poles = [[-4.3, RZ + 0.1], [0, RZ - 0.05], [4.2, RZ + 0.08]];
  section(() => {
    for (const [x, z] of poles) {
      addLog(B, [x, g(x, z) - 0.4, z], [x + (rng() - 0.5) * 0.06, g(x, z) + PH, z + (rng() - 0.5) * 0.05], 0.07, 0.05, rng, M.wood, M.end, { seg: 8 });
    }
  });
  for (const [x, z] of poles) colliders.push({ x, z, r: 0.12 });
  const topY = (x) => {
    // over the pole tops, sagging between them, falling away past the end poles
    const gy = (x2) => g(x2, RZ) + PH - 0.02;
    if (x <= poles[0][0]) return gy(poles[0][0]) - (poles[0][0] - x) * 1.1;
    if (x >= poles[2][0]) return gy(poles[2][0]) - (x - poles[2][0]) * 1.1;
    const [a, b] = x < 0 ? [poles[0][0], poles[1][0]] : [poles[1][0], poles[2][0]];
    const t = (x - a) / (b - a);
    return gy(a) + (gy(b) - gy(a)) * t - 0.42 * Math.sin(Math.PI * t) ** 1.2;
  };
  section(() => {
    const X0 = -6.0, X1 = 5.9, nx = 80, ny = 14;
    const hem = { front: [], back: [] };
    for (const [side, layer] of [[1, 0], [-1, 0]]) {
      const pos = [], uvs = [], col = [], idx = [];
      const ph = rng() * 9, ph2 = rng() * 9;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const x = X0 + (X1 - X0) * i / nx;
        const top = topY(x), ground0 = g(x, RZ);
        // the hem rises and falls: parts of the net are gathered up higher than others
        const gather = Math.max(0, Math.sin(x * 0.75 + ph) + Math.sin(x * 1.9 + ph2) * 0.5);
        const bottom = Math.max(ground0 + 0.22 + gather * 0.45 + 0.05 * Math.sin(x * 4.1 + ph), top - 2.0);
        const v = j / ny;
        const y = top - (top - bottom) * v;
        // hangs out from the line in deep vertical folds, bunched where it is gathered
        const f = Math.sin(x * 4.6 + ph2 + Math.sin(x * 1.3) * 2.5);
        const fold = Math.sign(f) * Math.abs(f) ** 0.6 * (0.06 + gather * 0.06) * v + Math.sin(x * 13 + ph) * 0.02 * v;
        const z = RZ + side * (0.025 + layer * 0.03 + v * 0.16 + fold);
        pos.push(x, y, z);
        uvs.push(x + layer * 0.13, (top - y) + layer * 0.21 + (side > 0 ? 0 : 7));
        const wet = 0.85 + 0.15 * Math.sin(x * 0.7 + ph) - v * 0.1;
        col.push(wet, wet * 0.98, wet * 0.95);
        if (j === ny && layer === 0) hem[side > 0 ? 'front' : 'back'].push([x, y, z]);
      }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      const ng = new T.BufferGeometry();
      ng.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      ng.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
      ng.setAttribute('color', new T.Float32BufferAttribute(col, 3));
      ng.setIndex(idx); ng.computeVertexNormals();
      B.add(ng, net);
    }
    // head rope along the front hem with rolled birch-bark floats every ~50 cm
    const ropeAlong = (pts, r) => B.add(tube(pts.filter((_, i) => i % 3 === 0).map((p) => [p[0], p[1] - 0.01, p[2]]), r, 5), M.rope);
    ropeAlong(hem.front, 0.006);
    ropeAlong(hem.back, 0.007);
    for (let k = 0; k < hem.front.length; k += 3) {
      const [x, y, z] = hem.front[k];
      if (k % 6) continue;
      const fl = new T.CylinderGeometry(0.022, 0.022, 0.085, 10, 1, false);
      B.add(fl, M.birch, mtx([x, y - 0.03, z + 0.02], [0, 0, Math.PI / 2 + (rng() - 0.5) * 0.3]), [0.95, 0.9, 0.82]);
    }
    // foot rope with flat stones wrapped in bark
    for (let k = 0; k < hem.back.length; k += 3) {
      if (k % 6 === 3) continue;
      const [x, y, z] = hem.back[k];
      const sy = Math.max(y - 0.05, g(x, z) + 0.04);
      B.add(blob(0.05, 0.03, 0.04, rng, { detail: 1, rough: 0.15 }), M.stone, mtx([x, sy - 0.02, z - 0.02], [0, rng() * TAU, 0]), [0.8, 0.78, 0.74]);
      B.add(new T.TorusGeometry(0.047, 0.012, 4, 10), M.birchIn, mtx([x, sy, z - 0.02], [Math.PI / 2, rng(), 0]).multiply(mtx([0, 0, 0], [0, 0, 0], [1, 0.75, 1])));
    }
    // the bag (ийэтэ) bundled on the grass under the middle of the rack, tied with rope
    {
      const bx = 0.3, bz = RZ + 0.05, by = g(bx, bz);
      for (let k = 0; k < 4; k++) {
        const s = 0.5 + k * 0.17;
        const sh = blob(1.25 * s, 0.32 * s, 0.4 * s, rng, { detail: 3, rough: 0.12 });
        const p = sh.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) * (1 - Math.max(0, x / (1.25 * s)) * 0.6)); p.setZ(i, p.getZ(i) * (1 - Math.max(0, x / (1.25 * s)) * 0.65)); }
        sh.computeVertexNormals();
        const uvA = sh.attributes.uv;
        for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 1.7 + k * 0.3, uvA.getY(i) * 1.7);
        B.add(sh, net, mtx([bx, by - 0.02, bz], [0, 0.12, 0]), [0.8, 0.76, 0.7]);
      }
      for (const tx of [-0.5, 0.35]) B.add(new T.TorusGeometry(0.21 - tx * 0.12, 0.008, 4, 16), M.rope, mtx([bx + tx, by + 0.17, bz], [0, Math.PI / 2 + 0.12, 0]).multiply(mtx([0, 0, 0], [0, 0, 0], [1, 0.75, 1])));
    }
  });
  interactables.push({ entry: 'munkha', target: proxy(0, g(0, RZ) + 1.2, RZ, 11.5, 2.3, 0.9) });
  colliders.push({ x: 0, z: RZ, hw: 6, hd: 0.35, y0: g(0, RZ) + 0.2, y1: g(0, RZ) + 2.5 });

  // forked guide poles lying in the grass; the ice chisel and the hair scoop leaning on the rack
  section(() => {
    for (const [x, z, yaw] of [[1.8, 4.6, 0.12], [2.3, 5.2, 0.05]]) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const a = [x - 1.5 * c, 0, z + 1.5 * s], b = [x + 1.5 * c, 0, z - 1.5 * s];
      a[1] = g(a[0], a[2]) + 0.04; b[1] = g(b[0], b[2]) + 0.05;
      addLog(B, a, b, 0.045, 0.032, rng, M.wood, M.end, { seg: 7, bend: 0.02 });
      // the fork
      const f = [b[0] + 0.45 * c + 0.12, g(b[0], b[2]) + 0.05, b[2] - 0.45 * s + 0.1];
      addLog(B, [b[0] - 0.2 * c, b[1], b[2] + 0.2 * s], f, 0.028, 0.02, rng, M.wood, M.end, { seg: 6 });
    }
    {
      // ice chisel (пешня): long larch shaft with a forged chisel
      const [x, z] = poles[2], base = [x + 0.65, g(x + 0.65, z + 0.25), z + 0.25], top = [x + 0.05, g(x, z) + 1.95, z + 0.08];
      addLog(B, [base[0], base[1] + 0.25, base[2]], top, 0.022, 0.02, rng, M.wood, M.end, { seg: 7 });
      B.add(new T.CylinderGeometry(0.018, 0.006, 0.28, 6), M.iron, mtx([base[0] + 0.04, base[1] + 0.12, base[2] + 0.01], [0, 0, 0.33]));
      // hair scoop (кыл хамыйах): willow ring with a hair net on a handle
      const [x1, z1] = poles[0];
      const h0 = [x1 - 0.5, g(x1 - 0.5, z1 + 0.3) + 0.02, z1 + 0.3], h1 = [x1 - 0.03, g(x1, z1) + 1.45, z1 + 0.07];
      addLog(B, h0, h1, 0.017, 0.015, rng, M.willow, M.endFresh, { seg: 6 }, [0.7, 0.62, 0.52]);
      const ring = mtx([h1[0] + 0.02, h1[1] + 0.13, h1[2] + 0.03], [0, 0.3, 0.1]);
      B.add(new T.TorusGeometry(0.125, 0.008, 5, 18), M.willow, ring.clone().multiply(mtx([0, 0, 0], [0, 0, 0])), [0.7, 0.62, 0.52]);
      // the woven horsehair: a shallow bag sagging from the ring, see-through (the net's two-sided material, dark)
      const hairNet = new T.CircleGeometry(0.122, 16, 0, TAU);
      const hp = hairNet.attributes.position, hu = hairNet.attributes.uv;
      for (let i = 0; i < hp.count; i++) {
        const r2 = (hp.getX(i) ** 2 + hp.getY(i) ** 2) / 0.122 ** 2;
        hp.setZ(i, -0.05 * (1 - r2));
        hu.setXY(i, hu.getX(i) * 0.35, hu.getY(i) * 0.35); // a finer mesh than the seine
      }
      hairNet.computeVertexNormals();
      B.add(hairNet, net, ring, [0.42, 0.38, 0.35]);
    }
  });

  // ---------- the dugout (тыы), pulled up, bow on the shore, stern towards the water ----------
  colliders.push(section(() => {
    const L = 4.3, Bm = 0.58, D = 0.34, th = 0.035;
    const N = 30, K = 10;
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, e = Math.abs(2 * t - 1);
      const w = Bm / 2 * Math.pow(Math.max(0, 1 - e ** 2.4), 0.55) + 0.004;
      const d = D * Math.pow(Math.max(0, 1 - e ** 3), 0.45) + 0.01;
      const sheer = 0.07 * e ** 3;
      const x = (t - 0.5) * L;
      let arc = 0, prev = null;
      const ring = [];
      for (let k = 0; k <= K; k++) { const a = -Math.PI / 2 + Math.PI * k / K; ring.push([w * Math.sin(a), sheer - d * Math.cos(a) * 0.95 - d * 0.05]); }
      for (let k = K; k >= 0; k--) { const a = -Math.PI / 2 + Math.PI * k / K; const wi = Math.max(0.002, w - th), di = Math.max(0.005, d - th * 1.3); ring.push([wi * Math.sin(a), sheer - di * Math.cos(a) * 0.95 - di * 0.05]); }
      for (const [z, y] of ring) {
        if (prev) arc += Math.hypot(z - prev[0], y - prev[1]);
        prev = [z, y];
        pos.push(x, y, z); uvs.push(x, arc);
      }
    }
    const R = 2 * (K + 1);
    for (let i = 0; i < N; i++) for (let k = 0; k < R - 1; k++) { const a = i * R + k, b = a + R; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    // the rim between outer and inner gunwale
    for (let i = 0; i < N; i++) for (const [o, n] of [[0, R - 1], [K, K + 1]]) { const a = i * R + o, b = i * R + n, c = a + R, d = b + R; idx.push(a, c, b, b, c, d); }
    const hull = new T.BufferGeometry();
    hull.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    hull.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    hull.setIndex(idx); hull.computeVertexNormals();
    const cx = -7.4, cz = edgeZ(-7.4) - 0.9, yaw = 1.1; // bow up the shore (north-west), stern to the water
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const bow = [cx + L / 2 * c, cz - L / 2 * s], stern = [cx - L / 2 * c, cz + L / 2 * s];
    const gb = g(...bow), gs = g(...stern), gm = g(cx, cz);
    const pitch = Math.atan2(gb - gs, L);
    const hullMat = pmat('rough_wood', { scale: 1.2, tint: 0x75685a, lichen: 0.15, dirt: 0.5, double: true, rough: 1.8, vary: 0.25 });
    const m = mtx([cx, Math.max(gm, (gb + gs) / 2) + D - 0.04, cz], [0, yaw, pitch]).multiply(mtx([0, 0, 0], [0.06, 0, 0]));
    B.add(hull, hullMat, m);
    // a double-bladed paddle lying in it
    const paddle = mtx([0.2, -D + 0.12, 0.05], [0, 0.04, 0.06]);
    const shaft = addLog({ add: (geo, mat, mm, t) => B.add(geo, mat, m.clone().multiply(paddle).multiply(mm), t), ground: B.ground }, [-1.3, 0, 0], [1.3, 0, 0], 0.017, 0.017, rng, M.fresh, M.endFresh, { seg: 6 }, [0.7, 0.62, 0.52]);
    void shaft;
    for (const sx of [-1, 1]) {
      // a carved blade with thickness: thick along the spine, thinning to rounded edges and tip
      const bl = blob(0.21, 0.008, 0.06, rng, { detail: 2, rough: 0.03, flatBottom: false });
      bl.translate(0, -0.008 * 0.15, 0);
      B.add(bl, M.fresh, m.clone().multiply(paddle).multiply(mtx([sx * 1.42, 0, 0], [0, 0, sx * 0.05])), [0.66, 0.58, 0.5]);
    }
    return { x: cx, z: cz, hw: L / 2, hd: Bm / 2 + 0.05, rot: yaw };
  }));
  // no blades through the hull: the grass under the pulled-up dugout is crushed (circles along its keel)
  const boat = colliders.at(-1), boatBare = [];
  for (let t = -1; t <= 1.001; t += 0.2) boatBare.push({ x: boat.x + Math.cos(boat.rot) * boat.hw * t * 0.95, z: boat.z - Math.sin(boat.rot) * boat.hw * t * 0.95, r: boat.hd + 0.08 - Math.abs(t) ** 3 * 0.18 });

  // a few stones along the shore
  section(() => {
    for (let k = 0; k < 9; k++) {
      const x = -10 + rng() * 18, z = edgeZ(x) - 0.5 - rng() * 1.2;
      if (Math.hypot(x + 7.4, z - (edgeZ(-7.4) - 0.9)) < 2.6) continue; // not in the boat
      const sz = 0.08 + rng() * 0.16;
      B.add(blob(sz * 1.2, sz * 0.6, sz, rng, { detail: 2, rough: 0.12 }), M.stone, mtx([x, g(x, z) - sz * 0.15, z], [0, rng() * TAU, 0]), jitterTint(rng, 0.12));
    }
  });

  // ---------- the offering place: a flat stone at the water's edge ----------
  const sy = g(stoneX, stoneZ);
  section(() => {
    B.add(blob(0.42, 0.14, 0.32, rng, { detail: 3, rough: 0.06 }), M.stone, mtx([stoneX, sy - 0.05, stoneZ], [0, 0.4, 0]), [0.92, 0.9, 0.86]);
  });
  colliders.push({ x: stoneX, z: stoneZ, r: 0.3, y0: sy - 0.2, y1: sy + 0.12 });
  // the birch-bark cup of milk on the stone (its own group so it can be lifted and tipped)
  const cup = new T.Group();
  const cupY = sy - 0.05 + 0.14 * 1.12;
  cup.position.set(stoneX + 0.08, cupY, stoneZ - 0.05);
  const mkMesh = (geo, mat, tint = [1, 1, 1]) => {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => tint[i % 3]), 3));
    geo.setAttribute('grime', new T.Float32BufferAttribute(new Float32Array(n).fill(0.5), 1));
    const me = new T.Mesh(geo, mat);
    cup.add(me);
    return me;
  };
  mkMesh(lathe([[0.055, 0], [0.068, 0.1], [0.064, 0.1], [0.051, 0.006], [0, 0.006]], 20), K_bark());
  mkMesh(new T.TorusGeometry(0.067, 0.004, 4, 20).rotateX(Math.PI / 2).translate(0, 0.1, 0), M.willow, [0.8, 0.72, 0.6]);
  const milkTop = mkMesh(new T.CircleGeometry(0.06, 18).rotateX(-Math.PI / 2).translate(0, 0.075, 0), milk);
  function K_bark() { return pmat('canvas:birch', { scale: 0.5, back: 'birchIn', double: true, dirt: 0.4, tint: 0xecd3a6 }); }
  group.add(cup);

  // pouring: a thin white stream and ripple rings on the water where it lands
  const stream = new T.Mesh(new T.CylinderGeometry(0.006, 0.01, 1, 6, 1, true).translate(0, -0.5, 0), milk);
  stream.visible = false; stream.castShadow = false;
  group.add(stream);
  const rippleT = uniform(10);
  const rmat = new T.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  {
    const d = positionLocal.xy.length();
    let a = float(0);
    for (let i = 0; i < 3; i++) {
      const tt = rippleT.sub(i * 0.45).max(0);
      const r = tt.mul(0.42);
      const w = exp(d.sub(r).div(0.025).pow(2).negate());
      a = a.add(w.mul(exp(tt.mul(-0.9))).mul(tt.greaterThan(0).select(1, 0)));
    }
    rmat.opacityNode = a.mul(0.55).clamp(0, 1);
    rmat.colorNode = color(0xdfe6ea);
  }
  const ripple = new T.Mesh(new T.PlaneGeometry(4, 4), rmat); // rings in the plane's own xy
  ripple.rotation.x = -Math.PI / 2;
  const pourAt = [stoneX + 0.1, stoneZ + 0.75];
  ripple.position.set(pourAt[0], waterY + 0.012, pourAt[1]);
  ripple.castShadow = false; ripple.receiveShadow = false; ripple.renderOrder = 4;
  group.add(ripple);

  let pour = null; // { t }
  const home = cup.position.clone();
  ups.push((dt) => {
    rippleT.value += dt;
    if (!pour) return;
    pour.t += dt;
    const t = pour.t;
    // 0–1.2 s lift and carry over the water, 1.2–3.4 tip and pour, 3.4–4.6 bring it back
    const k = t < 1.2 ? t / 1.2 : t < 3.4 ? 1 : Math.max(0, 1 - (t - 3.4) / 1.2);
    const e = k * k * (3 - 2 * k);
    cup.position.set(home.x + (pourAt[0] - home.x) * e * 0.9, home.y + e * 0.35, home.z + (pourAt[1] - home.z - 0.12) * e * 0.9);
    const tip = t > 1.2 && t < 3.4 ? Math.min(1, (t - 1.2) / 0.6) * Math.min(1, (3.4 - t) / 0.4) : 0;
    cup.rotation.x = tip * 1.25;
    milkTop.visible = t < 2.6;
    const flowing = t > 1.6 && t < 3.1;
    stream.visible = flowing;
    if (flowing) {
      const lip = new T.Vector3(0, 0.1, 0.066).applyEuler(cup.rotation).add(cup.position);
      const len = Math.max(0.05, lip.y - waterY);
      stream.position.copy(lip);
      stream.scale.set(1, len, 1);
    }
    if (t > 1.75 && !pour.rippled) { pour.rippled = true; rippleT.value = 0; ripple.position.set(cup.position.x, waterY + 0.012, cup.position.z + 0.066); }
    if (t > 4.6) { pour = null; cup.position.copy(home); cup.rotation.set(0, 0, 0); milkTop.visible = true; }
  });
  interactables.push({
    entry: 'ichchi',
    target: proxy(stoneX, sy + 0.12, stoneZ, 0.9, 0.4, 0.7),
    label: { sah: 'Эбэни аһатыы', en: 'Greeting the lake', ru: 'Приветствие озеру' },
    act: {
      id: 'milk',
      label: { sah: 'Эбэҕэ үүт кут', en: 'Pour a little milk for the lake', ru: 'Плеснуть озеру немного молока' },
      thenCard: true,
      run: async (game, it) => {
        pour = { t: 0 };
        await sleep(1500);
        const wp = new T.Vector3(pourAt[0], waterY, pourAt[1]);
        group.localToWorld(wp);
        game.audio?.play('water-pour', wp);
        await sleep(3300);
        delete it.act; // once per visit: the lake is greeted, not farmed
      },
    },
  });

  // the view over the lake and the meadow
  interactables.push({ entry: 'alaas', zone: { x: 9, z: 4, r: 4.5 } });

  for (const m of B.build(group)) if (m.material === net) m.castShadow = false; // twine throws only a faint, broken shadow
  group.userData.bare = boatBare;
  group.userData.paths = [{ w: 0.75, pts: [[0, -9], [0.6, -4], [-0.8, 1], [-1.8, 5], [stoneX, stoneZ - 0.9]] }, { w: 0.55, pts: [[-0.8, 1], [-4, 3.5], [-6.5, 6.5]] }];
  return { object: group, colliders, interactables, update: (dt) => { for (const u of ups) u(dt); } };
}
