// Hands-on interactions besides reading (see docs/interactions.md): carrying the water pail and
// firewood (hands.js), sitting on benches (seat.js), picking wild strawberries, work with tools (work/). Created by main.js
// after the world is built; the props come from src/models/chores.js (built before the warm-up),
// hearths expose `it.fireplace`, benches are the 'oron' interactables.
import { Hands } from './hands.js';
import { Seat } from './seat.js';
import { Glint } from './glint.js';
import { Work } from './work/index.js';
import { Choron, Cup, Khomus } from './rites.js';

const REGROW = 240; // s after the last berry was picked until a дьэдьэн patch is full again

export class Interactions {
  constructor(game) {
    this.game = game;
    const w = game.world;
    const find = (target) => w.interactables.find((i) => i.target === target);
    const placed = w.placed.find((p) => p.object?.userData.chores);
    const parts = placed?.object.userData.chores;
    this.hands = parts ? new Hands(game, parts, find) : null;
    this.parts = parts;
    this.work = new Work(game, this.hands, find); // jobs with a tool in the hands (src/interact/work)
    // the guest's choron, the lake's cup of milk, the khomus: taken from their place and put back (rites.js)
    const part = (k) => w.placed.find((p) => p.object?.userData[k])?.object.userData[k];
    this.rites = !this.hands ? [] : [[Choron, 'guest'], [Cup, 'offering'], [Khomus, 'khomus']].filter(([, k]) => part(k)).map(([C, k]) => new C(game, this.hands, part(k)));
    this.seat = new Seat(game);
    this.glint = new Glint(game); // the winter place's sun glint
    for (const it of w.interactables) if (it.entry === 'oron' && it.target && !it.act) it.sit = true;
    this.patches = new Map(); // patch → { n: berries left, t: seconds since the last one was picked }
    this.ticks = [];
    w.updaters.push((dt) => this.update(dt)); // after every model, and after the player moved
  }

  // The act the hands do on `it` now. undefined = the interactable's own act decides.
  actFor(it) {
    if (it.berries !== undefined) return (this.patches.get(it.berries)?.n ?? 1) > 0 ? this.pickAct : null;
    if (it.sit) return this.seat.on || this.hands?.held ? null : this.seat.act;
    for (const r of this.rites) { const a = r.actFor(it); if (a !== undefined) return a; }
    if (it.live) return it.live(); // a model's thing whose act follows its own state (the forge's knife blank)
    const w = this.work.actFor(it);
    if (w !== undefined) return w;
    return this.hands?.actFor(it);
  }
  // the hands with nothing in focus: stand up, or what the carried thing does by itself
  idleAct() {
    if (this.seat.on) return this.seat.standAct;
    for (const r of this.rites) { const a = r.idleAct(); if (a) return a; }
    return this.work.idleAct() || this.hands?.idleAct() || null;
  }
  // putting down what is carried (src/interact/hands.js)
  putAct() { return this.seat.on ? null : this.hands?.putAct() || null; }

  // A tap takes a small handful of berries off the crown, one by one. They go into the тордуйа if one is carried (src/interact/work/tuos.js), else they are eaten.
  pickAct = {
    id: 'pick', label: { sah: 'дьэдьэн хомуй', en: 'pick berries', ru: 'собрать ягоды' },
    run: async (game, it) => {
      const k = it.berries, P = this.patches.get(k) || { n: this.parts.perPatch, t: 0 };
      this.patches.set(k, P);
      let got = 0, w = 1;
      await new Promise((res) => this.ticks.push((dt) => {
        w += dt;
        if (w >= 0.12 && P.n > 0) {
          w = 0; P.n--; P.t = 0; got++;
          this.parts.setPatch(k, P.n);
          if (got % 3 === 1) game.audio?.step?.('grass', 0.8); // a rustle in the leaves
          this.work.jobs.some((j) => j.picked?.(1));
        }
        if (P.n > 0 && got < 3) return false;
        res(); return true;
      }));
      for (const j of this.work.jobs) j.gathered?.(got);
    },
  };

  update(dt) {
    this.seat.update(dt);
    this.glint.update(dt);
    this.work.update(dt);
    for (const r of this.rites) r.update(dt);
    this.hands?.update(dt);
    for (let i = this.ticks.length - 1; i >= 0; i--) if (this.ticks[i](dt)) this.ticks.splice(i, 1);
    for (const [k, P] of this.patches) {
      if ((P.t += dt) > REGROW) { this.patches.delete(k); this.parts.setPatch(k, this.parts.perPatch); }
    }
  }
}
