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
  // cloth, not a flat tape: three verts across, creased down the middle (the fold it was tied by), the crease
  // dying out and turning over along its length, a swallow-tail cut at the end
  const tw = (rng() - 0.5) * 2.4, cr = (0.25 + rng() * 0.3) * (rng() < 0.5 ? -1 : 1), n = pts.length - 1;
  const pos = [], uv = [], col = [], idx = [], U = new THREE.Vector3(side.x, 0, side.z);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (i) s += pts[i].distanceTo(pts[i - 1]);
    const tg = pts[Math.min(i + 1, n)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
    const sd = tg.clone().cross(U).normalize().applyAxisAngle(tg, tw * t), nr = sd.clone().cross(tg).normalize();
    const w = width * (1 - 0.15 * t) * (i === 0 ? 0.35 : i === 1 ? 0.8 : 1);   // gathered into the knot
    const fold = w * cr * Math.cos(t * 2.6) * (1 - 0.5 * t);
    for (const k of [-0.5, 0, 0.5]) {
      const back = i === n && k === 0 ? -width * 0.7 : 0;   // the notch
      pos.push(pts[i].x + sd.x * w * k + nr.x * (k ? 0 : fold) + tg.x * back, pts[i].y + sd.y * w * k + nr.y * (k ? 0 : fold) + tg.y * back, pts[i].z + sd.z * w * k + nr.z * (k ? 0 : fold) + tg.z * back);
      uv.push(k + 0.5, s);
      const c = (1 - 0.12 * Math.sin(t * 9 + (k + 0.5) * 2)) * (k ? 1 : 0.9);
      col.push(color[0] * c, color[1] * c, color[2] * c);
    }
  }
  for (let i = 0; i < n; i++) { const a = i * 3; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3, a + 1, a + 2, a + 4, a + 2, a + 5, a + 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
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

// A choice of ribbons shown under the look (`#choice`, index.html): each option is a strip of its colour. Moving
// the mouse (or 1 2 3) goes along them, the do input ties the one picked out, put down or Esc leaves; on touch a
// strip is tapped. Resolves the option's id, or null.
export function choose(game, title, options) {
  return new Promise((resolve) => {
    const t = (o) => game?.ui?.t ? game.ui.t(o) : o.en;
    const d = document.getElementById('choice');
    if (!d) { resolve(options[0]?.id ?? null); return; }
    let sel = Math.floor(options.length / 2), acc = 0;
    d.innerHTML = options.map((o, i) => `<button data-i="${i}" style="--c:${o.swatch}"><i></i><span>${t(o.label)}</span></button>`).join('') + '<button data-i="x" class="x">✕</button>';
    d.setAttribute('aria-label', t(title));
    const show = () => { [...d.children].forEach((b, i) => b.classList.toggle('on', i === sel)); };
    show();
    d.classList.add('show');
    if (game) game.choosing = true; // touch hides its play controls
    const done = (v) => {
      for (const [type, fn] of Object.entries(on)) removeEventListener(type, fn, true);
      d.classList.remove('show');
      if (game) game.choosing = false;
      resolve(v);
    };
    const pick = (b) => { const i = b?.dataset.i; if (i === 'x') done(null); else if (i != null) done(options[+i].id); };
    const on = {
      keydown: (e) => {
        if (e.repeat) return;
        const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
        if (n !== undefined && n < options.length) { e.stopPropagation(); done(options[n].id); }
        else if (e.code === 'Escape' || e.code === 'KeyQ') { e.stopPropagation(); done(null); }
        else if (e.code === 'KeyF' || e.code === 'Enter') { e.stopPropagation(); done(options[sel].id); }
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { sel = Math.max(0, sel - 1); show(); }
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') { sel = Math.min(options.length - 1, sel + 1); show(); }
      },
      mousemove: (e) => { // (pointer locked: the look is held still, the mouse goes along the ribbons)
        if (!document.pointerLockElement) return;
        acc += e.movementX;
        const s = Math.max(0, Math.min(options.length - 1, Math.floor(options.length / 2) + Math.round(acc / 70)));
        if (s !== sel) { sel = s; show(); }
      },
      mousedown: (e) => {
        if (!document.pointerLockElement) { pick(e.target.closest?.('#choice button')); return; }
        e.stopPropagation();
        if (e.button === 0) done(options[sel].id); else if (e.button === 2) done(null);
      },
      touchstart: (e) => { const b = e.target.closest?.('#choice button'); if (b) { e.preventDefault(); e.stopPropagation(); pick(b); } },
    };
    for (const [type, fn] of Object.entries(on)) addEventListener(type, fn, { capture: true, passive: false });
  });
}

// A hinged leaf with weight (a door, gate rails). s = { a: 0…1, v, to: 0 | 1 }: pushed towards `to` it gathers
// speed, knocks once against its stop and settles; pushed again on the way it turns back. Returns 'knock' on the
// frame it meets the stop, 'rest' when it lies still there, else null.
export function swing(s, dt, accel = 3.5, max = 1.6) {
  const d = s.to ? 1 : -1;
  if (s.a === s.to && !s.v) return null;
  s.v = Math.max(-max, Math.min(max, (s.v || 0) + d * accel * dt));
  s.a += s.v * dt;
  if (d * (s.a - s.to) < 0) return null;
  s.a = s.to;
  if (d * s.v > 0.8) { s.v *= -0.2; return 'knock'; }
  s.v = 0;
  return 'rest';
}

// A hinged leaf as a solid: its collider follows the leaf, and the swing stops at the player instead of passing
// through. hinge = [x, z] model-local, len = leaf width, th = thickness centred `off` along the leaf's own x,
// angle(a) = the leaf's turn about +Y at swing a (its width runs along its local +Z). find(world) returns the
// leaf's own world collider (a box); move(s, dt, game, accel, max) swings like `swing`.
export function leaf(placement, { hinge, len, th, off = 0, angle }) {
  const yaw = placement.yaw || 0, c0 = Math.cos(yaw), s0 = Math.sin(yaw);
  const span = (a) => { // the leaf's middle line, model-local
    const A = angle(a), ux = Math.sin(A), uz = Math.cos(A), ox = hinge[0] + Math.cos(A) * off, oz = hinge[1] - Math.sin(A) * off;
    return { A, x0: ox, z0: oz, x1: ox + ux * len, z1: oz + uz * len };
  };
  const toLocal = (wx, wz) => { const dx = wx - placement.x, dz = wz - placement.z; return [dx * c0 - dz * s0, dx * s0 + dz * c0]; };
  const R = 0.28 + th / 2 + 0.07; // the player's radius, half the leaf, and room for the eye
  const hits = (a, p) => {
    const g = span(a), [x, z] = toLocal(p.x, p.z), ex = g.x1 - g.x0, ez = g.z1 - g.z0;
    const t = Math.max(0, Math.min(1, ((x - g.x0) * ex + (z - g.z0) * ez) / (ex * ex + ez * ez)));
    return Math.hypot(x - g.x0 - ex * t, z - g.z0 - ez * t) < R;
  };
  const self = {
    k: null,
    // the leaf's collider, local, at swing a (rot: the leaf's turn)
    collider(a, extra = {}) { const g = span(a); return { x: (g.x0 + g.x1) / 2, z: (g.z0 + g.z1) / 2, hw: th / 2, hd: len / 2, rot: g.A, ...extra }; },
    place(a) {
      if (!self.k) return;
      const g = span(a), mx = (g.x0 + g.x1) / 2, mz = (g.z0 + g.z1) / 2;
      self.k.x = placement.x + mx * c0 + mz * s0; self.k.z = placement.z - mx * s0 + mz * c0;
      self.k.c = Math.cos(yaw + g.A); self.k.s = Math.sin(yaw + g.A);
    },
    move(s, dt, game, accel, max) {
      const a0 = s.a, v0 = s.v || 0, p = game?.player?.pos;
      let r = swing(s, dt, accel, max);
      // it meets the player on the way: stopped there with a small rebound (a knock if it came fast)
      if (p && s.a !== a0 && hits(s.a, p) && !hits(a0, p)) { s.a = a0; s.v = -v0 * 0.25; r = Math.abs(v0) > 0.6 ? 'knock' : null; }
      self.place(s.a);
      return r;
    },
  };
  return self;
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
