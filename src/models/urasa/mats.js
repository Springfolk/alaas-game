// Materials of the ураһа: birch bark (туос) outer/inner faces and ornament bands, stained posts,
// peeled poles, planks, earth, clay, hides, smoked leather, carved birch, horsehair.
// Model-local coordinates (positionLocal) drive aging: meshes are baked at identity in the model group.
import * as THREE from 'three/webgpu';
import {
  Fn, uv, texture, vec2, vec3, float, mix, positionLocal, normalLocal, positionView, normalView, attribute, uniform, abs,
  max, min, fract, floor, cos, atan, length, dot, step, mx_noise_float, mx_fractal_noise_float, mx_worley_noise_float,
  normalMap, faceDirection, select, hash, varying,
} from 'three/tsl';
import { tex, maps } from '../../engine/materials.js';
import { octaves, TIER } from '../../engine/tier.js';
import { APEX_Y, DOOR, makeProfile } from './frame.js';

const R0 = makeProfile().rAtY(0); // the cone's radius at the ground

const T = (f, srgb = false) => tex(`${import.meta.env.BASE_URL}assets/tex/tuos_sheet/${f}`, { srgb });
const lum = (c) => dot(c, vec3(0.299, 0.587, 0.114));
const n3 = (p) => mx_noise_float(p).mul(0.5).add(0.5); // 0..1
const fbm3 = (p, o = 3) => { const { n, k } = octaves(o); return mx_fractal_noise_float(p, n, 2, 0.5).mul(0.5 * k).add(0.5); };

// Surface-gradient bump (Mikkelsen) from a procedural height in metres; base = view normal to perturb.
export const bump = (h, base = normalView) => {
  const sx = positionView.dFdx(), sy = positionView.dFdy();
  const r1 = sy.cross(base), r2 = base.cross(sx);
  const det = sx.dot(r1).mul(faceDirection);
  const grad = det.sign().mul(h.dFdx().mul(r1).add(h.dFdy().mul(r2)));
  return det.abs().mul(base).sub(grad).normalize();
};

// Indirect light reaching the inside: little, except near the door (when the curtain is lifted) and under the smoke hole.
export const uDoorOpen = uniform(0);
export const occ = Fn(([p]) => {
  const r = length(vec2(p.x, p.z));
  const rc = float(R0 + 0.11).sub(max(p.y.sub(2.0), 0).mul(0.546)); // a little outside the cone (only interior materials use this)
  const inside = smoothstep(rc.add(0.3), rc.add(0.1), r).mul(smoothstep(APEX_Y + 0.46, APEX_Y - 0.65, p.y));
  const door = smoothstep(2.0, 0.0, length(vec2(p.x.sub(DOOR.r), p.z)));
  const top = smoothstep(APEX_Y - 4.0, APEX_Y - 0.8, p.y);
  // the sky's irradiance is ~20× the fire's, so a closed tent lets in only a few per cent of it
  return mix(float(1), float(0.016).add(door.mul(uDoorOpen.mul(0.12).add(0.03))).add(top.mul(0.16)), inside).clamp(0, 1);
});

// smoothstep that also runs reversed (edge0 > edge1) — the native one is undefined there on Metal
export const smoothstep = (a, b, x) => {
  const t = float(x).sub(a).div(float(b).sub(a)).clamp(0, 1);
  return t.mul(t).mul(float(3).sub(t.mul(2)));
};

const std = (o) => new THREE.MeshStandardNodeMaterial({ roughness: 1, metalness: 0, ...o });

