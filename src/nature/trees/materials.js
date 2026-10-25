// TSL node materials for the procedural trees: bark (per species), foliage cards (alpha-tested,
// translucent), shared wind (trunk sway, branch bob, leaf flutter) and dithered LOD cross-fades.
import * as THREE from 'three/webgpu';
import {
  attribute, uniform, texture, uv, vec2, vec3, float, mix, normalMap, positionLocal, positionWorld, cameraPosition,
  normalViewGeometry, normalLocal, positionPrevious, mx_noise_float, screenCoordinate, hash, sin, max, smoothstep, Fn,
  normalWorld, varying,
} from 'three/tsl';
import { maps, tex } from '../../engine/materials.js';

// shared uniforms, ticked by forest.js
export const U = {
  time: uniform(0),
  windDir: uniform(new THREE.Vector2(0.8, 0.6).normalize()),
  wind: uniform(1),                       // overall strength (breeze ≈ 1)
  sunDir: uniform(new THREE.Vector3(0, 1, 0)),
  sunCol: uniform(new THREE.Color(1, 1, 1)),
  eye: uniform(new THREE.Vector3()),      // the player's camera (not the shadow camera) for LOD fades
};

const wnd = attribute('wnd', 'vec4');
// smoothstep that also accepts falling edges (a > b), which WGSL leaves undefined
const ss = (a, b, x) => (a < b ? smoothstep(a, b, x) : float(1).sub(smoothstep(b, a, x)));
const info = attribute('info', 'vec4');

// gusts travel across the forest as a slow noise field
export const gust = Fn(([p]) => {
  // cheap travelling interference of two slow waves (no noise lookups: this runs per vertex in every pass)
  const t = U.time;
  const a = sin(p.x.mul(0.021).add(p.z.mul(0.013)).sub(t.mul(0.55)));
  const b = sin(p.x.mul(-0.009).add(p.z.mul(0.027)).sub(t.mul(0.37)).add(1.7));
  return a.mul(b).mul(0.45).add(a.mul(0.2)).add(0.65).max(0.1);
});

// Tree instancing without InstancedMesh (whose per-frame previous-matrix copies for TRAA velocity
// cost several ms with dozens of variant meshes): per-instance attributes
//   itr vec4 (x, y, z, yaw) and isc vec3 (scale, LOD fade, depth in the forest) on an InstancedBufferGeometry.
// The vertex is rotated/scaled/placed here and the normal turned with it.
const instanced = () => {
  const itr = attribute('itr', 'vec4'), isc = attribute('isc', 'vec3');
  const c = itr.w.cos(), s = itr.w.sin();
  const rot = (v) => vec3(v.x.mul(c).add(v.z.mul(s)), v.y, v.z.mul(c).sub(v.x.mul(s))); // = Object3D rotation.y
  normalLocal.assign(rot(normalLocal));
  return rot(positionLocal).mul(isc.x).add(itr.xyz);
};

// world-space position of a tree vertex with wind: trunk sway, branch bob, leaf flutter
// (one Fn per variant: materials share a shader build only when they share its nodes, docs/materials.md)
const windFns = new Map();
function windPosition({ inst = true, wind = true, scale = 1 } = {}) {
  const key = `${inst}/${wind}/${scale}`;
  if (!windFns.has(key)) windFns.set(key, Fn(() => {
    const p = (inst ? instanced() : positionLocal).toVar();
    // TRAA: velocity must come from the built position, not the raw attribute (else the history is rejected → shimmer)
    if (!wind) { positionPrevious.assign(p); return p; }
    const t = U.time;
    const g = gust(p).mul(U.wind);
    const ph = wnd.z.mul(6.283);
    const dir = vec3(U.windDir.x, 0, U.windDir.y);
    // trunk: slow lean with the gust plus a gentle oscillation
    const sway = wnd.x.mul(g).mul(sin(t.mul(0.8).add(ph.mul(0.3)).add(p.x.mul(0.05))).mul(0.12).add(0.2)).mul(scale);
    // branches: bob up/down and swing with the wind, more at long tips
    const bob = wnd.y.mul(g).mul(0.055).mul(sin(t.mul(1.9).add(ph).add(p.y.mul(0.4))));
    const swing = wnd.y.mul(g).mul(0.04).mul(sin(t.mul(1.3).add(ph.mul(1.7))));
    // leaves: quick flutter across the card
    const fl = wnd.w.mul(g).mul(0.022).mul(sin(t.mul(9.0).add(ph.mul(13.0)).add(p.x.mul(3.1)).add(p.z.mul(2.3))));
    const out = p.add(dir.mul(sway.add(swing))).add(vec3(fl, bob.add(fl.mul(0.7)), fl.mul(-0.6))).toVar();
    positionPrevious.assign(out); // wind motion between two frames is sub-pixel: ignored
    return out;
  }));
  return windFns.get(key)();
}

