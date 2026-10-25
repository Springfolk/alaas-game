// Procedural tree generator for the Central Yakutia taiga: Cajander larch, silver/downy birch,
// Scots pine, dead larch, and shrubs (willow, wild rose). Builds bark tubes and crossed foliage
// cards in tree-local metres (+Y up, root at the origin) and bakes per-vertex data for the shaders:
//   wnd  vec4: x trunk sway weight (0 root → 1 top), y branch flex (0 at the trunk → ~1 at long tips),
//              z phase (per limb, 0..1), w flutter (0 bark; 0 → 1 across a leaf card)
//   info vec4: x ambient occlusion, y height / tree height, z height in metres, w card cell (leaves)
// Two levels of detail come out of one skeleton: lod0 (full) and lod1 (coarser tubes, half the cards).
import * as THREE from 'three/webgpu';
import { mulberry32, smooth } from '../../util.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

class Mesh {
  constructor() { this.p = []; this.n = []; this.uv = []; this.w = []; this.i = []; this.f = []; this.idx = []; }
  vert(p, n, u, v, w, info) {
    this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, v);
    this.w.push(w[0], w[1], w[2], w[3]); this.i.push(info[0], info[1], info[2], info[3]);
    return this.p.length / 3 - 1;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('wnd', new THREE.Float32BufferAttribute(this.w, 4));
    g.setAttribute('info', new THREE.Float32BufferAttribute(this.i, 4));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// A limb: a polyline of { p, r } with per-point flex; tubes are swept along it with parallel transport.
function tube(m, limb, radial, tree, { texW = 1, texH = 1 } = {}) {
  const pts = limb.pts;
  const n = pts.length;
  const reps = Math.max(1, Math.round((2 * Math.PI * pts[0].r) / texW));
  // parallel-transport frame
  let t0 = pts[1].p.clone().sub(pts[0].p).normalize();
  let nrm = Math.abs(t0.y) < 0.9 ? V().crossVectors(t0, UP).normalize() : V(1, 0, 0);
  const rings = [];
  let len = limb.v0 || 0;
  for (let k = 0; k < n; k++) {
    const t = (k < n - 1 ? pts[k + 1].p.clone().sub(pts[k].p) : pts[k].p.clone().sub(pts[k - 1].p)).normalize();
    if (k > 0) {
      const ax = V().crossVectors(t0, t);
      const s = ax.length();
      if (s > 1e-6) nrm.applyAxisAngle(ax.normalize(), Math.asin(Math.min(1, s)));
      len += pts[k].p.distanceTo(pts[k - 1].p);
    }
    t0 = t;
    const bin = V().crossVectors(t, nrm).normalize();
    const ring = [];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const dir = nrm.clone().multiplyScalar(Math.cos(a)).addScaledVector(bin, Math.sin(a));
      const pt = pts[k];
      const pos = pt.p.clone().addScaledVector(dir, pt.r * (pt.wob ? 1 + pt.wob * Math.sin(a * 3 + k) : 1));
      const y = pos.y;
      const w = [Math.pow(Math.max(0, y) / tree.H, 1.6), pt.flex || 0, limb.phase || 0, 0];
      const info = [pt.ao ?? 1, y / tree.H, y, 0];
      ring.push(m.vert(pos, dir, (j / radial) * reps, len / texH, w, info));
    }
    rings.push(ring);
  }
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < radial; j++) {
    const a = rings[k][j], b = rings[k][j + 1], c = rings[k + 1][j], d = rings[k + 1][j + 1];
    m.idx.push(a, b, c, b, d, c);
  }
}

