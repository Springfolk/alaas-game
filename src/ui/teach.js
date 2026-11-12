// Lessons (docs/ui.md): the controls are taught one at a time, each at the moment it is first needed, drawn as
// the real key, mouse, stick or gesture, and each gone for good once the player has done it (`save.taught`).
// One card (`#teach`, index.html), DOM only; on a phone the real button it is about also gets a ring.
// `note(id)`: the player did that (shown or not: someone who presses E unasked needs no lesson).
import { control } from './i18n.js';
import { icon, actIcon, MOUSE } from './icons.js';

const key = (k, cls = '') => `<kbd class="${cls}">${k}</kbd>`;
const btn = (k, cls = '') => `<span class="t-btn ${cls}">${icon(k)}</span>`;
const SWAY = '<i class="t-arr l"></i>%<i class="t-arr r"></i>';
// what is drawn: [keyboard and mouse, touch]; `g`: the game (the act of the moment gives the do lesson its tool)
const ART = {
  look: () => [SWAY.replace('%', `<span class="t-sway">${MOUSE.move}</span>`), SWAY.replace('%', `<span class="t-sway">${icon('finger')}</span>`)],
  walk: () => [`<span class="t-wasd">${key('W', 'lit')}${key('A')}${key('S')}${key('D')}</span>`, '<span class="t-stick"><i></i></span>'],
  aim: () => { const a = '<span class="t-aim"><i class="thing"></i><i class="dot"></i></span>'; return [a, a]; },
  read: () => [`${key('E', 'lit')}<span class="t-btn read">${icon('eye')}</span>`, btn('eye', 'read tap')],
  turn: () => [SWAY.replace('%', `<span class="t-sway">${MOUSE.left}</span>`), SWAY.replace('%', `<span class="t-sway">${icon('finger')}</span>`)],
  do: (g) => { const k = actIcon(g.doAct); return [`<span class="t-press">${MOUSE.left}</span>${btn(k, 'do sq')}`, btn(k, 'do sq tap')]; },
  put: (g) => { const k = actIcon(g.putAct || { id: 'down' }); return [`<span class="t-press">${MOUSE.right}</span>${icon(k)}`, btn(k, 'tap')]; },
  journal: () => [`${key('J', 'lit')}${icon('book')}`, btn('book', 'sq tap')],
  pause: () => [`${key('P', 'lit')}${icon('pause')}`, btn('pause', 'sq tap')],
};
// the phone button a lesson is about (src/ui/touch.js `data-b`)
const BUTTON = { walk: '.tc-stick', read: '[data-b=eye]', do: '[data-b=act]', put: '[data-b=put]', journal: '[data-b=journal]', pause: '[data-b=pause]' };
const GHOST = { look: 1, turn: 1 }; // a phone: the gesture itself is shown on the view, a finger sliding
const LABEL = { look: 'look', walk: 'walk', read: 'read', do: 'do', put: 'put', journal: 'journal', pause: 'pause' }; // rows of CONTROLS (i18n.js); the others say it with the picture alone

// In order of need; `when(g, s)`: the moment for it.
const LESSONS = [
  { id: 'look', when: (g, s) => !g.ui.open && s.time > 1.2 },
  { id: 'walk', when: (g, s, t) => !g.ui.open && t.done.look },
  { id: 'turn', when: (g) => g.cardOpen() && g.stage?.s && g.stage.s.mode !== 'photo' && g.stage.s.t >= 1 && !g.ui.pic && g.ui.mode === 'peek' },
  { id: 'aim', when: (g, s, t) => !g.ui.open && t.done.walk && !g.focus && s.near > 2.5 },
  { id: 'read', when: (g) => !g.ui.open && g.readReady && !!g.focus },
  { id: 'do', when: (g) => !g.ui.open && g.doReady },
  { id: 'put', when: (g, s) => !g.ui.open && g.putReady && s.carry > 2.5 && !g.doReady },
  { id: 'journal', when: (g, s, t) => !g.ui.open && (t.done.read || t.done.do) && g.state.found.size > 0 && !g.focus && s.free > 1.5 },
  { id: 'pause', when: (g, s, t) => !g.ui.open && t.done.journal && !g.focus && s.free > 4, brief: 9 },
];

