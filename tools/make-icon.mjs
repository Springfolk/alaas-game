// Draws the project icon, docs/img/icon.svg: the birch-bark urasa (frame.js profile, steepened for a flat icon)
// with its two ornament bands traced from a real urasa (docs/patterns.md), the plank door under its lintel, the smoke-hole
// collar and the gathered pole tips, over the alaas lake and meadow. Then run tools/readme-art.mjs.
// node tools/make-icon.mjs [out.svg]
import { writeFileSync } from 'node:fs';
import { ARCADE, ZIGZAG } from './ornament-traces.mjs';
const out = process.argv[2] || new URL('../docs/img/icon.svg', import.meta.url).pathname;
const C = 128;
const col = { cream: '#f3ead6', seam: '#dccfae', dark: '#21160f', wood: '#a06b38', woodDk: '#6b4222', sky: '#a8d0e2', lake: '#3a82aa', meadow: '#5f8f37', shore: '#4d7a2c' };
const f = (n) => +n.toFixed(1);

// right half-profile: [Y, halfwidth], sampled from the cubic path below
const TOP = 48, BASE = 212;
const segs = [
  [[7, TOP], [29, 66], [71, 142], [74, 196]],
  [[74, 196], [74.5, 204], [75.5, 209], [77, BASE]],
];
const bez = (p, t) => [0, 1].map((k) => (1 - t) ** 3 * p[0][k] + 3 * (1 - t) ** 2 * t * p[1][k] + 3 * (1 - t) * t * t * p[2][k] + t ** 3 * p[3][k]);
const samples = [];
for (const s of segs) for (let i = 0; i <= 60; i++) samples.push(bez(s, i / 60));
const halfW = (Y) => { // half width at Y
  for (let i = 1; i < samples.length; i++) {
    const [x0, y0] = samples[i - 1], [x1, y1] = samples[i];
    if (Y >= y0 && Y <= y1) return x0 + (x1 - x0) * ((Y - y0) / (y1 - y0 || 1));
  }
  return Y < TOP ? 7 : 77;
};
const pathOf = (s) => `C${s[1].map(f)} ${s[2].map(f)} ${s[3].map(f)}`;
const mirror = (p) => [2 * C - p[0], p[1]];
const right = segs.map((s) => pathOf(s.map(([x, y]) => [C + x, y]))).join(' ');
const leftSegs = [...segs].reverse().map((s) => [...s].reverse().map(([x, y]) => mirror([C + x, y])));
const left = leftSegs.map(pathOf).join(' ');
const cone = `M${C + 7} ${TOP} ${right} H${f(C - 77)} ${left} Z`;

// a ring round the cone at height Y seen from below: it bows up at the middle (∩)
const SAG = 0.06;
const ringY = (Y, x) => { const w = halfW(Y), u = Math.min(1, Math.abs(x - C) / w); return Y - SAG * w * (1 - u * u); };
const ringPath = (Y) => { const w = halfW(Y) + 6, pts = []; for (let i = 0; i <= 24; i++) { const x = C - w + (2 * w * i) / 24; pts.push([x, ringY(Y, x)]); } return pts; };
const bandShape = (Y0, Y1) => { const a = ringPath(Y0), b = ringPath(Y1).reverse(); return 'M' + [...a, ...b].map((p) => p.map(f).join(' ')).join(' L') + ' Z'; };

