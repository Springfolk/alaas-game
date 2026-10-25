// The оһох: a clay-filled base box, a pole-and-clay hood leaning back into the NE corner with its
// arched mouth to the SW, the chimney (үөлэс) out through the roof to the хоро; fire, embers, light, smoke.
import * as THREE from 'three/webgpu';
import { box, log, sheet, fbm2, xf } from './geo.js';
import { HEARTH } from './dims.js';
import { section } from '../../load/geocache.js';

export function buildHearth({ B, M, rng, winter, root, chTop }) {
  const { x: hx, z: hz, s, h } = HEARTH;
  const ne = [Math.SQRT1_2, -Math.SQRT1_2];         // toward the NE corner (+x, −z)
  const sw = [-Math.SQRT1_2, Math.SQRT1_2];          // the mouth faces SW
  const c0 = [hx + ne[0] * 0.14, hz + ne[1] * 0.14];  // hood base centre: back two-thirds of the box
  const mouthTh = Math.atan2(sw[1], sw[0]);           // angle of SW in (x, z)
  const HALF = 0.82, ARCH = 1.08;                     // mouth half-angle (rad), height
  const mouth = [c0[0] + sw[0] * 0.55, h + 0.5, c0[1] + sw[1] * 0.55];
  M.clayMat = M.clay({ mouth, dir: sw, top: chTop });

  section(() => {
    // base box (холумтан): split-log sides, clay top with an ash bed
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const ox = Math.cos(a) * s / 2, oz = Math.sin(a) * s / 2;
      const along = [-Math.sin(a), Math.cos(a)];
      for (let k = 0; k < 2; k++) {
        const y = 0.07 + k * 0.14;
        B.add(M.beams, log([hx + ox - along[0] * (s / 2 + 0.06), y, hz + oz - along[1] * (s / 2 + 0.06)], [hx + ox + along[0] * (s / 2 + 0.06), y, hz + oz + along[1] * (s / 2 + 0.06)], 0.075, 0.07, rng, { caps: true, seg: 7 }), { color: [0.5, 0.42, 0.36] });
      }
    }
    B.add(M.embers, sheet(14, 14, (u, v) => [hx - s / 2 + u * s, h + 0.012 * fbm2(u * 6, v * 6, 3) + 0.02 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI), hz - s / 2 + v * s], { uvf: (u, v) => [u * s, v * s], face: () => [0, 1, 0] }));

    // hood + chimney, one lofted shell with the mouth carved as raised column starts
    const rows = [[h, 0.64], [0.55, 0.62], [0.85, 0.57], [1.15, 0.5], [1.45, 0.4], [1.75, 0.3], [2.0, 0.25], [2.3, 0.235], [chTop - 0.05, 0.225], [chTop, 0.25]];
    const NC = 56;
    const ringAt = (th, j, inset) => {
      const [y0, r0] = rows[j];
      const d = th - mouthTh, dd = Math.atan2(Math.sin(d), Math.cos(d));
      let y = y0;
      const inMouth = Math.abs(dd) < HALF;
      const arch = inMouth ? h + ARCH * Math.sqrt(Math.max(0, 1 - (dd / HALF) ** 2)) : h;
      if (y0 <= 1.75) y = arch + (y0 - h) / (1.75 - h) * (1.75 - arch);   // rows squeeze above the arch
      const lean = Math.min(y, 1.9) / 1.9 * 0.16;
      const wob = 1 + 0.03 * fbm2(th * 3, y * 4, 7);
      const r = (r0 - inset) * wob;
      return [c0[0] + ne[0] * lean + Math.cos(th) * r, y, c0[1] + ne[1] * lean + Math.sin(th) * r];
    };
    const shell = (inset) => sheet(NC, rows.length - 1, (u, v) => ringAt(u * Math.PI * 2, Math.round(v * (rows.length - 1)), inset),
      { uvf: (u, v) => [u * 3.6, rows[Math.round(v * (rows.length - 1))][0]], face: (x, y, z) => [x - c0[0], 0, z - c0[1]] });
    const outer = shell(0);
    B.add(M.clayMat, outer);
    B.add(M.soot, shell(0.07));
    // lip: closes the wall thickness along the mouth arch and the base
    const lip = sheet(NC, 1, (u, v) => ringAt(u * Math.PI * 2, 0, v * 0.07), { uvf: (u, v) => [u * 3.6, v * 0.07], face: (x, y, z) => [0, -1, 0] });
    B.add(M.clayMat, lip);
    // rim on the chimney top
    B.add(M.soot, sheet(NC, 1, (u, v) => ringAt(u * Math.PI * 2, rows.length - 1, v * 0.07), { face: () => [0, 1, 0] }));
    // a vessel shelf fixed to the hood's north side
    B.add(M.planks, box(0.5, 0.04, 0.26, { p: [c0[0] - 0.55, 1.15, c0[1] - 0.25], r: [0, 0.6, 0] }), { color: [0.6, 0.5, 0.42] });
  });

  // fire: an ember bed, upright split billets, flame cards, a flickering light
  const F = [c0[0] + sw[0] * 0.12, h + 0.01, c0[1] + sw[1] * 0.12];
  M.fireAt.value.set(F[0], F[1], F[2]);
  section(() => {
    B.add(M.embers, sheet(16, 16, (u, v) => {
      const a = u * Math.PI * 2, r = v * (winter ? 0.42 : 0.36);
      return [F[0] + Math.cos(a) * r, F[1] + (1 - v) * 0.05 + 0.025 * fbm2(Math.cos(a) * r * 10, Math.sin(a) * r * 10, 8), F[2] + Math.sin(a) * r];
    }, { face: () => [0, 1, 0] }));
    const billets = winter ? 2 : 5;
    for (let i = 0; i < billets; i++) {
      const a = (i / billets) * Math.PI * 2 + rng();
      const bx = F[0] + Math.cos(a) * 0.17, bz = F[2] + Math.sin(a) * 0.17;
      const tx = F[0] + ne[0] * 0.06 + Math.cos(a) * 0.03, tz = F[2] + ne[1] * 0.06 + Math.sin(a) * 0.03;
      if (winter) B.add(M.char, log([bx, h + 0.04, bz], [bx + Math.cos(a) * 0.35, h + 0.06, bz + Math.sin(a) * 0.35], 0.045, 0.035, rng, { caps: true, seg: 6 }), { color: [1, 1, 1] });
      else B.add(M.char, log([bx, h + 0.02, bz], [tx, h + 0.55 + rng() * 0.12, tz], 0.05, 0.035, rng, { caps: true, seg: 6, knob: 0.15 }), { color: [1, 1, 1] });
    }
  });
  const fire = { pos: new THREE.Vector3(F[0], F[1] + 0.35, F[2]), cards: null, light: null };
  if (!winter) {
    const cards = [];
    for (let i = 0; i < 5; i++) {
      const w = i < 3 ? 0.5 : 0.34, hh = i < 3 ? 0.85 : 0.6;
      const g = new THREE.PlaneGeometry(w, hh);
      xf(g, { p: [0, hh / 2, 0], r: [0, (i / 3) * Math.PI + (i > 2 ? 0.4 : 0), 0] });
      xf(g, { p: [F[0] + (i > 2 ? (rng() - 0.5) * 0.1 : 0), F[1] + 0.02, F[2] + (i > 2 ? (rng() - 0.5) * 0.1 : 0)] });
      const n = g.attributes.position.count;
      g.setAttribute('seed', new THREE.BufferAttribute(new Float32Array(n).fill(i * 1.37 + 0.2), 1));
      cards.push(g);
    }
    for (const g of cards) B.add(M.flame, g);
    const light = new THREE.PointLight(0xffb57a, 6, 6.5, 2);
    light.position.set(F[0] + sw[0] * 0.25, F[1] + 0.4, F[2] + sw[1] * 0.25);
    // No shadow map: a point-light shadow adds a sampled texture to every lit material in the scene and
    // pushes the ground shader past WebGPU's default 16-texture limit. Re-enable if the engine raises
    // requiredLimits.maxSampledTexturesPerShaderStage.
    light.castShadow = false;
    root.add(light);
    fire.light = light;
    // cool daylight spilling in through the open door (no shadows)
    const fill = new THREE.PointLight(0xc4d4ea, 1.4, 5.5, 1.6);
    fill.position.set(2.5, 1.1, 0.5);
    root.add(fill);
    fire.fill = fill;
  }
  section(() => {
    // firewood: split larch billets stacked against the east wall behind the hearth
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3), k = i % 3;
      const z = hz - 0.55 + k * 0.17 + (rng() - 0.5) * 0.03, y = 0.07 + row * 0.13, x0 = hx + 0.95;
      B.add(M.beams, log([x0, y, z], [x0 + 0.85 + (rng() - 0.5) * 0.1, y + 0.02, z + (rng() - 0.5) * 0.06], 0.065, 0.06, rng, { seg: 5, caps: true, knob: 0.2 }), { color: [0.85, 0.7, 0.55] });
    }
  });
  return { fire, c0, mouth, F, colliders: [{ x: hx, z: hz, hw: s / 2 + 0.05, hd: s / 2 + 0.05 }] };
}
