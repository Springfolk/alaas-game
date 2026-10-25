// The hay meadow south of the yard, on the way to the lake: a long rail fence along its edge with
// the gate rails slid out where the path goes through, two round stacks with a central pole and one
// long stack held by rider poles, each in its own ring of rails ~2 m out; small heaps (копна) drying
// in rows, and windrows of fresh-cut grass on a mown strip.
import * as THREE from 'three/webgpu';
import { addLog, decalMat, fence, frame, geoPiece, jitterTint, mtx, patchGeo, TAU, wobbler } from './kit.js';

// colour a stack: weathered grey-brown on top and on the north-west, golden where sheltered
function stackColors(g, rng, ageTop = 0.4) {
  const p = g.attributes.position, n = g.attributes.normal;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i), nx = n.getX(i), nz = n.getZ(i);
    const weather = Math.max(0, -nz * 0.6 - nx * 0.4) * 0.5 + Math.max(0, ny) * ageTop;
    const s = 0.92 + Math.sin(p.getX(i) * 3.1 + p.getY(i) * 5.3) * 0.06;
    c[i * 3] = (1 - weather * 0.35) * s; c[i * 3 + 1] = (1 - weather * 0.32) * s; c[i * 3 + 2] = (1 - weather * 0.12) * s;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
}

// long stack (зарод): loaf of L × W × H, rounded ends, bulging sides
function longStack(L, W, H, rng) {
  const nu = 60, nv = 36;
  const nz = wobbler(rng, 5);
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu * 2 - 1;
    const e = Math.max(0, Math.abs(u) - 0.55) / 0.45;
    const endK = Math.sqrt(Math.max(0, 1 - e * e));
    for (let j = 0; j <= nv; j++) {
      const v = j / nv * Math.PI;
      const sv = Math.sin(v), cv = Math.cos(v);
      let s = W / 2 * cv * (1 + 0.1 * sv) * (sv < 0.25 ? 0.9 + sv * 0.4 : 1);
      let h = H * Math.pow(sv, 0.7);
      const k = 0.15 + 0.85 * endK;
      s *= k; h *= Math.pow(endK, 0.35);
      const d = 1 + 0.035 * nz(v * 3, u * 6) + 0.02 * Math.sin(u * 40 + v * 13) + 0.018 * Math.sin(u * 97 + v * 41) * Math.sin(v * 63 - u * 23);
      pos.push(u * L / 2 * (endK < 1 ? 1 - (1 - endK) * 0.04 : 1), h * d - 0.12 * (1 - sv), s * d);
      uvs.push(u * L / 2, v * W);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  stackColors(g, rng);
  return g;
}

// round stack (стог) or heap (копна): radius R at the bulge, height H, slight lean
function roundStack(R, H, rng, { seg = 48, rings = 28, point = 0.12 } = {}) {
  const nz = wobbler(rng, 5);
  const pos = [], uvs = [], idx = [];
  const lean = [(rng() - 0.5) * 0.08 * H, (rng() - 0.5) * 0.08 * H];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, y = t * H;
    // narrower foot, bulge at a third, domed top drawn into a point
    let r = t < 0.33 ? R * (0.86 + 0.14 * Math.sin(t / 0.33 * Math.PI / 2)) : R * Math.sqrt(Math.max(0, 1 - ((t - 0.33) / 0.67) ** 2.2));
    r = Math.max(r, R * point * (1 - t));
    for (let j = 0; j <= seg; j++) {
      const a = (j % seg) / seg * TAU;
      const d = 1 + 0.05 * nz(a, t * 5) + 0.025 * Math.sin(a * 17 + t * 30) + 0.02 * Math.sin(a * 53 + t * 71) * Math.sin(a * 31 - t * 47);
      pos.push(Math.cos(a) * r * d + lean[0] * t * t, y - 0.1 * (1 - t) ** 8, -Math.sin(a) * r * d + lean[1] * t * t);
      uvs.push(a * R, y * 1.2);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // weld the seam normals
  const n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i <= rings; i++) { const a = i * (seg + 1), b = a + seg; v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize(); n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z); }
  stackColors(g, rng, 0.3);
  return { g, lean };
}

