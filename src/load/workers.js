// A small pool of load-time workers (src/load/worker.js). `job(type, args)` resolves with the result, or
// runs `fallback()` on the main thread when workers are unavailable or the job fails.
// Each worker runs at most two jobs at once (an async job's fetch overlaps the other's work); the rest wait
// in one queue, generation jobs before texture images, so the world's own build never queues behind ~130 decodes.
import { cachedJob } from './geocache.js';
import { span, event } from './prof.js';

const N = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 2) - 1)), PER = 2;
const LOW = new Set(['bitmap']); // queued after every other job type
let pool = null, seq = 0, closed = false;
const waiting = new Map(), queue = [];

function workers() {
  if (pool || closed) return pool || [];
  pool = [];
  try {
    for (let i = 0; i < N; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const done = (id) => { const p = waiting.get(id); waiting.delete(id); w.jobs--; dispatch(); return p; };
      w.onmessage = ({ data }) => { const p = done(data.id); if (data.error) p?.no(new Error(data.error)); else p?.ok(data.result); };
      w.onerror = (e) => { e.preventDefault?.(); for (const [id, p] of waiting) if (p.w === w) done(id).no(new Error('worker failed')); };
      w.jobs = 0;
      pool.push(w);
    }
  } catch { pool = []; }
  return pool;
}

function dispatch() {
  while (queue.length) {
    const w = pool?.reduce((a, b) => (b.jobs < a.jobs ? b : a)); // the least busy
    if (!w || w.jobs >= PER) return;
    const j = queue.shift();
    w.jobs++;
    waiting.set(j.id, { ...j, w });
    w.postMessage({ id: j.id, type: j.type, ...j.args });
  }
}

// (a baked result, src/load/geocache.js, stands in when it matches)
export const job = (type, args, fallback) => cachedJob(type, args, () => work(type, args, fallback));
// a job that is never baked (e.g. 'bitmap': a texture image)
export function work(type, args, fallback) {
  if (!workers().length) return Promise.resolve().then(fallback);
  return span(`job.${type}`, new Promise((ok, no) => {
    const j = { id: ++seq, type, args, ok, no };
    if (LOW.has(type)) queue.push(j);
    else { const at = queue.findIndex((q) => LOW.has(q.type)); queue.splice(at < 0 ? queue.length : at, 0, j); }
    dispatch();
  })).catch((e) => { console.warn(`worker ${type}:`, e.message, '— on the main thread'); return fallback(); });
}

// The pool is only for loading: let it go once the game is ready (and its last jobs are done).
export function closeWorkers() {
  if (waiting.size || queue.length) { setTimeout(closeWorkers, 500); return; }
  for (const w of pool || []) w.terminate();
  event('workers closed');
  pool = null; closed = true; // later jobs run on the main thread
}
