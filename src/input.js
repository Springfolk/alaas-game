// Keyboard and mouse (pointer lock) or touch (src/ui/touch.js), sampled once per frame.
// `active` = taking play input: pointer locked, or touch mode and not paused.
// The hands (docs/interactions.md): `doing` = the do input is held (left mouse button, F, the touch hand button);
// `onDo(down)` / `onPut()` report its press and release and the put-down input (right button, Q, the touch button).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;     // mouse pixels this frame
    this.lookX = 0; this.lookY = 0; // touch-drag pixels this frame
    this.stickX = 0; this.stickY = 0; // touch stick, -1..1 (y forward)
    this.wheel = 0;
    this.locked = false;
    this.touchMode = false; this.touchLive = false;
    this.doing = false;
    document.exitPointerLock ||= () => {}; // absent on some phone browsers; the game calls it freely
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        if (e.code === 'KeyF') this.setDo(true); else if (e.code === 'KeyQ') this.put();
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyF') this.setDo(false); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.pressed.add('Mouse' + e.button);
      if (e.button === 0) this.setDo(true); else if (e.button === 2) this.put();
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.setDo(false); });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.locking = false;
      if (!this.locked) { this.keys.clear(); this.setDo(false); }
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locking = false; });
    addEventListener('blur', () => { this.keys.clear(); this.setDo(false); });
  }
  // the do input goes down or up (mouse, key or touch: whichever came first holds it)
  setDo(down) {
    if (down === this.doing) return;
    this.doing = down;
    this.pressed.add(down ? 'Do' : 'DoUp');
    this.onDo?.(down);
  }
  put() { this.pressed.add('Put'); this.onPut?.(); }
  get active() { return this.locked || this.touchLive; }
  lock() {
    if (this.touchMode) { if (!this.touchLive) { this.touchLive = true; this.onLockChange?.(true); } return; }
    // once per session ideally: every grant shows the browser's "Esc to return the mouse" banner; one request
    // at a time (a double click on Continue must not ask twice; Safari's request returns no promise)
    if (this.locked || this.locking || document.pointerLockElement === this.canvas) return;
    this.locking = true;
    clearTimeout(this.lockWait);
    this.lockWait = setTimeout(() => { this.locking = false; }, 1500); // neither event came: allow a new try
    this.canvas.requestPointerLock?.()?.catch?.(() => { this.locking = false; }); // refused (too soon after Esc, no gesture): stays paused
  }
  // touch pause (the pointer-lock exit of touch)
  release() {
    if (!this.touchLive) return;
    this.touchLive = false; this.stickX = this.stickY = 0; this.setDo(false);
    this.onLockChange?.(false);
  }
  press(code) { this.pressed.add(code); } // a one-frame virtual key (touch buttons)
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; this.lookX = 0; this.lookY = 0; this.wheel = 0; }
}