// Crossed foliage card: attach point, growth axis, a "face" normal, size; cell 0..3 of the 2×2 atlas.
// layout 'side' = attachment at the card's left edge, growing to +u (larch, pine);
// 'top' = attachment at top-centre, hanging to −v (birch); 'bottom' = bottom-centre, growing up (shrubs).
function card(m, c, tree, crossAngle = 0.7) {
  const { at, axis, face, size, cell, layout } = c;
  const cu = (cell % 2) * 0.5, cv = cell < 2 ? 0.5 : 0; // row 0 of the image is the top half (v 0.5..1)
  const ax = axis.clone().normalize();
  for (const roll of [crossAngle, -crossAngle]) {
    const f = face.clone().applyAxisAngle(ax, roll).normalize();
    const side = V().crossVectors(ax, f).normalize(); // in-plane, perpendicular to the axis
    // card-local (s along axis 0..1, q across −0.5..0.5) → world, with uv
    const P = (s, q) => at.clone().addScaledVector(ax, s * size).addScaledVector(side, q * size);
    let corners;
    if (layout === 'side') corners = [[0, -0.5, 0, 0], [1, -0.5, 1, 0], [1, 0.5, 1, 1], [0, 0.5, 0, 1]]; // u = s, v = q+0.5
    else if (layout === 'top') corners = [[0, -0.5, 0, 1], [1, -0.5, 0, 0], [1, 0.5, 1, 0], [0, 0.5, 1, 1]]; // hangs: v = 1 − s, u = q+0.5
    else corners = [[0, -0.5, 0, 0], [1, -0.5, 0, 1], [1, 0.5, 1, 1], [0, 0.5, 1, 0]]; // grows up: v = s
    const ids = corners.map(([s, q, u, v]) => {
      const p = P(s, q);
      // normal: card face bent towards "out of the crown" for soft, volumetric shading
      const out = p.clone().sub(tree.crownC); out.y *= 0.6;
      const n = f.clone().multiplyScalar(0.35).add(out.normalize()).normalize();
      const y = p.y;
      // self-shading towards the crown centre (light reaches the outer leaves)
      const rc = p.clone().sub(tree.crownC); rc.y *= 0.6;
      const outer = smooth(0.15, 1.0, rc.length() / (tree.crownR || 3));
      const occl = c.ao * (0.82 + 0.18 * s) * (0.42 + 0.58 * outer);
      const w = [Math.pow(Math.max(0, y) / tree.H, 1.6), (c.flex || 0) + s * 0.25, c.phase, s];
      return m.vert(p, n, cu + u * 0.5, cv + v * 0.5, w, [occl, y / tree.H, y, cell]);
    });
    m.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
  }
}

// --- skeleton helpers ---
function trunkLimb(rng, { H, r0, lean, curve, flare = 0.6, tipR = 0.004, rings = 28, crownBase }) {
  const pts = [];
  const la = rng() * Math.PI * 2, ca = rng() * Math.PI * 2;
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, y = t * H;
    const off = V(Math.cos(la), 0, Math.sin(la)).multiplyScalar(lean * t * t * H)
      .add(V(Math.cos(ca), 0, Math.sin(ca)).multiplyScalar(curve * Math.sin(t * Math.PI * 1.3) * H * 0.02));
    off.x += (rng() - 0.5) * 0.015; off.z += (rng() - 0.5) * 0.015;
    let r = Math.max(tipR, r0 * Math.pow(1 - t, 0.82)) * (1 + flare * Math.exp(-y / 0.35));
    const ao = y < crownBase ? 0.8 + 0.2 * smooth(0, 3, y) : 0.7;
    pts.push({ p: V(off.x, y, off.z), r, flex: 0, ao, wob: y < 0.6 ? 0.18 * (1 - y / 0.6) : 0 });
  }
  return { pts, phase: rng(), level: 0 };
}
// point on a limb at fraction s (0..1 of its length)
function along(limb, s) {
  const pts = limb.pts;
  const f = s * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), a = f - k;
  const p = pts[k].p.clone().lerp(pts[k + 1].p, a);
  const r = pts[k].r * (1 - a) + pts[k + 1].r * a;
  const dir = pts[k + 1].p.clone().sub(pts[k].p).normalize();
  const flex = (pts[k].flex || 0) * (1 - a) + (pts[k + 1].flex || 0) * a;
  return { p, r, dir, flex };
}
// grow a limb from `start` in direction `dir`, bending with `droop` (gravity, rad per length) and `lift` near the tip
function grow(rng, start, dir, L, r0, { segs = 6, droop = 0, lift = 0, wander = 0.08, flex0 = 0, flexScale = 1, rTip = 0.003, ao0 = 0.7, ao1 = 1 } = {}) {
  const pts = [];
  let p = start.clone(), d = dir.clone().normalize();
  for (let k = 0; k <= segs; k++) {
    const t = k / segs;
    pts.push({ p: p.clone(), r: Math.max(rTip, r0 * (1 - t * 0.85)), flex: flex0 + t * L / 4 * flexScale, ao: ao0 + (ao1 - ao0) * t });
    // bend: gravity pulls the direction down, lift raises the tip
    const horiz = V(d.x, 0, d.z);
    const hl = horiz.length() || 1e-4;
    const bend = -droop * (L / segs) + lift * t * (L / segs);
    d.y += bend * hl; d.x += (rng() - 0.5) * wander; d.z += (rng() - 0.5) * wander; d.y += (rng() - 0.5) * wander * 0.5;
    d.normalize();
    p.addScaledVector(d, L / segs);
  }
  return { pts, phase: rng() };
}
const azDir = (az, elev) => V(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev));

