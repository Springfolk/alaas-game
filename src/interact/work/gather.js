// Gathering in the forest: dry branches from under the first trees, carried home by the armful for the woodpile
// or a fire (the carrying code does the rest). A branch taken away lies there again after a while: the forest
// keeps dropping them. Props: src/models/drywood.js.
const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  name: L('хаппыт мас', 'dry wood', 'сушняк'),
  quiet: L('Тыаҕа наадалааҕыҥ эрэ ыл, айдаарыма.', 'In the forest take only what you need, and make no noise.', 'В лесу бери только нужное и не шуми.'),
};
const BACK = 300; // s until a carried-off branch lies in its place again

export class Gather {
  constructor(work, parts, find) {
    this.work = work;
    const hands = work.hands;
    this.things = parts.sticks.map((s) => {
      const home = { p: null, q: null };
      const t = hands.addThing({
        kind: 'log', obj: s.obj, it: find(s.obj), name: TXT.name, state: 'ground', t: 0, away: -1,
        onTake: () => { t.away = 0; work.count('drywood'); work.hint('forest-quiet', TXT.quiet, 2); },
        release: () => { t.used = true; },
      });
      home.p = s.obj.position.clone(); home.q = s.obj.quaternion.clone(); // (world, after addThing)
      t.home = home;
      return t;
    });
  }
  actFor() { return undefined; } // taking, carrying, stacking: src/interact/hands.js
  update(dt) {
    for (const t of this.things) {
      if (t.away < 0) continue;
      t.away += dt;
      if (t.away > BACK && t.used && t.state === 'pool') { // burnt or stacked long ago: a fresh one lies here
        t.obj.position.copy(t.home.p); t.obj.quaternion.copy(t.home.q); t.obj.scale.setScalar(1);
        t.obj.visible = true; t.obj.userData.sphere = undefined;
        t.state = 'ground'; t.it.off = false; t.used = false; t.away = -1;
      }
    }
  }
}
