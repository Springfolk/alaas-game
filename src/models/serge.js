// Сэргэ: the homestead's row of three hitching posts, N–S, east of the house.
// Main post (тойон сэргэ, centre): 2.2 m larch after the Tabaga-cape сэргэ, three chip-carved bands (rhombs over
// teeth; twice arches over teeth), a narrowed waist where reins and the салама are tied, a choron-cup finial.
// Two smaller posts (орто сэргэ): 1.7 m, plain (no traced source for their carving), a neck groove, a rounded top.
// On the main neck: an old салама of twisted white+black mane hair with tufts, faded ribbons and a
// birch-bark horse; the player may tie one ribbon (white / light blue / green), which stays.
// On the north post: a coiled horsehair tether (кыл көнтөс) — the "horsehair" entry.
import * as THREE from 'three/webgpu';
import { turned, bow, tube, sagCurve, merge, tris, surfaceOf } from './yard/geo.js';
import { larch, rope, hair, cloth, birchBark, trodden, grass } from './yard/mat.js';
import { groundOf, troddenPatch, blob, tuft, ribbon, noSway, grassClump, choose, tween, ease } from './yard/bits.js';
import { section } from '../load/geocache.js';

const TAU = Math.PI * 2;
const SILVER = [0.97, 0.88, 0.76];
const RIBBONS = {
  white: { c: [0.86, 0.86, 0.82], swatch: '#f1efe8', label: { sah: 'үрүҥ', en: 'white', ru: 'белая' } },
  blue: { c: [0.38, 0.6, 0.86], swatch: '#8fb9e6', label: { sah: 'халлаан күөҕэ', en: 'light blue', ru: 'голубая' } },
  green: { c: [0.2, 0.5, 0.18], swatch: '#6fa860', label: { sah: 'от күөҕэ', en: 'green', ru: 'зелёная' } },
};

// V-groove ring centred at yc: width w, depth d
const groove = (y, yc, w, d) => { const t = Math.abs(y - yc) / (w / 2); return t < 1 ? -d * (1 - t) : 0; };
// seasoning cracks along the grain: thin V grooves wandering in angle
function cracks(rng, n, depth) {
  const cs = [];
  for (let i = 0; i < n; i++) cs.push({ a: rng() * TAU, y0: rng() * 0.6, y1: 1.2 + rng() * 0.9, w: 0.05 + rng() * 0.04, k: rng() * 9 });
  return (y, a) => {
    let o = 0;
    for (const c of cs) {
      if (y < c.y0 || y > c.y1) continue;
      const ca = c.a + Math.sin(y * 1.7 + c.k) * 0.06;
      let d = Math.abs(((a - ca + Math.PI) % TAU + TAU) % TAU - Math.PI);
      const fade = Math.min(1, (y - c.y0) / 0.3, (c.y1 - y) / 0.3);
      if (d < c.w) o -= depth * (1 - d / c.w) * fade;
    }
    return o;
  };
}

