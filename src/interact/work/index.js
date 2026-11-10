// Hands-on work (үлэ): jobs done with a tool in the hands, step by step, with the body. Each job is a module
// here; its props come from src/models/work.js (built before the warm-up, so nothing compiles in play).
// A job offers acts for the things it knows (`actFor`, asked before the carrying code), may drive the held
// tool's pose (Hands.pose), and reports to the player through `meter` (the swing gauge by the crosshair),
// `hint` (a toast, once) and `count` (totals kept in the save: `save.work`).
import { Split } from './split.js';

export class Work {
  constructor(game, hands, find) {
    this.game = game;
    this.hands = hands;
    game.work = this;
    game.save.work ||= {};
    this.said = new Set();
    this.jobs = [];
    const parts = game.world.placed.find((p) => p.object?.userData.work)?.object.userData.work;
    if (parts && hands) this.jobs.push(new Split(this, parts, find));
    const m = this.gauge = document.createElement('div');
    m.id = 'gauge';
    m.innerHTML = '<i></i><b></b>';
    document.body.appendChild(m);
  }
  // undefined = not this code's thing
  actFor(it) {
    for (const j of this.jobs) { const a = j.actFor(it); if (a !== undefined) return a; }
    return undefined;
  }
  idleAct() {
    for (const j of this.jobs) { const a = j.idleAct?.(); if (a) return a; }
    return null;
  }
  update(dt) { for (const j of this.jobs) j.update(dt); }

  count(key, n = 1) {
    const w = this.game.save.work;
    w[key] = (w[key] || 0) + n;
    this.game.persist();
    return w[key];
  }
  // a line of advice, at most once per visit (and `times` in all: counted in the save)
  hint(key, text, times = 3) {
    const w = this.game.save.work, k = 'hint:' + key;
    if (this.said.has(key) || (w[k] || 0) >= times) return;
    this.said.add(key);
    w[k] = (w[k] || 0) + 1;
    this.game.ui.toast(`<b>${this.game.ui.t(text)}</b>`, 5200);
  }
  say(text, small) { this.game.ui.toast(`${small ? `<small>${this.game.ui.t(small)}</small>` : ''}<b>${this.game.ui.t(text)}</b>`, 4600); }
  // the gauge by the crosshair: v 0…1, with the good band lo…hi; null hides it
  meter(v, lo = 0, hi = 1) {
    const m = this.gauge;
    if (v == null) { if (this.gaugeOn) { m.classList.remove('on'); this.gaugeOn = false; } return; }
    if (!this.gaugeOn) { m.classList.add('on'); this.gaugeOn = true; m.style.setProperty('--lo', lo); m.style.setProperty('--hi', hi); }
    m.firstChild.style.transform = `scaleY(${v})`;
    const good = v >= lo && v <= hi;
    if (good !== this.gaugeGood) { m.classList.toggle('good', good); this.gaugeGood = good; }
  }
}
