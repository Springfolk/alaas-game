// The yard's material palette (shared by yardlife and lakeside so the two read as one place).
import { color, uniform, mx_noise_float, positionWorld, time, float, vec3 } from 'three/tsl';
import { pmat } from './kit.js';

let M;
export function yardMats() {
  if (M) return M;
  const glow = uniform(0.25); // coal glow (smithy), animated by the bellows
  const ember = uniform(0.6); // smudge-fire embers
  const flick = (u, k) => mx_noise_float(positionWorld.mul(k).add(vec3(0, time.mul(0.9), 0))).mul(0.5).add(0.5).mul(u);
  return M = {
    glow, ember,
    // weathered round larch, peeled, silver-grey with lichen on the north
    wood: pmat('rough_wood', { scale: 1.6, lichen: 0.55, tint: 0xd9d4ca }),
    darkwood: pmat('rough_wood', { scale: 1.6, lichen: 0.25, tint: 0x8a7e70 }),
    fresh: pmat('raw_plank_wall', { scale: 1.4, tint: 0xd9cbb4, dirt: 0.6 }),
    planks: pmat('weathered_planks', { scale: 1.6, lichen: 0.4, tint: 0xd8d2c6 }),
    bark: pmat('pine_bark', { scale: 0.9, lichen: 0.25, tint: 0xb8a898 }),
    barkSlab: pmat('pine_bark', { scale: 0.9, lichen: 0.2, tint: 0xa89888, double: true }),
    end: pmat('canvas:endgrain', { scale: 0.6, dirt: 0.4, vary: 0.2, tint: 0x948a80, lichen: 0.3 }),     // old, weathered cuts
    endFresh: pmat('canvas:endgrain', { scale: 0.6, dirt: 0.2, vary: 0.25, tint: 0xe8c0a0 }), // fresh golden-red larch
    split: pmat('raw_plank_wall', { scale: 1.1, tint: 0xd8bf9c, lichen: 0.1 }),
    lash: pmat('bark_willow_02', { scale: 0.35, tint: 0xa79479, dirt: 0.3 }),
    willow: pmat('raw_plank_wall', { scale: 0.6, tint: 0xf4e3c4, dirt: 0.3, rough: 0.8 }),
    hay: pmat('acg_hay', { scale: 0.9, tint: 0xd4c08c, vary: 0.3, dirt: 0.5, normalScale: 2.2 }),
    hayGreen: pmat('acg_hay', { scale: 1.1, tint: 0xa9b07a, vary: 0.25, dirt: 0.4 }),
    birch: pmat('canvas:birch', { scale: 0.5, back: 'birchIn', double: true, dirt: 0.4 }),
    birchIn: pmat('canvas:birchIn', { scale: 0.5, dirt: 0.4 }),
    leather: pmat('fabric_leather_02', { scale: 0.35, tint: 0x4e3d30, dirt: 0.5, rough: 1.3, normalScale: 1.6 }),
    hide: pmat('fabric_leather_02', { scale: 0.6, tint: 0x8a6a4c, dirt: 0.4, double: true }),
    iron: pmat('rusty_metal_02', { scale: 0.4, tint: 0x4a4440, metal: 0.55, rough: 0.9, dirt: 0.2 }),
    soot: pmat('rusty_metal_02', { scale: 0.5, tint: 0x1e1c1b, metal: 0.3, rough: 1, dirt: 0 }),
    clay: pmat('clay_plaster', { scale: 0.7, tint: 0xbcab96, dirt: 0.6, vary: 0.3, normalScale: 1.5 }),
    stone: pmat('rock_ground', { scale: 0.8, tint: 0xd6d0c6, lichen: 0.6 }),
    rope: pmat('acg_rope', { scale: 0.08, tint: 0xa89a82, dirt: 0.2 }),
    hair: pmat('acg_rope', { scale: 0.05, tint: 0x3a3430, dirt: 0 }),
    cloth: pmat('canvas:cloth', { scale: 0.06, dirt: 0.15, double: true }),
    silver: pmat('canvas:silver', { scale: 0.12, metal: 1, rough: 0.95, dirt: 0, vary: 0.1, tint: 0xb4b1aa }),
    bowplate: pmat('canvas:bowplate', { scale: 0.34, metal: 1, rough: 0.95, dirt: 0, vary: 0.1, tint: 0xb4b1aa }), // engraved front bow (tools/make-carving.mjs)
    bone: pmat('raw_plank_wall', { scale: 0.3, tint: 0xf6ead4, rough: 0.6, dirt: 0 }),
    dung: pmat('brown_mud_dry', { scale: 0.6, tint: 0x6e5a48, dirt: 0.2 }),
    earth: pmat('brown_mud_dry', { scale: 1.2, tint: 0x9a8a78, dirt: 0.2 }),
    slag: pmat('rock_ground', { scale: 0.3, tint: 0x3a3c36, rough: 0.7, dirt: 0 }),
    ore: pmat('rock_ground', { scale: 0.3, tint: 0x8a4a28, dirt: 0.2 }),
    coal: pmat('rock_ground', { scale: 0.25, tint: 0x1a1817, dirt: 0, rough: 0.8, id: 'coal',
      emissive: color(1.0, 0.32, 0.06).mul(flick(glow, 9).mul(flick(float(1), 23).add(0.4))).mul(2.4) }),
    embers: pmat('rock_ground', { scale: 0.25, tint: 0x2a221c, dirt: 0, rough: 0.9, id: 'embers',
      emissive: color(1.0, 0.28, 0.05).mul(flick(ember, 6).pow(2)).mul(1.6) }),
    charcoal: pmat('rock_ground', { scale: 0.25, tint: 0x1d1b1a, dirt: 0, rough: 0.85 }),
  };
}
