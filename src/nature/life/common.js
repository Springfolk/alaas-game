// Shared bits for the living-world layers (birds, insects, motes, lake ripples).
import * as THREE from 'three/webgpu';
import { uniform, float, floor, abs, max, smoothstep, pow } from 'three/tsl';

// sRGB hex → linear [r, g, b]
export const linRGB = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// How much life the device can afford: 'high' | 'medium' | 'low' (engine.tier, mobile → low; else quality).
export function lifeTier(engine) {
  const t = engine?.tier ?? engine?.opts?.quality ?? 'medium';
  return t === 'mobile' ? 'low' : ['high', 'medium', 'low'].includes(t) ? t : 'medium';
}

// Per-frame uniforms every life layer reads: time (and the previous frame's, for motion vectors),
// and the angle one screen pixel spans (sub-pixel things are drawn at ≥1.5 px with their energy kept).
export function lifeClock(world) {
  if (world._lifeClock) return world._lifeClock;
  const k = { time: uniform(0), prev: uniform(0), pxAngle: uniform(0.002) };
  let last = 0;
  world.updaters.push((dt, { time, camera }) => {
    k.prev.value = last; k.time.value = time; last = time;
    const h = world.engine.renderer?.domElement?.height || 720;
    k.pxAngle.value = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
  });
  world._lifeClock = k;
  return k;
}

// TSL: wrap a world lattice point (home, box size B) to the copy nearest the camera; returns
// { xz, fade } with fade → 0 near the box edge so the jump to the far side is never seen.
export function wrapNear(home, cam, B) {
  const d = home.sub(cam).div(B);
  const xz = home.sub(floor(d.add(0.5)).mul(B));
  const off = abs(xz.sub(cam)).div(B);
  const fade = float(1).sub(smoothstep(0.36, 0.5, max(off.x, off.y)));
  return { xz, fade };
}

// TSL: Henyey–Greenstein phase (normalised to 1 at g = 0) for light scattered towards the eye.
export function phaseHG(cosT, g) {
  const g2 = g * g;
  return float(1 - g2).div(pow(float(1 + g2).sub(cosT.mul(2 * g)), 1.5));
}
