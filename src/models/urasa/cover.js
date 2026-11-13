// The birch-bark cover: tiers of long bands of sewn sheets wrapped from the bottom up, each overlapping the one
// below like roof tiles with a thick, uneven lower edge (outer, cream face), the inner layer's golden face seen from inside,
// the ornament bands (traced from the Suntar urasa, docs/patterns.md), and the bark door curtain.
import * as THREE from 'three/webgpu';
import { TAU, tube } from './geom.js';
import { DOOR, wob, doorHalfAngle, O_IN, O_OUT, TIER_T } from './frame.js';
import { hash2, valueNoise } from '../../util.js';

// RING_STEP: the inner face's stitch rows and the count of draws; TIER: mean tier step outside; LAP: overlap on the
// tier below; SHEET_H: the sheet texture's height
const RING_STEP = 0.5, TIER = 0.64, LAP = 0.12, SHEET_H = 0.62;
const HOLE_R = 0.55; // the smoke hole: the cover stops at this radius

// Rows of a strip between arc lengths s0..s1: nv even steps, plus a doubled row at the door's cut line so the
// cut ends on a level edge (inside the lintel) instead of leaving a wedge between a cut row and a whole one.
function rows(P, s0, s1, nv, doorCut) {
  const out = [];
  for (let j = 0; j <= nv; j++) out.push({ s: s0 + (s1 - s0) * (j / nv), v: j / nv });
  if (!doorCut) return out.map((r) => ({ ...r, cut: false }));
  const sc = P.sAtY(DOOR.cutY);
  const res = [];
  for (const r of out) {
    const cut = r.s < sc, prev = res[res.length - 1];
    if (!cut && prev?.cut) {
      const v = (sc - s0) / (s1 - s0);
      res.push({ s: sc, v, cut: true });
      if (r.s > sc + 1e-4) res.push({ s: sc, v, cut: false });
    }
    res.push({ ...r, cut });
  }
  return res;
}

// The cover rests on the inner poles and sags between them (6 % of the span, ≤ 2 cm): the poles show through.
// set(s): the sorted azimuths of the poles that reach arc length s; sag(A, a, s): the dip at azimuth a over the poles A;
// samples(A, r): azimuths at each pole and at halves of each span (thirds where it is over 0.3 m wide at radius r;
// 0 and TAU included), so the dips are drawn.
function poleSag(P, poles, sTop) {
  const set = (s) => poles.filter((p) => p.sEnd >= s).map((p) => p.a).sort((x, y) => x - y);
  const sag = (A, a, s) => {
    a = ((a % TAU) + TAU) % TAU;
    let lo = 0, hi = A.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (A[m] <= a) lo = m + 1; else hi = m; }
    const p0 = lo === 0 ? A[A.length - 1] - TAU : A[lo - 1], p1 = lo === A.length ? A[0] + TAU : A[lo];
    const q = P.at(Math.max(0, s)), fade = Math.min(1, Math.max(0, (sTop - 1.2 - s) / 1.5)); // the poles bend to the tie up there
    return -Math.min(0.02, 0.06 * (p1 - p0) * q.r) * fade * Math.sin((Math.PI * (a - p0)) / (p1 - p0));
  };
  const samples = (A, r) => {
    const out = [0, TAU];
    A.forEach((p0, k) => {
      const p1 = k + 1 < A.length ? A[k + 1] : A[0] + TAU;
      for (const t of (p1 - p0) * r > 0.3 ? [0, 1 / 3, 2 / 3] : [0, 0.5]) { const x = (p0 + (p1 - p0) * t) % TAU; if (x > 1e-4 && x < TAU - 1e-4) out.push(x); }
    });
    return out.sort((x, y) => x - y);
  };
  return { set, sag, samples };
}

