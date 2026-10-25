// Node materials for the yard models: weathered larch, horsehair rope, cloth, birch bark, hide,
// trodden earth decals. All take vertex colours (per-log tint, dirt at the foot baked in JS) and add
// procedural detail in TSL (anti-tiling, lichen on north faces, ply grooves, lenticels).
import * as THREE from 'three/webgpu';
import {
  texture, uv, vec2, vec3, float, vertexColor, mix, smoothstep, positionWorld, normalWorld, mx_noise_float, positionView,
  normalView, faceDirection, Fn, fract, floor, sin, normalMap, time, positionLocal, attribute,
} from 'three/tsl';

const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

// Normal from a procedural height (metres) by screen-space derivatives (Mikkelsen's surface gradient).
// (one Fn for all: materials share a shader build only when they share its nodes, docs/materials.md)
const bumpFn = Fn(([h, scale]) => {
  const sx = positionView.dFdx(), sy = positionView.dFdy();
  const N = normalView;
  const R1 = sy.cross(N), R2 = N.cross(sx);
  const det = sx.dot(R1).mul(faceDirection);
  const dh = vec2(h.dFdx(), h.dFdy()).mul(scale);
  const grad = det.sign().mul(dh.x.mul(R1).add(dh.y.mul(R2)));
  return det.abs().mul(N).sub(grad).normalize();
});
const bumpFrom = (h, scale = 1) => bumpFn(h, float(scale));

// Weathered silver-grey larch (rough_wood). `tone` shifts it: 1 = old silvered, 0 = fresh-ish.
export function larch(ctx, { key = 'larch', tint = 0xffffff, lichen = 0.6, normalScale = 1.1, side } = {}) {
  return once(key, () => {
    const m = ctx.maps('rough_wood');
    const u = uv();
    // two samplings of the same grain blended by world noise so long rows of logs do not repeat
    const u2 = u.mul(vec2(0.61, 0.73)).add(vec2(0.37, 0.19));
    const blend = smoothstep(-0.25, 0.25, mx_noise_float(positionWorld.mul(0.45)));
    const d1 = texture(m.diff, u), d2 = texture(m.diff, u2);
    let col = mix(d1.rgb, d2.rgb, blend).mul(vertexColor().rgb).mul(new THREE.Color(tint));
    // grey-green crust lichen on north (−Z) and upward faces, in patches
    const north = smoothstep(0.0, 0.8, normalWorld.z.negate().add(normalWorld.y.mul(0.5)));
    const patches = smoothstep(0.1, 0.55, mx_noise_float(positionWorld.mul(3.1)).add(mx_noise_float(positionWorld.mul(11.0)).mul(0.35)));
    const lich = north.mul(patches).mul(lichen);
    col = mix(col, vec3(0.42, 0.46, 0.36).mul(d1.r.mul(0.6).add(0.55)), lich.mul(0.75));
    // fine low-frequency colour wander (sun bleaching vs damp)
    col = col.mul(mx_noise_float(positionWorld.mul(1.3)).mul(0.12).add(1));
    const arm = texture(m.arm, u);
    const mat = new THREE.MeshStandardNodeMaterial({ side: side ?? THREE.FrontSide });
    mat.colorNode = col;
    mat.roughnessNode = arm.g.mul(0.35).add(0.62).add(lich.mul(0.1)).clamp(0, 1);
    mat.metalnessNode = float(0);
    mat.aoNode = mix(float(1), arm.r, 0.8);
    mat.normalNode = normalMap(texture(m.nor, u), vec2(normalScale, normalScale));
    mat.name = key;
    return mat;
  });
}

// Larch with the bark still on (fence stakes, rails): pine_bark's plated reddish bark, worn grey in places.
export function barkPole(ctx) {
  return once('barkPole', () => {
    const b = ctx.maps('pine_bark'), w = ctx.maps('rough_wood');
    const u = uv();
    // peeled where the mask says so: bare silvered wood shows through
    const ub = u.mul(vec2(2, 2.6));
    const peel = smoothstep(0.0, 0.25, mx_noise_float(positionWorld.mul(1.4)).add(mx_noise_float(positionWorld.mul(6.0)).mul(0.3)).add(vertexColor().r.sub(0.75)));
    const bark = texture(b.diff, ub).rgb.mul(vec3(0.7, 0.62, 0.56));
    const wood = texture(w.diff, u).rgb;
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = mix(bark, wood, peel).mul(vertexColor().rgb);
    mat.roughnessNode = mix(texture(b.arm, ub).g, texture(w.arm, u).g, peel).mul(0.3).add(0.68);
    mat.metalnessNode = float(0);
    mat.normalNode = normalMap(mix(texture(b.nor, ub), texture(w.nor, u), peel));
    mat.name = 'barkPole';
    return mat;
  });
}