// per-instance LOD visibility (isc.y) against a stable screen-space dither
const lodMask = () => {
  const f = attribute('isc', 'vec3').y;
  const d = hash(screenCoordinate.x.floor().add(screenCoordinate.y.floor().mul(4099.0)));
  // f > 0: visible where dither < f (fading out); f < 0: visible where dither ≥ 1 + f (the complementary fade-in)
  return f.greaterThan(0).select(d.lessThan(f), d.greaterThanEqual(f.add(1)));
};

const BARK = {
  larch: { set: 'pine_bark', tint: new THREE.Color(1.08, 0.86, 0.76) },
  pine: { set: 'pine_bark', tint: new THREE.Color(0.85, 0.78, 0.72), flake: 1 },
  deadLarch: { set: 'pine_bark', tint: new THREE.Color(0.95, 0.92, 0.88), grey: [1.25, 1.2, 1.12], greyed: 0.75 },
  shrub: { set: 'bark_brown_02', tint: new THREE.Color(0.9, 0.7, 0.6) },
  log: { set: 'pine_bark', tint: new THREE.Color(0.8, 0.78, 0.74), grey: [1.1, 1.05, 1], greyed: 0.5, moss: 1 },
};

export function barkMaterial(species, { wind = true, lod = true, inst = lod } = {}) {
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
  const u = uv();
  const hN = info.y, hM = info.z;
  const ao = info.x;
  // variation between trees and along the trunk
  const tone = varying(mx_noise_float(positionWorld.xz.mul(0.09)).mul(0.12).add(1));
  if (species === 'birch') {
    const w = maps('birch_bark'), d = maps('pine_bark');
    const wd = texture(w.diff, u), dd = texture(d.diff, u.mul(vec2(1, 1.6)));
    // the black fissured base: up to ~1–2.2 m, ragged
    const edge = mx_noise_float(vec2(u.x.mul(3.0), hM.mul(1.5))).mul(0.7);
    const base = ss(0.35, -0.05, hM.sub(1.0).add(edge).div(1.2)).mul(ss(0.5, 0.2, hN));
    // white bark greys and greens on the north side low down
    const north = ss(0.1, -0.7, normalWorld.z).mul(ss(4.0, 0.5, hM)).mul(0.35);
    let col = wd.rgb.mul(vec3(0.98, 0.97, 0.94));
    col = mix(col, col.mul(vec3(0.72, 0.76, 0.68)), north);
    const dark = dd.rgb.mul(vec3(0.42, 0.4, 0.39));
    col = mix(col, dark, base);
    mat.colorNode = col.mul(tone);
    const n = mix(texture(w.nor, u).rgb, texture(d.nor, u.mul(vec2(1, 1.6))).rgb, base);
    mat.normalNode = normalMap(n, vec2(1.0, 1.0));
    const arm = mix(texture(w.arm, u).rgb, texture(d.arm, u.mul(vec2(1, 1.6))).rgb, base);
    mat.roughnessNode = arm.g.mul(1.05).min(1);
    mat.aoNode = arm.r.mul(ao);
  } else {
    // one graph for every species but birch (the species' features as weights: one shader build)
    const b = BARK[species];
    const m = maps(b.set);
    const dd = texture(m.diff, u);
    let col = dd.rgb.mul(vec3(b.tint.r, b.tint.g, b.tint.b));
    // Scots pine: grey-brown plates low, thin orange flaking bark up the stem
    const up = ss(0.3, 0.6, hN.add(mx_noise_float(vec2(u.x.mul(2), hM.mul(0.5))).mul(0.08)));
    col = mix(col, dd.rgb.mul(vec3(1.35, 0.78, 0.48)).add(vec3(0.06, 0.02, 0)), up.mul(float(b.flake || 0)));
    // a fallen log greys, a dead larch silvers (bark falling off)
    const lum = dd.r.mul(0.3).add(dd.g.mul(0.5)).add(dd.b.mul(0.2));
    const [gr, gg, gb] = b.grey || [1, 1, 1];
    col = mix(col, vec3(lum.mul(float(gr)), lum.mul(float(gg)), lum.mul(float(gb))), float(b.greyed || 0));
    // a rotting log: moss on the upper side
    const moss = ss(0.2, 0.7, normalWorld.y.add(mx_noise_float(positionWorld.mul(2.5)).mul(0.5)));
    col = mix(col, vec3(0.1, 0.13, 0.04).mul(mx_noise_float(positionWorld.mul(9)).mul(0.3).add(1)), moss.mul(0.85).mul(float(b.moss || 0)));
    // grey-green lichen on the north side of the lower trunk
    const north = ss(0.0, -0.8, normalWorld.z).mul(ss(3.5, 0.3, hM));
    const lich = ss(0.1, 0.5, mx_noise_float(positionWorld.mul(vec3(3, 1.2, 3))).add(north.mul(0.6)));
    col = mix(col, vec3(0.42, 0.45, 0.36), lich.mul(0.55).mul(north.add(0.15).min(1)));
    mat.colorNode = col.mul(tone);
    mat.normalNode = normalMap(texture(m.nor, u), vec2(1.2, 1.2));
    const arm = texture(m.arm, u);
    mat.roughnessNode = arm.g;
    mat.aoNode = arm.r.mul(ao);
  }
  mat.colorNode = mat.colorNode.mul(shadeIn(inst, 0.6));
  if (inst || wind) mat.positionNode = windPosition({ inst, wind });
  if (lod) mat.maskNode = lodMask();
  mat.name = `bark-${species}`;
  return mat;
}

