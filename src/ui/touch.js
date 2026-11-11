// Phone / tablet controls, no pointer lock: a stick fixed bottom left (a touch that starts on or near it
// walks; push to the rim = run), a drag that starts anywhere else on the open view looks (a short tap on a
// thing does its act, or shows its card when it has none; a tip says "look around" until the first look drag).
// Glass buttons: the hand (the do input: held while the thumb stays down, and a drag that starts on it looks,
// so a held tool can be aimed), the eye (inspect; shown when the thing in view has a card), put down (shown
// while carrying), jump, crouch, journal, language, pause; none while an act asks for a choice (its own strips are tapped).
// Windows, toasts and buttons keep their touches.
// Auto-enabled on coarse-pointer devices; `?touch` forces it, `?notouch` disables it.
// Self-contained: every class is `tc-` prefixed and the stylesheet is injected here.
import { CONTROLS, tr } from './i18n.js';

const CSS = `
.tc-root{position:fixed;inset:0;z-index:15;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font-family:"Segoe UI","Noto Sans",system-ui,sans-serif;--tc-glass:rgba(200,225,255,.16);--tc-edge:rgba(255,255,255,.55);--tc-glow:120,220,255}
.tc-root[data-mode=off]>*{display:none!important}
.tc-root:not([data-mode=play]) .tc-play,.tc-root:not([data-mode=play]) .tc-stick{display:none}
.tc-root:not([data-mode=ui]) .tc-ui{display:none}
.tc-stick{position:absolute;left:calc(36px + env(safe-area-inset-left));bottom:calc(48px + env(safe-area-inset-bottom));width:128px;height:128px;border-radius:50%;pointer-events:none;opacity:.55;transition:opacity .25s;
  background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.04) 52%,rgba(var(--tc-glow),.12) 70%,rgba(255,255,255,.08) 71%);
  border:1px solid var(--tc-edge);box-shadow:inset 0 0 0 1px rgba(0,30,60,.35),inset 0 10px 24px rgba(255,255,255,.12),0 2px 14px rgba(0,0,0,.35);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.tc-stick.on{opacity:1}
.tc-stick.run{box-shadow:inset 0 0 0 1px rgba(0,30,60,.35),inset 0 10px 24px rgba(255,255,255,.12),0 0 22px rgba(var(--tc-glow),.55)}
.tc-knob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;
  background:linear-gradient(180deg,rgba(255,255,255,.75) 0%,rgba(225,240,255,.35) 48%,rgba(120,170,220,.28) 52%,rgba(170,220,255,.5) 100%);
  border:1px solid rgba(255,255,255,.85);box-shadow:inset 0 0 0 1px rgba(20,60,110,.45),inset 0 -6px 12px rgba(var(--tc-glow),.45),0 2px 8px rgba(0,0,0,.4)}
.tc-btn{position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;border-radius:50%;
  color:#fff;font-weight:600;text-shadow:0 1px 3px rgba(0,20,50,.85);font-size:15px;letter-spacing:.02em;
  background:linear-gradient(180deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.14) 49%,rgba(10,40,80,.22) 51%,rgba(110,170,230,.28) 100%),var(--tc-glass);
  border:1px solid var(--tc-edge);box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),inset 0 -5px 10px rgba(var(--tc-glow),.25),0 2px 10px rgba(0,0,0,.35);
  -webkit-backdrop-filter:blur(6px) saturate(1.4);backdrop-filter:blur(6px) saturate(1.4);transition:transform .08s,box-shadow .2s,opacity .2s}
.tc-btn.down{transform:scale(.92);box-shadow:inset 0 0 0 1px rgba(10,40,80,.6),inset 0 3px 10px rgba(0,20,50,.45),0 0 16px rgba(var(--tc-glow),.6)}
.tc-btn svg{width:48%;height:48%;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 1px 2px rgba(0,20,50,.8))}
.tc-act{right:calc(18px + env(safe-area-inset-right));bottom:calc(112px + env(safe-area-inset-bottom));width:76px;height:76px;font-size:24px;opacity:.6}
.tc-act.ready{opacity:1;box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),inset 0 -6px 14px rgba(var(--tc-glow),.55),0 0 20px rgba(var(--tc-glow),.75);animation:tc-pulse 1.8s ease-in-out infinite}
@keyframes tc-pulse{50%{box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),inset 0 -6px 14px rgba(var(--tc-glow),.4),0 0 30px rgba(var(--tc-glow),.95)}}
.tc-eye{right:calc(104px + env(safe-area-inset-right));bottom:calc(126px + env(safe-area-inset-bottom));width:54px;height:54px}
.tc-put{right:calc(29px + env(safe-area-inset-right));bottom:calc(202px + env(safe-area-inset-bottom));width:54px;height:54px}
.tc-eye:not(.ready),.tc-put:not(.ready){opacity:0;pointer-events:none}
.tc-jump{right:calc(104px + env(safe-area-inset-right));bottom:calc(34px + env(safe-area-inset-bottom));width:64px;height:64px}
.tc-crouch{right:calc(24px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));width:54px;height:54px}
.tc-crouch.on{box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),inset 0 -5px 12px rgba(var(--tc-glow),.6),0 0 14px rgba(var(--tc-glow),.6)}
.tc-top{position:absolute;top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));display:flex;gap:10px}
.tc-top .tc-btn{position:relative;width:46px;height:46px;border-radius:12px;font-size:13px}
.tc-ui{position:absolute;top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right));display:flex;gap:10px;z-index:40}
.tc-ui .tc-btn{position:relative;width:46px;height:46px;border-radius:12px;font-size:13px}
@media (max-height:500px){.tc-stick{left:calc(32px + env(safe-area-inset-left));bottom:calc(26px + env(safe-area-inset-bottom))}}
.tc-tip{position:absolute;left:50%;top:27%;transform:translateX(-50%);white-space:nowrap;display:flex;align-items:center;gap:8px;padding:7px 14px 7px 9px;
  border-radius:22px;color:#fff;font-size:14px;font-weight:600;text-shadow:0 1px 3px rgba(0,20,50,.85);pointer-events:none;
  background:var(--tc-glass);border:1px solid var(--tc-edge);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:opacity .8s}
.tc-tip.gone,.tc-tip.hid{opacity:0}
.tc-tip svg{width:30px;height:30px;fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;animation:tc-drag 1.6s ease-in-out infinite}
@keyframes tc-drag{0%,100%{transform:translateX(-5px)}50%{transform:translateX(5px)}}
`;

