// Мас хайытыы: splitting firewood at the chopping block (дүлүҥ олох мас). Take the axe out of the block, stand a round of larch
// on it, raise the axe (the do input held: it climbs over the shoulder, and the arms tire if it is kept there) and
// let go: it falls where you look. In line with the round's drying crack and from high enough it opens the round
// in two: a clean blow drops the halves by the block, a ragged one sends them tumbling. Each half is stood up again
// and split into two billets, which are carried (an armful) to the woodpile or to a fire.
// A low blow in the right line leaves the axe bitten in: the round is lifted on it (held) and brought down again.
// A blow across the grain only sticks, and the axe is wrenched free. Put down while it is raised lowers it.
// Nothing is told in words: the axe's height, the crack and the sound of the blow say it.
// Props: src/models/work.js (two rounds of four mating quarters).
import * as THREE from 'three/webgpu';
import { ease, fwdX, fwdZ } from '../../util.js';
import { footprint, hullOf, overlaps, restSpot } from '../rest.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  axe: L('сүгэ', 'axe', 'топор'),
  round: L('дүлүҥ', 'round of larch', 'лиственничный кругляк'),
  half: L('дүлүҥ аҥаара', 'half a round', 'половина кругляка'),
  billet: L('хардаҕас', 'billet', 'полено'),
  take: L('ыл', 'take it', 'взять'),
  stand: L('олох маска туруор', 'stand it on the block', 'поставить на колоду'),
  strike: L('хайыт', 'split it', 'расколоть'),
  again: L('дүлүҥү кытта өрө көтөҕөн оҕус', 'lift it on the axe and bring it down', 'поднять на топоре и ударить о колоду'),
  free: L('сүгэни сулбу тарт', 'pull the axe free', 'выдернуть топор'),
  stick: L('сүгэни олох маска батары оҕус', 'leave the axe in the block', 'всадить топор в колоду'),
  tidy: L('хайыппыккын хомуй', 'gather what you have split first', 'сначала соберите наколотое'),
  proverb: L('Сүгэ түһүөр диэри дүлүҥ сынньанар.', '“Until the axe falls, the log rests.”', '«Пока топор опускается, бревно отдыхает».'),
  proverbBy: L('өс хоһооно', 'a Sakha saying', 'якутская пословица'),
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
// a quaternion whose +Y is `y` and whose +X leans towards `xHint`
function basisQ(y, xHint, out = new THREE.Quaternion()) {
  const Y = _v.copy(y).normalize().clone(), Z = new THREE.Vector3().crossVectors(xHint, Y).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, Z));
}
// camera-space poses of the axe (its origin is the haft's butt): carried, and raised over the right shoulder
const REST = { p: new THREE.Vector3(0.3, -0.56, -0.24), q: basisQ(new THREE.Vector3(-0.15, 0.42, -0.9), new THREE.Vector3(0.1, -0.9, -0.4)) };
const RAISED = { p: new THREE.Vector3(0.3, -0.03, -0.44), q: basisQ(new THREE.Vector3(0.08, 0.86, 0.5), new THREE.Vector3(0, 0.5, -0.86)) }; // the hands at the face: how high the haft's end stands in view is how high the axe is
const HANDS = new THREE.Vector3(0.1, -0.6, -0.32); // where the hands end the blow
const NEED = { 4: 0.5, 2: 0.33 }; // the least swing that opens a whole round / a half
const LINE = 0.06, TURN = 0.6; // how far off the crack (m) and how far turned from it (rad) a blow still opens it
const RISE = 0.75, TIRE = 2.6; // s to raise the axe fully; s after which the arms begin to tire