// Main post after the сэргэ on Tabaga cape (Trevbus, Commons, CC0; docs/patterns.md), scaled to 2.2 m: outline from
// the photo's silhouette, three chip-carved bands measured on it. Rows are the photo's pixels (crop of the 2928 px
// original from y = 223; ground at 3297), 0.68 mm each.
const TAB = (row) => (3297 - row) * 0.00068;
const MAIN_PROFILE = [
  // [height m, radius m]: shaft (thicker at the foot), the band-and-waist section, the choron-cup finial
  [-0.3, 0.098], [0, 0.098], [0.6, 0.091], [1.18, 0.083], [1.262, 0.082], [1.297, 0.0815], [1.304, 0.078], [1.31, 0.0705],
  [1.3172, 0.0729], [1.324, 0.0719], [1.3308, 0.0683], [1.3376, 0.0639], [1.3444, 0.06], [1.3512, 0.0573], [1.358, 0.0552], [1.3648, 0.0543],
  [1.3716, 0.0538], [1.3784, 0.053], [1.3852, 0.0534], [1.392, 0.0549], [1.3988, 0.0571], [1.4056, 0.0612], [1.4124, 0.0654], [1.4192, 0.0697],
  [1.426, 0.0709], [1.4328, 0.0712], [1.4396, 0.0767], [1.4464, 0.079], [1.6, 0.079], [1.902, 0.0742],
  [1.9074, 0.071], [1.9156, 0.0645], [1.9237, 0.05], [1.9319, 0.035], [1.94, 0.0278], [1.9482, 0.0265], [1.9564, 0.0236], [1.9645, 0.0223],
  [1.9727, 0.0303], [1.9808, 0.0376], [1.989, 0.0437], [1.9972, 0.0492], [2.0053, 0.0538], [2.0135, 0.0571], [2.0216, 0.0605], [2.0298, 0.0624],
  [2.038, 0.0636], [2.0543, 0.0648], [2.0706, 0.0635], [2.0869, 0.0584], [2.0951, 0.056], [2.1114, 0.049], [2.1277, 0.0475], [2.144, 0.0515],
  [2.1604, 0.0549], [2.1767, 0.0571], [2.1848, 0.0544], [2.193, 0.0479], [2.2012, 0.042], [2.199, 0.037], [2.17, 0.042], [2.13, 0.03], [2.11, 0.0],
];
const mainR = (y) => { const P = MAIN_PROFILE; for (let i = 1; i < 30; i++) if (y <= P[i][0]) return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * (y - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return 0.074; };
// The bands, top to bottom: [top row, bottom row, kind, repeats round the post]. Between rows a raised line with a
// groove each side. rh: a row of rhombs touching both lines; teeth: raised teeth, a cut dome on the bottom line and
// a cut notch on the top line between each two; arch: raised arches with a cut half-disc inside, cut spandrels and a
// raised diamond over each join.
const MAIN_BANDS = [[510, 550, 'rh', 14], [560, 598, 'teeth', 14], [970, 1018, 'arch', 10], [1025, 1062, 'teeth', 18], [1448, 1492, 'arch', 10], [1502, 1540, 'teeth', 18]];
const MAIN_LINES = [505, 555, 603, 966, 1021, 1066, 1095, 1125, 1180, 1442, 1497, 1547];
const motif = (kind, u, v) => { // u −0.5..0.5 across one repeat, v 0 (bottom) .. 1 (top) → 1 = cut
  const au = Math.abs(u);
  if (kind === 'rh') return au / 0.5 + Math.abs(v - 0.5) / 0.5 > 1 ? 1 : 0;
  if (kind === 'teeth') {
    const g = 0.5 - au; // distance from the gap between teeth
    if ((g / 0.4) ** 2 + (v / 0.55) ** 2 < 1) return 1;
    return v > 1 - 0.3 * (1 - g / 0.25) ? 1 : 0;
  }
  // arch
  const g = 0.5 - au;
  if ((g / 0.12) + Math.abs(v - 0.73) / 0.27 < 1) return 0; // diamond over the join
  if ((u / 0.37) ** 2 + (v / 0.4) ** 2 < 1) return 1; // half-disc inside
  return (u / 0.5) ** 2 + v * v < 1 ? 0 : 1;
};

function mainPost(rng, gy) {
  const ys = new Set();
  for (let y = -0.3; y < 1.9; y += 0.06) ys.add(+y.toFixed(3));
  for (const [a, b] of MAIN_BANDS) for (let y = TAB(b) - 0.006; y <= TAB(a) + 0.006; y += 0.002) ys.add(+y.toFixed(4));
  for (let y = 1.26; y <= 1.5; y += 0.006) ys.add(+y.toFixed(4));
  const prof = [...ys].filter((y) => y < 1.902).sort((a, b) => a - b).map((y) => [y, mainR(y)]);
  for (const [y, r] of MAIN_PROFILE) if (y >= 1.902) prof.push([y, r]);
  const crk = cracks(rng, 3, 0.007);
  const D = 0.005; // depth of the chip carving
  const cutAt = (y, a) => { // 4×4 supersampled over one vertex cell, so the cut edges are smooth
    for (const [top, bot, kind, n] of MAIN_BANDS) {
      const y0 = TAB(bot), y1 = TAB(top);
      if (y < y0 - 0.002 || y > y1 + 0.002) continue;
      let s = 0;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const yy = y + (i - 1.5) * 0.0005, aa = a + (j - 1.5) * TAU / 160 / 4;
        if (yy >= y0 && yy <= y1) s += motif(kind, (((aa / TAU) * n + 0.5) % 1 + 1) % 1 - 0.5, (yy - y0) / (y1 - y0));
      }
      return s / 16;
    }
    return 0;
  };
  const carve = (y, a) => {
    let o = -D * cutAt(y, a);
    for (const row of MAIN_LINES) o += groove(y, TAB(row) + 0.0025, 0.004, 0.002) + groove(y, TAB(row) - 0.0025, 0.004, 0.002);
    if (y < 1.18) o += crk(y, a) + Math.abs(Math.sin(a * 7 + y * 0.6)) * -0.0025; // cracks, axe facets
    return o;
  };
  const g = turned(prof, {
    radial: 160, rng, noise: 0.012, oval: 0.02, carve, tileU: 0.42, tileV: 0.8,
    bend: bow(rng, 2.2, 0.012),
    color: (y, a, c) => groundTone(y, c, 1, (y > 1.35 && y < 1.41 ? 1.22 : 1) * (1 - 0.55 * cutAt(y, a))), // weathered dirt in the cuts
  });
  g.translate(0, gy, 0);
  return g;
}

