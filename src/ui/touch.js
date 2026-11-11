// Phone / tablet controls, no pointer lock: a stick fixed bottom left (a touch that starts on or near it
// walks; push to the rim = run); a drag that starts anywhere else on the open view looks, and does nothing else.
// A lesson (src/ui/teach.js) rings the button it is about (`.tc-teach`).
// Buttons (drawn glass, no blur): the hand, green (the do input: held while the thumb stays down, a drag that
// starts on it looks, so a held tool can be aimed; it shows the tool of the act of the moment), the eye, blue
// (inspect; shown when the thing in view has a card), put down (shown while carrying), jump, crouch, journal,
// pause. The look prompt's own lens and plate (index.html `#prompt`) are the same two inputs, at the thing.
// Windows, toasts and buttons keep their touches.
// Auto-enabled on coarse-pointer devices; `?touch` forces it, `?notouch` disables it.
// Self-contained: every class is `tc-` prefixed and the stylesheet is injected here.
import { icon, actIcon, actHeld } from './icons.js';

const CSS = `
.tc-root{position:fixed;inset:0;z-index:15;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font-family:"Segoe UI","Noto Sans",system-ui,sans-serif;--tc-glass:rgba(18,46,76,.6);--tc-edge:rgba(255,255,255,.6);--tc-glow:120,220,255}
.tc-root[data-mode=off]>*{display:none!important}
.tc-root:not([data-mode=play]) .tc-play,.tc-root:not([data-mode=play]) .tc-stick{display:none}
.tc-stick{position:absolute;left:calc(36px + env(safe-area-inset-left));bottom:calc(48px + env(safe-area-inset-bottom));width:128px;height:128px;border-radius:50%;pointer-events:none;opacity:.6;transition:opacity .25s;
  background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.04) 52%,rgba(var(--tc-glow),.12) 70%,rgba(255,255,255,.08) 71%);
  border:1px solid var(--tc-edge);box-shadow:inset 0 0 0 1px rgba(0,30,60,.35),inset 0 10px 24px rgba(255,255,255,.12),0 2px 14px rgba(0,0,0,.35);}
.tc-stick.on{opacity:1}
.tc-stick.run{box-shadow:inset 0 0 0 1px rgba(0,30,60,.35),inset 0 10px 24px rgba(255,255,255,.12),0 0 22px rgba(var(--tc-glow),.55)}
.tc-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
  background:linear-gradient(180deg,rgba(255,255,255,.75) 0%,rgba(225,240,255,.35) 48%,rgba(120,170,220,.28) 52%,rgba(170,220,255,.5) 100%);
  border:1px solid rgba(255,255,255,.85);box-shadow:inset 0 0 0 1px rgba(20,60,110,.45),inset 0 -6px 12px rgba(var(--tc-glow),.45),0 2px 8px rgba(0,0,0,.4)}
.tc-btn{position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;border-radius:50%;
  color:#fff;font-weight:600;font-size:15px;
  background:linear-gradient(180deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.14) 49%,rgba(10,40,80,.12) 51%,rgba(160,200,240,.2) 100%),var(--tc-glass);
  border:1px solid var(--tc-edge);box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),0 2px 10px rgba(0,0,0,.35);transition:transform .08s,opacity .2s}
.tc-btn.down{transform:scale(.92);box-shadow:inset 0 0 0 1px rgba(10,40,80,.6),inset 0 3px 10px rgba(0,20,50,.45),0 0 16px rgba(var(--tc-glow),.6)}
.tc-btn .ic{width:50%;height:50%;stroke-width:2.2;pointer-events:none}
.tc-act{right:calc(18px + env(safe-area-inset-right));bottom:calc(112px + env(safe-area-inset-bottom));width:78px;height:78px;border-radius:22px;opacity:.5}
.tc-act.ready{opacity:1;--tc-glass:rgb(58,156,28);box-shadow:inset 0 0 0 1px rgba(0,50,0,.5),0 0 0 3px rgba(190,255,160,.55),0 2px 12px rgba(0,0,0,.4)}
.tc-act.held.ready::after{content:'';position:absolute;left:22px;right:22px;bottom:8px;height:5px;border-radius:3px;background:#fff}
.tc-eye{right:calc(108px + env(safe-area-inset-right));bottom:calc(124px + env(safe-area-inset-bottom));width:58px;height:58px;--tc-glass:rgb(48,132,216)}
.tc-put{right:calc(30px + env(safe-area-inset-right));bottom:calc(204px + env(safe-area-inset-bottom));width:54px;height:54px}
.tc-eye:not(.ready),.tc-put:not(.ready){opacity:0;pointer-events:none}
.tc-jump{right:calc(108px + env(safe-area-inset-right));bottom:calc(36px + env(safe-area-inset-bottom));width:52px;height:52px;opacity:.7}
.tc-crouch{right:calc(30px + env(safe-area-inset-right));bottom:calc(32px + env(safe-area-inset-bottom));width:48px;height:48px;opacity:.7}
.tc-crouch.on{box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),0 0 0 3px rgba(var(--tc-glow),.6)}
.tc-top{position:absolute;top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));display:flex;gap:10px}
.tc-top .tc-btn{position:relative;width:48px;height:48px;border-radius:12px}
.tc-live #prompt .p-act,.tc-live #prompt .p-read{pointer-events:auto;touch-action:none}
.tc-live #prompt .p-act *,.tc-live #prompt .p-read *{pointer-events:none}
.tc-teach::before{content:'';position:absolute;inset:-7px;border-radius:inherit;border:3px solid #fff;animation:tc-ring 1.2s ease-out infinite;pointer-events:none}
@keyframes tc-ring{from{transform:scale(.86);opacity:1}to{transform:scale(1.22);opacity:0}}
@media (max-height:500px){.tc-stick{left:calc(32px + env(safe-area-inset-left));bottom:calc(26px + env(safe-area-inset-bottom))}
  .tc-act{bottom:calc(96px + env(safe-area-inset-bottom))}.tc-eye{bottom:calc(106px + env(safe-area-inset-bottom))}.tc-put{bottom:calc(184px + env(safe-area-inset-bottom))}
  .tc-jump{bottom:calc(24px + env(safe-area-inset-bottom))}.tc-crouch{bottom:calc(22px + env(safe-area-inset-bottom))}}
`;

