// The birch-bark cover: rings of sewn sheets wrapped from the bottom up, each overlapping the one
// below like roof tiles (outer, cream face), the inner layer's golden face seen from inside,
// the ornament bands (traced from the Suntar urasa, docs/patterns.md), and the bark door curtain.
import * as THREE from 'three/webgpu';
import { TAU, tube } from './geom.js';
import { DOOR, wob, doorHalfAngle } from './frame.js';
import { hash2, valueNoise } from '../../util.js';

const RING_STEP = 0.5, RING_H = 0.62;
export const O_IN = 0.042, O_OUT = 0.056;
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

// Build a strip of the surface between arc lengths s0..s1 at normal offset off(v), round the cone, the door cut away
// (each cut row starts and ends on the straight cut edge, z = ±DOOR.edge). nu: segments round (fixed for a strip).
function strip(P, s0, s1, nv, off, segLen, { doorCut, flipNormals = false, uvFn, attrFn, edgeWobble = 0, seed = 0, lift, nu: nuFixed }) {
  const rMid = P.at((s0 + s1) / 2).r + off(0.5);
  const nu = nuFixed || Math.max(24, Math.ceil((TAU * rMid) / segLen));
  const R = rows(P, s0, s1, nv, doorCut);
  const pos = [], uv = [], ex = [], idx = [];
  R.forEach((row, j) => {
    const v = row.v;
    const qr = P.at(Math.max(0, row.s));
    const da = row.cut ? doorHalfAngle(qr.r + off(v)) : 0;
    for (let i = 0; i <= nu; i++) {
      const a = da + (TAU - 2 * da) * (i / nu);
      // the cut lower edge is not perfectly level
      const s = row.s + (j === 0 ? valueNoise(a * 3.1, seed, 7) * edgeWobble : 0);
      const q = P.at(Math.max(0, s));
      const t = uvFn(a, v, rMid, s);
      const o = off(v) + valueNoise(a * 5.3, s * 2.1 + seed, 3) * 0.003 + (lift ? lift(t[0], v) : 0);
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

export function buildCover(rng, P) {
  const sTop = P.sAtR(HOLE_R);
  const nRings = Math.ceil((sTop + 0.02) / RING_STEP);
  const outer = [], inner = [], bands = [];
  // ornament bands as on the Suntar urasa: the arcade just above the door, the zigzag band where the cone has
  // narrowed to ~0.65 of its base radius. [ring, kind, height, repeat]: one texture repeat holds 11 arcade or
  // 7 zigzag periods; periods 0.20 m and 0.24 m (scaled from the photo by the door), heights keep the traced
  // proportions. The band above the zigzag (a garland) is too small in the photo to trace and is left out.
  const ringAtY = (y) => Math.ceil((P.sAtY(y) + 0.03 - 0.07) / RING_STEP);
  const BANDS = [[ringAtY(DOOR.h + 0.2), 'arcade', 0.2 * 946 / 356, 11 * 0.2], [ringAtY(5.2), 'zigzag', 0.24 * 680 / 406, 7 * 0.24]];
  const BAND_RINGS = BANDS.map((b) => b[0]);
  const scallops = () => 0; // sheet edges are cut straight, also on the ornamented rings (Suntar urasa)
  for (let i = 0; i < nRings; i++) {
    const s0 = i * RING_STEP - 0.03, s1 = Math.min(s0 + RING_H, sTop + 0.01);
    const doorCut = P.at(Math.max(0, s0)).y < DOOR.cutY;
    const rnd = rng(), uOff = rng(), uScale = 0.75 + rng() * 0.6; // sheets differ in length ring to ring
    // sheets lift and curl at their free lower edge and corners, and are wavy from drying
    const lift = (u, v) => {
      const su = u * 2, sid = Math.floor(su), lu = su - sid, h = hash2(sid, i, 91), h2 = hash2(sid, i, 92);
      const free = Math.pow(1 - v, 3);
      const corner = Math.pow(Math.max(0, Math.abs(lu - 0.5) * 2 - 0.75) / 0.25, 2) * (h2 > 0.4 ? 1 : 0.2);
      const k = BAND_RINGS.includes(i) || BAND_RINGS.includes(i - 1) ? 0.2 : 1; // under a band: sewn down flat
      return k * (free * (0.003 + h * 0.014) + corner * Math.pow(1 - v, 2) * 0.02 + Math.sin(lu * Math.PI * (2 + Math.floor(h2 * 3)) + h * 6) * 0.004 * (0.4 + free));
    };
    const vis = (s1 - s0) / RING_H; // the top ring is shorter
    outer.push(strip(P, s0, s1, 3, (v) => O_OUT + 0.011 * (1 - v) * (1 - v * 0.3), 0.2, {
      doorCut, edgeWobble: 0.018, seed: i * 3.3, lift,
      uvFn: (a, v, rm) => [((a * rm) / 1.6) * uScale + uOff, v * vis],
      attrFn: () => [i, rnd, scallops(i), scallops(i + 1)],
    }));
  }
  // inner face: one watertight surface from the ground to the smoke hole (the same vertices round every row,
  // so no cracks between rings); uv.y counts rings (the stitch rows), uv.x metres/1.6 round
  {
    const nv = Math.ceil(sTop / 0.35), rm = P.at(sTop / 2).r;
    inner.push(strip(P, 0, sTop, nv, () => O_IN, 0, {
      doorCut: true, flipNormals: true, seed: 50, nu: 128,
      uvFn: (a, v, _rm, s) => [(a * rm) / 1.6, s / RING_STEP],
    }));
  }
  // smoke-hole rim: the bark is rolled over the top edge, closing the gap between the two layers
  {
    const q = P.at(sTop), rr = (O_OUT + 0.011 - O_IN) / 2 + 0.006, oc = (O_IN + O_OUT + 0.011) / 2;
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
    const s0 = ring * RING_STEP - 0.03 + 0.07, s1 = s0 + hgt;
    // the band is sewn over its ring and, where taller than the ring's visible part, over the ring above
    const surf = (h) => (h < 0 ? 0 : 0.011 * (1 - h / RING_H) * (1 - (0.3 * h) / RING_H)); // a ring's face above O_OUT
    const o = (v) => { const h = 0.07 + v * hgt; return O_OUT + Math.max(surf(h), surf(h - RING_STEP) + 0.005) + 0.008; };
    const rm = P.at((s0 + s1) / 2).r + O_OUT;
    const reps = Math.max(2, Math.round((TAU * rm) / repeat));
    bands.push(strip(P, s0, s1, 3, o, 0.16, {
      doorCut: P.at(s0).y < DOOR.cutY, seed: ring,
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
