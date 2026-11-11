// The player's own hands and forearms, shown on what is carried or worked with (logic: src/interact/arms.js).
// A hand is built closed round a handle of radius `r` in its grip frame: the handle runs along +Y through the
// origin (thumb and forefinger towards +Y), the palm lies on the +X side (a right hand; a left one is mirrored
// in X), the fingers go round the far side (−Z) and the wrist leaves towards +Z. The forearm is a mesh of
// its own: a sleeve from the wrist (origin) along +Z, turned towards the elbow every frame.
import { Bucket, boxUV } from '../yardlife/kit.js';

// vertex tones (they multiply the skin texture and tint)
const SKIN = [1, 1, 1], PALM = [1.05, 0.97, 0.95], NAIL = [1.1, 1.0, 0.97], CREASE = [0.78, 0.68, 0.64], DEEP = [0.7, 0.6, 0.56];
export const WRIST = (r) => [r + 0.023, 0.002, 0.1]; // where the forearm joins, in the grip frame
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const bump = (t, at, w) => Math.exp(-(((t - at) / w) ** 2));

// a finger: a tube along `pts` with radius rad(t), rounded tip, open root. Its frame is fixed by the handle's axis
// (Y): `out` = away from the handle, `side` = along it, so col(t, out, side) can place the nail, creases and shade.
function finger(T, pts, rad, col, seg = 10, N = 20) {
  const curve = new T.CatmullRomCurve3(pts.map((p) => new T.Vector3(...p)));
  const pos = [], cl = [], idx = [];
  const P = new T.Vector3(), tg = new T.Vector3(), b = new T.Vector3(), n = new T.Vector3();
  const frame = (t) => {
    curve.getPointAt(t, P); curve.getTangentAt(t, tg);
    b.set(0, 1, 0).addScaledVector(tg, -tg.y);
    if (b.lengthSq() < 1e-6) b.set(0, 0, 1).addScaledVector(tg, -tg.z);
    b.normalize(); n.crossVectors(b, tg);
  };
  frame(0.6); const sgn = n.x * P.x + n.z * P.z < 0 ? -1 : 1; // which way is away from the handle
  for (let i = 0; i <= N; i++) {
    const t = i / N; frame(t); n.multiplyScalar(sgn);
    // the tip closes over the last rings as a dome
    const tipK = t > 0.9 ? Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2)) : 1, r = rad(t) * Math.max(0.04, tipK);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      // a nail lies flat: the back of the last joint is pressed in a little
      const flat = t > 0.8 && ca > 0.5 ? 0.86 : 1;
      pos.push(P.x + (n.x * ca * flat + b.x * sa) * r, P.y + (n.y * ca * flat + b.y * sa) * r, P.z + (n.z * ca * flat + b.z * sa) * r);
      cl.push(...col(t, ca, sa));
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < seg; j++) {
    const a = i * seg + j, c = i * seg + (j + 1) % seg, d = a + seg, e = c + seg;
    idx.push(a, c, d, c, e, d);
  }
  return finish(T, pos, cl, idx);
}
function finish(T, pos, cl, idx) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(cl, 3));
  // the winding may run either way round a path: turn it so the faces look outwards (signed volume > 0)
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) + pos[a + 1] * (pos[b + 2] * pos[c] - pos[b] * pos[c + 2]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// skin of a finger: nail on the back of the tip, creases at the joints, shade between the fingers
const fingerSkin = (j1, j2, nail = 0.8) => (t, out, side) => {
  if (t > nail && t < 0.975 && out > 0.5) return t < nail + 0.03 ? mix(NAIL, CREASE, 0.5) : NAIL;
  let c = out < -0.2 ? mix(SKIN, PALM, Math.min(1, (-out - 0.2) * 2)) : SKIN;
  const cr = Math.max(bump(t, j1, 0.018), bump(t, j2, 0.016)) * (0.55 + 0.45 * Math.abs(out));
  c = mix(c, CREASE, cr * 0.8);
  c = mix(c, DEEP, Math.max(0, Math.abs(side) - 0.55) * 1.1); // against its neighbours
  if (t < 0.12) c = mix(c, DEEP, (0.12 - t) * 3); // where it leaves the hand
  return c;
};

// the palm: rounded sections lofted from the wrist to the knuckles. Section: [z, width (Y), thickness (X), yMid, xIn]
function palm(T, r, seg = 20) {
  const S = [
    [0.108, 0.05, 0.034, 0.002, 0.006], [0.094, 0.056, 0.038, 0.002, 0.005], [0.076, 0.07, 0.042, 0.003, 0.003],
    [0.056, 0.082, 0.041, 0.004, 0.001], [0.034, 0.087, 0.036, 0.004, 0.0], [0.014, 0.087, 0.03, 0.003, 0.0],
    [-0.002, 0.085, 0.026, 0.003, 0.001], [-0.013, 0.08, 0.02, 0.003, 0.003], [-0.02, 0.07, 0.011, 0.003, 0.006], [-0.022, 0.05, 0.002, 0.003, 0.01],
  ];
  const pos = [], cl = [], idx = [], E = 2 / 2.7;
  S.forEach(([z, w, h, y0, xin], i) => {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const u = Math.sign(ca) * Math.abs(ca) ** E, v = Math.sign(sa) * Math.abs(sa) ** E; // a rounded rectangle
      // the back of the hand is domed, the hollow of the palm lies on the handle
      const x = r + xin + h * 0.5 + v * h * 0.5 * (v > 0 ? 1 + 0.12 * (1 - u * u) : 1);
      pos.push(x, y0 + u * w * 0.5, z);
      // tendons and knuckle dips on the back, a paler palm, shade towards the fingers' roots
      let c = v < -0.2 ? PALM : SKIN;
      if (v > 0.5 && z < 0.06 && z > -0.005) c = mix(c, CREASE, 0.28 * Math.max(0, Math.cos(u * 0.5 * 0.087 / 0.0195 * Math.PI * 2 + 0.6)) * (1 - z / 0.06));
      cl.push(...c);
    }
    if (i) for (let j = 0; j < seg; j++) { const a = (i - 1) * seg + j, c = (i - 1) * seg + (j + 1) % seg, d = a + seg, e = c + seg; idx.push(a, d, c, c, d, e); }
  });
  return finish(T, pos, cl, idx);
}

