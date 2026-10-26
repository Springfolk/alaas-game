// Биэ сэлэтэ: the mare-milking line on the meadow. A long horsehair rope (18 m) between two plain
// posts of human height, sagging to ~0.7 m; short tethers along it where the foals are tied so the
// mares stay near to be milked. The herd is out on pasture: only signs remain — hoof-trodden ground
// along the line, horse droppings, a halter dropped in the grass, a birch-bark milk pail by a post.
import * as THREE from 'three/webgpu';
import { turned, logProfile, bow, tube, sagCurve, strip, merge, tris, surfaceOf } from './yard/geo.js';
import { larch, rope, trodden, grass, plain, birchBark } from './yard/mat.js';
import { groundOf, troddenPatch, grassClump, noSway } from './yard/bits.js';
import { fbm } from '../util.js';

const TAU = Math.PI * 2;
const HALF = 9;       // posts at z = ±9 (rope runs N–S)
const TIE = 1.02;     // rope tied this high on the posts
const SAG = 0.32;

export default async function build(ctx, placement) {
  const { rng } = ctx;
  const ground = groundOf(ctx, placement);
  const object = new THREE.Group();
  object.name = 'sele';

  // ── posts ──
  const posts = [{ x: 0, z: -HALF }, { x: 0.15, z: HALF }];
  const wood = [];
  for (const p of posts) {
    p.gy = ground(p.x, p.z);
    const H = 1.62 + rng() * 0.12, L = H + 0.35;
    // the top hewn round and weathered (a flat sawn disc read as cardboard)
    const prof = logProfile(L, 0.085, 0.068, { step: 0.12 }).filter(([y]) => y < L - 0.05);
    for (let k = 0; k <= 6; k++) { const q = (k / 6) * Math.PI / 2; prof.push([L - 0.05 + Math.sin(q) * 0.045, 0.069 * Math.pow(Math.cos(q), 0.6) + 0.0005]); }
    const g = turned(prof, {
      radial: 16, rng, noise: 0.05, oval: 0.06, bend: bow(rng, H, 0.025),
      // hewn top, worn bright where the rope rubs, dark at the foot
      carve: (y, a) => (Math.abs(y - (TIE + 0.35)) < 0.03 ? -0.008 * (1 - Math.abs(y - TIE - 0.35) / 0.03) : 0) + Math.abs(Math.sin(a * 5 + y)) * -0.003,
      color: (y, a, c) => { const d = Math.max(0, Math.min(1, (0.55 - y) / 0.3)); const w = Math.abs(y - TIE - 0.35) < 0.06 ? 1.15 : 1; c[0] = 0.95 * w * (1 - d * 0.45); c[1] = 0.87 * w * (1 - d * 0.5); c[2] = 0.76 * w * (1 - d * 0.55); },
    });
    g.translate(p.x, p.gy - 0.35, p.z);
    wood.push(g);
  }
  const postGeo = merge(wood);
  const postMesh = new THREE.Mesh(postGeo, larch(ctx, { key: 'larch-sele', lichen: 0.4 }));
  postMesh.name = 'sele-posts'; postMesh.castShadow = true;
  object.add(postMesh);

  // ── the rope: wrapped twice round each post, then the long sagging span ──
  // laid on the posts' real surfaces (bent, oval), so the turns neither sink into the wood nor float off it
  const RR = 0.0065;
  for (const p of posts) p.surf = surfaceOf(postGeo, p.x, p.z);
  const on = (p, y, ang, out) => { const s = p.surf(y, ang), r = s.r + out; return new THREE.Vector3(s.cx + Math.cos(ang) * r, y, s.cz - Math.sin(ang) * r); };
  const ropes = [];
  // the span leaves each post on the side facing the other (a = −π/2 faces +z)
  const a = on(posts[0], posts[0].gy + TIE, -Math.PI / 2, RR).toArray(), b = on(posts[1], posts[1].gy + TIE, Math.PI / 2, RR).toArray();
  const span = sagCurve(a, b, SAG, 0.08, 0.04, rng);
  ropes.push(tube(span, RR, { radial: 7 }));
  for (const [p, dirz] of [[posts[0], 1], [posts[1], -1]]) {
    const pts = [];
    for (let k = 0; k <= 48; k++) {
      const t = k / 24, ang = t * TAU + (dirz > 0 ? Math.PI / 2 : -Math.PI / 2);
      pts.push(on(p, p.gy + TIE + 0.02 - t * 0.018, ang, RR + 0.0006));
    }
    ropes.push(tube(pts, RR, { radial: 7 }));
  }
  // things lying on the trodden earth sit on its sheet (troddenPatch lifts it 2.5 cm over the ground): under it,
  // the see-through sheet greyed them out
  const top = (x, z) => ground(x, z) + 0.027;
  // foal tethers every ~1.6 m: a knot on the line, a short rope hanging down to a loop
  const tethers = [];
  const along = (t) => span[Math.round(t * (span.length - 1))];
  for (let i = 1; i < 11; i++) {
    const t = i / 11 + (rng() - 0.5) * 0.02;
    const k = along(t);
    // the knot
    const knot = new THREE.SphereGeometry(0.012, 8, 6);
    knot.scale(1, 0.8, 1.4);
    knot.translate(k.x, k.y - 0.004, k.z);
    knot.setAttribute('color', new THREE.Float32BufferAttribute(new Array(knot.attributes.position.count * 3).fill(1), 3));
    tethers.push(knot);
    // the tether hangs, the end loop lies in the grass (some hang free)
    const lying = rng() < 0.6;
    const len = 0.7 + rng() * 0.3;
    const endY = lying ? top(k.x, k.z) + 0.005 : k.y - len * 0.75;
    const side = (rng() - 0.5) * 0.6;
    const end = [k.x + side, endY, k.z + (rng() - 0.5) * 0.3];
    const pts = sagCurve([k.x, k.y - 0.01, k.z], end, -0.06, 0.05, 0.01, rng);
    if (lying) pts.forEach((p) => { p.y = Math.max(p.y, top(p.x, p.z) + 0.004); });
    tethers.push(tube(pts, 0.0045, { radial: 6 }));
    // the loop at the free end
    const loop = [];
    const la = rng() * TAU;
    for (let j = 0; j <= 18; j++) {
      const u = (j / 18) * TAU;
      const r = 0.07;
      const lx = Math.cos(u) * r, lz = Math.sin(u) * r;
      const px = end[0] + Math.cos(la) * (lx + r) - Math.sin(la) * lz, pz = end[2] + Math.sin(la) * (lx + r) + Math.cos(la) * lz;
      loop.push(new THREE.Vector3(px, lying ? top(px, pz) + 0.004 : end[1] - Math.abs(lz) * 0.4 - (lx + r) * 0.9, lying ? pz : end[2] + lz * 0.3));
    }
    tethers.push(tube(loop, 0.0045, { radial: 6 }));
  }
  const ropeMesh = new THREE.Mesh(merge([...ropes, ...tethers].map(noSway)), rope({ key: 'sele-rope', colors: [0x2a221a, 0x3d3228, 0x5e5244], plies: 3, pitch: 0.04, radius: 0.0065, sheen: 0.4 }));
  ropeMesh.name = 'sele-rope';
  ropeMesh.castShadow = true;
  object.add(ropeMesh);

  // ── ground signs: trodden strip along the line, droppings, the halter, the pail ──
  const tg = troddenPatch(ground, -3.6, 3.6, -HALF - 2, HALF + 2, (x, z) => {
    const across = 1 - Math.abs(x - 0.07) / (2.6 + fbm(x * 0.3, z * 0.3, 21) * 0.8);
    const ends = Math.min(1, (HALF + 1.6 - Math.abs(z)) / 2);
    return across * 1.6 * ends;
  }, { step: 0.4 });
  const earth = new THREE.Mesh(tg, trodden(ctx, { key: 'trodden-sele', hoof: 1.5 }));
  earth.castShadow = false; earth.renderOrder = -1;
  object.add(earth);

  const dung = [];
  for (let c = 0; c < 6; c++) {
    const cx = (rng() - 0.5) * 3, cz = (rng() - 0.5) * 2 * (HALF - 1);
    const n = 5 + Math.floor(rng() * 6), old = rng() < 0.5;
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * 0.22, z = cz + (rng() - 0.5) * 0.22, r = 0.03 + rng() * 0.012;
      const g = new THREE.SphereGeometry(r, 10, 7);
      g.scale(1, 0.75, 1.15); g.rotateY(rng() * TAU);
      g.translate(x, top(x, z) + r * 0.25 + (i > n / 2 ? r * 0.8 : 0), z);
      const col = old ? [0.13, 0.11, 0.07] : [0.06, 0.05, 0.028];
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(col).flat(), 3));
      dung.push(g);
    }
  }
  const dungMesh = new THREE.Mesh(merge(dung), plain('dung', { roughness: 0.88, bump: 0.003, bumpFreq: 30 }));
  dungMesh.castShadow = false;
  object.add(dungMesh);

  // the halter (horsehair-and-leather): nose band and crown strap, crumpled in the grass, lead rope
  const hx = 1.1, hz = 1.8;
  const straps = [];
  const crumple = (cx, cz, rx, rz, rot, n, lift) => {
    const pts = [];
    for (let j = 0; j <= n; j++) {
      const u = (j / n) * TAU, r = 1 + Math.sin(u * 3 + rot) * 0.15;
      const x = cx + (Math.cos(u) * rx * Math.cos(rot) - Math.sin(u) * rz * Math.sin(rot)) * r;
      const z = cz + (Math.cos(u) * rx * Math.sin(rot) + Math.sin(u) * rz * Math.cos(rot)) * r;
      pts.push(new THREE.Vector3(x, top(x, z) + 0.002 + Math.max(0, Math.sin(u * 2 + rot)) * lift, z));
    }
    return pts;
  };
  straps.push(strip(crumple(hx, hz, 0.13, 0.09, 0.4, 28, 0.03), 0.026, { up: [0, 1, 0] }));
  straps.push(strip(crumple(hx + 0.17, hz + 0.08, 0.2, 0.12, 1.1, 32, 0.05), 0.024, { up: [0, 1, 0], twist: 0.6 }));
  straps.push(strip(sagCurve([hx + 0.1, top(hx + 0.1, hz - 0.08) + 0.004, hz - 0.08], [hx + 0.36, top(hx + 0.36, hz + 0.02) + 0.004, hz + 0.02], 0, 0.04), 0.024, { up: [0, 1, 0] }));
  for (const g of straps) setCol(g, [0.055, 0.032, 0.018]); // old dark leather
  // a wooden toggle fastening the nose band
  const toggle = turned(logProfile(0.07, 0.008, 0.007, { step: 0.035 }), { radial: 6, rng, noise: 0.03, capTop: true, capBottom: true });
  setCol(toggle, [0.3, 0.24, 0.16]); // ends too: the caps' pale end grain read as a white plastic peg
  toggle.rotateZ(Math.PI / 2); toggle.rotateY(0.7);
  toggle.translate(hx + 0.07, top(hx, hz) + 0.01, hz - 0.08);
  straps.push(toggle);
  const halterMesh = new THREE.Mesh(merge(straps), plain('leather', { roughness: 0.85, side: THREE.DoubleSide, bump: 0.0008, bumpFreq: 200 }));
  halterMesh.castShadow = false;
  object.add(halterMesh);
  // its lead rope trailing off in a lazy S
  const lead = [];
  for (let j = 0; j <= 40; j++) {
    const t = j / 40, x = hx + 0.3 + t * 1.3 + Math.sin(t * 5) * 0.18, z = hz - 0.1 - t * 0.7 + Math.cos(t * 4) * 0.12;
    lead.push(new THREE.Vector3(x, top(x, z) + 0.004, z));
  }
  const leadMesh = new THREE.Mesh(noSway(tube(lead, 0.006, { radial: 6 })), rope({ key: 'sele-rope', colors: [0x2a221a, 0x3d3228, 0x5e5244], plies: 3, pitch: 0.04, radius: 0.0065 }));
  leadMesh.castShadow = false;
  object.add(leadMesh);

  // the birch-bark milk pail (ыаҕас) by the south post, a little tilted in the grass
  const pail = buildPail(rng);
  const px = 0.45, pz = -HALF + 0.55;
  pail.position.set(px, ground(px, pz) - 0.005, pz);
  pail.rotation.set(0.04, rng() * TAU, -0.03);
  object.add(pail);

  // uncut grass round the post feet
  const gr = [];
  for (const p of posts) gr.push(grassClump(rng, ground, p.x, p.z, { n: 60, r: 0.35, h: 0.5 }));
  const grassMesh = new THREE.Mesh(merge(gr), grass());
  grassMesh.castShadow = false;
  object.add(grassMesh);

  // interaction: the whole line (a box hugging the rope span) and the pail
  const target = new THREE.Group();
  target.name = 'sele-line';
  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 2 * HALF + 0.4), new THREE.MeshBasicNodeMaterial({ visible: false }));
  hit.position.set(0.07, (posts[0].gy + posts[1].gy) / 2 + 0.75, 0);
  hit.visible = false;
  target.add(hit);
  object.add(target);
  object.remove(pail); target.add(pail);
  object.remove(postMesh); target.add(postMesh);

  object.userData.info = { tris: tris(ropeMesh.geometry) };
  return {
    object,
    colliders: posts.map((p) => ({ x: p.x, z: p.z, r: 0.11 })),
    floors: [],
    interactables: [{ entry: 'horse-and-cow', target }],
  };
}

