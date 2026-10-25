// The frame: the bell profile, 12 carved posts, three hoops, 96 inner poles of three lengths (to the
// middle hoop, the top hoop and the lashed tie), 36 outer poles holding the second bark layer, the door frame.
// Size: a rich family's summer house, ~10 m across at the ground and ~11 m to the tie (see docs/models.md).
import * as THREE from 'three/webgpu';
import { TAU, tube, lathe, merge, beam, xf } from './geom.js';
import { valueNoise } from '../../util.js';

export const N_POST = 12, POST_H = 2.03, POLE_R = 0.048;
const HOOP_RT = 0.06; // lower hoop thickness

// Pole centreline profile (r, y) by arc length: leaning a little to the lower hoop, then a ~61° cone.
const CTRL = [[4.945, -0.2], [4.87, 0.7], [4.8, 1.45], [4.745, 2.08], [4.46, 2.97], [3.83, 4.15], [2.98, 5.67], [2.035, 7.33], [1.147, 8.96], [0.444, 10.35], [0, 11.09]];
let profile = null;
export function makeProfile() {
  if (profile) return profile;
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  const N = 1200, pts = curve.getSpacedPoints(N), L = curve.getLength();
  const at = (s) => {
    const f = Math.max(0, Math.min(N - 1e-6, (s / L) * N)), i = Math.floor(f), k = f - i;
    const a = pts[i], b = pts[Math.min(N, i + 1)];
    const r = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k;
    const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 2);
    let tr = pts[i1].x - pts[i0].x, ty = pts[i1].y - pts[i0].y;
    const l = Math.hypot(tr, ty); tr /= l; ty /= l;
    return { r, y, tr, ty, nr: ty, ny: -tr }; // outward normal
  };
  const sAt = (pred) => { for (let i = 0; i <= N; i++) if (pred(pts[i])) return (i / N) * L; return L; };
  const sAtY = (y) => sAt((p) => p.y >= y);
  profile = { L, at, sAtY, sAtR: (r) => sAt((p) => p.x <= r), rAtY: (y) => at(sAtY(y)).r };
  return profile;
}

const P0 = makeProfile();
export const APEX_Y = CTRL[CTRL.length - 1][1];
const R_HOOP = P0.rAtY(POST_H + 0.05);               // pole centreline where it rests on the lower hoop
export const R_POST = R_HOOP - POLE_R - HOOP_RT - 0.013;      // post centres: the hoop sits on them
// The door: half width, lintel underside, the plane radius at the ground and under the lintel (the wall leans in).
// The frame stands in the wall, centred 5 cm outside the pole line so it closes both bark layers.
export const DOOR = { hw: 0.5, h: 1.74 };
DOOR.r = P0.rAtY(0) + 0.05;
DOOR.rTop = P0.rAtY(DOOR.h + 0.06) + 0.05;
DOOR.rAt = (y) => P0.rAtY(Math.max(0, y)) + 0.05;
DOOR.cutY = DOOR.h + 0.07;                                    // the bark is cut away below this (inside the lintel)
DOOR.edge = DOOR.hw + 0.05;                                   // the cut edge, inside the jambs

