// Binary packs of baked geometry (src/load/geocache.js, tools/bake-geometry.mjs). A pack is a JSON head plus
// arrays: 'GEO2', u32 head length, the head (UTF-8), then each array 4-byte aligned; the tool deflates the file.
// Per array (meshopt-style, so deflate finds runs):
//   plain:  typed array as is; integer arrays delta + zigzag coded (lossless).
//   q:      float vertex data quantised: 'lin' (each component in its own min…max, `b` bits) or 'oct' (unit
//           normals, octahedral, two components); stored component-major, delta + zigzag coded.
// Every multi-byte stream is split into byte planes. Decoding (in a load worker) gives back plain typed arrays
// (quantised data as Float32Array, interleaved as before). Pure JS.
const TYPES = { f64: Float64Array, f32: Float32Array, u32: Uint32Array, i32: Int32Array, u16: Uint16Array, i16: Int16Array, u8: Uint8Array, i8: Int8Array };
const UNSIGNED = { 1: Uint8Array, 2: Uint16Array, 4: Uint32Array };
export const typeTag = (a) => Object.keys(TYPES).find((k) => a.constructor === TYPES[k]);

// byte planes: [b0 of every element, b1 of every element, …]
function planes(src, size) {
  const n = src.length / size, out = new Uint8Array(src.length);
  for (let b = 0; b < size; b++) for (let i = 0, o = b * n; i < n; i++) out[o + i] = src[i * size + b];
  return out;
}
function unplanes(src, size) {
  const n = src.length / size, out = new Uint8Array(src.length);
  for (let b = 0; b < size; b++) for (let i = 0, o = b * n; i < n; i++) out[i * size + b] = src[o + i];
  return out;
}

// delta + zigzag on an unsigned view (in place), modulo 2^bits; `runs`: restart the delta every `runs` values
function zigzag(u, runs = u.length) {
  const M = 2 ** (u.BYTES_PER_ELEMENT * 8), H = M / 2;
  let prev = 0;
  for (let i = 0; i < u.length; i++) {
    if (i % runs === 0) prev = 0;
    const x = u[i];
    let d = x - prev;
    if (d >= H) d -= M; else if (d < -H) d += M;
    u[i] = d >= 0 ? 2 * d : -2 * d - 1;
    prev = x;
  }
}
function unzigzag(u, runs = u.length) {
  const M = 2 ** (u.BYTES_PER_ELEMENT * 8);
  let prev = 0;
  for (let i = 0; i < u.length; i++) {
    if (i % runs === 0) prev = 0;
    const z = u[i], d = z % 2 ? -(z + 1) / 2 : z / 2;
    prev = u[i] = ((prev + d) % M + M) % M;
  }
}

const OCT = (x, y, z) => { // unit vector → [-1, 1]²
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let u = x / l, v = y / l;
  if (z < 0) { const ou = u; u = (1 - Math.abs(v)) * Math.sign(ou || 1); v = (1 - Math.abs(ou)) * Math.sign(v || 1); }
  return [u, v];
};