export class TouchControls {
  static wanted() {
    const q = new URLSearchParams(location.search);
    if (q.has('notouch')) return false;
    return q.has('touch') || matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches;
  }
  static attach(game) { return TouchControls.wanted() ? new TouchControls(game) : null; }

  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.input.touchMode = true;
    this.runRadius = 52;  // px from the stick centre to full deflection
    this.catchR = 100;    // px from the stick centre: a touch starting within walks, beyond it looks
    this.lookScale = 1;   // multiplies drag pixels (player sens applies on top)
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = this.root = document.createElement('div');
    root.className = 'tc-root';
    root.dataset.mode = 'off';
    root.innerHTML = `
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-play tc-act" data-b="act">${icon('hand')}</div>
      <div class="tc-btn tc-play tc-eye" data-b="eye">${icon('eye')}</div>
      <div class="tc-btn tc-play tc-put" data-b="put">${icon('put')}</div>
      <div class="tc-btn tc-play tc-jump" data-b="jump">${icon('jump')}</div>
      <div class="tc-btn tc-play tc-crouch" data-b="crouch">${icon('crouch')}</div>
      <div class="tc-top tc-play">
        <div class="tc-btn" data-b="journal">${icon('book')}</div><div class="tc-btn" data-b="pause">${icon('pause')}</div>
      </div>`;
    document.documentElement.classList.add('tc-live');
    document.body.appendChild(root);
    this.stick = root.querySelector('.tc-stick');
    this.knob = root.querySelector('.tc-knob');
    this.act = root.querySelector('.tc-act'); this.eye = root.querySelector('.tc-eye'); this.putBtn = root.querySelector('.tc-put');
    this.crouchBtn = root.querySelector('.tc-crouch');
    this.toasts = document.getElementById('toasts');
    this.moveId = null; this.lookId = null; this.actId = null; // the walk touch, the look touch, the thumb on the hand button
    this.stickHome();