function smallPost(rng, gy, H) {
  const ys = new Set();
  for (let y = -0.3; y < H - 0.12; y += 0.07) ys.add(+y.toFixed(3));
  for (let y = H - 0.27; y <= H - 0.13; y += 0.006) ys.add(+y.toFixed(4));
  const prof = [...ys].sort((a, b) => a - b).map((y) => [y, 0.088 - 0.016 * Math.max(0, y) / H]);
  // rounded top
  for (let k = 0; k <= 8; k++) { const t = k / 8, a = t * Math.PI / 2; prof.push([H - 0.12 + Math.sin(a) * 0.07, 0.074 * Math.pow(Math.cos(a), 0.8) + 0.0005]); }
  const crk = cracks(rng, 2, 0.006);
  const nk = H - 0.2;
  const carve = (y, a) => {
    let o = 0;
    o += groove(y, nk, 0.045, 0.02) + groove(y, nk - 0.05, 0.012, 0.006);
    if (y < 1.1) o += crk(y, a) + Math.abs(Math.sin(a * 6 + y)) * -0.002;
    return o;
  };
  const g = turned(prof, { radial: 40, rng, noise: 0.03, oval: 0.04, carve, tileU: 0.42, tileV: 0.8, bend: bow(rng, H, 0.015), color: (y, a, c) => groundTone(y, c, 0.95, Math.abs(y - nk) < 0.04 ? 1.15 : 1) });
  g.translate(0, gy, 0);
  return g;
}

// earth splash and damp at the foot, wear brightening where hands and reins rub
function groundTone(y, c, k, wear) {
  const dirt = Math.max(0, Math.min(1, (0.18 - y) / 0.2));
  c[0] = SILVER[0] * k * wear * (1 - dirt * 0.45);
  c[1] = SILVER[1] * k * wear * (1 - dirt * 0.5);
  c[2] = SILVER[2] * k * wear * (1 - dirt * 0.58);
}