// Twisted horsehair rope: uv.x around (0..1), uv.y metres along. Plies spiral; each ply takes a colour
// from `colors` in turn (salama: white + black; working rope: mixed dark). Fuzz from fine noise.
export function rope({ key, colors = [0xe9e4d6, 0x18150f], plies = 2, pitch = 0.02, radius = 0.003, sheen = 0.45, wind = 0 }) {
  return once(key, () => {
    const s = uv().x.mul(plies).add(uv().y.div(pitch));
    const ply = floor(s).mod(plies);
    const f = fract(s);
    const groove = sin(f.mul(Math.PI)); // 0 in the groove, 1 on the crown
    let c = vec3(...new THREE.Color(colors[0]).toArray());
    for (let i = 1; i < colors.length; i++) c = mix(c, vec3(...new THREE.Color(colors[i]).toArray()), ply.equal(i).select(float(1), float(0)));
    // individual hairs: streaks along the twist
    const hairs = mx_noise_float(vec2(f.mul(18.0), uv().y.mul(3.0).add(ply.mul(7.0)))).mul(0.5).add(0.5);
    const col = c.mul(hairs.mul(0.35).add(0.75)).mul(groove.mul(0.55).add(0.45)).mul(vertexColor().rgb);
    const mat = new THREE.MeshStandardNodeMaterial();
    mat.colorNode = col;
    mat.roughnessNode = float(1 - sheen).add(groove.oneMinus().mul(0.3));
    mat.metalnessNode = float(0);
    mat.normalNode = bumpFrom(groove.mul(radius * 0.5).add(hairs.mul(radius * 0.08)));
    if (wind) addSway(mat, wind);
    mat.name = key;
    return mat;
  });
}

// Wind sway driven by the `sway` vertex attribute (0 at the tied end → 1 at the free end).
function addSway(mat, amount = 0.03) {
  const w = attribute('sway', 'float');
  const p = positionWorld;
  const gust = sin(time.mul(1.7).add(p.x.mul(0.8)).add(p.z.mul(0.6))).mul(0.6).add(sin(time.mul(4.3).add(p.y.mul(9.0))).mul(0.4));
  mat.positionNode = positionLocal.add(vec3(gust.mul(amount), gust.abs().mul(amount * 0.2), gust.mul(amount * 0.6)).mul(w.mul(w)));
}

// Plain woven cloth (ribbons): matte, faint weave, colour from vertex colour.
export function cloth(key = 'cloth', sway = 0.035) {
  return once(key, () => {
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    const weave = sin(uv().x.mul(600)).mul(sin(uv().y.mul(1800))).mul(0.5).add(0.5);
    mat.colorNode = vertexColor().rgb.mul(weave.mul(0.08).add(0.92));
    mat.roughnessNode = float(0.88);
    mat.metalnessNode = float(0);
    if (sway) addSway(mat, sway);
    mat.name = key;
    return mat;
  });
}

// Loose hair locks (tufts, horse tail hanks): glossy, colour from vertex colour, sways.
export function hair(key = 'hair', sway = 0.025) {
  return once(key, () => {
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    const streak = mx_noise_float(vec2(uv().x.mul(40), uv().y.mul(2))).mul(0.5).add(0.5);
    mat.colorNode = vertexColor().rgb.mul(streak.mul(0.4).add(0.7));
    mat.roughnessNode = float(0.42);
    mat.metalnessNode = float(0);
    if (sway) addSway(mat, sway);
    mat.name = key;
    return mat;
  });
}

// Birch bark (туос): cream to golden-tan outer face with dark horizontal lenticels, satin sheen.
// uv.x around, uv.y metres up (lenticels are horizontal = along uv.x).
export function birchBark(key = 'birchBark', { dark = 0 } = {}) {
  return once(key, () => {
    const u = uv();
    const len = smoothstep(0.18, 0.36, mx_noise_float(vec2(u.x.mul(26), u.y.mul(140))))
      .mul(smoothstep(-0.3, 0.2, mx_noise_float(vec2(u.x.mul(5), u.y.mul(18)))));
    const blotch = mx_noise_float(vec2(u.x.mul(4), u.y.mul(6))).mul(0.5).add(0.5);
    const base = mix(vec3(0.36, 0.25, 0.12), vec3(0.22, 0.12, 0.05), blotch.mul(blotch));
    let col = mix(base, vec3(0.09, 0.06, 0.045), len.mul(0.9)).mul(vertexColor().rgb);
    if (dark) col = mix(col, vec3(0.42, 0.22, 0.12), dark);
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    mat.colorNode = col;
    mat.roughnessNode = float(0.55).add(len.mul(0.3));
    mat.metalnessNode = float(0);
    mat.normalNode = bumpFrom(len.mul(-0.0006));
    mat.name = key;
    return mat;
  });
}

