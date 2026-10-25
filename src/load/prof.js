// Load profiler (`?prof`, tools/loadtrace.mjs): main-thread time by bucket from navigation to ready, as
// exclusive time (a nested bucket pauses its parent), plus wall spans of off-thread work (fetch, decode,
// worker jobs, GPU pipelines). Read as `window.loadProf`. Off without the flag: every hook is a no-op.
export const PROF = typeof location !== 'undefined' && new URLSearchParams(location.search).has('prof');
const P = PROF ? (globalThis.loadProf = { ms: {}, n: {}, spans: {}, events: [] }) : null;
const stack = [];
let t0 = 0;

export function enter(b) {
  if (!P) return;
  const t = performance.now();
  if (stack.length) { const top = stack[stack.length - 1]; P.ms[top] = (P.ms[top] || 0) + t - t0; }
  stack.push(b); P.n[b] = (P.n[b] || 0) + 1; t0 = t;
}
export function exit() {
  if (!P) return;
  if (!stack.length) return;
  const t = performance.now(), b = stack.pop();
  P.ms[b] = (P.ms[b] || 0) + t - t0; t0 = t;
}
// fn's synchronous time in bucket b
export function timeSync(b, fn) {
  if (!P) return fn();
  enter(b);
  try { return fn(); } finally { exit(); }
}
// wraps obj[name] (synchronous part) into bucket b
export function wrap(obj, name, b) {
  if (!P || !obj?.[name]) return;
  const f = obj[name];
  obj[name] = function (...a) { enter(b); try { return f.apply(this, a); } finally { exit(); } };
}
// wall span of an async piece of work (not main-thread time): count, sum, first start, last end
export function span(b, promise, start = performance.now()) {
  if (!P) return promise;
  const s = P.spans[b] ||= { n: 0, sum: 0, first: Infinity, last: 0 };
  const done = () => { const t = performance.now(); s.n++; s.sum += t - start; s.first = Math.min(s.first, start); s.last = Math.max(s.last, t); };
  promise.then(done, done);
  return promise;
}
// a named point on the timeline, with the bucket totals so far (tools/loadtrace.mjs diffs them per interval)
export const event = (name) => P?.events.push([name, performance.now(), { ...P.ms }]);

// three's renderer internals worth timing (r186): texture upload and mips, pipelines, sync node builds, renders.
export function instrument(renderer) {
  if (!P) return;
  const be = renderer.backend, tu = be.textureUtils;
  wrap(renderer, 'render', 'render');
  wrap(renderer._nodes, 'getForRender', 'nodes');
  wrap(tu, 'createTexture', 'tex.create');
  wrap(tu, 'updateTexture', 'tex.upload');
  wrap(tu, 'generateMipmaps', 'tex.mips');
  wrap(be, 'createRenderPipeline', 'pipeline.create');
  wrap(be, 'createComputePipeline', 'pipeline.create');
  wrap(renderer._geometries, 'updateForRender', 'buffers');
  wrap(renderer._bindings, 'updateForRender', 'bindings');
  // a submitted queue's GPU time: wall from submit to done, sampled once per animation frame
  if (be.device?.queue) {
    const q = be.device.queue, sub = q.submit.bind(q);
    let pending = false;
    q.submit = (cmds) => {
      sub(cmds);
      if (!pending) { pending = true; span('gpu.queue', q.onSubmittedWorkDone()).finally(() => { pending = false; }); }
    };
  }
}