function setCol(g, c) {
  const a = g.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c[0], c[1], c[2]);
}

// Ыаҕас: birch-bark pail, 30 cm tall, 26 → 22 cm across, wooden bottom, willow hoop at the rim
// bound with dark horsehair, a vertical stitched seam, and a bark handle.
function buildPail(rng) {
  const g = new THREE.Group();
  const H = 0.3, rt = 0.13, rb = 0.112, th = 0.005;
  const prof = [[0.0, rb], [0.06, rb + (rt - rb) * 0.2], [0.15, rb + (rt - rb) * 0.5], [0.24, rb + (rt - rb) * 0.8], [H, rt], [H + 0.002, rt - th / 2], [H, rt - th], [0.24, rb + (rt - rb) * 0.8 - th], [0.12, rb + (rt - rb) * 0.4 - th], [0.03, rb - th], [0.025, 0]];
  const body = turned(prof, { radial: 32, rng, noise: 0.012, oval: 0.03, tileU: 10, tileV: 1, color: (y, a, c) => { const d = y < 0.05 ? 0.7 : 1; c[0] = d; c[1] = d; c[2] = d; } });
  // bark uv: x around 0..1, y metres — tileU=10 makes uv.x ≈ 0..1 per circumference; keep as is
  const bark = new THREE.Mesh(body, birchBark('pail-bark'));
  bark.castShadow = true;
  g.add(bark);
  // the rim hoop and its zigzag binding
  const hoopPts = [];
  for (let k = 0; k <= 48; k++) { const a = (k / 48) * TAU; hoopPts.push(new THREE.Vector3(Math.cos(a) * (rt + 0.004), H - 0.012, -Math.sin(a) * (rt + 0.004))); }
  const hoop = tube(hoopPts, 0.006, { radial: 6 });
  const bind = [];
  for (let k = 0; k <= 240; k++) { const a = (k / 240) * TAU, up = (k % 2) ? 0.012 : -0.012; bind.push(new THREE.Vector3(Math.cos(a) * (rt + 0.0085), H - 0.012 + up, -Math.sin(a) * (rt + 0.0085))); }
  const binding = tube(bind, 0.0012, { radial: 4 });
  for (const v of [hoop]) setCol(v, [0.62, 0.52, 0.36]);
  setCol(binding, [0.08, 0.06, 0.05]);
  // seam stitches: a column of short dark dashes
  const st = [];
  for (let k = 0; k < 18; k++) {
    const y = 0.03 + k * 0.014, a = 0.05;
    const p0 = [Math.cos(a) * (rb + (rt - rb) * y / H + 0.0012), y, -Math.sin(a) * (rb + (rt - rb) * y / H + 0.0012)];
    const p1 = [Math.cos(a + 0.06) * (rb + (rt - rb) * y / H + 0.0012), y + 0.003, -Math.sin(a + 0.06) * (rb + (rt - rb) * y / H + 0.0012)];
    const s = tube([p0, p1], 0.0009, { radial: 3 });
    setCol(s, [0.07, 0.05, 0.04]);
    st.push(s);
  }
  const trim = new THREE.Mesh(merge([hoop, binding, ...st]), plain('pail-trim', { roughness: 0.6 }));
  trim.castShadow = false;
  g.add(trim);
  // milk film inside the bottom
  const milk = new THREE.Mesh(new THREE.CircleGeometry(rb - th - 0.002, 24), plain('milk', { roughness: 0.45 }));
  // creamy, not a grey mirror of the sky
  milk.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(milk.geometry.attributes.position.count).fill([0.9, 0.87, 0.77]).flat(), 3));
  milk.rotation.x = -Math.PI / 2; milk.position.y = 0.032;
  milk.castShadow = false;
  g.add(milk);
  return g;
}

