// A camp tea kettle (чаанньык) of the late 1800s: a trade kettle of tinned sheet iron, ~2.5 l. The body is rolled
// from one sheet, its upright seam riveted, the bottom folded on in a bead; a shoulder bead, a rolled neck; a tapered
// spout riveted on low; two riveted ears at the shoulder carry a wire bail with a wooden grip; a domed lid with a turned
// knob. Soot black from the fire up the lower body, brown where it thins, dented from the road. Built into a yard
// Bucket at `m` (origin = the middle of its base, spout towards +X); no rng draws.
import * as THREE from 'three/webgpu';
import { lathe } from './kit.js';
import { valueNoise } from '../../util.js';

const TAU = Math.PI * 2;
// the body's profile: bottom, base bead, wall, shoulder bead, shoulder, rolled neck (r, y)
const BODY = [[0, 0.003], [0.084, 0.0012], [0.091, 0.0015], [0.0965, 0.0045], [0.0975, 0.009], [0.0955, 0.0125], [0.0975, 0.016],
  [0.0975, 0.03], [0.0965, 0.06], [0.0955, 0.09], [0.0945, 0.102], [0.0965, 0.1055], [0.094, 0.109], [0.088, 0.117], [0.078, 0.127],
  [0.067, 0.135], [0.06, 0.141], [0.058, 0.146], [0.06, 0.1495], [0.0585, 0.153], [0.0545, 0.1515], [0.0525, 0.14]];
const SEAM_A = Math.PI; // the riveted seam at the back, opposite the spout
// the body's radius at height y (from the profile's wall rows)
const rAt = (y) => { for (let i = 7; i < BODY.length - 1; i++) { const [r0, y0] = BODY[i], [r1, y1] = BODY[i + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.095; };
// dents: [angle, y, radius (m), depth (m)]
const DENTS = [[0.9, 0.06, 0.03, 0.006], [3.9, 0.085, 0.025, 0.0045], [5.2, 0.035, 0.022, 0.004], [2.2, 0.118, 0.018, 0.003]];

// soot by height: black at the base, thinning in tongues up the wall (vertex colour × the iron's tint)
const soot = (a, y) => {
  const edge = 0.06 + 0.03 * valueNoise(Math.cos(a) * 3 + 5, Math.sin(a) * 3, 61) + 0.012 * valueNoise(a * 9, 2, 62);
  const k = Math.min(1, Math.max(0, (y - edge + 0.02) / 0.05));
  return 0.2 + 0.8 * k * k;
};
const paint = (g, fn) => {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = v * 1.02; c[i * 3 + 1] = v; c[i * 3 + 2] = v * 0.97; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
};
const sootAt = (x, y, z) => soot(Math.atan2(-z, x), y);

// a tube whose radius runs from r0 to r1 along points (open ends)
function taper(points, r0, r1, radial = 10, n = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const F = curve.computeFrenetFrames(n, false), pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = curve.getPointAt(t), r = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, N = F.normals[i], B = F.binormals[i];
      pos.push(o.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, o.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, o.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r);
      uv.push(j / radial * TAU * r0, t * curve.getLength());
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return { g, curve, F };
}
// a ring (torus) of radius R, section r, square to the unit axis `d` at `c`
function ring(c, d, R, r, seg = 14, side = 5) {
  const g = new THREE.TorusGeometry(R, r, side, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...d).normalize()), new THREE.Vector3(1, 1, 1)));
  return g;
}
// a rivet head on the body's wall at angle a, height y
const rivet = (a, y, out = 0.0007) => {
  const r = rAt(y) + out, g = new THREE.SphereGeometry(0.0034, 6, 3, 0, TAU, 0, Math.PI / 2).scale(1, 0.55, 1);
  g.rotateZ(-Math.PI / 2); g.rotateY(a); g.translate(Math.cos(a) * r, y, -Math.sin(a) * r);
  return g;
};

