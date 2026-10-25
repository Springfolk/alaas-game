// Hands-on interactions besides reading (see docs/interactions.md): carrying the water pail and
// firewood (hands.js), sitting on benches (seat.js), picking wild strawberries. Created by main.js
// after the world is built; the props come from src/models/chores.js (built before the warm-up),
// hearths expose `it.fireplace`, benches are the 'oron' interactables.
import { Hands } from './hands.js';
import { Seat } from './seat.js';
import { Glint } from './glint.js';

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
    this.seat = new Seat(game);
    this.glint = new Glint(game); // the winter place's sun glint
    for (const it of w.interactables) if (it.entry === 'oron' && it.target && !it.act) it.sit = true;
    this.picked = new Map(); // patch → seconds since picked
    w.updaters.push((dt) => this.update(dt)); // after every model, and after the player moved
  }

  // The act E does on `it` now. undefined = the interactable's own act decides.
  actFor(it) {
    if (it.berries !== undefined) return this.picked.has(it.berries) ? null : this.pickAct;
    if (it.sit) return this.seat.on || this.hands?.held ? null : this.seat.act;
    return this.hands?.actFor(it);
  }
  // E with nothing in focus: stand up, or do something with what you carry.
  idleAct() {
    if (this.seat.on) return this.seat.standAct;
    return this.hands?.idleAct() || null;
  }
  // what the prompt names when nothing is in focus
  idleLabel() { return this.seat.on ? this.game.ui.t(this.seat.label) : this.hands?.name; }

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
      game.ui.toast?.(`<b>${game.ui.t({ sah: 'Минньигэс!', en: 'Sweet, and warm from the sun.', ru: 'Сладкая, тёплая от солнца.' })}</b>`, 2600);
    },
  };

  update(dt) {
    this.seat.update(dt);
    this.glint.update(dt);
    this.hands?.update(dt);
    for (const [k, t] of this.picked) {
      if (t + dt > REGROW) { this.picked.delete(k); this.parts.setPatch(k, this.parts.perPatch); } else this.picked.set(k, t + dt);
    }
  }
}
