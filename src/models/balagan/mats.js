// Node materials for the balagan: plaster, logs, wood, earth, sod, clay hearth, fire, textiles, metal.
import * as THREE from 'three/webgpu';
import {
  texture, uv, vec2, vec3, vec4, float, mix, smoothstep, step, clamp, max, abs, sin, fract, floor, positionLocal,
  normalLocal, attribute, faceDirection, normalMap, mx_noise_float, mx_fractal_noise_float, mx_worley_noise_float, time,
  uniform, luminance, vertexColor, dot, length, bumpMap,
} from 'three/tsl';

import { FX, FZ, H, OUT, GAP, XD, ZD, KH } from './dims.js';

const S = THREE.MeshStandardNodeMaterial;

// How enclosed a point is: ~1 inside the house (under the earth roof, behind the walls), 0 outside.
// Used to cut the sky's ambient light indoors (the environment map knows nothing about walls).
const enclosed = (p, margin = 0.05) => {
  const yc = clamp(p.y, 0, H);
  const xin = yc.div(H).oneMinus().mul(OUT).add(FX + GAP).add(margin), zin = yc.div(H).oneMinus().mul(OUT).add(FZ + GAP).add(margin);
  const d = max(abs(p.x).sub(xin), abs(p.z).sub(zin));
  let e = smoothstep(0.12, -0.2, d).mul(smoothstep(2.75, 2.45, p.y));
  // the door passage: light grades in from the doorway
  const pass = step(abs(p.z.sub(ZD)), 0.5).mul(smoothstep(XD + 0.05, FX + 0.2, p.x)).mul(step(p.y, 1.75)).mul(step(0, p.x));
  e = max(e, pass.mul(0.85));
  // the barn behind its door: inside the khoton's inner wall faces (shell.js klin), so its bank stays outside
  const kin = clamp(p.y, 0, KH.h).div(KH.h).oneMinus().mul(0.65).add(GAP + 0.05);
  const barn = step(p.z, -3.4).mul(step(abs(p.x), kin.add(KH.hx))).mul(step(p.y, 1.62)).mul(step(kin.add(KH.hz).negate(), p.z.sub(KH.zc)));
  return max(e, barn.mul(0.9));
};
const indoorAO = (p, k = 0.1, margin) => mix(float(1), float(k), enclosed(p, margin));
const nz = (p) => mx_noise_float(p).mul(0.5).add(0.5);          // 0..1
const fz = (p, o = 3) => mx_fractal_noise_float(p, o, 2.0, 0.5).mul(0.5).add(0.5);

