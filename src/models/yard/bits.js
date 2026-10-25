// Small shared pieces for the yard models: ground following, trodden-earth patches, horsehair tufts,
// cloth ribbons, uncut grass at post feet, colour helpers, and an on-screen three-way choice.
import * as THREE from 'three/webgpu';
import { strip, tube } from './geo.js';
import { fbm } from '../../util.js';
export { ease } from '../../util.js';

// Local ground height (relative to the placement's y) for a model placed on uneven terrain.
export function groundOf(ctx, p) {
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  const y0 = p.y ?? ctx.terrain.height(p.x, p.z);
  return (x, z) => ctx.terrain.height(p.x + x * c + z * s, p.z - x * s + z * c) - y0;
}

// Vary a colour: per-piece tint in a narrow range around `base` (linear rgb triple).
export function vary(rng, base, amt = 0.12) {
  const k = 1 + (rng() - 0.5) * 2 * amt, w = (rng() - 0.5) * amt * 0.5;
  return [base[0] * k * (1 + w), base[1] * k, base[2] * k * (1 - w)];
}

// A terrain-hugging patch of trodden earth. shape(x, z) → coverage 0..1 (local metres).
// Built as a grid over [x0,x1]×[z0,z1], dropping cells with no coverage.
export function troddenPatch(ground, x0, x1, z0, z1, shape, { step = 0.5, lift = 0.025, tint = [1, 1, 1] } = {}) {
  const nx = Math.ceil((x1 - x0) / step), nz = Math.ceil((z1 - z0) / step);
  const pos = [], col = [], idx = [], nor = [];
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const x = x0 + (i / nx) * (x1 - x0), z = z0 + (j / nz) * (z1 - z0);
      pos.push(x, ground(x, z) + lift, z);
      nor.push(0, 1, 0);
      col.push(tint[0], tint[1], tint[2], Math.max(0, Math.min(1, shape(x, z))));
    }
  const row = nz + 1;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const a = i * row + j, b = a + row;
      if (col[a * 4 + 3] + col[(a + 1) * 4 + 3] + col[b * 4 + 3] + col[(b + 1) * 4 + 3] <= 0.01) continue;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.filter((_, k) => k % 3 !== 1), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Noisy-edged blob coverage for troddenPatch: ellipse (cx,cz,rx,rz) with frayed edge.
export function blob(cx, cz, rx, rz, seed = 0, edge = 0.35) {
  return (x, z) => {
    const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
    return (1 - d + fbm(x * 0.6, z * 0.6, seed) * edge) / 0.25;
  };
}

// Hair locks bundled at the top (a tuft), hanging from `at` along `dir`, with a sway attribute.
// colour: linear rgb; returns geometry for the `hair` material.
export function tuft(rng, at, { len = 0.14, locks = 10, spread = 0.012, color = [0.85, 0.82, 0.74], dir = [0, -1, 0], width = 0.006 } = {}) {
  const parts = [];
  const D = new THREE.Vector3(...dir).normalize();
  for (let i = 0; i < locks; i++) {
    const a = rng() * Math.PI * 2, r = rng() * Math.min(spread, 0.004);
    const off = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const L = len * (0.75 + rng() * 0.35);
    const pts = [];
    const splay = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.25 + rng() * 0.3);
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(new THREE.Vector3(...at).add(off).addScaledVector(D, L * t).addScaledVector(splay, L * t * t * 0.5));
    }
    const k = 0.85 + rng() * 0.25;
    const tipYellow = 0.9;
    const g = strip(pts, (t) => width * (1 - t * 0.6), {
      up: [Math.cos(a), 0, Math.sin(a)], twist: (rng() - 0.5) * 2,
      color: (t, _s, c) => { c[0] = color[0] * k; c[1] = color[1] * k * (1 - t * (1 - tipYellow) * 0.5); c[2] = color[2] * k * (1 - t * (1 - tipYellow)); },
    });
    parts.push(withSway(g, (i2) => i2 / 5 >> 0, pts.length));
  }
  // the binding: a short wrap of coloured hair
  const wrap = tube([new THREE.Vector3(...at).addScaledVector(D, -0.002), new THREE.Vector3(...at).addScaledVector(D, 0.01)], Math.min(spread, 0.004) + 0.0022, { radial: 7 });
  setColor(wrap, color.map((v) => v * 0.75));
  parts.push(noSway(wrap));
  return parts;
}

// Cloth ribbon tied at `at`, hanging down with a bit of curl. width/len in metres.
export function ribbon(rng, at, { len = 0.2, width = 0.025, color = [0.9, 0.9, 0.86], dir = [0.15, -1, 0.1] } = {}) {
  const D = new THREE.Vector3(...dir).normalize();
  const side = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize();
  const ph = rng() * 6, amp = 0.02 + rng() * 0.025;
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    // hangs from the knot, bellies out a little and curls at the end
    pts.push(new THREE.Vector3(...at).addScaledVector(D, len * t).addScaledVector(side, Math.sin(t * 4.2 + ph) * amp * t + t * t * 0.03));
  }
  const g = strip(pts, (t) => width * (1 - 0.15 * t), {
    up: [side.x, 0, side.z], twist: (rng() - 0.5) * 2.4,
    color: (t, s, c) => { const k = 1 - 0.12 * Math.sin(t * 9 + s * 2); c[0] = color[0] * k; c[1] = color[1] * k; c[2] = color[2] * k; },
  });
  return withSway(g, null, pts.length);
}

