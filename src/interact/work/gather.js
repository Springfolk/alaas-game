// Gathering in the forest: dry branches from under the first trees, carried home by the armful for the woodpile
// or a fire (the carrying code does the rest). A branch taken away lies there again after a while: the forest
// keeps dropping them. Props: src/models/drywood.js.
import * as THREE from 'three/webgpu';
import { hullOf, restY } from '../rest.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  name: L('хаппыт мас', 'dry wood', 'сушняк'),
};
const _w = new THREE.Vector3();
const BACK = 300; // s until a carried-off branch lies in its place again

export class Gather {
  constructor(work, parts, find) {
    this.work = work;
    const hands = work.hands;
    this.things = parts.sticks.map((s) => {
      const home = { p: null, q: null };
      const t = hands.addThing({
        kind: 'log', obj: s.obj, it: find(s.obj), name: TXT.name, state: 'ground', t: 0, away: -1,
        onTake: () => { t.away = 0; work.count('drywood'); },
        release: () => { t.used = true; },
      });
      // on the ground as this tier draws it: along the line from butt to tip, its lowest point on it (the model laid
      // it on the terrain at its two ends)
      const o = s.obj, W = work.game.world, dir = new THREE.Vector3(0, 1, 0).applyQuaternion(o.quaternion), yaw = Math.atan2(dir.x, dir.z);
      const len = o.userData.len ?? 0.8, x = o.position.x, z = o.position.z;
      let tilt = Math.atan2(W.drawnAt(x + Math.sin(yaw) * len, z + Math.cos(yaw) * len) - W.drawnAt(x, z), len);
      for (let k = 0; k < 6; k++) { // then tipped about its butt until both halves touch (a crooked branch rocks onto its two ends)
        o.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 - tilt, yaw, 0, 'YXZ'));
        o.position.y = restY(W, o, o.quaternion, x, z);
        const gap = [Infinity, Infinity];
        for (const v of hullOf(o)) { const w = _w.copy(v).applyQuaternion(o.quaternion); const c = o.position.y + w.y - W.drawnAt(x + w.x, z + w.z); const h = v.y < len / 2 ? 0 : 1; gap[h] = Math.min(gap[h], c); }
        if (Math.abs(gap[1] - gap[0]) < 0.003) break;
        tilt -= (gap[1] - gap[0]) / (len * 0.75);
      }
      o.updateMatrixWorld();
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