export function kettle(T, B, M, m) {
  const add = (g, mat, tint) => { g.applyMatrix4(m); return B.add(g, mat, null, tint); };
  // ── body, dented, sooted
  const body = lathe(BODY, 36);
  { const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
      if (r < 0.05 || y < 0.012) continue;
      const a = Math.atan2(-z, x);
      let k = 1;
      for (const [da, dy, dr, dd] of DENTS) { const s = Math.atan2(Math.sin(a - da), Math.cos(a - da)) * r, q = (s * s + (y - dy) ** 2) / (dr * dr); if (q < 1) k -= dd / r * (1 - q) ** 2; }
      p.setXYZ(i, x * k, y, z * k);
    }
    body.computeVertexNormals(); }
  add(paint(body, sootAt), M.tin, [0.95, 0.92, 0.88]);
  // ── the seam: an overlap strip up the back, riveted
  { const strip = [], n = 8;
    for (let i = 0; i <= n; i++) { const y = 0.018 + (0.098 - 0.018) * i / n; strip.push([y, rAt(y) + 0.0007]); }
    const pos = [], idx = [], w = 0.0085;
    strip.forEach(([y, r], i) => { for (const s of [-1, 1]) { const a = SEAM_A + s * w / r; pos.push(Math.cos(a) * r, y, -Math.sin(a) * r); } if (i) { const b = (i - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
    add(paint(g, sootAt), M.tin, [0.9, 0.87, 0.83]);
    for (let i = 0; i < 6; i++) { const y = 0.024 + i * 0.0145; add(paint(rivet(SEAM_A, y, 0.0012), sootAt), M.tin, [0.85, 0.82, 0.78]); }
  }
  // ── the spout: from low on the front, tapering up and out, a rolled lip; a riveted collar where it joins
  { const pts = [[0.088, 0.045, 0], [0.122, 0.07, 0], [0.152, 0.104, 0], [0.172, 0.138, 0], [0.183, 0.158, 0]];
    const { g, curve } = taper(pts, 0.017, 0.0075, 10, 14);
    add(paint(g, sootAt), M.tin, [0.95, 0.92, 0.88]);
    const tip = curve.getPointAt(1), d = curve.getTangentAt(1);
    add(paint(ring(tip.toArray(), d.toArray(), 0.0075, 0.0018, 12, 4), sootAt), M.tin, [0.9, 0.87, 0.83]);
    const base = curve.getPointAt(0.06), d0 = curve.getTangentAt(0.06);
    add(paint(ring(base.toArray(), d0.toArray(), 0.0185, 0.003, 14, 4), sootAt), M.tin, [0.9, 0.87, 0.83]);
    for (const s of [-1, 1]) add(paint(rivet(s * 0.19, 0.047), sootAt), M.tin, [0.85, 0.82, 0.78]);
    // the spout's mouth inside: dark
    const cap = new THREE.CircleGeometry(0.0062, 10);
    cap.applyMatrix4(new THREE.Matrix4().compose(tip.clone().addScaledVector(d, -0.004), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d), new THREE.Vector3(1, 1, 1)));
    add(paint(cap, () => 0.1), M.tin);
  }
  // ── ears at the shoulder (±Z) and the wire bail standing up between them, a wooden grip on it
  const EAR_Y = 0.112;
  for (const s of [-1, 1]) {
    const a = s * Math.PI / 2, r = rAt(0.098) + 0.002;
    const plate = new THREE.BoxGeometry(0.018, 0.024, 0.003);
    plate.translate(0, 0.008, 0); plate.rotateX(s * 0.12); plate.rotateY(a); plate.translate(0, EAR_Y - 0.01, -s * r);
    add(paint(plate, sootAt), M.tin, [0.85, 0.82, 0.78]);
    add(paint(rivet(a, 0.1, 0.003), sootAt), M.tin, [0.8, 0.77, 0.74]);
    add(ring([0, EAR_Y + 0.011, -s * (r + 0.004)], [1, 0, 0], 0.0055, 0.0016, 10, 4), M.iron, [0.75, 0.72, 0.68]);
  }
  { const bail = [], zr = rAt(0.098) + 0.006, top = 0.236;
    for (let k = 0; k <= 16; k++) { const t = k / 16, a = Math.PI * t; bail.push(new THREE.Vector3(0, EAR_Y + 0.011 + (top - EAR_Y - 0.011) * Math.sin(a) ** 0.8, zr * Math.cos(a))); }
    const curve = new THREE.CatmullRomCurve3(bail), g = new THREE.TubeGeometry(curve, 24, 0.0022, 5, false);
    add(g, M.iron, [0.6, 0.58, 0.55]);
    // the grip: a short turned birch spool on the wire
    const grip = lathe([[0.0024, -0.03], [0.0075, -0.029], [0.0085, -0.02], [0.009, 0], [0.0085, 0.02], [0.0075, 0.029], [0.0024, 0.03]], 10);
    grip.rotateX(Math.PI / 2); grip.translate(0, top - 0.0005, 0);
    add(grip, M.darkwood, [0.85, 0.8, 0.72]);
  }
  // ── the lid: a low dome with a skirt into the neck, a turned knob riveted on
  { const lid = lathe([[0.0, 0.0335], [0.012, 0.032], [0.028, 0.026], [0.042, 0.016], [0.053, 0.0075], [0.0595, 0.003], [0.06, 0.0005], [0.0545, 0.0002], [0.051, -0.008]].reverse(), 28); // from the skirt in: faces out
    lid.translate(0, 0.152, 0);
    add(paint(lid, () => 0.8), M.tin, [0.95, 0.92, 0.88]);
    const knob = lathe([[0.0, 0.0545], [0.008, 0.053], [0.0115, 0.048], [0.011, 0.043], [0.0065, 0.039], [0.0055, 0.033]].reverse(), 14);
    knob.translate(0, 0.152, 0);
    add(knob, M.darkwood, [0.7, 0.62, 0.55]);
  }
}