// Build a strip of the surface between arc lengths s0..s1 at normal offset off(v), round the cone, the door cut away
// (each cut row starts and ends on the straight cut edge, z = ±DOOR.edge). nu: segments round (fixed for a strip);
// angles: the azimuths round instead (0..TAU; cut rows clamp them to the cut edges); sag(a, s, v): offset added;
// edge(a): the lower edge's shift along the slope (fading to none at the top); lip: offset of an extra row tucked
// under the lower edge (the bark's thickness, in shadow).
function strip(P, s0, s1, nv, off, segLen, { doorCut, flipNormals = false, uvFn, attrFn, edgeWobble = 0, seed = 0, lift, nu: nuFixed, angles, sag, edge, lip }) {
  const rMid = P.at((s0 + s1) / 2).r + off(0.5);
  const nu = angles ? angles.length - 1 : nuFixed || Math.max(24, Math.ceil((TAU * rMid) / segLen));
  const R = rows(P, s0, s1, nv, doorCut);
  if (lip !== undefined) R.unshift({ ...R[0], lip: true });
  const pos = [], uv = [], ex = [], idx = [];
  R.forEach((row, j) => {
    const v = row.v;
    const qr = P.at(Math.max(0, row.s));
    const da = row.cut ? doorHalfAngle(qr.r + off(v)) : 0;
    for (let i = 0; i <= nu; i++) {
      const a = angles ? Math.min(TAU - da, Math.max(da, angles[i])) : da + (TAU - 2 * da) * (i / nu);
      // the cut lower edge is not perfectly level
      const s = row.s + (v === 0 ? valueNoise(a * 3.1, seed, 7) * edgeWobble : 0) + (edge ? edge(a) * (1 - v) : 0) - (row.lip ? 0.01 : 0);
      const q = P.at(Math.max(0, s));
      const t = uvFn(a, row.lip ? 0.003 : v, rMid, s);
      const o = row.lip ? lip + (sag ? sag(a, s, v) : 0)
        : off(v) + valueNoise(a * 5.3, s * 2.1 + seed, 3) * 0.003 + (lift ? lift(t[0], v, a) : 0) + (sag ? sag(a, s, v) : 0);
      const r = (q.r + q.nr * o) * wob(a, q.y), y = q.y + q.ny * o;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(...t);
      if (attrFn) ex.push(...attrFn(a, v));
    }
  });
  for (let j = 0; j < R.length - 1; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + nu + 1;
    flipNormals ? idx.push(a, a + 1, b, b, a + 1, b + 1) : idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return { pos, uv, ex, idx, n: pos.length / 3 };
}

function toGeom(parts, attrName, attrSize) {
  const pos = [], uv = [], ex = [], idx = [];
  for (const p of parts) {
    const base = pos.length / 3;
    pos.push(...p.pos); uv.push(...p.uv); ex.push(...p.ex);
    for (const i of p.idx) idx.push(i + base);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (attrName) g.setAttribute(attrName, new THREE.Float32BufferAttribute(ex, attrSize));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildCover(rng, P, poles, outerAngles) {
  const sTop = P.sAtR(HOLE_R);
  const PS = poleSag(P, poles, sTop);
  // the tiers: long bands of sheets of different widths, each 0.5–0.78 m to the next, lapping 12 cm over the one below
  const R0 = [], STEP = [];
  for (let i = 0, s = -0.03; s + 0.03 < sTop + 0.02; i++) {
    const st = TIER * (0.78 + 0.44 * hash2(i, 1, 93));
    if (i > 0 && sTop + 0.01 - s < 0.1) break; // a sliver at the top: the ring below already reaches the rim
    R0.push(s); STEP.push(st); s += st;
  }
  const nRings = R0.length;
  // metres round from azimuth a to the nearest outer pole at radius r: the poles hold the tiers down, between them
  // the free edges stand off
  const OA = [...outerAngles].map((x) => ((x % TAU) + TAU) % TAU).sort((x, y) => x - y);
  const toPole = (a, r) => {
    a = ((a % TAU) + TAU) % TAU;
    let d = TAU;
    for (const o of OA) { const x = Math.abs(a - o); d = Math.min(d, x, TAU - x); }
    return d * r;
  };
  // three draws per ring of 0.5 m, as many as ever (the interior's draws follow these)
  const draws = Array.from({ length: Math.ceil((sTop + 0.02) / RING_STEP) }, () => [rng(), rng(), 0.75 + rng() * 0.6]);
  const ringH = (i) => (STEP[i] ?? TIER) + LAP;
  const ringSet = (i) => PS.set(Math.max(0, R0[Math.min(i, nRings - 1)] + (i >= nRings ? TIER : 0)));
  const outer = [], inner = [], bands = [];
  // ornament bands as on the Suntar urasa: the arcade just above the door, the zigzag band where the cone has
  // narrowed to ~0.65 of its base radius. [ring, kind, height, repeat]: one texture repeat holds 11 arcade or
  // 7 zigzag periods; periods 0.20 m and 0.24 m (scaled from the photo by the door), heights keep the traced
  // proportions. The band above the zigzag (a garland) is too small in the photo to trace and is left out.
  const ringAtY = (y) => R0.findIndex((s0) => s0 + 0.07 >= P.sAtY(y) - 1e-6);
  const BANDS = [[ringAtY(DOOR.h + 0.2), 'arcade', 0.2 * 946 / 356, 11 * 0.2], [ringAtY(5.2), 'zigzag', 0.24 * 680 / 406, 7 * 0.24]];
  const BAND_RINGS = BANDS.map((b) => b[0]);
  // each band of sheets was laid by hand: its lower edge climbs and dips round the cone (≤ ±5 cm, under the 12 cm lap),
  // level only where an ornament band is sewn on it or below it, by the door, and on the lowest tier
  const edgeOf = (i) => {
    if (i <= 0 || i >= nRings || BAND_RINGS.some((b) => i >= b && i <= b + 2)) return () => 0;
    const ph = hash2(i, 2, 93) * TAU, k = 0.022 + hash2(i, 3, 93) * 0.018, ph2 = hash2(i, 4, 93) * TAU;
    return (a) => {
      const w = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      const door = Math.min(1, Math.max(0, (w - 0.45) / 0.4));
      return door * (k * Math.sin(a + ph) + 0.014 * Math.sin(a * 3 + ph2) + 0.012 * valueNoise(a * 2.2, i * 1.7, 11));
    };
  };
  // sheet edges are cut straight, also on the ornamented rings (Suntar urasa)
  for (let i = 0; i < nRings; i++) {
    const s0 = R0[i], s1 = Math.min(s0 + ringH(i), sTop + 0.01);
    const doorCut = P.at(Math.max(0, s0)).y < DOOR.cutY;
    const [rnd, uOff, uScale] = draws[i % draws.length]; // sheets differ in length ring to ring
    // sheets lift and curl at their free lower edge and corners, and are wavy from drying (sheets as in urasa/mats.js: uv.x × 1.25)
    // and bow out between the outer poles that pin them (up to 3.5 cm at the free edge)
    const rr = P.at(Math.max(0, s0)).r;
    const lift = (u, v, a) => {
      const su = u * 1.25, sid = Math.floor(su), lu = su - sid, h = hash2(sid, i, 91), h2 = hash2(sid, i, 92);
      const free = Math.pow(1 - v, 3);
      const corner = Math.pow(Math.max(0, Math.abs(lu - 0.5) * 2 - 0.75) / 0.25, 2) * (h2 > 0.4 ? 1 : 0.2);
      const k = BAND_RINGS.includes(i) || BAND_RINGS.includes(i - 1) ? 0.2 : 1; // under a band: sewn down flat
      const dp = toPole(a, rr), pin = Math.min(1, Math.max(0, (dp - 0.04) / 0.16)), pin2 = pin * pin * (3 - 2 * pin);
      const bow = Math.pow(1 - v, 1.5) * (0.023 + 0.011 * valueNoise(a * 4, i * 1.3, 94)) * Math.min(1, Math.max(0, (dp - 0.05) / 0.45));
      return k * (pin2 * (free * (0.003 + h * 0.014) + corner * Math.pow(1 - v, 2) * 0.02) + bow + Math.sin(lu * Math.PI * (2 + Math.floor(h2 * 3)) + h * 6) * 0.004 * (0.4 + free) * pin2);
    };
    // over its part hidden under the ring above, a ring takes that ring's dips (fewer poles reach higher up)
    const A = ringSet(i), An = ringSet(i + 1);
    const sag = (a, s, v) => { const k = Math.min(1, Math.max(0, (v - 0.55) / 0.25)); return PS.sag(A, a, s) * (1 - k) + PS.sag(An, a, s) * k; };
    const e = edgeOf(i), eNext = edgeOf(i + 1);
    outer.push(strip(P, s0, s1, 3, (v) => O_OUT + TIER_T * (1 - v) * (1 - v * 0.3), 0.2, {
      doorCut, edgeWobble: 0.018, seed: i * 3.3, lift, angles: PS.samples(A, P.at(Math.max(0, s0)).r), sag, edge: e,
      lip: i > 0 ? O_OUT - 0.004 : undefined,
      uvFn: (a, v, rm) => [((a * rm) / 1.6) * uScale + uOff, (v * (s1 - s0)) / SHEET_H], // uv.y: metres / SHEET_H
      // .w: where the tier above lies on this one (uv.y)
      attrFn: (a) => [i, rnd, 0, ((STEP[i] + eNext(a) - e(a)) / (s1 - s0 - e(a))) * ((s1 - s0) / SHEET_H)],
    }));
  }
  // inner face: one watertight surface from the ground to the smoke hole (the same vertices round every row,
  // so no cracks between rings), sagging between the poles like the outer one; uv.y counts rings (the stitch rows),
  // uv.x metres/1.6 round
  {
    const nv = Math.ceil(sTop / 0.35), rm = P.at(sTop / 2).r, A0 = PS.set(0);
    inner.push(strip(P, 0, sTop, nv, () => O_IN, 0, {
      doorCut: true, flipNormals: true, seed: 50, angles: PS.samples(A0, P.at(0).r), sag: (a, s) => PS.sag(PS.set(s), a, s),
      uvFn: (a, v, _rm, s) => [(a * rm) / 1.6, s / RING_STEP],
    }));
  }
  // smoke-hole rim: the bark is rolled over the top edge, closing the gap between the two layers
  {
    const q = P.at(sTop), rr = (O_OUT + TIER_T - O_IN) / 2 + 0.006, oc = (O_IN + O_OUT + TIER_T) / 2;
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * TAU, r = (q.r + q.nr * oc) * wob(a, q.y);
      pts.push(new THREE.Vector3(Math.cos(a) * r, q.y + q.ny * oc, Math.sin(a) * r));
    }
    const g = tube(pts, () => rr, 6);
    const uvA = g.attributes.uv;
    for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getY(k) / 1.6, sTop / RING_STEP);
    inner.push({ pos: [...g.attributes.position.array], uv: [...uvA.array], ex: [], idx: [...g.index.array] });
  }
  const bandAt = (ring, kind, hgt, repeat) => {
    const s0 = R0[ring] + 0.07, s1 = s0 + hgt;
    // the band is sewn over its ring and, where taller than the ring's visible part, over the ring above
    const surf = (h, H) => (h < 0 ? 0 : TIER_T * (1 - h / H) * (1 - (0.3 * h) / H)); // a ring's face above O_OUT
    const o = (v) => { const h = 0.07 + v * hgt; return O_OUT + Math.max(surf(h, ringH(ring)), surf(h - STEP[ring], ringH(ring + 1)) + 0.005) + 0.008; };
    const rm = P.at((s0 + s1) / 2).r + O_OUT;
    const reps = Math.max(2, Math.round((TAU * rm) / repeat));
    const sets = [ring, ring + 1, ring + 2].map(ringSet); // over both rings it lies on: never below either
    bands.push(strip(P, s0, s1, 3, o, 0.16, {
      doorCut: P.at(s0).y < DOOR.cutY, seed: ring, angles: PS.samples(sets[0], P.at(s0).r),
      sag: (a, s) => Math.max(...sets.map((A) => PS.sag(A, a, s))),
      uvFn: (a, v) => [(a / TAU) * reps, kind === 'arcade' ? 0.5 + v * 0.5 : v * 0.5],
    }));
  };
  for (const b of BANDS) bandAt(...b);

  return {
    outer: toGeom(outer, 'aRing', 4),
    inner: toGeom(inner),
    bands: toGeom(bands),
    sTop,
  };
}

// Door curtain: softened bark, horsehair-embroidered, leather-edged; hung from the lintel outside.
// Returns a geometry and a function that drapes it for an opening amount 0..1 and a time (breeze).
export const CURTAIN_W = DOOR.edge * 2 + 0.04;
export function buildCurtain() {
  const W = CURTAIN_W, H = DOOR.h + 0.06, nu = 12, nv = 16;
  const g = new THREE.BufferGeometry();
  const n = (nu + 1) * (nv + 1);
  const pos = new Float32Array(n * 3), uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) uv.push(10 + i / nu * (W / 1.6), 1 - j / nv);
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + nu + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const nor = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)); // draped live (src/load/release.js keeps it)
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const x0 = DOOR.rTop + 0.125, yTop = DOOR.h + 0.06; // against the lintel and jambs
  const drape = (open, t) => {
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, k = (j * (nu + 1) + i) * 3;
      // closed: hangs flat with a gentle belly and a breeze ripple
      // tied at four points on the lintel: sags between them; a heavy belly; folds; a longer, uneven hem
      let x = x0 + Math.sin(u * Math.PI) * 0.06 * Math.sin(v * Math.PI * 0.8) + Math.sin(u * Math.PI * 5 + 0.7) * 0.026 * (0.3 + v) + Math.sin(u * Math.PI * 11 + v * 3) * 0.007 + Math.sin(t * 1.3 + u * 4 + v * 2) * 0.006 * v;
      const ties = Math.pow(Math.sin(u * Math.PI * 3), 2) * 0.05 * (1 - v);
      let y = yTop - v * H - ties - v * v * (0.03 * Math.sin(u * Math.PI) + 0.015 * Math.sin(u * 17));
      let z = (u - 0.5) * W;
      // open: the lower part is swung up and gathered to the north side, hooked aside
      const lift = open * Math.pow(v, 1.15);
      const ang = lift * 1.25;
      x += Math.sin(ang) * v * H * 0.55;
      y += v * H * (1 - Math.cos(ang) * (1 - open * 0.15));
      z = z * (1 - open * 0.55 * v) - open * 0.42 * v;
      pos[k] = x; pos[k + 1] = Math.max(0.02, y); pos[k + 2] = z;
    }
    g.attributes.position.needsUpdate = true;
    // grid normals from the neighbouring points (computeVertexNormals allocated ~60 KB a frame here)
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const a = (j * (nu + 1) + Math.max(0, i - 1)) * 3, b = (j * (nu + 1) + Math.min(nu, i + 1)) * 3;
      const c = (Math.max(0, j - 1) * (nu + 1) + i) * 3, d = (Math.min(nv, j + 1) * (nu + 1) + i) * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[d] - pos[c], vy = pos[d + 1] - pos[c + 1], vz = pos[d + 2] - pos[c + 2];
      // the index winds (a, a+1, b): u along i, v along j → face normal u × v
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1, k = (j * (nu + 1) + i) * 3;
      nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
    }
    g.attributes.normal.needsUpdate = true;
  };
  drape(0, 0);
  return { geom: g, drape };
}
