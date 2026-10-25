// Paints the forest's own textures in headless Chrome (canvas 2D) and writes them to public/assets/tex/:
//   birch_bark/{diff,nor,arm}.jpg — tileable white birch bark (no CC0 photo set exists)
//   foliage/{larch,birch,pine,shrub}.png — 2×2 atlases of twig cards with alpha
// Deterministic (seeded). Usage: node tools/gen-forest-tex.mjs
import { chromium } from 'playwright-core';
import { CHROME } from './browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

// minimal RGBA PNG encoder (straight alpha, so colour survives under alpha 0)
function png(w, h, rgba) {
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const root = new URL('../public/assets/tex/', import.meta.url);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();

const out = await page.evaluate(() => {
  // ---------- helpers ----------
  let seed = 1;
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = (a, b) => a + (b - a) * rnd();
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // value noise, tileable over period p
  const hash = (x, y, s) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, px, py, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (a, p) => ((a % p) + p) % p;
    const a = hash(m(xi, px), m(yi, py), s), b = hash(m(xi + 1, px), m(yi, py), s);
    const c = hash(m(xi, px), m(yi + 1, py), s), d = hash(m(xi + 1, px), m(yi + 1, py), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, fx, fy, s, oct = 4) => { let t = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += vnoise(x * fx * f, y * fy * f, fx * f, fy * f, s + i) * amp; f *= 2; amp *= 0.5; } return t / 0.9375; };

  // ---------- birch bark ----------
  function birchBark() {
    seed = 7;
    const S = 1024;
    const col = canvas(S, S), cg = col.getContext('2d');
    const hgt = canvas(S, S), hg = hgt.getContext('2d');
    const rough = canvas(S, S), rg = rough.getContext('2d');
    // per-pixel base: warm white with soft grey/peach/greenish mottling (tileable noise)
    const img = cg.createImageData(S, S), himg = hg.createImageData(S, S), rimg = rg.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const n1 = fbm(u, v, 6, 10, 11), n2 = fbm(u, v, 3, 18, 21), n3 = fbm(u, v, 24, 70, 31, 3), n4 = fbm(u, v, 2, 4, 41);
      // horizontal grain: stretched noise
      const grain = fbm(u, v, 40, 260, 51, 2);
      let r = 236, g = 233, b = 226;
      const grey = Math.max(0, n1 - 0.45) * 70 + (grain - 0.5) * 10;
      r -= grey; g -= grey; b -= grey * 0.9;
      const peach = Math.max(0, n2 - 0.62) * 260; // where the outer paper peeled: pinkish-orange
      r -= peach * 0.06; g -= peach * 0.32; b -= peach * 0.48;
      const algae = Math.max(0, n4 - 0.6) * 120; // greenish-grey film
      r -= algae * 0.5; g -= algae * 0.3; b -= algae * 0.55;
      r += (n3 - 0.5) * 9; g += (n3 - 0.5) * 9; b += (n3 - 0.5) * 8;
      const i = (y * S + x) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
      const hv = 150 + (grain - 0.5) * 40 + (n3 - 0.5) * 30 - peach * 0.2;
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv; himg.data[i + 3] = 255;
      const rv = 150 + (n3 - 0.5) * 30 + algae * 0.4; // roughness ~0.6
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rv; rimg.data[i + 3] = 255;
    }
    cg.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0); rg.putImageData(rimg, 0, 0);

    // draw something on all three layers with wrap-around copies
    const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy); };

    // papery peel lines: thin horizontal light ridges with a shadow under them
    for (let k = 0; k < 140; k++) {
      const x = R(0, S), y = R(0, S), len = R(30, 260), curve = R(-4, 4);
      wrap((ox, oy) => {
        for (const [ctx, c, w, dy] of [[cg, 'rgba(120,110,100,0.18)', 2.2, 1.6], [cg, 'rgba(255,253,248,0.5)', 1.2, 0], [hg, 'rgba(70,70,70,0.6)', 3, 1.5], [hg, 'rgba(235,235,235,0.7)', 1.6, 0]]) {
          ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath();
          ctx.moveTo(ox + x, oy + y + dy); ctx.quadraticCurveTo(ox + x + len / 2, oy + y + curve + dy, ox + x + len, oy + y + dy * 0.5 + R(-1, 1)); ctx.stroke();
        }
      });
    }
    // peeled strips: thin horizontal tears showing the peach inner bark, a curled light edge above
    for (let k = 0; k < 10; k++) {
      const x = R(0, S), y = R(0, S), w = R(40, 160), h = R(3, 9);
      wrap((ox, oy) => {
        cg.fillStyle = `rgba(${R(200, 220)},${R(150, 170)},${R(118, 135)},0.5)`;
        cg.beginPath(); cg.ellipse(ox + x, oy + y, w / 2, h / 2, 0, 0, 7); cg.fill();
        cg.strokeStyle = 'rgba(252,249,242,0.95)'; cg.lineWidth = 2.5;
        cg.beginPath(); cg.ellipse(ox + x, oy + y - 1.5, w / 2, h / 2, 0, Math.PI * 1.02, Math.PI * 1.98); cg.stroke();
        hg.fillStyle = 'rgba(105,105,105,0.6)'; hg.beginPath(); hg.ellipse(ox + x, oy + y, w / 2, h / 2, 0, 0, 7); hg.fill();
        hg.strokeStyle = 'rgba(245,245,245,0.95)'; hg.lineWidth = 3; hg.beginPath(); hg.ellipse(ox + x, oy + y - 1.5, w / 2, h / 2, 0, Math.PI * 1.02, Math.PI * 1.98); hg.stroke();
      });
    }
    // branch scars: soft dark "eyebrow" chevrons below old branches, grey-black and rough
    // (none in the tile: a repeating texture would print them all over the trunk; real ones sit only below branches)
    for (let k = 0; k < 0; k++) {
      const x = R(0, S), y = R(0, S), w = R(180, 360), h = R(50, 110);
      wrap((ox, oy) => {
        const arm = (ctx, th, c) => {
          ctx.strokeStyle = c; ctx.lineWidth = th; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(ox + x - w / 2, oy + y + h * 0.15);
          ctx.quadraticCurveTo(ox + x - w * 0.2, oy + y - h * 0.15, ox + x, oy + y - h * 0.5);
          ctx.quadraticCurveTo(ox + x + w * 0.2, oy + y - h * 0.15, ox + x + w / 2, oy + y + h * 0.15); ctx.stroke();
        };
        cg.filter = 'blur(6px)'; arm(cg, h * 0.55, 'rgba(70,64,60,0.55)');
        cg.filter = 'blur(1.5px)'; arm(cg, h * 0.32, 'rgba(38,34,31,0.92)'); cg.filter = 'none';
        hg.filter = 'blur(3px)'; arm(hg, h * 0.4, 'rgba(60,60,60,0.9)'); hg.filter = 'none';
        rg.filter = 'blur(3px)'; arm(rg, h * 0.45, 'rgba(230,230,230,0.9)'); rg.filter = 'none';
        // the scar knob above the chevron
        cg.fillStyle = 'rgba(45,40,36,0.9)'; cg.beginPath(); cg.ellipse(ox + x, oy + y - h * 0.62, h * 0.18, h * 0.12, 0, 0, 7); cg.fill();
        for (let i = 0; i < 60; i++) { // cracks across the dark band
          const t = R(-0.45, 0.45), cx = x + t * w, cy = y - h * 0.5 + Math.abs(t) * h * 1.1 + R(-h * 0.12, h * 0.12);
          cg.strokeStyle = `rgba(${R(95, 140)},${R(90, 132)},${R(84, 120)},0.6)`; cg.lineWidth = R(1, 2);
          cg.beginPath(); cg.moveTo(ox + cx, oy + cy); cg.lineTo(ox + cx + R(-14, 14), oy + cy + R(-2, 2)); cg.stroke();
          hg.strokeStyle = 'rgba(20,20,20,0.8)'; hg.lineWidth = 2;
          hg.beginPath(); hg.moveTo(ox + cx, oy + cy); hg.lineTo(ox + cx + R(-14, 14), oy + cy + R(-2, 2)); hg.stroke();
        }
      });
    }
    // broken dark horizontal bands (old fissure rings) made of overlapping long lenticels
    for (let k = 0; k < 9; k++) {
      const y = R(0, S), x0 = R(0, S), span = R(120, 520);
      for (let i = 0; i < span / 14; i++) {
        const x = x0 + i * 14 + R(-6, 6), len = R(14, 46), th = R(3, 7);
        wrap((ox, oy) => {
          cg.fillStyle = `rgba(${R(36, 60)},${R(32, 52)},${R(28, 44)},${R(0.7, 0.92)})`;
          cg.beginPath(); cg.ellipse(ox + x, oy + y + R(-2, 2), len / 2, th / 2, 0, 0, 7); cg.fill();
          hg.fillStyle = 'rgba(55,55,55,0.85)'; hg.beginPath(); hg.ellipse(ox + x, oy + y, len / 2, th / 2, 0, 0, 7); hg.fill();
          rg.fillStyle = 'rgba(235,235,235,0.9)'; rg.beginPath(); rg.ellipse(ox + x, oy + y, len / 2, th / 2, 0, 0, 7); rg.fill();
        });
      }
    }
    // lenticels: horizontal dashes of all lengths, darker in the middle, a pale raised lip above
    for (let k = 0; k < 520; k++) {
      const band = Math.floor(R(0, 18));
      const y = (band / 18) * S + R(-22, 22), x = R(0, S);
      const len = Math.pow(rnd(), 1.6) * 110 + 8, th = R(1.6, 3.2) + len * R(0.02, 0.05);
      const a = R(0.55, 0.95);
      wrap((ox, oy) => {
        const g = cg.createLinearGradient(ox + x - len / 2, 0, ox + x + len / 2, 0);
        const dark = `rgba(${R(36, 70)},${R(30, 58)},${R(26, 50)},${a})`;
        g.addColorStop(0, 'rgba(70,60,52,0)'); g.addColorStop(0.2, dark); g.addColorStop(0.8, dark); g.addColorStop(1, 'rgba(70,60,52,0)');
        cg.fillStyle = g; cg.beginPath(); cg.ellipse(ox + x, oy + y, len / 2, th / 2, R(-0.02, 0.02), 0, 7); cg.fill();
        cg.strokeStyle = 'rgba(255,253,248,0.45)'; cg.lineWidth = 1.2; cg.beginPath(); cg.ellipse(ox + x, oy + y - 1, len / 2, th / 2 + 1, 0, Math.PI * 1.1, Math.PI * 1.9); cg.stroke();
        hg.fillStyle = 'rgba(60,60,60,0.85)'; hg.beginPath(); hg.ellipse(ox + x, oy + y, len / 2, th / 2, 0, 0, 7); hg.fill();
        hg.strokeStyle = 'rgba(220,220,220,0.7)'; hg.lineWidth = 1.5; hg.beginPath(); hg.ellipse(ox + x, oy + y - 0.8, len / 2, th / 2 + 1, 0, Math.PI, Math.PI * 2); hg.stroke();
        rg.fillStyle = 'rgba(235,235,235,0.9)'; rg.beginPath(); rg.ellipse(ox + x, oy + y, len / 2, th / 2, 0, 0, 7); rg.fill();
      });
    }
    // fine speckles and tiny pores
    for (let k = 0; k < 1400; k++) {
      const x = R(0, S), y = R(0, S), r = R(0.4, 1.2);
      cg.fillStyle = `rgba(80,70,62,${R(0.12, 0.4)})`; cg.beginPath(); cg.ellipse(x, y, r * R(1.5, 4), r * 0.6, 0, 0, 7); cg.fill();
    }
    // normal map from height (Sobel), wrap-around
    const H = hg.getImageData(0, 0, S, S).data, nrm = canvas(S, S), ng = nrm.getContext('2d'), ni = ng.createImageData(S, S);
    const at = (x, y) => H[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const k = 2.2; let nx = -dx * k, ny = dy * k, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * S + x) * 4;
      ni.data[i] = (nx * 0.5 + 0.5) * 255; ni.data[i + 1] = (ny * 0.5 + 0.5) * 255; ni.data[i + 2] = (nz * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
    }
    ng.putImageData(ni, 0, 0);
    // ARM: R = AO from height, G = roughness, B = metal 0
    const Rr = rg.getImageData(0, 0, S, S).data, arm = canvas(S, S), ag = arm.getContext('2d'), ai = ag.createImageData(S, S);
    for (let i = 0; i < S * S * 4; i += 4) { ai.data[i] = 150 + H[i] * 0.42; ai.data[i + 1] = Rr[i]; ai.data[i + 2] = 0; ai.data[i + 3] = 255; }
    ag.putImageData(ai, 0, 0);
    return { diff: col.toDataURL('image/jpeg', 0.92), nor: nrm.toDataURL('image/jpeg', 0.95), arm: arm.toDataURL('image/jpeg', 0.92) };
  }

  // ---------- foliage cards (2×2 atlas of 512 px cells; card bottom/attachment documented per species) ----------
  const C = 512;
  function curve(ctx, pts, w0, w1, color) {
    // tapered polyline
    for (let i = 0; i < pts.length - 1; i++) {
      const t = i / (pts.length - 1);
      ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = w0 + (w1 - w0) * t;
      ctx.beginPath(); ctx.moveTo(...pts[i]); ctx.lineTo(...pts[i + 1]); ctx.stroke();
    }
  }
  function path(x0, y0, ang, len, bend, n = 24) {
    const pts = []; let x = x0, y = y0, a = ang;
    for (let i = 0; i <= n; i++) { pts.push([x, y]); x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; a += bend / n + R(-0.03, 0.03); }
    return pts;
  }

  // Larch: a branchlet seen from above. Attachment at the left-centre (x=0, y=C/2), growing to +x.
  function larchCell(ctx) {
    const main = path(4, C / 2 + R(-20, 20), R(-0.08, 0.08), C * 0.95, R(-0.25, 0.25));
    const twigs = [main];
    for (let i = 0; i < 9; i++) {
      const p = main[Math.floor(R(3, main.length - 4))];
      const side = rnd() < 0.5 ? -1 : 1;
      twigs.push(path(p[0], p[1], side * R(0.5, 1.0), R(90, 220), side * R(-0.3, 0.1), 12));
    }
    const tuft = (x, y, s) => {
      const n = Math.floor(R(18, 34)), hue = R(78, 92), light = R(42, 54);
      for (let i = 0; i < n; i++) {
        const a = R(0, Math.PI * 2), l = R(14, 30) * s, fl = R(0.55, 1); // foreshortened rosette
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l * fl;
        const g = ctx.createLinearGradient(x, y, ex, ey);
        g.addColorStop(0, hsl(hue, 45, light - 10)); g.addColorStop(1, hsl(hue - 6, 55, light + 10));
        ctx.strokeStyle = g; ctx.lineWidth = R(1.2, 2.0); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a + 0.2) * l * 0.5, y + Math.sin(a + 0.2) * l * 0.5 * fl, ex, ey); ctx.stroke();
      }
      ctx.fillStyle = 'rgb(92,74,52)'; ctx.beginPath(); ctx.arc(x, y, 1.8 * s, 0, 7); ctx.fill();
    };
    twigs.forEach((t, k) => curve(ctx, t, k ? 2.2 : 4.5, 1, 'rgb(104,86,70)'));
    for (const t of twigs) {
      for (let i = 2; i < t.length; i += 1) {
        if (rnd() < 0.92) { const [x, y] = t[i]; tuft(x + R(-6, 6), y + R(-6, 6), R(0.95, 1.3) * (1 - i / t.length * 0.3)); }
      }
      // long-shoot tip: single needles along the last part
      const tip = t.slice(-5);
      for (const [x, y] of tip) for (let j = 0; j < 6; j++) {
        const a = R(0, Math.PI * 2), l = R(10, 20);
        ctx.strokeStyle = hsl(R(80, 90), 55, R(52, 60)); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.6); ctx.stroke();
      }
    }
  }

  // Birch: a weeping twig. Attachment at top-centre (x=C/2, y=0), hanging to +y.
  function birchLeaf(ctx, x, y, ang, size) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // petiole along +y
    ctx.strokeStyle = 'rgb(96,110,50)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, size * 0.28); ctx.stroke();
    ctx.translate(0, size * 0.28);
    const w = size * R(0.62, 0.78), L = size;
    // deltoid blade: wide truncate base, acuminate tip, doubly-serrated margin
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) { // right edge from base to tip
      const t = i / N;
      let half = t < 0.18 ? w / 2 * (0.55 + t / 0.18 * 0.45) : w / 2 * Math.pow(1 - (t - 0.18) / 0.82, 1.15);
      const tooth = (i % 2 ? 1 : 0) * size * 0.035 + (i % 4 === 1 ? size * 0.02 : 0);
      pts.push([half + (t > 0.05 && t < 0.92 ? tooth : 0), t * L]);
    }
    const hue = R(82, 98), sat = R(48, 62), lig = R(32, 44);
    const g = ctx.createLinearGradient(-w / 2, 0, w / 2, L);
    g.addColorStop(0, hsl(hue, sat, lig + 6)); g.addColorStop(1, hsl(hue - 4, sat, lig - 4));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0);
    for (const [px, py] of pts) ctx.lineTo(px, py);
    for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(-pts[i][0] * R(0.96, 1.04), pts[i][1]);
    ctx.closePath(); ctx.fill();
    // midrib and veins
    ctx.strokeStyle = hsl(hue - 8, 40, lig + 16, 0.8); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, L * 0.95); ctx.stroke();
    ctx.lineWidth = 0.6; ctx.strokeStyle = hsl(hue - 8, 40, lig + 12, 0.5);
    for (let i = 1; i < 7; i++) { const t = i / 8; ctx.beginPath(); ctx.moveTo(0, t * L); ctx.lineTo(w * 0.38 * (1 - t), t * L + L * 0.12); ctx.moveTo(0, t * L); ctx.lineTo(-w * 0.38 * (1 - t), t * L + L * 0.12); ctx.stroke(); }
    ctx.restore();
  }
  function birchCell(ctx) {
    // a curtain of thin weeping whips hanging from a short twig, leaves small and many
    const x0 = C / 2 + R(-20, 20);
    const twigs = [];
    const n = 6 + ((rnd() * 4) | 0);
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + R(-0.35, 0.35);
      twigs.push(path(x0 + R(-40, 40), R(0, 40), a, C * R(0.6, 0.98), R(-0.25, 0.25), 26));
    }
    twigs.forEach((t) => curve(ctx, t, 1.8, 0.6, 'rgb(70,46,34)'));
    for (const t of twigs) {
      for (let i = 1; i < t.length; i += 1) {
        const [x, y] = t[i]; const side = i % 2 ? 1 : -1;
        if (rnd() < 0.9) birchLeaf(ctx, x, y, side * R(0.3, 1.1) + R(-0.25, 0.25), R(15, 25) * (1 - i / t.length * 0.25));
      }
    }
  }

  // Scots pine: a shoot cluster seen from the side. Attachment left-centre, growing to +x.
  function pineCell(ctx) {
    const main = path(4, C / 2 + R(-20, 20), R(-0.15, 0.1), C * 0.9, R(-0.2, 0.2), 20);
    const shoots = [main];
    for (let i = 0; i < 5; i++) {
      const p = main[Math.floor(R(6, main.length - 2))];
      const side = rnd() < 0.5 ? -1 : 1;
      shoots.push(path(p[0], p[1], side * R(0.3, 0.8), R(110, 200), -side * R(0.1, 0.4), 10));
    }
    shoots.forEach((t, k) => curve(ctx, t, k ? 3 : 5, 2, 'rgb(120,82,52)'));
    for (const t of shoots) for (let i = 3; i < t.length; i++) {
      const [x, y] = t[i], [x1, y1] = t[Math.min(i + 1, t.length - 1)];
      const da = Math.atan2(y1 - y, x1 - x);
      for (let j = 0; j < 9; j++) {
        const a = da + (rnd() < 0.5 ? -1 : 1) * R(0.35, 1.0), l = R(40, 62);
        ctx.strokeStyle = hsl(R(95, 125), R(22, 32), R(22, 34)); ctx.lineWidth = R(1.4, 2.2); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6 - 3, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
  }

  // Shrubs: willow (cells 0,1) and wild rose with flowers (cells 2,3). Attachment at bottom-centre, growing up (−y).
  function willowCell(ctx) {
    // a leafy cluster (seen at any angle it reads as foliage mass, not a fan of stems)
    for (let k = 0; k < 5; k++) curve(ctx, path(C / 2 + R(-60, 60), C, -Math.PI / 2 + R(-0.9, 0.9), R(140, 280), R(-0.5, 0.5), 8), 2.2, 1, 'rgb(120,88,58)');
    for (let i = 0; i < 230; i++) {
      const a = R(0, Math.PI * 2), r = Math.sqrt(rnd()) * C * 0.42;
      const x = C / 2 + Math.cos(a) * r, y = C * 0.5 + Math.sin(a) * r * 0.9;
      ctx.save(); ctx.translate(x, y); ctx.rotate(R(0, Math.PI * 2));
      const L = R(34, 56), w = L * R(0.17, 0.25);
      const under = rnd() < 0.14; // silvery undersides
      ctx.fillStyle = under ? hsl(R(80, 95), R(10, 16), R(50, 58)) : hsl(R(80, 98), R(24, 36), R(24, 36));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w, L * 0.4, 0, L); ctx.quadraticCurveTo(-w, L * 0.4, 0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(220,230,210,0.3)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, L * 0.9); ctx.stroke();
      ctx.restore();
    }
  }
  function roseCell(ctx) {
    const stems = [];
    for (let i = 0; i < 3; i++) stems.push(path(C / 2 + R(-50, 50), C, -Math.PI / 2 + R(-0.4, 0.4), R(300, 470), R(-0.6, 0.6), 20));
    stems.forEach((t) => curve(ctx, t, 3.5, 1.5, 'rgb(118,58,44)'));
    for (const t of stems) {
      for (let i = 1; i < t.length; i++) { const [x, y] = t[i]; ctx.strokeStyle = 'rgb(140,80,60)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + R(-4, 4), y + R(-4, 4)); ctx.stroke(); } // prickles
      for (let i = 3; i < t.length; i += 2) {
        const [x, y] = t[i]; const side = (i / 2) % 2 ? 1 : -1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(-Math.PI / 2 + side * R(0.6, 1.1));
        const L = R(55, 80);
        ctx.strokeStyle = 'rgb(80,100,50)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, L); ctx.stroke();
        for (let j = 0; j < 7; j++) { // pinnate leaflets
          const ty = (j < 6 ? (Math.floor(j / 2) + 1) * L / 4 : L), sx = j < 6 ? (j % 2 ? 1 : -1) : 0;
          ctx.save(); ctx.translate(0, ty); ctx.rotate(sx * 1.1);
          ctx.fillStyle = hsl(R(95, 110), R(30, 42), R(24, 34));
          ctx.beginPath(); ctx.ellipse(0, 8, 5.5, 9.5, 0, 0, 7); ctx.fill(); ctx.restore();
        }
        ctx.restore();
      }
      // a flower or two near the top: five pink petals, yellow centre
      for (let f = 0; f < 2; f++) if (rnd() < 0.7) {
        const [x, y] = t[t.length - 1 - f * 5];
        for (let p = 0; p < 5; p++) {
          const a = p / 5 * Math.PI * 2 + R(-0.1, 0.1);
          ctx.fillStyle = hsl(R(330, 342), R(55, 70), R(62, 72));
          ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 10, 8, a, 0, 7); ctx.fill();
        }
        ctx.fillStyle = 'rgb(225,200,80)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
      }
    }
  }

  function atlas(cells, s0) {
    const c = canvas(C * 2, C * 2), ctx = c.getContext('2d');
    cells.forEach((fn, i) => {
      seed = s0 + i * 101;
      ctx.save(); ctx.translate((i % 2) * C, Math.floor(i / 2) * C);
      ctx.beginPath(); ctx.rect(0, 0, C, C); ctx.clip();
      fn(ctx); ctx.restore();
    });
    // bleed colour into transparent pixels so mipmaps don't fringe black
    const d = ctx.getImageData(0, 0, C * 2, C * 2), px = d.data, W = C * 2;
    // (alpha stays 0 there; the raw RGBA goes to Node, which writes the PNG without premultiplying)
    const filled = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) filled[i] = px[i * 4 + 3] > 0 ? 1 : 0;
    for (let pass = 0; pass < 24; pass++) {
      const prev = filled.slice();
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const k = y * W + x; if (prev[k]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const o of [-1, 1, -W, W]) if (prev[k + o]) { const j = (k + o) * 4; r += px[j]; g += px[j + 1]; b += px[j + 2]; n++; }
        if (n) { const i = k * 4; px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; filled[k] = 1; }
      }
    }
    let bin = ''; for (let i = 0; i < px.length; i += 8192) bin += String.fromCharCode.apply(null, px.subarray(i, i + 8192));
    return { w: W, h: W, rgba: btoa(bin) };
  }

  return {
    bark: birchBark(),
    larch: atlas([larchCell, larchCell, larchCell, larchCell], 300),
    birch: atlas([birchCell, birchCell, birchCell, birchCell], 400),
    pine: atlas([pineCell, pineCell, pineCell, pineCell], 500),
    shrub: atlas([willowCell, willowCell, roseCell, roseCell], 600),
  };
});

const save = async (rel, url) => {
  const file = new URL(rel, root);
  await mkdir(new URL('.', file), { recursive: true });
  await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
  console.log('✓', rel);
};
await save('birch_bark/diff.jpg', out.bark.diff);
await save('birch_bark/nor.jpg', out.bark.nor);
await save('birch_bark/arm.jpg', out.bark.arm);
for (const k of ['larch', 'birch', 'pine', 'shrub']) {
  const { w, h, rgba } = out[k];
  const file = new URL(`foliage/${k}.png`, root);
  await mkdir(new URL('.', file), { recursive: true });
  await writeFile(file, png(w, h, Buffer.from(rgba, 'base64')));
  console.log('✓', `foliage/${k}.png`);
}
await browser.close();
