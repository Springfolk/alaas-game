// An offering to the fire is put, never thrown (a bad omen): the path of the pinch (src/models/urasa.js, balagan.js).
import { ease, clamp, angleDiff } from '../../util.js';

// `offerFrom`: where it starts (world): low, 0.3 m over the hearth `to` (world), just under the bottom edge of the view
// on the way from the player; `offerPath`: k 0..1 → `out`, slowly forward and down onto the hearth, never rising,
// slowing as it is set down. `offerTime`: its length, s.
// `open`: a hearth with a mouth, { a: its bearing atan2(z, x), half: rad }: the path comes in through the mouth.
export function offerFrom(cam, to, out, open = null) {
  const e = cam.matrixWorld.elements, pitch = Math.asin(clamp(-e[9], -1, 1)), b = (cam.fov * Math.PI) / 360 - pitch; // the view's bottom edge, rad below level
  const y = to.y + 0.3, dx = cam.position.x - to.x, dz = cam.position.z - to.z, d = Math.hypot(dx, dz) || 1;
  const s = b > 1.45 ? 0.2 : (0.85 * Math.max(0, cam.position.y - y)) / Math.tan(b); // nearer than this it is out of view
  const r = clamp(d - s, Math.min(0.3, d), Math.max(0.3, d - 0.2));
  let a = Math.atan2(dz, dx);
  if (open) { const o = angleDiff(open.a, a); if (Math.abs(o) > open.half) a = open.a + Math.sign(o) * open.half; }
  out.x = to.x + Math.cos(a) * r; out.z = to.z + Math.sin(a) * r; out.y = y;
  return out;
}
export function offerPath(from, to, k, out) {
  const h = ease(Math.min(1, k / 0.8)), v = Math.min(1, k / 0.9), d = 1 - (1 - v) * (1 - v) * (1 - v);
  out.x = from.x + (to.x - from.x) * h; out.z = from.z + (to.z - from.z) * h;
  out.y = from.y + (to.y - from.y) * (0.5 * h + 0.5 * d);
  return out;
}
export const offerTime = (from, to) => 2.4 + 1.0 * Math.hypot(to.x - from.x, to.z - from.z);