// sway attribute: for strips, verts come in pairs per point; for tubes, rings of radial+1.
export function withSway(g, _f, points) {
  const n = g.attributes.position.count, per = n / points;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(i / per) / Math.max(1, points - 1);
  g.setAttribute('sway', new THREE.BufferAttribute(a, 1));
  return g;
}
export function noSway(g) { g.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1)); return g; }

export function setColor(g, c) {
  const a = g.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, c[0], c[1], c[2]);
  return g;
}

// Uncut grass at post feet and along fence lines (where the scythe and the herd miss it).
// Blades as thin bent triangles strips; returns geometry for grassMat.
export function grassClump(rng, ground, cx, cz, { n = 40, r = 0.25, h = 0.45 } = {}) {
  const pos = [], col = [], idx = [], nor = [], uv = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = ground(x, z) - 0.02;
    const H = h * (0.45 + rng() * 0.75), w = 0.004 + rng() * 0.004;
    const yaw = rng() * Math.PI * 2, lean = 0.15 + rng() * 0.5;
    const lx = Math.cos(yaw), lz = Math.sin(yaw), sx = -lz, sz = lx;
    const dry = rng() < 0.3;
    const base = pos.length / 3;
    const segs = 4;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, ww = w * (1 - t * 0.9);
      const bend = lean * t * t * H;
      const px = x + lx * bend, pz = z + lz * bend, py = y + H * t * (1 - lean * 0.25 * t);
      pos.push(px - sx * ww, py, pz - sz * ww, px + sx * ww, py, pz + sz * ww);
      nor.push(lx * 0.3, 1, lz * 0.3, lx * 0.3, 1, lz * 0.3);
      uv.push(0, t, 1, t);
      const g = dry ? [0.42, 0.38, 0.22] : [0.16 + t * 0.06, 0.26 + t * 0.08, 0.07];
      const k2 = 0.8 + rng() * 0.2;
      col.push(g[0] * k2, g[1] * k2, g[2] * k2, g[0] * k2, g[1] * k2, g[2] * k2);
      if (k < segs) { const q = base + k * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  // sway by height in the blade
  const sw = new Float32Array(pos.length / 3);
  for (let i = 0; i < sw.length; i++) sw[i] = ((i % 10) >> 1) / 4;
  g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
  return g;
}

// A three-way choice shown under the crosshair; keys 1/2/3, Esc cancels (resolves null).
export function choose(game, title, options) {
  return new Promise((resolve) => {
    const t = (o) => game?.ui?.t ? game.ui.t(o) : o.en;
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;top:calc(50% + 34px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px;text-shadow:0 1px 6px rgba(0,0,0,.7);pointer-events:none;white-space:nowrap;color:#f3efe6;font-family:"Noto Sans",system-ui,sans-serif;z-index:20';
    const opts = options.map((o, i) => `<span style="display:inline-flex;gap:7px;align-items:center"><span style="border:1px solid rgba(255,255,255,.7);border-radius:4px;padding:1px 7px;font-size:12px;background:rgba(0,0,0,.25)">${i + 1}</span>${o.swatch ? `<span style="width:12px;height:12px;border-radius:2px;background:${o.swatch};border:1px solid rgba(255,255,255,.5)"></span>` : ''}<span style="font-family:'Noto Serif',serif;font-size:16px">${t(o.label)}</span></span>`).join('<span style="opacity:.4">·</span>');
    d.innerHTML = `<div style="color:#d9c08a;font-size:13px">${t(title)}</div><div style="display:flex;gap:14px;align-items:center">${opts}</div><div style="opacity:.6;font-size:11.5px">Esc</div>`;
    document.body.appendChild(d);
    if (game) game.choosing = true; // touch shows its 1·2·3 row
    const done = (v) => { removeEventListener('keydown', key, true); d.remove(); if (game) game.choosing = false; resolve(v); };
    const key = (e) => {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
      if (n !== undefined && n < options.length) { e.stopPropagation(); done(options[n].id); }
      else if (e.code === 'Escape') { e.stopPropagation(); done(null); }
    };
    addEventListener('keydown', key, true);
  });
}

// Tween helper for act animations: resolves after `dur` s while calling step(t 0..1) each frame.
export function tween(dur, step) {
  return new Promise((res) => {
    const t0 = performance.now();
    const f = () => {
      const t = Math.min(1, (performance.now() - t0) / 1000 / dur);
      step(t);
      if (t < 1) requestAnimationFrame(f); else res();
    };
    requestAnimationFrame(f);
  });
}
