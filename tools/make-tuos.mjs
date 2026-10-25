// Bakes the birch-bark (туос) sheet textures for the ураһа cover; no CC0 set of prepared bark exists.
// Runs the generator in headless system Chrome (canvas does the JPEG/PNG encoding).
// Output: public/assets/tex/tuos_sheet/
//   diff.jpg, nor.jpg, arm.jpg  outer (cream) face: one ring of the cover, 1.6 m × 0.62 m, two sheets
//                               sewn end to end (seams at u = 0 and 0.5), tiles in u
//   inner.jpg                   inner (boiled, golden-tan) face of the same sheets
//   band.png                    ornament bands traced from the Suntar urasa (RGBA): top half the arcade band
//                               (11 repeats), bottom half the zigzag band (7 repeats); see docs/patterns.md
// Usage: node tools/make-tuos.mjs [seed] [only,maps]   e.g. `7 band` rewrites band.png alone; then tools/webp.mjs
import { chromium } from 'playwright-core';
import { CHROME } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { ARCADE, ZIGZAG } from './ornament-traces.mjs';

const seed = +(process.argv[2] || 7);
const only = process.argv[3]?.split(',');
const out = new URL('../public/assets/tex/tuos_sheet/', import.meta.url);
await mkdir(out, { recursive: true });