// A point on the profile at azimuth a, pushed out by offset o along the normal.
// The cone is not perfectly round: a slow lumpy wobble above the hoop (posts and hoop keep the base true,
// so the poles sit on the hoop everywhere).
export function wob(a, y) {
  const k = 0.0012 + 0.012 * Math.min(1, Math.max(0, (y - 2.3) / 5));
  return 1 + k * (valueNoise(Math.cos(a) * 1.6 + 7, Math.sin(a) * 1.6 + y * 0.2, 77) + 0.5 * valueNoise(Math.cos(a) * 4 + 3, Math.sin(a) * 4 + y * 0.6, 78));
}
function onProf(P, s, a, o = 0) {
  const q = P.at(s);
  const r = (q.r + q.nr * o) * wob(a, q.y), y = q.y + q.ny * o;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

// Angular half-width of the door cut at radius r (the cut edge runs straight up inside the jambs).
export const doorHalfAngle = (r) => Math.asin(Math.min(0.99, DOOR.edge / r));

export function buildFrame(rng, P) {
  const G = { post: [], poleIn: [], poleOut: [], hair: [], timber: [] };
  const colliders = [];
  const sApex = P.L, apexDir = (() => { const q = P.at(P.L - 0.01); return { tr: q.tr, ty: q.ty }; })();
  const doorA = Math.asin((DOOR.hw + 0.13) / R_HOOP);         // poles inside this angle stand on the lintel
  const sLintel = P.sAtY(DOOR.h + 0.115);

  // ---- posts: hewn larch, 20–24 cm, carved bands on the inner face, a saddle for the hoop on top
  const postAngles = [];
  for (let k = 0; k < N_POST; k++) {
    const a = ((k + 0.5) / N_POST) * TAU + (rng() - 0.5) * 0.02;
    postAngles.push(a);
    const r0 = 0.1 + rng() * 0.012, top = POST_H + (rng() - 0.5) * 0.03, seed = k * 13.7;
    const prof = [];
    for (let i = 0; i <= 44; i++) {
      const y = -0.15 + (top + 0.15) * (i / 44);
      let r = r0 * (1.06 - 0.12 * (y / top));
      // turned rings framing the carved bands
      for (const yb of [0.84, 1.06, 1.5, 1.88]) r -= 0.006 * Math.exp(-(((y - yb) / 0.012) ** 2));
      prof.push([r, y]);
    }
    const g = lathe(prof, 14, (r, y, ang) => r * (1 + valueNoise(ang * 1.3 + seed, y * 2.2, 5) * 0.06 + valueNoise(ang * 4 + seed, y * 9, 6) * 0.015));
    // uv: x so that 0.5 faces the centre, y in metres
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), pos.getY(i));
    // rotate so local angle π (uv 0.5) points to the centre
    xf(g, { ry: -a, p: [Math.cos(a) * R_POST, 0, Math.sin(a) * R_POST] });
    G.post.push(g);
    colliders.push({ x: Math.cos(a) * R_POST, z: Math.sin(a) * R_POST, r: r0 + 0.02 });
  }

  // ---- hoops: the lower one of bent poles lashed on the post tops; middle and top ones tied inside the poles
  const hoopRing = (rc, y, rt, parts, seed) => {
    for (let k = 0; k < parts; k++) {
      const a0 = (k / parts) * TAU + seed, a1 = a0 + TAU / parts + 0.25;
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const a = a0 + (a1 - a0) * (i / 48), side = (k % 2 ? 1 : -1) * 0.012;
        const rr = rc + side + valueNoise(a * 3, seed, 9) * 0.008;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, y + valueNoise(a * 2, seed, 11) * 0.01 + (k % 2) * 0.01, Math.sin(a) * rr));
      }
      const g = tube(pts, (t) => rt * (1.1 - 0.25 * Math.abs(t - 0.5) * 2) * (t < 0.03 || t > 0.97 ? 0.85 : 1), 8, { capStart: true, capEnd: true });
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) + 10); // plain (uncarved)
      G.post.push(g);
      // lashing where the poles overlap
      const la = a1 - 0.12;
      for (const da of [-0.04, 0.04]) {
        const c = new THREE.Vector3(Math.cos(la + da) * rc, y, Math.sin(la + da) * rc);
        G.hair.push(xf(lathe([[rt + 0.012, -0.03], [rt + 0.016, 0], [rt + 0.012, 0.03]], 8), { r: [Math.PI / 2, -(la + da), 0], p: c.toArray() }));
      }
    }
  };
  const hoopY1 = POST_H + HOOP_RT;
  hoopRing(R_POST + 0.01, hoopY1, HOOP_RT, 5, 0.4);
  // the middle and top hoops sit inside the poles, touching them
  const midS = P.sAtY(5.5), topS = P.sAtY(8.5);
  const mid = P.at(midS), tp = P.at(topS);
  const RT_MID = 0.042, RT_TOP = 0.034;
  hoopRing(mid.r - (POLE_R + RT_MID) * mid.nr, mid.y - (POLE_R + RT_MID) * mid.ny, RT_MID, 3, 1.3);
  hoopRing(tp.r - (POLE_R * 0.8 + RT_TOP) * tp.nr, tp.y - (POLE_R * 0.8 + RT_TOP) * tp.ny, RT_TOP, 2, 2.1);
  // hoop lashed to each post top
  for (const a of postAngles) {
    const c = new THREE.Vector3(Math.cos(a) * R_POST, hoopY1, Math.sin(a) * R_POST);
    G.hair.push(xf(lathe([[0.066, -0.06], [0.075, 0], [0.066, 0.06]], 8, (r, y, an) => r * (1 + 0.25 * Math.abs(Math.sin(an)))), { r: [Math.PI / 2, -a, 0], s: [1, 1.2, 1], p: c.toArray() }));
  }

  // ---- poles. Inner: on the profile; outer: over the bark, they make the crown.
  // sEnd < sApex: a pole that stops just past a hoop (the old way: the poles reach the lower, middle and top hoops in turn)
  const polePath = (a, o, s0, sEnd, extra, lateral, wobble) => {
    const pts = [], n = Math.max(6, Math.ceil((sEnd - s0) / 0.42));
    const perp = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const toApex = sEnd >= sApex;
    for (let i = 0; i <= n; i++) {
      const s = s0 + (sEnd - s0) * (i / n);
      const v = onProf(P, s, a, toApex ? o * (1 - Math.max(0, (s - (sApex - 1.6)) / 1.6) * 0.85) : o);
      const k = toApex ? Math.max(0, Math.min(1, (s - (sApex - 1.8)) / 1.8)) : 0;
      v.addScaledVector(perp, lateral * k * k * (3 - 2 * k) + Math.sin(s * 1.1 + wobble) * 0.01);
      pts.push(v);
    }
    if (toApex) {
      // straight on past the apex
      const d = new THREE.Vector3(Math.cos(a) * apexDir.tr, apexDir.ty, Math.sin(a) * apexDir.tr).normalize();
      const last = pts[pts.length - 1];
      for (let i = 1; i <= 4; i++) pts.push(last.clone().addScaledVector(d, extra * (i / 4)));
    }
    return pts;
  };
  const NIN = 96;
  for (let k = 0; k < NIN; k++) {
    const a = (k / NIN) * TAU + (rng() - 0.5) * 0.02;
    const inDoor = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < doorA;
    const s0 = inDoor ? sLintel : 0;
    const kind = k % 3; // 0: to the tie, 1: to the top hoop, 2: to the middle hoop
    const sEnd = kind === 0 ? sApex : (kind === 1 ? topS : midS) + 0.35 + rng() * 0.25;
    const long = kind === 0 && k % 2 === 0;
    const extra = long ? 0.35 + rng() * 0.5 : 0.05 + rng() * 0.1;
    const lateral = (rng() - 0.5) * 0.12;
    const pts = polePath(a, 0, s0, sEnd, extra, lateral, rng() * 9);
    const rb = POLE_R * (0.9 + rng() * 0.25), rt = kind === 0 ? 0.016 + rng() * 0.005 : 0.022 + rng() * 0.006, seed = rng() * 50;
    G.poleIn.push(tube(pts, (t, an) => (rb + (rt - rb) * Math.pow(t, 0.8)) * (1 + valueNoise(an * 1.5 + seed, t * 30, 3) * 0.07), 6, { capEnd: true }));
  }
  const NOUT = 36, outerAngles = [];
  for (let k = 0; k < NOUT; k++) {
    let a = ((k + 0.5) / NOUT) * TAU;
    const w = Math.atan2(Math.sin(a), Math.cos(a));
    if (Math.abs(w) < doorA + 0.04) a = Math.sign(w) * (doorA + 0.05);
    a += (rng() - 0.5) * 0.015;
    outerAngles.push(a);
    const extra = 0.5 + rng() * 0.7;
    const pts = polePath(a, 0.112, 0, sApex, extra, (rng() - 0.5) * 0.2, rng() * 9);
    pts[0].y -= 0.1;
    // peeled larch: never straight — a sweep, a kink or two, knots and an uneven taper
    const sweep = (rng() - 0.5) * 0.08, kink = rng() * 0.8 + 0.1, kinkA = (rng() - 0.5) * 0.04;
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    pts.forEach((p, i) => {
      const t = i / (pts.length - 1);
      p.addScaledVector(side, Math.sin(t * Math.PI) * sweep + Math.max(0, t - kink) * kinkA * 3 + valueNoise(t * 9, k, 5) * 0.014);
    });
    const rb = 0.036 + rng() * 0.018, rt = 0.014 + rng() * 0.006, seed = rng() * 50, knots = rng() * 40;
    G.poleOut.push(tube(pts, (t, an) => (rb + (rt - rb) * Math.pow(t, 0.7)) * (1 + valueNoise(an * 1.5 + seed, t * 30, 3) * 0.12 + Math.max(0, valueNoise(t * 26 + knots, an * 0.5, 4) - 0.55) * 0.5), 6, { capEnd: true }));
  }

  // ---- the tie: horsehair rope wound round the bundle under the crown
  {
    const q = P.at(sApex - 0.3);
    for (let w = 0; w < 8; w++) {
      const pts = [], yy = q.y + w * 0.026, rr = q.r + POLE_R * 0.9 + 0.012 - w * 0.008;
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * TAU;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, yy + Math.sin(a * 3) * 0.004, Math.sin(a) * rr));
      }
      G.hair.push(tube(pts, () => 0.01, 5));
    }
    // a loose end hanging inside
    const end = [];
    for (let i = 0; i <= 10; i++) end.push(new THREE.Vector3(0.12 + i * 0.004, q.y - i * 0.06, 0.02 * Math.sin(i)));
    G.hair.push(tube(end, (t) => 0.008 * (1 - t * 0.4), 5));
  }
  // lashings where the inner poles cross the middle and top hoops (every other pole that reaches it)
  for (const [S, kinds] of [[midS, [0, 1, 2]], [topS, [0, 1]]]) for (let k = 0; k < NIN; k += 2) {
    if (!kinds.includes(k % 3)) continue;
    const a = (k / NIN) * TAU;
    const c = onProf(P, S, a, -0.025);
    G.hair.push(xf(lathe([[0.05, -0.04], [0.057, 0], [0.05, 0.04]], 6), { r: [Math.PI / 2, -a, 0], p: c.toArray() }));
  }

  // ---- door frame: two hewn jambs leaning with the wall, a lintel log the door poles rest on, a threshold log.
  // Jambs are 20 cm deep, centred on DOOR.rAt(y), so they close the cut edges of both bark layers.
  const jz = DOOR.hw + 0.065;
  for (const s of [-1, 1]) G.timber.push(beam([DOOR.rAt(-0.12), -0.12, s * jz], [DOOR.rTop, DOOR.h + 0.115, s * jz], 0.13, 0.2, 0.015));
  G.timber.push(beam([DOOR.rTop, DOOR.h + 0.06, -(jz + 0.2)], [DOOR.rTop, DOOR.h + 0.06, jz + 0.2], 0.22, 0.12, 0.015));
  G.timber.push(tube([new THREE.Vector3(DOOR.r - 0.07, 0.04, -jz - 0.08), new THREE.Vector3(DOOR.r - 0.07, 0.045, jz + 0.08)], () => 0.065, 10, { capStart: true, capEnd: true }));

  const geoms = {};
  for (const [k, list] of Object.entries(G)) geoms[k] = merge(list);
  return { geoms, colliders, postAngles, outerAngles, doorA, hoopY1, midS, topS };
}