// inside the forest the lower stems and crowns stand in the shade of their neighbours
const shadeIn = (inst, k) => (inst ? float(1).sub(attribute('isc', 'vec3').z.mul(k).mul(float(1).sub(info.y.mul(0.75)))) : float(1));

const FOLIAGE = {
  larch: { tex: 'larch', tint: new THREE.Color(1.0, 1.0, 0.95), rough: 0.7 },
  birch: { tex: 'birch', tint: new THREE.Color(1.04, 1.06, 0.95), rough: 0.6, trans: 1.0 },
  pine: { tex: 'pine', tint: new THREE.Color(0.9, 0.95, 0.95), rough: 0.7 },
  shrub: { tex: 'shrub', tint: new THREE.Color(1, 1, 1), rough: 0.65 },
};

export function foliageTexture(species) {
  return tex(`${import.meta.env.BASE_URL}assets/tex/foliage/${FOLIAGE[species].tex}.webp`, { srgb: true });
}

export function leafMaterial(species, { wind = true, lod = true, inst = lod, alphaTest = 0.42 } = {}) {
  const f = FOLIAGE[species];
  // weak specular: thin waxy needles/leaves seen against the bright sky otherwise go milky-beige at grazing angles
  const mat = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide, roughness: f.rough, metalness: 0, specularIntensity: 0.3 });
  const t = texture(foliageTexture(species), uv());
  // tree-to-tree and within-crown colour variation
  // (per vertex: noise per fragment is costly under heavy foliage overdraw and in the shadow passes)
  const v1 = varying(mx_noise_float(positionWorld.xz.mul(0.07))), v2 = varying(mx_noise_float(positionWorld.mul(0.8)));
  const tint = vec3(f.tint.r, f.tint.g, f.tint.b).mul(vec3(v1.mul(0.08).add(1), v1.mul(0.05).add(1), v1.mul(-0.06).add(1))).mul(v2.mul(0.1).add(1));
  const ao = info.x.pow(1.6); // deeper self-shading inside the crowns
  const albedo = t.rgb.mul(tint).mul(0.88).mul(shadeIn(inst, 0.4));
  mat.colorNode = albedo;
  mat.aoNode = ao;
  // keep thin needles/twigs from dissolving in the mips: boost alpha with the texture LOD
  const lodLevel = uv().mul(1024).fwidth().length().max(1).log2();
  mat.opacityNode = t.a.mul(lodLevel.mul(lodLevel).mul(0.3).add(1)).min(1);
  mat.alphaTest = alphaTest;
  mat.normalNode = normalViewGeometry;
  // light through the leaves when looking towards the sun
  const view = positionWorld.sub(cameraPosition).normalize();
  // a narrow lobe, strongest on the thin outer cards (high crown AO = outer shell), tinted yellow-green;
  // no constant term — under the physically scaled sun (sky.js) it washed whole crowns beige
  const back = max(view.dot(U.sunDir), 0).pow(8).mul(f.trans ?? 0.55).mul(0.45);
  mat.emissiveNode = albedo.mul(vec3(0.85, 1.0, 0.4)).mul(U.sunCol).mul(back).mul(ao.mul(ao)).mul(U.sunDir.y.max(0).mul(1.5).min(1));
  if (inst || wind) mat.positionNode = windPosition({ inst, wind });
  if (lod) mat.maskNode = lodMask();
  mat.name = `leaves-${species}`;
  return mat;
}