// ---------------- species ----------------
function larch(rng, o) {
  const H = o.H ?? 17 + rng() * 8, r0 = o.r0 ?? 0.11 + rng() * 0.08;
  const crownBase = H * (o.crownBase ?? 0.36 + rng() * 0.2);
  const tree = { H, r0, crownC: V(0, (crownBase + H) / 2, 0), limbs: [], cards: [], stubs: [] };
  const trunk = trunkLimb(rng, { H, r0, lean: 0.006 + rng() * 0.01, curve: rng() * 0.4, crownBase });
  tree.trunk = trunk; tree.limbs.push(trunk);
  const Lmax = 1.8 + rng() * 1.6;
  // dry lower branches (Cajander larch keeps many thin dead twigs below the crown)
  for (let y = 1.0 + rng() * 0.6; y < crownBase; y += 0.2 + rng() * 0.35) {
    const a = along(trunk, y / H), az = rng() * Math.PI * 2;
    const L = (0.15 + rng() * 0.9) * smooth(0.3, 0.8, y / crownBase) + 0.08;
    const st = grow(rng, a.p.clone().addScaledVector(azDir(az, 0), a.r * 0.8), azDir(az, -0.2 - rng() * 0.4), L, 0.012 + rng() * 0.01, { segs: 2, wander: 0.3, ao0: 0.75, ao1: 0.8 });
    st.dead = true; tree.stubs.push(st);
  }
  let az = rng() * 6.28;
  for (let y = crownBase; y < H - 0.5; y += 0.22 + rng() * 0.32) {
    const t = (y - crownBase) / (H - crownBase);
    const n = rng() < 0.35 ? 2 : 1;
    for (let q = 0; q < n; q++) {
      az += 2.4 + (rng() - 0.5) * 0.9;
      if (rng() < 0.12) continue; // gaps: the crown is open and uneven
      const a = along(trunk, y / H);
      let L = Lmax * Math.pow(1 - t, 0.85) * (0.55 + rng() * 0.6) + 0.25;
      L *= 0.55 + 0.45 * smooth(0, 0.18, t); // lowest live branches are short and thin
      const elev = -0.25 + t * 0.85 + (rng() - 0.5) * 0.25;
      const br = grow(rng, a.p, azDir(az, elev), L, Math.min(a.r * 0.45, 0.012 + L * 0.016), { segs: 6, droop: 0.25, lift: 0.5, wander: 0.15, flex0: 0, ao0: 0.6, ao1: 0.95 });
      br.level = 1; tree.limbs.push(br);
      // side twigs in a flattish spray
      for (let s = 0.15; s < 0.95; s += 0.09 + rng() * 0.1) {
        const b = along(br, s);
        const side = V().crossVectors(b.dir, UP).normalize().multiplyScalar(rng() < 0.5 ? -1 : 1);
        const td = b.dir.clone().multiplyScalar(0.55).add(side).normalize(); td.y -= 0.15 + rng() * 0.2;
        const tl = (0.25 + rng() * 0.5) * (1.1 - s) * Math.min(1, L / 1.5) + 0.12;
        const tw = grow(rng, b.p, td, tl, 0.006, { segs: 2, droop: 0.4, wander: 0.2, flex0: b.flex, ao0: 0.75, ao1: 0.95 });
        tw.level = 2; tree.limbs.push(tw);
        tree.cards.push({ at: b.p, axis: td, face: UP.clone(), size: 0.5 + rng() * 0.3, cell: (rng() * 4) | 0, layout: 'side', flex: b.flex, phase: br.phase, ao: 0.7 + 0.25 * s });
      }
      // cards along the branch itself
      for (let s = 0.2; s < 1.0; s += 0.12 + rng() * 0.1) {
        const b = along(br, Math.min(s, 0.92));
        const d = b.dir.clone().add(V((rng() - 0.5) * 0.6, (rng() - 0.3) * 0.4, (rng() - 0.5) * 0.6)).normalize();
        tree.cards.push({ at: b.p, axis: d, face: UP.clone(), size: 0.55 + rng() * 0.35, cell: (rng() * 4) | 0, layout: 'side', flex: b.flex, phase: br.phase, ao: 0.68 + 0.3 * s });
      }
    }
  }
  // leader: tufts around the top
  for (let y = H - 1.6; y < H; y += 0.25) {
    const a = along(trunk, y / H);
    tree.cards.push({ at: a.p, axis: azDir(rng() * 6.28, 0.5 + rng() * 0.6), face: UP.clone(), size: 0.35 + rng() * 0.2, cell: (rng() * 4) | 0, layout: 'side', flex: 0.2, phase: trunk.phase, ao: 0.95 });
  }
  return tree;
}