    const opt = { passive: false };
    this.input.canvas.style.touchAction = 'none';
    addEventListener('touchstart', (e) => this.touchStart(e), opt);
    addEventListener('touchmove', (e) => this.touchMove(e), opt);
    addEventListener('touchend', (e) => this.touchEnd(e), opt);
    addEventListener('touchcancel', (e) => this.touchEnd(e), opt);
    for (const b of root.querySelectorAll('.tc-btn')) {
      b.addEventListener('touchstart', (e) => {
        e.preventDefault(); b.classList.add('down'); navigator.vibrate?.(8);
        if (b === this.act && this.actId === null) { const t = e.changedTouches[0]; this.actId = t.identifier; this.ax = t.clientX; this.ay = t.clientY; }
        this.button(b.dataset.b);
      }, opt);
      const up = () => b.classList.remove('down');
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
      b.addEventListener('click', () => { if (!this.recentTouch) { this.button(b.dataset.b); if (b === this.act) this.input.setDo(false); } }); // mouse, with ?touch
    }
    const plate = document.querySelector('#prompt .p-act'), lens = document.querySelector('#prompt .p-read');
    plate?.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.actId === null) { const t = e.changedTouches[0]; this.actId = t.identifier; this.ax = t.clientX; this.ay = t.clientY; }
      this.input.setDo(true);
    }, opt);
    lens?.addEventListener('touchstart', (e) => { e.preventDefault(); this.game.inspect(this.game.focus); }, opt);
    addEventListener('touchstart', () => { this.recentTouch = true; clearTimeout(this.rt); this.rt = setTimeout(() => { this.recentTouch = false; }, 600); }, { passive: true, capture: true });
    const tick = () => { this.sync(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  key(code) { this.input.press(code); this.game.key?.({ code, preventDefault() {} }); }
  button(b) {
    const g = this.game, inp = this.input;
    if (b === 'act') inp.setDo(true); // held until its touch ends (touchEnd); the mouse (?touch) clicks: down and up
    else if (b === 'eye') g.inspect(g.focus);
    else if (b === 'put') inp.put();
    else if (b === 'jump') inp.press('Jump');
    else if (b === 'crouch') inp.press('Crouch');
    else if (b === 'journal') this.key('KeyJ');
    else if (b === 'pause') inp.release();
  }

  stickHome() { // the stick never moves (its place is in the CSS); the knob goes back to the middle
    this.knob.style.transform = '';
    this.stick.classList.remove('on', 'run');
  }
  // A touch on the open view (the canvas: windows and buttons take their own; toasts let taps through to the
  // buttons under them but start nothing) walks when it starts within `catchR` px of the stick's middle,
  // otherwise looks. One of each at a time.
  touchStart(e) {
    if (this.root.dataset.mode !== 'play') return;
    let r = null;
    for (const t of e.changedTouches) {
      if (t.target !== this.input.canvas) continue;
      e.preventDefault();
      if (this.overToast(t.clientX, t.clientY)) continue;
      r ||= this.stick.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (this.moveId === null && Math.hypot(t.clientX - cx, t.clientY - cy) < this.catchR) {
        this.moveId = t.identifier; this.cx = cx; this.cy = cy;
        this.stick.classList.add('on');
        this.steer(t);
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lx = t.clientX; this.ly = t.clientY;
        this.tap = { x: t.clientX, y: t.clientY, t: performance.now() };
      }
    }
  }
  overToast(x, y) {
    for (const el of this.toasts?.children || []) {
      const b = el.getBoundingClientRect();
      if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return true;
    }
    return false;
  }
  steer(t) {
    const dx = t.clientX - this.cx, dy = t.clientY - this.cy, R = this.runRadius;
    const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
    const dead = 0.12, v = m < dead ? 0 : (m - dead) / (1 - dead);
    this.input.stickX = Math.cos(a) * v;
    this.input.stickY = -Math.sin(a) * v;
    const kd = Math.min(Math.hypot(dx, dy), R);
    this.knob.style.transform = `translate(${Math.cos(a) * kd}px,${Math.sin(a) * kd}px)`;
    this.stick.classList.toggle('run', v > 0.92);
  }
  touchMove(e) {
    if (this.moveId === null && this.lookId === null && this.actId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        e.preventDefault();
        this.steer(t);
      } else if (t.identifier === this.actId) { // the thumb holding the hand button aims
        e.preventDefault();
        this.input.lookX += (t.clientX - this.ax) * this.lookScale;
        this.input.lookY += (t.clientY - this.ay) * this.lookScale;
        this.ax = t.clientX; this.ay = t.clientY;
      } else if (t.identifier === this.lookId) {
        e.preventDefault();
        this.input.lookX += (t.clientX - this.lx) * this.lookScale;
        this.input.lookY += (t.clientY - this.ly) * this.lookScale;
        this.lx = t.clientX; this.ly = t.clientY;
      }
    }
  }
  touchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        this.moveId = null; this.input.stickX = this.input.stickY = 0; this.stickHome();
      } else if (t.identifier === this.actId) {
        this.actId = null; this.input.setDo(false);
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
        this.tap = null;
      }
    }
  }

  // Which controls show: none on the title, in pause, over a card or the journal (their own buttons) or while an
  // act asks for a choice (its strips are tapped); otherwise the play set.
  sync() {
    const g = this.game;
    const mode = this.show ? this.show : !g.ready || g.title || (!this.input.touchLive && !g.ui?.open) ? 'off' // (show: src/ui/prewarm.js)
      : g.ui?.open ? 'ui' : g.choosing ? 'choice' : 'play';
    if (mode !== this.root.dataset.mode) {
      this.root.dataset.mode = mode;
      if (mode !== 'play') { this.moveId = this.lookId = this.actId = null; this.input.setDo(false); this.input.stickX = this.input.stickY = 0; this.stickHome(); }
    }
    if (mode === 'off') return;
    this.act.classList.toggle('ready', !!(this.show || g.doReady));
    const k = g.doAct ? actIcon(g.doAct) : 'hand', pk = g.putAct ? actIcon(g.putAct) : 'put';
    if (k !== this.actK) { this.actK = k; this.act.innerHTML = icon(k); }
    if (pk !== this.putK) { this.putK = pk; this.putBtn.innerHTML = icon(pk); }
    this.act.classList.toggle('held', !!this.show || actHeld(g.doAct));
    this.eye.classList.toggle('ready', !!(this.show || g.readReady));
    this.putBtn.classList.toggle('ready', !!(this.show || g.putReady));
    this.crouchBtn.classList.toggle('on', !!g.player?.crouch);
  }
}