export default async function build(ctx, placement) {
  const { rng } = ctx;
  const ground = groundOf(ctx, placement);
  const object = new THREE.Group();
  object.name = 'serge';

  const posts = [
    { x: 0.05, z: 0, main: true },
    { x: -0.1, z: -2.45, H: 1.72 },
    { x: 0.08, z: 2.4, H: 1.66 },
  ];
  for (const p of posts) p.gy = ground(p.x, p.z);
  // the geometry runs in section()s, which a bake stands in for (src/load/geocache.js)
  const postsGeo = section(() => {
    const wood = [];
    for (const p of posts) {
      const g = p.main ? mainPost(rng, p.gy) : smallPost(rng, p.gy, p.H);
      g.rotateY(rng() * TAU);
      g.translate(p.x, 0, p.z);
      wood.push(g);
    }
    return merge(wood);
  });
  const postsMesh = new THREE.Mesh(postsGeo, larch(ctx, { lichen: 0.45 }));
  postsMesh.name = 'serge-posts'; postsMesh.castShadow = true;
  object.add(postsMesh);

  // ── салама on the main neck ──
  const M = posts[0];
  const ny = M.gy + 1.378, nr = 0.054; // the waist of the main post
  const sg = section(() => {
    const sal = [], hairs = [], cloths = [], bark = [];
    // laid on the post's real surface (bent, oval, turned), so the cord neither sinks into the wood nor floats
    const surf = surfaceOf(postsGeo, M.x, M.z);
    const on = (y, a, out) => { const s = surf(y, a), r = s.r + out; return new THREE.Vector3(s.cx + Math.cos(a) * r, y, s.cz - Math.sin(a) * r); };
    const knot = on(ny + 0.002, 0, 0.006).add(new THREE.Vector3(0, 0, 0.004));
    // the loop around the neck, slightly tilted, crossing at a knot on the east face
    const loop = [];
    for (let k = 0; k <= 40; k++) {
      const a = (k / 40) * TAU;
      loop.push(on(ny + Math.sin(a + 0.6) * 0.008 + (k / 40) * 0.006, a, 0.0034));
    }
    sal.push(tube(loop, 0.0028, { radial: 6 }));
    // two tails hanging from the knot down the east face, one longer, curving with the post
    const tails = [];
    for (const [len, side] of [[0.62, -1], [0.44, 1]]) {
      const pts = [];
      for (let k = 0; k <= 30; k++) {
        const t = k / 30;
        pts.push(on(knot.y - t * len, side * (0.12 + t * 0.35), 0.0034 + t * 0.03)); // swinging out a little
      }
      tails.push(pts);
      sal.push(tube(pts, (t) => 0.0028 * (1 - t * 0.2), { radial: 6 }));
    }
    // hangings along the tails: tufts white/black, two faded ribbons, a birch-bark horse
    const at = (pts, t) => pts[Math.round(t * (pts.length - 1))].toArray();
    hairs.push(...tuft(rng, at(tails[0], 0.25), { len: 0.15, color: [0.86, 0.83, 0.74] }));
    hairs.push(...tuft(rng, at(tails[0], 0.62), { len: 0.13, color: [0.84, 0.82, 0.76] }));
    hairs.push(...tuft(rng, at(tails[1], 0.45), { len: 0.12, color: [0.03, 0.028, 0.025] }));
    hairs.push(...tuft(rng, at(tails[0], 1), { len: 0.11, color: [0.8, 0.77, 0.7], locks: 8 }));
    hairs.push(...tuft(rng, at(tails[1], 1), { len: 0.1, color: [0.05, 0.045, 0.04], locks: 8 }));
    cloths.push(ribbon(rng, at(tails[1], 0.18), { len: 0.19, color: [0.62, 0.63, 0.6] }));        // old white, greyed
    cloths.push(ribbon(rng, at(tails[0], 0.45), { len: 0.2, color: [0.36, 0.48, 0.6] }));        // faded light blue
    cloths.push(ribbon(rng, at(tails[1], 0.75), { len: 0.16, color: [0.6, 0.62, 0.48], width: 0.022 })); // sun-bleached green
    // birch-bark horse silhouette (~6 cm), tied on a short thread
    bark.push(horseCutout(at(tails[0], 0.82)));
    return { rope: merge(sal.map(noSway)), hair: merge(hairs), cloth: merge(cloths), bark: merge(bark), knot: knot.toArray() };
  });
  const knot = new THREE.Vector3(...(sg.knot || [M.x + nr + 0.006, ny + 0.002, M.z + 0.004]));

  const salRope = new THREE.Mesh(sg.rope, rope({ key: 'salama', colors: [0xe9e4d6, 0x1a1712], plies: 2, pitch: 0.02, radius: 0.0028 }));
  const salHair = new THREE.Mesh(sg.hair, hair('serge-hair'));
  const salCloth = new THREE.Mesh(sg.cloth, cloth('serge-cloth'));
  const salBark = new THREE.Mesh(sg.bark, birchBark('serge-bark'));
  for (const m of [salRope, salHair, salCloth, salBark]) m.castShadow = false;

  // the player's ribbon, tied at the knot (hidden until tied)
  const mine = new THREE.Mesh(ribbon(rng, knot.clone().add(new THREE.Vector3(0.004, -0.004, -0.01)).toArray(), { len: 0.22, width: 0.026, color: [1, 1, 1], dir: [0.25, -1, -0.05] }), cloth('serge-mine'));
  mine.visible = false; mine.castShadow = false;
  mine.geometry.attributes.color.setUsage(THREE.DynamicDrawUsage); // painted at the act (src/load/release.js keeps it)
  const salama = new THREE.Group();
  salama.name = 'salama';
  salama.add(salRope, salHair, salCloth, salBark, mine);
  object.add(salama);

  // hit volumes (invisible): the neck with its salama, and the horsehair coil
  const hitMat = new THREE.MeshBasicNodeMaterial({ visible: false });
  const salHit = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.75, 10), hitMat);
  salHit.position.set(M.x + 0.03, ny - 0.28, M.z); salHit.visible = false;
  salama.add(salHit);

  // ── horsehair tether coiled over the north post's neck ──
  const N = posts[1];
  const coilY = N.gy + N.H - 0.2;
  const cg = section(() => {
    const coil = [], RR = 0.006;
    const surf = surfaceOf(postsGeo, N.x, N.z);
    // push a point out of the post's real surface, so no turn cuts into the wood
    const clear = (v) => {
      const c = surf(v.y, 0), dx = v.x - c.cx, dz = v.z - c.cz, d = Math.hypot(dx, dz) || 1;
      const r = surf(v.y, Math.atan2(-dz, dx)).r + RR + 0.001;
      if (d < r) { v.x = c.cx + (dx / d) * r; v.z = c.cz + (dz / d) * r; }
      return v;
    };
    // each turn rings the neck: it rests in the groove on the east face and hangs down past the west face
    for (let l = 0; l < 4; l++) {
      const pts = [], drop = 0.3 + l * 0.035 + rng() * 0.02, W = 0.1 + l * 0.012;
      const aT = (l - 1.5) * 0.14, yT = coilY + (l - 1.5) * 0.011, c = surf(yT, aT), rE = c.r + RR;
      const ex = Math.cos(aT), ez = -Math.sin(aT); // east (top) direction and its perpendicular
      for (let k = 0; k <= 36; k++) {
        const u = (k / 36) * TAU, hang = (1 - Math.cos(u)) / 2;
        const along = Math.cos(u) * rE - hang * (0.05 + l * 0.01), across = Math.sin(u) * W * (0.8 + hang * 0.2);
        pts.push(clear(new THREE.Vector3(c.cx + ex * along - ez * across, yT - hang * drop, c.cz + ez * along + ex * across)));
      }
      coil.push(tube(pts, RR, { radial: 7, closed: false }));
    }
    // the free end leaves the groove on the north-west and hangs down with a frayed tip
    const c0 = surf(coilY, 2.2);
    const endPts = sagCurve([c0.cx + Math.cos(2.2) * (c0.r + RR), coilY - 0.01, c0.cz - Math.sin(2.2) * (c0.r + RR)], [N.x - 0.14, coilY - 0.62, N.z - 0.11], -0.03, 0.03).map(clear);
    coil.push(tube(endPts, RR, { radial: 7 }));
    return { coil: merge(coil.map(noSway)), tip: merge(tuft(rng, endPts[endPts.length - 1].toArray(), { len: 0.06, color: [0.07, 0.055, 0.04], locks: 6, spread: 0.005 })) };
  });
  const coilMesh = new THREE.Mesh(cg.coil, rope({ key: 'tether', colors: [0x231c15, 0x3a2e22, 0x15110d], plies: 3, pitch: 0.035, radius: 0.006 }));
  const coilTip = new THREE.Mesh(cg.tip, hair('serge-hair'));
  const coilGroup = new THREE.Group();
  coilGroup.name = 'horsehair';
  coilGroup.add(coilMesh, coilTip);
  const coilHit = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.6, 0.26), hitMat);
  coilHit.position.set(N.x - 0.05, coilY - 0.25, N.z); coilHit.visible = false;
  coilGroup.add(coilHit);
  object.add(coilGroup);

  // ── ground: hoof-trodden earth along the row; uncut grass at the post feet ──
  const eg = section(() => {
    const tg = troddenPatch(ground, -2.2, 3.4, -4.4, 4.4, (x, z) => {
      let c = blob(0.9, 0, 2.2, 4.1, 11)(x, z);
      for (const p of posts) c = Math.max(c, blob(p.x, p.z, 0.55, 0.55, 3)(x, z) * 0.9);
      return c;
    }, { step: 0.3 });
    const gr = [];
    for (const p of posts) gr.push(grassClump(rng, ground, p.x - 0.05, p.z, { n: 26, r: 0.16, h: 0.32 }));
    return { tg, grass: merge(gr) };
  });
  const earth = new THREE.Mesh(eg.tg, trodden(ctx, { key: 'trodden-serge', hoof: 1 }));
  earth.receiveShadow = true; earth.castShadow = false; earth.renderOrder = -1;
  object.add(earth);
  const grassMesh = new THREE.Mesh(eg.grass, grass());
  grassMesh.castShadow = false;
  object.add(grassMesh);

  // ── interactions ──
  const restore = (game) => {
    const c = game?.save?.yard?.ribbon;
    if (c && RIBBONS[c] && !mine.visible) { paint(mine.geometry, RIBBONS[c].c); mine.visible = true; mine.scale.setScalar(1); }
  };
  const doneKey = 'salama:ribbon';
  const tie = {
    id: 'ribbon', once: true, freeze: true, // the colour choice holds the player still
    label: { sah: 'лиэнтэ баай', en: 'tie a ribbon', ru: 'повязать ленточку' },
    run: async (game) => {
      const pick = await choose(game, { sah: 'Ханнык өҥнөөх лиэнтэни баайаҕын?', en: 'Which ribbon will you tie?', ru: 'Какую ленточку повязать?' },
        Object.entries(RIBBONS).map(([id, r]) => ({ id, label: r.label, swatch: r.swatch })));
      if (!pick) { setTimeout(() => { game?.done?.delete(doneKey); game?.persist?.(); }, 0); return; }
      paint(mine.geometry, RIBBONS[pick].c);
      mine.visible = true;
      // tied at the knot: the ribbon unrolls from it
      const k = knot;
      mine.position.copy(k).multiplyScalar(0); // geometry is already in place; scale about the knot
      game?.audio?.play('ribbon', object.localToWorld(k.clone()));
      await tween(1.3, (t) => {
        const e = ease(t);
        mine.scale.set(1, Math.max(0.02, e), 1);
        mine.position.set(k.x * (1 - 1), k.y * (1 - e), 0);
      });
      mine.position.set(0, 0, 0); mine.scale.setScalar(1);
      if (game?.save) { game.save.yard = { ...(game.save.yard || {}), ribbon: pick }; game.persist?.(); }
    },
  };

  let restored = false;
  const info = { tris: tris(postsMesh.geometry) };
  object.userData.info = info;

  return {
    object,
    colliders: posts.map((p) => ({ x: p.x, z: p.z, r: p.main ? 0.13 : 0.1 })),
    floors: [],
    interactables: [
      { entry: 'salama', target: salama, act: tie },
      { entry: 'horsehair', target: coilGroup },
      { entry: 'serge', target: postsMesh },
    ],
    update: (dt, { game }) => { if (!restored && game) { restored = true; restore(game); } },
  };
}

