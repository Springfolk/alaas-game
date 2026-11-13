// The framed work view: a job's one tap eases the view (the inspect stage's glide, src/ui/stage.js) to a composed
// view of the work, while the body stays where it stood. A watched craft plays there by itself; a job with a tap
// per step takes the do input (`v.act()`: the act of the moment, shown on the prompt and the touch hand button).
// Any step or look away (WASD, arrows, jump, the touch stick), Esc, put down (right button, Q, the touch button,
// drawn as "back") leaves at once; the job sees `on` go false and stops at its next step.
const L = (sah, en, ru) => ({ sah, en, ru });
const MOVE = /^(Key[WASDE]|Arrow\w+|Space|KeyC|ControlLeft|ShiftLeft)$/;

export class Framed {
  constructor(game) {
    this.game = game;
    this.v = null;
    this.backAct = { id: 'back', label: L('төнүн', 'step back', 'отойти'), run: async () => this.leave() };
    addEventListener('keydown', (e) => { if (this.on && !this.game.paused && MOVE.test(e.code)) this.leave(); });
  }
  get on() { return !!this.v && !this.left; }
  get time() { return (performance.now() - this.t0) / 1000; } // s since it opened
  // v = { c: Vector3, r, yaw, el, fov, act?() } (src/ui/stage.js `work`); resolves once the view is there (or was left)
  open(v) {
    const g = this.game;
    g.closeCard();
    this.v = v; this.left = false; this.t0 = performance.now();
    g.stage.work(v);
    g.promptKey = null;
    return new Promise((res) => { const t0 = performance.now(), wait = () => (!this.on || g.stage.s?.t >= 1 || performance.now() - t0 > 1500 ? res(this.on) : requestAnimationFrame(wait)); wait(); });
  }
  // a new aim (the view moves on to it, eased)
  aim(v) { if (this.v) Object.assign(this.v, v); }
  // the view back to the body; resolves once it is there
  close() {
    const g = this.game;
    if (!this.v) return Promise.resolve();
    this.left = true;
    return new Promise((res) => g.stage.close(() => { this.v = null; g.promptKey = null; res(); }));
  }
  leave() { if (this.on) { this.game.teach?.note('back'); this.close(); } }
  // every frame: the touch stick pushed leaves
  update() {
    if (!this.on) return;
    const i = this.game.input;
    if (Math.hypot(i.stickX, i.stickY) > 0.35 || i.hit('Jump') || i.hit('Crouch')) this.leave();
  }
}
