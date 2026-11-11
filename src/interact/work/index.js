// Hands-on work (үлэ): jobs done with a tool in the hands, step by step, with the body. Each job is a module
// here; its props come from src/models/work.js (built before the warm-up, so nothing compiles in play).
// A job offers acts for the things it knows (`actFor`, asked before the carrying code) and may drive the held
// tool's pose (Hands.pose). What it has to say it shows on the tool, the material and in sound: there is no gauge
// and no advice. `count` keeps totals in the save (`save.work`); `say` is for a saying, once.
import { Split } from './split.js';
import { Fish } from './fish.js';
import { Hay } from './hay.js';
import { Gather } from './gather.js';
import { Tuos } from './tuos.js';

const JOBS = { split: Split, fish: Fish, hay: Hay, gather: Gather, tuos: Tuos }; // by the `job` of a placed model's `userData.work`

export class Work {
  constructor(game, hands, find) {
    this.game = game;
    this.hands = hands;
    game.work = this;
    game.save.work ||= {};
    this.jobs = [];
    for (const p of game.world.placed) {
      const parts = p.object?.userData.work;
      if (parts && hands && JOBS[parts.job]) this.jobs.push(new JOBS[parts.job](this, parts, find));
    }
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
  say(text, small) { this.game.ui.toast(`${small ? `<small>${this.game.ui.t(small)}</small>` : ''}<b>${this.game.ui.t(text)}</b>`, 4600); }
}