const ICON = {
  hand: '<svg viewBox="0 0 24 24"><path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V13m0-4a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.7-2.3L4 14.5a1.6 1.6 0 0 1 2.4-2L8 14"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>',
  put: '<svg viewBox="0 0 24 24"><path d="M12 4v10M7.5 10l4.5 4.5 4.5-4.5M5 19.5h14"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  drag: '<svg viewBox="0 0 24 24"><path d="M10 13V6.5a1.5 1.5 0 0 1 3 0V12l4.2.9a2 2 0 0 1 1.5 2.3L18 20h-7.5L7 15.5a1.4 1.4 0 0 1 2-2zM3 5l-2 2 2 2M21 5l2 2-2 2"/></svg>',
};
const LANG_SHORT = { sah: 'САХ', en: 'EN', ru: 'РУ' };
const LOOK = CONTROLS[1][1]; // the hand-written "Look around" (no new Sakha text)

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
      <div class="tc-tip tc-play">${ICON.drag}<span></span></div>
      <div class="tc-btn tc-play tc-act" data-b="act">${ICON.hand}</div>
      <div class="tc-btn tc-play tc-eye" data-b="eye">${ICON.eye}</div>
      <div class="tc-btn tc-play tc-put" data-b="put">${ICON.put}</div>
      <div class="tc-btn tc-play tc-jump" data-b="jump">${ICON.jump}</div>
      <div class="tc-btn tc-play tc-crouch" data-b="crouch">${ICON.crouch}</div>
      <div class="tc-top tc-play">
        <div class="tc-btn" data-b="lang">САХ</div><div class="tc-btn" data-b="journal">${ICON.journal}</div><div class="tc-btn" data-b="pause">${ICON.pause}</div>
      </div>
      <div class="tc-ui"><div class="tc-btn" data-b="lang">САХ</div><div class="tc-btn" data-b="close">${ICON.close}</div></div>`;
    document.body.appendChild(root);
    this.stick = root.querySelector('.tc-stick');
    this.knob = root.querySelector('.tc-knob');
    this.act = root.querySelector('.tc-act'); this.eye = root.querySelector('.tc-eye'); this.putBtn = root.querySelector('.tc-put');
    this.crouchBtn = root.querySelector('.tc-crouch');
    this.langBtns = [...root.querySelectorAll('[data-b=lang]')];
    this.tip = root.querySelector('.tc-tip'); this.tipText = this.tip.querySelector('span');
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
    else if (b === 'lang') this.key('KeyL');
    else if (b === 'pause') inp.release();
    else if (b === 'close') { g.ui?.close(); inp.lock(); }
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
        if (!this.looked && this.tap && Math.hypot(t.clientX - this.tap.x, t.clientY - this.tap.y) > 40) { this.looked = true; this.tip.classList.add('gone'); }
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
        const p = this.tap, g = this.game;
        if (p && performance.now() - p.t < 250 && Math.hypot(t.clientX - p.x, t.clientY - p.y) < 12 && g.focus) {
          if (g.doReady) { this.input.setDo(true); this.input.setDo(false); } else g.inspect(g.focus);
        }
        this.tap = null;
      }
    }
  }

  // Which controls show: none on the title / pause, close + language over a card or journal, the
  // choice row while an act runs, otherwise the play set.
  sync() {
    const g = this.game;
    const mode = this.show ? this.show : !g.ready || g.title || (!this.input.touchLive && !g.ui?.open) ? 'off' // (show: src/ui/prewarm.js)
      : g.ui?.modal || (g.ui?.open && !this.input.touchLive) ? 'ui' : g.choosing ? 'choice' : 'play'; // a peek is a side panel: play on
    if (mode !== this.root.dataset.mode) {
      this.root.dataset.mode = mode;
      if (mode !== 'play') { this.moveId = this.lookId = this.actId = null; this.input.setDo(false); this.input.stickX = this.input.stickY = 0; this.stickHome(); }
    }
    if (mode === 'off') return;
    this.act.classList.toggle('ready', !!(this.show || g.doReady));
    this.eye.classList.toggle('ready', !!(this.show || g.readReady));
    this.putBtn.classList.toggle('ready', !!(this.show || g.putReady));
    this.crouchBtn.classList.toggle('on', !!g.player?.crouch);
    const l = LANG_SHORT[g.state?.lang] || 'EN';
    for (const b of this.langBtns) if (b.textContent !== l) b.textContent = l;
    const tip = tr(LOOK, g.state?.lang);
    if (this.tipText.textContent !== tip) this.tipText.textContent = tip;
    this.tip.classList.toggle('hid', !!g.ui?.open); // a card's top sheet would sit on it
  }
}