function generate({ seed, ARCADE, ZIGZAG }) {
  const W = 2048, H = 1024, MW = 1.6, MH = 0.62; // metres covered
  const PX = W / MW, PY = H / MH;                // pixels per metre
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const hash = (x, y, k) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  // value noise periodic in x with period px cells
  const vn = (x, y, px, k) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (a) => ((a % px) + px) % px;
    const a = hash(m(xi), yi, k), b = hash(m(xi + 1), yi, k), c = hash(m(xi), yi + 1, k), d = hash(m(xi + 1), yi + 1, k);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
  // fbm over metres: fx cells per metre in x (rounded so it tiles over MW), fy cells per metre in y
  const fbm = (mx, my, fx, fy, k, oct = 4) => {
    let sum = 0, amp = 0.5;
    for (let o = 0; o < oct; o++) {
      const cx = Math.max(1, Math.round(fx * MW)) * (1 << o);
      sum += vn(mx / MW * cx, my * fy * (1 << o), cx, k + o * 31) * amp;
      amp *= 0.5;
    }
    return sum;
  };
  const N = W * H;
  const height = new Float32Array(N), ao = new Float32Array(N).fill(1), rough = new Float32Array(N);
  const col = new Float32Array(N * 3), inn = new Float32Array(N * 3);
  const lent = new Float32Array(N);   // lenticel darkness 0..1
  const stitch = new Float32Array(N); // horsehair cord coverage
  const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const SEAMS = [0, 0.8], OVER = 0.032;
  const sheetOf = (mx) => (mx >= 0.8 ? 1 : 0);
  const tones = [0, 1].map(() => ({ b: 0.86 + rnd() * 0.14, warm: rnd(), peach: 0.08 + rnd() * 0.16 }));
  const CREAM = hex('#ebdfc4'), CREAM2 = hex('#dccaa6'), PEACH = hex('#e6c3a2'), GREY = hex('#cfc6b6');
  const GOLD = hex('#c99d63'), SALMON = hex('#c48a56'), HONEY = hex('#a8733f'), PALE = hex('#d6ab72');

  // ---- base colour, fibre and peeled patches
  for (let y = 0; y < H; y++) {
    const my = y / PY;
    for (let x = 0; x < W; x++) {
      const mx = x / PX, i = y * W + x, t = tones[sheetOf(mx)];
      const big = fbm(mx, my, 2.5, 2.5, 3);
      const fib = fbm(mx, my, 6, 160, 11, 3);              // long horizontal fibres
      const fine = vn(mx * 900 / MW * MW, my * 2600, Math.round(900 * MW), 19) * 0.5; // grain dust
      const peel = fbm(mx, my, 5, 22, 23) * 0.8 + fbm(mx, my, 20, 40, 25, 2) * 0.35;
      let c = mix(CREAM, CREAM2, 0.5 + big * 0.9 + t.warm * 0.3 - 0.15);
      c = mix(c, GREY, Math.max(0, fbm(mx, my, 4, 6, 29)) * 0.5 + Math.max(0, fbm(mx, my, 1.5, 70, 37, 2)) * 0.5);
      const pz = Math.min(1, Math.max(0, (peel - 0.18) * 7)) * t.peach * 3;
      c = mix(c, PEACH, Math.min(0.85, pz));
      const k = t.b * (1 + fib * 0.07 + fine * 0.03);
      col[i * 3] = c[0] * k; col[i * 3 + 1] = c[1] * k; col[i * 3 + 2] = c[2] * k;
      // the edge of a peeled papery layer is a fine raised curl
      const edge = Math.max(0, 1 - Math.abs(peel - 0.18) * 60) * t.peach * 3;
      height[i] = big * 0.6 + fib * 0.25 + fine * 0.08 + edge * 0.35 + (pz > 0.3 ? -0.15 : 0);
      rough[i] = 0.6 + fib * 0.08 + pz * 0.06;
      // inner face: boiled, golden, long streaks
      const st = fbm(mx, my, 4, 22, 41, 4) * 0.7, blot = fbm(mx, my, 4, 5, 43) * 1.2;
      let ci = mix(GOLD, SALMON, Math.min(1, Math.max(0, 0.5 + st * 1.6)));
      ci = mix(ci, HONEY, Math.max(0, blot) * 0.9);
      ci = mix(ci, PALE, Math.max(0, -blot - 0.15) * 1.2);
      const ki = 1 + fine * 0.05 + st * 0.06;
      inn[i * 3] = ci[0] * ki; inn[i * 3 + 1] = ci[1] * ki; inn[i * 3 + 2] = ci[2] * ki;
    }
  }

  // ---- lenticels: horizontal dark dashes, 1–6 cm long, 1–2 mm wide, in loose horizontal rows
  const putLens = (cx, cy, L, w, dark) => {
    const x0 = Math.floor((cx - L / 2) * PX) - 2, x1 = Math.ceil((cx + L / 2) * PX) + 2;
    const y0 = Math.floor((cy - w * 2) * PY) - 2, y1 = Math.ceil((cy + w * 2) * PY) + 2;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
      for (let xx = x0; xx <= x1; xx++) {
        const x = ((xx % W) + W) % W;
        const dx = (xx / PX - cx) / (L / 2);
        if (Math.abs(dx) >= 1) continue;
        const half = (w / 2) * Math.pow(1 - dx * dx, 0.6);
        const dy = Math.abs(y / PY - cy);
        const i = y * W + x;
        const core = Math.max(0, 1 - dy / Math.max(half, 0.0003));
        const lip = Math.max(0, 1 - Math.abs(dy - half * 1.6) / (half * 0.9 + 0.0004));
        if (core > 0) {
          lent[i] = Math.max(lent[i], Math.min(1, core * 1.8) * dark);
          height[i] -= core * 1.1 * dark;
        }
        height[i] += lip * 0.25 * dark;
      }
    }
  };
  for (let sh = 0; sh < 2; sh++) {
    const rows = 34 + Math.floor(rnd() * 10);
    for (let r = 0; r < rows; r++) {
      const ry = rnd() * MH, n = 4 + Math.floor(rnd() * 12);
      for (let k = 0; k < n; k++) {
        const L = 0.01 + Math.pow(rnd(), 2.0) * 0.08;
        putLens(sh * 0.8 + 0.04 + rnd() * 0.74, ry + (rnd() - 0.5) * 0.012, L, 0.0012 + Math.pow(rnd(), 1.5) * 0.0032, 0.6 + rnd() * 0.4);
      }
    }
    // a few dark, cracked bands where old lenticels merged
    for (let k = 0; k < 3; k++) {
      const ry = rnd() * MH, x0 = sh * 0.8 + rnd() * 0.5;
      for (let x = x0; x < x0 + 0.1 + rnd() * 0.25; x += 0.006 + rnd() * 0.01) putLens(x, ry + (rnd() - 0.5) * 0.004, 0.012 + rnd() * 0.02, 0.002 + rnd() * 0.003, 0.7);
    }
    for (let k = 0; k < 140; k++) putLens(sh * 0.8 + rnd() * 0.8, rnd() * MH, 0.003 + rnd() * 0.012, 0.0007 + rnd() * 0.0006, 0.35 + rnd() * 0.4);
    // branch scars ("eyes"): a dark chevron opening downwards
    const eyes = rnd() < 0.5 ? 1 : 0;
    for (let e = 0; e < eyes; e++) {
      const cx = sh * 0.8 + 0.12 + rnd() * 0.56, cy = 0.1 + rnd() * 0.42, wdt = 0.015 + rnd() * 0.02;
      for (let t = -1; t <= 1; t += 0.004) {
        const px = cx + t * wdt, py = cy + Math.pow(Math.abs(t), 1.4) * wdt * 0.45;
        putLens(px, py, 0.008, 0.007 * (1 - Math.abs(t) * 0.6), 0.75);
      }
    }
  }

  // ---- seams: the right sheet lies 2 mm over the left one, stitched with a horsehair zigzag
  const cord = (ax, ay, bx, by, r) => {
    const x0 = Math.floor(Math.min(ax, bx) * PX) - 4, x1 = Math.ceil(Math.max(ax, bx) * PX) + 4;
    const y0 = Math.floor(Math.min(ay, by) * PY) - 4, y1 = Math.ceil(Math.max(ay, by) * PY) + 4;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % W) + W) % W, px = xx / PX, py = y / PY;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
      const d = Math.hypot(px - ax - vx * t, py - ay - vy * t);
      if (d < r) { const i = y * W + x, c = 1 - d / r; stitch[i] = Math.max(stitch[i], Math.min(1, c * 2)); height[i] = Math.max(height[i], 0.9 + Math.sqrt(c) * 1.2); }
    }
  };
  for (const sx of SEAMS) {
    for (let y = 0; y < H; y++) for (let xx = Math.floor((sx - 0.01) * PX); xx < Math.ceil((sx + OVER + 0.025) * PX); xx++) {
      const x = ((xx % W) + W) % W, i = y * W + x, d = xx / PX - sx;
      if (d >= 0 && d < OVER) height[i] += 0.9;
      else if (d >= OVER) height[i] += 0.9 * Math.max(0, 1 - (d - OVER) / 0.025);
      if (d < 0 && d > -0.006) ao[i] *= 0.55 + 0.45 * (-d / 0.006); // shadow under the overlapping edge
    }
    const pitch = 0.008, a = sx + 0.006, b = sx + OVER - 0.006;
    for (let yy = 0.004, k = 0; yy < MH; yy += pitch, k++) {
      const j = (rnd() - 0.5) * 0.0012;
      cord(k % 2 ? a : b, yy + j, k % 2 ? b : a, yy + pitch + j, 0.0009);
    }
  }
  // stitch holes darken; cords are near-black horsehair
  const HAIR = hex('#17110d');
  for (let i = 0; i < N; i++) {
    const L = lent[i], S = stitch[i];
    const LC = mix([0.24, 0.19, 0.16], [0.08, 0.06, 0.05], L);
    for (let c = 0; c < 3; c++) {
      let v = col[i * 3 + c];
      v = v + (LC[c] - v) * Math.min(1, L * 1.1);
      v = v + (HAIR[c] - v) * S;
      col[i * 3 + c] = v;
      let w = inn[i * 3 + c];
      w = w * (1 - L * 0.32) + (S ? (HAIR[c] - w) * S * 0.9 : 0);
      inn[i * 3 + c] = w;
    }
    ao[i] *= 1 - L * 0.35;
    rough[i] = rough[i] * (1 - S) + 0.42 * S + L * 0.25;
  }

  // ---- encode
  const cvs = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const toUrl = (fill, type = 'image/jpeg', q = 0.9) => {
    const c = cvs(W, H), g = c.getContext('2d'), im = g.createImageData(W, H);
    for (let i = 0; i < N; i++) { const p = fill(i); im.data[i * 4] = p[0]; im.data[i * 4 + 1] = p[1]; im.data[i * 4 + 2] = p[2]; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
    return c.toDataURL(type, q);
  };
  const srgb = (v) => Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, v), 1 / 1.0) * 255)));
  const diff = toUrl((i) => [srgb(col[i * 3]), srgb(col[i * 3 + 1]), srgb(col[i * 3 + 2])]);
  const inner = toUrl((i) => [srgb(inn[i * 3]), srgb(inn[i * 3 + 1]), srgb(inn[i * 3 + 2])]);
  // height units: 1 ≈ 1 mm of relief
  const nor = toUrl((i) => {
    const x = i % W, y = (i / W) | 0;
    const l = height[y * W + (x + W - 1) % W], r = height[y * W + (x + 1) % W];
    const u = height[Math.max(0, y - 1) * W + x], d = height[Math.min(H - 1, y + 1) * W + x];
    const sx = 0.001 * PX / 2, sy = 0.001 * PY / 2; // slope per pixel step in mm → metres
    let nx = -(r - l) * sx * 0.5, ny = (d - u) * sy * 0.5, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    return [Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255)];
  });
  const arm = toUrl((i) => [Math.round(ao[i] * 255), Math.round(Math.min(1, rough[i]) * 255), 0]);

  // ---- ornament bands, traced from the Suntar urasa (tools/ornament-traces.mjs, docs/patterns.md): dark bark
  // cut-outs and brown strips sewn on the light bark. Top half: the arcade band (11 repeats), bottom half: the
  // zigzag band (7 repeats); each repeat keeps the traced proportions, the world size is set in urasa/cover.js.
  const BW = 1024, BH = 256, band = cvs(BW, BH * 2), g = band.getContext('2d');
  const CR = [0xeb, 0xdf, 0xc4]; // the cover's cream: colours are the photo's ratios to its bark
  const rgb = (k) => `rgb(${CR.map((c, i) => Math.round(c * k[i])).join(',')})`;
  const drawBand = (T, n, y0, dark, strip) => {
    const sx = BW / n / T.w, sy = BH / T.h;
    for (let k = -1; k <= n; k++) {
      g.save(); g.translate(k * BW / n, y0); g.scale(sx, sy); if (T.shear) g.transform(1, T.shear, 0, 1, 0, 0);
      g.fillStyle = rgb(dark); g.fill(new Path2D(T.path));
      if (T.zigzag) {
        g.save(); g.clip(new Path2D(T.path)); g.fillStyle = rgb(strip); g.beginPath();
        T.zigzag.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore();
        g.fillStyle = rgb(dark);
        for (const [x, y] of T.zigzagDots) { g.beginPath(); g.arc(x, y, T.stripDots.r, 0, Math.PI * 2); g.fill(); }
      }
      g.restore();
    }
    g.fillStyle = rgb(strip);
    for (const [a, b] of T.strips) g.fillRect(0, y0 + a * sy, BW, (b - a + 1) * sy);
    if (T.stripDots) {
      g.fillStyle = rgb(dark);
      const nd = Math.round(BW / (T.stripDots.pitch * sx)), r = T.stripDots.r * sy;
      for (const row of T.stripDots.rows) for (let i = 0; i < nd; i++) { g.beginPath(); g.arc((i + 0.5) * BW / nd, y0 + row * sy, r, 0, Math.PI * 2); g.fill(); }
    }
  };
  drawBand(ARCADE, 11, 0, [0.25, 0.22, 0.22], [0.34, 0.29, 0.28]);
  drawBand(ZIGZAG, 7, BH, [0.29, 0.26, 0.26], [0.52, 0.44, 0.45]);
  // fibre streaks in the cut bark (±7 %); alpha keeps the cut shape with the canvas's soft edge
  const bd = g.getImageData(0, 0, BW, BH * 2);
  for (let y = 0; y < BH * 2; y++) for (let x = 0; x < BW; x++) {
    const i = (y * BW + x) * 4;
    const n = 1 + 0.07 * (vn(x / 6, y / 90, Math.round(BW / 6), 71) * 0.5 + vn(x / 40, y / 40, Math.round(BW / 40), 73) * 0.5);
    for (let c = 0; c < 3; c++) bd.data[i + c] = Math.min(255, Math.round(bd.data[i + c] * n));
  }
  g.putImageData(bd, 0, 0);
  return { diff, inner, nor, arm, band: band.toDataURL('image/png') };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const res = await page.evaluate(generate, { seed, ARCADE, ZIGZAG });
await browser.close();
for (const [name, url] of Object.entries(res)) {
  if (only && !only.includes(name)) continue;
  const ext = url.startsWith('data:image/png') ? 'png' : 'jpg';
  const file = new URL(`${name}.${ext}`, out);
  await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`✓ tuos_sheet/${name}.${ext}`);
}
