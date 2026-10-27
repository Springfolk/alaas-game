// Sky occlusion inside the houses: a cheap analytic stand-in for baked AO. Every lit material's ambient
// (environment) light is scaled by interiorOcclusion() (~0.2 deep inside, rising towards the east door),
// so interiors are lit by the door, windows, smoke hole and fire instead of by the whole blue sky.
// Shapes follow the model dimensions (inner wall faces + ~10 cm, so outer faces stay outside).
import { Fn, float, vec2, uniform, positionWorld, smoothstep, min, mix, abs, length } from 'three/tsl';
import { PLACEMENTS } from '../world/layout.js';

// local frames: +X east = the door side, origin = floor centre
const SHAPES = {
  // balagan: sloping walls (inner face 3.72 → 2.97 m from centre, ×  3.22 → 2.47) under a 2.4 m ceiling; khoton to the north
  balagan: [{ box: [3.82, 3.32, 3.07, 2.57], y: 2.45 }, { box: [2.6, 2.5, 2.6, 2.5], z: -5.1, y: 1.95 }],
  ampaar: [{ box: [1.86, 1.86, 1.86, 1.86], y: 2.05 }],
  urasa: [{ cone: true }],
};

export function interiorOcclusion() {
  const list = [];
  for (const p of PLACEMENTS) for (const s of SHAPES[p.model] || []) list.push({ p, s, y: uniform(-1e4) });
  // placement heights are known only after the world is built: Engine.update calls sync()
  const sync = () => { for (const it of list) it.y.value = it.p.y ?? -1e4; };
  const node = Fn(() => {
    let occ = float(1);
    for (const { p, s, y } of list) {
      const c = Math.cos(p.yaw || 0), sn = Math.sin(p.yaw || 0);
      const dx = positionWorld.x.sub(p.x), dz = positionWorld.z.sub(p.z);
      const lx = dx.mul(c).sub(dz.mul(sn)), lz = dx.mul(sn).add(dz.mul(c)).sub(s.z || 0);
      const ly = positionWorld.y.sub(y);
      let inside, half;
      if (s.cone) {
        // urasa: the bark cone, radius from the frame profile (urasa/frame.js: ~4.9 m at the floor, apex 11.09 m)
        const r = min(float(5.03).sub(ly.mul(0.1)), float(11.09).sub(ly).mul(0.549).add(0.1));
        half = r;
        inside = min(r.sub(length(vec2(lx, lz))), min(ly.add(0.3), float(10.1).sub(ly)));
      } else {
        const [hx0, hz0, hx1, hz1] = s.box, k = ly.div(s.y).clamp(0, 1);
        const hx = mix(float(hx0), float(hx1), k), hz = mix(float(hz0), float(hz1), k);
        half = hx;
        inside = min(min(hx.sub(abs(lx)), hz.sub(abs(lz))), min(ly.add(0.3), float(s.y).sub(ly)));
      }
      const w = smoothstep(0, 0.12, inside);
      // deep inside ~0.2; brighter towards the door wall (+X), as the doorway's daylight spreads in
      const a = mix(float(0.18), float(0.5), smoothstep(half.mul(-0.4), half, lx));
      occ = occ.mul(mix(float(1), a, w));
    }
    return occ;
  })();
  return { node, sync };
}