export class Split {
  constructor(work, parts, find) {
    this.work = work;
    const game = this.game = work.game, hands = this.hands = work.hands;
    this.parts = parts;
    this.tip = new THREE.Vector3(parts.axeDims.edge, parts.axeDims.head, 0);
    hands.addKind('axe', { p: REST.p.toArray(), q: REST.q }, {
      r: 0.2, lift: 0.025, sound: 'wood-lay',
      q: (yaw) => basisQ(_w.set(fwdX(yaw + 1.2), 0, fwdZ(yaw + 1.2)), _v.set(fwdX(yaw - 0.37), 0, fwdZ(yaw - 0.37)).clone()),
    });
    this.axe = hands.addThing({ kind: 'axe', obj: parts.axe, it: find(parts.axe), name: TXT.axe });
    this.axe.it.thing = this.axe;
    // put down by the free block: back into it
    this.axe.put = () => (!this.onBlock && !this.sw && game.player.pos.distanceTo(this.block) < 2.6 ? this.stickAct : undefined);
    this.axeHome = { p: parts.axe.position.clone(), q: parts.axe.quaternion.clone() }; // in the block (world, after addThing)
    this.block = parts.object.localToWorld(parts.block.clone()); // the top's middle, world
    this.blockIt = game.world.interactables.find((i) => i.block);
    this.heapIt = game.world.interactables.find((i) => i.rounds);
    this.pieces = parts.pieces.map((p, i) => {
      const it = find(p.obj);
      const t = hands.addThing({ kind: 'log', obj: p.obj, it, name: TXT.billet, state: 'pool', release: () => { t.chunk = null; } });
      t.i = i; t.round = p.round; t.k = p.k; t.R = p.R; t.len = p.len;
      t.lieQ = (yaw) => this.lieQ(t, _v.set(fwdX(yaw + Math.PI / 2 + (Math.random() - 0.5) * 0.6), 0, fwdZ(yaw + Math.PI / 2 + (Math.random() - 0.5) * 0.6))); // set down: a split face on the ground
      return t;
    });
    hands.feetFrom = [...(hands.feetFrom || []), () => this.chunks.filter((c) => c.state === 'rest').map((c) => (c.foot ||= this.foot((this.shape(c), c.body), c.quat, c.pos)))]; // the halves lying about
    this.chunks = []; // a whole round or a half: { pieces, n, pos, quat, state: 'to-block' | 'block' | 'fly' | 'settle' | 'rest', … }
    this.onBlock = null;
    this.sw = null; // the swing: { phase: 'raise' | 'swing' | 'stuck' | 'back', … }
    hands.pose = (dt, cam) => this.axePose(dt, cam);
  }

  get axeHeld() { return this.hands.held === this.axe; }
  chunkOf(it) { return it.quarter !== undefined ? this.pieces[it.quarter].chunk : null; }

  // ── what E does ──
  actFor(it) {
    const h = this.hands.held;
    if (it.tool === 'axe') return h || this.sw ? null : this.hands.takeAct;
    if (it.rounds) {
      if (h && h !== this.axe) return null;
      if (this.onBlock || this.sw) return null;
      return this.freeRound() === undefined ? this.tidyAct : this.placeAct;
    }
    if (it.block) return this.axeHeld && !this.onBlock && !this.sw ? this.stickAct : undefined;
    const c = this.chunkOf(it);
    if (!c) return undefined; // a loose billet: the carrying code's
    if (this.sw?.phase === 'stuck') return this.sw.aligned ? this.againAct : this.freeAct;
    if (this.sw) return null;
    if (c.state === 'block') return this.axeHeld ? this.strikeAct : null;
    if (c.state === 'rest') return !this.onBlock && (!h || h === this.axe) ? this.standAct : null;
    return null;
  }
  idleAct() {
    if (this.sw?.phase === 'stuck') return this.sw.aligned ? this.againAct : this.freeAct;
    return this.sw ? this.noAct : null;
  }

  freeRound() {
    for (let r = 0; r < this.parts.rounds; r++) if (this.pieces.every((p) => p.round !== r || p.state === 'pool')) return r;
    return undefined;
  }

  noAct = { id: 'none', label: L('', '', ''), run: async () => {} };
  tidyAct = { id: 'tidy', label: TXT.tidy, run: async () => {} };