// the ornament bands, traced from the Suntar urasa (tools/ornament-traces.mjs, docs/patterns.md), in its order:
// the zigzag band higher up, the arcade band just above the door. Simplified only by dropping detail: fewer,
// larger repeats (the ornament is drawn larger than on the house, its own proportions kept), no punched dots,
// no specks under 24 px.
const subpaths = (d, minSize) => d.split(/(?=M)/).filter((sp) => {
  const n = sp.match(/-?\d+(?:\.\d+)?/g).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) >= minSize;
}).join('');
const shade = (k) => '#' + [0xf3, 0xea, 0xd6].map((c, i) => Math.round(c * k[i]).toString(16).padStart(2, '0')).join('');
let orn = '', defs = '';
const tracedBand = (T, Y0, Y1, dark, strip) => {
  const sy = (Y1 - Y0) / T.h, ym = (Y0 + Y1) / 2, w0 = halfW(ym), d = subpaths(T.path, 24);
  const n = Math.round((w0 * Math.PI) / 2 / (T.w * sy)); // repeats per quarter turn, so the front one keeps its proportions
  // border strips follow the ring
  for (const [a, b] of T.strips) orn += `<path fill="${strip}" d="${bandShape(Y0 + a * sy, Y0 + (b + 1) * sy)}"/>`;
  for (let k = -n; k <= n; k++) {
    const th = (k / n) * (Math.PI / 2); if (Math.abs(th) >= Math.PI / 2) continue;
    const c = Math.cos(th), x = C + w0 * Math.sin(th), pw = (w0 * Math.PI / 2 / n) * c; // repeat width, foreshortened
    const lift = ringY(ym, x) - ym; // the ring bows up towards the middle
    const tf = `translate(${f(x)} ${f(Y0 + lift)}) scale(${(pw / T.w).toFixed(4)} ${sy.toFixed(4)}) translate(${-T.w / 2} 0)${T.shear ? ` matrix(1 ${T.shear.toFixed(4)} 0 1 0 0)` : ''}`;
    orn += `<use href="#${T.id}" fill="${dark}" stroke="${dark}" stroke-width="0.7" vector-effect="non-scaling-stroke" transform="${tf}"/>`;
    if (T.zigzag) orn += `<use href="#${T.id}-strip" fill="${strip}" transform="${tf}"/>`;
  }
  defs += `<path id="${T.id}" d="${d}"/>` + (T.zigzag ? `<path id="${T.id}-strip" d="M${T.zigzag.map((p) => p.join(' ')).join(' L')} Z"/>` : '');
};
tracedBand({ ...ZIGZAG, id: 'zigzag' }, 80, 124, shade([0.29, 0.26, 0.26]), shade([0.52, 0.44, 0.45]));
tracedBand({ ...ARCADE, id: 'arcade' }, 128, 166, shade([0.25, 0.22, 0.22]), shade([0.34, 0.29, 0.28]));

// sheet joins: meridians of the cream sheets, and a few ring joins
let seams = '';
for (const th of [-1.05, -0.62, -0.22, 0.22, 0.62, 1.05]) {
  const pts = []; for (let Y = TOP + 2; Y <= BASE; Y += 4) pts.push([C + halfW(Y) * Math.sin(th), Y]);
  seams += `<path d="M${pts.map((p) => p.map(f).join(' ')).join(' L')}"/>`;
}

// the door: plank door in a frame with a lintel, standing in the wall
const D = { x0: 112, x1: 144, y0: 172, y1: BASE };
const door = `
  <rect x="${D.x0 - 4}" y="${D.y0}" width="${D.x1 - D.x0 + 8}" height="${D.y1 - D.y0}" fill="${col.dark}"/>
  <rect x="${D.x0}" y="${D.y0 + 3}" width="${D.x1 - D.x0}" height="${D.y1 - D.y0 - 3}" fill="${col.wood}"/>
  <path d="M${(D.x0 + D.x1) / 2} ${D.y0 + 4} V${D.y1}" stroke="${col.woodDk}" stroke-width="2.5"/>
  <rect x="${D.x0 - 9}" y="${D.y0 - 6}" width="${D.x1 - D.x0 + 18}" height="7" rx="1.5" fill="${col.dark}"/>`;

// the crown: the smoke-hole collar and the gathered pole tips (a tight bundle, no crossing)
const crown = `
  <path d="M122.5 50 L120.8 30 M128 50 L128 26 M133.5 50 L135.2 30" stroke="${col.dark}" stroke-width="4.2" stroke-linecap="round"/>
  <rect x="115" y="${TOP - 6}" width="26" height="11" rx="2.5" fill="${col.dark}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <title>Алаас</title>
  <defs>
    <clipPath id="disc"><circle cx="128" cy="128" r="118"/></clipPath>
    <clipPath id="cone"><path d="${cone}"/></clipPath>
    ${defs}
  </defs>
  <circle cx="128" cy="128" r="126" fill="${col.dark}"/>
  <g clip-path="url(#disc)">
    <rect width="256" height="256" fill="${col.sky}"/>
    <path d="M0 150 Q128 140 256 150 V256 H0 Z" fill="${col.lake}"/>
    <path d="M0 194 Q128 182 256 194 V256 H0 Z" fill="${col.meadow}"/>
  </g>
  ${crown}
  <path d="${cone}" fill="${col.cream}"/>
  <g clip-path="url(#cone)">
    <g fill="none" stroke="${col.seam}" stroke-width="2.2">${seams}</g>
    <g>${orn}</g>
  </g>
  ${door}
  <path d="${cone}" fill="none" stroke="${col.dark}" stroke-width="8" stroke-linejoin="round"/>
</svg>
`;
writeFileSync(out, svg);
console.log('wrote', out, svg.length, 'bytes');
