// Insects and falling leaves round the player, all moved on the GPU from time alone: butterflies
// (fritillaries, whites, blues, Apollos) bobbing over the meadow, dragonflies hovering and darting
// along the lake shore, a few yellowed birch leaves spinning down at the forest edge and under the
// sacred birch. Each kind lives on a lattice wrapped round the camera, so a handful of instances
// fill the whole walk; they fade out at the lattice edge and where their habitat ends. One draw.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec2, vec3, vec4, float, sin, cos, fract, floor, mix, select, smoothstep, max, min, abs, length, normalize,
  cross, positionPrevious, cameraViewMatrix, varyingProperty, faceDirection, instanceIndex, hash, uniform, positionWorld,
  cameraPosition, dot, pow, clamp, screenCoordinate,
} from 'three/tsl';
import { LAKE } from '../../world/terrain.js';
import { wrapNear } from './common.js';

export function buildBugs(ctx, world, { tier, W, F, K }) {
  const n = tier === 'low' ? [10, 10, 6] : tier === 'high' ? [30, 26, 14] : [22, 20, 10];
  const N = n[0] + n[1] + n[2];
  // three quads: left wing, right wing, body. bq = (side −1/0/1, u span 0..1, v chord −½..½)
  const bq = [];
  for (const side of [-1, 1, 0]) for (const [u, v] of [[0, -0.5], [1, -0.5], [0, 0.5], [1, 0.5]]) bq.push(side, u, v);
  const idx = [];
  for (let q = 0; q < 3; q++) { const o = q * 4; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bq, 3));
  g.setIndex(idx);
  g.instanceCount = N;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);

  const sizeMul = uniform(1); // debug: enlarge to check placement
  const birch = (world.placed || []).find((p) => p.model === 'sacred-birch');
  const uBirch = uniform(new THREE.Vector3(birch?.x ?? 1e5, birch?.y ?? 0, birch?.z ?? 1e5));
  const P = attribute('position', 'vec3');
  const vUV = varyingProperty('vec3', 'bgUV'), vN = varyingProperty('vec3', 'bgN'), vK = varyingProperty('vec4', 'bgK');
  const i = instanceIndex.toFloat();
  const kind = select(i.lessThan(n[0]), float(0), select(i.lessThan(n[0] + n[1]), float(1), float(2)));
  const h = (k) => hash(instanceIndex.add(k * 7919 + 101));
  const groundAt = (xz) => F.sampleA(xz).x.add(F.HBASE);

  // where one bug is at time t: { pos, fwd, wing angle, size, alive }
  const state = (t) => {
    const cam = W.cam.xz;
    // --- butterfly: wanders round a home spot, bobbing
    const bB = 44;
    const hb = wrapNear(vec2(h(1), h(2)).mul(bB), cam, bB);
    const tb = t.mul(h(3).mul(0.5).add(0.6)).add(h(4).mul(100));
    const pathB = (tt) => hb.xz.add(vec2(sin(tt.mul(0.37).add(h(5).mul(6))).mul(2.6).add(sin(tt.mul(0.93)).mul(0.9)), cos(tt.mul(0.31).add(h(6).mul(6))).mul(2.6).add(sin(tt.mul(0.79)).mul(0.9))));
    const xzB = pathB(tb).add(W.dir.mul(W.gust(hb.xz).mul(0.5)));
    const dB = pathB(tb.add(0.05)).sub(pathB(tb));
    const yB = groundAt(xzB).add(0.32).add(sin(tb.mul(0.45).add(h(7).mul(6))).mul(0.25).add(0.25)).add(abs(sin(tb.mul(6.5))).mul(0.07));
    const AB = F.sampleA(xzB), BB = F.sampleB(xzB);
    const habB = smoothstep(2, 6, AB.y).mul(float(1).sub(smoothstep(0.15, 0.4, BB.x))).mul(float(1).sub(smoothstep(0.3, 0.7, BB.y)));
    const wingB = sin(t.mul(Math.PI * 2 * 8).add(h(8).mul(6))).mul(0.5).add(0.5).mul(1.25).add(0.12);
    const sizeB = h(9).mul(0.015).add(0.024);

    // --- dragonfly: hovers over the shallows, then darts to the next spot
    const bD = 36;
    const hd = wrapNear(vec2(h(11), h(12)).mul(bD), cam, bD);
    const dur = h(13).mul(2.5).add(1.6), ph = t.div(dur).add(h(14).mul(10));
    const seg = floor(ph), f = fract(ph);
    const spot = (s) => hd.xz.add(vec2(hash(s.mul(31).add(i.mul(7))), hash(s.mul(17).add(i.mul(13)).add(5))).sub(0.5).mul(7));
    const e = smoothstep(0.78, 0.97, f);
    const xzD = mix(spot(seg), spot(seg.add(1)), e).add(vec2(sin(t.mul(3.1).add(h(15).mul(6))), cos(t.mul(2.7))).mul(0.04));
    const dD = spot(seg.add(1)).sub(spot(seg)).add(vec2(sin(seg.mul(1.7)), cos(seg.mul(2.3))).mul(select(e.greaterThan(0.01), float(0), float(0.6))));
    const AD = F.sampleA(xzD);
    const baseD = max(groundAt(xzD), float(LAKE.level));
    const yD = baseD.add(mix(hash(seg.add(i)).mul(0.8).add(0.35), hash(seg.add(i).add(1)).mul(0.8).add(0.35), e));
    const habD = smoothstep(-9, -5, AD.y).mul(float(1).sub(smoothstep(4, 9, AD.y)));
    const wingD = sin(t.mul(Math.PI * 2 * 27).add(h(16).mul(6))).mul(0.18);
    const sizeD = h(17).mul(0.008).add(0.036);

    // --- leaf: drops from a crown, swinging and spinning, drifting downwind, then lies a moment
    const bL = 34;
    const hl = wrapNear(vec2(h(21), h(22)).mul(bL), cam, bL);
    const per = h(23).mul(4).add(9), pl = t.div(per).add(h(24).mul(10));
    const fl = fract(pl), cyc = floor(pl);
    const start = hl.xz.add(vec2(hash(cyc.add(i.mul(3))), hash(cyc.add(i.mul(5)).add(9))).sub(0.5).mul(6));
    const fallT = fl.mul(per);
    const drift = W.dir.mul(W.gust(start).mul(0.9).add(0.25)).mul(min(fallT, per.mul(0.8)));
    const sway = vec2(sin(fallT.mul(2.2).add(h(25).mul(6))), cos(fallT.mul(1.7))).mul(0.35);
    const xzL = start.add(drift).add(sway);
    const gl = groundAt(xzL);
    const top = gl.add(h(26).mul(4).add(5));
    const yL = max(top.sub(fallT.mul(0.75)), gl.add(0.02));
    const BL = F.sampleB(xzL);
    const nearBirch = float(1).sub(smoothstep(6, 11, length(xzL.sub(uBirch.xz))));
    const habL = max(smoothstep(0.1, 0.3, BL.x).mul(float(1).sub(smoothstep(0.75, 0.95, BL.x))), nearBirch).mul(float(1).sub(smoothstep(0.85, 1, fl)));
    const dL = vec2(cos(fallT.mul(3.1)), sin(fallT.mul(3.1)));
    const sizeL = h(27).mul(0.008).add(0.022);
    const landed = yL.lessThan(gl.add(0.03));

    const isB = kind.lessThan(0.5), isD = kind.greaterThan(0.5).and(kind.lessThan(1.5));
    const pos = select(isB, vec3(xzB.x, yB, xzB.y), select(isD, vec3(xzD.x, yD, xzD.y), vec3(xzL.x, yL, xzL.y)));
    const dir = select(isB, dB, select(isD, dD, dL));
    const wing = select(isB, wingB, select(isD, wingD, float(0)));
    const size = select(isB, sizeB, select(isD, sizeD, sizeL));
    const alive = select(isB, habB.mul(hb.fade), select(isD, habD.mul(hd.fade), habL.mul(hl.fade)));
    // leaves tumble: their plane tilts back and forth; flat once on the ground
    const tilt = select(isB.or(isD), float(0), select(landed, float(0), sin(fallT.mul(2.6).add(h(28).mul(6))).mul(0.9)));
    return { pos, dir, wing, size: size.mul(smoothstep(0.02, 0.3, alive)), tilt };
  };

  const place = (t, out) => {
    const s = state(t);
    const f = normalize(vec3(s.dir.x, 0, s.dir.y).add(vec3(0.0001, 0, 0)));
    const r0 = normalize(cross(f, vec3(0, 1, 0))), u0 = cross(r0, f);
    const ct = cos(s.tilt), st = sin(s.tilt);
    const R = r0.mul(ct).sub(u0.mul(st)), U = u0.mul(ct).add(r0.mul(st));
    const side = P.x, u = P.y, v = P.z;
    const isBody = abs(side).lessThan(0.5);
    // wings hinge at the body; dragonflies and leaves keep them flat. Body: a slim strip.
    const span = select(kind.greaterThan(1.5), float(1), float(1));
    const wx = side.mul(cos(s.wing)).mul(u).mul(span), wy = sin(s.wing).mul(u).mul(span);
    const chord = select(kind.lessThan(0.5), float(1.15), select(kind.lessThan(1.5), float(0.62), float(1.5)));
    const bodyL = select(kind.lessThan(0.5), float(0.7), select(kind.lessThan(1.5), float(1.9), float(0)));
    const local = select(isBody, vec3(u.sub(0.5).mul(0.07), 0.01, v.sub(0.12).mul(bodyL)), vec3(wx, wy, v.mul(chord)));
    const p = s.pos.add(R.mul(local.x).add(U.mul(local.y)).add(f.mul(local.z)).mul(s.size).mul(sizeMul));
    if (out) {
      out.n.assign(normalize(R.mul(side.negate().mul(sin(s.wing))).add(U.mul(cos(s.wing)))));
    }
    return p;
  };

  const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.7, metalness: 0 });
  mat.positionNode = Fn(() => {
    const p = place(K.time, { n: vN });
    positionPrevious.assign(place(K.prev));
    vUV.assign(vec3(P.y, P.z, P.x));
    vK.assign(vec4(kind, h(31), h(32), 0));
    return p;
  })();
  mat.normalNode = cameraViewMatrix.mul(vec4(vN.mul(faceDirection), 0)).xyz.normalize();

  const ell = (q, c, r) => length(q.sub(c).div(r));
  const shade = Fn(() => {
    const u = vUV.x, v = vUV.y, side = vUV.z, k = vK.x, sp = vK.y;
    const q = vec2(u, v);
    const body = abs(side).lessThan(0.5);
    // butterfly wing: fore + hind lobes; species by hash
    const fore = ell(q, vec2(0.5, 0.17), vec2(0.52, 0.34)), hind = ell(q, vec2(0.36, -0.2), vec2(0.38, 0.3));
    const inB = min(fore, hind).lessThan(1);
    const edge = smoothstep(0.75, 1, min(fore, hind));
    const fritillary = vec3(0.62, 0.22, 0.04), white = vec3(0.86, 0.85, 0.8), blue = vec3(0.25, 0.32, 0.75), apollo = vec3(0.83, 0.8, 0.72);
    const base = select(sp.lessThan(0.4), fritillary, select(sp.lessThan(0.7), white, select(sp.lessThan(0.85), blue, apollo)));
    const spots = select(sp.lessThan(0.4), smoothstep(0.55, 0.8, sin(u.mul(23)).mul(sin(v.mul(19)))), select(sp.lessThan(0.7), smoothstep(0.7, 0.9, u).mul(smoothstep(0.05, 0.25, v)), float(0)));
    const red = select(sp.greaterThan(0.85), float(1).sub(smoothstep(0.05, 0.09, length(q.sub(vec2(0.42, -0.18))))), float(0));
    let colB = mix(base, vec3(0.03, 0.025, 0.02), max(spots, edge.mul(select(sp.lessThan(0.4), float(0.8), float(0.25)))));
    colB = mix(colB, vec3(0.6, 0.03, 0.02), red);
    // dragonfly: two narrow glassy wings, a metallic blue-green or red body
    const dfW = min(ell(q, vec2(0.5, 0.13), vec2(0.5, 0.11)), ell(q, vec2(0.47, -0.1), vec2(0.47, 0.13))).lessThan(1);
    const colD = vec3(0.5, 0.52, 0.5);
    // leaf: ovate birch leaf with a pointed tip, across both "wings"
    const lx = u.mul(side), lv = v.add(0.5);
    const inL = abs(lx).lessThan(pow(clamp(lv, 0, 1).mul(float(1).sub(lv)).mul(4), 0.75).mul(0.62).mul(float(1).sub(lv.mul(0.35)))).and(lv.greaterThan(0.02));
    const colL = mix(vec3(0.55, 0.42, 0.06), vec3(0.32, 0.36, 0.06), sp.mul(0.6));
    const bodyCol = select(k.lessThan(0.5), vec3(0.03, 0.025, 0.02), select(sp.lessThan(0.5), vec3(0.02, 0.12, 0.2), vec3(0.35, 0.05, 0.02)));
    const col = select(body, bodyCol, select(k.lessThan(0.5), colB, select(k.lessThan(1.5), colD, colL)));
    const bodyIn = abs(u.sub(0.5)).lessThan(0.5).and(select(k.lessThan(1.5), float(1), float(0)).greaterThan(0.5));
    const a = select(body, select(bodyIn, float(1), float(0)), select(k.lessThan(0.5), select(inB, float(1), float(0)), select(k.lessThan(1.5), select(dfW, float(0.3), float(0)), select(inL, float(1), float(0)))));
    return vec4(col, a);
  })();
  mat.colorNode = shade.rgb;
  mat.opacityNode = shade.a;
  // glassy dragonfly wings: a still screen-door dither (a per-frame one flickers without temporal AA), a hard cut elsewhere
  mat.alphaTestNode = hash(screenCoordinate.xy).mul(0.98).add(0.01);
  mat.roughnessNode = select(vK.x.greaterThan(0.5).and(vK.x.lessThan(1.5)), float(0.25), float(0.7));
  // sunlight through the thin wings and leaves
  const toEye = normalize(positionWorld.sub(cameraPosition));
  mat.emissiveNode = shade.rgb.mul(W.sunCol).mul(pow(max(dot(toEye, W.sunDir), 0), 4).mul(0.18).add(0.01));

  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'life-bugs';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.layers.set(1);
  world.scene.add(mesh);
  return { mesh, sizeMul };
}