function birch(rng, o) {
  if (o.young) o = { H: 4.5 + rng() * 4, r0: 0.035 + rng() * 0.035, crownBaseM: 0.6 + rng() * 0.8, limbs: 12 + ((rng() * 6) | 0), spread: 0.5 + rng() * 0.2, density: 1.8, cardScale: 0.62, ...o };
  const H = o.H ?? 13 + rng() * 6, r0 = o.r0 ?? 0.09 + rng() * 0.08;
  const crownBase = o.crownBaseM ?? H * (0.3 + rng() * 0.15);
  const tree = { H, r0, crownC: V(0, (crownBase + H) / 2, 0), limbs: [], cards: [], stubs: [] };
  const trunk = trunkLimb(rng, { H, r0, lean: o.lean ?? 0.01 + rng() * 0.035, curve: 0.5 + rng(), crownBase, flare: 0.45, rings: 30 });
  tree.trunk = trunk; tree.limbs.push(trunk);
  // extra low limbs (the lone sacred birch): { y, az, L, elev }
  for (const lw of o.lowLimbs || []) {
    const a = along(trunk, lw.y / H);
    const limb = grow(rng, a.p, azDir(lw.az, lw.elev ?? 0.25), lw.L, Math.min(a.r * 0.45, 0.05), { segs: 8, droop: lw.droop ?? 0.1, wander: 0.06, flexScale: 0.12, ao0: 0.7, ao1: 0.95 });
    limb.level = 1; tree.limbs.push(limb); (tree.low ||= []).push(limb);
    for (let u = 0.3; u <= 1.0; u += 0.09 + rng() * 0.08) {
      const c = along(limb, Math.min(u, 0.98));
      const hang = V((rng() - 0.5) * 0.6, -1, (rng() - 0.5) * 0.6).add(c.dir.clone().multiplyScalar(0.45)).normalize();
      tree.cards.push({ at: c.p, axis: hang, face: V(c.dir.x, 0, c.dir.z).normalize(), size: 0.5 + rng() * 0.3, cell: (rng() * 4) | 0, layout: 'top', flex: c.flex + 0.2, phase: limb.phase, ao: 0.8 });
    }
  }
  // a few dead stubs low down
  for (let y = 1.5; y < crownBase; y += 0.6 + rng() * 1.2) {
    const a = along(trunk, y / H), az = rng() * 6.28;
    const st = grow(rng, a.p, azDir(az, 0.2), 0.1 + rng() * 0.35, 0.015, { segs: 2, wander: 0.2, ao0: 0.8, ao1: 0.85 });
    st.dead = true; tree.stubs.push(st);
  }
  const limbs = o.limbs ?? 11 + ((rng() * 6) | 0);
  const spread = o.spread ?? 1;
  let az = rng() * 6.28;
  const dens = o.density ?? 1.7, cs = o.cardScale ?? 0.72;
  const hangCard = (c, phase, ao, size = (0.5 + rng() * 0.35) * cs) => {
    const hang = V((rng() - 0.5) * 0.6, -1, (rng() - 0.5) * 0.6).add(c.dir.clone().multiplyScalar(0.45)).normalize();
    tree.cards.push({ at: c.p, axis: hang, face: azDir(rng() * 6.28, 0), size, cell: (rng() * 4) | 0, layout: 'top', flex: c.flex + 0.2, phase, ao });
  };
  for (let i = 0; i < limbs; i++) {
    const t = (i + rng() * 0.6) / limbs;
    const y = crownBase + t * (H * 0.88 - crownBase);
    az += 2.4 + (rng() - 0.5) * 0.8;
    const a = along(trunk, y / H);
    // oval crown: longest limbs a little below the middle, short ones at the base and the rounded top
    const L = (2.2 + rng() * 2.2) * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * Math.pow(t, 0.75))), 0.6)) * spread;
    const elev = 0.35 + t * 0.75 + (rng() - 0.5) * 0.3; // birch limbs ascend, then arch out
    const limb = grow(rng, a.p, azDir(az, elev), L, Math.min(a.r * 0.5, 0.018 + L * 0.011), { segs: 7, droop: 0.12, wander: 0.1, ao0: 0.65, ao1: 0.95 });
    limb.level = 1; tree.limbs.push(limb);
    const subs = Math.round((5 + ((rng() * 4) | 0)) * Math.sqrt(dens));
    for (let k = 0; k < subs; k++) {
      const s = 0.2 + (k / subs) * 0.75 + rng() * 0.05;
      const b = along(limb, s);
      const out = V(b.dir.x, 0, b.dir.z).normalize();
      const sd = out.multiplyScalar(0.7).add(azDir(rng() * 6.28, 0).multiplyScalar(0.7)).normalize(); sd.y = 0.1 + rng() * 0.3;
      const sl = (0.8 + rng() * 1.2) * (1.2 - s * 0.7) * Math.min(1.3, spread);
      const sub = grow(rng, b.p, sd, sl, Math.max(0.005, b.r * 0.5), { segs: 4, droop: 0.45, wander: 0.2, flex0: b.flex, ao0: 0.72, ao1: 1 });
      sub.level = 2; tree.limbs.push(sub);
      for (let u = 0.2; u <= 1.0; u += 0.3 + rng() * 0.2) hangCard(along(sub, Math.min(u, 0.98)), sub.phase, 0.72 + 0.25 * u);
    }
    for (let u = 0.5; u <= 1.0; u += 0.25 + rng() * 0.15) hangCard(along(limb, Math.min(u, 0.98)), limb.phase, 0.7 + 0.25 * u);
  }
  // the crown mass: weeping twig curtains filling an egg-shaped envelope, thickest in the outer shell
  {
    const tips = tree.limbs.filter((l) => l.level >= 1).map((l) => { const p = l.pts[l.pts.length - 1].p; return Math.hypot(p.x, p.z); }).sort((a, b) => a - b);
    const Rh = Math.max(1.2, tips[Math.floor(tips.length * 0.8)] || 2) * 0.95 * (o.envelope ?? 1);
    const y0 = crownBase + 0.3, y1 = H - 0.2, cy = y0 + (y1 - y0) * 0.45;
    const n = Math.round(260 * dens);
    for (let i = 0; i < n; i++) {
      const h = rng() * 2 - 1; // −1 bottom … 1 top of the envelope
      const y = h < 0 ? cy + h * (cy - y0) : cy + h * (y1 - cy);
      const ring = Math.sqrt(Math.max(0, 1 - h * h)) * (h < 0 ? 1 : 0.9);
      const a = rng() * Math.PI * 2, r = Rh * ring * Math.pow(rng(), 0.3);
      const t = along(trunk, Math.min(0.99, y / H));
      const p = V(t.p.x + Math.cos(a) * r, y, t.p.z + Math.sin(a) * r);
      const out = V(Math.cos(a), 0, Math.sin(a));
      const hang = V((rng() - 0.5) * 0.5, -1, (rng() - 0.5) * 0.5).addScaledVector(out, 0.25 + rng() * 0.3).normalize();
      tree.cards.push({ at: p, axis: hang, face: azDir(rng() * 6.28, 0), size: (0.42 + rng() * 0.3) * cs, cell: (rng() * 4) | 0, layout: 'top', flex: 0.3 + 0.5 * r / Rh, phase: rng(), ao: 0.95 });
    }
  }
  for (let y = H * 0.82; y < H; y += 0.4) {
    const a = along(trunk, y / H);
    tree.cards.push({ at: a.p, axis: V((rng() - 0.5), -0.6, (rng() - 0.5)).normalize(), face: azDir(rng() * 6.28, 0), size: 0.45 + rng() * 0.2, cell: (rng() * 4) | 0, layout: 'top', flex: 0.3, phase: trunk.phase, ao: 0.95 });
  }
  return tree;
}