export function makeMats(maps, { winter = false } = {}) {
  const M = {};
  const set = (id) => maps(id, [1, 1]);
  const T = {
    plaster: set('clay_plaster'), crack: set('mud_cracked_dry_03'), bark: set('bark_brown_02'), wood: set('rough_wood'),
    planks: set('old_planks_02'), floor: set('clay_floor_001'), dirt: set('dirt_floor'), sodA: set('leafy_grass'), sodB: set('sparse_grass'),
    soil: set('excavated_soil_wall'), leather: set('fabric_leather_02'), wool: set('caban'), velvet: set('velour_velvet'), grey: set('weathered_planks'),
  };
  const smp = (t, u) => texture(t, u);

  // ---- clay-dung plaster on the slanted walls; holes where it has flaked off (opacity cut), openings cut
  // `openings(pos)` → float 1 inside a door/window cut-out
  M.plaster = (openings, { flake = winter ? 0.7 : 0.6, khoton = false } = {}) => {
    const m = new S({ name: khoton ? 'plaster-khoton' : 'plaster', vertexColors: true, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide });
    m.shadowSide = THREE.DoubleSide;
    m.userData.ownAO = true;
    const u = uv();
    const p = positionLocal;
    const tP = smp(T.plaster.diff, u.mul(0.42));
    const tC = smp(T.crack.diff, u.mul(1.5).add(vec2(0.31, 0.17)));
    const crack = smoothstep(0.42, 0.2, luminance(tC.rgb));                 // crazing lines
    const big = fz(p.mul(0.55), 3);
    const dung = fz(p.mul(vec3(2.2, 1.4, 2.2)).add(7.1), 2);
    const streakN = fz(vec3(u.x.mul(9), u.y.mul(0.35), 3.3), 2);
    const top = smoothstep(0.35, 1.0, u.y.div(2.6));                     // u.y = metres up the slope
    const streak = smoothstep(0.55, 0.8, streakN).mul(top.mul(0.8).add(0.2));
    const fib = smoothstep(0.82, 0.9, nz(p.mul(vec3(38, 9, 38)))).mul(0.6);  // straw / dung fibres
    let col = tP.rgb.mul(vec3(0.98, 0.92, 0.84));
    col = col.mul(mix(vec3(1.06, 1.0, 0.92), vec3(0.72, 0.66, 0.55), dung.mul(0.75)));
    if (khoton) col = col.mul(vec3(0.82, 0.8, 0.66));
    col = col.mul(big.mul(0.24).add(0.88));
    col = mix(col, col.mul(vec3(0.62, 0.6, 0.58)), streak.mul(0.55));
    col = mix(col, vec3(0.16, 0.13, 0.1), crack.mul(0.62));
    col = mix(col, vec3(0.42, 0.36, 0.24), fib);
    const foot = smoothstep(0.75, 0.1, p.y);                                 // splash dirt at the base
    col = mix(col, col.mul(vec3(0.6, 0.55, 0.48)), foot.mul(0.6));
    const north = smoothstep(0.3, 0.9, normalLocal.z.negate()).mul(foot.add(0.25)).mul(nz(p.mul(3.1)));
    col = mix(col, vec3(0.22, 0.25, 0.14), north.mul(0.35));                  // a green-grey film on the north foot
    // colour drift: buff low, greyer and paler high; a damp band above the berm
    const y = p.y;
    col = mix(col, vec3(luminance(col)).mul(vec3(0.98, 0.98, 1.0)), smoothstep(0.4, 2.2, y).mul(0.55));
    const dampEdge = float(0.95).add(fz(vec3(u.x.mul(1.3), 0.3, 2.0), 2).mul(0.35));
    const damp = smoothstep(0.45, 0.62, y).mul(smoothstep(dampEdge, dampEdge.sub(0.25), y));
    col = col.mul(mix(1.0, 0.72, damp));
    // flaking: a few large irregular patches (more low and near the corners) exposing the logs
    const fl = fz(p.mul(vec3(0.8, 1.5, 0.8)).add(1.7), 4).add(fz(p.mul(vec3(4.0, 2.5, 4.0)).add(5.5), 2).mul(0.2)).sub(0.08);
    const thr = float(flake).add(smoothstep(1.3, 1.9, y).mul(0.6)).sub(smoothstep(0.9, 0.3, y).mul(0.05));
    const flaked = smoothstep(thr, thr.add(0.015), fl);
    const rim = smoothstep(thr.sub(0.05), thr, fl).mul(float(1).sub(flaked));     // thinned plaster round a patch
    const lip = smoothstep(thr, thr.add(0.03), fl).mul(smoothstep(thr.add(0.06), thr.add(0.03), fl)); // shadow under the broken edge
    col = mix(col, col.mul(vec3(0.82, 0.78, 0.72)), rim.mul(0.45));
    // the exposed logs: weathered silver-grey larch, round, with dark joints and bits of bark
    const lw = 0.16;
    const lu = u.x.div(lw).add(nz(vec3(u.y.mul(0.8), 0.0, 4.4)).mul(0.25));
    const fu = fract(lu);
    const round = sin(fu.mul(Math.PI)).pow(0.6);
    const wtx = smp(T.wood.diff, vec2(u.x.mul(1.3), u.y.mul(0.35))).rgb;
    const tone = nz(vec3(floor(lu).mul(1.7), 0.5, 2.0)).mul(0.35).add(0.75);
    let logc = vec3(luminance(wtx)).mul(vec3(0.62, 0.52, 0.4)).mul(tone).mul(round.mul(0.45).add(0.5));
    const chk = smoothstep(0.8, 0.86, nz(vec3(u.x.mul(40), u.y.mul(1.2), floor(lu))));
    logc = mix(logc, vec3(0.06, 0.05, 0.045), chk.mul(0.6));
    const barkLeft = smoothstep(0.62, 0.7, fz(vec3(u.x.mul(4), u.y.mul(1.2), 8.0), 2));
    logc = mix(logc, smp(T.bark.diff, vec2(u.x.mul(1.4), u.y.mul(0.9))).rgb.mul(0.7), barkLeft.mul(0.6));
    logc = mix(logc, vec3(0.05, 0.045, 0.04), smoothstep(0.12, 0.0, fu).add(smoothstep(0.88, 1.0, fu)).min(1));
    logc = mix(logc, col.mul(0.7), smoothstep(0.75, 0.95, nz(p.mul(7.0))).mul(0.5));   // clay crumbs left in the joints
    col = mix(col, logc, flaked);
    col = col.mul(float(1).sub(lip.mul(0.55)));
    // alpha lives in colorNode too: the shadow pass takes its alpha from colorNode.a (a vec3 there cast no shadow at all)
    m.opacityNode = float(1).sub(openings(p));
    m.colorNode = vec4(col.mul(vertexColor().rgb).mul(faceDirection.greaterThan(0).select(float(1), float(0.12))), m.opacityNode);
    const n1 = smp(T.plaster.nor, u.mul(0.42)).xyz, n2 = smp(T.crack.nor, u.mul(1.5).add(vec2(0.31, 0.17))).xyz;
    const nW = smp(T.wood.nor, vec2(u.x.mul(1.3), u.y.mul(0.35))).xyz;
    m.normalNode = normalMap(mix(mix(n1, n2, 0.45), nW, flaked), vec2(1.3, 1.3));
    m.roughnessNode = float(0.93);
    m.aoNode = smp(T.plaster.arm, u.mul(0.42)).r.mul(mix(1.0, 0.55, crack.mul(float(1).sub(flaked)))).mul(faceDirection.greaterThan(0).select(float(1), float(0.06)));
    return m;
  };

  // ---- logs: bark outside (where `outw` points), smoke-darkened debarked larch inside
  M.logs = (() => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name: 'logs', vertexColors: true, roughness: 0.9 });
    m.userData.attrs = ['outw'];
    const u = uv();
    const ow = attribute('outw', 'vec3');
    // bark only on outer faces that are actually outdoors (never on the indoor ceiling poles and posts)
    const outside = smoothstep(0.08, 0.35, dot(normalLocal, ow)).mul(float(1).sub(enclosed(positionLocal, 0.4)));
    const bark = smp(T.bark.diff, u.mul(vec2(1.4, 0.9))).rgb.mul(vec3(1.05, 1.0, 0.95));
    const wd = smp(T.wood.diff, u.mul(vec2(0.9, 0.45))).rgb;
    const ht = smoothstep(0.5, 2.0, positionLocal.y).mul(fz(positionLocal.mul(vec3(1.5, 0.8, 1.5)), 3).mul(0.5).add(0.55)).min(1);
    // hewn larch, greyed by age; checks along the grain; clay pressed into the joints (flank faces)
    let inner = vec3(luminance(wd)).mul(vec3(0.62, 0.56, 0.5));
    const chk = smoothstep(0.78, 0.84, nz(vec3(u.x.mul(26), u.y.mul(1.4), positionLocal.x.add(positionLocal.z).mul(3))));
    inner = mix(inner, vec3(0.03, 0.025, 0.02), chk.mul(0.7));
    const flank = smoothstep(0.55, 0.2, abs(dot(normalLocal, ow))).mul(step(0.5, length(ow)));
    inner = mix(inner, vec3(0.13, 0.11, 0.085).mul(nz(positionLocal.mul(9)).mul(0.5).add(0.6)), flank.mul(0.8));
    inner = mix(inner, vec3(0.022, 0.019, 0.017), ht.mul(winter ? 0.8 : 0.93));
    m.colorNode = mix(inner, bark, outside).mul(vertexColor());
    const nIn = smp(T.wood.nor, u.mul(vec2(0.9, 0.45))).xyz, nOut = smp(T.bark.nor, u.mul(vec2(1.4, 0.9))).xyz;
    m.normalNode = normalMap(mix(nIn, nOut, outside));
    m.roughnessNode = mix(mix(mix(0.88, 0.68, ht), 1.0, flank), 0.95, outside);
    m.aoNode = mix(smp(T.wood.arm, u.mul(vec2(0.9, 0.45))).r.mul(indoorAO(positionLocal, 0.1, 0.4)).mul(mix(1.0, 0.12, flank)), smp(T.bark.arm, u.mul(vec2(1.4, 0.9))).r, outside);
    m.userData.ownAO = true;
    // indoors the soot-dark wood must not mirror the sky at grazing angles (the grey-blue stripes)
    m.specularIntensityNode = mix(float(0.06), float(1), outside);
    return m;
  })();

  // ---- worked wood: planks, beams, frames. `soot` darkens high up; vertex colour tints (honey tops, grey outside)
  const woodMat = (name, tex, { soot = true, scale = [0.6, 0.6], env = 0.3, rough = 0.85 } = {}) => {
    const m = new S({ name, vertexColors: true });
    const u = uv().mul(vec2(...scale));
    const d = smp(tex.diff, u).rgb;
    let c = d.mul(vertexColor());
    if (soot) c = mix(c, c.mul(0.18), smoothstep(1.3, 2.25, positionLocal.y).mul(0.85));
    m.colorNode = c.mul(nz(positionLocal.mul(1.7)).mul(0.25).add(0.85));
    m.normalNode = normalMap(smp(tex.nor, u).xyz);
    m.roughnessNode = smp(tex.arm, u).g.mul(rough).add(0.1);
    m.aoNode = smp(tex.arm, u).r;
    m.envMapIntensity = env;
    return m;
  };
  M.planks = woodMat('planks', T.planks, { scale: [0.7, 0.7], env: 0.25 });
  M.beams = woodMat('beams', T.wood, { scale: [0.8, 0.5], env: 0.3 });
  M.outWood = woodMat('outwood', T.wood, { soot: false, scale: [0.7, 0.45], env: 1, rough: 1 });

  // ---- beaten earth floor: trodden smooth in the middle, darker at the walls, ash by the hearth
  M.floor = (hearth) => {
    const m = new S({ name: 'floor', roughness: 0.9 });
    const p = positionLocal;
    const u = vec2(p.x, p.z);
    const a = smp(T.floor.diff, u.mul(0.45)).rgb, b = smp(T.dirt.diff, u.mul(0.6)).rgb;
    const mixN = fz(vec3(p.x, 0.0, p.z).mul(0.9), 3);
    let c = mix(vec3(luminance(a)).mul(vec3(0.62, 0.56, 0.48)), b.mul(vec3(0.66, 0.6, 0.52)), smoothstep(0.35, 0.7, mixN));
    const edge = smoothstep(1.8, 3.0, max(abs(p.x).sub(0.6), abs(p.z)));
    c = c.mul(mix(1.0, 0.55, edge));
    const hd = length(vec2(p.x.sub(hearth[0]), p.z.sub(hearth[1])));
    const ash = smoothstep(1.7, 0.9, hd).mul(fz(p.mul(4.0), 2));
    c = mix(c, vec3(0.35, 0.34, 0.32), ash.mul(0.6));
    const trod = smoothstep(2.0, 0.4, length(vec2(p.x.sub(0.8), p.z.sub(0.4))));
    m.colorNode = c.mul(mix(1.0, 0.82, trod));
    m.normalNode = normalMap(smp(T.floor.nor, u.mul(0.45)).xyz, vec2(0.7, 0.7));
    m.roughnessNode = mix(0.95, 0.62, trod.mul(0.8));
    m.envMapIntensity = 0.2;
    return m;
  };

  // ---- sod on the earth roof and berm: grass texture with bare soil showing through
  M.sod = (() => {
    const m = new S({ name: 'sod', roughness: 1 });
    const p = positionLocal;
    const u = vec2(p.x, p.z);
    const g = smp(T.sodA.diff, u.mul(0.55)).rgb, g2 = smp(T.sodB.diff, u.mul(0.4)).rgb, s = smp(T.dirt.diff, u.mul(0.5)).rgb;
    const n = fz(vec3(p.x, p.y, p.z).mul(0.8), 3);
    const bare = smoothstep(0.55, 0.75, n);
    let c = mix(g.mul(vec3(0.9, 1.0, 0.75)), g2, smoothstep(0.3, 0.6, fz(p.mul(0.37).add(5), 2)));
    if (winter) c = mix(c, c.mul(vec3(1.1, 0.95, 0.7)), 0.4);
    m.colorNode = mix(c, s.mul(vec3(0.7, 0.62, 0.52)), bare.mul(0.85));
    m.normalNode = normalMap(smp(T.sodA.nor, u.mul(0.55)).xyz);
    m.aoNode = smp(T.sodA.arm, u.mul(0.55)).r;
    return m;
  })();
  M.soil = (() => {
    const m = new S({ name: 'soil', roughness: 1 });
    const u = uv().mul(vec2(0.9, 1.6));
    const roots = smoothstep(0.6, 0.85, fz(vec3(u.x.mul(14), u.y.mul(3), 0.7), 2));
    const c = mix(smp(T.dirt.diff, u).rgb.mul(vec3(0.36, 0.3, 0.24)), smp(T.soil.diff, u.mul(0.5)).rgb.mul(vec3(0.33, 0.27, 0.22)), 0.35);
    m.colorNode = mix(mix(c, vec3(luminance(c)).mul(vec3(1.0, 0.92, 0.82)), 0.45), vec3(0.2, 0.19, 0.12), roots.mul(0.5));
    m.normalNode = normalMap(smp(T.dirt.nor, u).xyz, vec2(1.6, 1.6));
    m.aoNode = smp(T.dirt.arm, u).r;
    return m;
  })();

  // ---- grass blades, fireweed and berm weeds (vertex colours; uv.y = height along blade → sway)
  M.plants = (() => {
    const m = new S({ name: 'plants', vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 });
    const h = uv().y;
    const w = sin(time.mul(1.7).add(positionLocal.x.mul(0.9)).add(positionLocal.z.mul(0.7))).mul(0.5)
      .add(sin(time.mul(3.1).add(positionLocal.x.mul(2.3))).mul(0.25));
    m.positionNode = positionLocal.add(vec3(w.mul(0.035), 0, w.mul(0.02)).mul(h.mul(h)));
    m.colorNode = vertexColor().mul(mix(0.55, 1.05, h));
    m.envMapIntensity = 0.8;
    return m;
  })();

  // ---- clay of the hearth: buff, fire-reddened round the mouth, soot above it
  M.clay = ({ mouth, dir, top = 3.6 }) => {
    const m = new S({ name: 'clay', roughness: 0.92 });
    const p = positionLocal;
    const u = uv();
    const base = smp(T.plaster.diff, u.mul(0.9)).rgb.mul(vec3(1.18, 1.1, 0.95));
    const cr = smoothstep(0.38, 0.18, luminance(smp(T.crack.diff, u.mul(1.6)).rgb));
    const d = length(vec3(p.x.sub(mouth[0]), p.y.sub(mouth[1]).mul(0.8), p.z.sub(mouth[2])));
    const fire = smoothstep(0.9, 0.35, d);
    const front = smoothstep(0.1, 0.7, dot(vec2(p.x.sub(mouth[0] - dir[0] * 0.5), p.z.sub(mouth[2] - dir[1] * 0.5)).normalize(), vec2(...dir)));
    const soot = smoothstep(mouth[1] + 0.55, mouth[1] + 1.0, p.y).mul(front).mul(smoothstep(2.45, 2.15, p.y)).mul(fz(p.mul(vec3(3, 0.7, 3)), 2).mul(0.6).add(0.55))
      .add(smoothstep(top - 0.35, top, p.y).mul(fz(p.mul(vec3(4, 1.5, 4)), 2).mul(0.5).add(0.5)));
    let c = base.mul(nz(p.mul(2.0)).mul(0.18).add(0.9));
    c = mix(c, vec3(0.62, 0.3, 0.16), fire.mul(0.75));
    c = mix(c, vec3(0.05, 0.045, 0.04), clamp(soot, 0, 0.92));
    c = mix(c, c.mul(0.5), cr.mul(0.35));
    m.colorNode = c;
    m.normalNode = normalMap(smp(T.plaster.nor, u.mul(0.9)).xyz, vec2(1.5, 1.5));
    m.envMapIntensity = 0.3;
    return m;
  };
  M.soot = new S({ name: 'soot', color: 0x0d0b0a, roughness: 0.8, side: THREE.BackSide });

  // ---- glowing ember bed and charred wood (emission scaled by `heat`, 0 = cold)
  M.heat = uniform(winter ? 0 : 1);
  M.fireAt = uniform(new THREE.Vector3());
  M.embers = (() => {
    const m = new S({ name: 'embers', roughness: 0.95 });
    const p = positionLocal;
    const d = length(p.xz.sub(M.fireAt.xz));
    const n = fz(p.mul(9).add(vec3(0, time.mul(0.2), 0)), 3);
    const glow = smoothstep(0.55, 0.85, n).mul(M.heat).mul(smoothstep(0.42, 0.12, d));
    const ash = mix(vec3(0.05, 0.047, 0.045), vec3(0.1, 0.095, 0.09), fz(p.mul(5.0), 2));
    const charcoal = smoothstep(0.7, 0.76, fz(p.mul(38.0).add(3.3), 2)).max(smoothstep(0.45, 0.22, d));
    const scorch = smoothstep(0.75, 0.3, d);
    m.colorNode = mix(mix(ash, ash.mul(0.35), scorch), vec3(0.04, 0.035, 0.03), charcoal.mul(0.85));
    m.emissiveNode = vec3(1.0, 0.32, 0.06).mul(glow.mul(glow).mul(6).mul(nz(vec3(p.x.mul(5), time.mul(1.4), p.z.mul(5))).mul(0.6).add(0.6)));
    m.envMapIntensity = 0.2;
    return m;
  })();
  M.char = (() => {
    const m = new S({ name: 'char', roughness: 0.85, vertexColors: true });
    const p = positionLocal;
    const cr = smoothstep(0.62, 0.8, fz(p.mul(vec3(14, 30, 14)), 2));
    m.colorNode = mix(vec3(0.03, 0.026, 0.024), vertexColor(), smoothstep(0.85, 1.3, p.y.sub(0.0)).mul(0));
    m.emissiveNode = vec3(1.0, 0.28, 0.04).mul(cr.mul(M.heat).mul(4)).mul(smoothstep(0.75, 0.32, p.y));
    return m;
  })();

  // ---- flames: additive cards, rising noise inside a teardrop silhouette
  M.flare = uniform(0);
  M.flame = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ name: 'flame', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    m.userData.noShadow = true;
    const u = uv();
    const seed = attribute('seed', 'float');
    m.userData.attrs = ['seed'];
    const x = u.x.sub(0.5).mul(2);
    const y = u.y;
    const n = fz(vec3(u.x.mul(3).add(seed.mul(7)), y.mul(2.2).sub(time.mul(2.6)), seed.add(time.mul(0.6))), 3);
    const n2 = nz(vec3(u.x.mul(6).add(seed), y.mul(5).sub(time.mul(4.1)), 1.3));
    const width = float(1).sub(y).mul(1.1).add(0.08).mul(n.mul(0.6).add(0.6));
    const shape = smoothstep(width, width.mul(0.35), abs(x.add(n.sub(0.5).mul(y).mul(0.9))));
    const v = shape.mul(smoothstep(0.0, 0.12, y)).mul(smoothstep(1.0, 0.45, y.add(n2.mul(0.25))));
    const hot = smoothstep(0.35, 1.0, v.mul(float(1).sub(y.mul(0.8))));
    const col = mix(vec3(1.0, 0.22, 0.03), vec3(1.0, 0.62, 0.22), hot).add(vec3(0.6, 0.5, 0.35).mul(hot.mul(hot)));
    m.colorNode = vec4(col.mul(v).mul(M.heat).mul(M.flare.mul(0.8).add(2.2)), 1);
    return m;
  })();

  // ---- sunbeams through the windows (additive, dusty)
  M.shaft = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ name: 'shaft', transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    m.userData.noShadow = true;
    const u = uv();
    const edge = smoothstep(0.0, 0.25, u.x).mul(smoothstep(1.0, 0.75, u.x));
    const along = smoothstep(0.0, 0.08, u.y).mul(smoothstep(1.0, 0.55, u.y));
    const dust = fz(positionLocal.mul(5).add(vec3(0, time.mul(0.05), time.mul(0.03))), 3).mul(0.7).add(0.5);
    m.colorNode = vec4(vec3(1.0, 0.86, 0.66).mul(edge.mul(along).mul(dust).mul(0.035)), 1);
    return m;
  })();

  // ---- smoke from the chimney top (soft billboards)
  M.smoke = (() => {
    const m = new THREE.SpriteNodeMaterial({ name: 'smoke', transparent: true, depthWrite: false });
    const u = uv();
    const d = length(u.sub(0.5)).mul(2);
    const n = fz(vec3(u.mul(2.5), time.mul(0.15)), 3);
    m.colorNode = vec4(vec3(0.72, 0.71, 0.7), smoothstep(1.0, 0.2, d.add(n.mul(0.5).sub(0.2))).mul(0.32));
    return m;
  })();

  // ---- window fills: horsehair net (alpha-tested weave), mica sheets
  M.net = (() => {
    const m = new S({ name: 'net', color: 0x1c140e, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5 });
    const u = uv().mul(55);
    const gx = abs(fract(u.x).sub(0.5)), gy = abs(fract(u.y).sub(0.5));
    m.opacityNode = step(0.36, max(gx, gy)).max(step(0.97, nz(vec3(uv().mul(9), 0))));
    m.userData.noShadow = true;
    return m;
  })();
  M.mica = (() => {
    const m = new S({ name: 'mica', transparent: true, roughness: 0.22, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
    const cell = mx_worley_noise_float(uv().mul(6));
    m.colorNode = mix(vec3(0.28, 0.2, 0.1), vec3(0.5, 0.38, 0.2), smoothstep(0.1, 0.5, cell));
    m.opacityNode = float(0.9).add(smoothstep(0.05, 0.0, cell).mul(0.08));
    m.emissiveNode = vec3(0.55, 0.42, 0.22).mul(0.15);
    m.userData.noShadow = true;
    return m;
  })();

  // ---- birch bark: cream outer face with dark lenticels; the хаппахчы curtain (plain boiled bark)
  M.birch = (() => {
    const m = new S({ name: 'birch', vertexColors: true, roughness: 0.62 });
    const u = uv();
    const len = nz(vec3(u.x.mul(1.8), u.y.mul(28), 0.5));
    const lent = smoothstep(0.78, 0.86, len);
    const base = mix(vec3(0.42, 0.33, 0.21), vec3(0.32, 0.22, 0.12), fz(vec3(u.mul(3), 2.0), 3));
    m.colorNode = mix(base, vec3(0.09, 0.07, 0.06), lent.mul(0.85)).mul(vertexColor());
    m.envMapIntensity = 0.35;
    return m;
  })();
  M.birchCurtain = (() => {
    const m = new S({ name: 'birch-curtain', roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 });
    const u = uv();                       // metres: x across, y up
    const len = nz(vec3(u.x.mul(3), u.y.mul(40), 0.5));
    let base = mix(vec3(0.24, 0.15, 0.07), vec3(0.16, 0.09, 0.04), fz(vec3(u.mul(2.5), 1.0), 3));
    base = mix(base, vec3(0.1, 0.08, 0.06), smoothstep(0.8, 0.88, len).mul(0.8));
    // plain: the black openwork bands drawn here before had no image source (docs/patterns.md)
    m.colorNode = base;
    // leather-bound edges
    m.userData.noShadow = false;
    return m;
  })();

  // ---- furs (vertex colour), textiles, leather, metals, oiled wood
  M.fur = (() => {
    const m = new S({ name: 'fur', vertexColors: true, roughness: 0.95 });
    const p = positionLocal;
    const n = nz(p.mul(vec3(60, 60, 60)));
    const clump = fz(p.mul(9), 2);
    m.colorNode = vertexColor().mul(n.mul(0.35).add(0.7)).mul(clump.mul(0.4).add(0.75));
    m.normalNode = bumpMap(n.mul(0.6).add(clump.mul(0.4)), 2.5);
    m.envMapIntensity = 0.3;
    return m;
  })();
  M.wool = (() => {
    const m = new S({ name: 'broadcloth', vertexColors: true, roughness: 0.92 });
    const u = uv().mul(2.2);
    m.colorNode = vec3(luminance(smp(T.wool.diff, u).rgb)).mul(vec3(0.16, 0.19, 0.34)).mul(vertexColor());
    m.normalNode = normalMap(smp(T.wool.nor, u).xyz);
    m.envMapIntensity = 0.35;
    return m;
  })();
  M.velvet = (() => {
    const m = new S({ name: 'red-cloth', roughness: 0.9 });
    const u = uv().mul(2);
    m.colorNode = smp(T.velvet.diff, u).rgb.mul(vec3(0.95, 0.85, 0.85));
    m.normalNode = normalMap(smp(T.velvet.nor, u).xyz);
    m.envMapIntensity = 0.35;
    return m;
  })();
  M.leather = (() => {
    const m = new S({ name: 'leather', vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    const u = uv().mul(1.5);
    m.colorNode = vec3(luminance(smp(T.leather.diff, u).rgb)).mul(vec3(0.95, 0.68, 0.45)).mul(vertexColor());
    m.normalNode = normalMap(smp(T.leather.nor, u).xyz);
    m.envMapIntensity = 0.35;
    return m;
  })();
  M.silver = (() => {
    const m = new S({ name: 'silver', vertexColors: true, metalness: 1, roughness: 0.33 });
    const p = positionLocal;
    const tarn = smoothstep(0.5, 0.75, fz(p.mul(70), 2));
    m.colorNode = mix(vec3(0.81, 0.79, 0.75), vec3(0.25, 0.24, 0.22), tarn.mul(0.6)).mul(vertexColor());
    m.roughnessNode = mix(0.28, 0.55, tarn);
    m.envMapIntensity = 0.6;
    return m;
  })();
  M.iron = (() => {
    const m = new S({ name: 'iron', vertexColors: true, metalness: 0.85, roughness: 0.5 });
    const p = positionLocal;
    m.colorNode = mix(vec3(0.16, 0.16, 0.17), vec3(0.42, 0.41, 0.4), smoothstep(0.55, 0.8, fz(p.mul(120), 2))).mul(vertexColor());
    m.envMapIntensity = 0.5;
    return m;
  })();
  M.oiled = (() => {
    const m = new S({ name: 'oiled-wood', vertexColors: true, roughness: 0.48 });
    const p = positionLocal;
    const grain = nz(vec3(p.x.mul(9), p.y.mul(90), p.z.mul(9)));
    const fig = fz(p.mul(25), 3);
    m.colorNode = mix(vec3(0.42, 0.24, 0.1), vec3(0.66, 0.43, 0.2), grain.mul(0.5).add(fig.mul(0.5))).mul(vertexColor());
    m.roughnessNode = mix(0.38, 0.6, fig);
    m.envMapIntensity = 0.4;
    return m;
  })();
  M.web = (() => {
    const m = new S({ name: 'web', transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9, color: 0x6a6660 });
    const u = uv();
    const r = length(u), a = u.y.atan(u.x);
    const radial = smoothstep(0.93, 0.99, abs(sin(a.mul(13))));
    const rings = smoothstep(0.85, 0.97, abs(sin(r.mul(60).add(sin(a.mul(5)).mul(1.5)))));
    const dust = fz(vec3(u.mul(6), 1.0), 2);
    m.opacityNode = radial.add(rings).min(1).mul(0.35).add(dust.mul(0.12)).mul(smoothstep(1.0, 0.6, r));
    m.userData.noShadow = true;
    return m;
  })();
  M.food = new S({ name: 'food', vertexColors: true, roughness: 0.55 });
  M.food.envMapIntensity = 0.3;
  M.hair = new S({ name: 'hair', vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });

  // indoor ambient cut for every lit material (functions get it when called)
  const occ = (m) => { if (m.userData.ownAO || !m.isNodeMaterial || m.isMeshBasicNodeMaterial || m.isSpriteNodeMaterial || !m.lights) return m; m.aoNode = m.aoNode ? m.aoNode.mul(indoorAO(positionLocal)) : indoorAO(positionLocal); return m; };
  for (const [k, v] of Object.entries(M)) {
    if (v?.isMaterial) occ(v);
    else if (typeof v === 'function') M[k] = (...a) => occ(v(...a));
  }
  M.soot.aoNode = float(0.15);
  M.soot.roughness = 1;
  // interior materials take the sky light at reduced strength (diffuse and specular): see setEnv()
  // matte (Lambert: no specular) so the sky can't glint on what shows between logs and ceiling poles
  M.lining = new THREE.MeshLambertNodeMaterial({ name: 'lining' });
  M.lining.colorNode = mix(vec3(0.16, 0.135, 0.105), vec3(0.03, 0.025, 0.02), smoothstep(0.6, 1.9, positionLocal.y));
  M.lining.aoNode = float(0.2);
  M.ceilingBark = new THREE.MeshLambertNodeMaterial({ name: 'ceiling-bark' });
  M.ceilingBark.colorNode = vec3(0.022, 0.018, 0.015).mul(fz(positionLocal.mul(vec3(3, 1, 9)), 2).mul(0.6).add(0.7));
  M.ceilingBark.aoNode = float(0.2);
  M.interior = [M.web, M.lining, M.ceilingBark, M.birchCurtain, M.planks, M.beams, M.soot, M.embers, M.char, M.birch, M.fur, M.wool, M.velvet, M.leather, M.iron, M.oiled, M.food, M.hair, M.logs, M.silver];
  M.setEnv = (env) => {
    for (const m of M.interior) if (m.envMap !== env) { m.envMap = env; m.envMapIntensity = m === M.silver ? 0.2 : 0.12; m.needsUpdate = true; }
  };
  return M;
}

// A float node: 1 inside any of the given openings. Each: { axis: 'x'|'z', sign, c, hw, y0, y1, min }
// `min` = how far out along the axis the cut starts (so the opposite wall is untouched).
export function openingsNode(list) {
  return (p) => {
    let acc = float(0);
    for (const o of list) {
      const out = o.axis === 'x' ? p.x.mul(o.sign) : p.z.mul(o.sign);
      const lat = o.axis === 'x' ? p.z : p.x;
      const inside = step(o.min, out).mul(step(abs(lat.sub(o.c)), o.hw)).mul(step(o.y0, p.y)).mul(step(p.y, o.y1));
      acc = acc.add(inside);
    }
    return acc.min(1);
  };
}
