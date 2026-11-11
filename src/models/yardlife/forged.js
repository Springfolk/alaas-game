// Forged iron shapes for the smith's tools (smithy.js): flat-shaded bars and blocks with the marks of the work
// in their vertex colours (bright where struck or held, scale-dark elsewhere). No random draws: dents come from
// a hash of the position, so the yard's shared rng stream is untouched.
import * as THREE from 'three/webgpu';

const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const finish = (pos, uv, col) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); // non-indexed: every face flat, edges crisp
  return g;
};

// A bar of rectangular section through stations [x, y, z, w, t, tone?] (w across `side`, t across the other
// way; tone multiplies the colour there), capped at both ends.
export function barGeo(st, side = [0, 0, 1]) {
  const S = new THREE.Vector3(...side), T = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
  const rings = st.map((s, i) => {
    const a = st[Math.max(0, i - 1)], b = st[Math.min(st.length - 1, i + 1)];
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    U.copy(S).addScaledVector(T, -S.dot(T)).normalize(); V.crossVectors(T, U);
    return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([u, v]) => [s[0] + U.x * u * s[3] / 2 + V.x * v * s[4] / 2, s[1] + U.y * u * s[3] / 2 + V.y * v * s[4] / 2, s[2] + U.z * u * s[3] / 2 + V.z * v * s[4] / 2]);
  });
  const pos = [], uv = [], col = [];
  const quad = (a, b, c, d, ta, tb, u0, u1) => {
    for (const [p, t, u, v] of [[a, ta, u0, 0], [b, ta, u0, 1], [c, tb, u1, 1], [a, ta, u0, 0], [c, tb, u1, 1], [d, tb, u1, 0]]) {
      const k = t * (0.9 + 0.2 * hash(p[0] * 90, p[1] * 90, p[2] * 90)); // scale and wear: uneven
      pos.push(...p); uv.push(u, v * 0.02); col.push(k, k, k * 1.03);
    }
  };
  let d = 0;
  for (let i = 0; i < st.length - 1; i++) {
    const A = rings[i], B = rings[i + 1], ta = st[i][5] ?? 1, tb = st[i + 1][5] ?? 1;
    const len = Math.hypot(st[i + 1][0] - st[i][0], st[i + 1][1] - st[i][1], st[i + 1][2] - st[i][2]);
    for (let k = 0; k < 4; k++) quad(A[k], A[(k + 1) % 4], B[(k + 1) % 4], B[k], ta, tb, d, d + len);
    d += len;
  }
  const A = rings[0], B = rings[rings.length - 1], t0 = st[0][5] ?? 1, t1 = st[st.length - 1][5] ?? 1;
  quad(A[3], A[2], A[1], A[0], t0, t0, 0, 0.01); quad(B[0], B[1], B[2], B[3], t1, t1, 0, 0.01);
  return finish(pos, uv, col);
}

// A forged block w × h × d, base at y = 0 (or `centred`): `shape(u, v, w)` (each −1…1: across, up, along) returns the scale
// [sx, sy, sz] of that point and its tone; corners are rounded off and the faces carry shallow dents.
export function blockGeo(w, h, d, shape, { seg = 4, round = 6, dent = 0.0007, centred = false } = {}) {
  const src = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg).toNonIndexed(), p = src.attributes.position;
  const pos = [], uv = [], col = [];
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i), z = p.getZ(i);
    const [sx, sy, sz, tone] = shape(u, v, z);
    const r = 1 / Math.max(1, (Math.abs(u) ** round + Math.abs(z) ** round) ** (1 / round) * 0.94); // the upright edges rounded
    const edge = (Math.abs(u) > 0.999) + (Math.abs(v) > 0.999) + (Math.abs(z) > 0.999) > 1; // shared by two faces: left where it is
    const n = edge ? 0 : (hash(u * 7.3, v * 5.1, z * 9.7) - 0.5) * 2 * dent;
    const x = u * r * sx * w / 2, y = (centred ? v / 2 : (v + 1) / 2) * h * sy, zz = z * r * sz * d / 2;
    const face = Math.abs(u) > 0.999 ? 0 : Math.abs(z) > 0.999 ? 2 : 1; // which way the face looks
    pos.push(x + (face === 0 ? Math.sign(u) * n : 0), y + (face === 1 ? Math.sign(v) * n : 0), zz + (face === 2 ? Math.sign(z) * n : 0));
    uv.push(face === 0 ? zz : x, face === 1 ? zz : y);
    const k = tone * (0.88 + 0.24 * hash(u * 3.1, v * 4.7, z * 2.9));
    col.push(k, k, k * 1.03);
  }
  return finish(pos, uv, col);
}

