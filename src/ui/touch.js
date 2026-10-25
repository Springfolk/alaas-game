// Phone / tablet controls, no pointer lock: a floating stick under the left thumb (walk; push to the
// rim = run), drag anywhere on the right to look (a short tap there = E), glass buttons for E, jump,
// crouch, journal, language and pause, and 1·2·3 buttons while an act asks for a choice.
// Auto-enabled on coarse-pointer devices; `?touch` forces it, `?notouch` disables it.
// Self-contained: every class is `tc-` prefixed and the stylesheet is injected here.

const CSS = `
.tc-root{position:fixed;inset:0;z-index:15;pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
  font-family:"Segoe UI","Noto Sans",system-ui,sans-serif;--tc-glass:rgba(200,225,255,.16);--tc-edge:rgba(255,255,255,.55);--tc-glow:120,220,255}
.tc-root[data-mode=off]>*{display:none!important}
.tc-root:not([data-mode=play]) .tc-zone,.tc-root:not([data-mode=play]) .tc-play,.tc-root:not([data-mode=play]) .tc-stick{display:none}
.tc-root:not([data-mode=ui]) .tc-ui{display:none}
.tc-root:not([data-mode=choice]) .tc-choice{display:none}
.tc-zone{position:absolute;bottom:0;pointer-events:auto;touch-action:none}
.tc-move{left:0;width:45%;height:62%}
.tc-look{right:0;width:55%;height:100%}
.tc-stick{position:absolute;width:128px;height:128px;margin:-64px 0 0 -64px;border-radius:50%;pointer-events:none;opacity:.55;transition:opacity .25s;
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
.tc-jump{right:calc(104px + env(safe-area-inset-right));bottom:calc(34px + env(safe-area-inset-bottom));width:64px;height:64px}
.tc-crouch{right:calc(24px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));width:54px;height:54px}
.tc-crouch.on{box-shadow:inset 0 0 0 1px rgba(10,40,80,.45),inset 0 -5px 12px rgba(var(--tc-glow),.6),0 0 14px rgba(var(--tc-glow),.6)}
.tc-top{position:absolute;top:calc(12px + env(safe-area-inset-top));right:calc(12px + env(safe-area-inset-right));display:flex;gap:10px}
.tc-top .tc-btn{position:relative;width:46px;height:46px;border-radius:12px;font-size:13px}
.tc-choice{position:absolute;left:50%;bottom:calc(150px + env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:14px}
.tc-choice .tc-btn{position:relative;width:58px;height:58px;font-size:20px}
.tc-ui{position:absolute;top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right));display:flex;gap:10px;z-index:40}
.tc-ui .tc-btn{position:relative;width:46px;height:46px;border-radius:12px;font-size:13px}
`;

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M12 5v13M6 13l6 6 6-6"/></svg>',
  journal: '<svg viewBox="0 0 24 24"><path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3zM21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const LANG_SHORT = { sah: 'САХ', en: 'EN', ru: 'РУ' };

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
    this.lookScale = 1;   // multiplies drag pixels (player sens applies on top)
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const root = this.root = document.createElement('div');
    root.className = 'tc-root';
    root.dataset.mode = 'off';
    root.innerHTML = `
      <div class="tc-zone tc-move"></div><div class="tc-zone tc-look"></div>
      <div class="tc-stick"><div class="tc-knob"></div></div>
      <div class="tc-btn tc-play tc-act" data-b="act">E</div>
      <div class="tc-btn tc-play tc-jump" data-b="jump">${ICON.jump}</div>
      <div class="tc-btn tc-play tc-crouch" data-b="crouch">${ICON.crouch}</div>
      <div class="tc-top tc-play">
        <div class="tc-btn" data-b="lang">САХ</div><div class="tc-btn" data-b="journal">${ICON.journal}</div><div class="tc-btn" data-b="pause">${ICON.pause}</div>
      </div>
      <div class="tc-ui"><div class="tc-btn" data-b="lang">САХ</div><div class="tc-btn" data-b="close">${ICON.close}</div></div>
      <div class="tc-choice"><div class="tc-btn" data-b="1">1</div><div class="tc-btn" data-b="2">2</div><div class="tc-btn" data-b="3">3</div><div class="tc-btn" data-b="esc">${ICON.close}</div></div>`;
    document.body.appendChild(root);
    this.stick = root.querySelector('.tc-stick');
    this.knob = root.querySelector('.tc-knob');
    this.act = root.querySelector('.tc-act');
    this.crouchBtn = root.querySelector('.tc-crouch');
    this.langBtns = [...root.querySelectorAll('[data-b=lang]')];
    this.moveId = null; this.lookId = null;
    this.stickHome();

    const opt = { passive: false };
    const move = root.querySelector('.tc-move'), look = root.querySelector('.tc-look');
    move.addEventListener('touchstart', (e) => this.moveStart(e), opt);
    look.addEventListener('touchstart', (e) => this.lookStart(e), opt);
    addEventListener('touchmove', (e) => this.touchMove(e), opt);
    addEventListener('touchend', (e) => this.touchEnd(e), opt);
    addEventListener('touchcancel', (e) => this.touchEnd(e), opt);
    for (const b of root.querySelectorAll('.tc-btn')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('down'); navigator.vibrate?.(8); this.button(b.dataset.b); }, opt);
      const up = () => b.classList.remove('down');
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
      b.addEventListener('click', () => { if (!this.recentTouch) this.button(b.dataset.b); }); // mouse, with ?touch
    }
    addEventListener('touchstart', () => { this.recentTouch = true; clearTimeout(this.rt); this.rt = setTimeout(() => { this.recentTouch = false; }, 600); }, { passive: true, capture: true });
    const tick = () => { this.sync(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  key(code) { this.game.key?.({ code, preventDefault() {} }); }
  button(b) {
    const g = this.game, inp = this.input;
    if (b === 'act') { if (g.useReady ?? g.focus) this.key('KeyE'); }
    else if (b === 'jump') inp.press('Jump');
    else if (b === 'crouch') inp.press('Crouch');
    else if (b === 'journal') this.key('KeyJ');
    else if (b === 'lang') this.key('KeyL');
    else if (b === 'pause') inp.release();
    else if (b === 'close') { g.ui?.close(); inp.lock(); }
    else if (b === 'esc' || /^[123]$/.test(b)) dispatchEvent(new KeyboardEvent('keydown', { code: b === 'esc' ? 'Escape' : 'Digit' + b }));
  }

  stickHome() {
    this.cx = 110; this.cy = innerHeight - 130;
    this.stick.style.left = this.cx + 'px'; this.stick.style.top = this.cy + 'px';
    this.knob.style.transform = '';
    this.stick.classList.remove('on', 'run');
  }
  moveStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (this.moveId !== null) return;
    this.moveId = t.identifier;
    this.cx = t.clientX; this.cy = t.clientY; // the stick comes to the thumb
    this.stick.style.left = this.cx + 'px'; this.stick.style.top = this.cy + 'px';
    this.stick.classList.add('on');
  }
  lookStart(e) {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (this.lookId !== null) return;
    this.lookId = t.identifier;
    this.lx = t.clientX; this.ly = t.clientY;
    this.tap = { x: t.clientX, y: t.clientY, t: performance.now() };
  }
  touchMove(e) {
    if (this.moveId === null && this.lookId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === this.moveId) {
        e.preventDefault();
        let dx = t.clientX - this.cx, dy = t.clientY - this.cy;
        const d = Math.hypot(dx, dy), R = this.runRadius, over = R * 1.35;
        if (d > over) { // drag past the rim: the stick follows the thumb
          this.cx += dx / d * (d - over); this.cy += dy / d * (d - over);
          this.stick.style.left = this.cx + 'px'; this.stick.style.top = this.cy + 'px';
          dx = t.clientX - this.cx; dy = t.clientY - this.cy;
        }
        const m = Math.min(1, Math.hypot(dx, dy) / R), a = Math.atan2(dy, dx);
        const dead = 0.12, v = m < dead ? 0 : (m - dead) / (1 - dead);
        this.input.stickX = Math.cos(a) * v;
        this.input.stickY = -Math.sin(a) * v;
        const kd = Math.min(Math.hypot(dx, dy), R);
        this.knob.style.transform = `translate(${Math.cos(a) * kd}px,${Math.sin(a) * kd}px)`;
        this.stick.classList.toggle('run', v > 0.92);
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
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
        const p = this.tap;
        if (p && performance.now() - p.t < 250 && Math.hypot(t.clientX - p.x, t.clientY - p.y) < 12 && this.game.focus) this.key('KeyE');
        this.tap = null;
      }
    }
  }

  // Which controls show: none on the title / pause, close + language over a card or journal, the
  // choice row while an act runs, otherwise the play set.
  sync() {
    const g = this.game;
    const mode = !g.ready || g.title || (!this.input.touchLive && !g.ui?.open) ? 'off'
      : g.ui?.modal || (g.ui?.open && !this.input.touchLive) ? 'ui' : g.choosing ? 'choice' : 'play'; // a peek is a side panel: play on
    if (mode !== this.root.dataset.mode) {
      this.root.dataset.mode = mode;
      if (mode !== 'play') { this.moveId = this.lookId = null; this.input.stickX = this.input.stickY = 0; this.stickHome(); }
    }
    if (mode === 'off') return;
    this.act.classList.toggle('ready', !!(g.useReady ?? g.focus));
    this.crouchBtn.classList.toggle('on', !!g.player?.crouch);
    const l = LANG_SHORT[g.state?.lang] || 'EN';
    for (const b of this.langBtns) if (b.textContent !== l) b.textContent = l;
  }
}
