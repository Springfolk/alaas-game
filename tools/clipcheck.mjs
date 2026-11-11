// Clipping check: loads the world headless (generated geometry, vertex data kept, no merging) and reports, per
// connected part of every placed model (welded triangles): parts floating (no contact with the ground or
// another part), sunk into the ground, bottoms gaping over the ground, pairs of parts interpenetrating,
// near-coplanar overlapping faces (z-fighting, also with the ground), and walkable eye spots too near geometry.
// Usage: PORT=5195 node tools/clipcheck.mjs [out.json] (TOP=n rows per list) — env: MODEL=regex (placements to check), STATE=js (run
// in the page before the check, e.g. a door opened), CAMERA=0 (skip the eye sweep), QUERY=extra url flags.
import { writeFileSync } from 'node:fs';
import { launch, PORT } from './browser.mjs';

const out = process.argv[2] || 'clipcheck.json';
const browser = await launch('chrome');
const page = await browser.newPage({ viewport: { width: 480, height: 300 } });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(`http://127.0.0.1:${PORT}/?auto&nogeo&keepgeo&nomerge&q=low${process.env.QUERY || ''}`);
await page.waitForFunction(() => window.game?.complete, null, { timeout: 400000 });
if (process.env.STATE) await page.evaluate(process.env.STATE);
await page.waitForTimeout(500);

