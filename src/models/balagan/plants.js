// Real sod on the earth roofs and the berm: grass blades as geometry, fireweed (Chamaenerion) and a few weeds.
// Everything lands in one vertex-coloured geometry (uv.y = height along the plant, used for sway).
import * as THREE from 'three/webgpu';
import { rrect } from './geo.js';

export class PlantBatch {
  constructor() { this.p = []; this.c = []; this.u = []; this.i = []; }
  quadStrip(pts, widths, col, normalSide) {
    // pts: [[x,y,z,t]...] along the blade; widths: half widths; side vector per point
    const base = this.p.length / 3;
    for (let k = 0; k < pts.length; k++) {
      const [x, y, z, t] = pts[k], w = widths[k], s = normalSide;
      this.p.push(x - s[0] * w, y - s[1] * w, z - s[2] * w, x + s[0] * w, y + s[1] * w, z + s[2] * w);
      const sh = 0.75 + 0.25 * t;
      this.c.push(col[0] * sh, col[1] * sh, col[2] * sh, col[0] * sh, col[1] * sh, col[2] * sh);
      this.u.push(0, t, 1, t);
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = base + k * 2;
      this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  blade(x, y, z, h, az, tilt, w, col, rng) {
    const dx = Math.cos(az), dz = Math.sin(az);
    const pts = [], ws = [];
    const curl = 0.8 + rng() * 1.2;
    for (let k = 0; k <= 3; k++) {
      const t = k / 3;
      const bend = Math.sin(tilt) * h * Math.pow(t, curl);
      pts.push([x + dx * bend, y + Math.cos(tilt) * h * t - Math.pow(t, 2.5) * Math.max(0, tilt - 0.7) * h * 0.6, z + dz * bend, t]);
      ws.push(w * (1 - t * 0.92));
    }
    this.quadStrip(pts, ws, col, [-dz, 0, dx]);
  }
  tuft(x, y, z, rng, { n = 6, h = 0.32, out = null, droop = 0, dry = 0.2, w = 1 } = {}) {
    for (let k = 0; k < n; k++) {
      let az = rng() * Math.PI * 2, tilt = 0.15 + rng() * 0.55;
      if (out) { az = Math.atan2(out[1], out[0]) + (rng() - 0.5) * 1.4; tilt = 0.6 + droop * (0.6 + rng() * 0.8); }
      const d = rng() < dry;
      const g = rng();
      const col = d ? [0.55 + g * 0.1, 0.5 + g * 0.08, 0.3] : [0.2 + g * 0.14, 0.32 + g * 0.12, 0.09 + g * 0.06];
      this.blade(x + (rng() - 0.5) * 0.06, y - 0.02, z + (rng() - 0.5) * 0.06, h * (0.55 + rng() * 0.7), az, tilt, (0.004 + rng() * 0.004) * w, col, rng);
    }
  }
  // fireweed: tall stem, narrow alternate leaves, a pink raceme at the top
  fireweed(x, y, z, rng) {
    const H = 0.6 + rng() * 0.45, lean = (rng() - 0.5) * 0.15, az = rng() * 6.28;
    const lx = Math.cos(az) * lean, lz = Math.sin(az) * lean;
    const stem = (t) => [x + lx * t * t, y + H * t, z + lz * t * t];
    const sp = [];
    for (let k = 0; k <= 4; k++) { const t = k / 4; sp.push([...stem(t), t]); }
    this.quadStrip(sp, sp.map(() => 0.004), [0.32, 0.22, 0.14], [1, 0, 0]);
    this.quadStrip(sp, sp.map(() => 0.004), [0.32, 0.22, 0.14], [0, 0, 1]);
    // leaves
    for (let k = 0; k < 12; k++) {
      const t = 0.1 + (k / 12) * 0.62;
      const [sx, sy, sz] = stem(t);
      const a = k * 2.4 + az, L = 0.09 * (1 - t * 0.5) + rng() * 0.03;
      const dx = Math.cos(a), dz = Math.sin(a);
      const pts = [[sx, sy, sz, t], [sx + dx * L * 0.5, sy + L * 0.15, sz + dz * L * 0.5, t], [sx + dx * L, sy + L * 0.05 - 0.02, sz + dz * L, t]];
      this.quadStrip(pts, [0.002, 0.009, 0.001], [0.2, 0.3, 0.1], [-dz * 0.3, 0.95, dx * 0.3]);
    }
    // raceme: open flowers below, buds above
    for (let k = 0; k < 18; k++) {
      const t = 0.74 + (k / 18) * 0.26;
      const [sx, sy, sz] = stem(t);
      const a = k * 2.4 + rng(), bud = k > 11;
      const r = bud ? 0.012 : 0.03, dx = Math.cos(a), dz = Math.sin(a);
      const cx = sx + dx * (bud ? 0.01 : 0.025), cz = sz + dz * (bud ? 0.01 : 0.025);
      const col = bud ? [0.42, 0.12, 0.25] : [0.86, 0.3 + rng() * 0.1, 0.58];
      // four petals as two crossed quads
      for (const [px, pz] of [[1, 0], [0, 1]]) {
        const base = this.p.length / 3;
        const vx = (px * dx - pz * dz) * r, vz = (px * dz + pz * dx) * r;
        this.p.push(cx - vx, sy, cz - vz, cx + vx, sy, cz + vz, cx + vx * 0.2, sy + r, cz + vz * 0.2, cx - vx * 0.2, sy - r * 0.6, cz - vz * 0.2);
        for (let q = 0; q < 4; q++) { this.c.push(...col); this.u.push(0, t); }
        this.i.push(base, base + 1, base + 2, base, base + 3, base + 1);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeVertexNormals();
    // grass lit from above reads better: bend normals upward
    const n = g.attributes.normal;
    for (let k = 0; k < n.count; k++) {
      const v = new THREE.Vector3(n.getX(k), Math.abs(n.getY(k)) + 0.9, n.getZ(k)).normalize();
      n.setXYZ(k, v.x, v.y, v.z);
    }
    return g;
  }
}

// Scatter sod over a rounded roof top (hx, hz around cz) with height fn top(x, zLocal).
export function sodRoof(P, rng, { hx, hz, cz = 0, top, count, fireweed = 0, avoid }) {
  for (let k = 0; k < count; k++) {
    const x = (rng() * 2 - 1) * (hx - 0.05), z = (rng() * 2 - 1) * (hz - 0.05);
    if (avoid && avoid(x, cz + z)) continue;
    const ex = hx - Math.abs(x), ez = hz - Math.abs(z), e = Math.min(ex, ez);
    if (Math.hypot(Math.max(0, 0.5 - ex), Math.max(0, 0.5 - ez)) > 0.5) continue; // rounded corners
    const y = top(x, z);
    if (e < 0.3) {
      const out = ex < ez ? [Math.sign(x), 0] : [0, Math.sign(z)];
      P.tuft(x, y - 0.02, cz + z, rng, { n: 6, h: 0.42, out, droop: 1 - e / 0.3, dry: 0.3 });
    } else P.tuft(x, y, cz + z, rng, { n: 5 + Math.floor(rng() * 4), h: 0.22 + rng() * 0.35, dry: 0.15 });
  }
  // grass hanging over the roof edge all round
  const per = 2 * (2 * hx + 2 * hz);
  for (let k = 0; k < per / 0.085; k++) {
    const u = (k + rng() * 0.7) / (per / 0.085);
    const [x, z, nx, nz] = rrect(hx - 0.06, hz - 0.06, 0.45, u);
    if (avoid && avoid(x, cz + z)) continue;
    P.tuft(x + nx * 0.04, top(x, z) - 0.05, cz + z + nz * 0.04, rng, { n: 6, h: 0.4 + rng() * 0.4, out: [nx, nz], droop: 0.9 + rng() * 0.7, dry: 0.45, w: 1.7 });
  }
  for (let k = 0; k < fireweed; k++) {
    const x = (rng() * 2 - 1) * (hx - 0.5), z = (rng() * 2 - 1) * (hz - 0.5);
    if (avoid && avoid(x, cz + z)) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const ax = x + (rng() - 0.5) * 0.3, az = z + (rng() - 0.5) * 0.3;
      P.fireweed(ax, top(ax, az) - 0.02, cz + az, rng);
    }
  }
}
