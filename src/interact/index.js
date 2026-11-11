// Hands-on interactions besides reading (see docs/interactions.md): carrying the water pail and
// firewood (hands.js), sitting on benches (seat.js), picking wild strawberries, work with tools (work/). Created by main.js
// after the world is built; the props come from src/models/chores.js (built before the warm-up),
// hearths expose `it.fireplace`, benches are the 'oron' interactables.
import { Hands } from './hands.js';
import { Seat } from './seat.js';
import { Glint } from './glint.js';
import { Work } from './work/index.js';

const REGROW = 240; // s until a picked дьэдьэн patch has berries again

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
    this.seat = new Seat(game);
    this.glint = new Glint(game); // the winter place's sun glint
    for (const it of w.interactables) if (it.entry === 'oron' && it.target && !it.act) it.sit = true;
    this.picked = new Map(); // patch → seconds since picked
    w.updaters.push((dt) => this.update(dt)); // after every model, and after the player moved
  }

  // The act the hands do on `it` now. undefined = the interactable's own act decides.
  actFor(it) {
    if (it.berries !== undefined) return this.picked.has(it.berries) ? null : this.pickAct;
    if (it.sit) return this.seat.on || this.hands?.held ? null : this.seat.act;
    if (it.live) return it.live(); // a model's thing whose act follows its own state (the forge's knife blank)
    const w = this.work.actFor(it);
    if (w !== undefined) return w;
    return this.hands?.actFor(it);
  }
  // the hands with nothing in focus: stand up, or what the carried thing does by itself
  idleAct() {
    if (this.seat.on) return this.seat.standAct;
    return this.work.idleAct() || this.hands?.idleAct() || null;
  }
  // putting down what is carried (src/interact/hands.js)
  putAct() { return this.seat.on ? null : this.hands?.putAct() || null; }

  pickAct = {
    id: 'pick', label: { sah: 'дьэдьэн хомуй', en: 'pick a handful', ru: 'собрать горсть' }, thenCard: false,
    run: async (game, it) => {
      const k = it.berries, n = this.parts.perPatch;
      if (this.picked.has(k)) return;
      this.picked.set(k, 0);
      // berry by berry, a rustle in the leaves
      for (let i = n; i >= 0; i--) {
        this.parts.setPatch(k, i);
        if (i % 4 === 0) game.audio?.step?.('grass', 0.8);
        await new Promise((r) => setTimeout(r, 70));
      }
      // into the тордуйа if one is carried (src/interact/work/tuos.js), else eaten on the spot
      if (this.work.jobs.some((j) => j.picked?.(n))) return;
      game.ui.toast?.(`<b>${game.ui.t({ sah: 'Минньигэс!', en: 'Sweet, and warm from the sun.', ru: 'Сладкая, тёплая от солнца.' })}</b>`, 2600);
    },
  };

  update(dt) {
    this.seat.update(dt);
    this.glint.update(dt);
    this.work.update(dt);
    this.hands?.update(dt);
    for (const [k, t] of this.picked) {
      if (t + dt > REGROW) { this.picked.delete(k); this.parts.setPatch(k, this.parts.perPatch); } else this.picked.set(k, t + dt);
    }
  }
}