const report = await page.evaluate(({ only, camera }) => {
  const TOL = { float: 0.015, touch: 0.03, sunk: 0.05, gap: 0.04, pen: 0.01, z: 0.0003, eye: 0.12, R: 0.25 };
  const SKIP = /grass|dyedyen|smoke|steam|^decal|trodden|^earth$/i; // ground cover, decals and particles: not solids
  const w = window.game.world, C = 0.25, cell = (v) => Math.floor(v / C), key = (ix, iz) => (ix + 4000) * 8000 + (iz + 4000);
  const tris = [], triComp = [], comps = [];
  const grid = new Map(), col = new Map(), cols = new Set(); // 3D cells of every triangle; columns of closed parts' triangles (parity)
  const key3 = (ix, iy, iz) => ((ix + 4000) * 8000 + iz + 4000) * 2000 + iy + 1000;
  const near3 = function* (x, y, z, r = 1) { const a = cell(x), b = cell(y), c = cell(z); for (let i = a - r; i <= a + r; i++) for (let j = b - r; j <= b + r; j++) for (let k = c - r; k <= c + r; k++) { const l = grid.get(key3(i, j, k)); if (l) yield l; } };
  const put = (g, k, i) => { let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); };

  // ---- gather visible solid meshes, split into welded connected parts
  const placed = w.placed.map((p, i) => ({ i, name: p.model + (p.variant ? ':' + p.variant : ''), p }));
  // loose things in the scene itself (carried and set-down things, work props): not the placed models, ground or nature
  const own = new Set(w.placed.map((p) => p.object)), home = w.placed[0];
  for (const o of w.scene.children) {
    if (own.has(o) || o === w.ground || o.isLight || /forest|grass|tree|lake|life|sky|impost|shadow|ground|meadow|shore/i.test(o.name)) continue;
    const s = new o.position.constructor(); o.getWorldPosition(s);
    if (Math.hypot(s.x - home.x, s.z - home.z) > 150) continue;
    placed.push({ name: 'loose/' + (o.name || o.type), p: { object: o } });
  }
  for (const { name, p } of placed) {
    if (only && !new RegExp(only).test(name)) continue;
    const inv = p.object.matrixWorld.clone().invert();
    p.object.traverse((o) => {
      if (!o.isMesh) return;
      for (let q = o; q; q = q.parent) if (!q.visible) return;
      const m = o.material;
      if (Array.isArray(m) || m.visible === false || m.colorWrite === false || m.transparent && (m.opacity < 0.05 || !m.depthWrite)) return; // proxies, particles, glows
      const label = `${name}/${o.name || '-'}|${m.name || '-'}`;
      if (SKIP.test(o.name) || SKIP.test(m.name)) return;
      const pos = o.geometry.attributes.position;
      if (!pos?.array?.length) return;
      const idx = o.geometry.index?.array;
      const n = idx ? idx.length : pos.count;
      const mats = o.isInstancedMesh ? Array.from({ length: o.count }, (_, k) => { const M = new o.matrixWorld.constructor(); o.getMatrixAt(k, M); return M.premultiply(o.matrixWorld); }) : [o.matrixWorld];
      for (const M of mats) {
        const e = M.elements, P = new Float64Array(pos.count * 3);
        for (let k = 0; k < pos.count; k++) {
          const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
          P[k * 3] = e[0] * x + e[4] * y + e[8] * z + e[12]; P[k * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]; P[k * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        }
        // weld by position (0.2 mm), union-find over triangles
        const wid = new Int32Array(pos.count), wmap = new Map(); let nw = 0;
        for (let k = 0; k < pos.count; k++) {
          const h = `${Math.round(P[k * 3] * 5000)},${Math.round(P[k * 3 + 1] * 5000)},${Math.round(P[k * 3 + 2] * 5000)}`;
          let id = wmap.get(h); if (id === undefined) wmap.set(h, (id = nw++)); wid[k] = id;
        }
        const par = new Int32Array(nw).map((_, k) => k);
        const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
        const vi = (t, j) => (idx ? idx[t * 3 + j] : t * 3 + j);
        for (let t = 0; t < n / 3; t++) { const a = find(wid[vi(t, 0)]); par[find(wid[vi(t, 1)])] = a; par[find(wid[vi(t, 2)])] = a; }
        const byRoot = new Map();
        for (let t = 0; t < n / 3; t++) {
          const r = find(wid[vi(t, 0)]);
          let c = byRoot.get(r);
          if (!c) byRoot.set(r, (c = { label, model: name, mesh: o, tris: [], edges: new Map(), verts: new Map(), double: m.side === 2, offset: !!m.polygonOffset, cut: m.alphaTest > 0, dyn: !!o.userData.dynamic, inv }));
          const ids = [vi(t, 0), vi(t, 1), vi(t, 2)];
          const ax = P[ids[0] * 3], ay = P[ids[0] * 3 + 1], az = P[ids[0] * 3 + 2];
          const ux = P[ids[1] * 3] - ax, uy = P[ids[1] * 3 + 1] - ay, uz = P[ids[1] * 3 + 2] - az;
          const vx = P[ids[2] * 3] - ax, vy = P[ids[2] * 3 + 1] - ay, vz = P[ids[2] * 3 + 2] - az;
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, a2 = Math.hypot(nx, ny, nz);
          if (a2 < 1e-10) continue;
          c.tris.push(ids.map((k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]).flat().concat([nx / a2, ny / a2, nz / a2, a2 / 2]));
          for (let j = 0; j < 3; j++) {
            const a = wid[ids[j]], b = wid[ids[(j + 1) % 3]], ek = a < b ? a * 1e7 + b : b * 1e7 + a;
            c.edges.set(ek, (c.edges.get(ek) || 0) + 1);
            c.verts.set(wid[ids[j]], ids[j] * 3);
          }
          c.P = P;
        }
        for (const c of byRoot.values()) {
          if (!c.tris.length) continue;
          let open = 0; for (const v of c.edges.values()) if (v % 2) open++;
          c.closed = open <= c.edges.size * 0.003;
          c.vs = [...c.verts.values()].map((k) => [c.P[k], c.P[k + 1], c.P[k + 2]]);
          const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
          for (const v of c.vs) for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], v[j]); hi[j] = Math.max(hi[j], v[j]); }
          c.lo = lo; c.hi = hi; c.id = comps.length; c.t0 = tris.length;
          delete c.edges; delete c.verts; delete c.P;
          for (const t of c.tris) { tris.push(t); triComp.push(c.id); }
          c.nt = c.tris.length; delete c.tris;
          comps.push(c);
        }
      }
    });
  }
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i];
    const closed = comps[triComp[i]].closed;
    for (let ix = cell(Math.min(t[0], t[3], t[6])); ix <= cell(Math.max(t[0], t[3], t[6])); ix++)
      for (let iz = cell(Math.min(t[2], t[5], t[8])); iz <= cell(Math.max(t[2], t[5], t[8])); iz++) {
        if (closed) put(col, key(ix, iz), i);
        cols.add(key(ix, iz));
        for (let iy = cell(Math.min(t[1], t[4], t[7])); iy <= cell(Math.max(t[1], t[4], t[7])); iy++) put(grid, key3(ix, iy, iz), i);
      }
  }

  // ---- the rendered ground: its own triangles (the grid between its nodes is not terrain.height)
  const gtris = [], ggrid = new Map();
  const near = (x, z) => comps.some((c) => x > c.lo[0] - 3 && x < c.hi[0] + 3 && z > c.lo[2] - 3 && z < c.hi[2] + 3);
  w.ground.traverse((o) => {
    if (!o.isMesh || !o.geometry.attributes.position?.array?.length) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index?.array, e = o.matrixWorld.elements;
    const n = idx ? idx.length : pos.count, seen = new Set();
    for (let t = 0; t < n / 3; t++) {
      const v = [0, 1, 2].map((j) => { const k = idx ? idx[t * 3 + j] : t * 3 + j, x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k); return [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; });
      if (!near(v[0][0], v[0][2])) continue;
      const k = v.flat().map((q) => q.toFixed(3)).join(); if (seen.has(k)) continue; seen.add(k);
      const i = gtris.push(v.flat()) - 1;
      for (let ix = cell(Math.min(v[0][0], v[1][0], v[2][0])); ix <= cell(Math.max(v[0][0], v[1][0], v[2][0])); ix++)
        for (let iz = cell(Math.min(v[0][2], v[1][2], v[2][2])); iz <= cell(Math.max(v[0][2], v[1][2], v[2][2])); iz++) put(ggrid, key(ix, iz), i);
    }
  });
  const bary = (t, x, z) => { // y of triangle t (9 floats) at (x, z), or null
    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
    if (Math.abs(d) < 1e-12) return null;
    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d, b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d, c = 1 - a - b;
    return a >= -1e-9 && b >= -1e-9 && c >= -1e-9 ? a * t[1] + b * t[4] + c * t[7] : null;
  };
  const groundY = (x, z) => { for (const i of ggrid.get(key(cell(x), cell(z))) || []) { const y = bary(gtris[i], x, z); if (y !== null) return y; } return w.terrain.height(x, z); };

  // closest point on triangle (Ericson), returns squared distance and the point
  const cp = (p, t) => {
    const a = [t[0], t[1], t[2]], b = [t[3], t[4], t[5]], c = [t[6], t[7], t[8]];
    const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
    let q;
    if (d1 <= 0 && d2 <= 0) q = a; else {
      const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
      if (d3 >= 0 && d4 <= d3) q = b; else {
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; } else {
          const cp2 = sub(p, c), d5 = dot(ab, cp2), d6 = dot(ac, cp2);
          if (d6 >= 0 && d5 <= d6) q = c; else {
            const vb = d5 * d2 - d1 * d6;
            if (vb <= 0 && d2 >= 0 && d6 <= 0) { const v = d2 / (d2 - d6); q = [a[0] + ac[0] * v, a[1] + ac[1] * v, a[2] + ac[2] * v]; } else {
              const va = d3 * d6 - d5 * d4;
              if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const v = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * v, b[1] + (c[1] - b[1]) * v, b[2] + (c[2] - b[2]) * v]; } else {
                const den = 1 / (va + vb + vc), v = vb * den, ww = vc * den;
                q = [a[0] + ab[0] * v + ac[0] * ww, a[1] + ab[1] * v + ac[1] * ww, a[2] + ab[2] * v + ac[2] * ww];
              }
            }
          }
        }
      }
    }
    const d = sub(p, q); return dot(d, d);
  };

  // ---- per vertex: nearest other parts, inside tests (closed parts: vertical ray parity), ground gap
  const stamp = new Int32Array(tris.length).fill(-1); let qn = 0;
  const pair = new Map(); // "a,b" → { d: min distance, pen: max depth of a's vertices inside b, at }
  const R2 = TOL.R * TOL.R;
  const fmt = (v) => v.map((q) => +q.toFixed(2));
  const local = (c, v) => { const e = c.inv.elements; return fmt([e[0] * v[0] + e[4] * v[1] + e[8] * v[2] + e[12], e[1] * v[0] + e[5] * v[1] + e[9] * v[2] + e[13], e[2] * v[0] + e[6] * v[1] + e[10] * v[2] + e[14]]); };
  for (const A of comps) {
    A.gmin = 1e9; A.low = null; A.bottomGap = 0;
    for (const v of A.vs) {
      const gy = groundY(v[0], v[2]), gd = v[1] - gy;
      if (gd < A.gmin) { A.gmin = gd; A.low = v; }
      qn++;
      const best = new Map();
      const ix0 = cell(v[0]), iz0 = cell(v[2]);
      for (const l of near3(v[0], v[1], v[2])) for (const i of l) {
        if (stamp[i] === qn) continue; stamp[i] = qn;
        const b = triComp[i]; if (b === A.id) continue;
        const t = tris[i];
        if (Math.min(t[1], t[4], t[7]) > v[1] + TOL.R || Math.max(t[1], t[4], t[7]) < v[1] - TOL.R) continue;
        const d2 = cp(v, t); if (d2 > R2) continue;
        const cur = best.get(b); if (!cur || d2 < cur) best.set(b, d2);
      }
      // closed parts whose box holds the vertex: parity of crossings straight up
      for (const i of col.get(key(ix0, iz0)) || []) {
        const b = triComp[i], B = comps[b];
        if (b === A.id || !B.closed || v[0] < B.lo[0] || v[0] > B.hi[0] || v[1] < B.lo[1] || v[1] > B.hi[1] || v[2] < B.lo[2] || v[2] > B.hi[2]) continue;
        const y = bary(tris[i], v[0] + 1.3e-6, v[2] + 0.7e-6);
        if (y !== null && y > v[1]) { B._par = (B._par || 0) + 1; (A._hit ||= new Set()).add(b); }
      }
      for (const b of A._hit || []) {
        const B = comps[b], inside = B._par % 2 === 1; B._par = 0;
        if (!inside) continue;
        const d = best.has(b) ? Math.sqrt(best.get(b)) : TOL.R;
        const k = A.id + ',' + b, e = pair.get(k) || { d: 1e9, pen: 0 };
        if (d > e.pen) { e.pen = d; e.at = v; }
        pair.set(k, e);
      }
      if (A._hit) A._hit.clear();
      for (const [b, d2] of best) {
        const k = A.id + ',' + b, e = pair.get(k) || { d: 1e9, pen: 0 };
        e.d = Math.min(e.d, Math.sqrt(d2)); pair.set(k, e);
      }
      A.near = Math.min(A.near ?? 1e9, ...[...best.values()].map(Math.sqrt));
    }
  }

  // ---- bottoms over the ground: downward faces low over it with nothing within the gap tolerance
  for (const A of comps) {
    if (A.gmin > TOL.float || A.gmin < -0.5) continue; // only parts that sit on the ground (posts set deep are skipped)
    for (let i = A.t0; i < A.t0 + A.nt; i++) {
      const t = tris[i]; if (t[10] > -0.5) continue;
      for (let j = 0; j < 3; j++) {
        const x = t[j * 3], y = t[j * 3 + 1], z = t[j * 3 + 2], g = y - groundY(x, z);
        if (g < TOL.gap || g > 0.4) continue;
        // something else just under it?
        let held = false;
        for (const l of near3(x, y, z)) for (const k of l) {
          if (triComp[k] === A.id || held) continue;
          const yy = bary(tris[k], x, z); if (yy !== null && yy <= y + 0.01 && yy > y - TOL.gap) { held = true; break; }
        }
        if (!held && g > A.bottomGap) { A.bottomGap = g; A.bottomAt = [x, y, z]; }
      }
    }
  }

  // ---- islands: parts linked by contact (≤ float tolerance) that never reach the ground
  const link = comps.map(() => []);
  for (const [k, e] of pair) { if (e.d > TOL.touch && e.pen === 0) continue; const [a, b] = k.split(',').map(Number); link[a].push(b); link[b].push(a); }
  const seenI = new Uint8Array(comps.length), islands = [];
  for (const c of comps) {
    if (seenI[c.id]) continue;
    const q = [c.id], mem = []; seenI[c.id] = 1; let grounded = false;
    while (q.length) { const a = q.pop(); mem.push(a); if (comps[a].gmin <= TOL.touch) grounded = true; for (const b of link[a]) if (!seenI[b]) { seenI[b] = 1; q.push(b); } }
    if (!grounded) {
      const gap = Math.min(...mem.map((a) => comps[a].gmin)), A = comps[mem.reduce((p, a) => (comps[a].gmin < comps[p].gmin ? a : p), mem[0])];
      const labels = [...new Set(mem.map((a) => comps[a].label))];
      islands.push({ labels: labels.slice(0, 4).join(' + ') + (labels.length > 4 ? ` +${labels.length - 4}` : ''), parts: mem.length, groundGap: +gap.toFixed(3), nearestOther: +Math.min(...mem.map((a) => comps[a].near ?? 1e9)).toFixed(3), at: fmt(A.low), local: local(A, A.low), dyn: mem.some((a) => comps[a].dyn) });
    }
  }

  // ---- z-fighting: overlapping near-coplanar faces of different parts (same facing, or either double-sided); and with the ground
  const zf = new Map(), zg = new Map();
  const inTri = (t, p) => { // p projected along t's normal lies inside t
    const n = [t[9], t[10], t[11]], ax = Math.abs(n[0]) > Math.abs(n[1]) ? (Math.abs(n[0]) > Math.abs(n[2]) ? 0 : 2) : (Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2);
    const u = (ax + 1) % 3, w2 = (ax + 2) % 3, P = [[t[u], t[w2]], [t[3 + u], t[3 + w2]], [t[6 + u], t[6 + w2]]], q = [p[u], p[w2]];
    const s = (a, b) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
    const s1 = s(P[0], P[1]), s2 = s(P[1], P[2]), s3 = s(P[2], P[0]);
    return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  };
  for (let i = 0; i < tris.length; i++) {
    const t = tris[i]; if (t[12] < 1e-4) continue;
    const a = triComp[i], A = comps[a], cen = [(t[0] + t[3] + t[6]) / 3, (t[1] + t[4] + t[7]) / 3, (t[2] + t[5] + t[8]) / 3];
    if (t[10] > 0.95 && !A.offset) {
      const g = cen[1] - groundY(cen[0], cen[2]);
      if (Math.abs(g) < TOL.z && [0, 1, 2].every((j) => Math.abs(t[j * 3 + 1] - groundY(t[j * 3], t[j * 3 + 2])) < TOL.z)) {
        const e = zg.get(a) || { area: 0 }; e.area += t[12]; e.at = cen; zg.set(a, e);
      }
    }
    qn++;
    for (const k of grid.get(key3(cell(cen[0]), cell(cen[1]), cell(cen[2]))) || []) {
      const b = triComp[k]; if (b <= a) continue;
      const s = tris[k], dn = t[9] * s[9] + t[10] * s[10] + t[11] * s[11];
      if (Math.abs(dn) < 0.998 || (dn < 0 && !A.double && !comps[b].double)) continue;
      const dist = Math.abs((cen[0] - s[0]) * s[9] + (cen[1] - s[1]) * s[10] + (cen[2] - s[2]) * s[11]);
      if (dist > TOL.z || !inTri(s, cen)) continue;
      const kk = a + ',' + b, e = zf.get(kk) || { area: 0 }; e.area += t[12]; e.at = cen; zf.set(kk, e);
    }
  }

  // ---- the eye: walkable spots (not pushed by colliders) at standing and stooping eye height, near any geometry
  const eye = [];
  if (camera) {
    const lo = [1e9, 1e9], hi = [-1e9, -1e9];
    for (const c of comps) { lo[0] = Math.min(lo[0], c.lo[0]); lo[1] = Math.min(lo[1], c.lo[2]); hi[0] = Math.max(hi[0], c.hi[0]); hi[1] = Math.max(hi[1], c.hi[2]); }
    const S = 0.1;
    for (let x = lo[0]; x < hi[0]; x += S) for (let z = lo[1]; z < hi[1]; z += S) {
      if (!cols.has(key(cell(x), cell(z)))) continue;
      if (!col.has(key(cell(x), cell(z))) && !grid.has(key3(cell(x), cell(w.groundAt(x, z) + 1.3), cell(z))) && !grid.has(key3(cell(x), cell(w.groundAt(x, z) + 0.9), cell(z)))) continue;
      const g = w.groundAt(x, z), r = w.collide(x, z, 0.28, g);
      if (Math.hypot(r.x - x, r.z - z) > 1e-3 || w.terrain.height(x, z) < (w.terrain.waterLevel ?? -1e9)) continue;
      const room = w.headroomAt(x, z, 0.45) - g - 0.14;
      for (const h of [Math.max(1.05, Math.min(1.62, room)), 1.05]) {
        const v = [x, g + h, z]; let best = 1e9, bc = -1; qn++;
        for (const l of near3(...v)) for (const i of l) {
          if (stamp[i] === qn) continue; stamp[i] = qn;
          const d2 = cp(v, tris[i]); if (d2 < best) { best = d2; bc = triComp[i]; }
        }
        best = Math.sqrt(best);
        if (best < TOL.eye) eye.push({ label: comps[bc].label, d: +best.toFixed(3), eye: h === 1.05 ? 'stoop' : 'stand', at: fmt(v), local: local(comps[bc], v) });
      }
    }
  }

  // ---- summaries
  const P = (c) => ({ label: c.label, at: fmt(c.low), local: local(c, c.low) });
  const group = (rows, keyf, score) => {
    const m = new Map();
    for (const r of rows) { const k = keyf(r); const g = m.get(k) || { ...r, n: 0 }; g.n++; if (score(r) > score(g)) Object.assign(g, r, { n: g.n }); m.set(k, g); }
    return [...m.values()].sort((a, b) => score(b) - score(a));
  };
  const sunk = group(comps.filter((c) => c.gmin < -TOL.sunk).map((c) => ({ ...P(c), depth: +(-c.gmin).toFixed(3), height: +(c.hi[1] - c.lo[1]).toFixed(2), post: c.hi[1] - c.lo[1] > 2 * Math.max(c.hi[0] - c.lo[0], c.hi[2] - c.lo[2]) })), (r) => r.label, (r) => r.depth);
  const gaps = group(comps.filter((c) => c.bottomGap > 0).map((c) => ({ label: c.label, gap: +c.bottomGap.toFixed(3), at: fmt(c.bottomAt), local: local(c, c.bottomAt) })), (r) => r.label, (r) => r.gap);
  const pens = [];
  for (const [k, e] of pair) {
    if (e.pen < TOL.pen) continue;
    const [a, b] = k.split(',').map(Number), A = comps[a], B = comps[b];
    pens.push({ a: A.label, b: B.label, same: A.mesh === B.mesh, depth: +e.pen.toFixed(3), at: fmt(e.at), local: local(A, e.at) });
  }
  const pen = group(pens, (r) => r.a + ' ⟂ ' + r.b, (r) => r.depth);
  const zfight = group([...zf].map(([k, e]) => { const [a, b] = k.split(',').map(Number); return { a: comps[a].label, b: comps[b].label, area: +e.area.toFixed(4), at: fmt(e.at), local: local(comps[a], e.at) }; }), (r) => r.a + ' = ' + r.b, (r) => r.area);
  const zground = group([...zg].map(([a, e]) => ({ label: comps[a].label, area: +e.area.toFixed(4), at: fmt(e.at) })), (r) => r.label, (r) => r.area);
  const isl = group(islands, (r) => r.labels, (r) => Math.min(r.groundGap, r.nearestOther));
  const eyes = group(eye, (r) => r.label + r.eye, (r) => -r.d);
  return { tol: TOL, parts: comps.length, triangles: tris.length, closed: comps.filter((c) => c.closed).length, islands: isl, sunk, gaps, pen, zfight, zground, eyes };
}, { only: process.env.MODEL || '', camera: process.env.CAMERA !== '0' });

writeFileSync(out, JSON.stringify(report, null, 1));
const line = (o) => Object.entries(o).filter(([k]) => k !== 'n').map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join(' ');
console.log(`${report.parts} parts (${report.closed} closed), ${report.triangles} triangles; tolerances ${JSON.stringify(report.tol)}`);
for (const k of ['islands', 'sunk', 'gaps', 'pen', 'zfight', 'zground', 'eyes']) {
  console.log(`\n## ${k}: ${report[k].length}`);
  for (const r of report[k].slice(0, +(process.env.TOP || 25))) console.log(`${r.n ? `×${r.n} ` : ''}${line(r)}`);
}
await browser.close();