function pine(rng, o) {
  const H = o.H ?? 17 + rng() * 7, r0 = o.r0 ?? 0.14 + rng() * 0.08;
  const crownBase = H * (0.58 + rng() * 0.14);
  const tree = { H, r0, crownC: V(0, (crownBase + H) / 2, 0), limbs: [], cards: [], stubs: [] };
  const trunk = trunkLimb(rng, { H, r0, lean: 0.004 + rng() * 0.01, curve: rng() * 0.3, crownBase, flare: 0.5 });
  tree.trunk = trunk; tree.limbs.push(trunk);
  for (let y = 2 + rng(); y < crownBase; y += 0.5 + rng() * 0.8) {
    const a = along(trunk, y / H), az = rng() * 6.28;
    const st = grow(rng, a.p, azDir(az, -0.1), 0.1 + rng() * 0.3, 0.02, { segs: 2, wander: 0.2, ao0: 0.8, ao1: 0.85 });
    st.dead = true; tree.stubs.push(st);
  }
  const Lmax = 2.2 + rng() * 1.6;
  let az = rng() * 6.28;
  for (let y = crownBase; y < H - 0.4; y += 0.45 + rng() * 0.35) {
    const t = (y - crownBase) / (H - crownBase);
    const whorl = 3 + ((rng() * 2) | 0);
    for (let q = 0; q < whorl; q++) {
      if (rng() < 0.3) continue;
      az += (Math.PI * 2) / whorl + (rng() - 0.5) * 0.6;
      const a = along(trunk, y / H);
      const L = Lmax * Math.pow(1 - t, 0.45) * (0.6 + rng() * 0.5) + 0.3;
      const elev = -0.1 + t * 0.7 + (rng() - 0.5) * 0.2;
      const br = grow(rng, a.p, azDir(az, elev), L, Math.min(a.r * 0.5, 0.02 + L * 0.015), { segs: 6, droop: 0.15, lift: 0.6, wander: 0.18, ao0: 0.6, ao1: 0.95 });
      br.level = 1; tree.limbs.push(br);
      for (let s = 0.4; s < 1.0; s += 0.14 + rng() * 0.1) {
        const b = along(br, Math.min(s, 0.95));
        const d = b.dir.clone().add(V((rng() - 0.5) * 0.9, 0.2 + rng() * 0.3, (rng() - 0.5) * 0.9)).normalize();
        tree.cards.push({ at: b.p, axis: d, face: UP.clone(), size: 0.45 + rng() * 0.25, cell: (rng() * 4) | 0, layout: 'side', flex: b.flex, phase: br.phase, ao: 0.6 + 0.35 * s });
      }
    }
  }
  for (let y = H - 1.0; y < H; y += 0.3) {
    const a = along(trunk, y / H);
    tree.cards.push({ at: a.p, axis: azDir(rng() * 6.28, 0.7), face: UP.clone(), size: 0.4, cell: (rng() * 4) | 0, layout: 'side', flex: 0.2, phase: trunk.phase, ao: 0.95 });
  }
  return tree;
}

