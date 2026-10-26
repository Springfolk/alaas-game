// ?remotelog: a phone has no console here, so this posts console errors/warnings/info, page errors and a 2 s
// heartbeat (rAF frames, frames rendered, longest frame gap, resolution, texture sharpening, audio, visibility)
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
const send = () => {
  const g = window.game, e = g?.engine, r = e?.renderer;
  push('beat', JSON.stringify({ frames, worst: Math.round(worst), rendered: r?.info?.frame, ready: !!g?.ready, playing: !!g && !g.title && !g.paused,
    sharp: !!g?.sharp, tier: e?.tier, lite: !!TIER.lite, why: TIER.reason, pr: r?.getPixelRatio?.(), res: e?.resScale, audio: g?.audio?.ctx?.state, pos: g?.player && [Math.round(g.player.pos.x), Math.round(g.player.pos.z)] }));
  frames = 0; worst = 0;
  fetch(LOG, { method: 'POST', body: JSON.stringify({ ua: navigator.userAgent, entries: q.splice(0) }), keepalive: true }).catch(() => {});
};
setInterval(send, 2000);
addEventListener('pagehide', send);
push('info', `remotelog on · ${innerWidth}×${innerHeight} @${devicePixelRatio} · ${location.search}`);