// One hand closed round a handle of radius r. `side`: 1 right, −1 left. → Group (meshes cast no shadow).
export function buildHand(T, M, r, side) {
  const B = new Bucket(() => -1), g = new T.Group(), parts = [];
  const FR = [0.0096, 0.0099, 0.0093, 0.0082], FL = [0.076, 0.085, 0.079, 0.062], FY = [0.0325, 0.0125, -0.0072, -0.0255];
  const kx = r + 0.015, kz = -0.012; // the knuckle line
  for (let f = 0; f < 4; f++) {
    const R = r + FR[f] * 0.98, a0 = Math.atan2(kz, kx), wrap = Math.min(3.5, FL[f] / R), pts = [[kx + 0.003, FY[f], kz + 0.02]];
    for (let k = 0; k <= 9; k++) { const a = a0 - wrap * (k / 9); pts.push([Math.cos(a) * R * (1 + 0.14 * (k === 0)), FY[f] - 0.0015 * (k / 9), Math.sin(a) * R]); }
    parts.push(finger(T, pts, (t) => FR[f] * (1 - 0.2 * t) * (1 + 0.16 * bump(t, 0.07, 0.06) + 0.08 * bump(t, 0.4, 0.05) + 0.07 * bump(t, 0.7, 0.045)), fingerSkin(0.4, 0.7)));
  }
  // the thumb: out of the ball of the thumb, over the near side of the handle, lying above the forefinger
  {
    const R = r + 0.0115, a0 = 0.5, wrap = Math.min(2.3, 0.056 / R), pts = [[r + 0.026, 0.012, 0.084], [r + 0.03, 0.034, 0.062], [r + 0.026, 0.05, 0.04]];
    for (let k = 0; k <= 6; k++) { const a = a0 + wrap * (k / 6); pts.push([Math.cos(a) * R, 0.055 + 0.004 * (k / 6), Math.sin(a) * R]); }
    parts.push(finger(T, pts, (t) => (t < 0.4 ? 0.0205 - (0.0205 - 0.0128) * (t / 0.4) ** 0.8 : 0.0128 * (1 - 0.2 * (t - 0.4) / 0.6)) * (1 + 0.07 * bump(t, 0.68, 0.05)),
      (t, out, sd) => (t < 0.3 ? (out < -0.2 ? PALM : SKIN) : fingerSkin(0.46, 0.68, 0.82)(t, out, sd)), 12, 22));
  }
  parts.push(palm(T, r));
  for (const q of parts) { if (side < 0) mirror(q); B.add(boxUV(q, 1), M.skin); }
  for (const m of B.build(g)) m.castShadow = false;
  const [wx, wy, wz] = WRIST(r);
  g.userData.wrist = new T.Vector3(side * wx, wy, wz);
  return g;
}
// a left hand from a right one (indexed geometry)
function mirror(g) {
  const p = g.attributes.position, ix = g.index.array;
  for (let i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  g.computeVertexNormals();
}

// The forearm: from the wrist (origin) along +Z, far past the elbow (the view never shows its end). A hand's
// width of bare wrist, then a cloth sleeve with a turned-back cuff, soft folds and a seam, widening to the elbow.
export const ARM_LEN = 2.6;
export function buildForearm(T, M) {
  const B = new Bucket(() => -1), g = new T.Group();
  const ring = (prof, seg, squash, rad, col) => {
    const pos = [], cl = [], idx = [];
    prof.forEach(([z, r0], i) => {
      for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2, rr = rad ? rad(z, a, r0) : r0; pos.push(Math.cos(a) * rr * squash, Math.sin(a) * rr, z); cl.push(...(col ? col(z, a) : SKIN)); }
      if (i) for (let j = 0; j < seg; j++) { const a = (i - 1) * seg + j, b = (i - 1) * seg + (j + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
    });
    return boxUV(finish(T, pos, cl, idx), 1);
  };
  // the wrist: rounded where it meets the hand, the knob of the ulna, tendons on the inside
  B.add(ring([[-0.03, 0.003], [-0.027, 0.012], [-0.02, 0.02], [-0.008, 0.0245], [0.004, 0.0255], [0.02, 0.0265], [0.045, 0.0285]], 16, 0.8,
    (z, a, r0) => r0 * (1 + 0.07 * bump(z, 0.012, 0.012) * Math.max(0, Math.cos(a - 2.5))), (z, a) => mix(SKIN, CREASE, 0.5 * bump(z, -0.004, 0.006) * Math.max(0, Math.sin(a)))), M.skin);
  // the sleeve: fold(z, a) is the depth of the cloth's folds, crowded above the cuff and loose towards the elbow
  const fold = (z, a) => {
    const k = Math.exp(-(z - 0.05) * 5.5) * 0.9 + 0.35;
    return k * (0.55 * Math.sin(z * 68 + 2.2 * Math.sin(a + 0.4) + 0.8 * Math.sin(z * 9)) + 0.45 * Math.sin(z * 31 - 1.6 * Math.cos(a * 2 + z * 3)));
  };
  const cuffEnd = 0.05, sl = [[0.016, 0.029], [0.018, 0.0335], [0.023, 0.0355], [0.032, 0.036], [0.042, 0.0355], [0.048, 0.0345], [cuffEnd, 0.0335]];
  const N = 96;
  for (let i = 1; i <= N; i++) { const t = (i / N) ** 1.7, z = cuffEnd + t * (ARM_LEN - cuffEnd); sl.push([z, 0.0335 + Math.min(1, (z - cuffEnd) / 0.3) ** 0.7 * 0.0145 + Math.min(1, z / 1.2) * 0.006]); }
  const DYE = [1, 1, 1], SHADE = [0.62, 0.64, 0.7], EDGE = [0.78, 0.8, 0.84];
  B.add(ring(sl, 22, 0.88,
    (z, a, r0) => (z <= cuffEnd ? r0 : r0 + 0.0028 * fold(z, a) * Math.min(1, (z - cuffEnd) / 0.02) - 0.0012 * bump(a, 4.7, 0.09)),
    (z, a) => {
      if (z <= cuffEnd) return z < 0.02 ? SHADE : EDGE; // the cuff
      let c = mix(DYE, SHADE, Math.max(0, -fold(z, a)) * 0.75);
      if (z < cuffEnd + 0.012) c = mix(c, SHADE, 0.7); // under the cuff's edge
      return mix(c, SHADE, 0.8 * bump(a, 4.7, 0.07)); // the seam along the underside
    }), M.sleeve);
  for (const m of B.build(g)) m.castShadow = false;
  return g;
}