function deadLarch(rng, o) {
  const H = (o.H ?? 14 + rng() * 9) * (0.6 + rng() * 0.35); // broken top
  const r0 = 0.1 + rng() * 0.08;
  const tree = { H, r0, crownC: V(0, H * 0.7, 0), limbs: [], cards: [], stubs: [] };
  const trunk = trunkLimb(rng, { H, r0, lean: 0.01 + rng() * 0.03, curve: rng() * 0.6, crownBase: H, tipR: r0 * 0.25 });
  tree.trunk = trunk; tree.limbs.push(trunk);
  for (let y = 1.0; y < H - 0.3; y += 0.25 + rng() * 0.4) {
    const a = along(trunk, y / H), az = rng() * 6.28, t = y / H;
    const L = (0.2 + rng() * 1.4) * (0.4 + 0.6 * smooth(0.2, 0.7, t)) * (1 - t * 0.6);
    const st = grow(rng, a.p, azDir(az, -0.2 + t * 0.5), L, 0.01 + rng() * 0.015, { segs: 3, wander: 0.35, ao0: 0.85, ao1: 0.9 });
    st.dead = true; tree.stubs.push(st);
  }
  return tree;
}

// shrubs: a rounded clump of branching stems with small leaf cards spread through the dome
// (willow cells 0–1, wild rose cells 2–3)
function shrub(rng, o) {
  const rose = o.kind === 'rose';
  const H = rose ? 0.7 + rng() * 0.5 : 1.4 + rng() * 1.4;
  const R = H * (rose ? 0.7 : 0.55);
  const tree = { H, r0: 0.02, crownC: V(0, H * 0.45, 0), limbs: [], cards: [], stubs: [] };
  const stems = rose ? 7 + ((rng() * 5) | 0) : 7 + ((rng() * 5) | 0);
  for (let i = 0; i < stems; i++) {
    const az = rng() * 6.28, elev = 0.85 + rng() * 0.55;
    const L = H * (0.75 + rng() * 0.4);
    const st = grow(rng, V(Math.cos(az) * 0.08, 0, Math.sin(az) * 0.08), azDir(az, elev), L, rose ? 0.007 : 0.012, { segs: 4, droop: rose ? 0.5 : 0.25, wander: 0.25, ao0: 0.55, ao1: 1 });
    st.level = 1; tree.limbs.push(st);
    for (let k = 0; k < 2; k++) {
      const b = along(st, 0.35 + rng() * 0.4);
      const sb = grow(rng, b.p, b.dir.clone().add(azDir(rng() * 6.28, 0.3)).normalize(), L * 0.45, 0.005, { segs: 2, droop: 0.4, wander: 0.3, flex0: b.flex, ao0: 0.7, ao1: 1 });
      sb.level = 2; tree.limbs.push(sb);
    }
  }
  // leaf cards scattered through a dome, denser and lighter towards the outside
  const n = rose ? 70 : 110;
  for (let i = 0; i < n; i++) {
    const az = rng() * 6.28, u = Math.sqrt(rng()), h = rng();
    const rr = R * u * Math.sqrt(1 - h * h * 0.8);
    const at = V(Math.cos(az) * rr, H * (0.15 + 0.8 * h) * (0.6 + 0.4 * (1 - u)), Math.sin(az) * rr);
    const axis = rose ? V(Math.cos(az) * (0.5 + u), 0.15 + rng() * 0.7, Math.sin(az) * (0.5 + u)).add(V(rng() - 0.5, 0, rng() - 0.5)).normalize() : V(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize();
    tree.cards.push({ at, axis, face: azDir(rng() * 6.28, 0), size: (rose ? 0.26 : 0.4) + rng() * 0.16, cell: (rose ? 2 : 0) + ((rng() * 2) | 0), layout: 'bottom', flex: 0.2 + h * 0.4, phase: rng(), ao: 0.55 + 0.45 * u });
  }
  return tree;
}

const SPECIES = { larch, birch, pine, deadLarch, shrub };
const BARK_TEX = { larch: [0.9, 1.1], birch: [0.6, 0.8], pine: [0.9, 1.1], deadLarch: [0.9, 1.1], shrub: [0.3, 0.6] };

// Build one tree variant: { lod0: { bark, leaves }, lod1: { bark, leaves }, H, r0, radius }
export function makeTree(species, seed, o = {}) {
  const rng = mulberry32(seed);
  const tree = SPECIES[species](rng, o);
  const [texW, texH] = BARK_TEX[species];
  { // crown radius (90th percentile of card distance from the crown centre) for the AO term
    const d = tree.cards.map((c) => { const v = c.at.clone().sub(tree.crownC); v.y *= 0.6; return v.length(); }).sort((a, b) => a - b);
    tree.crownR = d.length ? d[Math.floor(d.length * 0.9)] + 0.3 : 3;
  }
  const out = { H: tree.H, r0: tree.r0, species };
  for (const lod of [0, 1]) {
    const bark = new Mesh(), leaves = new Mesh();
    const trunkRad = lod ? 5 : (species === 'shrub' ? 4 : 12);
    for (const limb of tree.limbs) {
      if (lod && limb.level === 2 && species !== 'shrub') continue;
      const radial = limb === tree.trunk ? trunkRad : limb.level === 1 ? (lod ? 3 : 5) : 3;
      const step = lod ? (limb === tree.trunk ? 3 : 2) : 1;
      const pts = step > 1 ? limb.pts.filter((_, k) => k % step === 0 || k === limb.pts.length - 1) : limb.pts;
      tube(bark, { ...limb, pts }, radial, tree, { texW, texH });
    }
    if (!lod) for (const st of tree.stubs) tube(bark, st, 3, tree, { texW, texH });
    tree.cards.forEach((c, k) => {
      if (lod && k % 3) return;
      card(leaves, lod ? { ...c, size: c.size * 1.6 } : c, tree, species === 'birch' ? Math.PI / 4 : 0.6);
    });
    out[`lod${lod}`] = { bark: bark.geometry(), leaves: tree.cards.length ? leaves.geometry() : null };
  }
  const bb = out.lod0.bark.boundingBox.clone();
  if (out.lod0.leaves) bb.union(out.lod0.leaves.boundingBox);
  out.box = bb;
  out.radius = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
  out.trunkR = tree.r0 * 1.05;
  out.skeleton = tree;
  return out;
}

// Loose bark tubes (fallen logs, stumps) with the tree attributes, from limbs { pts: [{ p, r, ao }] }.
export function limbsGeometry(limbs, { radial = 8, texW = 0.9, texH = 1.1, H = 1 } = {}) {
  const m = new Mesh();
  for (const l of limbs) tube(m, l, l.radial || radial, { H }, { texW, texH });
  return m.geometry();
}
export { grow, V as vec };
