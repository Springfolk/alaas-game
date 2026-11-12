// The journal map up close (docs/ui.md): where the baked picture (0.4 m a pixel) would be stretched, squares of
// 256 px drawn for the part in view at 0.2, 0.1 or 0.05 m a pixel, over it. Drawn on demand in a worker
// (src/ui/mapworker.js, from the terrain's own functions); the latest are kept as PNG for a while, the rest dropped.
const TILE = 256;
const LEVELS = 3; // 16, 32, 64 squares a side

export class MapTiles {
  constructor(box, M) {
    this.box = box; this.M = M;
    this.els = new Map();  // key → img on the map
    this.urls = new Map(); // key → object URL, oldest first
    this.need = new Set(); this.queue = []; this.busy = null;
    this.keep = matchMedia('(pointer: coarse)').matches ? 40 : 96;
  }
  // `pads`: the terrain's flattened places (src/world/terrain.js), for the worker's copy of it
  init(pads) { this.pads = pads.map(({ x, z, r, soft, h }) => ({ x, z, r, soft, h })); }
  // `mpp`: metres a device pixel shows now; `rect`: the world in view, metres from the map's north-west corner
  update(mpp, rect) {
    let L = -1;
    for (let l = 0; l < LEVELS; l++) if (mpp < 0.3 / 2 ** l) L = l;
    const need = new Set(), span = 2 * this.M.half;
    if (L >= 0) {
      const n = 16 << L, tm = span / n, c = (a) => Math.min(n - 1, Math.max(0, Math.floor(a / tm)));
      const mx = (rect.x0 + rect.x1) / 2, mz = (rect.z0 + rect.z1) / 2, list = [];
      for (let j = c(rect.z0); j <= c(rect.z1); j++) for (let i = c(rect.x0); i <= c(rect.x1); i++) list.push([Math.hypot((i + 0.5) * tm - mx, (j + 0.5) * tm - mz), `${L}:${i}:${j}`]);
      for (const [, k] of list.sort((a, b) => a[0] - b[0])) need.add(k);
    }
    this.need = need;
    for (const k of need) if (!this.els.has(k) && this.urls.has(k)) this.place(k);
    this.queue = [...need].filter((k) => !this.urls.has(k));
    this.prune(L < 0 || this.els.size > need.size * 3 + 24);
    this.next();
  }
  next() {
    if (this.busy || !this.queue.length) return;
    const key = this.busy = this.queue.shift(), [L, i, j] = key.split(':').map(Number), M = this.M, tm = 2 * M.half / (16 << L);
    if (!this.w) {
      this.w = new Worker(new URL('./mapworker.js', import.meta.url), { type: 'module' });
      this.w.postMessage({ pads: this.pads || [] });
      this.w.onmessage = ({ data }) => this.got(data);
    }
    this.w.postMessage({ key, x0: M.cx - M.half + i * tm, z0: M.cz - M.half + j * tm, span: tm, size: TILE, M: { cx: M.cx, cz: M.cz, half: M.half } });
  }
  got({ key, blob }) {
    this.busy = null;
    this.urls.set(key, URL.createObjectURL(blob));
    for (const [k, u] of this.urls) { // the oldest go, but not one on the map
      if (this.urls.size <= this.keep) break;
      if (!this.els.has(k)) { URL.revokeObjectURL(u); this.urls.delete(k); }
    }
    if (this.need.has(key)) this.place(key);
    this.next();
  }
  place(key) {
    const [L, i, j] = key.split(':').map(Number), n = 16 << L, img = new Image();
    img.className = 'j-tile'; img.alt = ''; img.draggable = false;
    img.style.cssText = `left:${(i / n * 100).toFixed(4)}%;top:${(j / n * 100).toFixed(4)}%;width:calc(${(100 / n).toFixed(4)}% + var(--k) * 1px);z-index:${L}`;
    this.els.set(key, img);
    img.src = this.urls.get(key);
    img.decode().catch(() => {}).then(() => {
      if (this.els.get(key) !== img) return;
      this.box.appendChild(img);
      this.prune(false);
    });
  }
  // the squares no longer wanted: at once (`now`), else once every wanted one is on the map
  prune(now) {
    if (!now) for (const k of this.need) if (!this.els.get(k)?.isConnected) return;
    for (const [k, img] of this.els) if (!this.need.has(k)) { img.remove(); this.els.delete(k); }
  }
  clear() { this.need = new Set(); this.queue = []; this.prune(true); }
}