// float array (itemSize s) → { q (unsigned, component-major), meta } or null (non-finite data)
function quantise(a, { s, kind, b }) {
  const n = a.length / s, L = 2 ** b - (kind === 'oct' ? 2 : 1), T = b > 8 ? Uint16Array : Uint8Array; // oct: 0 exact
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return null;
  if (kind === 'oct') {
    const q = new T(n * 2);
    for (let i = 0; i < n; i++) {
      const [u, v] = OCT(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      q[i] = Math.round((u * 0.5 + 0.5) * L); q[n + i] = Math.round((v * 0.5 + 0.5) * L);
    }
    return { q, meta: { s, k: 'oct', b } };
  }
  const mn = [], mx = [], q = new T(n * s);
  for (let c = 0; c < s; c++) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const v = a[i * s + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
    if (!n) lo = hi = 0;
    mn.push(lo); mx.push(hi);
    const k = hi > lo ? L / (hi - lo) : 0;
    for (let i = 0; i < n; i++) q[c * n + i] = Math.round((a[i * s + c] - lo) * k);
  }
  return { q, meta: { s, k: 'lin', b, mn, mx } };
}
function dequantise(q, n, { s, k, b, mn, mx }) {
  const L = 2 ** b - (k === 'oct' ? 2 : 1), out = new Float32Array(n * s);
  if (k === 'oct') {
    for (let i = 0; i < n; i++) {
      let u = q[i] / L * 2 - 1, v = q[n + i] / L * 2 - 1;
      const z = 1 - Math.abs(u) - Math.abs(v);
      if (z < 0) { const ou = u; u = (1 - Math.abs(v)) * Math.sign(ou || 1); v = (1 - Math.abs(ou)) * Math.sign(v || 1); }
      const l = Math.hypot(u, v, z) || 1;
      out[i * 3] = u / l; out[i * 3 + 1] = v / l; out[i * 3 + 2] = z / l;
    }
    return out;
  }
  for (let c = 0; c < s; c++) {
    const lo = mn[c], step = (mx[c] - lo) / L;
    for (let i = 0; i < n; i++) out[i * s + c] = lo + q[c * n + i] * step;
  }
  return out;
}

// arrays: typed arrays; opts[k]: { q: { s, kind: 'lin'|'oct', b } } for float vertex data. → Uint8Array (not deflated)
export function encodePack(head, arrays, opts = []) {
  const table = [], blobs = [];
  arrays.forEach((a, k) => {
    const t = typeTag(a);
    if (!t) throw new Error('geo pack: unsupported array ' + a.constructor.name);
    const o = opts[k], qd = o?.q && t === 'f32' ? quantise(a, o.q) : null;
    let u;
    if (qd) {
      u = qd.q;
      zigzag(u, u.length / (qd.meta.k === 'oct' ? 2 : qd.meta.s));
      table.push(['q', a.length / qd.meta.s, qd.meta]);
    } else if (t[0] === 'f') {
      u = new Uint8Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
      table.push([t, a.length]);
    } else {
      u = new UNSIGNED[a.BYTES_PER_ELEMENT](a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
      zigzag(u);
      table.push([t, a.length, 1]);
    }
    const size = t[0] === 'f' && !qd ? a.BYTES_PER_ELEMENT : u.BYTES_PER_ELEMENT;
    const bytes = new Uint8Array(u.buffer, u.byteOffset, u.byteLength);
    blobs.push(size > 1 ? planes(bytes, size) : bytes);
  });
  const json = new TextEncoder().encode(JSON.stringify({ ...head, arrays: table }));
  const pad = (n) => (n + 3) & ~3;
  let len = pad(8 + json.length);
  for (const b of blobs) len += pad(b.length);
  const out = new Uint8Array(len), dv = new DataView(out.buffer);
  out.set([71, 69, 79, 50]); dv.setUint32(4, json.length, true); out.set(json, 8);
  let o = pad(8 + json.length);
  for (const b of blobs) { out.set(b, o); o += pad(b.length); }
  return out;
}

// Uint8Array (inflated) → { head, arrays }
export function decodePack(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x324f4547) throw new Error('geo pack: bad magic');
  const jl = dv.getUint32(4, true);
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + jl)));
  const pad = (n) => (n + 3) & ~3;
  let o = pad(8 + jl);
  const take = (count, size) => { const raw = bytes.subarray(o, o + count * size); o += pad(count * size); return size > 1 ? unplanes(raw, size) : raw.slice(); };
  const arrays = head.arrays.map(([t, n, d]) => {
    if (t === 'q') {
      const comps = d.k === 'oct' ? 2 : d.s, size = d.b > 8 ? 2 : 1;
      const u = new UNSIGNED[size](take(n * comps, size).buffer);
      unzigzag(u, n);
      return dequantise(u, n, d);
    }
    const T = TYPES[t], size = T.BYTES_PER_ELEMENT, buf = take(n, size).buffer;
    if (d) unzigzag(new UNSIGNED[size](buf));
    return new T(buf);
  });
  return { head, arrays };
}

// fetch + inflate (DecompressionStream) + decode; in a worker (job 'geo') or on the main thread
export async function fetchPack(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const inflated = await new Response(r.body.pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
  return decodePack(new Uint8Array(inflated));
}