// Hide with the hair on (cow/horse): uv in metres; vertex colour carries the coat colour.
export function hide(key = 'hide') {
  return once(key, () => {
    const u = uv();
    const n = mx_noise_float(vec2(u.x.mul(140), u.y.mul(30)));
    const clump = mx_noise_float(vec2(u.x.mul(9), u.y.mul(9)));
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    mat.colorNode = vertexColor().rgb.mul(n.mul(0.18).add(clump.mul(0.12)).add(0.92));
    mat.roughnessNode = float(0.8);
    mat.metalnessNode = float(0);
    mat.normalNode = bumpFrom(n.mul(0.0015).add(clump.mul(0.002)));
    mat.name = key;
    return mat;
  });
}

// A flat rough surface from vertex colour only (leather straps, stone, iron, food).
export function plain(key, { roughness = 0.7, metal = 0, side = THREE.FrontSide, bump = 0, bumpFreq = 60 } = {}) {
  return once(key, () => {
    const mat = new THREE.MeshStandardNodeMaterial({ side });
    const n = mx_noise_float(positionWorld.mul(bumpFreq));
    mat.colorNode = vertexColor().rgb.mul(n.mul(0.08).add(1));
    mat.roughnessNode = float(roughness).add(n.mul(0.08));
    mat.metalnessNode = float(metal);
    if (bump) mat.normalNode = bumpFrom(n.mul(bump));
    mat.name = key;
    return mat;
  });
}

// Trodden earth laid over the ground: brown_mud_dry / grass_path_2 mixed, with hoof dimples,
// alpha from the vertex colour's alpha (r,g,b,a = tint, coverage) so the edges fray into grass.
export function trodden(ctx, { key = 'trodden', hoof = 1 } = {}) {
  return once(key, () => {
    const mud = ctx.maps('brown_mud_dry'), path = ctx.maps('grass_path_2');
    const w = positionWorld.xz;
    const u1 = w.mul(0.45), u2 = w.mul(0.31).add(vec2(0.3, 0.7));
    const mix1 = smoothstep(-0.3, 0.3, mx_noise_float(w.mul(0.22)));
    const col = mix(texture(mud.diff, u1).rgb.mul(vec3(0.9, 0.86, 0.82)), texture(path.diff, u2).rgb.mul(0.7), mix1.mul(0.4));
    // hoof prints: small cupped dimples scattered by a cell hash
    const cell = w.mul(5.5);
    const id = floor(cell), f = fract(cell).sub(0.5);
    const jit = vec2(mx_noise_float(id.mul(1.7)), mx_noise_float(id.mul(2.3).add(9.1))).mul(0.25);
    const q = f.sub(jit); const d = vec2(q.x.mul(1.0), q.y.mul(1.25)).length().add(mx_noise_float(w.mul(40)).mul(0.03));
    const has = smoothstep(0.25, 0.45, mx_noise_float(id.mul(0.71).add(3.3)));
    const cup = smoothstep(0.17, 0.08, d).mul(has).mul(hoof);
    const rim = smoothstep(0.22, 0.17, d).mul(smoothstep(0.12, 0.17, d)).mul(has).mul(hoof);
    const h = rim.mul(0.004).sub(cup.mul(0.01)).add(mx_noise_float(w.mul(9.0)).mul(0.004));
    const a = vertexColor().a;
    const frayed = smoothstep(0.0, 1.0, a.add(mx_noise_float(w.mul(1.6)).mul(0.35)).add(mx_noise_float(w.mul(7)).mul(0.15)).sub(0.15));
    const mat = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
    mat.colorNode = col.mul(vec3(0.78, 0.7, 0.62)).mul(vertexColor().rgb).mul(cup.mul(0.1).oneMinus());
    mat.opacityNode = frayed.clamp(0, 1);
    mat.roughnessNode = float(0.95);
    mat.metalnessNode = float(0);
    mat.normalNode = bumpFrom(h);
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -2;
    mat.name = key;
    return mat;
  });
}

// Uncut grass blades (from grassClump): vertex colour, translucent-ish matte, sways.
export function grass() {
  return once('yardGrass', () => {
    const mat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
    mat.colorNode = vertexColor().rgb.mul(uv().y.mul(0.5).add(0.6));
    mat.roughnessNode = float(0.75);
    mat.metalnessNode = float(0);
    addSway(mat, 0.05);
    mat.name = 'yardGrass';
    return mat;
  });
}