// a windrow: a low wavy loaf of cut grass along a line
function windrow(ground, x0, z0, x1, z1, rng) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 0.4), m = 8;
  const dx = (x1 - x0) / L, dz = (z1 - z0) / L;
  const nz = wobbler(rng, 4);
  const pos = [], uvs = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const wob = nz(t * 20, 0) * 0.35;
    const w = 0.45 * (1 + 0.3 * nz(t * 31, 2)), h = 0.22 * (1 + 0.35 * nz(t * 27, 4)) * Math.min(1, Math.min(t, 1 - t) * L / 0.8);
    const cx = x0 + (x1 - x0) * t - dz * wob, cz = z0 + (z1 - z0) * t + dx * wob;
    for (let j = 0; j <= m; j++) {
      const v = j / m * Math.PI;
      const s = Math.cos(v) * w, y = Math.sin(v) ** 0.8 * h;
      const px = cx - dz * s, pz = cz + dx * s;
      pos.push(px, ground(px, pz) + y - 0.03, pz);
      uvs.push(t * L, v * w);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a = i * (m + 1) + j, b = a + m + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function hayMeadow(K) {
  const { M, rng } = K;
  const B = K.bm, gr = B.ground;
  const mats = { wood: M.wood, fresh: M.fresh, end: M.end, lash: M.lash };
  // baked (src/load/geocache.js): the geometry, colliders, mown strips and the target boxes (proxies made after)
  const { boxes, mown } = geoPiece(K, () => {
    const boxes = [], mown = [];
    // the meadow fence along its north edge, gate open where the lake path crosses
    const fpts = [];
    for (let fx = -72; fx <= 78; fx += 12) fpts.push([fx, 62 + Math.sin(fx * 0.07) * 1.6 + (rng() - 0.5) * 0.6]);
    K.colliders.push(...fence(B, gr, fpts, rng, mats, { gaps: [[K.gate[0], K.gate[1], 2.0]], bay: 3 }));

    // ring fences round the stacks
    const ring = (cx, cz, rx, rz, rot, n) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + rot + 0.4;
        // rectangle-ish ring (rails are straight between corners)
        const ca = Math.cos(a), sa = Math.sin(a);
        const k = 1 / Math.max(Math.abs(ca) / rx, Math.abs(sa) / rz);
        pts.push([cx + (ca * k) * Math.cos(rot) - (sa * k) * Math.sin(rot), cz + (ca * k) * Math.sin(rot) + (sa * k) * Math.cos(rot)]);
      }
      return pts;
    };

    // long stack with rider poles
    {
      const cx = -16, cz = 88, rot = 0.28, L = 5.2, W = 2.7, H = 3.3;
      const F = frame(B, cx, cz, -rot);
      const y0 = Math.min(F.ground(-L / 2, 0), F.ground(L / 2, 0), F.ground(0, 0));
      F.add(longStack(L, W, H, rng), M.hay, mtx([0, y0, 0]));
      // rider poles in crossed pairs every ~1.1 m, tied over the ridge
      for (let i = 0; i < 5; i++) {
        const px = -L / 2 + 0.6 + i * (L - 1.2) / 4;
        for (const sd of [-1, 1]) {
          const [ax, az] = F.tw(px + (rng() - 0.5) * 0.1, sd * (W / 2 + 0.05)), [bx, bz] = F.tw(px, -sd * 0.35);
          addLog(B, [ax, gr(ax, az) + 0.45, az], [bx, y0 + H + 0.45, bz], 0.035, 0.028, rng, M.darkwood, M.end, { seg: 6, step: 0.5, bend: 0.02 });
        }
      }
      K.colliders.push(F.col({ x: 0, z: 0, hw: L / 2 + 0.1, hd: W / 2 + 0.1 }));
      const pts = ring(cx, cz, L / 2 + 2.1, W / 2 + 2.1, rot, 4);
      K.colliders.push(...fence(B, gr, pts, rng, mats, { closed: true, bay: 3, rails: [0.45, 0.85, 1.25] }));
      boxes.push([cx, y0 + 1.5, cz, L, 3, W, -rot]);
    }
    // round stacks with their central pole (and two pairs of tie sticks over the top)
    for (const [cx, cz, R, H] of [[19, 97, 2.0, 3.7], [-8, 124, 1.8, 3.3]]) {
      const y0 = gr(cx, cz);
      const { g, lean } = roundStack(R, H, rng);
      B.add(g, M.hay, mtx([cx, y0, cz], [0, rng() * TAU, 0]));
      addLog(B, [cx, y0 - 0.3, cz], [cx + lean[0] * 0.9, y0 + H + 0.9, cz + lean[1] * 0.9], 0.06, 0.035, rng, M.darkwood, M.end, { seg: 7, bend: 0.01 });
      for (let k = 0; k < 2; k++) {
        const a = rng() * TAU;
        for (const sd of [-1, 1]) {
          const ax = cx + Math.cos(a) * sd * R * 0.75, az = cz + Math.sin(a) * sd * R * 0.75;
          addLog(B, [ax, y0 + H * 0.55, az], [cx - Math.cos(a) * sd * 0.25 + lean[0], y0 + H + 0.25, cz - Math.sin(a) * sd * 0.25 + lean[1]], 0.028, 0.022, rng, M.darkwood, null, { seg: 5, step: 0.5 });
        }
      }
      K.colliders.push({ x: cx, z: cz, r: R + 0.1 });
      const pts = ring(cx, cz, R + 2.1, R + 2.1, rng(), 6);
      K.colliders.push(...fence(B, gr, pts, rng, mats, { closed: true, bay: 3, rails: [0.45, 0.85, 1.25] }));
      boxes.push([cx, y0 + 1.6, cz, R * 2, 3.2, R * 2]);
    }

    // small heaps (копна) in rows on the mown east part
    const mownDecal = decalMat('withered_grass', { scale: 2.2, tint: 0xd9cfa8, strength: 0.85 });
    {
      const x0 = 27, z0 = 110;
      B.add(patchGeo(gr, x0 + 11, z0 + 13, 16, 17, 0.05, 30, 0.02), mownDecal);
      mown.push({ x: x0 + 11, z: z0 + 13, rx: 16, rz: 17 });
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (rng() < 0.12) continue;
        const hx = x0 + c * 7 + (rng() - 0.5) * 2, hz = z0 + r * 8 + (rng() - 0.5) * 2;
        const { g } = roundStack(0.7 + rng() * 0.15, 1.1 + rng() * 0.25, rng, { seg: 16, rings: 8, point: 0.25 });
        B.add(g, M.hay, mtx([hx, gr(hx, hz) - 0.02, hz], [0, rng() * TAU, 0]), jitterTint(rng, 0.08, [1.02, 1.04, 0.95]));
        K.colliders.push({ x: hx, z: hz, r: 0.65 });
      }
    }
    // windrows of fresh cut grass on the west strip
    {
      B.add(patchGeo(gr, -38, 113, 11, 21, 0, 28, 0.02), mownDecal);
      mown.push({ x: -38, z: 113, rx: 11, rz: 21 });
      for (let k = 0; k < 5; k++) {
        const wx = -46 + k * 4 + (rng() - 0.5);
        B.add(windrow(gr, wx, 95 + rng() * 2, wx + (rng() - 0.5) * 2, 131 - rng() * 3, rng), M.hayGreen, null, jitterTint(rng, 0.1));
      }
    }
    return { boxes, mown };
  });
  return { targets: boxes.map((b) => K.proxy(...b)), mown };
}