export class Teach {
  constructor(game) {
    this.game = game;
    this.touch = !!game.touch;
    this.done = game.save.taught ||= {};
    const q = new URLSearchParams(location.search);
    this.off = this.done.all || (q.has('auto') && !q.has('teach')); // (tools walk with ?auto: no lessons unless asked for)
    this.el = document.createElement('div');
    this.el.id = 'teach';
    this.el.className = 'pane';
    this.el.innerHTML = '<div class="t-art"></div><div class="t-say"></div>';
    this.ghost = document.createElement('div');
    this.ghost.id = 'teach-ghost';
    this.ghost.innerHTML = `<i></i>${icon('finger')}`;
    document.body.append(this.el, this.ghost);
    this.art = this.el.firstChild; this.say = this.el.lastChild;
    this.cur = null; this.shown = 0; this.tick = 0;
    this.s = { time: 0, look: 0, walk: 0, near: 0, carry: 0, free: 0, last: null };
    this.snooze = {};
  }
  // the player did it: never taught again
  note(id) {
    if (this.done[id]) return;
    this.done[id] = 1;
    this.game.persist();
    if (this.cur?.id === id) this.show(null);
  }
  // draw a lesson (tools and the load-time paint: any of them, by id)
  show(L, lang = this.game.state.lang) {
    if (typeof L === 'string') L = LESSONS.find((x) => x.id === L);
    const key = L ? `${L.id}|${lang}|${L.id === 'do' ? actIcon(this.game.doAct) : ''}` : '';
    if (key === this.key) return;
    this.key = key;
    if (this.ring) { this.ring.classList.remove('tc-teach'); this.ring = null; }
    this.cur = L; this.shown = 0;
    this.el.className = `pane${L ? ` on t-${L.id}` : ''}${this.touch ? ' touch' : ''}`;
    this.ghost.className = L && this.touch && GHOST[L.id] ? `on g-${L.id}` : '';
    if (!L) return;
    this.art.innerHTML = ART[L.id](this.game)[this.touch ? 1 : 0];
    const c = LABEL[L.id] && control(LABEL[L.id]);
    this.say.textContent = c ? this.game.tt(c.label).split(/[,(/]/)[0].trim() : '';
    if (this.touch && BUTTON[L.id]) { this.ring = document.querySelector(`.tc-root ${BUTTON[L.id]}`); this.ring?.classList.add('tc-teach'); }
  }

  update(dt) {
    const g = this.game;
    if (this.off) return;
    if (g.title || g.paused) { this.show(null); return; }
    const s = this.s, inp = g.input, p = g.player.pos;
    s.time += dt;
    s.look += Math.abs(inp.mdx) + Math.abs(inp.mdy) + Math.abs(inp.lookX) + Math.abs(inp.lookY);
    if (s.last) { const d = Math.hypot(p.x - s.last.x, p.z - s.last.z); if (d < 1) s.walk += d; }
    (s.last ||= { x: 0, z: 0 }).x = p.x; s.last.z = p.z;
    if (!g.ui.open) {
      if (s.look > (this.touch ? 160 : 500)) this.note('look');
      if (s.walk > 3) this.note('walk');
      if (g.focus) this.note('aim');
    }
    s.carry = g.putReady ? s.carry + dt : 0;
    s.free = g.ui.open || g.acting ? 0 : s.free + dt;
    if (this.cur) this.shown += dt;
    if ((this.tick -= dt) > 0) return;
    this.tick = 0.25;
    // by something that can be looked at (≤ 4.5 m), for how long
    let near = false;
    if (!g.focus && !this.done.aim) {
      const cp = g.engine.camera.position;
      for (const it of g.world.interactables) { const sp = it.target?.userData.sphere; if (sp && !it.off && sp.center.distanceTo(cp) - sp.radius < 4.5) { near = true; break; } }
    }
    s.near = near ? s.near + 0.25 : 0;
    const cur = this.cur;
    if (cur?.brief && this.shown > cur.brief) { this.note(cur.id); return; } // (it cannot ask to be done: shown for a while, once)
    const open = LESSONS.filter((L) => !this.done[L.id] && !(this.snooze[L.id] > s.time) && L.when(g, s, this));
    let next = open[0] || null;
    if (cur && open.includes(cur)) {
      next = cur;
      // shown a good while and something else waits: its turn (this one comes back)
      if (this.shown > 8 && open.length > 1 && !cur.brief) { this.snooze[cur.id] = s.time + 20; next = open.find((L) => L !== cur); }
    } else if (cur && this.shown < 0.7) return; // not a flicker
    this.show(next);
  }
}
export { LESSONS };