// The anvil (кыстык): a small block narrowing to the tang driven into the stump, its face polished by the work
// and spread a little over the edges, its sides dark with scale. Base at y = 0, face at y = h.
export function anvilGeo(w = 0.12, h = 0.1, d = 0.085) {
  return blockGeo(w, h, d, (u, v) => {
    const taper = 0.72 + 0.28 * Math.min(1, (v + 1) / 1.2);            // narrower towards the stump
    const lip = v > 0.4 ? 1 + 0.07 * ((v - 0.4) / 0.6) ** 2 : 1;       // the struck face spreads
    const tone = v > 0.999 ? 2.3 : v > 0.4 ? 1.1 + 0.9 * ((v - 0.4) / 0.6) ** 3 : 0.75 + 0.2 * (v + 1) / 2;
    return [taper * lip, 1, taper * lip, tone];
  }, { seg: 5 });
}

// A hammer head along X, centred on its eye (the haft runs along Y): a flat face at +X, the other end drawn to a
// cross peen (`peen`) or a second face. Bright at the faces, dark round the eye.
export function hammerHeadGeo(len, thick, peen = true) {
  return blockGeo(len, thick, thick, (u) => {
    const eye = 1 + 0.16 * Math.exp(-((u / 0.3) ** 2));                 // swollen round the eye
    const face = Math.abs(u) > 0.7 ? 1 + 0.05 * ((Math.abs(u) - 0.7) / 0.3) ** 2 : 1; // faces spread by the work
    const wedge = peen && u < -0.3 ? 1 - 0.78 * ((-u - 0.3) / 0.7) ** 1.2 : 1;        // the peen: thin up and down
    const end = Math.max(0, (Math.abs(u) - 0.75) / 0.25);
    return [1, eye * (u < -0.3 && peen ? wedge : face), eye * (peen && u < -0.3 ? 1 : face), 0.8 + 1.3 * end ** 2];
  }, { seg: 6, dent: 0.0004, centred: true });
}

// Tongs (кытаҕас) closed, along +Y from the jaw tips (y = 0) to the rein ends: two flat halves crossing at the
// rivet, jaws scale-black, reins worn bright where they are held. The reins spread along X.
export function tongsGeo(len = 0.62) {
  const J = len * 0.18, out = [];
  for (const s of [-1, 1]) {
    out.push(barGeo([
      [s * 0.0035, 0, 0, 0.005, 0.017, 0.45], [s * 0.0085, J * 0.45, 0, 0.006, 0.018, 0.5], [s * 0.004, J * 0.86, s * 0.002, 0.008, 0.016, 0.6],
      [0, J, s * 0.0035, 0.012, 0.007, 0.7], [-s * 0.007, J * 1.3, s * 0.002, 0.009, 0.008, 0.8],
      [-s * 0.013, len * 0.5, 0, 0.0095, 0.0095, 1.0], [-s * 0.02, len * 0.8, 0, 0.009, 0.009, 1.5], [-s * 0.024, len, 0, 0.0085, 0.0085, 1.6],
    ], [1, 0, 0]));
  }
  const rivet = new THREE.CylinderGeometry(0.0055, 0.0055, 0.018, 7).rotateX(Math.PI / 2).translate(0, J, 0).toNonIndexed();
  rivet.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rivet.attributes.position.count * 3).fill(1.2), 3));
  return [...out, rivet];
}

// A file (игии): a flat bar tapering to its point, the tang at y = 0 (the handle is the caller's).
export function fileGeo(len = 0.28) {
  return barGeo([[0, 0, 0, 0.005, 0.003, 0.8], [0, 0.045, 0, 0.007, 0.004, 0.8], [0, 0.06, 0, 0.02, 0.005, 1.3], [0, len * 0.8, 0, 0.018, 0.0045, 1.5], [0, len, 0, 0.009, 0.003, 1.4]], [1, 0, 0]);
}

// A tool's haft along +Y from y = 0: a little oval, swelling towards the free end; the wood's grain runs along
// it (uv.x = metres along).
export function haftGeo(len, r0, r1 = r0, seg = 7) {
  const g = new THREE.CylinderGeometry(1, 1, len, seg, 4).translate(0, len / 2, 0), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len, r = (r0 + (r1 - r0) * t) * (1 + 0.12 * t ** 4), a = uv.getX(i);
    p.setX(i, p.getX(i) * r * 1.12); p.setZ(i, p.getZ(i) * r * 0.9);
    uv.setXY(i, p.getY(i), a * 0.05);
  }
  g.computeVertexNormals();
  return g;
}

// Turns a log's uvs so the wood's grain runs along it (a plank texture round a thin haft reads as bamboo rings).
export const grainAlong = (g) => { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getY(i), u.getX(i)); return g; };
