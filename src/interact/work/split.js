// Мас хайытыы: splitting firewood at the chopping block. Take the axe out of the block, stand a round of larch
// on it, raise the axe (hold E: the gauge climbs and falls) and let it fall along the round's drying crack.
// A blow in line with the crack and strong enough opens the round in two; the halves tumble off, each is stood
// up again and split into two billets, which are carried (an armful) to the woodpile or to a fire.
// A weak blow in the right line leaves the axe bitten in: the round is lifted on it and brought down again.
// A blow across the grain only sticks. Props: src/models/work.js (two rounds of four mating quarters).
import * as THREE from 'three/webgpu';
import { clamp, ease, fwdX, fwdZ } from '../../util.js';

const L = (sah, en, ru) => ({ sah, en, ru });
const TXT = {
  axe: L('сүгэ', 'axe', 'топор'),
  round: L('чурбаан', 'round of larch', 'чурбак'),
  half: L('чурбаан аҥаара', 'half a round', 'половина чурбака'),
  billet: L('оттук мас', 'firewood', 'дрова'),
  take: L('ыл', 'take it', 'взять'),
  stand: L('төҥүргэскэ туруор', 'stand it on the block', 'поставить на колоду'),
  strike: L('хайыт', 'split it', 'расколоть'),
  again: L('чурбааны кытта өрө көтөҕөн оҕус', 'lift it on the axe and bring it down', 'поднять на топоре и ударить о колоду'),
  free: L('сүгэни сулбу тарт', 'pull the axe free', 'выдернуть топор'),
  stick: L('сүгэни төҥүргэскэ батары оҕус', 'leave the axe in the block', 'всадить топор в колоду'),
  needAxe: L('сүгэ наада', 'you need the axe', 'нужен топор'),
  tidy: L('хайыппыккын хомуй', 'gather what you have split first', 'сначала соберите наколотое'),
  hintLine: L('Хайаҕаһы батыһа оҕус: сүгэ биитэ хайаҕаһы кытта биир сиринэн түстүн.', 'Strike along the crack: stand so the edge falls in its line.', 'Бейте вдоль трещины: встаньте так, чтобы лезвие легло по ней.'),
  hintWeak: L('Сүгэни үрдүктүк көтөх — мөлтөх охсуу хайыппат.', 'Raise the axe higher: a weak blow does not split.', 'Замахнитесь выше: слабый удар не колет.'),
  hintMiss: L('Чурбаан ортотун көрөн оҕус.', 'Look at the middle of the round as you strike.', 'Бейте, глядя в середину чурбака.'),
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
const RAISED = { p: new THREE.Vector3(0.26, -0.2, -0.3), q: basisQ(new THREE.Vector3(0.1, 0.9, 0.42), new THREE.Vector3(0, 0.4, -0.9)) };
const HANDS = new THREE.Vector3(0.1, -0.6, -0.32); // where the hands end the blow
const NEED = { 4: 0.58, 2: 0.4 }; // the least swing that opens a whole round / a half
const OVER = 0.94; // past this the swing is wild

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
      return t;
    });
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
    if (c.state === 'block') return this.axeHeld ? this.strikeAct : h ? null : this.needAxeAct;
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

  noAct = { id: 'none', label: L('', '', ''), thenCard: false, run: async () => {} };
  needAxeAct = { id: 'need-axe', label: TXT.needAxe, thenCard: false, run: async () => {} };
  tidyAct = { id: 'tidy', label: TXT.tidy, thenCard: false, run: async () => {} };

  // a round from the heap onto the block
  placeAct = {
    id: 'place-round', label: TXT.stand, thenCard: false,
    run: async (game, it) => {
      const r = this.freeRound();
      if (r === undefined || this.onBlock) return;
      const ps = this.pieces.filter((p) => p.round === r);
      const from = it.target.getWorldPosition(new THREE.Vector3());
      from.y = game.world.groundAt(from.x, from.z) + 0.16;
      const c = { pieces: ps, n: 4, pos: from, quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 6.28, Math.PI / 2)), com: new THREE.Vector3(0, ps[0].len / 2, 0) };
      for (const p of ps) { p.chunk = c; p.state = 'chunk'; p.obj.visible = true; p.obj.scale.setScalar(1); p.it.off = false; p.it.label = TXT.round; }
      this.chunks.push(c);
      this.toBlock(c);
      game.audio?.play('wood-take', from);
    },
  };
  // a half from the ground onto the block
  standAct = {
    id: 'stand-half', label: TXT.stand, thenCard: false,
    run: async (game, it) => {
      const c = this.chunkOf(it);
      if (!c || this.onBlock || c.state !== 'rest') return;
      this.toBlock(c);
      game.audio?.play('wood-take', c.pos);
    },
  };
  toBlock(c) {
    this.onBlock = c;
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
    id: 'stick-axe', label: TXT.stick, thenCard: false,
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

  // the blow. Keyboard: hold E, the gauge climbs and falls, let go to strike. Touch: the axe goes up, the next tap strikes.
  strikeAct = { id: 'strike', label: TXT.strike, thenCard: false, run: (game, it) => this.strike(it) };
  async strike(it) {
    const c = this.chunkOf(it), g = this.game, inp = g.input;
    if (!c || c.state !== 'block' || !this.axeHeld || this.sw) return;
    const sw = this.sw = { phase: 'raise', t: 0, power: 0, chunk: c, hold: inp.doing, first: true };
    await new Promise((res) => { sw.released = res; });
    // aim: where the look meets the round's top
    const cam = g.engine.camera, top = c.pos.y + c.pieces[0].len;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    let hit;
    if (dir.y < -0.05) hit = cam.position.clone().addScaledVector(dir, (top - cam.position.y) / dir.y);
    else hit = cam.position.clone().addScaledVector(_v.set(dir.x, 0, dir.z).normalize(), 0.9).setY(top);
    const reach = Math.hypot(hit.x - cam.position.x, hit.z - cam.position.z);
    if (reach > 1.25) hit.set(cam.position.x + (hit.x - cam.position.x) / reach * 1.25, top, cam.position.z + (hit.z - cam.position.z) / reach * 1.25);
    if (sw.power > OVER) { const e = (sw.power - OVER) / (1 - OVER) * 0.07; hit.x += (Math.random() - 0.5) * 2 * e; hit.z += (Math.random() - 0.5) * 2 * e; } // a wild swing
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
    const aligned = off < 0.045 && turn < 0.45;
    if (power < 0.22) return { kind: 'glance', aligned };
    if (aligned && power >= NEED[c.n]) return { kind: 'split' };
    return { kind: 'stuck', aligned, weak: aligned };
  }

  land(c, res, hit, sw) {
    const g = this.game, a = g.audio;
    if (res.kind === 'split') {
      a?.play('chop', hit) || a?.play('wood-lay', hit);
      this.open(c, sw.power);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0.16;
      sw.from = { p: sw.to.p.clone(), q: sw.to.q.clone() };
      return;
    }
    if (res.kind === 'stuck') {
      a?.play('chop-stuck', hit) || a?.play('wood-lay', hit);
      sw.phase = 'stuck'; sw.aligned = res.aligned;
      sw.rel = { p: sw.to.p.clone().sub(c.pos), q: sw.to.q.clone() }; // the axe rides the round
      this.work.hint(res.aligned ? 'weak' : 'line', res.aligned ? TXT.hintWeak : TXT.hintLine);
      g.promptKey = null;
      return;
    }
    a?.play(res.kind === 'miss' ? 'chop-stuck' : 'wood-take', hit) || a?.play('wood-lay', hit);
    this.work.hint(res.kind === 'miss' ? 'miss' : 'weak', res.kind === 'miss' ? TXT.hintMiss : TXT.hintWeak);
    sw.phase = 'back'; sw.k = 0; sw.wait = 0.1;
    sw.from = { p: sw.to.p.clone(), q: sw.to.q.clone() };
  }

  // stuck in the right line: the round goes up on the axe and comes down on the block
  againAct = {
    id: 'strike-again', label: TXT.again, thenCard: false,
    run: async (game) => {
      const sw = this.sw;
      if (sw?.phase !== 'stuck' || sw.busy) return;
      sw.busy = true;
      const c = sw.chunk, y0 = c.pos.y;
      await this.tween(0.42, (k) => { c.pos.y = y0 + Math.sin(k * Math.PI / 2) * 0.38; });
      await this.tween(0.13, (k) => { c.pos.y = y0 + (1 - k * k) * 0.38; });
      game.player.springV -= 1.6;
      game.audio?.play('chop', c.pos) || game.audio?.play('wood-lay', c.pos);
      this.open(c, 0.8);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0.12;
      sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
    },
  };
  freeAct = {
    id: 'free-axe', label: TXT.free, thenCard: false,
    run: async (game) => {
      const sw = this.sw;
      if (sw?.phase !== 'stuck' || sw.busy) return;
      game.audio?.play('wood-take', sw.chunk.pos);
      sw.phase = 'back'; sw.k = 0; sw.wait = 0;
      sw.from = { p: this.axe.obj.position.clone(), q: this.axe.obj.quaternion.clone() };
    },
  };
  tween(dur, step) { return new Promise((res) => { (this.tweens ||= []).push({ dur, k: 0, step, res }); }); }

  // The chunk opens along its seam: a round into two halves, a half into two billets. They fall away from the edge.
  open(c, power) {
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
      n.vel = out.clone().multiplyScalar(0.9 + power * 0.9 + Math.random() * 0.4).setY(0.5 + Math.random() * 0.5);
      n.ang = new THREE.Vector3().crossVectors(UP, out).multiplyScalar(2.2 + power * 2 + Math.random()).addScaledVector(UP, (Math.random() - 0.5) * 3);
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
      t.k = Math.min(1, t.k + dt / t.dur); t.step(t.k);
      if (t.k >= 1) { this.tweens.splice(this.tweens.indexOf(t), 1); t.res(); }
    }
    const held = this.axeHeld;
    if (this.blockIt.off !== !held) { this.blockIt.off = !held; g.promptKey = null; }
    // the swing's own clock
    const sw = this.sw;
    if (sw) {
      if (!held) { this.sw = null; this.work.meter(null); } else if (sw.phase === 'raise') {
        sw.t += dt;
        const inp = g.input;
        const u = (sw.t / 0.85) % 2; // up in 0.85 s, down again
        sw.power = clamp(u < 1 ? u : 2 - u, 0, 1);
        if (sw.hold && sw.t > 0.12 && sw.t < 0.2 && !inp.doing) sw.hold = false; // a tap: the next press strikes
        const go = sw.hold ? !inp.doing && sw.t >= 0.2 : !sw.first && inp.hit('Do');
        sw.first = false;
        this.work.meter(sw.power, NEED[sw.chunk.n], OVER);
        if (go || sw.t > 6 || sw.chunk.state !== 'block') { this.work.meter(null); sw.released(); }
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
        if (c.k >= 1) { c.state = 'block'; g.audio?.play('wood-lay', c.pos); this.touch(c); }
      } else if (c.state === 'fly') this.fly(c, dt, world);
      else if (c.state === 'settle') {
        c.k = Math.min(1, c.k + dt / 0.22);
        const e = ease(c.k);
        c.pos.lerpVectors(c.from.p, c.toP, e);
        c.quat.slerpQuaternions(c.from.q, c.toQ, e);
        if (c.k >= 1) this.rest(c);
      } else continue;
      for (const p of c.pieces) { p.obj.position.copy(c.pos); p.obj.quaternion.copy(c.quat); }
    }
    // a round riding a stuck axe
    if (sw?.phase === 'stuck') for (const p of sw.chunk.pieces) { p.obj.position.copy(sw.chunk.pos); p.obj.quaternion.copy(sw.chunk.quat); }
  }

  // a falling part: gravity on its centre of mass, a spin, one or two dull bounces, then it lies down
  fly(c, dt, world) {
    c.vel.y -= 9.8 * dt;
    c.c.addScaledVector(c.vel, dt);
    const w = c.ang.length();
    if (w > 1e-4) c.quat.premultiply(_q.setFromAxisAngle(_v.copy(c.ang).divideScalar(w), w * dt));
    // off the block's side
    const dx = c.c.x - this.block.x, dz = c.c.z - this.block.z, d = Math.hypot(dx, dz), keep = this.parts.blockR + 0.09;
    if (d < keep && c.c.y < this.block.y + 0.04 && d > 1e-4) { c.c.x = this.block.x + dx / d * keep; c.c.z = this.block.z + dz / d * keep; }
    const gy = world.groundAt(c.c.x, c.c.z), rad = c.n === 2 ? 0.1 : 0.075;
    if (c.c.y < gy + rad) {
      c.c.y = gy + rad;
      if (c.bounces++ === 0) this.game.audio?.play('wood-lay', c.c);
      if (c.vel.y < -1.1 && c.bounces < 3) { c.vel.y *= -0.22; c.vel.x *= 0.55; c.vel.z *= 0.55; c.ang.multiplyScalar(0.5); } else {
        // lie down: the axis level, the flat of a half (a face of a billet) on the ground
        const axis = _v.set(0, 1, 0).applyQuaternion(c.quat).setY(0);
        if (axis.lengthSq() < 0.01) axis.set(c.vel.x, 0, c.vel.z);
        if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
        axis.normalize();
        const p = c.pieces[0];
        const upL = c.n === 2 ? c.up.clone() : new THREE.Vector3(-Math.sin(p.k * Math.PI / 2), 0, Math.cos(p.k * Math.PI / 2));
        const e1 = upL, e2 = new THREE.Vector3(0, 1, 0), e3 = new THREE.Vector3().crossVectors(e1, e2);
        const w1 = UP.clone(), w2 = axis.clone(), w3 = new THREE.Vector3().crossVectors(w1, w2);
        const toQ = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(w1, w2, w3).multiply(_m2.makeBasis(e1, e2, e3).transpose()));
        const at = world.collide(c.c.x, c.c.z, 0.16, gy);
        const mid = new THREE.Vector3(at.x, 0, at.z); mid.y = world.groundAt(at.x, at.z) + 0.006;
        c.state = 'settle'; c.k = 0;
        c.from = { p: c.c.clone().sub(c.com.clone().applyQuaternion(c.quat)), q: c.quat.clone() };
        c.toQ = toQ; c.toP = mid.sub(_w.set(0, c.com.y, 0).applyQuaternion(toQ));
        c.pos.copy(c.from.p);
        return;
      }
    }
    c.pos.copy(c.c).sub(_w.copy(c.com).applyQuaternion(c.quat));
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
      const e = ease(Math.min(1, sw.t / 0.25)) * (0.35 + 0.65 * sw.power);
      P.world = false;
      P.p.lerpVectors(REST.p, RAISED.p, e); P.q.slerpQuaternions(REST.q, RAISED.q, e);
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