export function makeMats() {
  const M = {};
  const diff = T('diff.webp', true), inner = T('inner.webp', true), nor = T('nor.webp'), arm = T('arm.webp'), band = T('band.webp', true);
  const carve = tex(`${import.meta.env.BASE_URL}assets/tex/carving/chorons.webp`); // traced carving masks (docs/patterns.md)
  const p = positionLocal;
  const ang = atan(p.z, p.x);

  // ---- outer bark cover: rings of sewn sheets. uv.x = metres/1.6 along the ring, uv.y 0..1 across it.
  // aRing = (ring index, random, scallops on this ring, scallops on the ring above)
  {
    const m = std({ name: 'tuos-outer' });
    const ring = attribute('aRing', 'vec4');
    const t = uv();
    // each 0.8 m sheet picks one of the two baked sheets, maybe upside down: no visible repeat
    const sh = floor(t.x.mul(2)).add(ring.x.mul(17.3));
    const pick = floor(hash(sh.add(5.1)).mul(2)), flipV = hash(sh.add(9.7)).greaterThan(0.5);
    const ts = vec2(fract(t.x.mul(2)).add(pick).mul(0.5), select(flipV, float(1).sub(t.y), t.y));
    const d = texture(diff, ts).rgb, a = texture(arm, ts);
    const y = p.y;
    const scal = ring.x.greaterThan(0.5).select(float(0.024).mul(float(0.5).sub(cos(ang.mul(ring.z)).mul(0.5))), float(-1));
    const scalNext = float(0.024).mul(float(0.5).sub(cos(ang.mul(ring.w)).mul(0.5)));
    const vNext = float(0.5 / 0.62).add(scalNext.div(0.62)); // where the ring above lies on this one
    // per-sheet tone: cream, warm grey or brownish — the sheets came from different trees and years
    const sheet = floor(t.x.mul(2)).add(ring.x.mul(17.3));
    const h1 = hash(sheet), h2 = hash(sheet.add(71.3)), h3 = hash(sheet.add(33.1));
    const tint = select(h2.lessThan(0.4), vec3(1.0, 0.94, 0.82), select(h2.lessThan(0.75), vec3(0.78, 0.74, 0.66), vec3(0.7, 0.57, 0.43)));
    let c = d.mul(h1.mul(0.25).add(0.75)).mul(tint);
    // weathering: cream → grey-brown, patchy, more on the upper rings that get the sun
    // the six slow position-only noises (≤ 18/m): phones evaluate them per vertex (~12 cm apart), two varyings —
    // the cover filling the screen cost a warm iPhone ~44 ms a frame in these alone
    const N = (() => {
      const a = vec3(fbm3(p.mul(vec3(1.0, 0.6, 1.0)), 4), fbm3(p.mul(vec3(2.2, 1.4, 2.2)), 3), fbm3(p.mul(5.5), 4));
      const b = vec3(fbm3(p.mul(vec3(3, 0.7, 3)), 3), fbm3(p.mul(vec3(9, 3, 9)), 3), fbm3(p.mul(18), 3));
      const [va, vb] = TIER.name === 'mobile' ? [varying(a), varying(b)] : [a, b];
      return { w: va.x, edgeK: va.y, lich: va.z, soot: vb.x, dirt: vb.y, splash: vb.z };
    })();
    const w = N.w;
    const age = w.mul(1.1).add(y.div(APEX_Y).mul(0.2)).add(ring.y.mul(0.25)).sub(0.38).clamp(0, 0.9);
    const grey = vec3(lum(c)).mul(vec3(0.7, 0.6, 0.48));
    c = mix(c, grey, age);
    // darker weathered sheet edges (end seams and the free lower edge)
    const lu = fract(t.x.mul(2));
    const eu = min(lu, float(1).sub(lu)).mul(0.8); // metres to the sheet end
    const en = fbm3(vec3(t.x.mul(40), t.y.mul(8), ring.x), 3);
    const edgeDirt = smoothstep(0.06, 0.0, eu.sub(en.mul(0.02))).add(smoothstep(0.1, 0.0, t.y.sub(en.mul(0.03)))).clamp(0, 1);
    const edgeK = smoothstep(0.35, 0.75, N.edgeK).mul(h1.mul(0.7).add(0.3)); // only here and there
    c = mix(c, c.mul(vec3(0.55, 0.47, 0.38)), edgeDirt.mul(edgeK).mul(0.6));
    // patched sheets: a smaller, browner piece sewn on with a row of stitches round it
    const isPatch = h3.lessThan(0.13);
    const px0 = hash(sheet.add(4.4)).mul(0.3).add(0.15), py0 = hash(sheet.add(5.5)).mul(0.25).add(0.12);
    const inPatch = step(px0, lu).mul(step(lu, px0.add(0.38))).mul(step(py0, t.y)).mul(step(t.y, py0.add(0.4))).mul(isPatch.select(1, 0));
    const pd = min(min(lu.sub(px0), px0.add(0.38).sub(lu)).mul(0.8), min(t.y.sub(py0), py0.add(0.4).sub(t.y)).mul(0.62));
    const stitchRow = smoothstep(0.004, 0.0, abs(pd.sub(0.012))).mul(step(0.45, fract(t.x.mul(1.6 * 120).add(t.y.mul(0.62 * 120)))));
    c = mix(c, c.mul(vec3(0.78, 0.66, 0.52)), inPatch.mul(0.8));
    c = mix(c, vec3(0.05, 0.04, 0.035), inPatch.mul(stitchRow));
    c = c.mul(float(1).sub(inPatch.mul(smoothstep(0.006, 0.0, pd)).mul(0.5)));
    // grey-green lichen low on the shaded north side
    const north = smoothstep(0.2, -0.8, p.z.div(length(vec2(p.x, p.z)).add(0.01)));
    const lich = smoothstep(0.6, 0.72, N.lich).mul(smoothstep(1.9, 0.2, y)).mul(north);
    c = mix(c, vec3(0.42, 0.45, 0.34), lich.mul(0.7));
    // rain and grime streaks running down from each ring's lower edge onto the one below
    const st = n3(vec3(t.x.mul(1.6 * 30), t.y.mul(1.2), ring.x.mul(3.1)));
    const st2 = n3(vec3(t.x.mul(1.6 * 90), t.y.mul(3), ring.x.mul(5.7)));
    const streak = smoothstep(0.5, 0.85, st).mul(smoothstep(0.3, 0.8, t.y)).mul(st2.mul(0.6).add(0.4));
    c = mix(c, c.mul(vec3(0.62, 0.56, 0.48)), streak.mul(0.6));
    // soot round the smoke hole, ground splash at the foot
    const soot = smoothstep(APEX_Y - 3.6, APEX_Y - 1.1, y).mul(N.soot.mul(0.6).add(0.55)).clamp(0, 1);
    c = mix(c, vec3(0.09, 0.075, 0.065), soot.mul(0.9));
    const dirt = smoothstep(0.75, 0.0, y.add(N.dirt.mul(0.3))).clamp(0, 1);
    c = mix(c, vec3(0.22, 0.18, 0.13), dirt.mul(0.85));
    const splash = smoothstep(0.3, 0.0, y).mul(smoothstep(0.55, 0.75, N.splash));
    c = mix(c, vec3(0.2, 0.24, 0.12), splash.mul(0.6)); // mud and grass splash at the foot
    // contact shadow under the ring above, dark rim on the cut edge
    const under = smoothstep(vNext.sub(0.05), vNext, t.y).mul(step(t.y, vNext.add(0.002)));
    c = c.mul(float(1).sub(under.mul(0.3)));
    const edge = smoothstep(0.03, 0.0, t.y.sub(max(scal, 0)));
    c = c.mul(float(1).sub(edge.mul(0.28)));
    m.colorNode = c;
    m.roughnessNode = a.g.mul(float(1).add(age.mul(0.25))).clamp(0.3, 1);
    m.aoNode = a.r.mul(float(1).sub(under.mul(0.4)));
    m.normalNode = normalMap(texture(nor, ts), vec2(1.6));
    m.maskNode = t.y.greaterThan(scal);
    M.outer = m;
  }

  // ---- inner (boiled, golden-tan) face seen from inside; strips 0.5 m, soot thickens upwards
  {
    const m = std({ name: 'tuos-inner' });
    const t = uv();
    const d = texture(inner, t).rgb, a = texture(arm, t);
    const y = p.y;
    const hs = hash(floor(t.x.mul(2)).add(floor(t.y).mul(7.7)));
    // boiled bark ranges from honey to a duller tan; keep it from going uniformly orange
    let c = mix(d, vec3(lum(d)).mul(vec3(1.0, 0.86, 0.68)), hs.mul(0.5).add(0.2)).mul(hs.mul(0.2).add(0.85));
    const sm = fbm3(p.mul(vec3(2.5, 0.6, 2.5)), 4);
    const soot = smoothstep(APEX_Y - 7.7, APEX_Y - 1.4, y.add(sm.mul(1.8))).clamp(0, 1);
    c = mix(c, vec3(0.11, 0.075, 0.05), soot.mul(0.9));
    // each ring's lower edge overlaps the one below, sewn down with a row of horsehair stitches
    const v = fract(t.y);
    c = c.mul(float(1).sub(smoothstep(0.035, 0.0, v).mul(0.5)).sub(smoothstep(0.96, 1.0, v).mul(0.15)));
    const row = smoothstep(0.006, 0.0, abs(v.sub(0.06))).mul(step(0.55, fract(t.x.mul(1.6 * 110))));
    c = mix(c, vec3(0.04, 0.03, 0.02), row.mul(0.85));
    m.colorNode = c;
    m.roughnessNode = mix(a.g.mul(0.95), float(0.42), soot.mul(0.6));
    m.aoNode = a.r.mul(occ(p));
    m.normalNode = normalMap(texture(nor, vec2(t.x, fract(t.y).mul(0.8))), vec2(1.5));
    M.inner = m;
  }

  // ---- ornament bands (uv into band.png; top half the arcade band, bottom half the zigzag band)
  {
    const m = std({ name: 'tuos-band', side: THREE.DoubleSide });
    const t = uv();
    const b = texture(band, t);
    const w = fbm3(p.mul(2.0), 3);
    m.colorNode = b.rgb.mul(w.mul(0.5).add(0.8));
    m.roughnessNode = float(0.78);
    m.maskNode = b.a.greaterThan(0.5);
    M.band = m;
  }

  // ---- bark vessels (buckets) and the door curtain: cream outside (uv.x < 5), golden inside (uv.x ≥ 5)
  {
    const m = std({ name: 'tuos-vessel', side: THREE.DoubleSide });
    const t0 = uv();
    const isIn = t0.x.greaterThan(5);
    const t = vec2(fract(t0.x), t0.y);
    const co = texture(diff, t).rgb, ci = texture(inner, t).rgb, a = texture(arm, t);
    const w = fbm3(p.mul(9), 3);
    let c = select(isIn, ci.mul(0.85), mix(co.mul(0.85), vec3(lum(co)).mul(vec3(0.66, 0.58, 0.48)), w.mul(0.8).add(0.1)));
    // milk residue at the bottom inside
    c = select(isIn, mix(c, vec3(0.78, 0.75, 0.68), smoothstep(0.1, 0.0, t.y).mul(0.6)), c);
    m.colorNode = c;
    m.roughnessNode = select(isIn, float(0.55), a.g);
    m.aoNode = a.r.mul(occ(p));
    m.normalNode = normalMap(texture(nor, t), vec2(1));
    M.vessel = m;
  }

  // ---- peeled larch poles: inner (smoked, honey-brown → soot) and outer (silver-grey weathered)
  const rw = maps('rough_wood');
  const poleUV = () => { const t = uv(); return vec2(fract(t.x).mul(0.3), t.y.div(1.1)); };
  {
    const m = std({ name: 'pole-in' });
    const t = poleUV();
    const d = texture(rw.diff, t).rgb;
    const v = fbm3(p.mul(vec3(4, 0.25, 4)), 2);
    let c = d.mul(vec3(1.05, 0.82, 0.6)).mul(v.mul(0.4).add(0.75));
    const soot = smoothstep(1.2, APEX_Y - 1.75, p.y.add(v.mul(1.2)));
    c = mix(c, vec3(0.06, 0.045, 0.035), soot.mul(0.85));
    m.colorNode = c;
    m.roughnessNode = mix(texture(rw.arm, t).g, float(0.5), soot.mul(0.5));
    m.aoNode = occ(p).mul(texture(rw.arm, t).r);
    m.normalNode = normalMap(texture(rw.nor, t), vec2(1.0));
    M.poleIn = m;
  }
  {
    const m = std({ name: 'pole-out' });
    const t = poleUV();
    const d = texture(rw.diff, t).rgb;
    const v = fbm3(p.mul(vec3(3, 0.3, 3)), 3);
    // each pole its own tone (index by azimuth), strips of bark left on by a hurried draw-knife
    const pid = hash(floor(atan(p.z, p.x).mul(36 / 6.2832).add(0.5)).add(3.3)); // 36 outer poles
    let c = mix(d.mul(1.05), d.mul(vec3(1.12, 0.92, 0.72)), pid.mul(0.8)).mul(v.mul(0.35).add(0.75));
    const barkLeft = smoothstep(0.6, 0.68, fbm3(p.mul(vec3(14, 1.5, 14)).add(pid.mul(9)), 3)).mul(pid.greaterThan(0.35).select(1, 0.3));
    c = mix(c, vec3(0.2, 0.13, 0.08).mul(fbm3(p.mul(40), 2).add(0.5)), barkLeft);
    c = mix(c, vec3(0.1, 0.085, 0.075), smoothstep(APEX_Y - 2.5, APEX_Y - 0.28, p.y).mul(0.75));
    c = mix(c, vec3(0.28, 0.23, 0.17), smoothstep(0.4, 0.0, p.y).mul(0.6));
    m.colorNode = c;
    m.roughnessNode = texture(rw.arm, t).g;
    m.aoNode = texture(rw.arm, t).r;
    m.normalNode = normalMap(texture(rw.nor, t), vec2(1.2));
    M.poleOut = m;
  }

  // ---- posts and hoops: stained red-brown with alder bark, uncarved. uv.x around (0.5 faces the hearth),
  // uv.y height in metres; uv.x ≥ 5 marks hoops and lintel
  {
    const pine = maps('rough_pine_door');
    const m = std({ name: 'post-stained' });
    const t0 = uv();
    const u = fract(t0.x), y = t0.y;
    const t = vec2(u.mul(0.06).add(0.62), y.div(1.6));
    const d = texture(pine.diff, t).rgb;
    // plain: no traced source for carving on urasa posts (docs/patterns.md)
    let c = d.mul(vec3(0.95, 0.62, 0.5));
    c = mix(c, vec3(0.3, 0.12, 0.07), 0.45);
    // smoke darkens the upper posts
    c = mix(c, vec3(0.07, 0.04, 0.03), smoothstep(1.4, 2.4, p.y).mul(0.55));
    m.colorNode = c;
    m.roughnessNode = float(0.74);
    m.aoNode = occ(p);
    m.normalNode = normalMap(texture(pine.nor, t), vec2(0.8));
    M.post = m;
  }

  // ---- planks (benches, board, sleepers): uv.y along the grain in metres, uv.x across.
  // old_planks_02 has vertical planks; sample inside one plank, smoke-browned honey tone
  {
    const op = maps('old_planks_02');
    const m = std({ name: 'plank' });
    const t0 = uv();
    const v = hash(floor(p.x.mul(3.1)).add(floor(p.z.mul(2.7)).mul(13.1)).add(floor(p.y.mul(9.0)).mul(7.3)));
    const t = vec2(fract(t0.x.mul(0.5)).mul(0.1).add(0.31).add(v.mul(0.25)), t0.y.div(2.0).add(v));
    const d = texture(op.diff, t).rgb;
    let c = d.mul(vec3(1.1, 0.8, 0.55)).mul(v.mul(0.3).add(0.75));
    c = c.mul(fbm3(p.mul(5), 3).mul(0.3).add(0.75));
    // tops worn smooth and darker-honey where people sit
    m.colorNode = c;
    m.roughnessNode = texture(op.arm, t).g.mul(0.85);
    m.aoNode = occ(p).mul(texture(op.arm, t).r);
    m.normalNode = normalMap(texture(op.nor, t), vec2(0.9));
    M.plank = m;
  }

  // ---- door frame and threshold: hewn larch, grey outside, smoke-brown inside
  {
    const m = std({ name: 'timber' });
    const t0 = uv();
    const t = vec2(fract(t0.x.mul(0.5)).mul(0.5), t0.y.div(1.2));
    const d = texture(rw.diff, t).rgb;
    const rr = length(vec2(p.x, p.z));
    const inward = smoothstep(DOOR.r + 0.21, DOOR.rTop - 0.04, rr).mul(smoothstep(0.3, -0.4, normalLocal.x)).max(smoothstep(DOOR.rTop - 0.12, DOOR.rTop - 0.24, rr));
    let c = d.mul(fbm3(p.mul(4), 3).mul(0.3).add(0.62));
    c = mix(c, c.mul(vec3(0.75, 0.55, 0.4)), inward);
    m.colorNode = c;
    m.roughnessNode = texture(rw.arm, t).g;
    m.aoNode = texture(rw.arm, t).r.mul(mix(float(1), occ(p), inward));
    m.normalNode = normalMap(texture(rw.nor, t), vec2(1.3));
    M.timber = m;
  }

  // ---- earthen floor, swept hard; ash round the hearth, a trodden path from the door
  {
    const mud = maps('dirt_floor');
    const m = std({ name: 'floor-earth' });
    const t = vec2(p.x, p.z).mul(0.5);
    const d = texture(mud.diff, t).rgb;
    const r = length(vec2(p.x, p.z));
    let c = d.mul(vec3(0.62, 0.52, 0.44));
    const ash = smoothstep(1.35, 0.8, max(abs(p.x), abs(p.z))).mul(fbm3(p.mul(5), 3).mul(0.8).add(0.2));
    c = mix(c, vec3(0.32, 0.3, 0.28), ash.mul(0.5));
    const path = smoothstep(0.55, 0.1, abs(p.z)).mul(smoothstep(0.5, 1.2, p.x));
    c = c.mul(float(1).sub(path.mul(0.15)));
    c = c.mul(smoothstep(R0, R0 - 0.7, r).mul(0.25).add(0.75));
    m.colorNode = c;
    m.roughnessNode = texture(mud.arm, t).g.mul(0.95);
    m.aoNode = texture(mud.arm, t).r.mul(occ(p));
    m.normalNode = normalMap(texture(mud.nor, t), vec2(0.35));
    M.floor = m;
  }

  // ---- clay of the hearth, burnt black in the middle
  {
    const clay = maps('clay_block_wall');
    const m = std({ name: 'clay' });
    const t = vec2(p.x.add(p.y.mul(0.7)), p.z.add(p.y.mul(0.5))).mul(0.9);
    const d = texture(clay.diff, t).rgb;
    const r = length(vec2(p.x, p.z));
    let c = d.mul(vec3(0.85, 0.75, 0.66));
    c = mix(c, vec3(0.05, 0.04, 0.035), smoothstep(0.55, 0.2, r.add(fbm3(p.mul(6), 3).mul(0.2))).mul(0.95));
    m.colorNode = c;
    m.roughnessNode = float(0.92);
    m.aoNode = texture(clay.arm, t).r.mul(occ(p));
    m.normalNode = normalMap(texture(clay.nor, t), vec2(0.8));
    M.clay = m;
  }

  // ---- hides on the benches: aHide.x = kind (0 horse, 1 cow, 2 bear, 3 elk), aHide.y = seed
  {
    const m = std({ name: 'hide', side: THREE.DoubleSide });
    const hd = attribute('aHide', 'vec2');
    const t = uv();
    const k = hd.x;
    const q = vec3(t.x.mul(3), t.y.mul(3), hd.y.mul(10));
    const fur = n3(vec3(t.x.mul(320), t.y.mul(90), hd.y)).mul(0.45).add(n3(vec3(t.x.mul(60), t.y.mul(18), hd.y.add(3))).mul(0.35)).add(n3(vec3(t.x.mul(9), t.y.mul(9), hd.y.add(7))).mul(0.2));
    // the skin's kind (horse, cow, bear, elk) picks its noise scale and colours first: one noise a pixel, not four
    const pick = (a, b, c3, d) => select(k.lessThan(0.5), a, select(k.lessThan(1.5), b, select(k.lessThan(2.5), c3, d)));
    const n = fbm3(q.mul(pick(float(2), float(1), float(2), float(1.5))), 3);
    const isCow = k.greaterThan(0.5).and(k.lessThan(1.5));
    const f = select(isCow, smoothstep(0.48, 0.55, n), n); // cow: white patches
    let c = mix(pick(vec3(0.16, 0.09, 0.05), vec3(0.24, 0.13, 0.07), vec3(0.07, 0.05, 0.035), vec3(0.38, 0.29, 0.2)),
      pick(vec3(0.3, 0.18, 0.1), vec3(0.5, 0.43, 0.34), vec3(0.2, 0.13, 0.08), vec3(0.22, 0.16, 0.11)), f);
    c = c.mul(fur.mul(0.9).add(0.45));
    m.colorNode = c;
    m.roughnessNode = float(1);
    m.aoNode = occ(p).mul(fur.mul(0.6).add(0.4));
    m.normalNode = bump(fur.mul(0.006));
    // ragged outline of a real skin
    const e = n3(vec3(t.x.mul(7), t.y.mul(7), hd.y.mul(5))).mul(0.06);
    const inset = min(min(t.x, float(1).sub(t.x)), min(t.y, float(1).sub(t.y)));
    m.maskNode = inset.greaterThan(e.add(0.005));
    M.hide = m;
  }

  // ---- smoked horse leather (симиир): dark, greasy, tan at the creases, milk stains on the shoulders
  {
    const lt = maps('fabric_leather_02');
    const m = std({ name: 'leather' });
    const t0 = uv();
    const t = vec2(t0.x.mul(2.0), t0.y.mul(1.2));
    const ld = texture(lt.diff, t).rgb;
    const wr = mx_worley_noise_float(vec3(t0.x.mul(30), t0.y.mul(22), 1.0));
    const big = fbm3(p.mul(7), 4);
    let c = vec3(lum(ld)).mul(vec3(0.42, 0.27, 0.16)).mul(0.75);
    c = mix(c, c.mul(vec3(1.8, 1.5, 1.2)), smoothstep(0.6, 0.85, big).mul(0.6));
    c = mix(c, vec3(0.26, 0.22, 0.17), smoothstep(0.62, 0.72, t0.y).mul(smoothstep(0.6, 0.75, fbm3(p.mul(14), 3))).mul(0.5));
    c = c.mul(wr.mul(0.2).add(0.88));
    m.colorNode = c;
    m.roughnessNode = mix(texture(lt.arm, t).g, float(0.8), big).clamp(0.55, 0.92);
    m.aoNode = occ(p);
    m.normalNode = bump(wr.mul(0.0015).add(big.mul(0.004)), normalMap(texture(lt.nor, t), vec2(1.5)));
    M.leather = m;
  }

  // ---- carved birch (chorons, ladle, stirrer, collar): honey patina, darker in the cuts.
  // Lathe uv: uv.y = profile fraction; uv.x around. uv.x ≥ 5 → plain (no carving bands).
  {
    const m = std({ name: 'birch-carved' });
    const t0 = uv();
    const plain = t0.x.greaterThan(5);
    const u = fract(t0.x), v = t0.y;
    const g = n3(vec3(u.mul(12), v.mul(60), 0.5)).mul(0.5).add(n3(vec3(u.mul(3), v.mul(8), 4.0)).mul(0.5));
    // traced carving (tools/make-carving.mjs, docs/patterns.md): uv.x 0..1 goblet chorons (red, Sieroszewski Rys. 112),
    // uv.x 2..3 the three-legged choron (green, REM 12175-2); uv.x ≥ 5 plain
    const mk = texture(carve, vec2(u, v));
    const cutAll = select(t0.x.greaterThan(1.5), mk.g, mk.r).mul(plain.select(0, 1));
    let c = mix(vec3(0.56, 0.36, 0.17), vec3(0.38, 0.22, 0.1), g);
    c = mix(c, vec3(0.16, 0.08, 0.03), cutAll.mul(0.75));
    m.colorNode = c;
    m.roughnessNode = mix(float(0.42), float(0.75), cutAll);
    m.aoNode = occ(p).mul(float(1).sub(cutAll.mul(0.4)));
    m.normalNode = bump(cutAll.mul(-0.0018).add(g.mul(0.0002)));
    M.birch = m;
  }

  // ---- horsehair cord and lashings (dark, fibrous); uv.x ≥ 5 → black-and-white braid
  {
    const m = std({ name: 'horsehair' });
    const t0 = uv();
    const braid = t0.x.greaterThan(5);
    const f = n3(vec3(fract(t0.x).mul(40), t0.y.mul(200), 2.0));
    const stripe = step(0.5, fract(t0.y.mul(28).add(fract(t0.x).mul(3))));
    let c = mix(vec3(0.03, 0.025, 0.02), vec3(0.09, 0.07, 0.05), f);
    c = select(braid, mix(c, vec3(0.75, 0.72, 0.66), stripe), c);
    c = select(t0.x.greaterThan(20), mix(vec3(0.72, 0.7, 0.64), vec3(0.9, 0.88, 0.82), f), c); // white mane hair
    m.colorNode = c;
    m.roughnessNode = float(0.55);
    m.aoNode = occ(p);
    m.normalNode = bump(f.mul(0.0006));
    M.hair = m;
  }

  // ---- kymys in the chorons: off-white with a faint blue cast, matte with a soft sheen of butterfat
  {
    const m = std({ name: 'kymys' });
    const c = mix(vec3(0.74, 0.76, 0.78), vec3(0.8, 0.81, 0.82), n3(positionLocal.mul(70)));
    m.colorNode = c;
    m.emissiveNode = c.mul(0.05);   // firelight scattered inside the milk: it reads pale even facing away from the fire
    m.roughnessNode = float(0.32);
    m.aoNode = occ(positionLocal);
    M.kymys = m;
  }

  return M;
}
