// ?remotelog: a phone has no console here, so this posts console errors/warnings/info, page errors and a 2 s
// heartbeat (rAF frames, frames rendered, longest frame gap, resolution, texture sharpening, audio, visibility; cpu =
// mean ms of JS per game frame, gpu = median ms from a frame's submit until a WebGL2 fence after it signals, sampled
// every 8th frame: iOS has no GPU timer queries; high gpu with low cpu = GPU-bound)
// to /__log on the same origin; tools/phonelog.mjs prints them. A hang shows as the heartbeat stopping (main
// thread) or frames still ticking with `rendered` stuck (the GPU side).
import { TIER } from '../engine/tier.js';

const LOG = `${import.meta.env.BASE_URL}__log`;
const q = [];
const push = (kind, msg) => q.push({ t: Math.round(performance.now()), kind, msg: String(msg).slice(0, 4000) });
const text = (x) => (x instanceof Error ? `${x.name}: ${x.message} | ${x.stack}` : typeof x === 'object' ? (() => { try { return JSON.stringify(x); } catch { return String(x); } })() : x);
for (const k of ['error', 'warn', 'info']) {
  const f = console[k].bind(console);
  console[k] = (...a) => { push(k, a.map(text).join(' ')); f(...a); };
}
addEventListener('error', (e) => push('pageerror', e.error?.stack || e.message));
addEventListener('unhandledrejection', (e) => push('rejection', text(e.reason)));
document.addEventListener('visibilitychange', () => push('visibility', document.visibilityState));
let frames = 0, worst = 0, last = performance.now();
const raf = () => { const t = performance.now(); worst = Math.max(worst, t - last); last = t; frames++; requestAnimationFrame(raf); };
requestAnimationFrame(raf);
let cpu = 0, ticks = 0, gpus = [];
const fence = (gl) => {
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0 = performance.now();
  if (!s) return;
  gl.flush();
  const poll = () => { if (gl.getSyncParameter(s, gl.SYNC_STATUS) === gl.SIGNALED) { gpus.push(performance.now() - t0); gl.deleteSync(s); } else setTimeout(poll, 1); };
  setTimeout(poll, 1);
};
const hook = (g) => {
  if (!g?.frame || g.frame.logged) return;
  const f = g.frame.bind(g), gl = g.engine?.renderer?.backend?.gl;
  g.frame = (...a) => { const t = performance.now(); f(...a); cpu += performance.now() - t; if (++ticks % 8 === 0 && gl?.fenceSync) fence(gl); };
  g.frame.logged = true;
};
const send = () => {
  const g = window.game, e = g?.engine, r = e?.renderer;
  hook(g);
  const gs = gpus.sort((a, b) => a - b), gpu = gs.length ? Math.round(gs[gs.length >> 1]) : null;
  push('beat', JSON.stringify({ frames, worst: Math.round(worst), cpu: ticks ? +(cpu / ticks).toFixed(1) : null, gpu, rendered: r?.info?.frame, ready: !!g?.ready, playing: !!g && !g.title && !g.paused,
    sharp: !!g?.sharp, tier: e?.tier, lite: !!TIER.lite, why: TIER.reason, pr: r?.getPixelRatio?.(), res: e?.resScale, audio: g?.audio?.ctx?.state, pos: g?.player && [Math.round(g.player.pos.x), Math.round(g.player.pos.z)] }));
  frames = 0; worst = 0; cpu = 0; ticks = 0; gpus = [];
  fetch(LOG, { method: 'POST', body: JSON.stringify({ ua: navigator.userAgent, entries: q.splice(0) }), keepalive: true }).catch(() => {});
};
setInterval(send, 2000);
addEventListener('pagehide', send);
push('info', `remotelog on · ${innerWidth}×${innerHeight} @${devicePixelRatio} · ${location.search}`);