function paint(g, c) {
  const a = g.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c[0], c[1], c[2]);
  a.needsUpdate = true;
}

// A small horse cut from birch bark (~6 cm long), hanging edge-on from a thread.
function horseCutout(at) {
  // outline in cm, side view, nose to the right
  const o = [[-3, 0], [-2.6, 1.2], [-3.4, 2.2], [-2.4, 2.0], [-1.6, 2.4], [1.2, 2.5], [2.2, 3.6], [3.2, 3.2], [3.0, 2.6], [2.0, 2.0], [1.8, 0.8], [1.7, -1.0], [1.2, -1.0], [1.0, 0.5], [-1.4, 0.6], [-1.8, -1.0], [-2.3, -1.0], [-2.3, 0.2]];
  const shape = new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x / 100, y / 100)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.002, bevelEnabled: false });
  g.translate(0, -0.035, -0.001);
  g.rotateY(Math.PI / 2 + 0.4);
  g.translate(at[0] + 0.005, at[1] - 0.005, at[2]);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  // uv: metres
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < n; i++) uv.setXY(i, p.getZ(i) * 8, p.getY(i) * 2);
  const thread = tube([[at[0], at[1] + 0.004, at[2]], [at[0] + 0.004, at[1] - 0.012, at[2]]], 0.0007, { radial: 4 });
  thread.deleteAttribute('normal'); thread.computeVertexNormals();
  return merge([g, thread].map((x) => (x.index ? x : indexed(x))));
}

function indexed(g) {
  const n = g.attributes.position.count;
  g.setIndex([...Array(n).keys()]);
  return g;
}