  // a round from the heap onto the block
  placeAct = {
    id: 'place-round', label: TXT.stand,
    run: async (game, it) => {
      const r = this.freeRound();
      if (r === undefined || this.onBlock) return;
      this.clearBlock(game);
      const ps = this.pieces.filter((p) => p.round === r);
      const from = it.target.getWorldPosition(new THREE.Vector3());
      from.y = game.world.drawnAt(from.x, from.z) + 0.16;
      const c = { pieces: ps, n: 4, pos: from, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6.28, Math.PI / 2)), com: new THREE.Vector3(0, ps[0].len / 2, 0) };
      for (const p of ps) { p.chunk = c; p.state = 'chunk'; p.obj.visible = true; p.obj.scale.setScalar(1); p.it.off = false; p.it.label = TXT.round; }
      this.chunks.push(c);
      this.toBlock(c);
      game.audio?.play('wood-take', from);
    },
  };
  // a half from the ground onto the block
  standAct = {
    id: 'stand-half', label: TXT.stand,
    run: async (game, it) => {
      const c = this.chunkOf(it);
      if (!c || this.onBlock || c.state !== 'rest') return;
      this.clearBlock(game);
      this.toBlock(c);
      game.audio?.play('wood-take', c.pos);
    },
  };
  // the axe bitten into the block comes out into the free hands before wood is stood there
  clearBlock(game) {
    if (!this.hands.held && this.axe.obj.position.distanceTo(this.axeHome.p) < 0.02) this.hands.takeAct.run(game, this.axe.it);
  }
  toBlock(c) {
    this.onBlock = c; c.foot = null;
    c.state = 'to-block';
    c.k = 0;
    c.from = { p: c.pos.clone(), q: c.quat.clone() };
    const yaw = Math.random() * 6.28;
    c.toQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    // its middle over the block's middle
    const off = _v.set(c.com.x, 0, c.com.z).applyQuaternion(c.toQ);
    c.toP = this.block.clone().sub(off);
    this.game.promptKey = null;
  }

  // the axe back into the block
  stickAct = {
    id: 'stick-axe', label: TXT.stick,
    run: async (game) => {
      if (!this.axeHeld) return;
      const t = this.hands.letGo();
      await this.hands.fly(t, this.axeHome.p, this.axeHome.q, 0.38);
      game.audio?.play('chop', this.axeHome.p) || game.audio?.play('wood-lay', this.axeHome.p);
      t.it.off = false;
      t.obj.userData.sphere = undefined;
      this.blockIt.off = true;
    },
  };

  // the blow: the axe rises while the do input is held and falls when it is let go (put down lowers it instead)
  strikeAct = { id: 'strike', label: TXT.strike, run: (game, it) => this.strike(it) };
  async strike(it) {
    const c = this.chunkOf(it), g = this.game;
    if (!c || c.state !== 'block' || !this.axeHeld || this.sw) return;
    const sw = this.sw = { phase: 'raise', t: 0, power: 0, chunk: c };
    await new Promise((res) => { sw.released = res; });
    if (sw.cancel) {
      sw.phase = 'back'; sw.k = 0; sw.wait = 0;
      sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
      return;
    }
    // aim: where the look meets the round's top
    const cam = g.engine.camera, top = c.pos.y + c.pieces[0].len;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    let hit;
    if (dir.y < -0.05) hit = cam.position.clone().addScaledVector(dir, (top - cam.position.y) / dir.y);
    else hit = cam.position.clone().addScaledVector(_v.set(dir.x, 0, dir.z).normalize(), 0.9).setY(top);
    const reach = Math.hypot(hit.x - cam.position.x, hit.z - cam.position.z);
    if (reach > 1.25) hit.set(cam.position.x + (hit.x - cam.position.x) / reach * 1.25, top, cam.position.z + (hit.z - cam.position.z) / reach * 1.25);
    const res = this.judge(c, hit, dir, sw.power);
    // the fall of the axe
    const butt = HANDS.clone().applyQuaternion(cam.quaternion).add(cam.position);
    const at = hit.clone(); at.y -= res.kind === 'miss' ? Math.min(0.5, at.y - this.block.y) : res.kind === 'split' ? 0.1 : 0.035;
    const q = basisQ(at.clone().sub(butt), _w.set(dir.x * 0.3, -1, dir.z * 0.3).clone());
    sw.to = { p: at.clone().sub(this.tip.clone().applyQuaternion(q)), q };
    sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
    sw.phase = 'swing'; sw.k = 0;
    await new Promise((r) => { sw.landed = r; });
    g.player.springV -= 0.9 + sw.power * 1.2; // the blow goes through the body
    this.land(c, res, hit, sw);
  }

  // Where the blow fell, in the chunk's own frame, and what it does.
  judge(c, hit, dir, power) {
    const inv = _q.copy(c.quat).invert();
    const l = hit.clone().sub(c.pos).applyQuaternion(inv), f = _v.set(dir.x, 0, dir.z).normalize().applyQuaternion(inv);
    const R = c.pieces[0].R;
    let on = Math.hypot(l.x, l.z) < R + 0.01, off, turn;
    if (c.n === 4) { off = Math.abs(l.z); turn = Math.atan2(Math.abs(f.z), Math.abs(f.x)); } else {
      // a half opens along the seam between its two quarters: the line from the pith out through its middle
      const a = c.pieces[1].k * Math.PI / 2, bx = Math.cos(a), bz = Math.sin(a);
      on = on && l.x * bx + l.z * bz > -0.015;
      off = Math.abs(-l.x * bz + l.z * bx); turn = Math.atan2(Math.abs(-f.x * bz + f.z * bx), Math.abs(f.x * bx + f.z * bz));
    }
    if (!on) return { kind: 'miss' };
    const aligned = off < LINE && turn < TURN;
    if (power < 0.2) return { kind: 'glance', aligned };
    // how clean: 1 = dead on the crack and square to it from full height
    if (aligned && power >= NEED[c.n]) return { kind: 'split', clean: (1 - 0.5 * off / LINE - 0.5 * turn / TURN) * (0.6 + 0.4 * power) };
    return { kind: 'stuck', aligned, weak: aligned };
  }

  land(c, res, hit, sw) {
    const g = this.game, a = g.audio;
    if (res.kind === 'split') {
      a?.play('chop', hit) || a?.play('wood-lay', hit);
      this.open(c, sw.power, res.clean);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0.16;
      sw.from = { p: sw.to.p.clone(), q: sw.to.q.clone() };
      return;
    }
    if (res.kind === 'stuck') {
      a?.play('chop-stuck', hit) || a?.play('wood-lay', hit);
      sw.phase = 'stuck'; sw.aligned = res.aligned;
      sw.rel = { p: sw.to.p.clone().sub(c.pos), q: sw.to.q.clone() }; // the axe rides the round
      g.promptKey = null;
      return;
    }
    a?.play(res.kind === 'miss' ? 'chop-stuck' : 'wood-take', hit) || a?.play('wood-lay', hit);
    sw.phase = 'back'; sw.k = 0; sw.wait = 0.1;
    sw.from = { p: sw.to.p.clone(), q: sw.to.q.clone() };
  }

  // stuck in the right line: the round goes up on the axe for as long as the do input is held (a tap is a short
  // lift) and comes down on the block; from high enough it opens
  againAct = {
    id: 'strike-again', label: TXT.again,
    run: async (game) => {
      const sw = this.sw;
      if (sw?.phase !== 'stuck' || sw.busy) return;
      sw.busy = true;
      const c = sw.chunk, y0 = c.pos.y, inp = game.input;
      let h = 0, t = 0;
      await this.until((dt) => { t += dt; h = Math.min(1, h + dt / 0.45); c.pos.y = y0 + Math.sin(h * Math.PI / 2) * 0.4; return (!inp.doing && t > 0.2) || t > 2.5; });
      const top = c.pos.y - y0;
      await this.tween(0.05 + 0.09 * top / 0.4, (k) => { c.pos.y = y0 + (1 - k * k) * top; });
      game.player.springV -= 0.6 + 2.5 * top;
      if (top < 0.2) { game.audio?.play('chop-stuck', c.pos); sw.busy = false; return; } // too low: still bitten in
      game.audio?.play('chop', c.pos) || game.audio?.play('wood-lay', c.pos);
      this.open(c, 0.5 + top, 0.7);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0.12;
      sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
    },
  };
  freeAct = {
    id: 'free-axe', label: TXT.free,
    run: async (game) => {
      const sw = this.sw;
      if (sw?.phase !== 'stuck' || sw.busy) return;
      game.audio?.play('wood-take', sw.chunk.pos);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0;
      sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
    },
  };
  tween(dur, step) { return new Promise((res) => { (this.tweens ||= []).push({ dur, k: 0, step, res }); }); }
  until(step) { return new Promise((res) => { (this.tweens ||= []).push({ until: step, res }); }); }

  // The chunk opens along its seam: a round into two halves, a half into two billets. They fall away from the edge:
  // after a clean blow (`clean` → 1) they drop beside the block, after a ragged one they tumble off.
  open(c, power, clean = 0.5) {
    const wild = 1 - Math.max(0, Math.min(1, clean));
    const g = this.game;
    this.chunks.splice(this.chunks.indexOf(c), 1);
    if (this.onBlock === c) this.onBlock = null;
    const groups = c.n === 4 ? [[c.pieces[0], c.pieces[1]], [c.pieces[2], c.pieces[3]]] : [[c.pieces[0]], [c.pieces[1]]];
    for (const ps of groups) {
      const R = ps[0].R, len = ps[0].len;
      // the middle of the part, out from the pith
      const a = ps.length === 2 ? (ps[0].k + 1) * Math.PI / 2 : (ps[0].k + 0.5) * Math.PI / 2;
      const d = ps.length === 2 ? 0.42 * R : 0.6 * R;
      const com = new THREE.Vector3(Math.cos(a) * d, len / 2, Math.sin(a) * d);
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(c.quat);
      const n = { pieces: ps, n: ps.length, pos: c.pos.clone(), quat: c.quat.clone(), com, state: 'fly', up: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)) };
      n.vel = out.clone().multiplyScalar(0.75 + wild * (0.9 + power * 1.3) + Math.random() * 0.3).setY(0.45 + wild * 0.7 + Math.random() * 0.3);
      n.ang = new THREE.Vector3().crossVectors(UP, out).multiplyScalar(1.6 + wild * (2 + power * 2.5) + Math.random()).addScaledVector(UP, (Math.random() - 0.5) * 5 * wild);
      n.c = n.pos.clone().add(com.clone().applyQuaternion(n.quat)); // its centre of mass
      n.bounces = 0;
      for (const p of ps) { p.chunk = n; p.it.off = true; p.it.label = n.n === 2 ? TXT.half : TXT.billet; }
      this.chunks.push(n);
    }
    if (c.n === 2) {
      const n = this.work.count('billets', 2);
      if (n === 4) this.work.say(TXT.proverb, TXT.proverbBy);
    } else this.work.count('rounds');
    g.promptKey = null;
  }

  // ── every frame ──
  update(dt) {
    const g = this.game, world = g.world;
    for (const t of [...(this.tweens || [])]) {
      if (t.until) { if (t.until(dt)) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res(); } continue; }
      t.k = Math.min(1, t.k + dt / t.dur); t.step(t.k);
      if (t.k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res(); }
    }
    const held = this.axeHeld;
    if (this.blockIt.off !== !held) { this.blockIt.off = !held; g.promptKey = null; }
    // the swing's own clock
    const sw = this.sw;
    if (sw) {
      if (!held) this.sw = null; else if (sw.phase === 'raise') {
        sw.t += dt;
        const inp = g.input;
        // up over the shoulder in RISE s; kept there past TIRE s the arms tire and it sinks a little
        sw.power = ease(Math.min(1, sw.t / RISE)) * (1 - Math.min(0.35, Math.max(0, sw.t - TIRE) * 0.1));
        if (inp.hit('Put')) { sw.cancel = true; sw.released(); } else if (!inp.doing || sw.t > 12 || sw.chunk.state !== 'block') sw.released();
      } else if (sw.phase === 'swing') {
        sw.k = Math.min(1, sw.k + dt / 0.14);
        if (sw.k >= 1 && sw.landed) { const f = sw.landed; sw.landed = null; f(); }
      } else if (sw.phase === 'back') {
        if (sw.wait > 0) sw.wait -= dt; else sw.k = Math.min(1, sw.k + dt / 0.4);
        if (sw.k >= 1) { this.sw = null; g.promptKey = null; }
      }
    }
    for (const c of [...this.chunks]) {
      if (c.state === 'to-block') {
        c.k = Math.min(1, c.k + dt / 0.55);
        const e = ease(c.k);
        c.pos.lerpVectors(c.from.p, c.toP, e); c.pos.y += Math.sin(c.k * Math.PI) * 0.25;
        c.quat.slerpQuaternions(c.from.q, c.toQ, e);
        if (c.k < 1) this.clear(c, world);
        if (c.k >= 1) { c.state = 'block'; g.audio?.play('wood-lay', c.pos); this.touch(c); }
      } else if (c.state === 'fly') this.fly(c, dt, world);
      else if (c.state === 'settle') this.settle(c, dt, world);
      else continue;
      for (const p of c.pieces) { p.obj.position.copy(c.pos); p.obj.quaternion.copy(c.quat); }
    }
    // a round riding a stuck axe
    if (sw?.phase === 'stuck') for (const p of sw.chunk.pieces) { p.obj.position.copy(sw.chunk.pos); p.obj.quaternion.copy(sw.chunk.quat); }
  }

  // a part's shape: its pieces' points in its own frame (the pieces of a chunk share it), thinned for the flight
  shape(c) {
    if (!c.pts) { c.pts = c.pieces.flatMap((p) => hullOf(p.obj)); c.body = { userData: { hull: c.pts } }; }
    return c.pts;
  }
  // what else lies about: the other parts at rest and the billets on the ground (footprints, with their height span)
  lying(c) {
    const out = [];
    for (const o of this.chunks) if (o !== c && (o.state === 'rest' || o.state === 'settle')) out.push(o.foot ||= this.foot(o.body || (this.shape(o), o.body), o.state === 'settle' ? o.toQ : o.quat, o.state === 'settle' ? o.toP : o.pos));
    for (const f of this.hands.lyingFeet()) if (!out.includes(f)) out.push(f); // the billets on the ground, and what was set down
    return out;
  }
  // a footprint with the height it spans
  foot(obj, q, p) {
    const f = footprint(obj, q, p.x, p.z); let y0 = Infinity, y1 = -Infinity;
    for (const v of hullOf(obj)) { const y = _w.copy(v).applyQuaternion(q).y + p.y; y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    f.y0 = y0; f.y1 = y1; return f;
  }
  // not on the heap of rounds nor the block
  avoid(f) {
    const hb = (this.heapBox ||= new THREE.Box3().setFromObject(this.heapIt.target).expandByScalar(0.12));
    const r = Math.hypot(f.a, f.b);
    if (f.x + r > hb.min.x && f.x - r < hb.max.x && f.z + r > hb.min.z && f.z - r < hb.max.z) {
      // the rectangle's corners against the box
      for (const [s, t] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 0]]) { const x = f.x + f.ux * f.a * s - f.uz * f.b * t, z = f.z + f.uz * f.a * s + f.ux * f.b * t; if (x > hb.min.x && x < hb.max.x && z > hb.min.z && z < hb.max.z) return true; }
    }
    // the block: its circle against the rectangle
    const dx = this.block.x - f.x, dz = this.block.z - f.z, s = Math.max(-f.a, Math.min(f.a, dx * f.ux + dz * f.uz)), t = Math.max(-f.b, Math.min(f.b, -dx * f.uz + dz * f.ux));
    return Math.hypot(dx * f.ux + dz * f.uz - s, -dx * f.uz + dz * f.ux - t) < this.parts.blockR + 0.03;
  }

  // a falling part: gravity on its centre of mass and a spin; its every point kept out of the block, the ground and
  // what lies there; a dull bounce or two, then it lies down in a free spot nearby
  fly(c, dt, world) {
    c.vel.y -= 9.8 * dt;
    c.c.addScaledVector(c.vel, dt);
    const w = c.ang.length();
    if (w > 1e-4) c.quat.premultiply(_q.setFromAxisAngle(_v.copy(c.ang).divideScalar(w), w * dt));
    c.pos.copy(c.c).sub(_w.copy(c.com).applyQuaternion(c.quat));
    const pts = this.shape(c), B = this.block, BR = this.parts.blockR;
    c.near ||= this.lying(c);
    let low = Infinity, inB = 0, bx = 0, bz = 0, upB = 0, onOther = false;
    for (const v of pts) {
      _v.copy(v).applyQuaternion(c.quat).add(c.pos);
      low = Math.min(low, _v.y - world.drawnAt(_v.x, _v.z));
      const dx = _v.x - B.x, dz = _v.z - B.z, r = Math.hypot(dx, dz);
      if (r < BR && _v.y < B.y && _v.y > B.y - 0.7) { // in the block: out over its top when that is nearer, else out of its side
        if (B.y - _v.y < BR - r) upB = Math.max(upB, B.y - _v.y);
        else if (BR - r > inB) { inB = BR - r; bx = dx / (r || 1); bz = dz / (r || 1); }
      }
      if (!onOther && c.vel.y < 0) for (const f of c.near) {
        const ex = _v.x - f.x, ez = _v.z - f.z;
        if (_v.y < f.y1 && _v.y > f.y0 && Math.abs(ex * f.ux + ez * f.uz) < f.a && Math.abs(-ex * f.uz + ez * f.ux) < f.b) { onOther = true; break; }
      }
    }
    // into the block's side: out again, the inward speed spent
    if (inB > 0) { c.c.x += bx * inB; c.c.z += bz * inB; const vin = c.vel.x * bx + c.vel.z * bz; if (vin < 0) { c.vel.x -= vin * bx * 1.3; c.vel.z -= vin * bz * 1.3; } }
    if (upB > 0) { c.c.y += upB; if (c.vel.y < 0) c.vel.y = 0; } // sliding off the block's top
    if (low < 0) c.c.y -= low; // never under the ground
    c.pos.copy(c.c).sub(_w.copy(c.com).applyQuaternion(c.quat));
    if (low > 0.001 && !onOther) return;
    if (c.bounces++ === 0) this.game.audio?.play('wood-lay', c.c);
    if (!onOther && c.vel.y < -1.1 && c.bounces < 3) { c.vel.y *= -0.22; c.vel.x *= 0.55; c.vel.z *= 0.55; c.ang.multiplyScalar(0.5); return; }
    // lie down: the axis level, the flat of a half (a face of a billet) on the ground
    const axis = _v.set(0, 1, 0).applyQuaternion(c.quat).setY(0);
    if (axis.lengthSq() < 0.01) axis.set(c.vel.x, 0, c.vel.z);
    if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
    axis.normalize();
    const p = c.pieces[0], toQ = this.lieQ(p, axis, c.n === 2 ? c.up : null);
    // where it comes down: its middle under the centre of mass, along the slope
    const mid = _w.copy(c.com).setX(0).setZ(0).applyQuaternion(toQ);
    let x = c.c.x - mid.x, z = c.c.z - mid.z;
    this.shape(c);
    const at = restSpot(world, c.body, toQ, x, z, this.lying(c), { avoid: (f) => this.avoid(f), feet: this.block.y - 0.5, away: this.block });
    c.state = 'settle'; c.k = 0; c.foot = null; c.near = this.lying(c);
    c.from = { p: c.pos.clone(), q: c.quat.clone() };
    c.toQ = at.q; c.toP = new THREE.Vector3(at.x, at.y, at.z);
    c.dur = 0.22 + 0.5 * Math.hypot(at.x - x, at.z - z);
  }
  // a part on its way to the block: lifted out of the block's top and the ground
  clear(c, world) {
    const B = this.block, BR = this.parts.blockR;
    let lift = 0;
    for (const v of this.shape(c)) {
      _v.copy(v).applyQuaternion(c.quat).add(c.pos);
      lift = Math.max(lift, world.drawnAt(_v.x, _v.z) - _v.y);
      if (Math.hypot(_v.x - B.x, _v.z - B.z) < BR + 0.005) lift = Math.max(lift, B.y - _v.y);
    }
    c.pos.y += lift;
  }
  // lying with its axis along `axis` (level): a half on its flat (`up` = its bark side, local), a billet on a split face
  lieQ(p, axis, up = null) {
    const e1 = up ? up.clone() : new THREE.Vector3(-Math.sin(p.k * Math.PI / 2), 0, Math.cos(p.k * Math.PI / 2));
    const e2 = new THREE.Vector3(0, 1, 0), e3 = new THREE.Vector3().crossVectors(e1, e2);
    const w1 = UP.clone(), w2 = axis.clone().setY(0).normalize(), w3 = new THREE.Vector3().crossVectors(w1, w2);
    return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(w1, w2, w3).multiply(_m2.makeBasis(e1, e2, e3).transpose()));
  }
  // settling: from where it struck to where it lies, never through the ground
  settle(c, dt, world) {
    c.k = Math.min(1, c.k + dt / (c.dur || 0.22));
    const e = ease(c.k);
    c.pos.lerpVectors(c.from.p, c.toP, e);
    c.quat.slerpQuaternions(c.from.q, c.toQ, e);
    // over the ground and over anything lying on the way
    const B = this.block, BR = this.parts.blockR;
    const ax = _w.set(0, 1, 0).applyQuaternion(c.quat).setY(0);
    if (ax.lengthSq() < 1e-4) ax.set(1, 0, 0);
    ax.normalize();
    let lift = 0, s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity, y0 = Infinity;
    for (const v of this.shape(c)) {
      _v.copy(v).applyQuaternion(c.quat).add(c.pos);
      lift = Math.max(lift, world.drawnAt(_v.x, _v.z) - _v.y);
      if (Math.hypot(_v.x - B.x, _v.z - B.z) < BR + 0.005 && _v.y < B.y) lift = Math.max(lift, B.y - _v.y); // over the block's rim
      const s = _v.x * ax.x + _v.z * ax.z, t = -_v.x * ax.z + _v.z * ax.x;
      s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); y0 = Math.min(y0, _v.y);
    }
    // over anything lying on the way: its whole width clears the top of what it passes over
    const ms = (s0 + s1) / 2, mt = (t0 + t1) / 2, me = { x: ms * ax.x - mt * ax.z, z: ms * ax.z + mt * ax.x, ux: ax.x, uz: ax.z, a: (s1 - s0) / 2, b: (t1 - t0) / 2 };
    for (const f of (c.near = this.lying(c))) if (y0 + lift < f.y1 && overlaps(me, f, -0.005)) lift = Math.max(lift, f.y1 - y0); // (what came to rest meanwhile too)
    c.pos.y += lift;
    if (c.k >= 1) { c.near = null; this.rest(c); }
  }

  // lying still: a half waits to be stood up again; billets go to the carrying code
  rest(c) {
    c.state = 'rest';
    this.touch(c);
    if (c.n === 1) {
      const p = c.pieces[0];
      this.chunks.splice(this.chunks.indexOf(c), 1);
      p.chunk = null; p.state = 'ground'; p.t = performance.now();
    }
    for (const p of c.pieces) p.it.off = false;
    this.game.promptKey = null;
  }
  touch(c) { for (const p of c.pieces) { p.obj.position.copy(c.pos); p.obj.quaternion.copy(c.quat); p.obj.userData.sphere = undefined; } }

  // The held axe while a swing runs (camera space, or world: the fall and a stuck axe); null: carried as usual.
  axePose(dt, cam) {
    const sw = this.sw;
    if (!sw || !this.axeHeld) return null;
    const P = this._pose ||= { p: new THREE.Vector3(), q: new THREE.Quaternion(), world: false };
    if (sw.phase === 'raise') {
      const e = sw.power, shake = Math.max(0, sw.t - TIRE) * 0.004 * Math.sin(sw.t * 31); // tiring arms tremble
      P.world = false;
      P.p.lerpVectors(REST.p, RAISED.p, e); P.p.x += shake; P.q.slerpQuaternions(REST.q, RAISED.q, e);
      return P;
    }
    P.world = true;
    if (sw.phase === 'swing') {
      const e = sw.k * sw.k;
      P.p.lerpVectors(sw.from.p, sw.to.p, e); P.p.y += Math.sin(sw.k * Math.PI) * 0.12;
      P.q.slerpQuaternions(sw.from.q, sw.to.q, e);
    } else if (sw.phase === 'stuck') {
      P.p.copy(sw.rel.p).add(sw.chunk.pos); P.q.copy(sw.rel.q);
    } else { // back to the carry
      const e = ease(sw.k);
      _w.copy(REST.p).applyQuaternion(cam.quaternion).add(cam.position);
      _q.copy(cam.quaternion).multiply(REST.q);
      P.p.lerpVectors(sw.from.p, _w, e); P.q.slerpQuaternions(sw.from.q, _q, e);
    }
    return P;
  }
}
