// Seeded randomness, value noise and small math helpers.

// rngs.list: while set (src/load/geocache.js, during a build), each new stream joins it, so baked sections
// can restore the streams' states; rng.state() reads, rng.state(s) sets.
export const rngs = { list: null };
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = (s) => (s === undefined ? a : (a = s >>> 0));
  rngs.list?.push(next);
  return next;
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// smoothstep of t in 0..1
export const ease = (t) => t * t * (3 - 2 * t);

// An offering to the fire is put, never thrown (a bad omen). `offerFrom`: where it starts (world): low, 0.3 m over the
// hearth `to` (world), just under the bottom edge of the view on the way from the player; `offerPath`: k 0..1 → `out`,
// slowly forward and down onto the hearth, never rising, slowing as it is set down. `offerTime`: its length, s.
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

export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = ease(xf), v = ease(yf);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

export function fbm(x, y, seed = 0, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, y * f, seed + i * 17) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const rand = (a, b) => a + Math.random() * (b - a); // unseeded, for runtime variety
export const deg = (d) => (d * Math.PI) / 180;
// A URL query switch (?name); false where there is no location (workers, node tools).
export const urlFlag = (name) => typeof location !== 'undefined' && new URLSearchParams(location.search).has(name);
// ?keyart (tools/key-art.mjs): one still at full quality — high tier maxed, no LOD/impostors/culling, fixed resolution
export const KEYART = urlFlag('keyart');

// Forward/right on the XZ plane for a yaw (camera convention: yaw 0 looks down -Z).
export const fwdX = (yaw) => -Math.sin(yaw);
export const fwdZ = (yaw) => -Math.cos(yaw);
export const rightX = (yaw) => Math.cos(yaw);
export const rightZ = (yaw) => -Math.sin(yaw);
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
