// The journal map's drawing (docs/ui.md): the alaas from straight above as a drawn map, from the terrain's own
// functions (relief shading and contour lines, the lake, the taiga, the trodden paths), north up. One square of the
// world at any resolution: the whole map baked once (tools/bake-map.mjs), its close tiles drawn on demand
// (src/ui/maptiles.js, in a worker). Pure: no DOM, no three.

// RGBA pixels (size × size) for the world square [x0, x0 + span] × [z0, z0 + span] (m); `M` = the whole map's extent
// ({ cx, cz, half }: its edge sinks into the frame's glass).
export function drawMap(T, x0, z0, span, size, M) {
  const px = span / size; // m per pixel
  const G = (size >> 1) + 3, cell = 2 * px; // a grid at half the resolution, one cell over each edge
  const gx = x0 - cell, gz = z0 - cell;
  const hgt = new Float32Array(G * G), wat = new Float32Array(G * G), forest = new Float32Array(G * G), path = new Float32Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = gx + i * cell, z = gz + j * cell, h = T.height(x, z), k = j * G + i;
    hgt[k] = h;
    const w = T.water(x, z, h);
    wat[k] = w === null ? 0 : w - h;
    forest[k] = T.forest(x, z);
    path[k] = T.splat(x, z, h)[2];
  }
  const at = (a, u, v) => { // bilinear
    const x = Math.min(G - 1.001, Math.max(0, u)), y = Math.min(G - 1.001, Math.max(0, v)), i = x | 0, j = y | 0, fx = x - i, fy = y - j, k = j * G + i;
    return (a[k] * (1 - fx) + a[k + 1] * fx) * (1 - fy) + (a[k + G] * (1 - fx) + a[k + G + 1] * fx) * fy;
  };
  const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const mix = (a, b, t) => a + (b - a) * t, sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const d = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / 2 + 1, v = (y + 0.5) / 2 + 1; // (pixel centre on the grid)
    const h = at(hgt, u, v), w = at(wat, u, v), f = at(forest, u, v), p = at(path, u, v);
    const dx = (at(hgt, u + 1, v) - at(hgt, u - 1, v)) / (2 * cell), dz = (at(hgt, u, v + 1) - at(hgt, u, v - 1)) / (2 * cell);
    const shade = Math.min(1.25, Math.max(0.6, 1 + (-dx - dz) * 2.2)); // lit from the north-west
    // the meadow: pale warm green, drier and paler up the slope
    const up = sm(91.5, 100, h);
    let r = mix(176, 196, up), g = mix(196, 201, up), b = mix(128, 140, up);
    // trodden earth
    const pk = sm(0.45, 0.75, p) * 0.75;
    r = mix(r, 214, pk); g = mix(g, 196, pk); b = mix(b, 158, pk);
    const wx = x0 + (x + 0.5) * px, wz = z0 + (y + 0.5) * px;
    // taiga: darker, with the grain of tree crowns
    if (f > 0.02) {
      const cu = wx / 3.2, cv = wz / 3.2, ci = Math.floor(cu), cj = Math.floor(cv), edge = px / 3.2; // crowns ~3 m apart
      let dot = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { // each cell's crown, off its centre, of its own size
        const I = ci + a, J = cj + b;
        if (hash(I, J) >= f * 0.9) continue;
        const ox = I + 0.5 + (hash(I + 17.3, J) - 0.5) * 0.5, oz = J + 0.5 + (hash(I, J + 9.1) - 0.5) * 0.5, rr = 0.3 + hash(I + 3.7, J + 5.3) * 0.18;
        dot = Math.max(dot, 1 - sm(rr - edge, rr, Math.hypot(cu - ox, cv - oz)));
      }
      const t = sm(0.05, 0.6, f);
      r = mix(r, 96 - dot * 26, t); g = mix(g, 128 - dot * 26, t); b = mix(b, 92 - dot * 22, t);
    }
    r *= shade; g *= shade; b *= shade;
    // contour lines every metre (every fifth stronger), thinning out where the ground is level; about a pixel
    // wide at the whole map's scale, finer in metres as the picture gets closer
    const grad = Math.hypot(dx, dz) * px;
    if (grad > 0.004 * px / 0.4 && w <= 0) {
      const fr = Math.abs(((h % 1) + 1) % 1 - 0.5), dist = (0.5 - fr) / grad; // px from the nearest line
      const major = Math.abs(Math.round(h) % 5) === 0;
      const a = Math.max(0, 1 - dist / (major ? 1.1 : 0.7)) * (major ? 0.34 : 0.2);
      r = mix(r, 92, a); g = mix(g, 84, a); b = mix(b, 56, a);
    }
    // the lake: a pale shallows, deeper blue outward, a bright shoreline
    if (w > 0) {
      const deep = sm(0, 1.6, w);
      r = mix(170, 96, deep); g = mix(210, 160, deep); b = mix(232, 214, deep);
      const edge = 1 - sm(0, 0.06, w);
      r = mix(r, 250, edge); g = mix(g, 252, edge); b = mix(b, 255, edge);
    } else if (w > -0.25 && at(wat, u, v) === 0 && h < 90.6 + 0.35) { r = mix(r, 224, 0.5); g = mix(g, 214, 0.5); b = mix(b, 176, 0.5); } // the wet shore
    // towards the map's edge it sinks into the frame's dark glass
    const e = Math.max(Math.abs((wx - M.cx) / M.half), Math.abs((wz - M.cz) / M.half)), vg = sm(0.9, 1, e);
    r = mix(r, 22, vg); g = mix(g, 44, vg); b = mix(b, 68, vg);
    const k = (y * size + x) * 4;
    d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 255;
  }
  return d;
}
